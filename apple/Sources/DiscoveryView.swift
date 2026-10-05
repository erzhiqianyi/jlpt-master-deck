import SwiftUI

struct DiscoveryShare: Codable, Identifiable {
    let id: String
    let title: String
    let kind: String
    let description: String
    let count: Int
    var categories: [String]?
    var cover: String?
    var level: String?
    var coverTitle: String?
    var mine: Bool?
    var icon: String { kind == "wordbook" ? "books.vertical" : kind == "listening" ? "headphones" : "doc.text" }
    var category: String { kind == "wordbook" ? "词汇" : kind == "listening" ? "听力" : "练习" }
    var subjects: [String] {
        if let categories, !categories.isEmpty { return categories }
        if kind == "listening" { return ["listening"] }
        if title.range(of: "语法|文法|grammar", options: [.regularExpression, .caseInsensitive]) != nil { return ["grammar"] }
        return kind == "wordbook" ? ["vocabulary"] : []
    }
    var coverAsset: String {
        if let cover, ["stairs", "clock", "coffee", "gold"].contains(cover) { return "Discovery-" + cover }
        if title.range(of: "時間|时间|時点|time", options: [.regularExpression, .caseInsensitive]) != nil { return "Discovery-clock" }
        if title.range(of: "助词|助詞|particle", options: [.regularExpression, .caseInsensitive]) != nil { return "Discovery-gold" }
        return subjects.contains("vocabulary") ? "Discovery-coffee" : kind == "listening" ? "Discovery-clock" : "Discovery-stairs"
    }
    var displayLevel: String {
        if let level { return level }
        guard let range = title.range(of: "N[1-5]", options: [.regularExpression, .caseInsensitive]) else { return "" }
        return String(title[range]).uppercased()
    }
}

struct DiscoveryCover: View {
    let share: DiscoveryShare
    var detail = false
    var page: String?
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .topLeading) {
                Image(share.coverAsset).resizable().scaledToFill().frame(width: geometry.size.width, height: geometry.size.height).clipped()
                VStack(alignment: .leading, spacing: 12) {
                    Text(share.coverTitle ?? share.title).font(.system(size: detail ? 36 : min(28, geometry.size.width * 0.15), weight: .semibold, design: .serif)).lineLimit(detail ? 5 : 4)
                    if !share.displayLevel.isEmpty { Text(share.displayLevel).font(.system(size: detail ? 24 : 16, design: .serif)) }
                }.foregroundStyle(Color(red: 0.09, green: 0.16, blue: 0.17)).padding(.horizontal, geometry.size.width * 0.08).padding(.top, geometry.size.height * 0.14)
                if let page { Text(page).font(.caption).padding(.horizontal, 10).padding(.vertical, 5).foregroundStyle(.white).background(.black.opacity(0.4), in: Capsule()).frame(maxWidth: .infinity, alignment: .trailing).padding(12) }
            }.clipShape(RoundedRectangle(cornerRadius: 12))
        }.aspectRatio(2 / 3, contentMode: .fit).accessibilityHidden(true)
    }
}

struct DiscoveryView: View {
    @Environment(AppStore.self) private var store
    @State private var query = ""
    @State private var category = "all"
    @State private var showingSearch = false
    private var filtered: [DiscoveryShare] {
        store.shares.filter { (category == "all" || $0.subjects.contains(category)) && (query.isEmpty || ($0.title + " " + ($0.coverTitle ?? "") + " " + $0.description).localizedCaseInsensitiveContains(query)) }
    }
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    HStack(spacing: 26) {
                        ForEach([("all", "全部"), ("vocabulary", "词汇"), ("grammar", "语法"), ("listening", "听力")], id: \.0) { id, title in
                            Button { category = id } label: {
                                Text(title).font(.subheadline.weight(category == id ? .bold : .regular)).padding(.vertical, 12)
                                    .foregroundStyle(category == id ? DeckTheme.ink : DeckTheme.muted)
                                    .overlay(alignment: .bottom) { if category == id { Rectangle().fill(DeckTheme.green).frame(height: 3) } }
                            }.buttonStyle(.plain).accessibilityAddTraits(category == id ? .isSelected : [])
                        }
                    }
                    if filtered.isEmpty {
                        ContentUnavailableView(store.shares.isEmpty ? "暂无发现内容" : "暂无符合条件的分享", systemImage: "safari", description: Text(store.shares.isEmpty ? "联网同步后查看共享内容" : "试试其他分类或搜索词"))
                    } else {
                        let columns = geometry.size.width >= 1000 ? 4 : geometry.size.width >= 700 ? 3 : 2
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16), count: columns), alignment: .leading, spacing: 24) {
                            ForEach(filtered) { share in
                                NavigationLink(value: WorkspaceRoute.discovery(share.id)) {
                                    VStack(alignment: .leading, spacing: 8) {
                                        DiscoveryCover(share: share)
                                        Text(share.title).font(.subheadline.bold()).lineLimit(2).foregroundStyle(DeckTheme.ink)
                                        HStack(spacing: 4) {
                                            Image(systemName: "person.crop.circle.fill")
                                            Text(share.mine == true ? "我分享的内容" : "学习者分享").lineLimit(1)
                                            Spacer(minLength: 0)
                                            Text("\(share.count) \(share.kind == "wordbook" ? "词" : "题")").fixedSize()
                                        }.font(.caption2).foregroundStyle(DeckTheme.muted)
                                    }
                                }.buttonStyle(.plain).accessibilityIdentifier("discovery.\(share.id)")
                            }
                        }
                    }
                }.padding(20).frame(maxWidth: 1180).frame(maxWidth: .infinity)
            }
        }.toolbar { ToolbarItem(placement: .topBarLeading) {
            Button("搜索发现", systemImage: "magnifyingglass") { showingSearch = true }
        } }.sheet(isPresented: $showingSearch) {
            NavigationStack {
                Form { TextField("搜索发现", text: $query); Button("清除搜索") { query = "" } }
                    .navigationTitle("搜索发现").navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { showingSearch = false } } }
            }.presentationDetents([.medium])
        }
    }
}

struct DiscoveryDetailView: View {
    let share: DiscoveryShare
    @Environment(AppStore.self) private var store
    @State private var content: DiscoveryPackage?
    @State private var loading = false
    @State private var loadError: String?
    @State private var round: NativeRound?
    @State private var busy = false
    @State private var added = false
    @State private var message: String?
    @State private var descriptionExpanded = false
    @State private var page = 0
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if loading { ProgressView("正在加载内容…") }
                if let loadError { Text(loadError).foregroundStyle(.secondary); Button("重新加载") { Task { await loadContent() } } }
                if let content {
                    DiscoveryPreviewGallery(share: share, content: content, page: $page)
                } else { DiscoveryCover(share: share, detail: true).frame(maxWidth: 400).frame(maxWidth: .infinity) }
                Divider()
                HStack(alignment: .firstTextBaseline) {
                    Text(share.title).font(.title3.bold())
                    Spacer()
                    Text("\(share.count) \(share.kind == "wordbook" ? "词" : "题")").font(.subheadline).foregroundStyle(DeckTheme.muted).fixedSize()
                }
                Label(share.mine == true ? "我分享的内容" : "学习者分享", systemImage: "person.crop.circle.fill").foregroundStyle(DeckTheme.muted)
                if !share.description.isEmpty {
                    HStack(alignment: .top, spacing: 10) {
                        Text(share.description).font(.subheadline).lineSpacing(5).lineLimit(descriptionExpanded ? nil : 2).frame(maxWidth: .infinity, alignment: .leading)
                        Button(descriptionExpanded ? "收起" : "展开") { descriptionExpanded.toggle() }.font(.subheadline).foregroundStyle(DeckTheme.green).frame(minHeight: 44)
                    }
                }
                if let message { Text(message).font(.footnote).foregroundStyle(.secondary) }
            }.padding(20).frame(maxWidth: 780).frame(maxWidth: .infinity)
        }.navigationTitle("").navigationBarTitleDisplayMode(.inline).background(DeckTheme.paper)
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 8) {
                    if let content, content.kind == "practice" {
                        Button("开始练习") { round = NativeRound(title: share.title, questions: content.practiceQuestions) }
                            .buttonStyle(PrimaryButton()).disabled(content.practiceQuestions.isEmpty)
                        Text("试做不计入学习记录").font(.caption2).foregroundStyle(DeckTheme.muted)
                    } else if share.mine != true {
                        Button(added ? "已添加" : busy ? "添加中…" : "添加到我的学习") { addContent() }.buttonStyle(PrimaryButton()).disabled(busy || added || content == nil)
                    }
                }.padding(.horizontal, 20).padding(.vertical, 10).frame(maxWidth: 780).frame(maxWidth: .infinity).background(DeckTheme.paper)
            }
            .toolbar { if share.mine != true { ToolbarItem(placement: .topBarTrailing) {
                Button { addContent() } label: { Image(systemName: added ? "bookmark.fill" : "bookmark") }
                    .accessibilityLabel(added ? "已添加" : busy ? "添加中…" : "添加到我的学习").disabled(busy || added || content == nil)
            } } }
            .task(id: share.id) { await loadContent() }
            .fullScreenCover(item: $round) { NativeQuizView(round: $0, savesProgress: false) }
    }
    private func addContent() {
        guard !busy, !added else { return }
        busy = true
        Task {
            defer { busy = false }
            do {
                struct Input: Encodable { let shareId: String }
                struct Result: Decodable {}
                let _: Result = try await store.api.post("api/market/import", body: Input(shareId: share.id))
                added = true
                await store.refresh()
                message = store.notice ?? "已添加到我的学习"
            } catch { message = error.localizedDescription }
        }
    }
    private func loadContent() async {
        guard content == nil, !loading else { return }
        loading = true; loadError = nil
        defer { loading = false }
        do {
            let result: DiscoveryDetail = try await store.api.get("api/market/\(share.id)")
            guard !Task.isCancelled else { return }
            content = result.package
        } catch { if !Task.isCancelled { loadError = error.localizedDescription } }
    }
}

struct DiscoveryPreviewGallery: View {
    let share: DiscoveryShare
    let content: DiscoveryPackage
    @Binding var page: Int
    private var total: Int { 1 + (content.kind == "wordbook" ? content.items?.count ?? 0 : content.questions?.count ?? 0) }
    var body: some View {
        VStack(spacing: 8) {
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 16) {
                    DiscoveryCover(share: share, detail: true, page: "1 / \(total)").containerRelativeFrame(.horizontal).id(0)
                    if content.kind == "wordbook" {
                        ForEach(Array((content.items ?? []).enumerated()), id: \.offset) { index, item in
                            VStack(alignment: .leading, spacing: 20) {
                                Text("\(index + 2) / \(total)").font(.caption).foregroundStyle(DeckTheme.muted)
                                Text(item.original).font(.largeTitle.bold())
                                Text(item.reading ?? "").foregroundStyle(DeckTheme.muted)
                                Text(item.meaning_zh ?? "")
                                Spacer()
                                Text("仅预览，不记录答案").font(.caption).foregroundStyle(DeckTheme.muted)
                            }.padding(24).frame(minHeight: 460).containerRelativeFrame(.horizontal).background(DeckTheme.surface, in: RoundedRectangle(cornerRadius: 16)).id(index + 1)
                        }
                    } else {
                        ForEach(Array((content.questions ?? []).enumerated()), id: \.offset) { index, question in
                            DiscoveryQuestionPreview(question: question, index: index, total: total).containerRelativeFrame(.horizontal).id(index + 1)
                        }
                    }
                }.scrollTargetLayout()
            }.scrollIndicators(.hidden).scrollTargetBehavior(.viewAligned)
                .scrollPosition(id: Binding<Int?>(get: { page }, set: { if let value = $0 { page = value } }))
            HStack {
                Button { withAnimation { page = max(0, page - 1) } } label: { Image(systemName: "chevron.left").frame(width: 44, height: 36) }.disabled(page == 0).accessibilityLabel("上一页")
                Spacer()
                Text(page == 0 ? "左滑预览题目" : "\(page + 1) / \(total)").font(.caption).foregroundStyle(DeckTheme.muted)
                Spacer()
                Button { withAnimation { page = min(total - 1, page + 1) } } label: { Image(systemName: "chevron.right").frame(width: 44, height: 36) }.disabled(page == total - 1).accessibilityLabel("下一页")
            }
        }.frame(maxWidth: 420).frame(maxWidth: .infinity)
    }
}

struct DiscoveryQuestionPreview: View {
    let question: DiscoveryPackage.Question
    let index: Int
    let total: Int
    @State private var selected: Int?
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack { Text("第 \(index + 1) 题 · 预览"); Spacer(); Text("\(index + 2) / \(total)") }.font(.caption).foregroundStyle(DeckTheme.muted)
            Text(question.prompt ?? question.question ?? question.title ?? "").font(.title3.bold()).lineSpacing(6).padding(.vertical, 8)
            ForEach(Array((question.choices ?? []).enumerated()), id: \.offset) { number, choice in
                Button { selected = number } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: selected == number ? "largecircle.fill.circle" : "circle").foregroundStyle(DeckTheme.green)
                        Text(String(UnicodeScalar(65 + number)!))
                        Text(choice).frame(maxWidth: .infinity, alignment: .leading)
                    }.padding(14).frame(minHeight: 50).background(selected == number ? DeckTheme.green.opacity(0.06) : DeckTheme.surface, in: RoundedRectangle(cornerRadius: 9)).overlay(RoundedRectangle(cornerRadius: 9).stroke(selected == number ? DeckTheme.green : DeckTheme.line))
                }.buttonStyle(.plain).accessibilityAddTraits(selected == number ? .isSelected : [])
            }
            Spacer(minLength: 8)
            Text("仅预览，不记录答案").font(.caption2).foregroundStyle(DeckTheme.muted).frame(maxWidth: .infinity)
        }.padding(22).frame(minHeight: 460).background(DeckTheme.surface, in: RoundedRectangle(cornerRadius: 16)).overlay(RoundedRectangle(cornerRadius: 16).stroke(DeckTheme.line))
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
