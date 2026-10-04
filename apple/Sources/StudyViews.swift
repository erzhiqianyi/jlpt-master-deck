import SwiftUI
import AVFoundation

struct LibraryView: View {
    @Environment(AppStore.self) private var store
    let grammarOnly: Bool
    let vocabularyOnly: Bool
    let query: String
    let review: (StudyItem) -> Void
    private var filtered: [StudyItem] {
        store.items.filter { (!grammarOnly || $0.isGrammar) && (!vocabularyOnly || !$0.isGrammar) && (query.isEmpty || [$0.original, $0.reading ?? "", $0.meaning_zh ?? ""].joined().localizedCaseInsensitiveContains(query)) }
    }
    var body: some View {
        if filtered.isEmpty {
            ContentUnavailableView("还没有匹配的词条", systemImage: "books.vertical", description: Text("尝试其他关键词，或从网页版导入学习资料。"))
        } else {
            List(filtered) { item in
                NavigationLink(value: WorkspaceRoute.item(item.id)) { DeckRow(title: item.original, subtitle: [item.reading, item.meaning_zh].compactMap { $0 }.joined(separator: " · "), icon: item.isGrammar ? "list.bullet" : "character.book.closed") }
                .listRowBackground(DeckTheme.surface)
            }.scrollContentBackground(.hidden)
        }
    }
}

struct ItemDetailView: View {
    let item: StudyItem
    let review: () -> Void
    @State private var speech = AVSpeechSynthesizer()
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(item.original).font(.system(size: 42, weight: .medium, design: .serif)).textSelection(.enabled)
                        Text(item.reading ?? "").font(.title3).foregroundStyle(DeckTheme.muted)
                    }
                    Spacer()
                    Button { speak(item.original) } label: { Image(systemName: "speaker.wave.2").font(.title2).padding(12) }.accessibilityLabel("朗读词条")
                }
                Divider()
                Text(item.meaning_zh ?? "暂无释义").font(.title2)
                ForEach(Array((item.examples ?? []).enumerated()), id: \.offset) { _, example in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(example.ja).font(.title3).textSelection(.enabled)
                        Text(example.zh ?? "").foregroundStyle(DeckTheme.muted)
                    }
                }
                if let explanation = item.explanation_zh { Text(explanation).lineSpacing(7).textSelection(.enabled) }
                if let notes = item.core_memory, !notes.isEmpty {
                    DisclosureGroup("记忆提示") { Text(notes.joined(separator: "\n")).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 12) }
                }
                Text(item.sourceLabel).font(.caption).foregroundStyle(DeckTheme.muted)
                Button("复习这个词条", action: review).buttonStyle(PrimaryButton())
            }.frame(maxWidth: 760).modifier(StudyPagePadding()).frame(maxWidth: .infinity)
        }.background(DeckTheme.paper).navigationTitle("词条详情")
        .safeAreaInset(edge: .bottom, spacing: 0) {
            DetailStudyCompanion(context: item.original, captureTitle: "记录这个词条的疑问") {
                Button { speak(item.original) } label: { Label("朗读此词条", systemImage: "speaker.wave.2") }
                Button(action: review) { Label("复习此词条", systemImage: "rectangle.on.rectangle") }
            }
        }
        .onDisappear { speech.stopSpeaking(at: .immediate) }
    }
    private func speak(_ text: String) {
        speech.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "ja-JP")
        utterance.rate = 0.43
        speech.speak(utterance)
    }
}

struct MemoryReviewView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let items: [StudyItem]
    @State private var index = 0
    @State private var revealed = false
    @State private var error: String?
    @State private var speech = AVSpeechSynthesizer()
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    if index < items.count {
                        let item = items[index]
                        ProgressView(value: Double(index), total: Double(items.count)).padding(.bottom, 12)
                        ConfiguredCardView(item: item, fields: CardFields.selected(store.state.settings, back: revealed), revealed: revealed)
                            .id("\(item.id)-\(revealed)")
                        if revealed {
                            Button { speak(item.original) } label: { Label("朗读", systemImage: "speaker.wave.2") }
                            if let reference = item.reference { Text(reference).font(.caption).foregroundStyle(DeckTheme.muted) }
                        } else {
                            Text("先试着回想，再查看答案。").foregroundStyle(DeckTheme.muted)
                        }
                        if let error { Text(error).foregroundStyle(.red).font(.callout) }
                    } else {
                        Image(systemName: "checkmark.circle").font(.system(size: 68, weight: .light)).foregroundStyle(DeckTheme.green)
                        Text("这一轮完成了").font(.largeTitle.bold())
                        Text("已复习 \(items.count) 项。\(store.isDemo ? "演示结果仅保留在本次体验中。" : "结果已保存。")").foregroundStyle(DeckTheme.muted)
                        Button("回到今日学习") { dismiss() }.buttonStyle(PrimaryButton())
                    }
                }.frame(maxWidth: 660).modifier(StudyPagePadding()).frame(maxWidth: .infinity)
            }.id(index).background(DeckTheme.paper).navigationTitle("记忆复习 · \(min(index + 1, items.count)) / \(items.count)")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if index < items.count {
                    VStack(spacing: 10) {
                        Divider()
                        if revealed {
                            Text("记得怎么样？").font(.caption).foregroundStyle(DeckTheme.muted)
                            HStack(spacing: 8) {
                                ForEach(MemoryRating.allCases) { rating in
                                    Button { Task { await rate(items[index], rating) } } label: {
                                        VStack(spacing: 6) { Text(rating.title).font(.headline); Text(rating.interval).font(.caption) }
                                            .frame(maxWidth: .infinity).padding(.vertical, 14)
                                            .background(rating == .easy ? DeckTheme.green.opacity(0.08) : DeckTheme.accent.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
                                    }.disabled(store.isSaving).accessibilityIdentifier("review.\(rating.rawValue)")
                                }
                            }
                        } else {
                            Button("显示答案") { revealed = true }.buttonStyle(PrimaryButton()).accessibilityIdentifier("review.reveal")
                        }
                    }.padding(.horizontal, 16).padding(.bottom, 8).frame(maxWidth: 660).frame(maxWidth: .infinity).background(DeckTheme.paper)
                }
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { DeckDismissButton(kind: .back, label: "返回，退出本轮复习", disabled: store.isSaving, identifier: "review.back") } }
        }.interactiveDismissDisabled(store.isSaving).onDisappear { speech.stopSpeaking(at: .immediate) }
    }
    private func rate(_ item: StudyItem, _ rating: MemoryRating) async {
        do { speech.stopSpeaking(at: .immediate); try await store.rate(item, rating); index += 1; revealed = false; error = nil }
        catch { self.error = error.localizedDescription }
    }
    private func speak(_ text: String) {
        speech.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text); utterance.voice = AVSpeechSynthesisVoice(language: "ja-JP")
        speech.speak(utterance)
    }
}

struct ReadingLibraryView: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        if store.reading.isEmpty {
            ContentUnavailableView("还没有阅读题", systemImage: "book", description: Text("在网页版添加阅读资料后，点击刷新即可同步。"))
        } else {
            List(store.reading) { question in
                NavigationLink(value: WorkspaceRoute.reading(question.id)) {
                    DeckRow(title: question.title, subtitle: question.question, icon: "book")
                }.listRowBackground(DeckTheme.surface)
            }.scrollContentBackground(.hidden)
        }
    }
}
struct ReadingPracticeView: View {
    @Environment(AppStore.self) private var store
    // Keep the displayed question snapshot stable during an automatic refresh so
    // a selected option cannot silently become a different answer.
    @State private var question: ReadingQuestion
    init(question: ReadingQuestion) { _question = State(initialValue: question) }
    @State private var selected: Int?
    @State private var submitted = false
    @State private var celebration = 0
    @State private var error: String?
    @State private var sessionID = UUID().uuidString
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                if geometry.size.width > 800 {
                    HStack(alignment: .top, spacing: 32) { passage.frame(maxWidth: .infinity); Divider(); answers.frame(maxWidth: .infinity) }.modifier(StudyPagePadding())
                } else { VStack(alignment: .leading, spacing: 32) { passage; Divider(); answers }.padding(24) }
            }
        }.background(DeckTheme.paper).navigationTitle("阅读练习")
        .safeAreaInset(edge: .bottom, spacing: 0) {
            DetailStudyCompanion(context: "阅读：\(question.title)", captureTitle: submitted ? "记录阅读复盘" : "记录这篇阅读的疑问", celebration: celebration) { EmptyView() }
        }
    }
    private var passage: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text(question.title).font(.system(size: 30, weight: .semibold, design: .serif))
            Divider()
            Text(question.passage).font(.system(size: 21, design: .serif)).lineSpacing(13).textSelection(.enabled)
            if store.isDemo { Text("原创示例 · AI 生成 · 待核验").font(.caption).foregroundStyle(DeckTheme.muted) }
        }
    }
    private var answers: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("\(submitted ? "答题回顾" : "选择答案")").font(.headline)
            Text(question.question).font(.title3).lineSpacing(6)
            ForEach(question.choices.indices, id: \.self) { index in
                Button { selected = index } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: selected == index ? "checkmark.circle.fill" : "circle")
                        Text(question.choices[index]).multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                    }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
                        .foregroundStyle(submitted && index == question.answerIndex ? DeckTheme.green : DeckTheme.ink)
                        .background(selected == index ? DeckTheme.accent.opacity(0.08) : DeckTheme.surface, in: RoundedRectangle(cornerRadius: 7))
                        .overlay(RoundedRectangle(cornerRadius: 7).stroke(selected == index ? DeckTheme.accent : DeckTheme.line))
                }.disabled(submitted || store.isSaving).accessibilityIdentifier("reading.choice.\(index)")
                    .accessibilityValue(selected == index ? "已选择" : "未选择")
            }
            if submitted {
                Label(selected == question.answerIndex ? "回答正确" : "再看一下原文", systemImage: selected == question.answerIndex ? "checkmark.circle.fill" : "info.circle")
                    .foregroundStyle(DeckTheme.green).font(.headline)
                Text(question.explanation).lineSpacing(7).textSelection(.enabled)
                Text(store.isDemo ? "演示结果仅保存在本次体验" : store.pendingCount > 0 ? "已保存到本机，等待同步" : "已同步学习进度").font(.caption).foregroundStyle(DeckTheme.muted)
            } else {
                Button {
                    guard let selected else { return }
                    Task {
                        do { try await store.answer(question, selection: selected, sessionID: sessionID); submitted = true; error = nil; if selected == question.answerIndex { celebration += 1 } }
                        catch { self.error = error.localizedDescription }
                    }
                } label: { Text(store.isSaving ? "保存中…" : "确认答案") }.buttonStyle(PrimaryButton()).disabled(selected == nil || store.isSaving)
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
    }
}
