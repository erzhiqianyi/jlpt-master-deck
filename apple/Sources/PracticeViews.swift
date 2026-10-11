import SwiftUI

/// 練習タブ：端末に入っている練習（毎日・テーマ別・模擬）はオフラインでも解ける。抽題はオンラインのときだけ。
struct PracticeHomeView: View {
    @Environment(AppStore.self) private var store
    @State private var runner: String?
    @State private var starting: String?
    private let modules = ["vocabulary", "grammar", "reading", "listening"]
    var body: some View {
        List {
            SyncStatusBar()
            if !store.activeAttempts.isEmpty {
                Section("进行中") {
                    ForEach(store.activeAttempts) { attempt in
                        Button { runner = attempt.clientKey } label: {
                            DeckRow(title: attempt.title, subtitle: String(localized: "已答 \(attempt.answeredCount) / \(attempt.items.count)"), icon: "play.circle")
                        }.buttonStyle(.plain)
                    }
                }
            }
            Section("抽题练习（需要联网）") {
                ForEach([nil] + modules.map(Optional.some), id: \.self) { module in
                    Button { Task { await draw(module) } } label: {
                        HStack {
                            DeckRow(title: module.map { ModuleNames.title($0) + String(localized: "练习") } ?? String(localized: "综合练习"), subtitle: String(localized: "从审查通过的题目里抽 10 题"), icon: "shuffle", showsChevron: false)
                            if starting == (module ?? "mixed") { ProgressView() }
                        }
                    }.buttonStyle(.plain).disabled(!store.isOnline || store.isDemo || starting != nil)
                        .accessibilityIdentifier("practice.draw.\(module ?? "mixed")")
                }
            }
            ForEach([("daily", String(localized: "每日练习")), ("topic", String(localized: "专项练习")), ("mock", String(localized: "模拟考试")), ("mixed", String(localized: "其他练习"))], id: \.0) { kind, title in
                let sets = store.practiceSets.filter { $0.kind == kind }
                if !sets.isEmpty {
                    Section(title) {
                        ForEach(sets) { set in
                            Button { open(set.code) } label: {
                                DeckRow(title: set.title.text.isEmpty ? set.code : set.title.text,
                                        subtitle: [set.date, String(localized: "\(set.questionCount) 题"), set.completedCount > 0 ? String(localized: "完成 \(set.completedCount) 次") : nil, store.bundle(set.code) == nil ? String(localized: "未下载") : nil].compactMap { $0 }.joined(separator: " · "),
                                        icon: kind == "mock" ? "doc.text.magnifyingglass" : "doc.text")
                            }.buttonStyle(.plain).accessibilityIdentifier("practice.set.\(set.code)")
                        }
                    }
                }
            }
            if store.practiceSets.isEmpty {
                Text("还没有练习。可以让 AI 按你的情况出题（create_practice_set），同步后会出现在这里。").foregroundStyle(DeckTheme.muted)
            }
            if !store.finishedAttempts.isEmpty {
                Section("最近完成") {
                    ForEach(store.finishedAttempts.prefix(10)) { attempt in
                        NavigationLink(value: PracticeSummaryRoute(key: attempt.clientKey)) {
                            DeckRow(title: attempt.title, subtitle: String(localized: "答对 \(attempt.correctCount) / \(attempt.scoredCount)"), icon: "checkmark.circle", showsChevron: false)
                        }
                    }
                }
            }
        }
        .navigationTitle("练习")
        .refreshable { await store.refresh() }
        .navigationDestination(item: $runner) { PracticeRunnerView(attemptKey: $0) }
        .navigationDestination(for: PracticeSummaryRoute.self) { PracticeSummaryView(attemptKey: $0.key) }
    }
    private func open(_ code: String) {
        do { runner = try store.startPractice(code) } catch { store.handle(error) }
    }
    private func draw(_ module: String?) async {
        starting = module ?? "mixed"; defer { starting = nil }
        do { runner = try await store.startDrawnPractice(module: module) } catch { store.handle(error) }
    }
}
struct PracticeSummaryRoute: Hashable { let key: String }

/// 1 問ずつ解く。採点は端末で（正解はサーバーと同じ規則）、結果はイベントとして送る。
struct PracticeRunnerView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let attemptKey: String
    @State private var selected: Int?
    @State private var typed = ""
    @State private var shownAt = Date.now
    @State private var finished = false
    var body: some View {
        if let attempt = store.attempt(attemptKey) {
            if finished || attempt.completedAt != nil { PracticeSummaryView(attemptKey: attemptKey) }
            else { runner(attempt) }
        } else {
            Text("找不到这次练习").foregroundStyle(DeckTheme.muted)
        }
    }
    private func runner(_ attempt: LocalAttempt) -> some View {
        let position = min(attempt.position, attempt.items.count - 1)
        let item = attempt.items[position]
        let group = attempt.groups[item.group]
        let question = group?.questions.first { $0.code == item.question }
        let answer = attempt.answers[item.question]
        let reveal = answer != nil && store.settings.feedbackMode != "batch"
        return ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ProgressView(value: Double(attempt.answeredCount), total: Double(attempt.items.count)).tint(DeckTheme.green)
                Text("第 \(position + 1) 题 / 共 \(attempt.items.count) 题").font(.footnote).foregroundStyle(DeckTheme.muted)
                if let group, let question {
                    QuestionView(group: group, question: question, answer: answer, reveal: reveal, selected: $selected, typed: $typed) {
                        submit(attempt, group: group, question: question)
                    }
                } else {
                    Text("这道题的内容没有下载，请同步后再试。").foregroundStyle(DeckTheme.muted)
                }
                HStack(spacing: 12) {
                    Button("上一题") { go(attempt, position - 1) }.disabled(position == 0)
                    Spacer()
                    if position + 1 < attempt.items.count {
                        Button("下一题") { go(attempt, position + 1) }.accessibilityIdentifier("practice.next")
                    } else {
                        Button("结束练习") { store.complete(attemptKey); finished = true }.accessibilityIdentifier("practice.finish")
                    }
                }.padding(.top, 8)
            }.modifier(StudyPagePadding()).frame(maxWidth: 820).frame(maxWidth: .infinity)
        }
        .background(DeckTheme.paper)
        .navigationTitle(attempt.title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { load(attempt) }
    }
    private func load(_ attempt: LocalAttempt) {
        let item = attempt.items[min(attempt.position, attempt.items.count - 1)]
        let answer = attempt.answers[item.question]
        selected = answer?.selectedOptionId; typed = answer?.answerText ?? ""; shownAt = .now
    }
    private func go(_ attempt: LocalAttempt, _ position: Int) {
        store.move(attemptKey, to: position)
        if let next = store.attempt(attemptKey) { load(next) }
    }
    private func submit(_ attempt: LocalAttempt, group: QuestionGroup, question: GroupQuestion) {
        let mode = store.answerMode(group.typeId)
        let elapsed = Int(Date.now.timeIntervalSince(shownAt) * 1000)
        store.answer(attemptKey, question: question, group: group, optionId: mode == "choice" ? selected : nil, text: mode == "choice" ? nil : typed, elapsedMs: elapsed)
        // まとめて答え合わせのときはすぐ次へ
        if store.settings.feedbackMode == "batch", let current = store.attempt(attemptKey), current.position + 1 < current.items.count {
            go(current, current.position + 1)
        }
    }
}

/// 題組の素材（文章・音声・お知らせ）、問題文、選択肢または入力欄、答えたあとの正解と解説。
struct QuestionView: View {
    @Environment(AppStore.self) private var store
    let group: QuestionGroup
    let question: GroupQuestion
    let answer: LocalAttempt.Answer?
    let reveal: Bool
    @Binding var selected: Int?
    @Binding var typed: String
    let submit: () -> Void
    private var mode: String { store.answerMode(group.typeId) }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let instruction = group.instruction, !instruction.isEmpty { Text(instruction).font(.subheadline).foregroundStyle(DeckTheme.muted) }
            ForEach(Array(group.materials.enumerated()), id: \.offset) { _, material in materialView(material) }
            if let prompt = question.prompt, !prompt.isEmpty {
                Text(MarkedText.attributed(prompt, marks: question.marks, size: 20 * store.textScale)).lineSpacing(6).fixedSize(horizontal: false, vertical: true)
            }
            if let media = question.promptMediaId { MediaAudioPlayer(mediaId: media) }
            switch mode {
            case "choice":
                ForEach(Array(question.options.enumerated()), id: \.element.id) { index, option in
                    Button { if answer == nil || !reveal { selected = option.id } } label: {
                        AnswerChoice(number: index + 1, text: option.text ?? "", selected: (answer?.selectedOptionId ?? selected) == option.id,
                                     correct: reveal ? option.correct : nil)
                    }.buttonStyle(.plain).accessibilityIdentifier("practice.option.\(index + 1)")
                }
                if answer == nil || !reveal {
                    Button("提交") { submit() }.buttonStyle(PrimaryButton()).disabled(selected == nil).accessibilityIdentifier("practice.submit")
                }
            case "text_input":
                TextField("输入你听到的内容", text: $typed, axis: .vertical).textFieldStyle(.roundedBorder).disabled(answer != nil && reveal)
                if answer == nil || !reveal { Button("提交") { submit() }.buttonStyle(PrimaryButton()).disabled(typed.trimmingCharacters(in: .whitespaces).isEmpty) }
            default:
                Group { if mode == "recording" { Text("跟读题：听完后跟着读。录音分析请在网页上进行，这里记为已练习。") } else { Text("这道题不计分，读完后继续。") } }.foregroundStyle(DeckTheme.muted)
                if answer == nil { Button("完成这题") { submit() }.buttonStyle(PrimaryButton()) }
            }
            if let answer, reveal { ResultView(group: group, question: question, answer: answer, mode: mode) }
            else if answer != nil { Text("结束后显示答案和解析").font(.footnote).foregroundStyle(DeckTheme.muted) }
        }
    }
    @ViewBuilder private func materialView(_ material: GroupMaterial) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title = material.title, material.kind != "audio" { Text(title.text).font(.headline) }
            if let body = material.body, !body.isEmpty { Text(body).font(.system(size: 18 * store.textScale)).lineSpacing(6).fixedSize(horizontal: false, vertical: true) }
            if let media = material.mediaId { MediaAudioPlayer(mediaId: media) }
            if answer != nil && reveal, let transcript = material.transcript, !transcript.isEmpty {
                DisclosureGroup("听力原文") {
                    Text(transcript).fixedSize(horizontal: false, vertical: true)
                    if let translation = material.transcriptTranslation { Text(translation.text).foregroundStyle(DeckTheme.muted) }
                }
            }
            if answer != nil && reveal, let translation = material.bodyTranslation { DisclosureGroup("译文") { Text(translation.text) } }
        }.padding(.bottom, 8).overlay(alignment: .bottom) { Rectangle().fill(DeckTheme.line).frame(height: 1) }
    }
}

struct ResultView: View {
    let group: QuestionGroup
    let question: GroupQuestion
    let answer: LocalAttempt.Answer
    let mode: String
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            switch answer.correct {
            case true: Label("回答正确", systemImage: "checkmark.circle.fill").foregroundStyle(DeckTheme.green).font(.headline)
            case false: Label("回答错误", systemImage: "xmark.circle.fill").foregroundStyle(DeckTheme.accent).font(.headline)
            default: Label("已记录（不计分）", systemImage: "checkmark").foregroundStyle(DeckTheme.muted)
            }
            if mode == "text_input", let expected = question.expectedText { Text("参考答案：\(expected)") }
            if let translation = question.translation { Text("译文：\(translation.text)").foregroundStyle(DeckTheme.muted) }
            ForEach(Array(question.explanation.enumerated()), id: \.offset) { _, section in
                VStack(alignment: .leading, spacing: 4) {
                    if let title = section.title { Text(title.text).font(.subheadline.bold()) }
                    if let body = section.body { Text(body.text).fixedSize(horizontal: false, vertical: true) }
                }
            }
            ForEach(question.options.filter { $0.analysis != nil }) { option in
                Text("\(option.text ?? "")：\(option.analysis?.text ?? "")").font(.subheadline).foregroundStyle(option.correct == true ? DeckTheme.green : DeckTheme.ink)
            }
        }.padding(14).frame(maxWidth: .infinity, alignment: .leading).background(DeckTheme.surface, in: RoundedRectangle(cornerRadius: 10))
            .accessibilityIdentifier("practice.result")
    }
}

/// 練習の結果：点数と各問の正誤・解説。
struct PracticeSummaryView: View {
    @Environment(AppStore.self) private var store
    let attemptKey: String
    var body: some View {
        if let attempt = store.attempt(attemptKey) {
            List {
                Section {
                    Text("答对 \(attempt.correctCount) / \(attempt.scoredCount)").font(.title2.bold()).accessibilityIdentifier("practice.score")
                    if store.pendingCount > 0 { Text("结果已保存在本机，联网后自动上传。").font(.footnote).foregroundStyle(DeckTheme.muted) }
                }
                ForEach(Array(attempt.items.enumerated()), id: \.offset) { index, item in
                    if let group = attempt.groups[item.group], let question = group.questions.first(where: { $0.code == item.question }) {
                        DisclosureGroup {
                            if let answer = attempt.answers[item.question] { ResultView(group: group, question: question, answer: answer, mode: store.answerMode(group.typeId)) }
                            else { Text("没有作答").foregroundStyle(DeckTheme.muted) }
                        } label: {
                            HStack {
                                Text("\(index + 1). \(question.prompt ?? question.code)").lineLimit(2)
                                Spacer()
                                Image(systemName: attempt.answers[item.question]?.correct == true ? "checkmark.circle.fill" : attempt.answers[item.question]?.correct == false ? "xmark.circle.fill" : "minus.circle")
                                    .foregroundStyle(attempt.answers[item.question]?.correct == true ? DeckTheme.green : attempt.answers[item.question]?.correct == false ? DeckTheme.accent : DeckTheme.muted)
                            }
                        }
                    }
                }
            }.navigationTitle(attempt.title)
        }
    }
}
