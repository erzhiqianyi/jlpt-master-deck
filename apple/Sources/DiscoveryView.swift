import SwiftUI

struct DiscoveryShare: Codable, Identifiable {
    let id: String
    let title: String
    let kind: String
    let description: String
    let count: Int
    var icon: String { kind == "wordbook" ? "books.vertical" : kind == "listening" ? "headphones" : "doc.text" }
    var category: String { kind == "wordbook" ? "词书" : kind == "listening" ? "听力" : "练习" }
}

struct DiscoveryView: View {
    @Environment(AppStore.self) private var store
    @State private var query = ""
    var body: some View {
        Group {
            if store.shares.isEmpty {
                ContentUnavailableView("暂无发现内容", systemImage: "safari", description: Text(store.isDemo ? "登录后查看共享内容" : "联网同步后查看共享内容"))
            } else {
                List(store.shares.filter { query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) }) { share in
                    NavigationLink {
                        DiscoveryDetailView(share: share)
                    } label: {
                        DeckRow(title: share.title, subtitle: "\(share.category) · \(share.count) 项", icon: share.icon, showsChevron: false)
                    }.listRowBackground(DeckTheme.surface)
                }.scrollContentBackground(.hidden)
            }
        }.searchable(text: $query, prompt: "搜索发现")
    }
}

private struct DiscoveryDetailView: View {
    let share: DiscoveryShare
    @Environment(AppStore.self) private var store
    @State private var content: DiscoveryPackage?
    @State private var loading = false
    @State private var loadError: String?
    @State private var round: NativeRound?
    @State private var busy = false
    @State private var added = false
    @State private var message: String?
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 24) {
                Label(share.category, systemImage: share.icon).foregroundStyle(DeckTheme.accent)
                Text(share.title).font(.title.bold())
                Text("\(share.count) 项").foregroundStyle(.secondary)
                if !share.description.isEmpty { Text(share.description).lineSpacing(6) }
                Button(added ? "已添加" : busy ? "添加中…" : "添加到我的学习") {
                    busy = true
                    Task {
                        defer { busy = false }
                        do {
                            struct Input: Encodable { let shareId: String }
                            struct Result: Decodable {}
                            let _: Result = try await store.api.post("api/market/import", body: Input(shareId: share.id))
                            added = true
                            await store.refresh()
                            if let notice = store.notice { message = notice }
                        } catch { message = error.localizedDescription }
                    }
                }.buttonStyle(PrimaryButton()).disabled(busy || added)
                if let message { Text(message).font(.footnote).foregroundStyle(.secondary) }
                if loading { ProgressView("正在加载内容…") }
                if let loadError {
                    Text(loadError).foregroundStyle(.secondary)
                    Button("重新加载") { Task { await loadContent() } }
                }
                if let content {
                    let questions = content.practiceQuestions
                    if !questions.isEmpty {
                        Button("开始练习（\(questions.count) 题）") {
                            round = NativeRound(title: share.title, questions: questions)
                        }.buttonStyle(PrimaryButton())
                        Text("可直接试做，结果仅用于本轮反馈。添加到我的学习后可记录学习进度。")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    if let items = content.items, !items.isEmpty {
                        Text("内容预览").font(.title2.bold())
                        ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                            DeckPanel {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(item.original).font(.headline)
                                    if let reading = item.reading { Text(reading).foregroundStyle(.secondary) }
                                    if let meaning = item.meaning_zh { Text(meaning) }
                                }
                            }
                        }
                    }
                    if let questions = content.questions, !questions.isEmpty {
                        Text("题目预览").font(.title2.bold())
                        ForEach(Array(questions.enumerated()), id: \.offset) { index, question in
                            DeckPanel {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text("第 \(index + 1) 题").font(.headline)
                                    if let instruction = question.instruction { Text(instruction) }
                                    if let context = question.context, context != question.prompt { Text(context).lineSpacing(6) }
                                    Text(question.prompt ?? question.question ?? question.title ?? "")
                                    ForEach(Array((question.choices ?? []).enumerated()), id: \.offset) { number, choice in
                                        Text("\(number + 1). \(choice)")
                                    }
                                    DisclosureGroup("查看答案与解析") {
                                        VStack(alignment: .leading, spacing: 8) {
                                            Text(question.answer ?? question.answerIndex.map { "正确选项：\($0 + 1)" } ?? "参考解析")
                                            if let reason = question.correctReason ?? question.explanation { Text(reason) }
                                            if let translation = question.translationZh { Text(translation) }
                                            if let memory = question.memoryPoint { Text(memory) }
                                        }.frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                }.textSelection(.enabled)
                            }
                        }
                    }
                }

            }.modifier(StudyPagePadding())
        }.navigationTitle("发现").background(DeckTheme.paper)
            .task(id: share.id) { await loadContent() }
            .fullScreenCover(item: $round) { NativeQuizView(round: $0, savesProgress: false) }
    }

    private func loadContent() async {
        guard content == nil, !loading else { return }
        loading = true
        loadError = nil
        defer { loading = false }
        do {
            let result: DiscoveryDetail = try await store.api.get("api/market/\(share.id)")
            guard !Task.isCancelled else { return }
            content = result.package
        } catch {
            if !Task.isCancelled { loadError = error.localizedDescription }
        }
    }
}


// Shared snapshots deliberately omit the author's private item and question IDs.
struct DiscoveryDetail: Decodable { let package: DiscoveryPackage }
struct DiscoveryPackage: Decodable {
    let kind: String
    let title: String
    var items: [Item]?
    var questions: [Question]?
    struct Item: Decodable {
        let original: String
        var reading: String?
        var meaning_zh: String?
    }
    struct Question: Decodable {
        var kind: String?
        var title: String?
        var instruction: String?
        var prompt: String?
        var question: String?
        var choices: [String]?
        var answer: String?
        var answerIndex: Int?
        var context: String?
        var translationZh: String?
        var correctReason: String?
        var explanation: String?
        var memoryPoint: String?
        var choiceAnalysis: [NativeQuestion.Analysis]?
    }
    var practiceQuestions: [NativeQuestion] {
        guard kind == "practice" else { return [] }
        return (questions ?? []).enumerated().map { index, question in
            NativeQuestion(id: "shared-\(index)", itemId: "shared-\(index)",
                           kind: question.kind ?? "meaning", title: question.title ?? title,
                           prompt: question.prompt ?? "", choices: question.choices ?? [], answer: question.answer ?? "",
                           instruction: question.instruction, translationZh: question.translationZh,
                           context: question.context, correctReason: question.correctReason,
                           memoryPoint: question.memoryPoint, choiceAnalysis: question.choiceAnalysis)
        }.filter(\.isUsable)
    }
}
