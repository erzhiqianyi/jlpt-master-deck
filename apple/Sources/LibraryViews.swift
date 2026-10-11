import SwiftUI

/// 題庫タブ：単語帳と知識点（端末に保存したもの）。検索は表記・読み・ローマ字・意味。
struct LibraryView: View {
    @Environment(AppStore.self) private var store
    @State private var query = ""
    var body: some View {
        List {
            SyncStatusBar()
            if query.isEmpty {
                Section("单词本") {
                    ForEach(store.wordbooks) { book in
                        NavigationLink(value: book) {
                            DeckRow(title: book.title, subtitle: String(localized: "\(book.stats.total) 个 · 待复习 \(book.stats.due) · 已掌握 \(book.stats.mastered)"), icon: "character.book.closed", showsChevron: false)
                        }
                    }
                    if store.wordbooks.isEmpty { Text(store.isOnline ? LocalizedStringKey("还没有单词本。同步后会出现在这里。") : LocalizedStringKey("离线中，还没有下载的单词本。")).foregroundStyle(DeckTheme.muted) }
                }
            } else {
                Section("搜索结果") { KnowledgeRows(items: KnowledgeSearch.filter(store.knowledge, query: query)) }
            }
        }
        .navigationTitle("题库")
        .searchable(text: $query, prompt: "写法、读音、罗马音或释义")
        .navigationDestination(for: Wordbook.self) { WordbookView(book: $0) }
        .navigationDestination(for: Knowledge.self) { KnowledgeDetailView(item: $0) }
        .refreshable { await store.refresh() }
    }
}

enum KnowledgeSearch {
    static func filter(_ items: [Knowledge], query: String) -> [Knowledge] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return items }
        return items.filter { item in
            [item.expression, item.reading, item.romaji, item.meaning?.text, item.meaningJa, item.code].compactMap { $0?.lowercased() }.contains { $0.contains(needle) }
                || item.alternateForms.contains { $0.contains(needle) } || item.conjugations.contains { $0.written == query }
        }
    }
}

struct KnowledgeRows: View {
    @Environment(AppStore.self) private var store
    let items: [Knowledge]
    var body: some View {
        ForEach(items.prefix(500)) { item in
            NavigationLink(value: item) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.expression).font(.system(size: 18 * store.textScale, weight: .semibold))
                        Text([item.reading, item.meaning?.text].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")).font(.subheadline).foregroundStyle(DeckTheme.muted).lineLimit(1)
                    }
                    Spacer()
                    StatusBadge(state: store.schedule(item.code))
                }
            }
        }
        if items.isEmpty { Text("没有找到").foregroundStyle(DeckTheme.muted) }
    }
}

struct StatusBadge: View {
    let state: ReviewState?
    var body: some View {
        let (label, color): (LocalizedStringKey, Color) = switch state?.status {
        case "mastered": ("已掌握", DeckTheme.green)
        case "review": ("复习中", Color(red: 0.28, green: 0.53, blue: 0.74))
        case "learning": ("学习中", DeckTheme.accent)
        default: ("未学", DeckTheme.muted)
        }
        Text(label).font(.caption).padding(.horizontal, 8).padding(.vertical, 3).foregroundStyle(color).background(color.opacity(0.1), in: Capsule())
    }
}

struct WordbookView: View {
    @Environment(AppStore.self) private var store
    let book: Wordbook
    @State private var kind = "all"
    @State private var query = ""
    var body: some View {
        let items = KnowledgeSearch.filter(store.knowledge.filter { $0.wordbook == book.code && (kind == "all" || $0.kind == kind) }, query: query)
        List {
            Picker("类别", selection: $kind) {
                Text("全部").tag("all"); Text("单词").tag("word"); Text("语法").tag("grammar"); Text("人名").tag("name")
            }.pickerStyle(.segmented)
            KnowledgeRows(items: items)
        }
        .navigationTitle(book.title)
        .searchable(text: $query)
    }
}

struct KnowledgeDetailView: View {
    @Environment(AppStore.self) private var store
    let item: Knowledge
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(item.expression).font(.system(size: 32 * store.textScale, weight: .bold))
                        if let reading = item.reading, !reading.isEmpty {
                            Text(store.settings.showRomaji && item.romaji != nil ? "\(reading)  \(item.romaji!)" : reading).foregroundStyle(DeckTheme.muted)
                        }
                    }
                    Spacer()
                    SpeechButton(text: item.kind == "word" ? (item.reading ?? item.expression) : item.expression, label: "朗读词条")
                }
                HStack { StatusBadge(state: store.schedule(item.code)); if let level = item.jlptLevel { Text(level.min == level.max ? level.min : "\(level.min)–\(level.max)").font(.caption).foregroundStyle(DeckTheme.muted) } }
                if let meaning = item.meaning { section("释义") { Text(meaning.text) } }
                if let ja = item.meaningJa, !ja.isEmpty { section("日语释义") { Text(ja) } }
                if let explanation = item.explanation { section("讲解") { Text(explanation.text) } }
                if !item.examples.isEmpty {
                    section("例句") {
                        ForEach(Array(item.examples.enumerated()), id: \.offset) { _, example in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(alignment: .firstTextBaseline) { Text(example.sentence).font(.system(size: 18 * store.textScale)); Spacer(); SpeechButton(text: example.sentence, label: "朗读例句") }
                                if let translation = example.translation { Text(translation.text).foregroundStyle(DeckTheme.muted) }
                            }
                        }
                    }
                }
                if !item.memoryPoints.isEmpty { section("记忆要点") { ForEach(Array(item.memoryPoints.enumerated()), id: \.offset) { Text("· " + $1.text) } } }
                if let id = item.memoryImage?.media { section("记忆图") { MemoryImageView(mediaId: id) } }
                if !item.patterns.isEmpty {
                    section("句型") {
                        ForEach(Array(item.patterns.enumerated()), id: \.offset) { _, pattern in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(pattern.pattern).fontWeight(.semibold)
                                if let meaning = pattern.meaning { Text(meaning.text).foregroundStyle(DeckTheme.muted) }
                                if let example = pattern.example { Text(example) }
                            }
                        }
                    }
                }
                if !item.conjugations.isEmpty {
                    section("活用") {
                        ForEach(item.conjugations, id: \.form) { c in
                            HStack { Text(c.label).foregroundStyle(DeckTheme.muted).frame(width: 110, alignment: .leading); Text(c.written); if let r = c.reading { Text(r).font(.caption).foregroundStyle(DeckTheme.muted) } }
                        }
                    }
                }
                if !item.comparisons.isEmpty {
                    section("辨析") { ForEach(Array(item.comparisons.enumerated()), id: \.offset) { _, c in Text("\(c.target)：\(c.difference?.text ?? "")") } }
                }
                if !item.notes.isEmpty {
                    section("补充") { ForEach(Array(item.notes.enumerated()), id: \.offset) { _, note in Text([note.title?.text, note.body?.text].compactMap { $0 }.joined(separator: "\n")) } }
                }
            }.modifier(StudyPagePadding()).frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(DeckTheme.paper)
        .navigationTitle(item.code)
        .navigationBarTitleDisplayMode(.inline)
    }
    private func section<Content: View>(_ title: LocalizedStringKey, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            content()
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
