import SwiftUI

/// Counts use the same payloads as offline synchronization, scoped to the signed-in account.
enum StudyDataCategory: String, CaseIterable, Identifiable {
    case vocabulary = "词汇卡片", grammar = "语法卡片", reading = "阅读题", listening = "听力题"
    case packs = "练习套数", questions = "练习题（去重）", drafts = "练习草稿"
    case tasks = "学习计划任务", days = "每日学习统计", progress = "学习进度", answers = "题目答案"
    case captures = "记录的疑问", discovery = "发现内容"
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
        }
    }
}

extension APIClient {
    /// Read-only: inspecting the cloud must never populate or overwrite the local snapshot.
    func fetchStudySnapshot() async throws -> LocalStudyData {
        struct Index: Decodable { let practices: [Summary]; struct Summary: Decodable { let id: String } }
        struct Drafts: Decodable { let drafts: [PracticeDraft] }
        struct Detail: Decodable { let practice: NativePack }
        struct Shares: Decodable { let shares: [DiscoveryShare] }
        async let data: ReviewData = get("api/review-data")
        async let study: StudyState = get("api/study-state")
        async let schedule: PlanEnvelope = get("api/study-plan")
        async let questions: QuestionEnvelope = get("api/reading-questions")
        async let inbox: CaptureEnvelope = get("api/captures")
        async let index: Index = get("api/daily-practices")
        async let draftResult: Drafts = get("api/drafts")
        async let audioResult: ListeningEnvelope = get("api/listening-questions")
        async let discovery: Shares = get("api/market")
        let (review, state, plan, reading, captures, listing, drafts, listening, shares) = try await
            (data, study, schedule, questions, inbox, index, draftResult, audioResult, discovery)
        var packs: [NativePack] = []
        for start in stride(from: 0, to: listing.practices.count, by: 4) {
            try Task.checkCancellation()
            let batch = listing.practices[start..<min(start + 4, listing.practices.count)]
            let loaded = try await withThrowingTaskGroup(of: NativePack.self) { group in
                for summary in batch {
                    group.addTask {
                        let detail: Detail = try await get("api/daily-practices/\(summary.id)")
                        return detail.practice
                    }
                }
                var result: [NativePack] = []
                for try await pack in group { result.append(pack) }
                return result
            }
            packs.append(contentsOf: loaded)
        }
        return LocalStudyData(items: review.items, state: state, plan: plan.plan,
                              reading: reading.questions, captures: captures.captures,
                              packs: packs.sorted { $0.date > $1.date }, drafts: drafts.drafts,
                              listening: listening.questions, shares: shares.shares,
                              hasPracticeCache: true, hasListeningCache: true)
    }
}

struct DatabaseCheckView: View {
    @Environment(AppStore.self) private var store
    @State private var local: LocalStudyData?
    @State private var cloud: LocalStudyData?
    @State private var localReadSucceeded = false
    @State private var downloadedAudio = 0
    @State private var checkedAt: Date?
    @State private var localError: String?
    @State private var cloudError: String?
    @State private var busy = false
    private var disabled: Bool { busy || store.isLoading || store.isSaving || store.isDownloadingAudio }
    var body: some View {
        List {
            Section {
                if let date = checkedAt { LabeledContent("云端检查时间", value: date.formatted(date: .abbreviated, time: .shortened)) }
                if let date = local?.lastSync { LabeledContent("本机同步时间", value: date.formatted(date: .abbreviated, time: .shortened)) }
                if busy { ProgressView("正在检查…") }
                if localReadSucceeded && local == nil { Text("本机尚未下载学习数据").foregroundStyle(.secondary) }
                if let localError { Text(localError).foregroundStyle(.red) }
                if let cloudError { Text(cloudError).foregroundStyle(.secondary) }
            }
            Section {
                HStack {
                    Text("内容").frame(maxWidth: .infinity, alignment: .leading)
                    Text("云端").frame(width: 64, alignment: .trailing)
                    Text("本机").frame(width: 64, alignment: .trailing)
                }.font(.subheadline).foregroundStyle(.secondary)
                ForEach(StudyDataCategory.allCases) { category in
                    let remote = cloud.map { category.count(in: $0) }
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
                Text("统计当前账户在 App 中可同步的内容。本机数量读取已保存的数据；数量相同不代表内容完全一致。")
            }
            Section("离线音频") {
                LabeledContent("云端关联音频", value: cloud.map { String(ListeningGroup.make($0.listening).count) } ?? "—")
                LabeledContent("本机已下载", value: localReadSucceeded ? String(downloadedAudio) : "—")
                Button("下载听力音频") { Task { await perform(.audio) } }
                    .disabled(disabled || !store.isOnline || !store.hasListeningCache)
            }
            Section("本机记录") {
                LabeledContent("已保存的回答", value: localReadSucceeded ? String(local?.responses?.count ?? 0) : "—")
                LabeledContent("待同步答题", value: localReadSucceeded ? String(local?.pending.count ?? 0) : "—")
                if let notice = store.notice { Text(notice).font(.footnote).foregroundStyle(.secondary) }
            }
            Section {
                Button("重新检查") { Task { await perform(.check) } }
                    .disabled(disabled).accessibilityIdentifier("database.check")
                Button("同步学习数据") { Task { await perform(.sync) } }
                    .disabled(disabled || !store.isOnline).accessibilityIdentifier("database.sync")
            }
        }.navigationTitle("数据库检查").navigationBarTitleDisplayMode(.inline)
            .task { await perform(.check) }
    }
    private enum Action { case check, sync, audio }
    @MainActor private func perform(_ action: Action) async {
        guard !busy, let session = store.session else { return }
        busy = true
        defer { busy = false }
        if action == .sync { await store.refresh() }
        if action == .audio { await store.downloadListeningAudio() }
        guard store.session?.token == session.token else { return }
        readLocal(userID: session.user.id)
        cloud = nil; checkedAt = nil; cloudError = nil
        guard store.isOnline else { cloudError = "当前离线，云端数量暂不可用。"; return }
        do {
            let snapshot = try await APIClient(token: session.token).fetchStudySnapshot()
            try Task.checkCancellation()
            guard store.session?.token == session.token else { return }
            cloud = snapshot; checkedAt = .now
            // A background sync may have finished while fetching cloud statistics.
            readLocal(userID: session.user.id)
        } catch is CancellationError { }
        catch {
            guard store.session?.token == session.token else { return }
            cloudError = "云端检查失败：\(error.localizedDescription)"
        }
    }
    private func readLocal(userID: Int) {
        do {
            let files = LocalStudyFiles()
            local = try files.load(userID: userID)
            downloadedAudio = try files.downloadedAudioCount(userID: userID, items: local?.listening ?? [])
            localReadSucceeded = true; localError = nil
        } catch {
            local = nil; localReadSucceeded = false
            localError = "本机数据读取失败：\(error.localizedDescription)"
        }
    }
}
