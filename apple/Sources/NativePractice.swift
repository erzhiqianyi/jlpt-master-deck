import SwiftUI
import WebKit
import CryptoKit
import JavaScriptCore

struct PracticeEntry: Identifiable {
    let id: String; let title: String; let subtitle: String; let icon: String
    static func ordered(dailyCompleted: Bool) -> [Self] {
        let order = dailyCompleted ? ["topics", "daily", "mixed"] : ["daily", "topics", "mixed"]
        return order.compactMap { id in all.first { $0.id == id } }
    }
    static let all: [Self] = [
        .init(id: "mock", title: "模拟考试", subtitle: "按试卷与考试安排作答。", icon: "doc.badge.clock"),
        .init(id: "topics", title: "专项练习", subtitle: "按教材、汉字或语法主题，集中练一套。", icon: "scope"),
        .init(id: "mixed", title: "综合练习", subtitle: "从已有练习题中混合抽取词汇与语法，最多 20 题。", icon: "square.stack.3d.up"),
        .init(id: "daily", title: "今日练习", subtitle: "完成今天准备好的练习题。", icon: "calendar")
    ]
}
struct NativeQuestion: Codable, Identifiable {
    let id: String; let itemId: String; let kind: String; let title: String
    let prompt: String; let choices: [String]; let answer: String
    var japaneseAnnotations: [JapaneseAnnotation]?
    var promptTarget: String?
    var instruction: String?; var translationZh: String?; var context: String?
    var correctReason: String?; var memoryPoint: String?; var choiceAnalysis: [Analysis]?
    struct Analysis: Codable { let choice: String; let correct: Bool; let explanation: String }
    var isUsable: Bool { choices.count >= 2 && choices.contains(answer) }
}
extension NativeQuestion {
    var readingTarget: String? {
        guard kind == "kanji_to_kana" else { return promptTarget.flatMap { prompt.contains($0) && !$0.isEmpty ? $0 : nil } }
        return [promptTarget, memoryPoint].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty && prompt.contains($0) && $0.range(of: #"[\p{Han}]"#, options: .regularExpression) != nil }
    }
    var markedPrompt: AttributedString {
        var value = AttributedString(prompt)
        if let target = readingTarget, let range = value.range(of: target) {
            value[range].underlineStyle = .single
            value[range].foregroundColor = DeckTheme.accent
            value[range].font = .system(size: 22, weight: .bold)
        }
        return value
    }
}
/// Uses the same authored seeds, eligibility rules, distractors and IDs as web practice.
enum NativeItemQuestions {
    static func build(item: StudyItem, items: [StudyItem], packs: [NativePack], locale: String) throws -> [NativeQuestion] {
        guard let url = Bundle.main.url(forResource: "ItemQuestions", withExtension: "js"),
              let context = JSContext() else { throw APIError.invalidResponse }
        context.evaluateScript(try String(contentsOf: url, encoding: .utf8))
        let inputs = items.contains(where: { $0.id == item.id }) ? items : items + [item]
        let json = String(decoding: try JSONEncoder().encode(inputs), as: UTF8.self)
        let supportedLocale = ["zh-CN", "ja", "en"].contains(locale) ? locale : "zh-CN"
        guard let function = context.objectForKeyedSubscript("JLPTItemQuestions")?.objectForKeyedSubscript("forItem"),
              let output = function.call(withArguments: [json, item.id, supportedLocale])?.toString(),
              context.exception == nil else { throw APIError.invalidResponse }
        let generated = try JSONDecoder().decode([NativeQuestion].self, from: Data(output.utf8))
        var seen = Set<String>()
        // Pack versions take precedence when the same question has subsequently been edited.
        return (packs.flatMap(\.questions) + generated).filter {
            $0.itemId == item.id && $0.isUsable && seen.insert($0.id).inserted
        }
    }
}

struct NativePack: Codable, Identifiable {
    let id: String; let title: String; let date: String
    var sourceDraftId: String?; let questions: [NativeQuestion]
    var minutes: Int?
    var version: Int?
}
struct PracticeDraft: Codable, Identifiable {
    let id: String; let title: String; let status: String
    var created_at: String?
    var updated_at: String?
    func isPendingDaily(on day: String) -> Bool {
        !isTopic && ["draft", "needs_revision", "approved"].contains(status)
            && created_at.flatMap(StudyDates.parse).map { StudyDates.day($0) == day } == true
    }
    var isTopic: Bool { title.range(of: #"^(?:\d{4}-\d{2}-\d{2}|\d{1,2}月\d{1,2}日).*?(?:復習|复习|弱点强化|每日|练习)"#, options: .regularExpression) == nil }
}
struct NativePracticeScreen: View {
    let entry: PracticeEntry
    @Environment(AppStore.self) private var store
    private var packs: [NativePack] { store.packs }
    private var drafts: [PracticeDraft] { store.drafts }
    @State private var query = ""
    @State private var round: NativeRound?
    @State private var reviewingDraft: PracticeDraft?
    @State private var confirmedPack: NativePack?
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
                                Button { if let pack { start(pack, title: draft.title) } else { reviewingDraft = draft } } label: {
                                    DeckRow(title: draft.title, subtitle: pack.map { "\($0.questions.count) 题 · 开始练习" } ?? (draft.status == "approved" ? "已确认 · 保存为专项练习" : "待确认 · 查看题目"), icon: "doc.text")
                                }
                            }
                        } else {
                            let daily = store.todayPacks
                            if daily.isEmpty {
                                if let draft = store.todayDraft {
                                    Button { reviewingDraft = draft } label: {
                                        DeckRow(title: draft.title, subtitle: draft.status == "approved" ? "已确认 · 加入今日练习" : "待确认 · 查看题目", icon: "calendar")
                                    }
                                } else { Text("今天还没有准备好的练习") }
                            }
                            ForEach(daily) { pack in Button { start(pack, title: pack.title) } label: { DeckRow(title: pack.title, subtitle: "\(pack.questions.count) 题", icon: "calendar") } }
                        }
                    }.searchable(text: $query, prompt: "搜索专项练习")
                }
            }.navigationTitle(entry.title).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarLeading) { DeckDismissButton(kind: .back, label: "返回练习", identifier: "practice.back") } }
                .fullScreenCover(item: $round) { NativeQuizView(round: $0) }
                .fullScreenCover(item: $reviewingDraft, onDismiss: {
                    if let pack = confirmedPack { confirmedPack = nil; start(pack, title: pack.title) }
                }) { draft in
                    NativeTopicConfirmationView(draftID: draft.id, isDaily: entry.id == "daily") { confirmedPack = $0 }
                }
        }
    }
    func start(_ pack: NativePack, title: String) { round = NativeRound(title: title, questions: pack.questions.filter(\.isUsable), view: "daily-practice", practiceId: pack.id) }

}
struct NativeRound: Identifiable { let id = UUID(); let title: String; let questions: [NativeQuestion]; var view = "mixed"; var practiceId: String?; var resumeSavedAnswers = false }
struct NativeQuizView: View {
    let round: NativeRound
    var savesProgress = true
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var index = 0
    @State private var restored = false
    @State private var resumedAttemptID: String?
    @State private var selections: [String: String] = [:]
    @State private var attemptAnswers: [NativeAttempt.AttemptAnswer] = []
    @State private var saving = false
    @State private var showingQuestionList = false
    @State private var showingSubmitConfirmation = false
    @State private var finished = false
    @State private var reviewingResults = false
    @State private var reviewOnlyMistakes = true
    @State private var reviewIndex = 0
    @State private var failure: String?
    @State private var attemptStarted = Date.now
    @State private var questionStarted = Date.now
    @State private var elapsed: [String: Int] = [:]
    @State private var batchFeedback = false
    private var question: NativeQuestion? { round.questions.indices.contains(index) ? round.questions[index] : nil }
    private var correct: Int { attemptAnswers.filter(\.correct).count }
    private func recorded(_ question: NativeQuestion) -> NativeAttempt.AttemptAnswer? { attemptAnswers.first { $0.questionId == question.id } }
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if finished {
                    results
                } else if !round.questions.isEmpty {
                    navigation
                    TabView(selection: $index) {
                        ForEach(Array(round.questions.enumerated()), id: \.offset) { number, question in
                            ScrollView { questionCard(question).padding(.horizontal, 16).padding(.vertical, 20).frame(maxWidth: 850).frame(maxWidth: .infinity) }
                                .tag(number).accessibilityIdentifier("quiz.question.\(number)")
                        }
                    }.tabViewStyle(.page(indexDisplayMode: .never)).disabled(saving)
                }
                if let failure { Text(failure).font(.footnote).foregroundStyle(.red).padding(12) }
            }.background(DeckTheme.paper).navigationTitle(round.title).navigationBarTitleDisplayMode(.inline)
                .safeAreaInset(edge: .bottom, spacing: 0) { actions }
                .toolbar { ToolbarItem(placement: .cancellationAction) {
                    DeckDismissButton(kind: .back, label: savesProgress ? "返回练习列表" : "返回发现详情", disabled: saving, identifier: "quiz.back")
                } }
        }.sheet(isPresented: $showingQuestionList) { questionList }
            .alert("确认提交答案？", isPresented: $showingSubmitConfirmation) {
                Button("继续作答", role: .cancel) {
                    if let unanswered = round.questions.indices.first(where: { selections[round.questions[$0].id] == nil }) { index = unanswered }
                }
                Button("确认交卷") { submitBatch() }
            } message: {
                let missing = round.questions.count - selections.count
                Text(missing > 0
                     ? "共 \(round.questions.count) 题，已答 \(selections.count) 题，还有 \(missing) 题未作答。交卷后不能修改答案，未答题计入总题数并标记为未作答。"
                     : "共 \(round.questions.count) 题，已全部作答。交卷后不能修改答案，将显示答案与解析。")
            }
            .interactiveDismissDisabled().onAppear { restoreRound() }
            .onChange(of: index) { old, _ in
                if round.questions.indices.contains(old) {
                    elapsed[round.questions[old].id, default: 0] += max(0, Int(Date.now.timeIntervalSince(questionStarted) * 1000))
                }
                questionStarted = .now; failure = nil
            }
    }
    private var navigation: some View {
        HStack(spacing: 8) {
            Button { withAnimation { index = max(0, index - 1) } } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                .disabled(index == 0 || saving).accessibilityLabel("上一题")
            VStack(spacing: 5) {
                Button { showingQuestionList = true } label: {
                    HStack(spacing: 6) {
                        Text("第 \(index + 1) 题 / 共 \(round.questions.count) 题").font(.subheadline.bold()).monospacedDigit()
                        Image(systemName: "chevron.down").font(.caption.bold())
                    }.frame(minHeight: 30)
                }.buttonStyle(.plain).disabled(saving).accessibilityLabel("题目列表，第 \(index + 1) 题，共 \(round.questions.count) 题")
                    .accessibilityIdentifier("quiz.questionList")
                HStack(spacing: 12) {
                    Text("已选 \(selections.count) 题").font(.caption)
                    TimelineView(.periodic(from: attemptStarted, by: 1)) { timeline in
                        let seconds = max(0, Int(timeline.date.timeIntervalSince(attemptStarted)))
                        Label(String(format: "%02d:%02d", seconds / 60, seconds % 60), systemImage: "timer").font(.caption).monospacedDigit()
                    }
                }.foregroundStyle(DeckTheme.muted)
            }.frame(maxWidth: .infinity)
            Button { withAnimation { index = min(round.questions.count - 1, index + 1) } } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }
                .disabled(index == round.questions.count - 1 || saving).accessibilityLabel("下一题")
        }.foregroundStyle(DeckTheme.green).padding(.horizontal, 8).padding(.vertical, 6)
            .frame(maxWidth: 850).frame(maxWidth: .infinity)
            .background(DeckTheme.green.opacity(0.06))
    }
    private var questionList: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(Array(round.questions.enumerated()), id: \.offset) { number, question in
                        Button {
                            showingQuestionList = false
                            withAnimation { index = number }
                        } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Text("\(number + 1)").font(.subheadline.bold().monospacedDigit())
                                    .frame(width: 32, height: 32)
                                    .background(number == index ? DeckTheme.green.opacity(0.15) : DeckTheme.line.opacity(0.4), in: Circle())
                                VStack(alignment: .leading, spacing: 6) {
                                    JapaneseText(text: question.prompt, japanese: true, allowsRuby: false, annotations: question.japaneseAnnotations ?? [], fontSize: 15).lineLimit(2)
                                    HStack(spacing: 8) {
                                        if number == index { Text("当前题").foregroundStyle(DeckTheme.green) }
                                        Text(selections[question.id] == nil ? "未选" : recorded(question) != nil ? "已确认" : "已选")
                                            .foregroundStyle(DeckTheme.muted)
                                    }.font(.caption)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: selections[question.id] == nil ? "circle" : "checkmark.circle.fill")
                                    .foregroundStyle(selections[question.id] == nil ? DeckTheme.muted : DeckTheme.green)
                            }.padding(.vertical, 4).foregroundStyle(DeckTheme.ink)
                        }.buttonStyle(.plain).accessibilityIdentifier("quiz.jump.\(number)")
                    }
                } header: { Text("共 \(round.questions.count) 题 · 已选 \(selections.count) 题") }
            }.navigationTitle("题目列表").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { showingQuestionList = false } } }
        }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
    }
    private func select(_ choice: String, for question: NativeQuestion) {
        guard !saving, recorded(question) == nil, self.question?.id == question.id else { return }
        selections[question.id] = choice
        guard batchFeedback else { return }
        let remaining = round.questions.indices.filter { selections[round.questions[$0].id] == nil }
        if let next = remaining.first(where: { $0 > index }) ?? remaining.first {
            withAnimation { index = next }
        }
    }
    private func questionCard(_ question: NativeQuestion) -> some View {
        let answer = recorded(question)
        return VStack(alignment: .leading, spacing: 20) {
            JapaneseText(text: question.kind == "kanji_to_kana" ? "请选择下划线词语的读音" : (question.instruction?.isEmpty == false ? question.instruction! : question.title), japanese: true, allowsRuby: false, weight: .semibold)
            if let context = question.context, !context.isEmpty, context != question.prompt { JapaneseText(text: context, japanese: true, allowsRuby: !["kanji_to_kana", "kana_to_kanji"].contains(question.kind) || recorded(question) != nil, annotations: question.japaneseAnnotations ?? []).lineSpacing(7) }
            JapaneseText(text: question.prompt, japanese: true, allowsRuby: !["kanji_to_kana", "kana_to_kanji"].contains(question.kind) || recorded(question) != nil, annotations: question.japaneseAnnotations ?? [], fontSize: 22 * store.textScale, weight: .semibold, target: question.readingTarget).lineSpacing(8).textSelection(.enabled)
            VStack(spacing: 12) {
                ForEach(Array(question.choices.enumerated()), id: \.offset) { number, choice in
                    Button { select(choice, for: question) } label: {
                        StudyAnswerChoice(number: number + 1, text: choice, selected: selections[question.id] == choice,
                                          correct: answer != nil && !batchFeedback ? choice == question.answer : nil,
                                          allowsRuby: !["kanji_to_kana", "kana_to_kanji"].contains(question.kind) || answer != nil, annotations: question.japaneseAnnotations ?? [])
                    }.buttonStyle(.plain).disabled(answer != nil || saving)
                        .accessibilityIdentifier("quiz.choice.\(number)").accessibilityValue(selections[question.id] == choice ? "已选择" : "未选择")
                }
            }
            if let answer, !batchFeedback {
                NativePracticeFeedback(question: question, selected: answer.selected, sourceItem: store.items.first { $0.id == question.itemId }, pending: savesProgress && store.pendingCount > 0)
            }
        }
    }
    @ViewBuilder private var actions: some View {
        if !finished, let question {
            VStack(spacing: 0) {
                Divider()
                if batchFeedback {
                    Button(saving ? "正在交卷…" : "交卷并查看答案（\(selections.count)/\(round.questions.count)）") { showingSubmitConfirmation = true }
                        .buttonStyle(PrimaryButton()).disabled(saving)
                        .accessibilityIdentifier("quiz.submit")
                        .padding(.horizontal, 16).padding(.vertical, 10)
                } else {
                    HStack(spacing: 12) {
                        if recorded(question) == nil {
                            Button(saving ? "正在保存…" : "确认答案") { confirm(question) }
                                .buttonStyle(PrimaryButton()).disabled(selections[question.id] == nil || saving).accessibilityIdentifier("quiz.confirm")
                        }
                        if attemptAnswers.count == round.questions.count {
                            Button("查看结果") { finished = true }.buttonStyle(PrimaryButton()).accessibilityIdentifier("quiz.next")
                        } else if recorded(question) != nil {
                            Button("下一题") { withAnimation { index = round.questions.indices.first { selections[round.questions[$0].id] == nil || recorded(round.questions[$0]) == nil } ?? index } }
                                .buttonStyle(PrimaryButton()).accessibilityIdentifier("quiz.next")
                        }
                    }.padding(.horizontal, 16).padding(.vertical, 10)
                }
            }.frame(maxWidth: 850).frame(maxWidth: .infinity).background(DeckTheme.paper)
        }
    }
    private var reviewQuestions: [Int] {
        round.questions.indices.filter { !reviewOnlyMistakes || recorded(round.questions[$0])?.correct != true }
    }
    private var unansweredCount: Int { round.questions.filter { recorded($0) == nil }.count }
    private func beginReview(onlyMistakes: Bool) {
        reviewOnlyMistakes = onlyMistakes
        reviewIndex = 0
        reviewingResults = true
    }
    @ViewBuilder private var results: some View {
        if reviewingResults {
            resultReview
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(spacing: 12) {
                        CompanionAvatar(motion: correct == round.questions.count && correct > 0 ? .celebrate : .wave, size: 112)
                            .frame(width: 112, height: 112).accessibilityHidden(true)
                        Label("本轮练习完成", systemImage: "checkmark.seal.fill")
                            .font(.title2.bold()).foregroundStyle(DeckTheme.green)
                        Text(round.questions.isEmpty ? "准备好了，随时开始" : correct == round.questions.count ? "全对，做得漂亮！" : correct > 0 ? "每一次练习，都在向前一步" : "愿意练习，就是进步的开始")
                            .font(.title3.bold()).multilineTextAlignment(.center)
                        Text(round.questions.isEmpty ? "选一组题目，开启今天的积累。" : correct == round.questions.count ? "这一轮的努力收获满满。回顾一下，让知识记得更牢。" : "错题帮你找到下一步的方向。一起把还不熟悉的地方练扎实。")
                            .font(.subheadline).foregroundStyle(DeckTheme.muted).multilineTextAlignment(.center)
                    }.frame(maxWidth: .infinity).padding(.vertical, 12)
                    VStack(spacing: 18) {
                        Text("\(correct) / \(round.questions.count) 题正确").font(.title.bold()).monospacedDigit()
                        HStack(spacing: 12) {
                            resultMetric("正确", count: correct, icon: "checkmark.circle.fill", color: DeckTheme.green)
                            Spacer(minLength: 0)
                            resultMetric("错误", count: round.questions.count - correct - unansweredCount, icon: "arrow.counterclockwise.circle.fill", color: DeckTheme.accent)
                            Spacer(minLength: 0)
                            resultMetric("未答", count: unansweredCount, icon: "minus.circle", color: DeckTheme.muted)
                        }
                    }.padding(20).frame(maxWidth: .infinity)
                        .background(DeckTheme.green.opacity(0.06), in: RoundedRectangle(cornerRadius: 20))
                    if unansweredCount > 0 { Text("只看错题也包含未作答的题目。").font(.footnote).foregroundStyle(DeckTheme.muted) }
                    if correct < round.questions.count {
                        Button { beginReview(onlyMistakes: true) } label: { Label("只看错题（\(round.questions.count - correct)）", systemImage: "arrow.counterclockwise") }
                            .buttonStyle(PrimaryButton()).accessibilityIdentifier("quiz.review.mistakes")
                    }
                    if !round.questions.isEmpty {
                        Button { beginReview(onlyMistakes: false) } label: { Label("查看全部解析（\(round.questions.count)）", systemImage: "text.book.closed") }
                            .buttonStyle(PrimaryButton()).accessibilityIdentifier("quiz.review.all")
                    }
                    Button(savesProgress ? "返回练习列表" : "返回发现详情") { dismiss() }
                        .frame(maxWidth: .infinity, minHeight: 44)
                }.frame(maxWidth: 850).padding(20).frame(maxWidth: .infinity)
            }.accessibilityIdentifier("quiz.results.summary")
        }
    }
    private func resultMetric(_ title: String, count: Int, icon: String, color: Color) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(.title3).foregroundStyle(color).accessibilityHidden(true)
            Text("\(count)").font(.title3.bold()).monospacedDigit()
            Text(title).font(.caption).foregroundStyle(DeckTheme.muted)
        }.accessibilityElement(children: .ignore).accessibilityLabel("\(title) \(count) 题")
    }
    private var resultReview: some View {
        VStack(spacing: 0) {
            VStack(spacing: 12) {
                HStack {
                    Button("返回总结") { reviewingResults = false }
                        .accessibilityIdentifier("quiz.review.summary")
                    Spacer()
                    Text("逐题解析").font(.headline)
                }
                Picker("解析范围", selection: Binding(get: { reviewOnlyMistakes }, set: { value in
                    reviewIndex = 0
                    reviewOnlyMistakes = value
                })) {
                    Text("只看错题（\(round.questions.count - correct)）").tag(true)
                    Text("全部（\(round.questions.count)）").tag(false)
                }.pickerStyle(.segmented).accessibilityIdentifier("quiz.review.filter")
            }.padding(16).frame(maxWidth: 850)
            if reviewQuestions.isEmpty {
                ContentUnavailableView("没有错题", systemImage: "checkmark.circle", description: Text("本轮全部答对了，可以切换到全部查看解析。"))
            } else {
                TabView(selection: $reviewIndex) {
                    ForEach(Array(reviewQuestions.enumerated()), id: \.element) { position, originalIndex in
                        ScrollView {
                            reviewCard(round.questions[originalIndex], number: originalIndex + 1)
                                .padding(20).frame(maxWidth: 850).frame(maxWidth: .infinity)
                        }.tag(position).accessibilityIdentifier("quiz.review.question.\(originalIndex)")
                    }
                }.tabViewStyle(.page(indexDisplayMode: .never)).id(reviewOnlyMistakes)
                HStack {
                    Button { withAnimation { reviewIndex -= 1 } } label: {
                        Label("上一题", systemImage: "chevron.left").frame(minHeight: 44)
                    }.disabled(reviewIndex == 0)
                    Spacer()
                    VStack(spacing: 4) {
                        Text("\(reviewIndex + 1) / \(reviewQuestions.count)").monospacedDigit()
                        Text("左右滑动切换题目").font(.caption).foregroundStyle(DeckTheme.muted)
                    }
                    Spacer()
                    Button { withAnimation { reviewIndex += 1 } } label: {
                        Label("下一题", systemImage: "chevron.right").frame(minHeight: 44)
                    }.disabled(reviewIndex >= reviewQuestions.count - 1)
                }.padding(.horizontal, 20).padding(.vertical, 8).frame(maxWidth: 850)
            }
        }
    }
    private func reviewCard(_ question: NativeQuestion, number: Int) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("原题第 \(number) 题").font(.subheadline.bold()).foregroundStyle(DeckTheme.muted)
            JapaneseText(text: question.instruction?.isEmpty == false ? question.instruction! : question.title, japanese: true, weight: .semibold)
            if let context = question.context, !context.isEmpty, context != question.prompt { JapaneseText(text: context, japanese: true, allowsRuby: !["kanji_to_kana", "kana_to_kanji"].contains(question.kind) || recorded(question) != nil, annotations: question.japaneseAnnotations ?? []).lineSpacing(7) }
            JapaneseText(text: question.prompt, japanese: true, allowsRuby: !["kanji_to_kana", "kana_to_kanji"].contains(question.kind) || recorded(question) != nil, annotations: question.japaneseAnnotations ?? [], fontSize: 22 * store.textScale, weight: .semibold, target: question.readingTarget).lineSpacing(8).textSelection(.enabled)
            ForEach(Array(question.choices.enumerated()), id: \.offset) { number, choice in
                StudyAnswerChoice(number: number + 1, text: choice, selected: recorded(question)?.selected == choice,
                                  correct: choice == question.answer, annotations: question.japaneseAnnotations ?? [])
            }
            NativePracticeFeedback(question: question, selected: recorded(question)?.selected ?? "", sourceItem: store.items.first { $0.id == question.itemId }, pending: recorded(question) != nil && savesProgress && store.pendingCount > 0)
        }
    }
    private func restoreRound() {
        guard !restored else { return }; restored = true
        batchFeedback = store.state.settings?["feedbackMode"] == .string("batch")
        guard round.resumeSavedAnswers, savesProgress else { return }
        let existing = (store.state.attemptHistory ?? []).first { $0.practiceId == round.practiceId }
        resumedAttemptID = existing?.id
        if let started = existing.flatMap({ StudyDates.parse($0.startedAt) }) { attemptStarted = started }
        attemptAnswers = round.questions.compactMap { question in
            if let existing { return existing.answers.first { $0.questionId == question.id } }
            guard let answer = store.state.answers[question.id] else { return nil }
            return existing?.answers.first { $0.questionId == question.id } ?? .init(questionId: question.id, itemId: question.itemId, kind: question.kind, selected: answer.selected, correct: answer.correct, answeredAt: answer.answeredAt ?? attemptStarted.ISO8601Format(), elapsedMs: 0)
        }
        selections = Dictionary(attemptAnswers.map { ($0.questionId, $0.selected) }, uniquingKeysWith: { _, last in last })
        index = round.questions.indices.first { selections[round.questions[$0].id] == nil } ?? 0
        finished = existing?.completedAt != nil
    }
    private func answer(_ question: NativeQuestion, selected: String, now: Date) -> NativeAttempt.AttemptAnswer {
        let activeMs = self.question?.id == question.id ? max(0, Int(now.timeIntervalSince(questionStarted) * 1000)) : 0
        return .init(questionId: question.id, itemId: question.itemId, kind: question.kind, selected: selected, correct: selected == question.answer,
                     startedAt: attemptStarted.ISO8601Format(), answeredAt: now.ISO8601Format(), elapsedMs: (elapsed[question.id] ?? 0) + activeMs)
    }
    private func attempt(_ answers: [NativeAttempt.AttemptAnswer], now: Date, submitted: Bool = false) -> NativeAttempt {
        let complete = submitted || answers.count == round.questions.count
        let correct = answers.filter(\.correct).count
        return NativeAttempt(id: resumedAttemptID ?? "native-\(round.id.uuidString)", title: round.title, practiceId: round.practiceId,
                             startedAt: attemptStarted.ISO8601Format(), completedAt: complete ? now.ISO8601Format() : nil, view: round.view, deck: "all",
                             questionIds: round.questions.map(\.id), answers: answers,
                             summary: complete ? .init(total: round.questions.count, correct: correct, wrong: round.questions.count - correct,
                                                       accuracy: Double(correct) / Double(max(1, round.questions.count)) * 100, elapsedMs: answers.reduce(0) { $0 + $1.elapsedMs }) : nil)
    }
    private func confirm(_ question: NativeQuestion) {
        guard let selected = selections[question.id], !saving, recorded(question) == nil else { return }
        saving = true; failure = nil
        Task {
            defer { saving = false }
            do {
                let now = Date.now
                let answers = attemptAnswers + [answer(question, selected: selected, now: now)]
                if savesProgress { try await store.submitNativeQuestion(question, selected: selected, attempt: attempt(answers, now: now)) }
                attemptAnswers = answers
            } catch { failure = error.localizedDescription }
        }
    }
    private func submitBatch() {
        guard !saving, !finished else { return }
        saving = true; failure = nil
        defer { saving = false }
        do {
            let now = Date.now
            let answers = round.questions.compactMap { question -> NativeAttempt.AttemptAnswer? in
                guard let selected = selections[question.id] else { return nil }
                return recorded(question) ?? answer(question, selected: selected, now: now)
            }
            let result = attempt(answers, now: now, submitted: true)
            if savesProgress && !(resumedAttemptID == nil && attemptAnswers.count == round.questions.count) {
                try store.submitNativeBatch(questions: round.questions, attempt: result, allowUnanswered: true)
            }
            attemptAnswers = answers; finished = true
        } catch { failure = error.localizedDescription }
    }
}

extension AppStore {
    func submitNativeQuestion(_ question: NativeQuestion, selected: String, attempt: NativeAttempt? = nil) async throws {
        guard question.choices.contains(selected) else { throw IdentityError.message("请选择有效选项。") }
        let progress = (state.progress[question.itemId] ?? ProgressEntry()).afterPractice(correct: selected == question.answer)
        try saveAnswerLocally(questionID: question.id, itemID: question.itemId, selected: selected,
                              correct: selected == question.answer, progress: progress, attempt: attempt)

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

struct PracticeExcerpt {
    let summary: String
    let hasMore: Bool
    init(_ text: String?, limit: Int = 180) {
        let normalized = (text ?? "").replacingOccurrences(of: "\\r\\n", with: "\n").replacingOccurrences(of: "\\n", with: "\n")
            .replacingOccurrences(of: "\\r", with: "\n").replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        let line = normalized.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: #"^#{1,6}\s+|^【[^】]{1,24}】\s*"#, with: "", options: .regularExpression) }.first { !$0.isEmpty } ?? ""
        let sentence = line.range(of: #"^.*?[。！？](?:[」』）])?"#, options: .regularExpression).map { String(line[$0]) } ?? line
        summary = sentence.count > limit ? String(sentence.prefix(limit)).trimmingCharacters(in: .whitespaces) + "…" : sentence
        hasMore = normalized.trimmingCharacters(in: .whitespacesAndNewlines) != summary
    }
}

extension NativeQuestion {
    // Canonical options determine order and correctness, including older synced packs.
    var explanationDetails: (reason: String, choices: [Analysis]) {
        let combined = (correctReason ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let regex = try! NSRegularExpression(pattern: "「([^」]+)」\\s*[：:]")
        let range = NSRange(combined.startIndex..., in: combined)
        let markers = regex.matches(in: combined, range: range).filter {
            guard let range = Range($0.range(at: 1), in: combined) else { return false }
            return choices.contains(String(combined[range]))
        }
        var reasons: [String: String] = [:]
        for (index, marker) in markers.enumerated() {
            let name = String(combined[Range(marker.range(at: 1), in: combined)!])
            let start = marker.range.location + marker.range.length
            let end = index + 1 < markers.count ? markers[index + 1].range.location : (combined as NSString).length
            reasons[name] = (combined as NSString).substring(with: NSRange(location: start, length: end - start)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let reason = markers.first.map { (combined as NSString).substring(to: $0.range.location).trimmingCharacters(in: .whitespacesAndNewlines) } ?? combined
        return (reason.isEmpty ? combined : reason, choices.map { choice in
            let existing = choiceAnalysis?.first { $0.choice == choice }?.explanation.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let placeholder = existing.range(of: #"^(?:「[^」]+」)?(?:不符合本题(?:目标|语境)|是本题正确答案|是正确答案|与本题要求的词义、读音或句子结构不一致)[。！]?$"#, options: .regularExpression) != nil
            let detail = !existing.isEmpty && !placeholder && existing != combined ? existing : reasons[choice] ?? (choice == answer && !reason.isEmpty ? reason : existing)
            return Analysis(choice: choice, correct: choice == answer, explanation: detail)
        })
    }
}

struct NativePracticeFeedback: View {
    @Environment(AppStore.self) private var store
    let question: NativeQuestion
    let selected: String
    var sourceItem: StudyItem?
    var pending = false
    @State private var choicesExpanded = false
    @State private var reasonExpanded = false
    @State private var memoryExpanded = false
    @State private var translationExpanded = false
    @State private var entryExpanded = false
    private var right: Bool { selected == question.answer }
    var body: some View {
        let details = question.explanationDetails
        let evidence = PracticeExcerpt(details.reason)
        let memory = PracticeExcerpt(question.memoryPoint, limit: 120)
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 12) {
                Label(selected.isEmpty ? "未作答" : right ? "回答正确" : "回答错误", systemImage: selected.isEmpty ? "minus.circle" : right ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .font(.title3.bold()).foregroundStyle(right ? DeckTheme.green : DeckTheme.accent)
                if !selected.isEmpty { JapaneseText(text: "你的答案：\(selected)", item: sourceItem, annotations: question.japaneseAnnotations ?? []).foregroundStyle(DeckTheme.muted) }
                Divider()
                Text("正确答案").font(.caption).foregroundStyle(DeckTheme.muted)
                JapaneseText(text: "\((question.choices.firstIndex(of: question.answer) ?? 0) + 1). \(question.answer)", item: sourceItem, japanese: true, annotations: question.japaneseAnnotations ?? [], weight: .semibold)
            }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
                .background((right ? DeckTheme.green : DeckTheme.accent).opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                .accessibilityIdentifier("quiz.outcome")
            if pending { Text("已保存到本机，等待同步").font(.caption).foregroundStyle(DeckTheme.muted) }
            if !evidence.summary.isEmpty { section("解题依据", text: evidence.summary) }
            if !memory.summary.isEmpty {
                section("记忆点", text: memory.summary).padding(14).frame(maxWidth: .infinity, alignment: .leading)
                    .background(DeckTheme.green.opacity(0.08), in: RoundedRectangle(cornerRadius: 6))
            }
            VStack(alignment: .leading, spacing: 0) {
                if evidence.hasMore {
                    disclosure("完整解题依据", expanded: $reasonExpanded) { JapaneseText(text: details.reason, item: sourceItem, explanation: true, annotations: question.japaneseAnnotations ?? []).lineSpacing(6) }
                }
                disclosure("选项辨析 · \(details.choices.count)", expanded: $choicesExpanded) {
                    ForEach(Array(details.choices.enumerated()), id: \.offset) { index, analysis in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .firstTextBaseline) {
                                JapaneseText(text: "\(index + 1). \(analysis.choice)", item: sourceItem, japanese: true, annotations: question.japaneseAnnotations ?? [], weight: .semibold)
                                Spacer(minLength: 4)
                                Text(analysis.correct ? "正确选项" : analysis.choice == selected ? "你的答案" : "不符合题意")
                                    .font(.caption).foregroundStyle(analysis.correct ? DeckTheme.green : analysis.choice == selected ? DeckTheme.accent : DeckTheme.muted)
                            }
                            JapaneseText(text: analysis.explanation.isEmpty ? "暂无该选项的详细解析" : analysis.explanation, item: sourceItem, explanation: true, annotations: question.japaneseAnnotations ?? []).lineSpacing(6)
                        }.padding(.vertical, 12).overlay(alignment: .bottom) { Rectangle().fill(DeckTheme.line).frame(height: 1) }
                    }
                }.accessibilityIdentifier("quiz.analysis")
                if memory.hasMore { disclosure("展开记忆点", expanded: $memoryExpanded) { JapaneseText(text: question.memoryPoint ?? "", item: sourceItem, explanation: true, annotations: question.japaneseAnnotations ?? []).lineSpacing(6) } }
                if let translation = question.translationZh, !translation.isEmpty {
                    disclosure("完整中文翻译", expanded: $translationExpanded) { Text(translation).lineSpacing(6) }.accessibilityIdentifier("quiz.translation")
                }
                if let item = sourceItem {
                    disclosure("查看词条：\(item.original)", expanded: $entryExpanded) {
                        NavigationLink("查看词条：\(item.original)") { ItemDetailView(item: item) }
                    }
                }
            }
            if sourceItem?.content_origin == "ai_generated" && sourceItem?.verification_status != "verified" {
                Text("AI 生成 · 待核验").font(.caption).foregroundStyle(DeckTheme.muted)
            }
        }.textSelection(.enabled).accessibilityIdentifier("quiz.feedback")
    }
    private func section(_ title: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) { Text(title).font(.headline).foregroundStyle(DeckTheme.green); JapaneseText(text: text, item: sourceItem, explanation: true, annotations: question.japaneseAnnotations ?? []).lineSpacing(6) }
    }
    private func disclosure<Content: View>(_ title: String, expanded: Binding<Bool>, @ViewBuilder content: @escaping () -> Content) -> some View {
        DisclosureGroup(isExpanded: expanded) { content().padding(.bottom, 12).frame(maxWidth: .infinity, alignment: .leading) }
            label: { Text(title).font(.subheadline.weight(.semibold)).frame(minHeight: 44) }
            .tint(DeckTheme.green).padding(.vertical, 4).overlay(alignment: .top) { Rectangle().fill(DeckTheme.line).frame(height: 1) }
    }
}

// Reuse the exam runner so papers, schedules and submission rules match the web client.
struct NativeMockExamView: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        NavigationStack {
            Group {
                if store.isDemo {
                    ContentUnavailableView("模拟考试", systemImage: "doc.badge.clock", description: Text("登录后查看账户里的试卷和考试安排。"))
                } else if let token = store.session?.token {
                    NativeExamWebView(token: token, accountID: store.session!.user.id)
                }
            }.navigationTitle("模拟考试").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarLeading) { DeckDismissButton(kind: .back, label: "返回练习", identifier: "practice.back") } }
        }
    }
}
struct NativeExamWebView: UIViewRepresentable {
    let token: String
    let accountID: Int
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let digest = SHA256.hash(data: Data("jlpt-native-exams-\(accountID)".utf8)).prefix(16).map { String(format: "%02x", $0) }.joined()
        let chars = Array(digest)
        let identifier = [String(chars[0..<8]), String(chars[8..<12]), String(chars[12..<16]), String(chars[16..<20]), String(chars[20..<32])].joined(separator: "-")
        configuration.websiteDataStore = WKWebsiteDataStore(forIdentifier: UUID(uuidString: identifier)!)
        let encoded = String(data: try! JSONEncoder().encode(token), encoding: .utf8)!
        let origin = APIClient.origin.absoluteString
        configuration.userContentController.addUserScript(WKUserScript(source: "if (location.origin === '\(origin)') { localStorage.setItem('jlpt-auth-token-v1', \(encoded)); }", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.load(URLRequest(url: URL(string: origin + "/#/mock-exams")!))
        return view
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator() }
    final class Coordinator: NSObject, WKNavigationDelegate {
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if url.host == APIClient.origin.host && url.scheme == "https" { decisionHandler(.allow) }
            else { decisionHandler(.cancel); if ["https", "http"].contains(url.scheme ?? "") { UIApplication.shared.open(url) } }
        }
    }
}

struct NativeTopicDraft: Decodable {
    let id: String
    let title: String
    let status: String
    let content: [String: SettingValue]
    let updated_at: String
    var created_at: String?
    var approved: Bool { status == "approved" || status == "archived" }
    var sectionQuestions: [SettingValue] {
        for key in ["generated_practice", "quiz", "practice_questions", "review_questions"] {
            if case .array(let questions) = content[key], !questions.isEmpty { return questions }
        }
        guard case .array(let sections) = content["sections"] else { return [] }
        return sections.flatMap { section -> [SettingValue] in
            guard case .object(let fields) = section, case .array(let questions) = fields["questions"] else { return [] }
            return questions
        }
    }
    var canPublish: Bool { !sectionQuestions.isEmpty }
}

/// Present authored questions as study content, without exposing storage field names.
private enum DraftPresentation {
    static func text(_ value: SettingValue?) -> String? {
        guard case .string(let text) = value, !text.isEmpty else { return nil }
        return text
    }
    static func text(_ fields: [String: SettingValue], _ keys: String...) -> String? {
        keys.compactMap { text(fields[$0]) }.first
    }
    static func array(_ value: SettingValue?) -> [SettingValue] {
        guard case .array(let values) = value else { return [] }
        return values
    }
    static func fields(_ value: SettingValue) -> [String: SettingValue] {
        guard case .object(let fields) = value else { return [:] }
        return fields
    }
}

private struct NativeDraftQuestion: View {
    let fields: [String: SettingValue]
    let number: Int
    private var choices: [SettingValue] { DraftPresentation.array(fields["choices"]) }
    private var answer: String? {
        if let answer = DraftPresentation.text(fields, "answer") { return answer }
        if case .number(let number) = fields["answer"], number.rounded() == number,
           number >= 1, number <= Double(choices.count) {
            return choice(choices[Int(number) - 1])
        }
        if case .number(let index) = fields["answerIndex"], index.rounded() == index,
           index >= 0, index < Double(choices.count) {
            return choice(choices[Int(index)])
        }
        return nil
    }
    private func choice(_ value: SettingValue) -> String {
        DraftPresentation.text(value) ?? DraftPresentation.text(DraftPresentation.fields(value), "text", "label", "choice") ?? ""
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("第 \(number) 题").font(.caption.bold()).foregroundStyle(DeckTheme.muted)
            if let instruction = DraftPresentation.text(fields, "instruction") {
                Text(instruction).font(.subheadline).foregroundStyle(DeckTheme.muted)
            }
            if let context = DraftPresentation.text(fields, "context", "passage") { JapaneseText(text: context, japanese: true) }
            JapaneseText(text: DraftPresentation.text(fields, "prompt", "question", "title") ?? "题目内容待补充", japanese: true)
                .font(.headline).fixedSize(horizontal: false, vertical: true)
            ForEach(choices.indices, id: \.self) { index in
                HStack(alignment: .top, spacing: 12) {
                    Text("\(index + 1)").font(.subheadline.monospacedDigit()).foregroundStyle(DeckTheme.muted)
                        .frame(width: 24)
                    JapaneseText(text: choice(choices[index]), japanese: true).frame(maxWidth: .infinity, alignment: .leading)
                }.padding(12).background(DeckTheme.green.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
            }
            DisclosureGroup("答案与解析") {
                VStack(alignment: .leading, spacing: 12) {
                    if let answer { JapaneseText(text: "正确答案：" + answer, weight: .semibold).foregroundStyle(DeckTheme.green) }
                    if let explanation = DraftPresentation.text(fields, "explanation_zh", "explanation", "correctReason") { JapaneseText(text: explanation, explanation: true) }
                    if let translation = DraftPresentation.text(fields, "translationZh", "translation_zh") {
                        Text("译文").font(.caption.bold()).foregroundStyle(DeckTheme.muted)
                        Text(translation)
                    }
                    let analysis = DraftPresentation.array(fields["choiceAnalysis"])
                    ForEach(analysis.indices, id: \.self) { index in
                        let item = DraftPresentation.fields(analysis[index])
                        VStack(alignment: .leading, spacing: 4) {
                            if let choice = DraftPresentation.text(item, "choice") { JapaneseText(text: choice, japanese: true, weight: .semibold) }
                            if let reason = DraftPresentation.text(item, "explanation", "reason") { JapaneseText(text: reason, explanation: true) }
                        }
                    }
                    if let memory = DraftPresentation.text(fields, "memoryPoint") { JapaneseText(text: memory, explanation: true).foregroundStyle(DeckTheme.green) }
                }.padding(.top, 10).frame(maxWidth: .infinity, alignment: .leading)
            }.tint(DeckTheme.green)
        }.textSelection(.enabled).padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(.background, in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct NativeDraftContent: View {
    let draft: NativeTopicDraft
    @State private var page = 0
    private var cards: [(section: String?, instruction: String?, fields: [String: SettingValue])] {
        for key in ["generated_practice", "quiz", "practice_questions", "review_questions"] {
            let questions = DraftPresentation.array(draft.content[key])
            if !questions.isEmpty {
                return questions.map { (section: nil, instruction: nil, fields: DraftPresentation.fields($0)) }
            }
        }
        return DraftPresentation.array(draft.content["sections"]).flatMap { value in
            let section = DraftPresentation.fields(value)
            return DraftPresentation.array(section["questions"]).map {
                (section: DraftPresentation.text(section, "title"),
                 instruction: DraftPresentation.text(section, "instruction", "description"),
                 fields: DraftPresentation.fields($0))
            }
        }
    }
    var body: some View {
        VStack(spacing: 8) {
            if cards.isEmpty {
                ContentUnavailableView("题目待整理", systemImage: "doc.text", description: Text("这份草稿尚未整理为完整题组。"))
            } else {
                HStack {
                    Button { withAnimation { page = max(0, page - 1) } } label: {
                        Image(systemName: "chevron.left").frame(width: 44, height: 44)
                    }.disabled(page == 0).accessibilityLabel("上一题")
                    Spacer()
                    Text("第 \(page + 1) 题 / 共 \(cards.count) 题").font(.subheadline.monospacedDigit()).foregroundStyle(DeckTheme.muted)
                    Spacer()
                    Button { withAnimation { page = min(cards.count - 1, page + 1) } } label: {
                        Image(systemName: "chevron.right").frame(width: 44, height: 44)
                    }.disabled(page >= cards.count - 1).accessibilityLabel("下一题")
                }.padding(.horizontal, 20).frame(maxWidth: 650)
                TabView(selection: $page) {
                    ForEach(cards.indices, id: \.self) { index in
                        ScrollView {
                            VStack(alignment: .leading, spacing: 12) {
                                if let title = cards[index].section { Text(title).font(.subheadline.bold()).foregroundStyle(DeckTheme.muted) }
                                if let instruction = cards[index].instruction { Text(instruction).font(.subheadline).foregroundStyle(DeckTheme.muted) }
                                NativeDraftQuestion(fields: cards[index].fields, number: index + 1)
                            }.padding(.horizontal, 20).padding(.vertical, 8)
                                .frame(maxWidth: 650).frame(maxWidth: .infinity)
                        }.tag(index).accessibilityIdentifier("draft.question.\(index)")
                    }
                }.tabViewStyle(.page(indexDisplayMode: .never))

            }
        }.onChange(of: draft.updated_at) { _, _ in page = min(page, max(0, cards.count - 1)) }
    }
}

struct NativeTopicConfirmationView: View {
    let draftID: String
    var isDaily = false
    let onStart: (NativePack) -> Void
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var draft: NativeTopicDraft?
    @State private var busy = false
    @State private var failure: String?
    private struct Envelope: Decodable { let draft: NativeTopicDraft }
    private struct Acknowledgment: Decodable { }
    private var path: String { "api/drafts/\(draftID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? draftID)" }
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 8) {
                if let draft {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(draft.title).font(.headline).lineLimit(2)
                        Text(draft.approved ? "已确认" : "待确认")
                            .font(.caption).foregroundStyle(DeckTheme.muted)
                    }.padding(.horizontal, 20).padding(.top, 12)
                    NativeDraftContent(draft: draft)
                }
                if !store.isOnline { Text("联网后可确认并保存").font(.caption).foregroundStyle(DeckTheme.muted).padding(.horizontal, 20) }
                if busy { ProgressView("正在处理…").frame(maxWidth: .infinity) }
                if let failure {
                    Text(failure).font(.caption).foregroundStyle(.red).padding(.horizontal, 20)
                    Button("重新加载") { Task { await load() } }.disabled(busy).padding(.horizontal, 20)
                }
                if draft == nil { Spacer() }
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(DeckTheme.paper).navigationTitle(isDaily ? "确认今日练习" : "确认专项练习").navigationBarTitleDisplayMode(.inline)
                .safeAreaInset(edge: .bottom) {
                    if let draft {
                        VStack(spacing: 0) {
                            if !draft.approved {
                                Button(busy ? "正在确认…" : "确认题目") {
                                    guard !busy else { return }
                                    busy = true
                                    Task { await confirm() }
                                }.buttonStyle(PrimaryButton())
                                    .disabled(busy || !store.isOnline || draft.sectionQuestions.isEmpty).accessibilityIdentifier("topic.confirm")
                            } else if draft.canPublish {
                                Button(busy ? "正在准备…" : "开始练习") {
                                    guard !busy else { return }
                                    busy = true
                                    Task { await publish() }
                                }.buttonStyle(PrimaryButton())
                                    .disabled(busy || !store.isOnline).accessibilityIdentifier("topic.publish")
                            }
                        }.frame(maxWidth: 850).padding(.horizontal, 20).padding(.vertical, 12)
                            .frame(maxWidth: .infinity).background(DeckTheme.paper)
                    }
                }
                .toolbar { ToolbarItem(placement: .topBarLeading) { Button("返回") { dismiss() }.disabled(busy) } }
        }.task { await load() }.interactiveDismissDisabled(busy)
    }
    private func load() async {
        busy = true; failure = nil
        defer { busy = false }
        do { let result: Envelope = try await store.api.get(path); draft = result.draft }
        catch { failure = error.localizedDescription }
    }
    private func confirm() async {
        guard let reviewed = draft else { busy = false; return }
        let client = store.api
        let token = store.session?.token
        busy = true; failure = nil
        defer { busy = false }
        do {
            let latest: Envelope = try await client.get(path)
            guard store.session?.token == token else { throw CancellationError() }
            if latest.draft.approved {
                draft = latest.draft
                try await store.cacheTopicDraft(latest.draft)
                return
            }
            guard latest.draft.updated_at == reviewed.updated_at else {
                draft = latest.draft
                throw IdentityError.message("这份练习已在其他端更新，请重新检查后确认。")
            }
            struct Input: Encodable { let unknownWords: String }
            let _: Acknowledgment = try await client.post(path + "/confirm", body: Input(unknownWords: ""))
            let result: Envelope = try await client.get(path)
            guard store.session?.token == token else { throw CancellationError() }
            draft = result.draft
            try await store.cacheTopicDraft(result.draft)
        } catch { failure = error.localizedDescription }
    }
    private func publish() async {
        let client = store.api
        let token = store.session?.token
        busy = true; failure = nil
        defer { busy = false }
        do {
            struct Input: Encodable { let date: String; let title: String }
            struct Result: Decodable { let practice: NativePack }
            let result: Result = try await client.post(path + "/publish-daily-practice", body: Input(date: StudyDates.day(), title: draft?.title ?? "专项练习"))
            let latest: Envelope = try await client.get(path)
            guard store.session?.token == token else { throw CancellationError() }
            draft = latest.draft
            try await store.cacheTopicDraft(latest.draft, practice: result.practice)
            dismiss()
            onStart(result.practice)
        } catch { failure = error.localizedDescription }
    }
}
