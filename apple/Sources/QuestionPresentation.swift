import SwiftUI
import UIKit

/// Decodes the existing schema-v1 bank payload, including its authored legacy fields.
/// These are versioned content, not a second native question identity.
struct NativeQuestionPayload: Codable, Equatable {
    var schemaVersion: Int
    var questionTypeId: String?
    var legacy: Content
    var options: [Option]?
    var answer: Answer
    var materialRefs: [BankVersionReference]?
    struct Option: Codable, Equatable, Identifiable { var id: String; var text: String }
    struct Answer: Codable, Equatable { var type: String; var optionId: String? }
    struct Assembly: Codable, Equatable { var correctOrder: [String]; var starSlot: Int }
    struct OptionMaterial: Codable, Equatable { var optionId: String; var materialRef: BankVersionReference }
    struct Content: Codable, Equatable {
        var prompt: String?; var question: String?; var context: String?; var passage: String?
        var instruction: String?; var correctReason: String?; var explanation: String?; var explanation_zh: String?
        var choices: [String]?; var taskConditions: [String]?; var blankId: String?
        var targetSpan: NativeTargetSpan?; var assembly: Assembly?
        var promptTarget: String?; var japaneseAnnotations: [JapaneseAnnotation]?
        var optionMaterials: [OptionMaterial]?
        var memoryPoint: String?; var translationZh: String?; var choiceAnalysis: [NativeQuestion.Analysis]?
        var presentationPolicy: Policy?
        var choiceExplanations: [ReadingExplanation]?; var choiceDetails: [ListeningExplanation]?
        var passageTranslation: String?; var explanationNodes: [ExplanationNode]?; var readingAnalysis: ReadingAnalysis?
        struct ReadingExplanation: Codable, Equatable { var text: String; var translation: String?; var analysis: String?; var evidence: String?; var errorType: String? }
        struct ListeningExplanation: Codable, Equatable { var translation: String?; var explanation: String? }
        struct ExplanationNode: Codable, Equatable { var title: String; var body: String }
        struct ReadingAnalysis: Codable, Equatable { var summary: String?; var structure: String?; var keySentences: [String]? }
        struct Policy: Codable, Equatable { var questionTiming: String?; var optionsTiming: String? }
    }
    static let types = Set(["vocabulary-kanji-reading","vocabulary-orthography","vocabulary-word-formation","vocabulary-context","vocabulary-paraphrase","vocabulary-usage","grammar-form","grammar-composition","grammar-text","reading-short","reading-mid","reading-long","reading-integrated","reading-thematic","reading-information","reading-basic-training","listening-task","listening-points","listening-outline","listening-expression","listening-quick","listening-integrated","listening-basic-training"])
    var valid: Bool {
        guard schemaVersion == 1, let kind = questionTypeId, Self.types.contains(kind) else { return false }
        let values = options ?? []
        guard Set(values.map(\.id)).count == values.count else { return false }
        guard Set(values.map(\.text)).count == values.count else { return false }
        if let span = legacy.targetSpan, span.range(in: prompt) == nil { return false }
        if answer.type == "unscored" { return values.isEmpty }
        guard ["single", "option"].contains(answer.type), values.contains(where: { $0.id == answer.optionId }) else { return false }
        if kind == "grammar-composition" {
            guard let a = legacy.assembly, a.correctOrder.count == values.count,
                  Set(a.correctOrder) == Set(values.map(\.id)), a.correctOrder.indices.contains(a.starSlot),
                  a.correctOrder[a.starSlot] == answer.optionId else { return false }
        }
        return true
    }
    var prompt: String { legacy.prompt ?? legacy.question ?? "" }
    var explanation: String { legacy.correctReason ?? legacy.explanation ?? legacy.explanation_zh ?? "" }
    var answerIndex: Int? { options?.firstIndex(where: { $0.id == answer.optionId }) }
    func selectedOption(order: [String]) -> Int? {
        guard let a = legacy.assembly, order.count == (options ?? []).count,
              Set(order) == Set((options ?? []).map(\.id)), order.indices.contains(a.starSlot) else { return nil }
        return options?.firstIndex(where: { $0.id == order[a.starSlot] })
    }
    func visibleAfterAudio(_ finished: Bool, question: Bool) -> Bool {
        let timing = question ? legacy.presentationPolicy?.questionTiming : legacy.presentationPolicy?.optionsTiming
        return finished || (timing ?? (questionTypeId == "listening-outline" ? "afterAudio" : "beforeAudio")) != "afterAudio"
    }
}
struct NativeTargetSpan: Codable, Equatable {
    var start: Int; var end: Int; var text: String
    func range(in source: String) -> NSRange? {
        let ns = NSRange(location: start, length: end - start)
        guard start >= 0, end > start, end <= source.utf16.count, let r = Range(ns, in: source), String(source[r]) == text else { return nil }
        return ns
    }
}
struct NativeMaterialPayload: Codable, Equatable {
    var type: String
    var title: String?; var blocks: [Block]?; var headers: [String]?; var rows: [[String]]?
    var url: String?; var alt: String?; var transcript: String?; var transcriptTranslation: String?
    struct Block: Codable, Equatable { var id: String?; var type: String?; var text: String?; var headers: [String]?; var rows: [[String]]? }
}
struct NativeQuestionPresentation: Codable, Equatable {
    var payload: NativeQuestionPayload
    var materials: [BankCachedVersion]
    func material(_ ref: BankVersionReference) -> NativeMaterialPayload? {
        guard let record = materials.first(where: { $0.id == ref.id && $0.revision == ref.revision }) else { return nil }
        return try? JSONDecoder().decode(NativeMaterialPayload.self, from: JSONEncoder().encode(record.payload))
    }
    var missingMaterial: Bool {
        guard payload.valid else { return true }
        let refs = payload.materialRefs ?? []
        if refs.contains(where: { material($0) == nil }) { return true }
        let values = refs.compactMap(material)
        let articles = values.filter { ["article","table"].contains($0.type) }
        switch payload.questionTypeId {
        case "reading-integrated": return articles.count < 2
        case "reading-information": return !(payload.legacy.taskConditions?.isEmpty == false && articles.contains { $0.rows?.isEmpty == false || $0.blocks?.contains(where: { $0.rows?.isEmpty == false }) == true })
        case "grammar-text":
            guard let blank = payload.legacy.blankId, !blank.isEmpty else { return true }
            return articles.flatMap { $0.blocks ?? [] }.compactMap(\.text).reduce(0) { $0 + $1.components(separatedBy: blank).count - 1 } != 1
        case "listening-expression": return !values.contains(where: { $0.type == "audio" }) || !values.contains(where: { $0.type == "image" })
        default: return false
        }
    }
    static func revealAllowed(requested: Bool, permitted: Bool) -> Bool { requested && permitted }
}
extension AppStore {
    func resolvedReadingQuestion(_ source: ReadingQuestion) -> ReadingQuestion {
        guard source.presentation == nil, let presentation = questionPresentation(id: source.canonicalQuestionId, revision: source.questionRevision, frozen: nil), let answer = presentation.payload.answerIndex else { return source }
        let content = presentation.payload.legacy
        var result = ReadingQuestion(presentation: presentation, canonicalQuestionId: source.canonicalQuestionId, questionRevision: source.questionRevision, questionTypeId: presentation.payload.questionTypeId, materialRefs: presentation.payload.materialRefs ?? source.materialRefs, id: source.id, title: source.title, passage: content.passage ?? source.passage, question: presentation.payload.prompt, choices: (presentation.payload.options ?? []).map(\.text), answerIndex: answer, explanation: presentation.payload.explanation)
        result.tags = source.tags; result.rubyTerms = source.rubyTerms; result.japaneseAnnotations = content.japaneseAnnotations ?? source.japaneseAnnotations
        return result
    }
    func resolvedListeningItem(_ source: ListeningItem) -> ListeningItem {
        guard source.presentation == nil, let presentation = questionPresentation(id: source.canonicalQuestionId, revision: source.questionRevision, frozen: nil) else { return source }
        var result = ListeningItem(presentation: presentation, canonicalQuestionId: source.canonicalQuestionId, questionRevision: source.questionRevision, materialRefs: presentation.payload.materialRefs ?? source.materialRefs, id: source.id, title: source.title, question: presentation.payload.prompt, explanation: presentation.payload.explanation, questionTypeId: presentation.payload.questionTypeId ?? source.questionTypeId, choices: (presentation.payload.options ?? []).map(\.text), answerIndex: presentation.payload.answerIndex ?? -1, audioFileName: source.audioFileName, audioSize: source.audioSize, createdAt: source.createdAt)
        result.transcript = source.transcript; result.transcriptTranslation = source.transcriptTranslation
        result.audioAssetId = source.audioAssetId; result.audioReference = source.audioReference; result.reference = source.reference
        result.libraryNumber = source.libraryNumber; result.choiceDetails = source.choiceDetails
        if let audio = (presentation.payload.materialRefs ?? []).compactMap({ presentation.material($0) }).first(where: { $0.type == "audio" }) { result.transcript = audio.transcript ?? source.transcript; result.transcriptTranslation = audio.transcriptTranslation ?? source.transcriptTranslation }
        result.japaneseAnnotations = presentation.payload.legacy.japaneseAnnotations ?? source.japaneseAnnotations
        return result
    }
    func questionPresentation(id: String?, revision: Int?, frozen: NativeQuestionPresentation?) -> NativeQuestionPresentation? {
        if let frozen { return frozen }
        guard let id, let revision, let record = bankVersions?["questionVersions"]?[BankVersionReference(id: id, revision: revision).versionKey],
              let payload = try? JSONDecoder().decode(NativeQuestionPayload.self, from: JSONEncoder().encode(record.payload)) else { return nil }
        let materials = (payload.materialRefs ?? []).compactMap { bankVersions?["materialVersions"]?[$0.versionKey] }
        return .init(payload: payload, materials: materials)
    }
}

/// One content renderer for practice, reading and listening. Containers retain navigation,
/// audio, persistence, approval and reveal permissions. Selection always returns a canonical option.
struct NativeTypedQuestionRenderer: View {
    let presentation: NativeQuestionPresentation
    var selected: Int?
    var revealed = false
    var permitsReveal = true
    var disabled = false
    var audioFinished = false
    var optionIdentifier = "typed.choice"
    var initialOrder: [String] = []
    var onOrderChange: (([String]) -> Void)? = nil
    var onSelect: (Int, [String]?) -> Void
    @State private var order: [String] = []
    private var payload: NativeQuestionPayload { presentation.payload }
    private var reveal: Bool { NativeQuestionPresentation.revealAllowed(requested: revealed, permitted: permitsReveal) }
    private var locked: Bool { disabled || revealed || presentation.missingMaterial }
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            materialContent
            if !(payload.materialRefs ?? []).contains(where: { ["article","table"].contains(presentation.material($0)?.type ?? "") }), let text = payload.legacy.context ?? payload.legacy.passage { JapaneseText(text: text, japanese: true) }
            ForEach(Array((payload.legacy.taskConditions ?? []).enumerated()), id: \.offset) { _, condition in JapaneseText(text: condition, japanese: true) }
            if payload.visibleAfterAudio(audioFinished || reveal, question: true) {
                JapaneseText(text: payload.prompt, japanese: true, annotations: payload.legacy.japaneseAnnotations ?? [], target: payload.legacy.targetSpan == nil ? payload.legacy.promptTarget : nil, targetRange: payload.legacy.targetSpan?.range(in: payload.prompt)).font(.headline)
            } else { Text("请先听完音频，再查看问题与选项。") }
            if presentation.missingMaterial { Text("该题的冻结素材尚未同步，请同步后作答。").foregroundStyle(.red).accessibilityIdentifier("typed.missingMaterial") }
            if payload.visibleAfterAudio(audioFinished || reveal, question: false) {
                if let assembly = payload.legacy.assembly { assemblyContent(assembly) } else { options }
            }
            if reveal {
                if let i = payload.answerIndex, let choice = payload.options?[i] { Text("正确答案：\(i + 1). \(choice.text)").foregroundStyle(DeckTheme.accent) }
                if let a = payload.legacy.assembly {
                    Text("完整排列：" + a.correctOrder.compactMap { id in payload.options?.first { $0.id == id }?.text }.joined(separator: " → "))
                    Text("★ 第 \(a.starSlot + 1) 空")
                }
                Text("解题依据").font(.headline)
                JapaneseText(text: payload.explanation, explanation: true, annotations: payload.legacy.japaneseAnnotations ?? []).textSelection(.enabled).accessibilityIdentifier("typed.explanation")
                if let point = payload.legacy.memoryPoint { JapaneseText(text: point, explanation: true) }
                ForEach(Array((payload.legacy.choiceAnalysis ?? []).enumerated()), id: \.offset) { _, analysis in
                    DisclosureGroup(analysis.choice) { JapaneseText(text: analysis.explanation, explanation: true) }
                }
                ForEach(Array((payload.legacy.choiceExplanations ?? []).enumerated()), id: \.offset) { _, detail in
                    DisclosureGroup(detail.text) {
                        if let text = detail.translation { Text(text) }
                        if let text = detail.analysis { JapaneseText(text: text, explanation: true) }
                        if let text = detail.evidence { JapaneseText(text: text, japanese: true) }
                        if let text = detail.errorType, !text.isEmpty { Text(text) }
                    }
                }
                ForEach(Array((payload.legacy.choiceDetails ?? []).enumerated()), id: \.offset) { index, detail in
                    DisclosureGroup("选项 \(index + 1) 解析") {
                        if let text = detail.translation { Text(text) }
                        if let text = detail.explanation { JapaneseText(text: text, explanation: true) }
                    }
                }
                ForEach(Array((payload.legacy.explanationNodes ?? []).enumerated()), id: \.offset) { _, node in
                    DisclosureGroup(node.title) { JapaneseText(text: node.body, explanation: true) }
                }
                if let analysis = payload.legacy.readingAnalysis {
                    DisclosureGroup("文章结构与主旨") {
                        if let text = analysis.summary { JapaneseText(text: text, explanation: true) }
                        if let text = analysis.structure { JapaneseText(text: text, explanation: true) }
                        ForEach(analysis.keySentences ?? [], id: \.self) { JapaneseText(text: $0, japanese: true) }
                    }
                }
                if let translation = payload.legacy.passageTranslation { DisclosureGroup("文章中文翻译") { Text(translation) } }
                if let translation = payload.legacy.translationZh { DisclosureGroup("完整中文翻译") { Text(translation) } }
            }
        }.environment(\.japaneseStudyHintsEnabled, reveal).environment(\.japaneseExplanationMode, reveal)
            .onAppear { order = initialOrder }
            .onChange(of: initialOrder) { _, value in if order != value { order = value } }
            .onChange(of: order) { _, value in onOrderChange?(value) }
    }
    private var options: some View {
        ForEach(Array((payload.options ?? []).enumerated()), id: \.element.id) { index, option in
            Button { onSelect(index, nil) } label: {
                VStack(alignment: .leading, spacing: 10) {
                    if let ref = payload.legacy.optionMaterials?.first(where: { $0.optionId == option.id })?.materialRef, let material = presentation.material(ref) { materialImage(material) }
                    StudyAnswerChoice(number: index + 1, text: option.text, selected: selected == index, correct: reveal ? index == payload.answerIndex : nil)
                }
            }.buttonStyle(.plain).disabled(locked).accessibilityIdentifier("\(optionIdentifier).\(index)")
        }
    }
    private func assemblyContent(_ assembly: NativeQuestionPayload.Assembly) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("排列片段；★标出第 \(assembly.starSlot + 1) 空。")
            ForEach(0..<(payload.options ?? []).count, id: \.self) { index in
                HStack {
                    Text(index == assembly.starSlot ? "★" : "\(index + 1)").foregroundStyle(DeckTheme.accent)
                    Text(order.indices.contains(index) ? payload.options?.first(where: { $0.id == order[index] })?.text ?? "" : "＿＿")
                    Spacer()
                    if order.indices.contains(index) && !locked { Button("移除") { order.remove(at: index) }.accessibilityIdentifier("typed.slot.remove.\(index)") }
                }.padding(8).background(DeckTheme.green.opacity(0.06))
            }
            ForEach(payload.options ?? []) { option in
                Button(option.text) { if !order.contains(option.id) { order.append(option.id) } }
                    .disabled(locked || order.contains(option.id)).accessibilityIdentifier("typed.fragment.\(option.id)")
            }
            Button("确认排列") { if let index = payload.selectedOption(order: order) { onSelect(index, order) } }
                .disabled(locked || payload.selectedOption(order: order) == nil).accessibilityIdentifier("typed.assembly.confirm")
        }
    }
    private var materialContent: some View {
        ForEach(Array((payload.materialRefs ?? []).enumerated()), id: \.offset) { number, ref in
            if let material = presentation.material(ref), ["article","table","image"].contains(material.type), !(material.type == "image" && payload.legacy.optionMaterials?.contains(where: { $0.materialRef.id == ref.id && $0.materialRef.revision == ref.revision }) == true) {
                VStack(alignment: .leading, spacing: 12) {
                    Text((payload.questionTypeId == "reading-integrated" ? (number == 0 ? "A · " : "B · ") : "") + (material.title ?? "素材 \(number + 1)")).font(.headline)
                    if material.type == "image" { materialImage(material) }
                    if let headers = material.headers, let rows = material.rows { table(headers: headers, rows: rows) }
                    ForEach(Array((material.blocks ?? []).enumerated()), id: \.offset) { _, block in
                        if let headers = block.headers, let rows = block.rows { table(headers: headers, rows: rows) }
                        if let text = block.text {
                            JapaneseText(text: text, japanese: true, target: payload.legacy.blankId).textSelection(.enabled)
                        }
                    }
                }.padding(12).background(DeckTheme.green.opacity(0.04))
            }
        }
    }
    private func table(headers: [String], rows: [[String]]) -> some View {
        ScrollView(.horizontal) {
            Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 12) {
                GridRow { ForEach(Array(headers.enumerated()), id: \.offset) { _, cell in Text(cell).bold().frame(width: 120, alignment: .leading) } }
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    GridRow { ForEach(Array(row.enumerated()), id: \.offset) { _, cell in JapaneseText(text: cell, japanese: true).frame(width: 120, alignment: .leading) } }
                }
            }.padding(8)
        }.accessibilityIdentifier("typed.material.table")
    }
    @ViewBuilder private func materialImage(_ material: NativeMaterialPayload) -> some View {
        if let url = material.url, url.hasPrefix("data:image/"), let comma = url.firstIndex(of: ","), let bytes = Data(base64Encoded: String(url[url.index(after: comma)...])), let image = UIImage(data: bytes) {
            Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 240).accessibilityLabel(material.alt ?? "场景图")
        } else if let url = material.url.flatMap(URL.init(string:)), url.scheme == "https" {
            AsyncImage(url: url) { image in image.resizable().scaledToFit() } placeholder: { ProgressView() }.frame(maxHeight: 240).accessibilityLabel(material.alt ?? "场景图")
        } else { Text("图片素材不可用").foregroundStyle(.red) }
    }
}
