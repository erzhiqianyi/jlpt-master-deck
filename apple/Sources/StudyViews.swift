import SwiftUI
import AVFoundation
import Observation

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
    @Environment(AppStore.self) private var store
    let item: StudyItem
    let review: () -> Void
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(store.readingText(item.original, item: item)).font(.system(size: 42 * store.textScale, weight: .medium, design: .serif)).textSelection(.enabled)
                        Text(item.reading ?? "").font(.title3).foregroundStyle(DeckTheme.muted)
                    }
                    Spacer()
                    NativeCopyButton(value: item.original, label: "复制单词", identifier: "entry.copyWord")
                    NativeSpeechControls(text: item.reading.flatMap { $0.isEmpty ? nil : $0 } ?? item.original, label: "朗读词条", iconOnly: true)
                }
                Divider()
                Text(item.cardText("meaning", locale: store.appLanguage) ?? "暂无释义").font(.title2)
                ForEach(Array((item.examples ?? []).enumerated()), id: \.offset) { _, example in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .top, spacing: 8) {
                            Text(store.readingText(example.ja, item: item)).font(.title3).textSelection(.enabled)
                            Spacer(minLength: 0)
                            NativeSpeechControls(text: example.ja, label: "朗读例句", iconOnly: true, identifier: "entry.example.\(item.id).\(example.ja)", showsRepeat: true)
                        }
                        Text(example.zh ?? "").foregroundStyle(DeckTheme.muted)
                    }
                }
                if let explanation = item.cardText("explanation", locale: store.appLanguage) { Text(store.readingText(explanation, item: item, explanation: true)).lineSpacing(7).textSelection(.enabled) }
                if let notes = item.core_memory, !notes.isEmpty {
                    DisclosureGroup("记忆提示") { Text(store.readingText(notes.joined(separator: "\n"), item: item, explanation: true)).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 12) }
                }
                Text(item.sourceLabel).font(.caption).foregroundStyle(DeckTheme.muted)
                CardIdentityFooter(item: item)
                Button("复习这个词条", action: review).buttonStyle(PrimaryButton())
            }.frame(maxWidth: 760).modifier(StudyPagePadding()).frame(maxWidth: .infinity)
        }.background(DeckTheme.paper).navigationTitle("词条详情")
        .task(id: item.id) {
            if item.isGrammar, store.speechConfiguration.grammarAuto {
                store.speechPlayer.play(store.speechConfiguration.text(for: item), store: store, owner: "grammar-auto")
            }
        }
        .onDisappear { store.speechPlayer.stop() }
    }

}

struct MemoryReviewView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let items: [StudyItem]
    @State private var index = 0
    @State private var revealed = false
    @AppStorage("memorySpeechSide") private var speechSide = "right"
    @State private var error: String?
    private var activeFields: [String] { CardFields.selected(store.state.settings, back: revealed) }
    private var contentWidth: CGFloat {
        sizeClass != .compact && index < items.count && activeFields.contains("images") && !(items[index].images ?? []).isEmpty ? 1120 : 760
    }
    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                VStack(spacing: 0) {
                    ProgressView(value: Double(index), total: Double(max(1, items.count))).tint(DeckTheme.accent)
                        .frame(maxWidth: contentWidth).accessibilityLabel("复习进度")
                    if index < items.count {
                        let item = items[index]
                        ScrollView {
                            VStack(alignment: .leading, spacing: 16) {
                                if !revealed { Spacer(minLength: 0) }
                                ConfiguredCardView(item: item, fields: activeFields, revealed: revealed,
                                    speechControls: AnyView(HStack(spacing: 0) {
                                        NativeSpeechControls(text: item.reading.flatMap { $0.isEmpty ? nil : $0 } ?? item.original, iconOnly: true, identifier: "review.speech", showsDownload: false)
                                        if sizeClass != .compact {
                                            Menu {
                                                Button("放到左侧") { speechSide = "left" }
                                                Button("放到右侧") { speechSide = "right" }
                                            } label: { Image(systemName: "ellipsis").frame(minWidth: 44, minHeight: 44) }
                                            .accessibilityLabel("朗读按钮位置").accessibilityIdentifier("review.speech-position")
                                        }
                                    }), speechSide: sizeClass == .compact ? "right" : speechSide)
                                    .id("\(item.id)-\(revealed)")
                                if !revealed { Spacer(minLength: 20) }
                                CardIdentityFooter(item: item)
                                if let error { Text(error).foregroundStyle(.red).font(.callout) }
                            }.padding(revealed ? 4 : sizeClass == .compact ? 18 : 24)
                                .frame(maxWidth: .infinity, minHeight: revealed ? 0 : max(240, geometry.size.height - 32), alignment: revealed ? .topLeading : .center)
                                .contentShape(Rectangle())
                                .onTapGesture { if !revealed { revealed = true } }
                        }.scrollIndicators(.hidden)
                            .background(revealed ? .clear : DeckTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                            .overlay { RoundedRectangle(cornerRadius: 12).stroke(revealed ? .clear : DeckTheme.line, lineWidth: 1) }
                            .accessibilityIdentifier("review.card")
                            .frame(maxWidth: contentWidth).padding(.horizontal, 14).padding(.vertical, 14).id(index)
                    } else {
                        VStack(spacing: 16) {
                            Image(systemName: "checkmark.circle").font(.system(size: 68, weight: .light)).foregroundStyle(DeckTheme.green)
                            Text("这一轮完成了").font(.largeTitle.bold())
                            Text("已复习 \(items.count) 项。\(store.isDemo ? "演示结果仅保留在本次体验中。" : "结果已保存。")").foregroundStyle(DeckTheme.muted)
                            Button("回到今日学习") { dismiss() }.buttonStyle(PrimaryButton())
                        }.frame(maxWidth: 760).modifier(StudyPagePadding()).frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }.frame(maxWidth: .infinity)
            }.background(DeckTheme.paper).navigationTitle("记忆卡复习")
                .navigationBarTitleDisplayMode(.inline)
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if index < items.count {
                        Group {
                            if revealed {
                                HStack(spacing: 8) {
                                    ForEach(MemoryRating.allCases) { rating in
                                        Button { Task { await rate(items[index], rating) } } label: {
                                            VStack(spacing: 5) {
                                                Image(systemName: rating.symbol).font(.title3.weight(.semibold)).frame(width: 34, height: 34).background(rating.tint.opacity(0.12), in: Circle())
                                                Text(rating.title).font(.headline)
                                                Text(rating.interval).font(.caption)
                                            }.frame(maxWidth: .infinity, minHeight: 90)
                                                .foregroundStyle(rating.tint).background(rating.tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 20))
                                                .overlay { RoundedRectangle(cornerRadius: 20).stroke(rating.tint.opacity(0.35), lineWidth: 1) }
                                        }.buttonStyle(.plain).disabled(store.isSaving).accessibilityIdentifier("review.\(rating.rawValue)")
                                    }
                                }
                            } else {
                                Button("显示答案") { revealed = true }.buttonStyle(PrimaryButton()).accessibilityIdentifier("review.reveal")
                            }
                        }.frame(maxWidth: contentWidth).padding(.horizontal, 14).padding(.bottom, 8).frame(maxWidth: .infinity).background(DeckTheme.paper)
                    }
                }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { DeckDismissButton(kind: .back, label: "返回，退出本轮复习", disabled: store.isSaving, identifier: "review.back") }
                    ToolbarItem(placement: .topBarTrailing) { Text("\(min(index + 1, items.count)) / \(items.count)").font(.subheadline.monospacedDigit()).foregroundStyle(DeckTheme.muted) }
                }
        }.interactiveDismissDisabled(store.isSaving)
        .task(id: "\(index)-\(revealed)") {
            guard index < items.count else { return }
            let configuration = store.speechConfiguration
            if configuration.cardAuto == (revealed ? "back" : "front") {
                store.speechPlayer.play(configuration.text(for: items[index]), store: store, owner: "card-auto")
            }
        }.onDisappear { store.speechPlayer.stop() }
    }
    private func rate(_ item: StudyItem, _ rating: MemoryRating) async {
        do { store.speechPlayer.stop(); try await store.rate(item, rating); index += 1; revealed = false; error = nil }
        catch { self.error = error.localizedDescription }
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
                if geometry.size.width >= 760 {
                    HStack(alignment: .top, spacing: 28) { passage.frame(maxWidth: .infinity); Rectangle().fill(DeckTheme.line).frame(width: 1); answers.frame(maxWidth: .infinity) }.frame(maxWidth: 1120).modifier(StudyPagePadding()).frame(maxWidth: .infinity)
                } else { VStack(alignment: .leading, spacing: 20) { passage; Divider(); answers }.padding(.horizontal, 16).padding(.vertical, 12) }
            }
        }.background(DeckTheme.paper).navigationTitle("阅读练习")
        .onDisappear { store.speechPlayer.stop() }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !submitted {
                confirmButton.accessibilityIdentifier("reading.confirm").frame(maxWidth: 1120).padding(.horizontal, 16).padding(.vertical, 8).frame(maxWidth: .infinity).background(DeckTheme.paper)
            }
        }
    }
    private var passage: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(question.title).font(.system(size: 18 * store.textScale, weight: .semibold, design: .serif))
            if submitted {
                NativeSpeechControls(text: question.passage, label: "朗读全文", identifier: "reading.speak")
            }
            Text(question.passage).font(.system(size: 18 * store.textScale, design: .serif)).lineSpacing(7).textSelection(.enabled)
            if store.isDemo { Text("原创示例 · AI 生成 · 待核验").font(.caption).foregroundStyle(DeckTheme.muted) }
        }
    }
    private var answers: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("\(submitted ? "答题回顾" : "选择答案")").font(.headline)
            Text(question.question).font(.title3).lineSpacing(6)
            ForEach(question.choices.indices, id: \.self) { index in
                Button { selected = index } label: {
                    StudyAnswerChoice(number: index + 1, text: question.choices[index], selected: selected == index,
                        correct: submitted ? index == question.answerIndex : nil, flat: true)
                }.disabled(submitted || store.isSaving).accessibilityIdentifier("reading.choice.\(index)")
                    .accessibilityValue(selected == index ? "已选择" : "未选择")
            }
            if submitted {
                Label(selected == question.answerIndex ? "回答正确" : "再看一下原文", systemImage: selected == question.answerIndex ? "checkmark.circle.fill" : "info.circle")
                    .foregroundStyle(DeckTheme.green).font(.headline)
                Text(question.explanation).lineSpacing(7).textSelection(.enabled)
                Text(store.isDemo ? "演示结果仅保存在本次体验" : store.pendingCount > 0 ? "已保存到本机，等待同步" : "已同步学习进度").font(.caption).foregroundStyle(DeckTheme.muted)
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
    }
    private var confirmButton: some View {
        Button {
            guard let selected else { return }
            Task {
                do { try await store.answer(question, selection: selected, sessionID: sessionID); submitted = true; error = nil; if selected == question.answerIndex { celebration += 1 } }
                catch { self.error = error.localizedDescription }
            }
        } label: { Text(store.isSaving ? "保存中…" : "确认答案") }.buttonStyle(PrimaryButton()).disabled(selected == nil || store.isSaving)
    }
}

@MainActor @Observable
final class NativeSpeechPlayer: NSObject, AVAudioPlayerDelegate, AVSpeechSynthesizerDelegate {
    private(set) var owner = ""
    private(set) var status = "idle"
    private(set) var error: String?
    private var synthesizer: AVSpeechSynthesizer?
    private var utterance: AVSpeechUtterance?
    private var audio: AVAudioPlayer?
    private var completion: CheckedContinuation<Void, Error>?
    private var task: Task<Void, Never>?
    private var operation = UUID()
    private(set) var repeats = false
    private var repeatedText = ""
    private weak var repeatedStore: AppStore?
    func setRepeating(_ value: Bool, owner: String) {
        guard self.owner == owner, !owner.isEmpty else { return }
        repeats = value
    }
    override init() { super.init() }
    func stop() {
        operation = UUID(); task?.cancel(); task = nil
        audio?.stop(); audio = nil
        completion?.resume(throwing: CancellationError()); completion = nil
        utterance = nil; synthesizer?.stopSpeaking(at: .immediate)
        owner = ""; status = "idle"; error = nil
        repeats = false; repeatedText = ""; repeatedStore = nil
    }
    func play(_ text: String, store: AppStore, owner: String, repeating: Bool = false) {
        stop(); self.owner = owner
        repeats = repeating; repeatedText = text; repeatedStore = store
        let configuration = store.speechConfiguration
        if configuration.usesSystemVoice || store.isDemo {
            let value = AVSpeechUtterance(string: text)
            value.voice = AVSpeechSynthesisVoice(identifier: configuration.voice) ?? AVSpeechSynthesisVoice(language: "ja-JP")
            value.rate = Float(0.43 * configuration.rate)
            if synthesizer == nil { synthesizer = AVSpeechSynthesizer(); synthesizer?.delegate = self }
            utterance = value; status = "playing"; synthesizer?.speak(value)
            return
        }
        let expected = operation
        task = Task { [weak self] in
            guard let self else { return }
            defer { if expected == self.operation { self.status = "idle"; self.task = nil } }
            do {
                repeat { for chunk in SpeechConfiguration.chunks(text) {
                    try Task.checkCancellation()
                    self.status = "loading"
                    let data = try await store.speechAudio(configuration.request(text: chunk))
                    try Task.checkCancellation()
                    guard expected == self.operation else { return }
                    let player = try AVAudioPlayer(data: data)
                    player.delegate = self; player.enableRate = true; player.rate = Float(configuration.rate)
                    self.audio = player
                    try await withCheckedThrowingContinuation { continuation in
                        self.completion = continuation
                        if player.play() { self.status = "playing" }
                        else { self.completion = nil; continuation.resume(throwing: IdentityError.message("语音播放失败，请重试。")) }
                    }
                }
                } while self.repeats && !Task.isCancelled && expected == self.operation
            } catch { if expected == self.operation && !(error is CancellationError) { self.error = error.localizedDescription } }
        }
    }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            guard self.audio === player else { return }
            self.audio = nil
            let continuation = self.completion; self.completion = nil
            if flag { continuation?.resume() } else { continuation?.resume(throwing: IdentityError.message("语音播放失败，请重试。")) }
        }
    }
    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in
            guard self.audio === player else { return }
            self.audio = nil
            let continuation = self.completion; self.completion = nil
            continuation?.resume(throwing: error ?? IdentityError.message("音频无法解码。"))
        }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish value: AVSpeechUtterance) {
        Task { @MainActor in
            guard self.utterance === value else { return }
            if self.repeats, let store = self.repeatedStore {
                self.play(self.repeatedText, store: store, owner: self.owner, repeating: true)
            } else { self.utterance = nil; self.status = "idle" }
        }
    }
}

struct NativeSpeechControls: View {
    @Environment(AppStore.self) private var store
    let text: String
    var label = "朗读"
    var iconOnly = false
    var identifier = "speech.play"
    var showsDownload = false
    var showsRepeat = false
    @State private var repeating = false
    @State private var owner = UUID().uuidString
    @State private var downloading = false
    @State private var saved = false
    @State private var error: String?
    @State private var downloadTask: Task<Void, Never>?
    @State private var downloadGeneration = UUID()
    private var active: Bool { store.speechPlayer.owner == owner && store.speechPlayer.status != "idle" }
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Button {
                    if active { store.speechPlayer.stop() } else { store.speechPlayer.play(text, store: store, owner: owner, repeating: repeating) }
                } label: {
                    Label(active ? "停止" : label, systemImage: active ? "stop.fill" : "speaker.wave.2")
                        .labelStyle(SpeechLabelStyle(iconOnly: iconOnly)).frame(minWidth: 44, minHeight: 44)
                }.accessibilityLabel(active ? "停止" : label)
                    .accessibilityIdentifier(identifier)
                if showsRepeat {
                    Button {
                        repeating.toggle()
                        store.speechPlayer.setRepeating(repeating, owner: owner)
                    } label: {
                        Image(systemName: "repeat").frame(minWidth: 44, minHeight: 44)
                            .foregroundStyle(repeating ? DeckTheme.green : DeckTheme.muted)
                            .background(repeating ? DeckTheme.green.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 8))
                    }.accessibilityLabel(repeating ? "关闭循环播放" : "循环播放例句")
                        .accessibilityValue(repeating ? "开启" : "关闭")
                        .accessibilityIdentifier(identifier + ".repeat")
                }
                if showsDownload && !store.speechConfiguration.usesSystemVoice && !store.isDemo {
                    Button {
                        guard !downloading, !saved else { return }
                        downloading = true; error = nil
                        let configuration = store.speechConfiguration
                        let expected = downloadGeneration
                        downloadTask = Task {
                            defer { if expected == downloadGeneration { downloading = false } }
                            do {
                                try await store.downloadSpeech(text, configuration: configuration)
                                if expected == downloadGeneration { saved = true }
                            } catch { if expected == downloadGeneration && !(error is CancellationError) { self.error = error.localizedDescription } }
                        }
                    } label: {
                        if downloading { ProgressView().frame(minWidth: 44, minHeight: 44) }
                        else { Image(systemName: saved ? "checkmark" : "arrow.down.to.line").frame(minWidth: 44, minHeight: 44) }
                    }.accessibilityLabel(saved ? "语音已下载" : "下载语音").disabled(downloading || saved)
                }
            }
            if let message = error ?? (store.speechPlayer.owner == owner ? store.speechPlayer.error : nil) { Text(message).font(.caption).foregroundStyle(.red) }
        }.task(id: store.speechConfiguration.request(text: text)) {
            downloadGeneration = UUID(); downloadTask?.cancel(); downloading = false; error = nil
            saved = store.speechIsDownloaded(text, configuration: store.speechConfiguration)
        }.onDisappear {
            downloadTask?.cancel()
            if store.speechPlayer.owner == owner { store.speechPlayer.stop() }
        }
    }
}
struct SpeechLabelStyle: LabelStyle {
    let iconOnly: Bool
    func makeBody(configuration: Configuration) -> some View {
        if iconOnly { configuration.icon }
        else { HStack(spacing: 8) { configuration.icon; configuration.title } }
    }
}
