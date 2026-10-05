import SwiftUI

/// Counts use the same payloads as offline synchronization, scoped to the signed-in account.
enum StudyDataCategory: String, CaseIterable, Identifiable {
    case vocabulary = "词汇卡片", grammar = "语法卡片", reading = "阅读题", listening = "听力题"
    case packs = "练习套数", questions = "练习题（去重）", drafts = "练习草稿"
    case tasks = "学习计划任务", days = "每日学习统计", progress = "学习进度", answers = "题目答案"
    case captures = "记录的疑问", discovery = "发现内容"
    case vocabularyImages = "有图词汇", grammarImages = "有图语法"
    var id: String { rawValue }
    func count(in data: LocalStudyData) -> Int {
        switch self {
        case .vocabulary: data.items.filter { !$0.isGrammar }.count
        case .grammar: data.items.filter(\.isGrammar).count
        case .reading: data.reading.count
        case .listening: data.listening.count
        case .packs: data.packs.count
        case .questions: Set(data.packs.flatMap(\.questions).map(\.id)).count
        case .drafts: data.drafts.count
        case .tasks: data.plan.tasks.count
        case .days: data.plan.dailySummaries.count
        case .progress: data.state.progress.count
        case .answers: data.state.answers.count
        case .captures: data.captures.count
        case .discovery: data.shares.count
        case .vocabularyImages: data.items.filter { !$0.isGrammar && !($0.images ?? []).isEmpty }.count
        case .grammarImages: data.items.filter { $0.isGrammar && !($0.images ?? []).isEmpty }.count
        }
    }
}


struct DatabaseCheckView: View {
    @Environment(AppStore.self) private var store
    @State private var local: LocalStudyData?
    @State private var cloud: LocalStudyData?
    @State private var cloudCounts: [String: Int]?
    @State private var localReadSucceeded = false
    @State private var downloadedAudio = 0
    @State private var checkedAt: Date?
    @State private var localError: String?
    @State private var cloudError: String?
    @State private var busy = false
    @State private var syncMessage: String?
    @State private var showingSyncResult = false
    @State private var resolvingRecord: PendingAnswer?
    private var disabled: Bool { busy || store.isLoading || store.isSaving || store.isDownloadingAudio }
    var body: some View {
        List {
            Section {
                if let date = checkedAt { LabeledContent("云端检查时间", value: date.formatted(date: .abbreviated, time: .shortened)) }
                if let date = local?.lastSync { LabeledContent("云端数据下载时间", value: date.formatted(date: .abbreviated, time: .shortened)) }
                if busy { ProgressView(store.syncStage ?? "正在检查…") }
                if localReadSucceeded && local == nil { Text("本机尚未下载学习数据").foregroundStyle(.secondary) }
                if let localError { Text(localError).foregroundStyle(.red) }
                if let cloudError { Text(cloudError).foregroundStyle(.secondary) }
                if let notice = store.notice { Text(notice).font(.footnote).foregroundStyle(.secondary) }
                if let error = store.error { Text(error).font(.footnote).foregroundStyle(.red) }
            }
            Section {
                HStack {
                    Text("内容").frame(maxWidth: .infinity, alignment: .leading)
                    Text("云端").frame(width: 64, alignment: .trailing)
                    Text("本机").frame(width: 64, alignment: .trailing)
                }.font(.subheadline).foregroundStyle(.secondary)
                ForEach(StudyDataCategory.allCases) { category in
                    let remote = cloudCounts?[category.id] ?? cloud.map { category.count(in: $0) }
                    let disk = localReadSucceeded ? category.count(in: local ?? LocalStudyData()) : nil
                    HStack(alignment: .firstTextBaseline) {
                        Text(category.rawValue).frame(maxWidth: .infinity, alignment: .leading)
                        Text(remote.map(String.init) ?? "—").monospacedDigit().frame(width: 64, alignment: .trailing)
                        Text(disk.map(String.init) ?? "—").monospacedDigit().frame(width: 64, alignment: .trailing)
                            .foregroundStyle(remote != nil && disk != nil && remote != disk ? DeckTheme.accent : DeckTheme.ink)
                    }.accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(category.rawValue)，云端 \(remote.map(String.init) ?? "未检查")，本机 \(disk.map(String.init) ?? "读取失败")")
                }
            } header: { Text("学习数据") } footer: {
                Text("下载时间不代表本机记录已全部上传，请同时检查待同步数量。本机数量读取已保存的数据；词条数量相同不代表图片已更新。有图数量统计关联图片的词条，不代表图片文件已下载。")
            }
            Section("离线音频") {
                LabeledContent("云端关联音频", value: cloudCounts?["audio"].map(String.init) ?? cloud.map { String(ListeningGroup.make($0.listening).count) } ?? "—")
                LabeledContent("本机已下载", value: localReadSucceeded ? String(downloadedAudio) : "—")
                Button("下载听力音频") { Task { await perform(.audio) } }
                    .disabled(disabled || !store.isOnline || !store.hasListeningCache)
            }
            Section("本机记录") {
                LabeledContent("已保存的回答", value: localReadSucceeded ? String(local?.responses?.count ?? 0) : "—")
                LabeledContent("待同步答题", value: localReadSucceeded ? String(local?.pending.count ?? 0) : "—")
                LabeledContent("等待上传", value: String(store.uploadableCount))
                LabeledContent("旧记录待核对", value: String(store.syncReviewCount))
                if let syncMessage { Text(syncMessage).font(.footnote).textSelection(.enabled) }
            }
            syncReviewSection
            Section {
                Button("重新检查") { Task { await perform(.check) } }
                    .disabled(disabled).accessibilityIdentifier("database.check")
                if let stage = store.syncStage { ProgressView(stage) }
                Button("同步学习数据") { Task { await perform(.sync) } }
                    .disabled(disabled || !store.isOnline).accessibilityIdentifier("database.sync")
            }
        }.navigationTitle("数据库检查").navigationBarTitleDisplayMode(.inline)
            .task { await perform(.check) }
            .alert("同步结果", isPresented: $showingSyncResult) {
                Button("知道了", role: .cancel) { }
            } message: {
                Text(syncMessage ?? "")
            }
            .confirmationDialog("这条作答是否已经包含在云端？", isPresented: Binding(
                get: { resolvingRecord != nil }, set: { if !$0 { resolvingRecord = nil } }
            ), titleVisibility: .visible) {
                if let operation = resolvingRecord {
                    Button("云端已包含这次作答，只保留记录") { resolve(operation, decision: "already_counted") }
                    Button("这是另一轮练习，合并计数") { resolve(operation, decision: "merge") }
                }
                Button("暂不处理", role: .cancel) { resolvingRecord = nil }
            } message: {
                Text("仅处理这一条记录，不覆盖整份云端进度。合并后会增加一次作答；已包含的记录不会再次计数。")
            }
    }
    @ViewBuilder private var syncReviewSection: some View {
            if store.syncReviewCount > 0 {
                Section {
                    ForEach(reviewRecords) { operation in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(store.items.first { $0.id == operation.input.itemId }?.original ?? operation.input.itemId)
                            Text(operation.input.selected).font(.subheadline)
                            if let time = operation.input.progressEntry.lastReviewedAt { Text(time).font(.caption).foregroundStyle(.secondary) }
                            Button("核对这条记录") { resolvingRecord = operation }
                                .disabled(!canReview(operation))
                        }
                    }
                } header: { Text("核对旧答题记录") } footer: {
                    Text("这些记录已保存在本机，登录时不会重复上传。请按作答顺序核对：云端已包含同一次作答时不增加次数；确认是另一轮练习时才合并计数。")
                }
            }
    }
    private func resolve(_ operation: PendingAnswer, decision: String) {
        resolvingRecord = nil
        Task {
            await store.resolveSyncRecord(operation.id, decision: decision)
            if let session = store.session { await readLocal(userID: session.user.id) }
            syncMessage = store.notice ?? store.error
        }
    }
    private var reviewRecords: [PendingAnswer] { store.pending.filter { $0.needsSyncReview == true } }
    private func canReview(_ operation: PendingAnswer) -> Bool {
        guard !disabled, store.isOnline else { return false }
        return reviewRecords.first(where: { $0.input.itemId == operation.input.itemId })?.id == operation.id
    }
    private enum Action { case check, sync, audio }
    @MainActor private func perform(_ action: Action) async {
        guard !busy, let session = store.session else { return }
        busy = true
        defer { busy = false }
        if action == .sync {
            syncMessage = nil
            let downloaded = await store.refresh()
            guard store.session?.token == session.token else { return }
            await readLocal(userID: session.user.id)
            // Reuse the cloud snapshot just fetched by refresh instead of downloading every pack twice.
            cloudCounts = nil
            cloud = downloaded
            checkedAt = downloaded == nil ? nil : .now
            cloudError = downloaded == nil ? "本次同步未取得完整云端数据。" : nil
            syncMessage = store.error ?? store.notice
                ?? (store.pendingCount == 0 ? "学习数据已同步。" : "仍有 \(store.pendingCount) 条答题记录等待上传，请重试同步。")
            showingSyncResult = true
            return
        }
        if action == .audio { await store.downloadListeningAudio() }
        guard store.session?.token == session.token else { return }
        await readLocal(userID: session.user.id)
        cloud = nil; cloudCounts = nil; checkedAt = nil; cloudError = nil
        guard store.isOnline else { cloudError = "当前离线，云端数量暂不可用。"; return }
        do {
            struct Status: Decodable { let counts: [String: Int] }
            let status: Status = try await APIClient(token: session.token).get("api/sync/status")
            try Task.checkCancellation()
            guard store.session?.token == session.token else { return }
            let keys = ["vocabulary", "grammar", "reading", "listening", "packs", "questions", "drafts", "tasks", "days", "progress", "answers", "captures", "discovery", "vocabularyImages", "grammarImages"]
            cloudCounts = Dictionary(uniqueKeysWithValues: zip(StudyDataCategory.allCases, keys).compactMap { category, key in
                status.counts[key].map { (category.id, $0) }
            })
            cloudCounts?["audio"] = status.counts["audio"]
            checkedAt = .now
            // A background sync may have finished while fetching cloud statistics.
            await readLocal(userID: session.user.id)
        } catch is CancellationError { }
        catch {
            guard store.session?.token == session.token else { return }
            cloudError = "云端检查失败：\(error.localizedDescription)"
        }
    }
    private func readLocal(userID: Int) async {
        do {
            let (snapshot, audioCount) = try await Task.detached(priority: .userInitiated) {
                let files = LocalStudyFiles()
                let snapshot = try files.load(userID: userID)
                return (snapshot, try files.downloadedAudioCount(userID: userID, items: snapshot?.listening ?? []))
            }.value
            guard store.session?.user.id == userID else { return }
            local = snapshot
            downloadedAudio = audioCount
            localReadSucceeded = true; localError = nil
        } catch {
            local = nil; localReadSucceeded = false
            localError = "本机数据读取失败：\(error.localizedDescription)"
        }
    }
}


extension APIClient {
    func fetchIncrementalStudy(cached: LocalStudyData, progress: (@MainActor @Sendable (Int, Int) -> Void)? = nil) async throws -> LocalStudyData {
        struct Request: Encodable { let cursor: String?; let page: String? }
        var data = cached
        var page: String?
        var completed = 0
        var restarted = false
        while true {
            try Task.checkCancellation()
            let response: StudySyncPage = try await post("api/sync", body: Request(cursor: data.syncCursor, page: page))
            if response.restart == true {
                guard !restarted else { throw APIError.invalidResponse }
                restarted = true; data = cached; page = nil; completed = 0
                continue
            }
            if page == nil && response.reset == true { data = LocalStudyData() }
            try data.applySync(response.changes ?? [])
            completed += response.changes?.count ?? 0
            await progress?(completed, response.total ?? completed)
            page = response.nextPage
            if page == nil {
                guard let cursor = response.cursor else { throw APIError.invalidResponse }
                data.syncCursor = cursor
                break
            }
        }
        data.hasPracticeCache = true; data.hasListeningCache = true
        return data
    }
}
