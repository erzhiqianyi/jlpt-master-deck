import SwiftUI

struct DiscoveryShare: Codable, Identifiable {
    let id: String
    let title: String
    let kind: String
    let description: String
    let count: Int
    var categories: [String]?
    var cover: String?
    var coverUrl: String?
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
    @Environment(AppStore.self) private var store
    @State private var bitmap: UIImage?
    let share: DiscoveryShare
    var detail = false
    var page: String?
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .topLeading) {
                Group { if let bitmap { Image(uiImage: bitmap).resizable() } else { Image(share.coverAsset).resizable() } }.scaledToFill().frame(width: geometry.size.width, height: geometry.size.height).clipped()
                if share.coverUrl == nil { VStack(alignment: .leading, spacing: 12) {
                    Text(share.coverTitle ?? share.title).font(.system(size: detail ? 36 : min(28, geometry.size.width * 0.15), weight: .semibold, design: .serif)).lineLimit(detail ? 5 : 4)
                    if !share.displayLevel.isEmpty { Text(share.displayLevel).font(.system(size: detail ? 24 : 16, design: .serif)) }
                }.foregroundStyle(Color(red: 0.09, green: 0.16, blue: 0.17)).padding(.horizontal, geometry.size.width * 0.08).padding(.top, geometry.size.height * 0.14) }
                if let page { Text(page).font(.caption).padding(.horizontal, 10).padding(.vertical, 5).foregroundStyle(.white).background(.black.opacity(0.4), in: Capsule()).frame(maxWidth: .infinity, alignment: .trailing).padding(12) }
            }.clipShape(RoundedRectangle(cornerRadius: 12))
        }.aspectRatio(2 / 3, contentMode: .fit).accessibilityHidden(true)
            .task(id: "\(share.coverUrl ?? "")|\(store.session?.user.id ?? 0)") {
                bitmap = nil
                guard let url = share.coverUrl else { return }
                do { bitmap = try await store.loadImage(["url": url]) } catch { }
            }
    }
}

struct DiscoveryView: View {
    @Environment(AppStore.self) private var store
    @State private var query = ""
    @State private var category = "all"
    @State private var mineOnly = false
    @State private var showingSearch = false
    private var filtered: [DiscoveryShare] {
        store.shares.filter { (!mineOnly || $0.mine == true) && (category == "all" || $0.subjects.contains(category)) && (query.isEmpty || ($0.title + " " + ($0.coverTitle ?? "") + " " + $0.description).localizedCaseInsensitiveContains(query)) }
    }
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Picker("分享范围", selection: $mineOnly) {
                        Text("全部分享").tag(false)
                        Text("我的分享").tag(true)
                    }.pickerStyle(.segmented).accessibilityIdentifier("discovery.scope")
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
                                JapaneseText(text: item.original, japanese: true, terms: item.reading.map { [.init(text: item.original, reading: $0)] } ?? [], annotations: item.japanese_annotations ?? [], fontSize: 28, weight: .bold)
                                Text(item.reading ?? "").foregroundStyle(DeckTheme.muted)
                                JapaneseText(text: item.meaning_zh ?? "", explanation: true, annotations: item.japanese_annotations ?? [])
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
            JapaneseText(text: question.prompt ?? question.question ?? question.title ?? "", japanese: true, annotations: question.japaneseAnnotations ?? [], weight: .semibold).lineSpacing(6).padding(.vertical, 8)
            ForEach(Array((question.choices ?? []).enumerated()), id: \.offset) { number, choice in
                Button { selected = number } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: selected == number ? "largecircle.fill.circle" : "circle").foregroundStyle(DeckTheme.green)
                        Text(String(UnicodeScalar(65 + number)!))
                        JapaneseText(text: choice, japanese: true, annotations: question.japaneseAnnotations ?? []).frame(maxWidth: .infinity, alignment: .leading)
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
        var japanese_annotations: [JapaneseAnnotation]?
    }
    struct Question: Decodable {
        var japaneseAnnotations: [JapaneseAnnotation]?
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


// Editorial articles mirrored from scripts/build-community-articles.mjs.
struct NativeAIArticle: Identifiable {
    struct Section: Identifiable {
        let title: String
        let text: String
        var id: String { title }
    }
    let id: String
    let category: String
    let title: String
    let summary: String
    let cover: String
    let sections: [Section]
    var share: DiscoveryShare {
        DiscoveryShare(id: id, title: title, kind: "article", description: summary, count: 0, cover: cover)
    }
    static let all: [NativeAIArticle] = [
        .init(id: "ai-vocabulary-notes", category: "词汇", title: "把遇到的生词整理成可复习的词条", summary: "词汇模块实例：从一句包含「見落とす」的原句出发，让 AI 查重、补读音和用法，再保存到单词本并核对。", cover: "coffee", sections: [.init(title: "从一个具体问题开始", text: "看到一个不懂的词时，先保留原句，再整理词条。本文只做这一件事：把「見落とす」从一条学习记录变成能复习的词汇条目。"), .init(title: "学习场景", text: "例句：忙しくて、メールの重要な一文を見落としてしまった。这里的「見落とす」该怎么理解？"), .init(title: "示意产出", text: "一条可复习的记录可以写成：見落とす（みおとす）／动词／看漏、忽略本应注意到的内容。例句里的对象是“邮件中的重要一文”，因此要保留“本来应该看到却没注意到”的语境。对比「見逃す」时，列出各自更自然的句子，而不是只写“意思相同”。"), .init(title: "可以怎样请求 AI", text: "请通过 JLPT Master 检查我的词汇里是否已有「見落とす」。如果没有，保留原句作为来源，整理读音、中文释义、词性和两个自然的例句，说明它与「見逃す」的区别，保存到我的 N1 单词本。请返回实际保存的词条名称和位置；如果已有记录，先告诉我现有内容，再补充同一条。"), .init(title: "实际操作", text: "1. 先把原句和疑问保存在「输入记录」，或在请求里完整给出。只有一个孤立词时，AI 很难判断你遇到的是哪种用法。\n\n2. 让 AI 先查已有词条和单词本。词条已存在就更新同一条，避免同一个词散落成多个版本。\n\n3. 核对读音、释义和例句，再要求实际保存。聊天中写出一份漂亮解释，不代表单词本已经增加内容。"), .init(title: "在哪里检查结果", text: "打开「词汇」中的目标单词本，搜索「見落とす」。核对读音、来源句、释义和与「見逃す」的区别；再用它做一次复习。"), .init(title: "需要核对的地方", text: "「見落とす」与「見逃す」有重叠语境，示例区别只能作为待核对的学习说明。AI 应根据原句解释，不要把两者写成永远不能互换。")]),
        .init(id: "ai-grammar-comparison", category: "语法", title: "用一个易混点建立语法记录", summary: "语法模块实例：围绕「〜ならでは」建立记录，写清接续、语感和与相近表达的区别，再核对例句。", cover: "gold", sections: [.init(title: "从一个具体问题开始", text: "语法本不需要堆很多定义。一条有用的记录应回答：怎样接、在什么语境用、容易和什么混淆。本文用「〜ならでは」做完整示例。"), .init(title: "学习场景", text: "例句：京都ならではの風景を楽しんだ。问题是「ならでは」在这里强调什么，和「だけ」有什么不同？"), .init(title: "示意产出", text: "这条记录至少要有“名词＋ならではの＋名词”的接续、原句中“京都特有”的语感，以及一个能自然使用的例句。对比「京都だけの風景」时，解释两种说法的强调点；不要只把「ならでは」翻成“只有”就结束。"), .init(title: "可以怎样请求 AI", text: "请通过 JLPT Master 检查我的语法本里有没有「〜ならでは」。结合「京都ならではの風景を楽しんだ」，整理接续、中文意思、使用语境和两个自然例句。重点解释它与「〜だけ」在这个句子里的语感差异，不要说成绝对规则。保存到语法本，并告诉我保存位置与需要我核对的地方。"), .init(title: "实际操作", text: "1. 把要比较的两个表达和原句一起给出。只说“讲一下这个语法”，通常会得到过宽的解释。\n\n2. 要求 AI 分开写接续、核心语感和对比例句。例句要真的体现差异，不能只是把同一句机械替换。\n\n3. 查重后保存同一条语法记录；再打开网页核对读音、接续和例句是否自然。"), .init(title: "在哪里检查结果", text: "在「语法」的本子里搜索「ならでは」，检查接续与对比例句。若解释过于绝对，指出具体句子，请 AI 修正这一条记录。"), .init(title: "需要核对的地方", text: "语法差异常受上下文和语体影响。把 AI 的概括当成学习假设，用可靠例句和实际语境核对。")]),
        .init(id: "ai-reading-unknown-word", category: "阅读", title: "读文章时，把不认识的词带着上下文留下来", summary: "阅读模块实例：在文章中遇到「見込む」时，把句子与文章来源放进输入记录，再整理词义而不猜整篇文章。", cover: "stairs", sections: [.init(title: "从一个具体问题开始", text: "阅读中遇到的生词，离开上下文就容易记错。本文聚焦一个动作：把文章里的未知词连同原句保存，再决定是否整理成词条。"), .init(title: "学习场景", text: "示例句：来年度は利用者の増加を見込んでいる。只从这里判断，「見込む」表达的是怎样的预期？"), .init(title: "示意产出", text: "在这句里，「見込む」可以先理解为“预计、预期”，对象是来年使用者人数增加。词条中应保留这个原句和文章标题，再补一个不同搭配的例句。若文章标题、出处或上下文缺失，先保持输入记录待整理。"), .init(title: "可以怎样请求 AI", text: "请通过 JLPT Master 读取我刚标记的阅读输入记录，先引用其中的原句和文章标题。解释这句里的「見込む」，补充读音和两个不同语境的例句；检查词汇本是否已有记录。确认来源后再保存为词条，并返回目标本子和词条名称。没有文章上下文时不要推断全文观点。"), .init(title: "实际操作", text: "1. 在阅读页面选中不懂的词；必要时调整分词范围，再加入输入记录。队列会保留阅读来源和附近语境。\n\n2. 让 AI 读取待整理记录，引用原句并查已有词条。若分词错误或原句不全，先修正输入，不要直接保存。\n\n3. 整理后检查目标词条，再把输入记录标为已处理。保存队列并不会自动启动 AI。"), .init(title: "在哪里检查结果", text: "在「输入记录」确认这条记录的状态，再到词汇本搜索「見込む」。核对释义是否对应原句，而不是另一个常见义项。"), .init(title: "需要核对的地方", text: "示例句只支持局部词义。文章的事实、主张和出处应从全文核对；AI 不应凭一行摘录补出整篇内容。")]),
        .init(id: "ai-listening-shadowing", category: "听力", title: "用跟读录音找出没有听清的地方", summary: "听力模块实例：对照标准音频、完整听力原文和自己的跟读录音，定位差异并保存分析建议。", cover: "clock", sections: [.init(title: "从一个具体问题开始", text: "“我没听懂”太笼统。把标准音频、完整原文与自己的跟读录音放在同一个问题下，才能追问到底漏听了什么。本文只讨论这一次录音分析。"), .init(title: "学习场景", text: "示例：标准音频里说「そういうわけではないんですが」，自己回听时把「わけでは」漏成了「わけは」。这是示意句，并非真实录音的转写。"), .init(title: "示意产出", text: "分析记录应分为三栏：标准原文「そういうわけではないんですが」；从自己的录音实际听到的形式；可能漏听的「では」。下一步可以先不看文字听两遍，再对照文字跟读两遍。若录音听不清，第二栏应写“无法确认”，而不是补成完整句子。"), .init(title: "可以怎样请求 AI", text: "请通过 JLPT Master 找到我指定的听力题和最新跟读录音。若客户端获得了 audio:read 授权且能处理音频，请分别听标准音频与我的录音，对照该音频的完整原文，标出我漏听或读错的具体片段、可能的音变，并给出两轮复听练习。把实际听到的内容和推测分开；无法读取或辨认的部分请明确说明，不要编造转写。"), .init(title: "实际操作", text: "1. 在听力题中先确认标准音频和完整原文，再录一遍自己的跟读。选择具体题目与录音，避免 AI 分析错对象。\n\n2. 音频读取需要单独的 audio:read 授权，客户端还必须能处理返回的音频。请求 AI 先确认它实际读取了哪些素材。\n\n3. 把“听到的形式”“原文形式”和练习建议分开记录；回到题目中复听，核对 AI 的分析。"), .init(title: "在哪里检查结果", text: "在对应听力题的录音历史里查看分析。完整听力原文属于整段音频，单题解析只说明本题的依据和选项，别把原文重复塞进每道题。"), .init(title: "需要核对的地方", text: "音频工具返回的是音频，不会自动转写。听不清时应标为待核对；没有实际读取录音的 AI 不能声称已分析你的发音。")]),
        .init(id: "ai-daily-practice", category: "今日练习", title: "根据昨天的错题准备今天的一组练习", summary: "今日练习模块实例：先读取昨天的答题记录，再针对薄弱题型生成新的同类题，并核对正式练习是否保存。", cover: "coffee", sections: [.init(title: "从一个具体问题开始", text: "今天该练什么，最好从昨天实际做过的题开始。本文聚焦一个可检验的任务：用昨天的错题证据准备今天的一组针对练习。"), .init(title: "学习场景", text: "示例：昨天做了 12 题，其中 4 题错在汉字读音，2 题错在语法接续。数字只是说明输出格式，不代表你的真实记录。"), .init(title: "示意产出", text: "一份合格的准备结果会先写“2026 年某日，12 题，错 6 题；汉字读音错 4 题”，再说明为什么优先练读音。随后给出 8 道新的汉字读音题、正确答案和逐项解析。发布后要能在今日练习页找到标题与题数。"), .init(title: "可以怎样请求 AI", text: "请通过 JLPT Master 先读取东京时间昨天的答题记录，报告总题数、各题型错题数和最值得补的一类。针对这一类生成 8 道相同考查形式、不同语境的新题，每题给出答案和逐项解析，并保存为今天的正式练习。如果昨天没有作答，先说明情况，再查看更早的记录；不要虚构正确率或来源。最后返回练习标题和保存结果。"), .init(title: "实际操作", text: "1. 先让 AI 展示它读取到的日期、题数和错题分布。没有真实答题记录时，不能凭印象说你“最弱”的题型。\n\n2. 明确数量、题型与“相同考查形式、不同语境”。抽查新题是否只是原题换了几个字。\n\n3. 要求保存后，打开今天的练习卡片确认题目和解析实际出现，再开始答题。"), .init(title: "在哪里检查结果", text: "在首页「今日练习」查看新的一组题。聊天里的题目、草稿和正式练习是不同状态；以网页里的保存结果为准。"), .init(title: "需要核对的地方", text: "小样本只能提示方向。若昨天只做了少量题，要把样本不足写出来，不要把暂时的错题比例当成稳定弱点。")]),
        .init(id: "ai-study-plan", category: "备考计划", title: "把考试目标拆成做得完的每日任务", summary: "备考计划模块实例：输入考试日期、可用时间和教材进度，让 AI 生成具体日历任务，并保留已经完成的记录。", cover: "gold", sections: [.init(title: "从一个具体问题开始", text: "一份计划是否有用，关键是今天能否照着做。本文只解决计划的第一版：把考试目标、时间和教材位置变成可执行的每日任务。"), .init(title: "学习场景", text: "示例条件：准备 N1；每周可学 5 天，每天 45 分钟；语法书已经学到第 8 课。考试日期和教材页码应换成你自己的真实信息。"), .init(title: "示意产出", text: "一天的任务可以写成“第 9 课的接续整理 15 分钟＋本课习题 20 分钟＋错题回看 10 分钟；产出：记录 2 个易混接续并完成习题”。三项相加恰好 45 分钟。下一天应引用真实的教材课次，不能凭空写第 10 课的页码。"), .init(title: "可以怎样请求 AI", text: "请通过 JLPT Master 读取我的计划设置、现有任务和最近练习。以我实际保存的考试日期、每周可学天数、每天时长及教材进度为准，安排接下来两周的每日任务。每项任务写出具体教材课次或题型、预计分钟数和完成后的产出；每天总时长不能超过设定。先让我核对缺失的信息，再保存计划。已经完成的任务不要重排。"), .init(title: "实际操作", text: "1. 先在计划页保存考试日期、固定不能学习的时间、每天可用时长和教材起点。条件不完整时，请 AI 指出缺口。\n\n2. 让 AI 读取既有任务与最近练习，按天列出任务。检查每一天的分钟数是否加起来仍在可用时间内。\n\n3. 保存后打开日历，抽查第一周的教材范围、产出和休息安排。之后进度变化时只调整未来未完成任务。"), .init(title: "在哪里检查结果", text: "在「计划」的日历里查看逐日任务。任务应具体到课次、题型或页码，以及“完成问题、标出依据、回听错段”等可以确认的结果。"), .init(title: "需要核对的地方", text: "“每天学语法”不是可执行任务。若教材目录、日期或固定时间缺失，应先补资料，不要让 AI 自行编造课次和页码。")]),
        .init(id: "dots-jlpt-connection", category: "Dots 持续跟进", title: "接入 Dots，让它持续跟进你的 JLPT 弱点", summary: "Dots 与 JLPT Master 的持续协作实例：从真实答题记录建立一个学习目标，跨次跟进变化，并在需要决定时提出下一步。", cover: "stairs", sections: [.init(title: "从一个具体问题开始", text: "Dots 的价值不止于按点执行一次任务。把“改善 N1 听力跟读”交给它持续跟进，它可以结合后续记录与反馈调整下一步，并在需要你判断时回来询问。"), .init(title: "学习场景", text: "示例目标：你连续几次把听力跟读里的「ではない」听漏。第一天，Dots 读取相关练习与录音记录，指出它实际能确认的困难；你随后说“这周每天只有 20 分钟”。下一次有新练习记录或你反馈进展时，它据此调整复听建议。"), .init(title: "示意产出", text: "一次持续跟进会留下“目标：分辨「ではない」；依据：实际练习与录音；已尝试：两轮复听；待验证：下一次录音是否仍漏听”的简短状态。后来若错误减少，Dots 应说明证据与样本量，再提议换一个重点；若录音不可读，就请求授权或让你提供材料，而不是宣称已经听过。"), .init(title: "可以怎样请求 AI", text: "请把“改善我的 N1 听力跟读漏听”作为一项持续跟进的学习责任。先通过已授权的 JLPT Master 插件读取最近相关练习、完整原文和可访问的录音信息，明确哪些内容你实际取得了；总结一个可检验的弱点与下一次练习。以后在你获得新的学习记录或我补充反馈、且你获准继续工作时，对照上次目标和结果，判断是继续同一难点、调整练习，还是请我决定。只在进度出现有证据的变化、遇到阻碍或需要我决定时联系我；保留简短的目标与决策记录。先不要自动发布练习或设置每天固定时间；需要保证每天运行时，再请我确认日程。"), .init(title: "实际操作", text: "1. 确认 Dots 所用账号已安装并授权 JLPT Master 插件。先做一次只读查询，核对实际取得的练习、原文或录音信息。录音本身还需要相应权限和能处理音频的客户端。\n\n2. 给 Dots 一个持续目标和判断标准，例如“下一次跟读还会不会漏听「ではない」”，并说清什么时候需要它向你报告或征求决定。\n\n3. 回到 Activity 查看它后续做了什么，再到 JLPT Master 核对新练习与录音。你可以继续补充时间限制或更改目标，Dots 应沿用这些决定调整下一步。"), .init(title: "在哪里检查结果", text: "在 JLPT Master 的听力题与录音历史中核对它引用的材料；在 Dots 的 Activity 看目标、已做工作和待你决定的问题。下次继续对话时，可以直接修改目标，无须从头解释。"), .init(title: "需要核对的地方", text: "持续跟进不等于实时监听或自动改写学习记录。Dots 的主动研究只会读取获准信息；要固定时刻运行需保存日程，要响应事件需来源支持。个人数据仍需登录和授权。")]),
        .init(id: "dots-scheduled-practice", category: "定时任务", title: "定时任务：每天 7 点准备练习草稿", summary: "固定时间的任务实例：每天按东京时间读取 JLPT Master 的答题记录，生成可核对的 N1 练习草稿，并检查保存结果。", cover: "clock", sections: [.init(title: "从一个具体问题开始", text: "当你确实需要每天同一时间得到一份草稿，就保存一条日程。本文聚焦固定流程：读取前一天的答题记录、生成草稿、核对保存结果。"), .init(title: "学习场景", text: "示例目标：每天早上 7 点（Asia/Tokyo）根据前一天的 N1 错题，准备 8 道同题型的新题。若昨天没有作答，就报告缺口并查看更早的记录。"), .init(title: "示意产出", text: "一次可检查的运行应报告读取的日期、答题总数与错题分布，说明选题依据，给出练习草稿的实际保存位置。若历史记录不足或写入失败，应说明失败步骤，不能把聊天中的 8 道题当作“已保存”。"), .init(title: "可以怎样请求 AI", text: "请为我保存一条每日定时任务：每天早上 7:00（Asia/Tokyo），通过已授权的 JLPT Master 插件读取前一天的 N1 答题记录；如昨天没有作答，检查更早记录并说明依据。针对最有证据的薄弱题型，生成最多 8 道相同考查形式、不同语境的新题，含答案和逐项解析，保存到练习草稿，暂不发布为正式练习。来源不足时减少题量，不编造答题统计或教材出处。每次检查是否真的保存，把草稿标题和检查位置留在任务结果中；仅在授权失效、保存失败、题目需要我判断时通过 ChatGPT 提醒我。请确认已保存的日程、时区和下次运行时间。"), .init(title: "实际操作", text: "1. 先完成一次只读连接验证，再手动试做一份练习草稿，确认 Dots 可使用所需的读写权限，并在网页里找到草稿。\n\n2. 把上面的请求交给 Dots，请它确认已保存的日程、Asia/Tokyo 时区与下次运行时间；到 Dots 的 Scheduled 页面复核，不要只凭聊天回复判断定时已生效。\n\n3. 第一次运行后在 Activity 查看执行结果，并到 JLPT Master 的草稿页核对题目、答案、逐项解析和来源。若修改频率或暂停任务，到 Scheduled 中变更或停用。"), .init(title: "在哪里检查结果", text: "在「练习草稿」确认新草稿确实存在，再审题。草稿和今日正式练习是不同的状态；示例任务不会自动发布或替你作答。"), .init(title: "需要核对的地方", text: "这类任务按保存的日程尝试执行，但不会自动形成跨次的学习目标判断。若 Dots 将工作交给本机 Codex，电脑必须在线且 ChatGPT 桌面应用保持打开；一次运行完成也不等于写入成功，应核对实际草稿。")]),
    ]
}

struct NativeAICommunityView: View {
    @State private var category = "全部"
    @State private var query = ""
    private var categories: [String] { ["全部"] + NativeAIArticle.all.map(\.category) }
    private var articles: [NativeAIArticle] {
        NativeAIArticle.all.filter {
            (category == "全部" || $0.category == category) &&
            (query.isEmpty || ($0.title + $0.summary).localizedCaseInsensitiveContains(query))
        }
    }
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("和 AI 一起学日语").font(.title2.bold())
                        Text("阅读学习方法、实用案例与协作经验，找到适合自己的学习方式。")
                            .font(.subheadline).foregroundStyle(DeckTheme.muted)
                    }
                    NavigationLink { NativeAISettingsView() } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "point.3.connected.trianglepath.dotted")
                            VStack(alignment: .leading, spacing: 4) {
                                Text("接入 AI 与管理连接").font(.subheadline.bold())
                                Text("连接你的学习账户，开始一次 AI 协作").font(.caption).foregroundStyle(DeckTheme.muted)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                        }.padding(16).background(DeckTheme.surface, in: RoundedRectangle(cornerRadius: 16))
                    }.buttonStyle(.plain).accessibilityIdentifier("settings.ai.connections")
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 24) {
                            ForEach(categories, id: \.self) { value in
                                Button { category = value } label: {
                                    Text(value).font(.subheadline.weight(category == value ? .bold : .regular))
                                        .foregroundStyle(category == value ? DeckTheme.ink : DeckTheme.muted)
                                        .padding(.vertical, 12)
                                        .overlay(alignment: .bottom) {
                                            if category == value { Rectangle().fill(DeckTheme.green).frame(height: 3) }
                                        }
                                }.buttonStyle(.plain).accessibilityAddTraits(category == value ? .isSelected : [])
                            }
                        }
                    }
                    if articles.isEmpty {
                        ContentUnavailableView.search(text: query)
                    } else {
                        let columns = geometry.size.width >= 1000 ? 4 : geometry.size.width >= 700 ? 3 : 2
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16), count: columns), alignment: .leading, spacing: 26) {
                            ForEach(articles) { article in
                                NavigationLink { NativeAIArticleView(article: article) } label: {
                                    VStack(alignment: .leading, spacing: 8) {
                                        DiscoveryCover(share: article.share)
                                        Text(article.title).font(.subheadline.bold()).lineLimit(2).foregroundStyle(DeckTheme.ink)
                                        Text(article.summary).font(.caption).lineLimit(3).foregroundStyle(DeckTheme.muted)
                                        HStack(spacing: 4) {
                                            Image(systemName: "person.crop.circle.fill")
                                            Text("JLPT Master · 编辑精选")
                                        }.font(.caption2).foregroundStyle(DeckTheme.muted)
                                        Text(article.category).font(.caption2).foregroundStyle(DeckTheme.green)
                                    }.frame(maxWidth: .infinity, alignment: .leading)
                                }.buttonStyle(.plain).accessibilityIdentifier("ai.article." + article.id)
                            }
                        }
                    }
                }.padding(20).frame(maxWidth: 1200).frame(maxWidth: .infinity)
            }.background(DeckTheme.paper)
        }.navigationTitle("AI 学习社区").navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: "搜索学习方法与案例")
            .accessibilityIdentifier("ai.community")
    }
}

struct NativeAIArticleView: View {
    let article: NativeAIArticle
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                DiscoveryCover(share: article.share, detail: true).frame(maxWidth: 340).frame(maxWidth: .infinity)
                Text(article.category).font(.subheadline).foregroundStyle(DeckTheme.green)
                Text(article.title).font(.largeTitle.bold()).fixedSize(horizontal: false, vertical: true)
                Label("JLPT Master · 编辑内容", systemImage: "person.crop.circle").font(.caption).foregroundStyle(DeckTheme.muted)
                Text(article.summary).font(.title3).foregroundStyle(DeckTheme.muted)
                ForEach(article.sections) { section in
                    VStack(alignment: .leading, spacing: 12) {
                        Text(section.title).font(.title2.bold())
                        JapaneseText(text: section.text, explanation: true).font(.body).lineSpacing(6).textSelection(.enabled)
                        if section.title == "可以怎样请求 AI" {
                            Button("复制示例请求") { UIPasteboard.general.string = section.text }
                                .accessibilityIdentifier("ai.article.copyPrompt")
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    Divider()
                }
                NavigationLink { NativeAISettingsView() } label: { Label("接入 AI，试试这个方法", systemImage: "sparkles") }
            }.padding(24).frame(maxWidth: 760).frame(maxWidth: .infinity)
        }.background(DeckTheme.paper).navigationTitle("文章详情").navigationBarTitleDisplayMode(.inline)
    }
}
