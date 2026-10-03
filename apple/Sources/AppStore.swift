import Foundation
import Observation
import Network

@MainActor @Observable
final class AppStore {
    @ObservationIgnored lazy var identity = IdentityService()
    private(set) var isRestoring = true
    private(set) var session: Session?
    private(set) var isDemo = false
    private(set) var isLoading = false
    private(set) var isSaving = false
    var error: String?
    var notice: String?
    var items: [StudyItem] = []
    var state = StudyState()
    var plan = StudyPlan()
    var reading: [ReadingQuestion] = []
    var captures: [Capture] = []
    var packs: [NativePack] = []
    var drafts: [PracticeDraft] = []
    var listening: [ListeningItem] = []
    var shares: [DiscoveryShare] = []
    private(set) var responses: [String: LocalStudyResponse] = [:]
    private(set) var pending: [PendingAnswer] = []
    private(set) var lastSync: Date?
    private(set) var hasPracticeCache = false
    private(set) var hasListeningCache = false
    private(set) var isDownloadingAudio = false
    private(set) var isOnline = true
    @ObservationIgnored private let files = LocalStudyFiles()
    @ObservationIgnored private let network = NWPathMonitor()
    @ObservationIgnored private var automaticRefreshTask: Task<Void, Never>?
    @ObservationIgnored private var lastAutomaticAttempt: Date?
    @ObservationIgnored private var restoredSession = false
    private var generation = 0
    var pendingCount: Int { pending.count }
    var todayPacks: [NativePack] {
        let today = StudyDates.day()
        let topicIDs = Set(drafts.filter(\.isTopic).map(\.id))
        return packs.filter { $0.date == today && !topicIDs.contains($0.sourceDraftId ?? "") }
    }
    var dailyPracticeCompleted: Bool {
        Self.dailyCompleted(packs: todayPacks, answers: state.answers)
    }
    static func dailyCompleted(packs: [NativePack], answers: [String: StudyState.Answer]) -> Bool {
        let questions = packs.flatMap(\.questions)
        return !questions.isEmpty && questions.allSatisfy { answers[$0.id] != nil }
    }
    init() {
        network.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor [weak self] in
                guard let self else { return }
                let reconnected = !self.isOnline && online
                self.isOnline = online
                if reconnected { self.scheduleAutomaticRefresh() }
            }
        }
        network.start(queue: DispatchQueue(label: "jlpt.connectivity"))
    }
    deinit { network.cancel(); automaticRefreshTask?.cancel() }
    var api: APIClient { APIClient(token: session?.token) }
    var isSignedIn: Bool { session != nil || isDemo }
    var username: String { isDemo ? "Itsuki · 演示" : session?.user.username ?? "未登录" }
    var dueItems: [StudyItem] {
        items.filter { item in
            guard let value = state.progress[item.id]?.nextReviewAt, let date = StudyDates.parse(value) else { return true }
            return date <= .now
        }.sorted { (state.progress[$0.id]?.nextReviewAt ?? "9999") < (state.progress[$1.id]?.nextReviewAt ?? "9999") }
    }
    var todayTasks: [PlanTask] {
        let today = StudyDates.day()
        return plan.tasks.filter { $0.date == today }
    }
    var completedTasks: Int { todayTasks.filter { $0.status == "completed" }.count }
    var reviewedToday: Int {
        state.progress.values.filter { value in
            guard let raw = value.lastReviewedAt, let date = StudyDates.parse(raw) else { return false }
            return Calendar.current.isDateInToday(date)
        }.count
    }
    func restore() async {
        guard !restoredSession else { return }
        restoredSession = true
        defer { isRestoring = false }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--demo") { startDemo(); return }
        #endif
        let expected = generation
        let savedSession = await Task.detached(priority: .userInitiated) { SessionKeychain.read() }.value
        guard expected == generation, let saved = savedSession else { return }
        session = saved
        await restoreLocal()
        scheduleAutomaticRefresh()
    }
    func acceptIdentity(_ token: String, linking: Bool = false) async throws {
        struct Token: Encodable { let idToken: String }
        let received: Session = try await api.post(linking ? "api/auth/firebase/link" : "api/auth/firebase", body: Token(idToken: token))
        try SessionKeychain.save(received)
        generation += 1
        clearData()
        isDemo = false
        session = received
        await restoreLocal()
        scheduleAutomaticRefresh()
    }
    func scheduleAutomaticRefresh() {
        guard !isDemo, session != nil, isOnline, automaticRefreshTask == nil else { return }
        guard AutomaticRefreshPolicy.shouldRefresh(lastSync: lastSync, lastAttempt: lastAutomaticAttempt, hasPending: !pending.isEmpty) else { return }
        let expected = generation
        automaticRefreshTask = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(350)) } catch { return }
            guard let self, expected == self.generation else { return }
            defer { if expected == self.generation { self.automaticRefreshTask = nil } }
            guard !Task.isCancelled, self.isOnline, !self.isLoading, !self.isSaving else { return }
            guard AutomaticRefreshPolicy.shouldRefresh(lastSync: self.lastSync, lastAttempt: self.lastAutomaticAttempt, hasPending: !self.pending.isEmpty) else { return }
            self.lastAutomaticAttempt = .now
            await self.refresh()
        }
    }
    func refresh() async {
        guard !isDemo, session != nil, !isLoading, !isSaving else { return }
        guard isOnline else { notice = "离线使用本机数据，联网后自动同步。"; return }
        isLoading = true
        let expected = generation
        defer { isLoading = false }
        do {
            try await flushPending(expected: expected)
            guard expected == generation else { return }
            let data = try await api.fetchStudySnapshot()
            guard expected == generation else { return }
            items = data.items; state = data.state; plan = data.plan
            reading = data.reading; captures = data.captures
            packs = data.packs; drafts = data.drafts; listening = data.listening; shares = data.shares
            hasPracticeCache = true; hasListeningCache = true
            applyPending()
            lastSync = .now
            try persist()
            notice = pending.isEmpty ? nil : "\(pending.count) 条答题记录等待同步。"
            error = nil
            if !pending.isEmpty { Task { await syncAnswers() } }
        } catch {
            guard expected == generation else { return }
            if case APIError.http(401, _) = error { handle(error) }
            else { notice = "同步未完成，已下载的数据仍可使用。\n\(error.localizedDescription)" }
        }
    }
    func saveCardFields(front: [String], back: [String]) async throws {
        guard !isLoading, !isSaving else { throw APIError.http(409, "正在同步，请稍后再保存。") }
        isSaving = true
        let expected = generation
        defer { isSaving = false }
        var settings = state.settings ?? [:]
        if !isDemo {
            let latest: StudyState = try await api.get("api/study-state")
            guard expected == generation else { return }
            settings = latest.settings ?? [:]
        }
        settings["memoryCardFrontFields"] = .array(front.map(SettingValue.string))
        settings["memoryCardBackFields"] = .array(back.map(SettingValue.string))
        if !isDemo {
            struct Result: Decodable { let settings: [String: SettingValue] }
            let result: Result = try await api.put("api/study-state/settings", body: settings)
            guard expected == generation else { return }
            settings = result.settings
        }
        state.settings = settings
        try persist()
    }
    func rate(_ item: StudyItem, _ rating: MemoryRating) async throws {
        let progress = (state.progress[item.id] ?? ProgressEntry()).rated(rating)
        try saveAnswerLocally(questionID: "memory-card:\(item.id)", itemID: item.id,
                              selected: rating.rawValue, correct: rating != .forgot, progress: progress)
    }
    func answer(_ question: ReadingQuestion, selection: Int, sessionID: String) async throws {
        guard question.choices.indices.contains(selection) else { throw IdentityError.message("请选择有效选项。") }
        var progress = state.progress[question.id] ?? ProgressEntry()
        if progress.lastPracticeSessionId == sessionID { return }
        progress.correct += selection == question.answerIndex ? 1 : 0
        progress.wrong += selection == question.answerIndex ? 0 : 1
        progress.status = "learning"; progress.reviewCount = (progress.reviewCount ?? 0) + 1
        progress.firstSeenAt = progress.firstSeenAt ?? Date.now.ISO8601Format()
        progress.lastReviewedAt = Date.now.ISO8601Format(); progress.lastPracticeSessionId = sessionID
        try saveAnswerLocally(questionID: "memory-card:\(question.id)", itemID: question.id,
                              selected: String(selection), correct: selection == question.answerIndex, progress: progress,
                              responses: [question.id: LocalStudyResponse(title: question.title, selected: question.choices[selection], correct: selection == question.answerIndex, answeredAt: progress.lastReviewedAt!, sessionID: sessionID)])
    }
    func saveAnswerLocally(questionID: String, itemID: String, selected: String, correct: Bool, progress: ProgressEntry, responses newResponses: [String: LocalStudyResponse] = [:]) throws {
        guard !isSaving, isSignedIn else { throw IdentityError.message("正在同步答题记录，请稍后重试。") }
        if isDemo { state.progress[itemID] = progress; return }
        let before = state.progress[itemID] ?? ProgressEntry()
        let previous = state
        let previousResponses = responses
        let operation = PendingAnswer(id: UUID(), before: before, input: AnswerInput(questionId: questionID, itemId: itemID, selected: selected, correct: correct, progressEntry: progress))
        pending.append(operation)
        if newResponses.isEmpty {
            let title = items.first { $0.id == itemID }?.original
                ?? packs.lazy.flatMap(\.questions).first { $0.id == questionID }?.title ?? questionID
            responses[questionID] = LocalStudyResponse(title: title, selected: selected, correct: correct,
                                                       answeredAt: progress.lastReviewedAt ?? Date.now.ISO8601Format(), sessionID: nil)
        } else {
            responses.merge(newResponses) { _, new in new }
        }
        applyPending()
        do { try persist() }
        catch { pending.removeLast(); state = previous; responses = previousResponses; throw error }
        notice = "已保存到本机，等待同步。"
        Task { await syncAnswers() }
    }
    private func syncAnswers() async {
        guard isOnline, !isLoading, !isSaving, session != nil, !isDemo else { return }
        let expected = generation
        do {
            try await flushPending(expected: expected)
            if expected == generation { notice = pending.isEmpty ? nil : "答题记录等待同步。" }
        } catch {
            guard expected == generation else { return }
            if case APIError.http(401, _) = error { handle(error) }
            else { notice = "答题已保存在本机，同步未完成。\n\(error.localizedDescription)" }
        }
    }
    private func flushPending(expected: Int) async throws {
        guard !pending.isEmpty else { return }
        isSaving = true
        defer { isSaving = false }
        while let operation = pending.first {
            var cloud: StudyState = try await api.get("api/study-state")
            guard expected == generation else { return }
            switch operation.disposition(cloud: cloud.progress[operation.input.itemId] ?? ProgressEntry()) {
            case .alreadyApplied: break
            case .send:
                cloud = try await api.post("api/answers", body: operation.input)
            case .conflict:
                throw IdentityError.message("同一词条在其他设备上已有新进度；本机记录已保留，尚未覆盖云端。")
            }
            guard expected == generation else { return }
            let previous = state
            pending.removeFirst()
            state = cloud
            applyPending()
            do { try persist() }
            catch { pending.insert(operation, at: 0); state = previous; throw error }
        }
    }
    private func applyPending() {
        for operation in pending {
            let input = operation.input
            state.progress[input.itemId] = input.progressEntry
            if !input.questionId.hasPrefix("memory-card:") {
                state.answers[input.questionId] = .init(selected: input.selected, correct: input.correct, answeredAt: input.progressEntry.lastReviewedAt)
            }
        }
    }
    private func snapshot() -> LocalStudyData {
        LocalStudyData(items: items, state: state, plan: plan, reading: reading, captures: captures,
                       packs: packs, drafts: drafts, listening: listening, shares: shares, pending: pending,
                       lastSync: lastSync, hasPracticeCache: hasPracticeCache, hasListeningCache: hasListeningCache, responses: responses)
    }
    private func persist() throws {
        guard let id = session?.user.id, !isDemo else { return }
        try files.save(snapshot(), userID: id)
    }
    private func restoreLocal() async {
        guard let id = session?.user.id else { return }
        let expected = generation
        let localFiles = files
        do {
            let cached = try await Task.detached(priority: .userInitiated) {
                try localFiles.load(userID: id)
            }.value
            guard expected == generation, session?.user.id == id, let data = cached else { return }
            items = data.items; state = data.state; plan = data.plan; reading = data.reading; captures = data.captures
            packs = data.packs; drafts = data.drafts; listening = data.listening; shares = data.shares
            pending = data.pending; lastSync = data.lastSync; responses = data.responses ?? [:]
            hasPracticeCache = data.hasPracticeCache; hasListeningCache = data.hasListeningCache
            applyPending()
        } catch {
            guard expected == generation else { return }
            notice = "本机数据读取失败：\(error.localizedDescription)"
        }
    }
    func audioData(for item: ListeningItem) async throws -> Data {
        guard let session else { throw IdentityError.message("请先登录。") }
        let url = files.audioURL(userID: session.user.id, item: item)
        if FileManager.default.fileExists(atPath: url.path) { return try Data(contentsOf: url) }
        guard isOnline else { throw IdentityError.message("这段音频尚未下载，请联网后下载。") }
        let expected = generation
        var request = URLRequest(url: APIClient.origin.appendingPathComponent("api/listening-questions").appendingPathComponent(item.id).appendingPathComponent("audio"))
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard expected == generation else { throw CancellationError() }
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw IdentityError.message("音频下载失败。") }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return data
    }
    func downloadListeningAudio() async {
        guard !isDownloadingAudio, !isDemo, session != nil else { return }
        guard hasListeningCache, !listening.isEmpty else { notice = "请先同步听力题库。"; return }
        isDownloadingAudio = true
        let expected = generation
        defer { isDownloadingAudio = false }
        do {
            for group in ListeningGroup.make(listening) {
                guard let first = group.questions.first, expected == generation else { return }
                _ = try await audioData(for: first)
            }
            if expected == generation { notice = "听力音频已下载，可离线播放。" }
        } catch { if expected == generation { notice = "音频下载未完成：\(error.localizedDescription)" } }
    }
    func capture(_ input: CaptureInput) async throws {
        if isDemo {
            captures.insert(Capture(id: UUID().uuidString, body: input.body, category: input.category, context: input.context, createdAt: Date.now.ISO8601Format()), at: 0)
        } else {
            let expected = generation
            let result: CaptureResult = try await api.post("api/captures", body: input)
            guard expected == generation else { throw CancellationError() }
            captures.insert(result.capture, at: 0)
            try persist()
        }
    }
    func logout() async {
        guard !isSaving else { return }
        let previous = api
        let shouldRevoke = session != nil
        generation += 1
        session = nil; isDemo = false; clearData()
        SessionKeychain.clear(); identity.signOut()
        if shouldRevoke {
            struct Empty: Encodable {}; struct OK: Decodable { let ok: Bool }
            do { let _: OK = try await previous.post("api/auth/logout", body: Empty()) }
            catch { self.error = "本机已退出；网络不可用，服务端会话撤销未确认。" }
        }
    }
    func handle(_ error: Error) {
        if case APIError.http(401, _) = error {
            generation += 1
            session = nil; clearData(); SessionKeychain.clear(); identity.signOut()
        }
        self.error = error.localizedDescription
    }
    private func clearData() {
        automaticRefreshTask?.cancel(); automaticRefreshTask = nil; lastAutomaticAttempt = nil
        items = []; state = StudyState(); plan = StudyPlan(); reading = []; captures = []; error = nil; notice = nil
        packs = []; drafts = []; listening = []; shares = []; pending = []; responses = [:]; lastSync = nil
        hasPracticeCache = false; hasListeningCache = false
    }
    func startDemo() {
        generation += 1
        clearData()
        isDemo = true; session = nil
        items = DemoData.items
        reading = DemoData.reading
        plan = DemoData.plan
    }
}

enum AutomaticRefreshPolicy {
    static func shouldRefresh(lastSync: Date?, lastAttempt: Date?, hasPending: Bool, now: Date = .now) -> Bool {
        // Foreground/network events coalesce; explicit sync always bypasses this policy.
        if let lastAttempt, now.timeIntervalSince(lastAttempt) < 60 { return false }
        return hasPending || lastSync.map { now.timeIntervalSince($0) >= 300 } ?? true
    }
}
