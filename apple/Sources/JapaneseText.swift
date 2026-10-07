import SwiftUI
import UIKit
import CoreText
import NaturalLanguage

struct JapaneseAnnotation: Codable, Equatable {
    let text: String
    let tokens: [Token]
    struct Token: Codable, Equatable {
        let surface: String
        var reading: String?
        var pos: String?
        var isJapanese: Bool? = nil
        enum CodingKeys: String, CodingKey { case surface, reading, pos }
    }
    var isValid: Bool { !tokens.isEmpty && tokens.allSatisfy { !$0.surface.isEmpty } && tokens.map(\.surface).joined() == text }
}

struct JapaneseDisplay: Equatable {
    struct Style: Equatable { var mode: String; var color: String }
    static let categories = ["noun", "verb", "particle", "adjective"]
    static let labels = ["noun": "名词", "verb": "动词", "particle": "助词", "adjective": "形容词"]
    static let colors = ["noun": "#326B9C", "verb": "#B65340", "particle": "#8B5E9F", "adjective": "#4F7C5C"]
    var segmented = false
    var styles = Dictionary(uniqueKeysWithValues: categories.map { ($0, Style(mode: "underline", color: colors[$0]!)) })
    init(settings: [String: SettingValue]? = nil) {
        guard case .object(let value) = settings?["japaneseDisplay"] else { return }
        if case .bool(let enabled) = value["segmented"] { segmented = enabled }
        if case .object(let entries) = value["styles"] {
            for category in Self.categories {
                guard case .object(let entry) = entries[category] else { continue }
                if case .string(let mode) = entry["mode"], ["none", "underline", "text"].contains(mode) { styles[category]?.mode = mode }
                if case .string(let color) = entry["color"], UIColor(japaneseHex: color) != nil { styles[category]?.color = color }
            }
        }
    }
    var setting: SettingValue {
        .object(["segmented": .bool(segmented), "styles": .object(styles.mapValues { .object(["mode": .string($0.mode), "color": .string($0.color)]) })])
    }
}

extension UIColor {
    convenience init?(japaneseHex: String) {
        guard japaneseHex.range(of: "^#[0-9A-Fa-f]{6}$", options: .regularExpression) != nil,
              let value = Int(japaneseHex.dropFirst(), radix: 16) else { return nil }
        self.init(red: CGFloat((value >> 16) & 255) / 255, green: CGFloat((value >> 8) & 255) / 255, blue: CGFloat(value & 255) / 255, alpha: 1)
    }
    var japaneseHex: String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "#%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
    }
}

enum JapaneseAnalysis {
    typealias Token = JapaneseAnnotation.Token
    private final class Cached: NSObject { let tokens: [Token]; init(_ tokens: [Token]) { self.tokens = tokens } }
    private static let cache: NSCache<NSString, Cached> = { let cache = NSCache<NSString, Cached>(); cache.countLimit = 500; return cache }()
    static func containsKana(_ text: String) -> Bool { text.range(of: "[\\p{Hiragana}\\p{Katakana}]", options: .regularExpression) != nil }
    static func containsKanji(_ text: String) -> Bool { text.range(of: "[\\p{Han}]", options: .regularExpression) != nil }
    static func category(_ value: String?) -> String? {
        guard let value else { return nil }
        let noun = value.contains("名词") || value.contains("名詞") || value.lowercased().contains("noun")
        let verb = value.contains("动词") || value.contains("動詞") || value.lowercased().contains("verb")
        if noun && verb { return nil }
        if value.contains("形容") || value.lowercased().contains("adjective") { return "adjective" }
        if value.contains("副") || value.lowercased().contains("adverb") { return "adverb" }
        if value.contains("助词") || value.contains("助詞") || value == "particle" { return "particle" }
        if value.contains("动词") || value.contains("動詞") || value.lowercased().contains("verb") { return "verb" }
        if value.contains("名词") || value.contains("名詞") || value.lowercased().contains("noun") { return "noun" }
        return nil
    }

    /// Authored annotations always win. Invalid/stale records are ignored, never applied to different text.
    static func tokens(_ text: String, japanese: Bool, annotations: [JapaneseAnnotation], items: [StudyItem], terms: [StudyItem.ReadingTerm]) -> [Token] {
        if let authored = annotations.first(where: { $0.text == text && $0.isValid }) { return authored.tokens.map { var token = $0; token.isJapanese = token.surface.range(of: "[\\p{Han}\\p{Hiragana}\\p{Katakana}]", options: .regularExpression) != nil; return token } }
        var dictionary: [Token] = terms.map { Token(surface: $0.text, reading: $0.reading) }
        for item in items {
            dictionary.append(Token(surface: item.original, reading: item.reading, pos: category(item.part_of_speech), isJapanese: true))
            for form in item.conjugations ?? [] {
                if let surface = form.form { dictionary.append(Token(surface: surface, reading: form.reading, pos: category(item.part_of_speech))) }
            }
            dictionary.append(contentsOf: (item.ruby_terms ?? []).map { Token(surface: $0.text, reading: $0.reading) })
        }
        // Filter before enriching POS so large libraries do not trigger quadratic scans.
        dictionary = dictionary.filter { !$0.surface.isEmpty && text.contains($0.surface) }
        // Source-specific terms precede dictionary homographs.
        var seen = Set<String>()
        dictionary = dictionary.map { token in
            var value = token
            if value.pos == nil { value.pos = dictionary.first { $0.surface == token.surface && $0.pos != nil }?.pos }
            return value
        }
        dictionary = dictionary.filter { !$0.surface.isEmpty && text.contains($0.surface) && seen.insert($0.surface).inserted }
            .sorted { $0.surface.count > $1.surface.count }
        let spans = annotations.filter { $0.isValid && text.contains($0.text) }.sorted { $0.text.count > $1.text.count }
        let base = fallback(text, japanese: japanese)
        var result: [Token] = [], cursor = text.startIndex
        while cursor < text.endIndex {
            if let span = spans.first(where: { text[cursor...].hasPrefix($0.text) }) {
                result += span.tokens.map { var token = $0; token.isJapanese = true; return token }
                cursor = text.index(cursor, offsetBy: span.text.count); continue
            }
            if let term = dictionary.first(where: { text[cursor...].hasPrefix($0.surface) }) {
                result.append(term); cursor = text.index(cursor, offsetBy: term.surface.count); continue
            }
            let remaining = String(text[cursor...])
            // Recover fallback token at this boundary, splitting only for an explicit dictionary term.
            let consumed = text.distance(from: text.startIndex, to: cursor)
            var count = 0
            let token = base.first { token in defer { count += token.surface.count }; return count + token.surface.count > consumed }
            let available = token.map { _ in max(1, count - consumed) } ?? 1
            var length = min(available, remaining.count)
            for offset in 1..<length {
                let next = text.index(cursor, offsetBy: offset)
                if dictionary.contains(where: { text[next...].hasPrefix($0.surface) }) || spans.contains(where: { text[next...].hasPrefix($0.text) }) { length = offset; break }
            }
            let end = text.index(cursor, offsetBy: length)
            let surface = String(text[cursor..<end])
            result.append(Token(surface: surface, reading: surface == token?.surface ? token?.reading : nil, pos: surface == token?.surface ? token?.pos : nil, isJapanese: token?.isJapanese))
            cursor = end
        }
        return result
    }
    private static func fallback(_ text: String, japanese: Bool) -> [Token] {
        let key = (japanese ? "ja:" : "mixed:") + text
        if let hit = cache.object(forKey: key as NSString) { return hit.tokens }
        let source = text as NSString
        let regex = try! NSRegularExpression(pattern: "[\\p{Han}\\p{Hiragana}\\p{Katakana}ー々]+")
        var result: [Token] = [], cursor = 0
        for match in regex.matches(in: text, range: NSRange(location: 0, length: source.length)) {
            if match.range.location > cursor { result.append(Token(surface: source.substring(with: NSRange(location: cursor, length: match.range.location - cursor)))) }
            let run = source.substring(with: match.range)
            if japanese || containsKana(run) { result += japaneseRun(run) }
            else { result.append(Token(surface: run)) }
            cursor = NSMaxRange(match.range)
        }
        if cursor < source.length { result.append(Token(surface: source.substring(from: cursor))) }
        cache.setObject(Cached(result), forKey: key as NSString)
        return result
    }
    private static func japaneseRun(_ text: String) -> [Token] {
        let tokenizer = NLTokenizer(unit: .word); tokenizer.string = text; tokenizer.setLanguage(.japanese)
        let supportsPOS = NLTagger.availableTagSchemes(for: .word, language: .japanese).contains(.lexicalClass)
        let tagger = NLTagger(tagSchemes: supportsPOS ? [.lexicalClass] : []); tagger.string = text
        tagger.setLanguage(.japanese, range: text.startIndex..<text.endIndex)
        let particles: Set<String> = ["は", "が", "を", "に", "で", "へ", "と", "の", "も", "や", "から", "まで", "より", "ね", "よ"]
        var result: [Token] = [], cursor = text.startIndex
        tokenizer.enumerateTokens(in: text.startIndex..<text.endIndex) { range, _ in
            if cursor < range.lowerBound { result.append(Token(surface: String(text[cursor..<range.lowerBound]))) }
            let surface = String(text[range])
            var pos: String?
            if supportsPOS {
                let tag = tagger.tag(at: range.lowerBound, unit: .word, scheme: .lexicalClass).0
                pos = [.noun: "noun", .verb: "verb", .adjective: "adjective", .particle: "particle", .adverb: "adverb"][tag ?? .otherWord]
            }
            if pos == nil && particles.contains(surface) { pos = "particle" }
            result.append(Token(surface: surface, pos: pos, isJapanese: true)); cursor = range.upperBound
            return true
        }
        if cursor < text.endIndex { result.append(Token(surface: String(text[cursor...]))) }
        return result
    }
}

/// Core Text lays out real ruby above the base glyphs, including multiline Japanese.
private struct JapaneseStudyHintsEnabledKey: EnvironmentKey { static let defaultValue = true }
private struct JapaneseExplanationModeKey: EnvironmentKey { static let defaultValue = false }
private struct JapaneseLookupEnabledKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    var japaneseStudyHintsEnabled: Bool {
        get { self[JapaneseStudyHintsEnabledKey.self] }
        set { self[JapaneseStudyHintsEnabledKey.self] = newValue }
    }
    var japaneseExplanationMode: Bool {
        get { self[JapaneseExplanationModeKey.self] }
        set { self[JapaneseExplanationModeKey.self] = newValue }
    }
    var japaneseLookupEnabled: Bool {
        get { self[JapaneseLookupEnabledKey.self] }
        set { self[JapaneseLookupEnabledKey.self] = newValue }
    }
}
private struct JapaneseLookupSelection: Identifiable {
    let id = UUID()
    let word: String
    let context: String
}

struct JapaneseText: View {
    @Environment(AppStore.self) private var store
    @Environment(\.japaneseStudyHintsEnabled) private var hintsEnabled
    @Environment(\.japaneseExplanationMode) private var explanationMode
    @Environment(\.japaneseLookupEnabled) private var lookupEnabled
    @State private var lookupSelection: JapaneseLookupSelection?
    @ScaledMetric(relativeTo: .body) private var scaledSize: CGFloat = 17
    let text: String
    var item: StudyItem? = nil
    var japanese = false
    var explanation = false
    var allowsRuby = true
    var terms: [StudyItem.ReadingTerm] = []
    var annotations: [JapaneseAnnotation] = []
    var fontSize: CGFloat? = nil
    var alignment: NSTextAlignment = .left
    var weight: UIFont.Weight = .regular
    var color: UIColor = UIColor(red: 0.188, green: 0.188, blue: 0.176, alpha: 1)
    var target: String? = nil
    var targetRange: NSRange? = nil
    var displayOverride: JapaneseDisplay? = nil
    var rubyOverride: Bool? = nil
    var body: some View {
        let display = hintsEnabled ? (displayOverride ?? JapaneseDisplay(settings: store.state.settings)) : JapaneseDisplay()
        let ruby = hintsEnabled && allowsRuby && (rubyOverride ?? store.displayFlag(explanation || explanationMode ? "showExplanationRuby" : "showReviewRuby"))
        let needsAnalysis = display.segmented || ruby || lookupEnabled
        let sourceAnnotations = annotations + (item?.japanese_annotations ?? [])
        let dictionary = needsAnalysis ? (item.map { current in [current] + store.items.filter { $0.id != current.id } } ?? store.items) : []
        let tokens: [JapaneseAnnotation.Token] = needsAnalysis
            ? JapaneseAnalysis.tokens(text, japanese: japanese, annotations: sourceAnnotations, items: dictionary, terms: terms + (item?.ruby_terms ?? []))
            : [.init(surface: text)]
        CoreJapaneseText(attributed: JapaneseAttributed.make(tokens: tokens, display: display, ruby: ruby,
            font: .systemFont(ofSize: fontSize ?? scaledSize, weight: weight), color: color, target: target, targetRange: targetRange, alignment: alignment), source: text, onLookup: lookupEnabled ? { word in
                lookupSelection = JapaneseLookupSelection(word: word, context: "复习卡片 · \(item?.original ?? "日语内容")\n\(text)")
            } : nil)
            .accessibilityLabel(text)
            .sheet(item: $lookupSelection) { selection in NativeWordLookupView(word: selection.word, context: selection.context) }
    }
}

enum JapaneseAttributed {
    static func rubyBase(surface: String, reading: String) -> (range: NSRange, reading: String) {
        var base = surface, kana = reading, prefix = ""
        // Keep literal okurigana and honorific prefixes on the baseline.
        while let first = base.first, JapaneseAnalysis.containsKana(String(first)), kana.hasPrefix(String(first)) {
            prefix.append(base.removeFirst()); kana.removeFirst()
        }
        while let last = base.last, JapaneseAnalysis.containsKana(String(last)), kana.hasSuffix(String(last)) {
            base.removeLast(); kana.removeLast()
        }
        guard JapaneseAnalysis.containsKanji(base), !kana.isEmpty else { return (NSRange(location: 0, length: (surface as NSString).length), reading) }
        return (NSRange(location: (prefix as NSString).length, length: (base as NSString).length), kana)
    }

    static func make(tokens: [JapaneseAnnotation.Token], display: JapaneseDisplay, ruby: Bool, font: UIFont, color: UIColor, target: String? = nil, targetRange: NSRange? = nil, alignment: NSTextAlignment = .left) -> NSAttributedString {
        let value = NSMutableAttributedString(string: "")
        var sourceOffset = 0
        for (index, token) in tokens.enumerated() {
            let word = NSMutableAttributedString(string: token.surface, attributes: [.font: font, .foregroundColor: color])
            let range = NSRange(location: 0, length: word.length)
            if token.isJapanese == true || token.reading != nil || JapaneseAnalysis.containsKana(token.surface) {
                word.addAttribute(NSAttributedString.Key("JapaneseLookupWord"), value: token.surface, range: range)
            }
            if display.segmented, let pos = token.pos, let style = display.styles[pos], let tint = UIColor(japaneseHex: style.color) {
                if style.mode == "text" { word.addAttribute(.foregroundColor, value: tint, range: range) }
                if style.mode == "underline" {
                    word.addAttributes([.underlineStyle: NSUnderlineStyle.single.rawValue, .underlineColor: tint], range: range)
                }
            }
            if ruby, JapaneseAnalysis.containsKanji(token.surface), let reading = token.reading,
               reading != token.surface, reading.range(of: "^[\\p{Hiragana}\\p{Katakana}ー・\\s]+$", options: .regularExpression) != nil {
                let rubyRange = rubyBase(surface: token.surface, reading: reading)
                let aligned = CTRubyAnnotationCreateWithAttributes(.center, .none, .before, rubyRange.reading as CFString,
                    [kCTFontAttributeName: CTFontCreateWithName(font.fontName as CFString, font.pointSize * 0.5, nil),
                     kCTForegroundColorAttributeName: color.cgColor] as CFDictionary)
                word.addAttribute(NSAttributedString.Key(kCTRubyAnnotationAttributeName as String), value: aligned, range: rubyRange.range)
            }
            if let targetRange {
                let intersection = NSIntersectionRange(targetRange, NSRange(location: sourceOffset, length: word.length))
                if intersection.length > 0 { word.addAttributes([.underlineStyle: NSUnderlineStyle.single.rawValue, .underlineColor: UIColor.systemRed], range: NSRange(location: intersection.location - sourceOffset, length: intersection.length)) }
            }
            sourceOffset += word.length
            value.append(word)
            if display.segmented, index + 1 < tokens.count, token.surface.last?.isWhitespace == false,
               tokens[index + 1].surface.first?.isWhitespace == false,
               token.surface.range(of: "[\\p{Han}\\p{Hiragana}\\p{Katakana}]$", options: .regularExpression) != nil,
               tokens[index + 1].surface.range(of: "^[\\p{Han}\\p{Hiragana}\\p{Katakana}]", options: .regularExpression) != nil {
                // Do not add gaps inside mixed Chinese notes that were deliberately left unanalyzed.
                if (token.isJapanese ?? (token.pos != nil || token.reading != nil)) && (tokens[index + 1].isJapanese ?? (tokens[index + 1].pos != nil || tokens[index + 1].reading != nil)) {
                    value.append(NSAttributedString(string: "\u{2009}", attributes: [.font: font]))
                }
            }
        }
        if targetRange == nil, let target, !target.isEmpty {
            // Target marking in a reading question remains visible even with vocabulary styling enabled.
            let range = (value.string as NSString).range(of: target)
            if range.location != NSNotFound { value.addAttributes([.underlineStyle: NSUnderlineStyle.single.rawValue, .underlineColor: UIColor.systemRed], range: range) }
        }
        let paragraph = NSMutableParagraphStyle(); paragraph.alignment = alignment; paragraph.lineSpacing = 5; paragraph.lineBreakMode = .byCharWrapping
        value.addAttribute(.paragraphStyle, value: paragraph, range: NSRange(location: 0, length: value.length))
        return value
    }
}

private struct CoreJapaneseText: UIViewRepresentable {
    let attributed: NSAttributedString
    let source: String
    var onLookup: ((String) -> Void)?
    func makeUIView(context: Context) -> JapaneseTextCanvas { JapaneseTextCanvas() }
    func updateUIView(_ view: JapaneseTextCanvas, context: Context) { view.attributed = attributed; view.source = source; view.onLookup = onLookup; view.accessibilityLabel = source }
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: JapaneseTextCanvas, context: Context) -> CGSize? {
        uiView.fitting(width: max(1, proposal.width ?? 760))
    }
}

final class JapaneseTextCanvas: UIView, UIContextMenuInteractionDelegate {
    var attributed = NSAttributedString(string: "") { didSet { invalidateIntrinsicContentSize(); setNeedsDisplay() } }
    var source = ""
    var onLookup: ((String) -> Void)? {
        didSet { lookupGesture.isEnabled = onLookup != nil }
    }
    private lazy var lookupGesture = UITapGestureRecognizer(target: self, action: #selector(lookupTapped(_:)))
    override init(frame: CGRect) {
        super.init(frame: frame); backgroundColor = .clear; isOpaque = false; isAccessibilityElement = true; accessibilityTraits = .staticText
        addInteraction(UIContextMenuInteraction(delegate: self))
        lookupGesture.isEnabled = false
        addGestureRecognizer(lookupGesture)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    func fitting(width: CGFloat) -> CGSize {
        let framesetter = CTFramesetterCreateWithAttributedString(attributed)
        let size = CTFramesetterSuggestFrameSizeWithConstraints(framesetter, CFRange(), nil, CGSize(width: width, height: .greatestFiniteMagnitude), nil)
        return CGSize(width: width, height: ceil(size.height) + 4)
    }
    override func draw(_ rect: CGRect) {
        guard let context = UIGraphicsGetCurrentContext(), attributed.length > 0 else { return }
        context.textMatrix = .identity; context.translateBy(x: 0, y: bounds.height); context.scaleBy(x: 1, y: -1)
        let frame = CTFramesetterCreateFrame(CTFramesetterCreateWithAttributedString(attributed), CFRange(), CGPath(rect: bounds, transform: nil), nil)
        CTFrameDraw(frame, context)
    }
    @objc private func lookupTapped(_ recognizer: UITapGestureRecognizer) {
        guard let onLookup, attributed.length > 0 else { return }
        let point = recognizer.location(in: self)
        let frame = CTFramesetterCreateFrame(CTFramesetterCreateWithAttributedString(attributed), CFRange(), CGPath(rect: bounds, transform: nil), nil)
        let lines = CTFrameGetLines(frame) as! [CTLine]
        var origins = Array(repeating: CGPoint.zero, count: lines.count)
        CTFrameGetLineOrigins(frame, CFRange(), &origins)
        let flipped = CGPoint(x: point.x, y: bounds.height - point.y)
        for (number, line) in lines.enumerated() {
            var ascent: CGFloat = 0, descent: CGFloat = 0
            let width = CTLineGetTypographicBounds(line, &ascent, &descent, nil)
            let origin = origins[number]
            guard CGRect(x: origin.x, y: origin.y - descent, width: CGFloat(width), height: ascent + descent).contains(flipped) else { continue }
            let index = CTLineGetStringIndexForPosition(line, CGPoint(x: flipped.x - origin.x, y: flipped.y - origin.y))
            guard index >= 0, index < attributed.length,
                  let word = attributed.attribute(NSAttributedString.Key("JapaneseLookupWord"), at: index, effectiveRange: nil) as? String else { return }
            onLookup(word); return
        }
    }
    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
        UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { _ in
            UIMenu(children: [UIAction(title: "复制原文", image: UIImage(systemName: "doc.on.doc")) { [weak self] _ in UIPasteboard.general.string = self?.source }])
        }
    }
}

struct NativeWordLookupView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var word: String
    let context: String
    @State private var saving = false
    @State private var savedWords: Set<String> = []
    @State private var error: String?
    private var query: String { word.precomposedStringWithCompatibilityMapping.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var matches: [StudyItem] {
        store.items.filter { item in
            ([item.original, item.reading ?? ""] + (item.conjugations ?? []).compactMap(\.form))
                .contains { $0.precomposedStringWithCompatibilityMapping == query }
        }
    }
    private var queued: Bool {
        savedWords.contains(query) || store.captures.contains { $0.category == "word" && ($0.status == nil || $0.status == "inbox") && $0.body.precomposedStringWithCompatibilityMapping.trimmingCharacters(in: .whitespacesAndNewlines) == query }
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("查询词（可修改）") { TextField("日语单词", text: $word).disabled(saving).accessibilityIdentifier("review.lookup.query") }
                Section("释义") {
                    if matches.isEmpty { Text("暂无释义，可加入待解析队列。") }
                    ForEach(matches) { item in
                        VStack(alignment: .leading, spacing: 8) {
                            if let reading = item.reading { Text(reading).foregroundStyle(DeckTheme.muted) }
                            Text(item.meaning_zh ?? item.meaning_ja ?? "暂无释义")
                            NativeSpeechControls(text: item.reading ?? item.original, label: "读音")
                        }
                    }
                }
                if matches.isEmpty {
                    Section {
                        Button(saving ? "正在加入…" : queued ? "已加入待解析队列" : "加入待解析队列") {
                            guard matches.isEmpty, !query.isEmpty, !queued, !saving else { return }
                            let requested = query
                            saving = true; error = nil
                            Task {
                                defer { saving = false }
                                do {
                                    try await store.capture(.init(body: requested, category: "word", context: "点词查询\n原文：\(context)\n请结合上下文确认词义与辞书形，通过 MCP 解析并加入词库。"))
                                    savedWords.insert(requested)
                                } catch { self.error = error.localizedDescription }
                            }
                        }.disabled(query.isEmpty || saving || queued).accessibilityIdentifier("review.lookup.enqueue")
                        if let error { Text(error).foregroundStyle(.red) }
                    }
                    Section("原文上下文") { Text(context) }
                }
            }.navigationTitle("单词查询")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("关闭") { dismiss() }.disabled(saving) } }
        }.interactiveDismissDisabled(saving).environment(\.japaneseLookupEnabled, false)
    }
}
