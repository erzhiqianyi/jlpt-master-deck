import Foundation
import Observation
import Network
import OSLog
import UIKit

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
    var wordbooks: [NativeWordbook] = []
    var items: [StudyItem] = []
    var state = StudyState()
    var plan = StudyPlan()
    var reading: [ReadingQuestion] = []
    var captures: [Capture] = []
    var packs: [NativePack] = []
    var drafts: [PracticeDraft] = []
    var listening: [ListeningItem] = []
    var shares: [DiscoveryShare] = []
    var bankVersions: [String: [String: BankCachedVersion]]?
    var bankQuestionStates: [String: BankQuestionState]?
    private(set) var responses: [String: LocalStudyResponse] = [:]
    private(set) var pending: [PendingAnswer] = []
    private(set) var lastSync: Date?
    @ObservationIgnored private var syncCursor: String?
    private(set) var hasPracticeCache = false
    private(set) var hasListeningCache = false
    private(set) var isDownloadingAudio = false
    private(set) var isDownloadingSpeech = false
    private(set) var speechDownloadProgress = ""
    @ObservationIgnored private var speechDownloadTask: Task<Void, Never>?
    private(set) var isDownloadingImages = false
    private(set) var imageDownloadProgress = ""
    private(set) var downloadedImageCount = 0
    private(set) var imageDownloadFailures = 0
    @ObservationIgnored private var imageDownloadTask: Task<Void, Never>?
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
    var uploadableCount: Int { pending.filter(\.canAutomaticallyUpload).count }
    var syncReviewCount: Int { pendingCount - uploadableCount }
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
        Set((state.cardReviews ?? []).filter { event in
            guard let date = StudyDates.parse(event.reviewedAt) else { return false }
            return StudyDates.day(date) == StudyDates.day()
        }.map(\.itemId)).count
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
        guard AutomaticRefreshPolicy.shouldRefresh(lastSync: lastSync, lastAttempt: lastAutomaticAttempt, hasPending: uploadableCount > 0) else { return }
        let expected = generation
        automaticRefreshTask = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(350)) } catch { return }
            guard let self, expected == self.generation else { return }
            defer { if expected == self.generation { self.automaticRefreshTask = nil } }
            guard !Task.isCancelled, self.isOnline, !self.isRestoringLocal, !self.isLoading, !self.isSaving else { return }
            guard AutomaticRefreshPolicy.shouldRefresh(lastSync: self.lastSync, lastAttempt: self.lastAutomaticAttempt, hasPending: self.uploadableCount > 0) else { return }
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
                self.syncStage = "正在检查数据变化…"
                return try await self.api.fetchIncrementalStudy(cached: self.snapshot()) { completed, total in
                    guard expected == self.generation else { return }
                    self.syncStage = "正在同步变化记录 \(completed) / \(total)…"
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
            wordbooks = data.wordbooks ?? []; items = data.items; state = data.state; plan = data.plan
            reading = data.reading; captures = data.captures
            packs = data.packs; drafts = data.drafts; listening = data.listening; shares = data.shares
            bankVersions = data.bankVersions; bankQuestionStates = data.bankQuestionStates
            hasPracticeCache = true; hasListeningCache = true
            lastSync = data.lastSync; syncCursor = data.syncCursor
            notice = result.uploadError.map { syncSummary + "\n" + $0 } ?? syncSummary
            error = nil
            startImageDownload()
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
            let latest: StudyState = try await api.get("api/study-state/settings")
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
        for key in ["practiceNavigation", "practiceAutoAdvanceSeconds", "memoryCardFrontFields", "memoryCardBackFields", "locale", "fontSize", "fontScale", "showReviewRuby", "showExplanationRuby", "japaneseDisplay", "requireJlptVocabularyQuestions", "jlptVocabularyQuestionKinds"] {
            if let requested = changes[key], settings[key] != requested {
                throw APIError.http(409, "服务器未保留设置，请同步后重试。")
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
        let attempt=DedicatedAttempts.reading(question,sessionID:sessionID,selection:selection)
        try submitDedicatedAttempt(attempt)
    }
    func presentDedicatedAttempt(_ attempt:NativeAttempt) throws {
        guard !(state.attemptHistory ?? []).contains(where:{ $0.id==attempt.id }) else { return }
        var next=snapshot();next.state.attemptHistory=NativeAttempt.merging(next.state.attemptHistory ?? [],[attempt])
        if !isDemo { next.pending.append(.init(id:UUID(),before:ProgressEntry(),input:.init(questionId:"",itemId:"",selected:"",correct:false,progressEntry:ProgressEntry(),attemptHistory:[attempt]),historyOnly:true));guard let id=session?.user.id else { throw IdentityError.message("请先登录。") };try files.save(next,userID:id) }
        state=next.state;pending=isDemo ? [] : next.pending
        Task { await syncAnswers() }
    }
    func submitDedicatedAttempt(_ value:NativeAttempt) throws {
        var attempt=value
        if let original=state.attemptHistory?.first(where:{$0.id==attempt.id}) {
            attempt.questionManifest=original.questionManifest
            // Started-at belongs to presentation, not submission.
            attempt=NativeAttempt(id:attempt.id,title:attempt.title,practiceId:attempt.practiceId,startedAt:original.startedAt,completedAt:attempt.completedAt,view:attempt.view,deck:attempt.deck,questionIds:attempt.questionIds,unscoredResponses:attempt.unscoredResponses,questionManifest:attempt.questionManifest,answers:attempt.answers,summary:attempt.summary)
        }
        let questions=attempt.questionManifest?.compactMap(\.snapshot) ?? []
        try submitNativeBatch(questions:questions,attempt:attempt,allowUnanswered:true)
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
    func saveAnswerLocally(questionID: String, itemID: String, selected: String, correct: Bool, progress: ProgressEntry, responses newResponses: [String: LocalStudyResponse] = [:], attempt: NativeAttempt? = nil, canonicalQuestionId: String? = nil, questionRevision: Int? = nil, kind: String? = nil) throws {
        guard !isRestoringLocal, !isSaving, isSignedIn else { throw IdentityError.message("正在同步答题记录，请稍后重试。") }
        if isDemo {
            state.progress[itemID] = progress
            if let attempt { state.attemptHistory = NativeAttempt.merging(state.attemptHistory ?? [], [attempt]) }
            return
        }
        let before = state.progress[itemID] ?? ProgressEntry()
        let previous = state
        let previousResponses = responses
        let eventID = UUID()
        var operation = PendingAnswer(id: eventID, before: before, input: AnswerInput(questionId: questionID, itemId: itemID, selected: selected, correct: correct, progressEntry: progress, attemptHistory: attempt.map { [$0] }, reviewEventId: questionID.hasPrefix("memory-card:") ? UUID().uuidString : nil, reviewedAt: questionID.hasPrefix("memory-card:") ? progress.lastReviewedAt : nil, source: questionID.hasPrefix("memory-card:") ? "ios" : nil, syncEventId: eventID.uuidString))
        operation.input.canonicalQuestionId = canonicalQuestionId; operation.input.questionRevision = questionRevision; operation.input.kind = kind
        if !operation.isCardReview && pending.contains(where: { $0.input.itemId == itemID && $0.needsSyncReview == true }) { operation.needsSyncReview = true }
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
            if expected == generation { notice = pending.isEmpty ? nil : syncSummary }
        } catch {
            guard expected == generation else { return }
            if case APIError.http(401, _) = error { handle(error) }
            else { notice = "答题已保存在本机，同步未完成。\n\(error.localizedDescription)" }
        }
    }
    private func flushPending(expected: Int) async throws {
        guard uploadableCount > 0 else { return }
        isSaving = true
        let total = pending.count
        defer { isSaving = false; if !isLoading { syncStage = nil } }
        while let operation = pending.first(where: \.canAutomaticallyUpload) {
            syncStage = "正在上传答题记录 \(total - pending.count) / \(total)…"
            let isCardReview = operation.input.questionId.hasPrefix("memory-card:") && MemoryRating(rawValue: operation.input.selected) != nil
            var cloud = state
            if operation.historyOnly == true {
                if let attempts = operation.input.attemptHistory {
                    let merged = NativeAttempt.merging(cloud.attemptHistory ?? [], attempts)
                    if merged != cloud.attemptHistory {
                        struct HistoryUpdate: Encodable { let attemptHistory: [NativeAttempt] }
                        cloud = try await api.put("api/study-state/practice", body: HistoryUpdate(attemptHistory: merged))
                    }
                }
            } else if isCardReview {
                var input = operation.input
                if let attempts = input.attemptHistory { input.attemptHistory = NativeAttempt.merging(cloud.attemptHistory ?? [], attempts) }
                let acknowledgment: StudyState = try await api.post("api/answers?compact=1", body: input)
                cloud.progress.merge(acknowledgment.progress) { _, new in new }
                cloud.answers.merge(acknowledgment.answers) { _, new in new }
                if let attempts = acknowledgment.attemptHistory { cloud.attemptHistory = attempts }
                for event in acknowledgment.cardReviews ?? [] {
                    var events = cloud.cardReviews ?? []
                    events.removeAll { $0.eventId == event.eventId }; events.append(event)
                    cloud.cardReviews = events
                }
            } else {
                struct Replay: Encodable {
                    let eventId: String; let before: ProgressEntry; let input: AnswerInput
                    let legacy: Bool; let decision: String?
                }
                struct Receipt: Decodable { let eventId: String; let outcome: String; let state: StudyState }
                let receipt: Receipt = try await api.post("api/answers/replay", body: Replay(
                    eventId: operation.input.syncEventId ?? operation.id.uuidString, before: operation.before,
                    input: operation.input, legacy: operation.input.syncEventId == nil, decision: operation.syncDecision))
                guard expected == generation else { return }
                guard receipt.eventId == (operation.input.syncEventId ?? operation.id.uuidString) else { throw APIError.invalidResponse }
                if receipt.outcome == "needs_resolution" {
                    let previousPending = pending
                    // Dependent operations must wait too; persist this once, across logins.
                    for index in pending.indices where pending[index].input.itemId == operation.input.itemId && !pending[index].isCardReview && pending[index].historyOnly != true {
                        pending[index].needsSyncReview = true
                    }
                    do { try persist() } catch { pending = previousPending; throw error }
                    continue
                }
                guard ["accepted", "duplicate", "already_counted"].contains(receipt.outcome) else { throw APIError.invalidResponse }
                cloud.progress.merge(receipt.state.progress) { _, new in new }
                cloud.answers.merge(receipt.state.answers) { _, new in new }
                if let attempts = receipt.state.attemptHistory { cloud.attemptHistory = attempts }
            }
            guard expected == generation else { return }
            let previous = state
            guard let operationIndex = pending.firstIndex(where: { $0.id == operation.id }) else { continue }
            pending.remove(at: operationIndex)
            state = cloud
            applyPending()
            do {
                guard let userID = session?.user.id else { throw CancellationError() }
                try await files.saveInBackground(snapshot(), userID: userID)
                guard expected == generation else { throw CancellationError() }
            } catch {
                if expected == generation { pending.insert(operation, at: operationIndex); state = previous }
                throw error
            }
        }
    }
    var syncSummary: String {
        String(format: interfaceText("学习数据已更新；%ld 条等待上传，%ld 条旧记录待核对。本机记录已保留。"), uploadableCount, syncReviewCount)
    }
    func resolveSyncRecord(_ id: UUID, decision: String) async {
        guard ["merge", "already_counted"].contains(decision), !isRestoringLocal, !isLoading, !isSaving,
              let index = pending.firstIndex(where: { $0.id == id && $0.needsSyncReview == true }) else { return }
        let previous = pending
        pending[index].needsSyncReview = false
        pending[index].syncDecision = decision
        do { try persist() }
        catch { pending = previous; notice = error.localizedDescription; return }
        await refresh()
    }
    func resolveAllSyncRecords(decision: String) async {
        guard ["merge", "already_counted"].contains(decision), isOnline,
              !isRestoringLocal, !isLoading, !isSaving, pendingCount > 0 else { return }
        let previous = pending
        for index in pending.indices where pending[index].needsSyncReview == true {
            pending[index].needsSyncReview = false
            pending[index].syncDecision = decision
        }
        // Save the whole decision before uploading; retries retain the same event IDs.
        do { try persist() }
        catch { pending = previous; notice = error.localizedDescription; return }
        await refresh()
    }
    private func applyPending() {
        for operation in pending {
            let input = operation.input
            if operation.historyOnly != true { state.progress[input.itemId] = input.progressEntry }
            if let attempts = input.attemptHistory { state.attemptHistory = NativeAttempt.merging(state.attemptHistory ?? [], attempts) }
            if operation.historyOnly != true && input.questionId.hasPrefix("memory-card:"), let time = input.reviewedAt ?? input.progressEntry.lastReviewedAt {
                let eventID = input.reviewEventId ?? "card:\(input.itemId):\(time):\(input.selected)"
                if !(state.cardReviews ?? []).contains(where: { $0.eventId == eventID }) {
                    state.cardReviews = (state.cardReviews ?? []) + [CardReview(eventId: eventID, itemId: input.itemId, rating: input.selected, reviewedAt: time, source: "ios")]
                }
            }
            if operation.historyOnly != true && !input.questionId.hasPrefix("memory-card:") {
                state.answers[input.questionId] = .init(selected: input.selected, correct: input.correct, answeredAt: input.progressEntry.lastReviewedAt)
            }
        }
    }
    private func snapshot() -> LocalStudyData {
        LocalStudyData(bankVersions: bankVersions, bankQuestionStates: bankQuestionStates, wordbooks: wordbooks, items: items, state: state, plan: plan, reading: reading, captures: captures,
                       packs: packs, drafts: drafts, listening: listening, shares: shares, pending: pending,
                       lastSync: lastSync, syncCursor: syncCursor, hasPracticeCache: hasPracticeCache, hasListeningCache: hasListeningCache, responses: responses)
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
            wordbooks = data.wordbooks ?? []; items = data.items; state = data.state; plan = data.plan; reading = data.reading; captures = data.captures
            packs = data.packs; drafts = data.drafts; listening = data.listening; shares = data.shares
            pending = data.pending; lastSync = data.lastSync; syncCursor = data.syncCursor; responses = data.responses ?? [:]
            bankVersions = data.bankVersions; bankQuestionStates = data.bankQuestionStates
            hasPracticeCache = data.hasPracticeCache; hasListeningCache = data.hasListeningCache
            applyPending()
            Task { await self.updateImageCount() }
        } catch {
            guard expected == generation else { return }
            notice = "本机数据读取失败：\(error.localizedDescription)"
        }
    }
    func audioData(for item: ListeningItem) async throws -> Data {
        #if DEBUG
        if isDemo,NativeVisualFixtures.requestedID != nil,item.audioFileName.hasPrefix("native-visual-"),let url=Bundle.main.url(forResource:String(item.audioFileName.dropLast(4)),withExtension:"wav") { return try Data(contentsOf:url) }
        #endif
        guard let session else { throw IdentityError.message("请先登录。") }
        let url = files.audioURL(userID: session.user.id, item: item)
        if FileManager.default.fileExists(atPath: url.path) { return try Data(contentsOf: url) }
        let legacy = files.legacyAudioURL(userID:session.user.id,item:item)
        if FileManager.default.fileExists(atPath:legacy.path) {
            let bytes = try Data(contentsOf:legacy); try bytes.write(to:url,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication]); return bytes
        }
        guard isOnline else { throw IdentityError.message("这段音频尚未下载，请联网后下载。") }
        let expected = generation
        let ref = item.materialRefs?.first { ref in
            guard case .object(let payload) = bankVersions?["materialVersions"]?[ref.versionKey]?.payload else { return false }; return payload["type"] == .string("audio")
        }
        let endpoint = ref.map { APIClient.origin.appendingPathComponent("api/materials").appendingPathComponent($0.id).appendingPathComponent("versions").appendingPathComponent(String($0.revision)).appendingPathComponent("audio") } ?? APIClient.origin.appendingPathComponent("api/listening-questions").appendingPathComponent(item.id).appendingPathComponent("audio")
        var request = URLRequest(url: endpoint)
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard expected == generation else { throw CancellationError() }
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw IdentityError.message("音频素材缺失或读取失败（missingMaterial）。") }
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
        guard !isDownloadingSpeech, !isDemo, let session else { return }
        let configuration = speechConfiguration
        guard !configuration.usesSystemVoice else { notice = "请先在网页发音设置中选择并配置云端朗读，再同步设置。"; return }
        let texts = Array(Set(items.flatMap { item in
            // Automatic card playback may join the word and first example into
            // one request. Cache that exact text as well as the individual controls.
            [item.reading.flatMap { $0.isEmpty ? nil : $0 } ?? item.original,
             configuration.text(for: item)] + (item.examples ?? []).map(\.ja)
        }.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })).sorted()
        guard !texts.isEmpty else { notice = "请先同步单词和语法题库。"; return }
        let requests = Array(Set(texts.flatMap { SpeechConfiguration.chunks($0) }
            .map { configuration.request(text: $0) })).sorted { $0.text < $1.text }
        let files = self.files
        let userID = session.user.id
        let expected = generation
        isDownloadingSpeech = true
        speechDownloadProgress = "检查本机语音…"
        speechDownloadTask = Task { [weak self] in
            guard let self else { return }
            defer { if expected == self.generation { self.isDownloadingSpeech = false; self.speechDownloadTask = nil } }
            do {
                let missing = try await Task.detached(priority: .utility) {
                    try requests.filter { request in
                        try Task.checkCancellation()
                        let url = try files.speechURL(userID: userID, request: request)
                        let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize
                        let missing = (size ?? 0) <= 0
                        #if DEBUG
                        print("[Speech][Scan] \(missing ? "MISSING" : "SKIP") user=\(userID) key=\(url.lastPathComponent) bytes=\(size ?? 0) text=\(String(reflecting: request.text))")
                        #endif
                        return missing
                    }
                }.value
                try Task.checkCancellation()
                guard expected == self.generation else { return }
                #if DEBUG
                print("[Speech][Download] provider=\(configuration.provider) voice=\(configuration.voice) style=\(configuration.style) role=\(configuration.role) includeExample=\(configuration.includeExample) total=\(requests.count) cached=\(requests.count - missing.count) missing=\(missing.count)")
                #endif
                guard !missing.isEmpty else {
                    self.speechDownloadProgress = "无需下载"
                    self.notice = "当前发音配置的语音已全部下载，无需重复下载。"
                    return
                }
                self.speechDownloadProgress = "0 / \(missing.count)"
                for (index, request) in missing.enumerated() {
                    try Task.checkCancellation()
                    guard expected == self.generation else { return }
                    _ = try await self.speechAudio(request)
                    guard expected == self.generation else { return }
                    self.speechDownloadProgress = "\(index + 1) / \(missing.count)"
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
        guard hasListeningCache || !(bankVersions?["materialVersions"] ?? [:]).isEmpty else { notice = "请先同步听力题库。"; return }
        isDownloadingAudio = true
        let expected = generation
        defer { isDownloadingAudio = false }
        do {
            for group in ListeningGroup.make(listening) {
                guard let first = group.questions.first, expected == generation else { return }
                _ = try await audioData(for: first)
            }
            // Historical AU revisions remain downloadable even when the last LS is absent.
            var downloaded = Set<String>()
            for cached in (bankVersions?["materialVersions"] ?? [:]).values.sorted(by: { $0.versionKey < $1.versionKey }) {
                guard case .object(let payload) = cached.payload, payload["type"] == .string("audio"), case .string(let asset) = payload["audioAssetId"], !downloaded.contains(asset), let session else { continue }
                downloaded.insert(asset)
                let destination = files.audioMaterialURL(userID:session.user.id,assetID:asset)
                if FileManager.default.fileExists(atPath:destination.path) { continue }
                guard isOnline else { throw IdentityError.message("音频素材未下载（missingMaterial）。") }
                var request = URLRequest(url:APIClient.origin.appendingPathComponent("api/materials").appendingPathComponent(cached.id).appendingPathComponent("versions").appendingPathComponent(String(cached.revision)).appendingPathComponent("audio"))
                request.setValue("Bearer \(session.token)",forHTTPHeaderField:"Authorization")
                let (bytes,response) = try await URLSession.shared.data(for:request)
                guard expected == generation else { throw CancellationError() }
                guard let http = response as? HTTPURLResponse, http.statusCode == 200, http.mimeType?.hasPrefix("audio/") == true, !bytes.isEmpty else { throw IdentityError.message("音频素材缺失（missingMaterial）。") }
                try FileManager.default.createDirectory(at:destination.deletingLastPathComponent(),withIntermediateDirectories:true)
                try bytes.write(to:destination,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])
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
        imageDownloadTask?.cancel(); imageDownloadTask = nil
        isDownloadingImages = false; imageDownloadProgress = ""; downloadedImageCount = 0; imageDownloadFailures = 0
        speechPlayer.stop()
        speechDownloadTask?.cancel(); speechDownloadTask = nil
        isDownloadingSpeech = false; speechDownloadProgress = ""
        automaticRefreshTask?.cancel(); automaticRefreshTask = nil; lastAutomaticAttempt = nil
        wordbooks = []; items = []; state = StudyState(); plan = StudyPlan(); reading = []; captures = []; error = nil; notice = nil
        packs = []; drafts = []; listening = []; shares = []; pending = []; responses = [:]; lastSync = nil; syncCursor = nil
        bankVersions = nil; bankQuestionStates = nil
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
        if ProcessInfo.processInfo.arguments.contains("--japanese-display-fixture") {
            items.insert(DemoData.japaneseDisplayFixture, at: 0)
            var display = JapaneseDisplay(); display.segmented = true
            display.styles["noun"]?.mode = "text"
            state.settings = ["showReviewRuby": .bool(true), "showExplanationRuby": .bool(true), "japaneseDisplay": display.setting]
        }
        if ProcessInfo.processInfo.arguments.contains("--item-detail-fixture") { items.insert(DemoData.itemDetailFixture, at: 0) }
        if ProcessInfo.processInfo.arguments.contains("--listening-fixture") { listening = DemoData.listeningFixture; hasListeningCache = true }
        if ProcessInfo.processInfo.arguments.contains("--practice-fixture") { packs = [DemoData.practiceFixture] }
        if ProcessInfo.processInfo.arguments.contains("--batch-feedback-fixture") { state.settings = (state.settings ?? [:]).merging(["feedbackMode": .string("batch")]) { _, new in new } }
        if ProcessInfo.processInfo.arguments.contains("--statistics-fixture") { state.attemptHistory = DemoData.statisticsFixture(); packs = [DemoData.practiceFixture] }
        #endif
        #if DEBUG
        if let fixtureID=NativeVisualFixtures.requestedID {
            if let fixture=try? NativeVisualFixtures.load().fixtures.first(where:{$0.id==fixtureID}),fixture.surface=="quiz",let q=try? fixture.decoded(NativeQuestion.self),let id=q.canonicalQuestionId {
                let options=q.choices.enumerated().map { number,text in SettingValue.object(["id":.string("option-\(number)"),"text":.string(text)]) }
                let record=BankCachedVersion(id:id,revision:1,schemaVersion:1,payload:.object(["schemaVersion":.number(1),"questionTypeId":.string(fixtureID),"legacy":fixture.question ?? .null,"options":.array(options),"answer":.object(["type":.string("option"),"optionId":.string("option-0")])]))
                bankVersions=["questionVersions":[record.versionKey:record]]
            }
            UserDefaults.standard.removeObject(forKey:"listening-draft-v1:demo:visual-\(fixtureID)")
            state.settings=(state.settings ?? [:]).merging(["practiceNavigation":.string("manual")]) { _,new in new }
        }
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

extension AppStore {
    var offlineImages: [[String: String]] {
        items.flatMap { $0.images ?? [] } + shares.compactMap { $0.coverUrl.map { ["url": $0] } }
    }
    func loadImage(_ image: [String: String]) async throws -> UIImage {
        let expected = generation
        let userID = session?.user.id ?? 0
        let request = try APIClient.itemImageRequest(image, token: session?.token)
        let bitmap = try await NativeImageCache.shared.bitmap(userID: userID, request: request)
        try Task.checkCancellation()
        guard expected == generation, userID == (session?.user.id ?? 0) else { throw CancellationError() }
        return bitmap.image
    }
    func updateImageCount() async {
        guard let session else { return }
        let expected = generation
        let requests = offlineImages.compactMap { try? APIClient.itemImageRequest($0, token: session.token) }
        let count = await NativeImageCache.shared.count(userID: session.user.id, requests: requests)
        guard expected == generation else { return }
        downloadedImageCount = count
    }
    func startImageDownload() {
        guard !isDemo, let session, imageDownloadTask == nil else { return }
        let expected = generation
        let userID = session.user.id
        let images = offlineImages
        var seen = Set<String>()
        let requests = images.compactMap { try? APIClient.itemImageRequest($0, token: session.token) }.filter { seen.insert($0.url!.absoluteString).inserted }
        isDownloadingImages = true; imageDownloadFailures = images.count - images.compactMap { try? APIClient.itemImageRequest($0, token: session.token) }.count
        imageDownloadProgress = "0 / \(requests.count)"
        imageDownloadTask = Task { [weak self] in
            guard let self else { return }
            defer {
                if expected == self.generation {
                    self.isDownloadingImages = false; self.imageDownloadTask = nil
                    let latest = Set(self.offlineImages.compactMap { try? APIClient.itemImageRequest($0, token: self.session?.token).url?.absoluteString })
                    if !Task.isCancelled && latest != Set(requests.compactMap { $0.url?.absoluteString }) { self.startImageDownload() }
                }
            }
            var completed = 0
            for offset in stride(from: 0, to: requests.count, by: 4) {
                guard !Task.isCancelled, expected == self.generation else { return }
                let batch = Array(requests[offset..<min(offset + 4, requests.count)])
                await withTaskGroup(of: Bool.self) { group in
                    for request in batch { group.addTask {
                        do { _ = try await NativeImageCache.shared.data(userID: userID, request: request); return true }
                        catch { return false }
                    } }
                    for await success in group {
                        guard expected == self.generation, !Task.isCancelled else { continue }
                        completed += 1
                        if !success { self.imageDownloadFailures += 1 }
                        self.imageDownloadProgress = "\(completed) / \(requests.count)"
                    }
                }
            }
            let count = await NativeImageCache.shared.count(userID: userID, requests: requests)
            guard expected == self.generation, !Task.isCancelled else { return }
            self.downloadedImageCount = count
        }
    }
}
