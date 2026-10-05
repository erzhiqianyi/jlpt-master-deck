import Foundation
import Observation
import Network
import OSLog

@MainActor @Observable
final class AppStore {
    @ObservationIgnored lazy var identity = IdentityService()
    private(set) var isRestoring = true
    private(set) var isRestoringLocal = false
    private(set) var session: Session?
    private(set) var isDemo = false
    private(set) var isLoading = false
    private(set) var isSaving = false
    var error: String?
    var notice: String?
    private(set) var syncStage: String?
    @ObservationIgnored private let performanceLog = Logger(subsystem: "cc.erzhiqian.jlptmasterdeck", category: "Performance")
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
    private(set) var isDownloadingSpeech = false
    private(set) var speechDownloadProgress = ""
    @ObservationIgnored private var speechDownloadTask: Task<Void, Never>?
    let speechPlayer = NativeSpeechPlayer()
    private(set) var isOnline = true
    @ObservationIgnored private let files = LocalStudyFiles()
    @ObservationIgnored private let readSavedSession: () async -> Session?
    @ObservationIgnored private let readLocalData: (Int) async throws -> LocalStudyData?
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
            .sorted { ($0.version ?? 0) > ($1.version ?? 0) }
    }
    var todayDraft: PracticeDraft? {
        drafts.filter { $0.isPendingDaily(on: StudyDates.day()) }
            .sorted { ($0.updated_at ?? "") > ($1.updated_at ?? "") }.first
    }
    var dailyPracticeCompleted: Bool {
        Self.dailyCompleted(packs: todayPacks, answers: state.answers)
    }
    static func dailyCompleted(packs: [NativePack], answers: [String: StudyState.Answer]) -> Bool {
        let questions = packs.flatMap(\.questions)
        return !questions.isEmpty && questions.allSatisfy { answers[$0.id] != nil }
    }
    init(readSavedSession: @escaping () async -> Session? = {
        await Task.detached(priority: .userInitiated) { SessionKeychain.read() }.value
    }, readLocalData: @escaping (Int) async throws -> LocalStudyData? = { userID in
        try await Task.detached(priority: .utility) {
            try LocalStudyFiles().load(userID: userID)
        }.value
    }) {
        self.readSavedSession = readSavedSession
        self.readLocalData = readLocalData
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
        let started = Date()
        performanceLog.info("Session restore started")
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--demo") { startDemo(); isRestoring = false; return }
        #endif
        let expected = generation
        let savedSession = await readSavedSession()
        guard expected == generation else { return }
        session = savedSession
        // The workspace mounts before disk decoding finishes. Never gate it on cloud sync.
        isRestoring = false
        performanceLog.info("Session restore finished; interface ready in \(Date().timeIntervalSince(started), privacy: .public) seconds")
        guard savedSession != nil else { return }
        await restoreLocal()
        guard expected == generation else { return }
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
        isRestoring = false
        let expected = generation
        await restoreLocal()
        guard expected == generation else { return }
        scheduleAutomaticRefresh()
    }
    func scheduleAutomaticRefresh() {
        guard !isRestoring, !isRestoringLocal, !isDemo, session != nil, isOnline, automaticRefreshTask == nil else { return }
        guard AutomaticRefreshPolicy.shouldRefresh(lastSync: lastSync, lastAttempt: lastAutomaticAttempt, hasPending: !pending.isEmpty) else { return }
        let expected = generation
        automaticRefreshTask = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(350)) } catch { return }
            guard let self, expected == self.generation else { return }
            defer { if expected == self.generation { self.automaticRefreshTask = nil } }
            guard !Task.isCancelled, self.isOnline, !self.isRestoringLocal, !self.isLoading, !self.isSaving else { return }
            guard AutomaticRefreshPolicy.shouldRefresh(lastSync: self.lastSync, lastAttempt: self.lastAutomaticAttempt, hasPending: !self.pending.isEmpty) else { return }
            self.lastAutomaticAttempt = .now
            await self.refresh()
        }
    }
    @discardableResult
    func refresh() async -> LocalStudyData? {
        guard !isRestoringLocal, !isDemo, session != nil, !isLoading, !isSaving else { return nil }
        guard isOnline else { notice = "离线使用本机数据，联网后自动同步。"; return nil }
        isLoading = true
        let started = Date()
        let expected = generation
        defer {
            isLoading = false
            syncStage = nil
            performanceLog.info("Sync finished in \(Date().timeIntervalSince(started), privacy: .public) seconds")
        }
        do {
            let result = try await StudySynchronization.fetch {
                try await self.flushPending(expected: expected)
            } download: {
                guard expected == self.generation else { throw CancellationError() }
                self.syncStage = "正在下载题库和学习记录…"
                return try await self.api.fetchStudySnapshot { completed, total in
                    guard expected == self.generation else { return }
                    self.syncStage = "正在下载练习详情 \(completed) / \(total)…"
                }
            }
            guard expected == generation else { return nil }
            let data = result.data.preservingLocalWork(pending: pending, responses: responses, syncedAt: .now)
            // Commit to disk before publishing the new timestamp or replacing the visible data.
            guard let userID = session?.user.id else { return nil }
            syncStage = "正在保存到本机…"
            // Prevent answers/settings from writing a newer snapshot while this one is on disk.
            isSaving = true
            defer { isSaving = false }
            try await files.saveInBackground(data, userID: userID)
            guard expected == generation else { return nil }
            items = data.items; state = data.state; plan = data.plan
            reading = data.reading; captures = data.captures
            packs = data.packs; drafts = data.drafts; listening = data.listening; shares = data.shares
            hasPracticeCache = true; hasListeningCache = true
            lastSync = data.lastSync
            notice = result.uploadError.map { "云端学习数据已更新，\(pending.count) 条本机答题记录仍待上传。\n\($0)" }
                ?? (pending.isEmpty ? "学习数据已同步到本机。" : "学习数据已更新，\(pending.count) 条答题记录等待同步。")
            error = nil
            return result.data
        } catch {
            guard expected == generation else { return nil }
            if case APIError.http(401, _) = error { handle(error) }
            else { notice = "同步未完成，已下载的数据仍可使用。\n\(error.localizedDescription)" }
        }
        return nil
    }
    func cacheTopicDraft(_ draft: NativeTopicDraft, practice: NativePack? = nil) async throws {
        guard let userID = session?.user.id, !isRestoringLocal, !isLoading, !isSaving else {
            throw IdentityError.message("云端操作已完成，本机正在同步，请稍后重新加载。")
        }
        let expected = generation
        isSaving = true
        defer { isSaving = false }
        var data = snapshot()
        let createdAt = draft.created_at ?? data.drafts.first(where: { $0.id == draft.id })?.created_at
        data.drafts.removeAll { $0.id == draft.id }
        data.drafts.insert(PracticeDraft(id: draft.id, title: draft.title, status: draft.status, created_at: createdAt, updated_at: draft.updated_at), at: 0)
        if let practice { data.packs.removeAll { $0.id == practice.id }; data.packs.insert(practice, at: 0) }
        try await files.saveInBackground(data, userID: userID)
        guard expected == generation else { throw CancellationError() }
        drafts = data.drafts; packs = data.packs
    }
    func saveExamGoal(name: String, level: String, date: String) async throws {
        guard !isRestoringLocal, !isLoading, !isSaving else { throw IdentityError.message("正在同步，请稍后保存。") }
        let expected = generation
        isSaving = true
        defer { isSaving = false }
        struct RawEnvelope: Decodable { let plan: [String: SettingValue] }
        let current: RawEnvelope = try await api.get("api/study-plan")
        guard expected == generation else { throw CancellationError() }
        guard case .object(var profile) = current.plan["profile"] else { throw IdentityError.message("未能读取学习计划。") }
        profile["examName"] = .string(name); profile["level"] = .string(level); profile["examDate"] = .string(date)
        let result: PlanEnvelope = try await api.put("api/study-plan/profile", body: profile)
        guard expected == generation else { throw CancellationError() }
        guard result.plan.profile?.examName == name, result.plan.profile?.level == level, result.plan.profile?.examDate == date else {
            throw IdentityError.message("服务器尚未保存完整考试目标，请更新服务后重试。")
        }
        let previous = plan
        plan = result.plan
        do { try persist() } catch { plan = previous; throw error }
    }
    func saveCardFields(front: [String], back: [String]) async throws {
        try await saveSettings(["memoryCardFrontFields": .array(front.map(SettingValue.string)),
                                "memoryCardBackFields": .array(back.map(SettingValue.string)),
                                "memoryCardFieldsVersion": .number(2)])
    }
    func saveSettings(_ changes: [String: SettingValue]) async throws {
        guard !isRestoringLocal, !isLoading, !isSaving else { throw APIError.http(409, "正在同步，请稍后再保存。") }
        isSaving = true
        let expected = generation
        defer { isSaving = false }
        var settings = state.settings ?? [:]
        if !isDemo {
            let latest: StudyState = try await api.get("api/study-state")
            guard expected == generation else { throw CancellationError() }
            settings = latest.settings ?? [:]
        }
        settings.merge(changes) { _, new in new }
        if !isDemo {
            struct Result: Decodable { let settings: [String: SettingValue] }
            let result: Result = try await api.put("api/study-state/settings", body: settings)
            guard expected == generation else { throw CancellationError() }
            settings = result.settings
        }
        for key in ["memoryCardFrontFields", "memoryCardBackFields"] {
            if let requested = changes[key], settings[key] != requested {
                throw APIError.http(409, "服务器未保留卡片选择，请同步后重试。")
            }
        }
        if let requested = changes["feedbackMode"], settings["feedbackMode"] != requested {
            throw APIError.http(409, "服务器未保留答题反馈设置，请同步后重试。")
        }
        let previous = state.settings
        state.settings = settings
        do { try persist() } catch { state.settings = previous; throw error }
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
    func submitNativeBatch(questions: [NativeQuestion], attempt: NativeAttempt, allowUnanswered: Bool = false) throws {
        guard !isRestoringLocal, !isSaving, isSignedIn else { throw IdentityError.message("正在同步答题记录，请稍后重试。") }
        let next = try snapshot().recordingNativeBatch(questions: questions, attempt: attempt, allowUnanswered: allowUnanswered)
        if !isDemo {
            guard let userID = session?.user.id else { throw IdentityError.message("请先登录。") }
            try files.save(next, userID: userID)
        }
        state = next.state
        pending = isDemo ? [] : next.pending
        responses = next.responses ?? [:]
        notice = isDemo ? nil : "已保存到本机，等待同步。"
        Task { await syncAnswers() }
    }
    func saveAnswerLocally(questionID: String, itemID: String, selected: String, correct: Bool, progress: ProgressEntry, responses newResponses: [String: LocalStudyResponse] = [:], attempt: NativeAttempt? = nil) throws {
        guard !isRestoringLocal, !isSaving, isSignedIn else { throw IdentityError.message("正在同步答题记录，请稍后重试。") }
        if isDemo {
            state.progress[itemID] = progress
            if let attempt { state.attemptHistory = NativeAttempt.merging(state.attemptHistory ?? [], [attempt]) }
            return
        }
        let before = state.progress[itemID] ?? ProgressEntry()
        let previous = state
        let previousResponses = responses
        let operation = PendingAnswer(id: UUID(), before: before, input: AnswerInput(questionId: questionID, itemId: itemID, selected: selected, correct: correct, progressEntry: progress, attemptHistory: attempt.map { [$0] }))
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
        guard !isRestoringLocal, isOnline, !isLoading, !isSaving, session != nil, !isDemo else { return }
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
        let total = pending.count
        defer { isSaving = false; if !isLoading { syncStage = nil } }
        while let operation = pending.first {
            syncStage = "正在上传答题记录 \(total - pending.count) / \(total)…"
            var cloud: StudyState = try await api.get("api/study-state")
            guard expected == generation else { return }
            switch operation.disposition(cloud: cloud.progress[operation.input.itemId] ?? ProgressEntry()) {
            case .alreadyApplied:
                if let attempts = operation.input.attemptHistory {
                    let merged = NativeAttempt.merging(cloud.attemptHistory ?? [], attempts)
                    if merged != cloud.attemptHistory {
                        struct HistoryUpdate: Encodable { let attemptHistory: [NativeAttempt] }
                        cloud = try await api.put("api/study-state/practice", body: HistoryUpdate(attemptHistory: merged))
                    }
                }
            case .send:
                var input = operation.input
                if let attempts = input.attemptHistory { input.attemptHistory = NativeAttempt.merging(cloud.attemptHistory ?? [], attempts) }
                cloud = try await api.post("api/answers", body: input)
            case .conflict:
                let title = responses[operation.input.questionId]?.title
                    ?? items.first { $0.id == operation.input.itemId }?.original
                    ?? operation.input.itemId
                throw IdentityError.message("「\(title)」（\(operation.input.itemId)）的云端进度与本机待上传记录冲突，上传队列已暂停。本机记录已保留，未覆盖云端。")
            }
            guard expected == generation else { return }
            let previous = state
            pending.removeFirst()
            state = cloud
            applyPending()
            do {
                guard let userID = session?.user.id else { throw CancellationError() }
                try await files.saveInBackground(snapshot(), userID: userID)
                guard expected == generation else { throw CancellationError() }
            } catch {
                if expected == generation { pending.insert(operation, at: 0); state = previous }
                throw error
            }
        }
    }
    private func applyPending() {
        for operation in pending {
            let input = operation.input
            if operation.historyOnly != true { state.progress[input.itemId] = input.progressEntry }
            if let attempts = input.attemptHistory { state.attemptHistory = NativeAttempt.merging(state.attemptHistory ?? [], attempts) }
            if operation.historyOnly != true && !input.questionId.hasPrefix("memory-card:") {
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
        guard !isRestoringLocal else { throw IdentityError.message("本机记录仍在恢复，请稍后保存。") }
        guard let id = session?.user.id, !isDemo else { return }
        try files.save(snapshot(), userID: id)
    }
    private func restoreLocal() async {
        guard let id = session?.user.id else { return }
        let expected = generation
        let started = Date()
        isRestoringLocal = true
        performanceLog.info("Local data restore started")
        defer {
            if expected == generation { isRestoringLocal = false }
            performanceLog.info("Local data restore finished in \(Date().timeIntervalSince(started), privacy: .public) seconds")
        }
        do {
            let cached = try await readLocalData(id)
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
    var speechConfiguration: SpeechConfiguration { SpeechConfiguration(settings: state.settings) }
    func speechAudio(_ request: SpeechRequest) async throws -> Data {
        guard let session else { throw IdentityError.message("请先登录。") }
        let expected = generation
        return try await files.speechAudio(userID: session.user.id, request: request) {
            guard self.isOnline else { throw IdentityError.message("这段语音尚未下载，请联网下载后再播放。") }
            let bytes = try await self.api.speechAudio(request)
            try Task.checkCancellation()
            guard expected == self.generation else { throw CancellationError() }
            return bytes
        }
    }

    func speechIsDownloaded(_ text: String, configuration: SpeechConfiguration) -> Bool {
        guard !configuration.usesSystemVoice, let id = session?.user.id else { return false }
        let chunks = SpeechConfiguration.chunks(text)
        return !chunks.isEmpty && chunks.allSatisfy { chunk in
            guard let url = try? files.speechURL(userID: id, request: configuration.request(text: chunk)),
                  let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize else { return false }
            return size > 0
        }
    }
    func downloadSpeech(_ text: String, configuration: SpeechConfiguration) async throws {
        let expected = generation
        guard !configuration.usesSystemVoice else { throw IdentityError.message("系统语音由 iOS 管理，音频下载用于已配置的云端朗读。") }
        for chunk in SpeechConfiguration.chunks(text) {
            try Task.checkCancellation()
            guard expected == generation else { throw CancellationError() }
            _ = try await speechAudio(configuration.request(text: chunk))
        }
    }
    func startSpeechDownload() {
        guard !isDownloadingSpeech, !isDemo, session != nil else { return }
        let configuration = speechConfiguration
        guard !configuration.usesSystemVoice else { notice = "请先在网页发音设置中选择并配置云端朗读，再同步设置。"; return }
        let texts = Array(Set(items.flatMap { item in
            [item.reading.flatMap { $0.isEmpty ? nil : $0 } ?? item.original] + (item.examples ?? []).map(\.ja)
        }.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })).sorted()
        guard !texts.isEmpty else { notice = "请先同步单词和语法题库。"; return }
        let expected = generation
        isDownloadingSpeech = true
        speechDownloadTask = Task { [weak self] in
            guard let self else { return }
            defer { if expected == self.generation { self.isDownloadingSpeech = false; self.speechDownloadTask = nil } }
            do {
                for (index, text) in texts.enumerated() {
                    try Task.checkCancellation()
                    guard expected == self.generation else { return }
                    self.speechDownloadProgress = "\(index + 1) / \(texts.count)"
                    try await self.downloadSpeech(text, configuration: configuration)
                }
                if expected == self.generation { self.notice = "单词、语法和例句语音已下载，可离线播放。" }
            } catch {
                if expected == self.generation { self.notice = error is CancellationError ? "已停止下载，完成的语音保留在本机。" : "语音下载未完成：\(error.localizedDescription)" }
            }
        }
    }
    func cancelSpeechDownload() { speechDownloadTask?.cancel() }
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
        guard !isRestoringLocal else { throw IdentityError.message("本机记录仍在恢复，请稍后保存。") }
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
        isRestoringLocal = false
        speechPlayer.stop()
        speechDownloadTask?.cancel(); speechDownloadTask = nil
        isDownloadingSpeech = false; speechDownloadProgress = ""
        automaticRefreshTask?.cancel(); automaticRefreshTask = nil; lastAutomaticAttempt = nil
        items = []; state = StudyState(); plan = StudyPlan(); reading = []; captures = []; error = nil; notice = nil
        packs = []; drafts = []; listening = []; shares = []; pending = []; responses = [:]; lastSync = nil
        syncStage = nil
        hasPracticeCache = false; hasListeningCache = false
    }
    func startDemo() {
        generation += 1
        clearData()
        isDemo = true; session = nil; isRestoring = false
        items = DemoData.items
        reading = DemoData.reading
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--practice-fixture") { packs = [DemoData.practiceFixture] }
        if ProcessInfo.processInfo.arguments.contains("--statistics-fixture") { state.attemptHistory = DemoData.statisticsFixture(); packs = [DemoData.practiceFixture] }
        #endif
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
