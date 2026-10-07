import SwiftUI
import AVFoundation
import Combine

struct ListeningEnvelope: Decodable { let questions: [ListeningItem] }
struct ListeningItem: Codable, Identifiable {
    var canonicalQuestionId: String?
    var questionRevision: Int?
    var materialRefs: [BankVersionReference]?
    let id: String; let title: String; let question: String; let explanation: String
    let questionTypeId: String; let choices: [String]; let answerIndex: Int
    var japaneseAnnotations: [JapaneseAnnotation]?
    var transcript: String?; var transcriptTranslation: String?
    var audioAssetId: String?; var audioReference: String?; var reference: String?
    var libraryNumber: Int?; let audioFileName: String; let audioSize: Int; let createdAt: String
    var choiceDetails: [ChoiceDetail]?
    struct ChoiceDetail: Codable { var translation: String?; var explanation: String? }
    var audioKey: String { audioAssetId ?? "\(audioFileName)|\(audioSize)" }
    var freeResponse: Bool { choices.isEmpty }
}
struct ListeningGroup: Identifiable {
    let id: String; let questions: [ListeningItem]
    var title: String { questions.first?.audioFileName ?? "听力" }
    static func restorable(_ items:[ListeningItem],owner:String,defaults:UserDefaults = .standard) -> [Self] {
        var groups = Dictionary(make(items).map { ($0.id,$0) },uniquingKeysWith:{ first,_ in first })
        let prefix = "listening-draft-v1:\(owner):"
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix(prefix) {
            guard let bytes = defaults.data(forKey:key),let draft = try? JSONDecoder().decode(ListeningDraft.self,from:bytes),let snapshots = draft.questionSnapshots,!snapshots.isEmpty, snapshots.map(\.id) == draft.questionIDs else { continue }
            let id = String(key.dropFirst(prefix.count)); groups[id] = .init(id:id,questions:snapshots)
        }
        return groups.values.sorted { $0.id < $1.id }
    }
    static func make(_ items: [ListeningItem]) -> [Self] {
        Dictionary(grouping: items, by: \.audioKey).map { key, values in
            Self(id: key, questions: values.sorted {
                if $0.libraryNumber != $1.libraryNumber { return ($0.libraryNumber ?? Int.max) < ($1.libraryNumber ?? Int.max) }
                if $0.createdAt != $1.createdAt { return $0.createdAt < $1.createdAt }
                return $0.id < $1.id
            })
        }.sorted { ($0.questions.map(\.createdAt).max() ?? "") > ($1.questions.map(\.createdAt).max() ?? "") }
    }
}
struct ListeningLibraryView: View {
    @Environment(AppStore.self) private var store
    @State private var query = ""
    @State private var type = "all"
    @State private var showingFilters = false
    static let types = [("all", "全部"), ("listening-task", "課題理解"), ("listening-points", "ポイント理解"), ("listening-outline", "概要理解"), ("listening-expression", "発話表現（N3–N5）"), ("listening-quick", "即時応答"), ("listening-integrated", "統合理解"), ("listening-basic-training", "基础训练")]
    var groups: [ListeningGroup] {
        ListeningGroup.restorable(store.listening,owner:store.isDemo ? "demo" : String(store.session?.user.id ?? 0)).filter { group in
            (type == "all" || group.questions.contains { $0.questionTypeId == type }) && (query.isEmpty || group.questions.contains { "\($0.title) \($0.audioFileName) \($0.reference ?? "")".localizedCaseInsensitiveContains(query) })
        }
    }
    var body: some View {
        Group {
            if !store.hasListeningCache && !store.isDemo {
                ContentUnavailableView {
                    Label("尚未下载听力题库", systemImage: "arrow.down.circle")
                } description: {
                    Text("同步题库后即可查看，音频可单独下载。")
                } actions: {
                    Button(store.isLoading ? "正在同步…" : "同步学习数据") { Task { await store.refresh() } }
                        .disabled(store.isLoading || !store.isOnline)
                }
            }
            else {
                VStack(alignment: .leading) {
                    HStack {
                        Text("\(groups.count) 段音频 · \(groups.reduce(0) { $0 + $1.questions.count }) 道题").foregroundStyle(.secondary)
                        Spacer()
                        Button("搜索与筛选", systemImage: "line.3.horizontal.decrease") { showingFilters = true }
                            .frame(minHeight: 44)
                    }.padding(.horizontal, 24)
                    if groups.isEmpty { ContentUnavailableView("暂无匹配的听力", systemImage: "headphones") }
                    List(groups) { group in
                        NavigationLink(value: WorkspaceRoute.listening(group.id)) {
                            VStack(alignment: .leading, spacing: 0) {
                                DeckRow(title: group.title, subtitle: "\(group.questions.first?.audioReference ?? "") · \(group.questions.count) 道题", icon: "headphones", showsChevron: false)
                                Label("\(store.state.progress["listening-audio:\(group.id)"]?.reviewCount ?? 0) 次", systemImage: "arrow.triangle.2.circlepath")
                                    .font(.caption).foregroundStyle(DeckTheme.muted)
                                    .accessibilityLabel("已练习 \(store.state.progress["listening-audio:\(group.id)"]?.reviewCount ?? 0) 次")
                                    .padding(.leading, 54).padding(.bottom, 12)
                            }
                        }
                    }.scrollContentBackground(.hidden)
                }.sheet(isPresented: $showingFilters) {
                    NavigationStack {
                        Form {
                            TextField("搜索听力标题或编号", text: $query)
                            Picker("题型", selection: $type) { ForEach(Self.types, id: \.0) { Text($0.1).tag($0.0) } }
                            Button("清除条件") { query = ""; type = "all" }
                        }.navigationTitle("搜索与筛选").navigationBarTitleDisplayMode(.inline)
                            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { showingFilters = false } } }
                    }.presentationDetents([.medium, .large])
                }
            }
        }
    }

}
struct ListeningDraft: Codable {
    var questionSnapshots: [ListeningItem]?
    var questionIDs: [String]
    var currentQuestion: Int
    var selected: [String: Int]
    var written: [String: String]
    var audioTime: Double
    var sessionID: String
}

struct ListeningDetailView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var group: ListeningGroup
    init(group: ListeningGroup) { _group = State(initialValue: group) }
    @State private var currentQuestion = 0
    @State private var player: AVAudioPlayer?
    @State private var visible = false
    @State private var loading = false
    @State private var playing = false
    @State private var audioTime = 0.0
    @State private var duration = 0.0
    @State private var seeking = false
    @State private var draftStorageKey: String?
    @State private var error: String?
    @State private var selected: [String: Int] = [:]
    @State private var written: [String: String] = [:]
    @State private var revealed = false
    @State private var saving = false
    @State private var sessionID = UUID().uuidString
    @State private var phase = Phase.answering
    @State private var showingCard = false
    @State private var reviewMistakes = false
    private enum Phase { case answering, paused, resume, results, review }
    private let ticker = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()
    private var draftKey: String { draftStorageKey ?? "listening-draft-v1:\(store.isDemo ? "demo" : String(store.session?.user.id ?? 0)):\(group.id)" }
    private func answered(_ item: ListeningItem) -> Bool {
        item.freeResponse ? !(written[item.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty : selected[item.id] != nil
    }
    private var answeredCount: Int { group.questions.filter { answered($0) }.count }
    private var complete: Bool { !group.questions.isEmpty && answeredCount == group.questions.count }
    private var scored: [ListeningItem] { group.questions.filter { !$0.freeResponse } }
    private var correctCount: Int { scored.filter { selected[$0.id] == $0.answerIndex }.count }
    private var mistakes: [Int] { group.questions.indices.filter { !group.questions[$0].freeResponse && selected[group.questions[$0].id] != group.questions[$0].answerIndex } }
    private var pages: [Int] { phase == .review && reviewMistakes ? mistakes : Array(group.questions.indices) }

    var body: some View {
        VStack(spacing: 0) {
            switch phase {
            case .paused, .resume: interruption
            case .results: results
            case .answering, .review: practice
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .tint(DeckTheme.accent)
        .environment(\.japaneseStudyHintsEnabled, revealed)
        .environment(\.japaneseExplanationMode, revealed)
        .navigationTitle(group.title).navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { exitOrPause() } label: { Image(systemName: "chevron.left") }
                    .accessibilityLabel("返回")
            }
            ToolbarItem(placement: .principal) {
                Text(group.title).font(.subheadline).foregroundStyle(.secondary)
                    .lineLimit(1).truncationMode(.middle).accessibilityLabel(group.title)
            }
            if phase == .answering {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { pause() } label: { Image(systemName: "rectangle.portrait.and.arrow.right").foregroundStyle(DeckTheme.accent) }
                        .accessibilityLabel("暂停练习")
                }
            }
        }
        .sheet(isPresented: $showingCard) { answerCard }
        .onAppear {
            visible = true
            if draftStorageKey == nil { draftStorageKey = draftKey }
            restoreDraft()
        }
        .onDisappear { visible = false; if !revealed { saveDraft() }; player?.stop(); playing = false }
        .onReceive(ticker) { _ in
            if let player { if !seeking { audioTime = player.currentTime }; duration = player.duration; playing = player.isPlaying }
        }
        .onChange(of: scenePhase) { _, value in
            if value != .active && !revealed { player?.pause(); playing = false; saveDraft() }
        }
        .onChange(of: selected) { _, _ in if !revealed { saveDraft() } }
        .onChange(of: written) { _, _ in if !revealed { saveDraft() } }
        .onChange(of: currentQuestion) { _, _ in if !revealed { saveDraft() } }
    }

    private var audioControls: some View {
        HStack(spacing: 18) {
            Button { Task { await toggleAudio() } } label: {
                Group {
                    if loading { ProgressView().tint(.white) }
                    else { Image(systemName: playing ? "pause.fill" : "play.fill").font(.title2.bold()) }
                }.frame(width: 54, height: 54).foregroundStyle(.white)
                    .background(DeckTheme.accent, in: Circle())
            }.disabled(loading).accessibilityLabel(playing ? "暂停音频" : "播放音频")
            Slider(value: $audioTime, in: 0...max(duration, audioTime, 1)) { editing in
                seeking = editing
                if !editing { player?.currentTime = audioTime; saveDraft() }
            }.disabled(player == nil).accessibilityLabel("音频播放进度")
        }.padding(.horizontal, 24).padding(.vertical, 22)
    }

    private var practice: some View {
        VStack(spacing: 0) {
            audioControls
            TabView(selection: $currentQuestion) {
                ForEach(pages, id: \.self) { number in
                    ScrollView {
                        question(group.questions[number], number: number)
                            .padding(.horizontal, 24).padding(.top, 8).padding(.bottom, 24)
                            .frame(maxWidth: 760).frame(maxWidth: .infinity)
                    }.tag(number)
                }
            }.tabViewStyle(.page(indexDisplayMode: .never)).disabled(saving)
            if let error { Text(error).font(.caption).foregroundStyle(.red).padding(.horizontal, 24) }
            HStack(spacing: 12) {
                action(phase == .review && reviewMistakes ? "上一错题" : "上一题", primary: false) { move(-1) }
                    .disabled(pages.first == currentQuestion)
                if pages.last == currentQuestion && phase == .answering {
                    action(saving ? "正在保存…" : "完成练习", primary: true) { Task { await confirm() } }
                        .disabled(!complete || saving)
                } else if pages.last == currentQuestion && phase == .review {
                    action("返回结果", primary: true) { phase = .results }
                } else {
                    action(phase == .review && reviewMistakes ? "下一错题" : "下一题", primary: true) { move(1) }
                }
            }.padding(.horizontal, 24).padding(.vertical, 16)
        }
    }

    private func question(_ item: ListeningItem, number: Int) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text(item.question).font(.headline).lineSpacing(6)
                Spacer(minLength: 12)
                if revealed {
                    Text(item.freeResponse ? "待自评" : selected[item.id] == item.answerIndex ? "答对" : "答错")
                        .font(.caption.bold()).padding(.horizontal, 12).padding(.vertical, 6)
                        .foregroundStyle(DeckTheme.accent)
                        .background(DeckTheme.accent.opacity(0.10), in: Capsule())
                }
                Text("\(number + 1) / \(group.questions.count)").font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
                Button { showingCard = true } label: { Image(systemName: "square.grid.2x2.fill").font(.title3).foregroundStyle(DeckTheme.accent) }
                    .accessibilityLabel("答题卡")
            }
            if revealed {
                reviewContent(item)
            } else if item.freeResponse {
                TextField("写下你的回答", text: Binding(get: { written[item.id] ?? "" }, set: { written[item.id] = $0 }), axis: .vertical)
                    .lineLimit(3...8).textFieldStyle(.roundedBorder).disabled(saving)
            } else {
                ForEach(Array(item.choices.enumerated()), id: \.offset) { index, choice in
                    Button { selected[item.id] = index } label: {
                        HStack(spacing: 14) {
                            Text("\(index + 1)").font(.body.bold()).frame(width: 32, height: 32)
                                .background(Color.black.opacity(0.04), in: Circle())
                            JapaneseText(text: choice.isEmpty ? "选项 \(index + 1)（请听音频）" : choice, japanese: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: selected[item.id] == index ? "largecircle.fill.circle" : "circle")
                                .font(.title2).foregroundStyle(selected[item.id] == index ? DeckTheme.accent : Color.gray.opacity(0.5))
                        }.padding(14).foregroundStyle(.primary)
                            .background(selected[item.id] == index ? DeckTheme.accent.opacity(0.08) : Color.white, in: RoundedRectangle(cornerRadius: 12))
                            .overlay { RoundedRectangle(cornerRadius: 12).stroke(Color.gray.opacity(selected[item.id] == index ? 0 : 0.15)) }
                    }.buttonStyle(.plain).disabled(saving)
                        .accessibilityIdentifier("listening.choice.\(number).\(index)")
                }
            }
        }
    }

    private func reviewContent(_ item: ListeningItem) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("你的选择：\(item.freeResponse ? written[item.id] ?? "" : choiceText(item, selected[item.id]))")
                .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.gray.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
            if !item.freeResponse {
                Text("正确答案：\(choiceText(item, item.answerIndex))")
                    .foregroundStyle(DeckTheme.accent).padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(DeckTheme.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
            }
            Divider()
            if let transcript = item.transcript, !transcript.isEmpty {
                Text("听力原文").font(.headline)
                JapaneseText(text: transcript, japanese: true, annotations: item.japaneseAnnotations ?? []).textSelection(.enabled)
            }
            if let translation = item.transcriptTranslation, !translation.isEmpty {
                DisclosureGroup("原文翻译") { Text(translation).foregroundStyle(.secondary).textSelection(.enabled) }
            }
            Divider()
            Text("答案解析").font(.headline)
            JapaneseText(text: item.explanation, explanation: true, annotations: item.japaneseAnnotations ?? []).textSelection(.enabled)
            ForEach(Array((item.choiceDetails ?? []).enumerated()), id: \.offset) { index, detail in
                DisclosureGroup("选项 \(index + 1)") {
                    if let text = detail.translation { Text(text) }
                    if let text = detail.explanation { JapaneseText(text: text, explanation: true, annotations: item.japaneseAnnotations ?? []) }
                }
            }
        }.lineSpacing(6)
    }
    private func choiceText(_ item: ListeningItem, _ index: Int?) -> String {
        guard let index, item.choices.indices.contains(index) else { return "未作答" }
        return "\(index + 1). \(item.choices[index])"
    }

    private var answerCard: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack {
                Text("答题卡").font(.title2.bold())
                Spacer()
                Text("\(answeredCount) / \(group.questions.count) 已答").font(.subheadline).foregroundStyle(.secondary)
                Button { showingCard = false } label: { Image(systemName: "xmark") }.accessibilityLabel("关闭答题卡")
            }
            ScrollView {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4), spacing: 12) {
                    ForEach(group.questions.indices, id: \.self) { number in
                        Button {
                            if phase == .review { reviewMistakes = false }
                            currentQuestion = number; showingCard = false
                        } label: { tile(number, results: revealed) }
                    }
                }.padding(4)
            }
            HStack(spacing: 24) {
                Label("已答", systemImage: "circle.fill").foregroundStyle(DeckTheme.accent)
                Label("未答", systemImage: "circle").foregroundStyle(.secondary)
            }.font(.caption)
        }.padding(24).presentationDetents([.medium, .large]).presentationDragIndicator(.visible).presentationBackground(Color.white)
    }
    private func tile(_ number: Int, results: Bool) -> some View {
        let item = group.questions[number]
        let highlighted = results ? !item.freeResponse && selected[item.id] != item.answerIndex : answered(item)
        return VStack(spacing: 4) {
            Text("\(number + 1)")
            if results { Image(systemName: item.freeResponse ? "minus" : selected[item.id] == item.answerIndex ? "checkmark" : "xmark") }
        }.font(.headline).frame(maxWidth: .infinity).frame(height: 62)
            .foregroundStyle(highlighted ? Color.white : Color.primary)
            .background(highlighted ? DeckTheme.accent : Color.gray.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
            .overlay { RoundedRectangle(cornerRadius: 10).stroke(currentQuestion == number ? DeckTheme.accent : Color.clear, lineWidth: 2).padding(-3) }
    }

    private var interruption: some View {
        VStack(spacing: 24) {
            Spacer()
            if phase == .paused {
                Image(systemName: "pause.fill").font(.system(size: 40)).foregroundStyle(.white)
                    .frame(width: 100, height: 100).background(DeckTheme.accent, in: Circle())
            }
            Text(phase == .paused ? "已暂停" : "继续上次练习").font(.title2.bold())
            Text("第 \(currentQuestion + 1) 题 · 已答 \(answeredCount) / \(group.questions.count)").foregroundStyle(.secondary)
            if phase == .resume { audioControls }
            Spacer()
            action("继续练习", primary: true) { phase = .answering }
            if phase == .paused {
                action("保存并退出", primary: false) { saveDraft(); dismiss() }
            } else {
                Button("重新开始") { restart() }.font(.headline).frame(minHeight: 44)
            }
        }.padding(24).frame(maxWidth: 760).frame(maxWidth: .infinity)
    }

    private var results: some View {
        ScrollView {
            VStack(spacing: 22) {
                Text("练习完成").font(.title2.bold())
                if !scored.isEmpty {
                    Text("\(Int((Double(correctCount) / Double(scored.count) * 100).rounded()))%")
                        .font(.system(size: 60, weight: .bold)).foregroundStyle(DeckTheme.accent)
                    Text("正确率").font(.subheadline).foregroundStyle(.secondary)
                }
                HStack {
                    metric("题目", group.questions.count)
                    metric("答对", correctCount)
                    metric("答错", mistakes.count)
                }
                if scored.count != group.questions.count { Text("另有 \(group.questions.count - scored.count) 道文字作答待自评，不计入正确率。").font(.caption).foregroundStyle(.secondary) }
                Divider()
                Text("答题结果").font(.headline).frame(maxWidth: .infinity, alignment: .leading)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4), spacing: 12) {
                    ForEach(group.questions.indices, id: \.self) { number in
                        Button { reviewMistakes = false; currentQuestion = number; phase = .review } label: { tile(number, results: true) }
                    }
                }
                action("查看错题", primary: true) { reviewMistakes = true; currentQuestion = mistakes.first ?? 0; phase = .review }.disabled(mistakes.isEmpty)
                Button("查看全部解析") { reviewMistakes = false; currentQuestion = 0; phase = .review }.frame(minHeight: 44)
                Button("重新练习") { restart() }.font(.headline).frame(minHeight: 44)
            }.padding(24).frame(maxWidth: 760).frame(maxWidth: .infinity)
        }
    }
    private func metric(_ title: String, _ count: Int) -> some View {
        VStack(spacing: 6) { Text("\(count)").font(.title.bold()); Text(title).font(.subheadline).foregroundStyle(.secondary) }.frame(maxWidth: .infinity)
    }
    private func action(_ title: String, primary: Bool, perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            Text(title).font(.headline).frame(maxWidth: .infinity).frame(minHeight: 52)
                .foregroundStyle(primary ? Color.white : title == "保存并退出" ? DeckTheme.accent : Color.secondary)
                .background(primary ? DeckTheme.accent : title == "保存并退出" ? Color.white : Color.gray.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
                .overlay { RoundedRectangle(cornerRadius: 10).stroke(title == "保存并退出" ? DeckTheme.accent : Color.clear) }
        }.buttonStyle(ListeningActionStyle())
    }
    private func move(_ offset: Int) {
        guard let index = pages.firstIndex(of: currentQuestion), pages.indices.contains(index + offset) else { return }
        withAnimation { currentQuestion = pages[index + offset] }
    }
    private func pause() { player?.pause(); playing = false; saveDraft(); phase = .paused }
    private func exitOrPause() { if phase == .answering { pause() } else { dismiss() } }
    private func restart() {
        player?.stop(); player?.currentTime = 0; audioTime = 0; playing = false
        selected = [:]; written = [:]; currentQuestion = 0; revealed = false
        sessionID = UUID().uuidString; reviewMistakes = false; phase = .answering
        UserDefaults.standard.removeObject(forKey: draftKey)
    }
    private func saveDraft() {
        guard !revealed, !group.questions.isEmpty else { return }
        let draft = ListeningDraft(questionSnapshots:group.questions,questionIDs: group.questions.map(\.id), currentQuestion: currentQuestion,
                                   selected: selected, written: written, audioTime: player?.currentTime ?? audioTime, sessionID: sessionID)
        if let data = try? JSONEncoder().encode(draft) { UserDefaults.standard.set(data, forKey: draftKey) }
    }
    private func restoreDraft() {
        guard phase == .answering, selected.isEmpty, written.isEmpty,
              let data = UserDefaults.standard.data(forKey: draftKey),
              let draft = try? JSONDecoder().decode(ListeningDraft.self, from: data),
              (draft.questionSnapshots?.indices.contains(draft.currentQuestion) ?? group.questions.indices.contains(draft.currentQuestion)) else { return }
        if let snapshots = draft.questionSnapshots { group = ListeningGroup(id:group.id,questions:snapshots) }
        guard draft.questionIDs == group.questions.map(\.id) else { return }
        selected = draft.selected; written = draft.written; currentQuestion = draft.currentQuestion
        audioTime = draft.audioTime; sessionID = draft.sessionID; phase = .resume
    }
    private func confirm() async {
        guard complete, !saving else { return }; saving = true; error = nil
        defer { saving = false }
        do {
            try await store.recordListening(group: group, sessionID: sessionID, selected: selected, written: written)
            revealed = true; player?.pause(); playing = false; phase = .results
            UserDefaults.standard.removeObject(forKey: draftKey)
        } catch { self.error = error.localizedDescription }
    }
    private func toggleAudio() async {
        if let player { if player.isPlaying { player.pause(); playing = false } else { playing = player.play() }; return }
        guard let item = group.questions.first else { return }
        loading = true; defer { loading = false }
        do {
            let data = try await store.audioData(for: item)
            guard visible, phase == .answering || phase == .review || phase == .resume else { return }
            let audio = try AVAudioPlayer(data: data); audio.currentTime = audioTime
            duration = audio.duration; player = audio; playing = audio.play(); error = nil
        } catch { self.error = error.localizedDescription }
    }
}

private struct ListeningActionStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.5)
    }
}

extension AppStore {
    func recordListening(group: ListeningGroup, sessionID: String, selected: [String: Int], written: [String: String]) async throws {
        let key = "listening-audio:\(group.id)"
        let previous = state.progress[key] ?? ProgressEntry()
        guard previous.lastPracticeSessionId != sessionID else { return }
        let answeredAt = Date.now.ISO8601Format()
        var responses: [String: LocalStudyResponse] = [:]
        for item in group.questions {
            let response: String
            let correct: Bool?
            if item.freeResponse {
                response = (written[item.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                guard !response.isEmpty else { throw IdentityError.message("请完成所有题目。") }
                correct = nil
            } else {
                guard let choice = selected[item.id], item.choices.indices.contains(choice) else { throw IdentityError.message("请选择有效选项。") }
                response = "\(choice + 1). \(item.choices[choice])"
                correct = choice == item.answerIndex
            }
            responses[item.id] = LocalStudyResponse(title: item.question, selected: response, correct: correct, answeredAt: answeredAt, sessionID: sessionID)
        }
        try saveAnswerLocally(questionID: "memory-card:\(key)", itemID: key, selected: "completed",
                              correct: true, progress: previous.afterListening(sessionID: sessionID), responses: responses)

    }
}
extension ProgressEntry {
    func afterListening(sessionID: String, now: Date = .now) -> Self {
        guard lastPracticeSessionId != sessionID else { return self }
        var next = self
        next.status = "learning"; next.reviewCount = (reviewCount ?? 0) + 1
        next.firstSeenAt = firstSeenAt ?? now.ISO8601Format(); next.lastReviewedAt = now.ISO8601Format(); next.lastPracticeSessionId = sessionID
        return next
    }
}
