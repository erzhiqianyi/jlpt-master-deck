import Foundation
import Network
import Observation
import OSLog

/// アプリの状態：ログイン、端末のデータ（サーバーのスナップショット＋端末で起きたこと）、同期。
/// 学習の操作（カードの評価、練習の解答）はまず端末に保存し、イベントとして送る。オフラインでも使える。
@MainActor @Observable
final class AppStore {
    @ObservationIgnored lazy var identity = IdentityService()
    private(set) var isRestoring = true
    private(set) var session: Session?
    private(set) var isDemo = false
    private(set) var isSyncing = false
    private(set) var syncStage: String?
    private(set) var isOnline = true
    var error: String?
    var notice: String?
    private(set) var snapshot = LocalSnapshot()
    private(set) var work = LocalWork()
    let speechPlayer = SpeechPlayer()
    @ObservationIgnored private var store: LocalStore?
    @ObservationIgnored private let network = NWPathMonitor()
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private let log = Logger(subsystem: "cc.erzhiqian.jlptmasterdeck", category: "Sync")
    @ObservationIgnored private let readSavedSession: () -> Session?
    @ObservationIgnored private let storageRoot: URL?
    @ObservationIgnored private let syncsAutomatically: Bool

    init(readSavedSession: @escaping () -> Session? = SessionKeychain.read, storageRoot: URL? = nil, syncsAutomatically: Bool = true) {
        self.readSavedSession = readSavedSession
        self.storageRoot = storageRoot
        self.syncsAutomatically = syncsAutomatically
        network.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                guard let self else { return }
                let online = path.status == .satisfied
                let reconnected = online && !self.isOnline
                self.isOnline = online
                if reconnected && !self.work.events.isEmpty { await self.refresh() }
            }
        }
        network.start(queue: DispatchQueue(label: "cc.erzhiqian.jlptmasterdeck.network"))
    }

    var api: APIClient { APIClient(token: session?.token) }
    var isSignedIn: Bool { session != nil || isDemo }
    var username: String { isDemo ? "演示账号" : session?.user.username ?? "" }
    var settings: UserSettings { snapshot.overview?.settings ?? UserSettings() }
    var pendingCount: Int { work.events.count }
    var lastSync: Date? { snapshot.lastSync }

    // MARK: ログイン

    func restore() async {
        defer { isRestoring = false }
        if CommandLine.arguments.contains("--demo") { startDemo(); return }
        guard let saved = readSavedSession() else { return }
        open(saved)
        if syncsAutomatically { scheduleRefresh() }
    }
    func acceptIdentity(_ idToken: String, linking: Bool = false) async throws {
        struct Token: Encodable { let idToken: String }
        let received: Session = try await api.post(linking ? "api/auth/firebase/link" : "api/auth/firebase", body: Token(idToken: idToken))
        try SessionKeychain.save(received)
        if linking { session = received; notice = "已绑定，学习记录保持不变。"; return }
        open(received)
        await refresh()
    }
    private func open(_ value: Session) {
        generation += 1
        session = value; isDemo = false
        let local = LocalStore(accountID: value.user.id, root: storageRoot)
        store = local
        (snapshot, work) = local.load()
    }
    #if DEBUG
    /// テスト用：サーバーから読んだのと同じように端末のスナップショットを置く。
    func replaceSnapshotForTesting(_ value: LocalSnapshot) { snapshot = value }
    /// テスト用：ネットワークを使わずに保存が終わるのを待つ。
    func savedWorkForTesting() -> LocalWork? { store?.load().1 }
    #endif
    func startDemo() {
        generation += 1
        isDemo = true; session = nil; store = nil
        snapshot = DemoData.snapshot; work = LocalWork()
    }
    func logout() async {
        if let token = session?.token {
            struct Empty: Decodable {}
            let _: Empty? = try? await APIClient(token: token).post("api/auth/logout", body: [String: String]())
        }
        identity.signOut()
        SessionKeychain.clear()
        speechPlayer.stop()
        generation += 1
        session = nil; isDemo = false; store = nil
        snapshot = LocalSnapshot(); work = LocalWork()
    }
    func handle(_ error: Error) {
        if error is CancellationError { return }
        if case APIError.http(401, _) = error, session != nil { Task { await logout() } }
        self.error = error.localizedDescription
    }

    // MARK: 保存

    private func persistWork() {
        // 小さいので同期で書く（順番が入れ替わらないように）
        try? store?.save(work: work)
    }
    private func persistSnapshot() {
        guard let store else { return }
        let value = snapshot
        Task.detached { try? store.save(snapshot: value) }
    }
    private func enqueue(_ event: StudyEvent) {
        guard !isDemo else { return }
        work.events.append(event)
        persistWork()
        if isOnline && syncsAutomatically { Task { await flushEvents() } }
    }

    // MARK: 知識点・カード

    var wordbooks: [Wordbook] { snapshot.overview?.wordbooks ?? [] }
    var knowledge: [Knowledge] { snapshot.knowledge }
    func knowledge(_ code: String) -> Knowledge? { snapshot.knowledge.first { $0.code == code } }
    func schedule(_ code: String) -> ReviewState? {
        work.schedules[code] ?? snapshot.overview?.schedules.first { $0.code == code }?.state
    }
    func template(for kind: String) -> CardTemplate? {
        let templates = snapshot.overview?.cardTemplates ?? []
        let chosen = settings.cardTemplates[kind] ?? nil
        return templates.first { $0.code == chosen } ?? templates.first { $0.kind == kind && $0.isDefault == true } ?? templates.first { $0.kind == kind }
    }
    /// 期限が来たカード（古い順）と、まだ学んでいないカード（最大 newLimit 枚）。
    func dueCards(newLimit: Int = 10, now: Date = .now) -> (due: [String], new: [String]) {
        var due: [(String, Date)] = []
        var fresh: [String] = []
        for item in snapshot.knowledge {
            if let state = schedule(item.code) {
                let date = state.dueAt.flatMap(StudyDates.parse) ?? .distantPast
                if date <= now { due.append((item.code, date)) }
            } else if fresh.count < newLimit { fresh.append(item.code) }
        }
        return (due.sorted { $0.1 < $1.1 }.map(\.0), fresh)
    }
    var cardSession: CardSession? { work.cards }
    func startCards() {
        let (due, fresh) = dueCards()
        work.cards = CardSession(codes: due + fresh)
        persistWork()
    }
    func revealCard() { work.cards?.revealed = true; persistWork() }
    func endCards() { work.cards = nil; persistWork() }
    func rate(_ code: String, _ rating: MemoryRating) {
        let now = Date.now
        work.schedules[code] = ReviewSchedule.afterRating(schedule(code), rating: rating, now: now)
        if var cards = work.cards, cards.index < cards.codes.count, cards.codes[cards.index] == code {
            cards.index += 1; cards.revealed = false
            // 忘れたカードは今日の最後にもう一度
            if rating == .forgot { cards.codes.append(code) }
            work.cards = cards
        }
        enqueue(StudyEvent(eventId: UUID().uuidString, type: .memoryRated, occurredAt: StudyDates.iso(now), knowledge: code, rating: rating.rawValue))
    }

    // MARK: 練習

    var practiceSets: [PracticeSetSummary] { snapshot.overview?.practiceSets ?? [] }
    func bundle(_ code: String) -> PracticeBundle? { snapshot.practices[code] }
    func questionType(_ typeId: String) -> QuestionTypeInfo? { snapshot.overview?.questionTypes.first { $0.typeId == typeId } }
    func answerMode(_ typeId: String) -> String { questionType(typeId)?.answerMode ?? "choice" }
    var activeAttempts: [LocalAttempt] { work.attempts.filter { $0.completedAt == nil } }
    var finishedAttempts: [LocalAttempt] { work.attempts.filter { $0.completedAt != nil }.sorted { $0.startedAt > $1.startedAt } }
    func attempt(_ key: String) -> LocalAttempt? { work.attempts.first { $0.clientKey == key } }

    /// 端末に入っている練習一式から始める（オフラインでもよい）。
    func startPractice(_ code: String) throws -> String {
        guard let bundle = bundle(code) else { throw IdentityError.message("这份练习还没有下载，请先同步。") }
        if let existing = activeAttempts.first(where: { $0.practice == code }) { return existing.clientKey }
        let groups = Dictionary(uniqueKeysWithValues: bundle.groups.map { ($0.code, $0) })
        let items = bundle.practice.allEntries.filter { groups[$0.group] != nil }.map { LocalAttempt.Item(group: $0.group, question: $0.question) }
        guard !items.isEmpty else { throw IdentityError.message("这份练习里没有可做的题目。") }
        let key = UUID().uuidString
        let now = StudyDates.iso(.now)
        let kind = bundle.practice.kind == "daily" ? "daily" : bundle.practice.kind == "mock" ? "mock" : "mixed"
        work.attempts.append(LocalAttempt(clientKey: key, practice: code, title: bundle.practice.title.text.isEmpty ? code : bundle.practice.title.text,
                                          kind: kind, items: items, groups: groups, startedAt: now))
        enqueue(StudyEvent(eventId: key, type: .attemptStarted, occurredAt: now, practice: code, kind: kind))
        return key
    }
    /// 審査済みの題目からサーバーが選ぶ練習（オンラインのときだけ）。
    func startDrawnPractice(module: String?, count: Int = 10) async throws -> String {
        struct Filters: Encodable { let module: String?; let count: Int }
        struct Body: Encodable { let filters: Filters; let kind: String; let source = "ios" }
        struct Item: Decodable { let question: Question? }
        struct Question: Decodable { let code: String; let group: String }
        struct Attempt: Decodable { let code: String; let items: [Item] }
        struct Envelope: Decodable { let attempt: Attempt }
        struct GroupEnvelope: Decodable { let group: QuestionGroup }
        let started: Envelope = try await api.post("api/v3/attempts", body: Body(filters: Filters(module: module, count: count), kind: module ?? "mixed"))
        let items = started.attempt.items.compactMap(\.question).map { LocalAttempt.Item(group: $0.group, question: $0.code) }
        var groups: [String: QuestionGroup] = [:]
        for code in Set(items.map(\.group)) {
            let envelope: GroupEnvelope = try await api.get("api/v3/question-groups/\(code)")
            groups[code] = envelope.group
        }
        let title = module.map { ModuleNames.title($0) + String(localized: "练习") } ?? String(localized: "综合练习")
        work.attempts.append(LocalAttempt(clientKey: started.attempt.code, serverCode: started.attempt.code, title: title, kind: module ?? "mixed",
                                          items: items, groups: groups, startedAt: StudyDates.iso(.now)))
        persistWork()
        return started.attempt.code
    }
    /// 端末で採点して記録する（正解はサーバーと同じ規則）。
    @discardableResult
    func answer(_ key: String, question: GroupQuestion, group: QuestionGroup, optionId: Int? = nil, text: String? = nil, elapsedMs: Int? = nil) -> LocalAttempt.Answer? {
        guard let index = work.attempts.firstIndex(where: { $0.clientKey == key }), work.attempts[index].completedAt == nil else { return nil }
        let mode = answerMode(group.typeId)
        var correct: Bool?
        switch mode {
        case "choice": correct = question.options.first { $0.id == optionId }?.correct == true
        case "text_input": correct = Self.normalized(text ?? "") == Self.normalized(question.expectedText ?? "")
        default: correct = nil
        }
        let now = Date.now
        let answer = LocalAttempt.Answer(selectedOptionId: optionId, answerText: text, correct: correct, answeredAt: StudyDates.iso(now))
        work.attempts[index].answers[question.code] = answer
        // 採点できる解答は考查対象の知識点の予定を先に進めておく（同期でサーバーの計算に置き換わる）
        if let correct {
            for link in question.knowledge where link.relation == "target" {
                work.schedules[link.code] = ReviewSchedule.afterAnswer(schedule(link.code), correct: correct, now: now)
            }
        }
        enqueue(StudyEvent(eventId: UUID().uuidString, type: .answerSubmitted, occurredAt: answer.answeredAt, attempt: key, question: question.code,
                           selectedOptionId: optionId, answerText: mode == "choice" ? nil : (text ?? ""), elapsedMs: elapsedMs))
        return answer
    }
    func move(_ key: String, to position: Int) {
        guard let index = work.attempts.firstIndex(where: { $0.clientKey == key }) else { return }
        work.attempts[index].position = max(0, min(position, work.attempts[index].items.count - 1))
        persistWork()
    }
    func complete(_ key: String) {
        guard let index = work.attempts.firstIndex(where: { $0.clientKey == key }), work.attempts[index].completedAt == nil else { return }
        let now = StudyDates.iso(.now)
        work.attempts[index].completedAt = now
        // 端末に残すのは最近の 30 回まで
        let finished = work.attempts.filter { $0.completedAt != nil }.sorted { $0.startedAt > $1.startedAt }
        if finished.count > 30 { let drop = Set(finished.dropFirst(30).map(\.clientKey)); work.attempts.removeAll { drop.contains($0.clientKey) } }
        enqueue(StudyEvent(eventId: "complete:\(key)", type: .attemptCompleted, occurredAt: now, attempt: key))
    }
    nonisolated static func normalized(_ value: String) -> String {
        let ignored = Set(" \t\n\r　、。，．,.！？!?「」『』（）()・…ー〜~")
        return String(value.precomposedStringWithCompatibilityMapping.filter { !ignored.contains($0) })
    }

    // MARK: 同期

    func scheduleRefresh() {
        let expected = generation
        Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard let self, expected == self.generation else { return }
            await self.refresh()
        }
    }

    /// 送信待ちのイベントを送る。送れなかったものは残す（次の同期でまた送る）。
    func flushEvents() async {
        guard !isDemo, session != nil, !work.events.isEmpty else { return }
        let expected = generation
        let batch = Array(work.events.prefix(500))
        struct Body: Encodable { let events: [StudyEvent] }
        do {
            let response: EventResponse = try await api.post("api/v3/sync/events", body: Body(events: batch))
            guard expected == generation else { return }
            let sent = Set(batch.map(\.eventId))
            work.events.removeAll { sent.contains($0.eventId) }
            for result in response.results {
                if result.status == "rejected" { work.rejected.append(result) }
                if let server = result.attempt, let key = result.eventId,
                   let index = work.attempts.firstIndex(where: { $0.clientKey == key }) { work.attempts[index].serverCode = server }
            }
            work.rejected = Array(work.rejected.suffix(50))
            persistWork()
            if work.events.count > 0 && response.results.count == batch.count { await flushEvents() }
        } catch {
            log.error("event upload failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// 送信 → 全体の情報 → 知識点（変わったものだけ）→ 練習一式（新しいものだけ）。
    func refresh() async {
        guard !isDemo, session != nil, !isSyncing else { return }
        let expected = generation
        isSyncing = true
        defer { if expected == generation { isSyncing = false; syncStage = nil } }
        do {
            syncStage = "正在上传学习记录…"
            await flushEvents()
            guard expected == generation else { return }
            syncStage = "正在读取学习数据…"
            let overview: SyncOverview = try await api.get("api/v3/sync")
            var next = snapshot
            next.overview = overview
            if next.knowledgeVersion != overview.knowledge.updatedAt || next.knowledge.count != overview.knowledge.total {
                syncStage = "正在下载词条…"
                next.knowledge = try await downloadKnowledge(current: next.knowledge, since: next.knowledge.isEmpty ? nil : next.knowledgeVersion)
                next.knowledgeVersion = overview.knowledge.updatedAt
            }
            let listed = Set(overview.practiceSets.map(\.code))
            next.practices = next.practices.filter { listed.contains($0.key) }
            for set in overview.practiceSets where next.practices[set.code] == nil {
                syncStage = "正在下载练习 \(set.code)…"
                next.practices[set.code] = try await api.get("api/v3/sync/practice/\(set.code)")
            }
            next.lastSync = .now
            guard expected == generation else { return }
            snapshot = next
            // サーバーの予定が正しい。まだ送れていないイベントの分だけ端末の予定を残す
            let waiting = Set(work.events.compactMap(\.knowledge))
            work.schedules = work.schedules.filter { waiting.contains($0.key) }
            persistSnapshot(); persistWork()
        } catch {
            if expected == generation { handle(error) }
        }
    }
    private func downloadKnowledge(current: [Knowledge], since: String?) async throws -> [Knowledge] {
        var byCode = Dictionary(uniqueKeysWithValues: current.map { ($0.code, $0) })
        var order = current.map(\.code)
        var offset: Int? = 0
        var codes: [String]?
        while let start = offset {
            var path = "api/v3/sync/knowledge?limit=200&offset=\(start)"
            if let since, let encoded = since.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { path += "&since=\(encoded)" }
            let page: KnowledgePage = try await api.get(path)
            if codes == nil { codes = page.codes }
            for item in page.items {
                if byCode[item.code] == nil { order.append(item.code) }
                byCode[item.code] = item
            }
            offset = page.nextOffset
        }
        if since != nil {
            // 消えた知識点を除く：全部の番号を最初のページで受け取る
            let first: KnowledgePage = try await api.get("api/v3/sync/knowledge?limit=1")
            codes = first.codes
        }
        if let codes { let keep = Set(codes); order = codes.filter { byCode[$0] != nil }; byCode = byCode.filter { keep.contains($0.key) } }
        return order.compactMap { byCode[$0] }
    }

    // MARK: オンラインだけの操作

    func updateSettings(_ patch: [String: JSONValue]) async throws {
        struct Envelope: Decodable { let settings: UserSettings }
        let result: Envelope = try await api.patch("api/v3/settings", body: patch)
        snapshot.overview?.settings = result.settings
        persistSnapshot()
    }
    func studyOverview() async throws -> StudyOverview {
        try await api.get("api/v3/stats?days=30")
    }
    func createCapture(body: String, category: String, context: String) async throws {
        struct Input: Encodable { let body: String; let category: String; let context: String }
        struct Envelope: Decodable { let capture: Capture }
        let _: Envelope = try await api.post("api/v3/inbox", body: Input(body: body, category: category, context: context))
    }
    func shares() async throws -> [ShareSummary] {
        struct Envelope: Decodable { let shares: [ShareSummary] }
        return try await (api.get("api/v3/market") as Envelope).shares
    }
    func importShare(_ id: String) async throws {
        struct Result: Decodable {}
        let _: Result = try await api.post("api/v3/market/\(id)/import", body: [String: String]())
        await refresh()
    }

    // MARK: 画像・音声

    /// 端末にあればそれを、無ければダウンロードして保存する。
    func media(_ id: Int) async throws -> URL {
        if isDemo { throw IdentityError.message("演示模式没有音频。") }
        guard let store else { throw APIError.invalidResponse }
        if store.hasMedia(id) { return store.mediaURL(id) }
        let data = try await api.data("api/v3/media/\(id)")
        try store.saveMedia(id, data: data)
        return store.mediaURL(id)
    }
    func hasMedia(_ id: Int) -> Bool { store?.hasMedia(id) ?? false }
    /// 端末にある練習で使う音声と画像をまとめてダウンロードする。
    func downloadPracticeMedia() async {
        let ids = Set(snapshot.practices.values.flatMap { $0.groups }.flatMap { group in
            group.materials.compactMap(\.mediaId) + group.questions.compactMap(\.promptMediaId) + group.questions.flatMap { $0.options.compactMap(\.mediaId) }
        }).filter { !hasMedia($0) }
        var done = 0
        for id in ids.sorted() {
            syncStage = "正在下载音频 \(done + 1)/\(ids.count)…"
            do { _ = try await media(id) } catch { handle(error); break }
            done += 1
        }
        syncStage = nil
        notice = ids.isEmpty ? "练习用的音频都已下载。" : "已下载 \(done) 个文件。"
    }

    // MARK: 表示

    var appLanguage: String { ["zh-CN", "ja", "en"].contains(settings.uiLanguage) ? settings.uiLanguage : "zh-CN" }
    var textScale: CGFloat { CGFloat(min(2, max(0.8, settings.fontScale))) }
}

enum ModuleNames {
    static func title(_ module: String) -> String {
        switch module {
        case "vocabulary": String(localized: "词汇"); case "grammar": String(localized: "语法"); case "reading": String(localized: "阅读")
        case "listening": String(localized: "听力"); default: String(localized: "综合")
        }
    }
}

/// 設定の部分更新に使う JSON 値。
enum JSONValue: Encodable, Hashable {
    case string(String), number(Double), bool(Bool), object([String: JSONValue]), null
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}
