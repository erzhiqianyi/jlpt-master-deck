import SwiftUI
import AVFoundation

struct ListeningEnvelope: Decodable { let questions: [ListeningItem] }
struct ListeningItem: Codable, Identifiable {
    let id: String; let title: String; let question: String; let explanation: String
    let questionTypeId: String; let choices: [String]; let answerIndex: Int
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
    static let types = [("all", "全部"), ("listening-task", "課題理解"), ("listening-points", "ポイント理解"), ("listening-outline", "概要理解"), ("listening-quick", "即時応答"), ("listening-integrated", "統合理解"), ("listening-basic-training", "基础训练")]
    var groups: [ListeningGroup] {
        ListeningGroup.make(store.listening).filter { group in
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
                        Picker("题型", selection: $type) { ForEach(Self.types, id: \.0) { Text($0.1).tag($0.0) } }
                    }.padding(.horizontal, 24)
                    if groups.isEmpty { ContentUnavailableView("暂无匹配的听力", systemImage: "headphones") }
                    List(groups) { group in
                        NavigationLink { ListeningDetailView(group: group) } label: {
                            DeckRow(title: group.title, subtitle: "\(group.questions.first?.audioReference ?? "") · \(group.questions.count) 道题 · 已练习 \(store.state.progress["listening-audio:\(group.id)"]?.reviewCount ?? 0) 次", icon: "headphones")
                        }
                    }.scrollContentBackground(.hidden)
                }.searchable(text: $query, prompt: "搜索听力标题或编号")
            }
        }
    }

}
struct ListeningDetailView: View {
    @Environment(AppStore.self) private var store
    let group: ListeningGroup
    @State private var player: AVAudioPlayer?
    @State private var loading = false
    @State private var playing = false
    @State private var error: String?
    @State private var selected: [String: Int] = [:]
    @State private var written: [String: String] = [:]
    @State private var revealed = false
    @State private var saving = false
    @State private var sessionID = UUID().uuidString
    var complete: Bool { group.questions.allSatisfy { $0.freeResponse ? !(written[$0.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty : selected[$0.id] != nil } }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text(group.title).font(.title.bold())
                Text("听音频，完成下方 \(group.questions.count) 道题后确认答案。").foregroundStyle(.secondary)
                HStack {
                    Button(loading ? "加载音频…" : playing ? "暂停" : "播放", systemImage: playing ? "pause.fill" : "play.fill") { Task { await toggleAudio() } }.disabled(loading)
                    Button("从头播放", systemImage: "backward.end.fill") { player?.currentTime = 0; player?.play(); playing = player != nil }.disabled(player == nil)
                }.buttonStyle(.bordered)
                ForEach(Array(group.questions.enumerated()), id: \.element.id) { number, item in
                    VStack(alignment: .leading, spacing: 16) {
                        Text("第 \(number + 1) 题").font(.headline)
                        Text(item.question).font(.title3).lineSpacing(6)
                        if item.freeResponse {
                            TextField("写下你的回答", text: Binding(get: { written[item.id] ?? "" }, set: { written[item.id] = $0 }), axis: .vertical).lineLimit(3...8).textFieldStyle(.roundedBorder).disabled(revealed || saving)
                        } else {
                            ForEach(Array(item.choices.enumerated()), id: \.offset) { index, choice in
                                Button { selected[item.id] = index } label: {
                                    HStack { Text("\(index + 1)."); Text(choice.isEmpty ? "选项 \(index + 1)（请听音频）" : choice); Spacer(); if selected[item.id] == index { Image(systemName: "checkmark.circle.fill") } }
                                        .padding(16).foregroundStyle(DeckTheme.ink).background(selected[item.id] == index ? DeckTheme.accent.opacity(0.12) : DeckTheme.surface, in: RoundedRectangle(cornerRadius: 10))
                                }.disabled(revealed || saving)
                            }
                        }
                        if revealed {
                            Text(item.freeResponse ? "请对照解析复盘你的回答" : selected[item.id] == item.answerIndex ? "回答正确" : "正确答案：\(item.answerIndex + 1)").font(.headline).foregroundStyle(DeckTheme.green)
                            Text(item.explanation).lineSpacing(6).textSelection(.enabled)
                            ForEach(Array((item.choiceDetails ?? []).enumerated()), id: \.offset) { index, detail in
                                VStack(alignment: .leading) { Text("选项 \(index + 1)").font(.subheadline.bold()); if let translation = detail.translation { Text(translation) }; if let explanation = detail.explanation { Text(explanation) } }.font(.subheadline)
                            }
                        }
                    }.padding(24).background(DeckTheme.surface, in: RoundedRectangle(cornerRadius: 16))
                }
                if let error { Text(error).foregroundStyle(.red) }
                if !revealed {
                    if !complete { Text("请完成所有题目后确认答案。").font(.caption).foregroundStyle(.secondary) }
                    Button(saving ? "正在保存…" : "确认本组答案") { Task { await confirm() } }.buttonStyle(PrimaryButton()).disabled(!complete || saving)
                } else {
                    DisclosureGroup("原文与译文") {
                        ForEach(group.questions) { item in
                            if let transcript = item.transcript, !transcript.isEmpty { Text(transcript).padding(.vertical, 8).textSelection(.enabled) }
                            if let translation = item.transcriptTranslation, !translation.isEmpty { Text(translation).foregroundStyle(.secondary).textSelection(.enabled) }
                        }
                    }
                    Button("再练一次") { selected = [:]; written = [:]; revealed = false; sessionID = UUID().uuidString; player?.stop(); player?.currentTime = 0; playing = false }.buttonStyle(.bordered)
                }
            }.frame(maxWidth: 900).modifier(StudyPagePadding()).frame(maxWidth: .infinity)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            DetailStudyCompanion(context: "听力：\(group.title)", captureTitle: "记录这段听力的疑问") {
                Button { Task { await toggleAudio() } } label: { Label(playing ? "暂停音频" : "播放音频", systemImage: playing ? "pause.fill" : "play.fill") }.disabled(loading)
                Button { player?.currentTime = 0; player?.play(); playing = player != nil } label: { Label("从头播放", systemImage: "backward.end.fill") }.disabled(player == nil)
            }
        }.background(DeckTheme.paper).navigationTitle("听力练习").navigationBarTitleDisplayMode(.inline).onDisappear { player?.stop(); playing = false }
    }
    private func confirm() async {
        guard complete, !saving else { return }; saving = true; error = nil
        defer { saving = false }
        do { try await store.recordListening(group: group, sessionID: sessionID, selected: selected, written: written); revealed = true }
        catch { self.error = error.localizedDescription }
    }
    private func toggleAudio() async {
        if let player { if player.isPlaying { player.pause(); playing = false } else { player.play(); playing = true }; return }
        guard let item = group.questions.first else { return }
        loading = true; defer { loading = false }
        do {
            let data = try await store.audioData(for: item)
            let audio = try AVAudioPlayer(data: data); player = audio; playing = audio.play(); error = nil
        } catch { self.error = error.localizedDescription }
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
