import SwiftUI

struct PracticeEntry: Identifiable {
    let id: String; let title: String; let subtitle: String; let icon: String
    static func ordered(dailyCompleted: Bool) -> [Self] {
        let order = dailyCompleted ? ["topics", "daily", "mixed"] : ["daily", "topics", "mixed"]
        return order.compactMap { id in all.first { $0.id == id } }
    }
    static let all: [Self] = [
        .init(id: "topics", title: "专项练习", subtitle: "按教材、汉字或语法主题，集中练一套。", icon: "scope"),
        .init(id: "mixed", title: "综合练习", subtitle: "从已有练习题中混合抽取词汇与语法，最多 20 题。", icon: "square.stack.3d.up"),
        .init(id: "daily", title: "今日练习", subtitle: "完成今天准备好的练习题。", icon: "calendar")
    ]
}
struct NativeQuestion: Codable, Identifiable {
    let id: String; let itemId: String; let kind: String; let title: String
    let prompt: String; let choices: [String]; let answer: String
    var instruction: String?; var translationZh: String?; var context: String?
    var correctReason: String?; var memoryPoint: String?; var choiceAnalysis: [Analysis]?
    struct Analysis: Codable { let choice: String; let correct: Bool; let explanation: String }
    var isUsable: Bool { choices.count >= 2 && choices.contains(answer) }
}
struct NativePack: Codable, Identifiable {
    let id: String; let title: String; let date: String
    var sourceDraftId: String?; let questions: [NativeQuestion]
}
struct PracticeDraft: Codable, Identifiable {
    let id: String; let title: String; let status: String
    var isTopic: Bool { title.range(of: #"^(?:\d{4}-\d{2}-\d{2}|\d{1,2}月\d{1,2}日).*?(?:復習|复习|弱点强化|每日|练习)"#, options: .regularExpression) == nil }
}
struct NativePracticeScreen: View {
    let entry: PracticeEntry
    @Environment(AppStore.self) private var store
    private var packs: [NativePack] { store.packs }
    private var drafts: [PracticeDraft] { store.drafts }
    @State private var query = ""
    @State private var round: NativeRound?
    var topics: [PracticeDraft] { drafts.filter { $0.isTopic && (query.isEmpty || $0.title.localizedCaseInsensitiveContains(query)) } }
    var mixed: [NativeQuestion] {
        var seen = Set<String>()
        return packs.flatMap(\.questions).filter { $0.isUsable && ["grammar", "moji_goi", "meaning", "kanji_to_kana", "kana_to_kanji"].contains($0.kind) && seen.insert($0.id).inserted }
    }
    var body: some View {
        NavigationStack {
            Group {
                if store.isDemo {
                    ContentUnavailableView("演示模式", systemImage: "doc.text", description: Text("登录后使用已同步的正式练习。"))
                } else if !store.hasPracticeCache {
                    ContentUnavailableView {
                        Label("尚未下载练习", systemImage: "arrow.down.circle")
                    } description: {
                        Text("同步一次后，即可离线练习。")
                    } actions: {
                        Button(store.isLoading ? "正在同步…" : "同步学习数据") { Task { await store.refresh() } }
                            .disabled(store.isLoading || !store.isOnline)
                    }
                }
                else if entry.id == "mixed" {
                    VStack(spacing: 24) {
                        Image(systemName: "square.stack.3d.up").font(.system(size: 48)).foregroundStyle(DeckTheme.accent)
                        Text("综合练习").font(.largeTitle.bold())
                        Text("已有练习中共 \(mixed.count) 道词汇与语法题，每轮最多 20 题。").foregroundStyle(.secondary)
                        Button("开始一轮练习") { round = NativeRound(title: "综合练习", questions: Array(mixed.shuffled().prefix(20))) }.buttonStyle(PrimaryButton()).disabled(mixed.isEmpty)
                    }.frame(maxWidth: 600).modifier(StudyPagePadding())
                } else {
                    List {
                        if entry.id == "topics" {
                            if topics.isEmpty { Text("暂无专项练习") }
                            ForEach(topics) { draft in
                                let pack = packs.first { $0.sourceDraftId == draft.id }
                                Button { if let pack { start(pack, title: draft.title) } } label: {
                                    DeckRow(title: draft.title, subtitle: pack.map { "\($0.questions.count) 题 · 开始练习" } ?? "待发布为正式练习", icon: "doc.text")
                                }.disabled(pack == nil)
                            }
                        } else {
                            let daily = store.todayPacks
                            if daily.isEmpty { Text("今天还没有准备好的练习") }
                            ForEach(daily) { pack in Button { start(pack, title: pack.title) } label: { DeckRow(title: pack.title, subtitle: "\(pack.questions.count) 题", icon: "calendar") } }
                        }
                    }.searchable(text: $query, prompt: "搜索专项练习")
                }
            }.navigationTitle(entry.title).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarLeading) { DeckDismissButton(kind: .back, label: "返回练习", identifier: "practice.back") } }
                .fullScreenCover(item: $round) { NativeQuizView(round: $0) }
        }
    }
    func start(_ pack: NativePack, title: String) { round = NativeRound(title: title, questions: pack.questions.filter(\.isUsable)) }

}
struct NativeRound: Identifiable { let id = UUID(); let title: String; let questions: [NativeQuestion] }
struct NativeQuizView: View {
    let round: NativeRound
    var savesProgress = true
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var index = 0
    @State private var selected: String?
    @State private var submitted = false
    @State private var saving = false
    @State private var correct = 0
    @State private var failure: String?
    @State private var celebrating = false
    @State private var celebrationRequest = 0
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if index >= round.questions.count {
                        Text("本轮练习完成").font(.largeTitle.bold())
                        Text("\(correct) / \(round.questions.count) 题正确")
                        Button(savesProgress ? "返回练习列表" : "返回发现详情") { dismiss() }.buttonStyle(PrimaryButton())
                    } else {
                        let question = round.questions[index]
                        Text("第 \(index + 1) / \(round.questions.count) 题").foregroundStyle(.secondary)
                        ProgressView(value: Double(index), total: Double(max(1, round.questions.count)))
                        Text(question.instruction ?? question.title).font(.headline)
                        if let context = question.context, !context.isEmpty, context != question.prompt { Text(context).lineSpacing(8) }
                        Text(question.prompt).font(.title2).lineSpacing(10).textSelection(.enabled)
                        ForEach(Array(question.choices.enumerated()), id: \.offset) { i, choice in
                            Button { selected = choice } label: {
                                HStack { Text("\(i + 1)").monospacedDigit(); Text(choice); Spacer(); if selected == choice { Image(systemName: "checkmark.circle.fill") } }
                                    .padding(20).foregroundStyle(DeckTheme.ink).background(selected == choice ? DeckTheme.accent.opacity(0.12) : DeckTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                            }.disabled(submitted || saving)
                        }
                        if let failure { Text(failure).foregroundStyle(.red) }
                        if submitted {
                            if savesProgress && store.pendingCount > 0 { Text("已保存到本机，等待同步").font(.caption).foregroundStyle(.secondary) }
                            Text(selected == question.answer ? "回答正确" : "正确答案：\(question.answer)").font(.headline).foregroundStyle(DeckTheme.green)
                            if let translation = question.translationZh { Text(translation).foregroundStyle(.secondary) }
                            if let reason = question.correctReason { Text(reason).lineSpacing(6) }
                            ForEach(Array((question.choiceAnalysis ?? []).enumerated()), id: \.offset) { _, analysis in Text("\(analysis.choice)：\(analysis.explanation)").font(.subheadline) }
                            if let memory = question.memoryPoint, !memory.isEmpty { Text(memory).padding().background(DeckTheme.green.opacity(0.1)) }
                            Button(index + 1 == round.questions.count ? "查看结果" : "下一题") { index += 1; selected = nil; submitted = false; failure = nil; celebrating = false }.buttonStyle(PrimaryButton())
                        } else {
                            Button(saving ? "正在保存…" : "确认答案") {
                                guard let selected else { return }; saving = true
                                Task { defer { saving = false }; do { if savesProgress { try await store.submitNativeQuestion(question, selected: selected) }; submitted = true; if selected == question.answer { correct += 1; celebrationRequest += 1; celebrating = true } } catch { failure = error.localizedDescription } }
                            }.buttonStyle(PrimaryButton()).disabled(selected == nil || saving)
                        }
                    }
                }.frame(maxWidth: 850).modifier(StudyPagePadding()).frame(maxWidth: .infinity)
            }.background(DeckTheme.paper).navigationTitle(round.title).navigationBarTitleDisplayMode(.inline)
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    HStack {
                        Spacer()
                        CompanionAvatar(motion: celebrating ? .celebrate : .idle, request: celebrationRequest) { celebrating = false }
                    }.padding(.trailing, 12)
                }
                .toolbar { ToolbarItem(placement: .cancellationAction) { DeckDismissButton(kind: .back, label: savesProgress ? "返回练习列表" : "返回发现详情", disabled: saving, identifier: "quiz.back") } }
        }.interactiveDismissDisabled()
    }
}

extension AppStore {
    func submitNativeQuestion(_ question: NativeQuestion, selected: String) async throws {
        guard question.choices.contains(selected) else { throw IdentityError.message("请选择有效选项。") }
        let progress = (state.progress[question.itemId] ?? ProgressEntry()).afterPractice(correct: selected == question.answer)
        try saveAnswerLocally(questionID: question.id, itemID: question.itemId, selected: selected,
                              correct: selected == question.answer, progress: progress)

    }
}
extension ProgressEntry {
    func afterPractice(correct right: Bool, now: Date = .now) -> Self {
        var next = self
        next.correct += right ? 1 : 0; next.wrong += right ? 0 : 1
        let count = (reviewCount ?? 0) + 1
        let nextEase = right ? min((ease ?? 2.5) + 0.15, 3.2) : max((ease ?? 2.5) - 0.2, 1.3)
        let days = right ? (count == 1 ? 1 : count == 2 ? 3 : max(4, Int((Double(max(intervalDays ?? 0, 3)) * nextEase).rounded()))) : 1
        next.reviewCount = count; next.ease = nextEase; next.intervalDays = days
        next.firstSeenAt = firstSeenAt ?? now.ISO8601Format(); next.lastReviewedAt = now.ISO8601Format()
        next.nextReviewAt = Calendar.current.date(byAdding: .day, value: days, to: now)!.ISO8601Format()
        next.status = next.correct >= 4 && next.wrong <= 1 && count >= 4 ? "mastered" : next.correct >= 2 ? "review" : "learning"
        return next
    }
}
