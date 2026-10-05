import Foundation

struct Account: Codable { let id: Int; let username: String }
struct Session: Codable { let user: Account; let token: String }
struct ReviewData: Decodable { let items: [StudyItem] }
struct StudyItem: Codable, Identifiable {
    let id: String
    let deck: String
    let original: String
    var reading: String?
    var meaning_zh: String?
    var explanation_zh: String?
    var core_memory: [String]?
    var examples: [Example]?
    var jlpt_level: String?
    var part_of_speech: String?
    var meaning_ja: String?
    var reference: String?
    var patterns: [[String: String]]?
    var points: [[String: String]]?
    var comparisons: [[String: String]]?
    var register: [String: String]?
    var conjugations: [[String: String]]?
    var images: [[String: String]]?
    var notes: [String]?
    var tags: [String]?
    var source: ItemSource?
    struct ItemSource: Codable { var sentence: String?; var chat_summary: String? }
    var localizations: [String: Localization]?
    struct Localization: Codable { var meaning: String?; var explanation: String?; var core_memory: [String]? }
    var content_origin: String?
    var verification_status: String?
    var isGrammar: Bool { deck == "grammar_expression" }
    var sourceLabel: String {
        content_origin == "ai_generated" ? "AI 生成 · \(verification_status == "verified" ? "已核验" : "待核验")" : "学习资料"
    }
    struct Example: Codable { let ja: String; var zh: String? }
}

struct StudyState: Codable {
    var settings: [String: SettingValue]?
    var progress: [String: ProgressEntry] = [:]
    var answers: [String: Answer] = [:]
    var attemptHistory: [NativeAttempt]?
    struct Answer: Codable { let selected: String; let correct: Bool; var answeredAt: String? }
}
struct ProgressEntry: Codable, Equatable {
    var correct = 0
    var wrong = 0
    var status = "new"
    var firstSeenAt: String?
    var lastReviewedAt: String?
    var reviewCount: Int?
    var ease: Double?
    var intervalDays: Int?
    var nextReviewAt: String?
    var lastPracticeSessionId: String?

    func rated(_ rating: MemoryRating, now: Date = .now) -> Self {
        var next = self
        next.correct += rating == .forgot ? 0 : 1
        next.wrong += rating == .forgot ? 1 : 0
        next.status = rating == .forgot ? "learning" : (reviewCount ?? 0) >= 4 ? "mastered" : "review"
        next.firstSeenAt = firstSeenAt ?? now.ISO8601Format()
        next.lastReviewedAt = now.ISO8601Format()
        next.reviewCount = (reviewCount ?? 0) + 1
        next.ease = max(1.3, min(3, (ease ?? 2.5) + rating.easeDelta))
        next.intervalDays = rating.days
        next.nextReviewAt = (rating == .forgot ? now.addingTimeInterval(600) : Calendar.current.date(byAdding: .day, value: rating.days, to: now)!).ISO8601Format()
        return next
    }
}
enum MemoryRating: String, CaseIterable, Identifiable {
    case forgot, hard, remembered, easy
    var id: String { rawValue }
    var title: String { switch self { case .forgot: "忘记"; case .hard: "困难"; case .remembered: "记得"; case .easy: "简单" } }
    var interval: String { self == .forgot ? "10 分钟" : "\(days) 天" }
    var days: Int { switch self { case .forgot: 0; case .hard: 1; case .remembered: 3; case .easy: 7 } }
    var easeDelta: Double { switch self { case .forgot: -0.2; case .hard: -0.05; case .remembered: 0.05; case .easy: 0.15 } }
}
struct PlanEnvelope: Decodable { let plan: StudyPlan }
struct StudyPlan: Codable {
    var profile: StudyPlanProfile?
    var tasks: [PlanTask] = []
    var dailySummaries: [DailySummary] = []
}
struct StudyPlanProfile: Codable {
    var examName: String?
    var examDate: String?
    var level: String?
}
struct PlanTask: Codable, Identifiable {
    let id: String; let date: String; let title: String; let module: String
    let minutes: Int; let status: String
}
struct DailySummary: Codable, Identifiable {
    let date: String; let practiceMinutes: Int; let attempted: Int
    var id: String { date }
}
struct QuestionEnvelope: Decodable { let questions: [ReadingQuestion] }
struct ReadingQuestion: Codable, Identifiable {
    let id: String; let title: String; let passage: String
    let question: String; let choices: [String]; let answerIndex: Int; let explanation: String
}
struct CaptureEnvelope: Decodable { let captures: [Capture] }
struct Capture: Codable, Identifiable {
    let id: String; let body: String; let category: String; let context: String; let createdAt: String
}
struct CaptureInput: Encodable { let body: String; let category: String; let context: String }
struct CaptureResult: Decodable { let capture: Capture }
struct AnswerInput: Codable {
    let questionId: String; let itemId: String; let selected: String
    let correct: Bool; let progressEntry: ProgressEntry
    var attemptHistory: [NativeAttempt]?
}

enum StudyDates {
    private static let fractionalTimestamp = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
    private static let timestamp = Date.ISO8601FormatStyle()
    static func day(_ date: Date = .now) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
    static func parse(_ value: String) -> Date? {
        (try? fractionalTimestamp.parse(value)) ?? (try? timestamp.parse(value))
    }
}

// Preserve every web setting when updating just the card fields.
indirect enum SettingValue: Codable, Equatable {
    case string(String), bool(Bool), number(Double), array([SettingValue]), object([String: SettingValue]), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode([SettingValue].self) { self = .array(v) }
        else { self = .object(try c.decode([String: SettingValue].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
}
enum CardFields {
    static let all = ["original", "reading", "jlpt_level", "part_of_speech", "images", "meaning", "meaning_ja", "patterns", "core_memory", "explanation", "points", "comparisons", "register", "conjugations", "examples", "notes", "tags", "source"]
    static let labels = ["原词 / 语法", "读音", "JLPT 等级", "词性", "记忆图片", "释义", "日文释义", "接续 / 搭配", "记忆点", "详细解析", "用法要点", "辨析 / 日常说法", "语体与考试提示", "活用", "例句", "备注", "标签", "学习来源"]
    static let front = ["original"]
    static let back = ["original", "reading", "images", "patterns", "meaning", "examples", "core_memory"]
    static func label(_ field: String) -> String { all.firstIndex(of: field).map { labels[$0] } ?? field }
    static func selected(_ settings: [String: SettingValue]?, back: Bool) -> [String] {
        let fallback = back ? self.back : front
        guard case .array(let values) = settings?[back ? "memoryCardBackFields" : "memoryCardFrontFields"] else { return fallback }
        var result: [String] = []
        for case .string(let field) in values where all.contains(field) && !result.contains(field) { result.append(field) }
        return result.isEmpty ? fallback : result
    }
}
extension StudyItem {
    func cardText(_ field: String, locale: String) -> String? {
        func join(_ values: [String?], _ separator: String = "：") -> String { values.compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.joined(separator: separator) }
        func rows(_ values: [[String: String]]?, _ keys: [String]) -> String { (values ?? []).map { row in join(keys.map { row[$0] }) }.filter { !$0.isEmpty }.joined(separator: "\n") }
        let localized = localizations?[locale]
        let value: String?
        switch field {
        case "original": value = original
        case "reading":
            let bare: (String) -> String = { $0.replacingOccurrences(of: "[\\s（）()〜~～・]", with: "", options: .regularExpression) }
            value = bare(reading ?? "") == bare(original) ? nil : reading
        case "jlpt_level": value = jlpt_level
        case "part_of_speech": value = part_of_speech
        case "meaning": value = localized?.meaning ?? meaning_zh
        case "meaning_ja": value = meaning_ja
        case "core_memory": value = (localized?.core_memory ?? core_memory)?.joined(separator: "\n")
        case "explanation": value = localized?.explanation ?? explanation_zh
        case "patterns": value = rows(patterns, ["pattern", "connection_zh", "meaning_zh"])
        case "points": value = rows(points, ["label", "detail_zh"])
        case "comparisons": value = (comparisons ?? []).map { join([$0["kind"] == "everyday" ? "〔日常〕" + ($0["target"] ?? "") : $0["target"], $0["difference_zh"]]) }.joined(separator: "\n")
        case "register": value = join([register?["note_zh"], register?["exam_tip_zh"]], " · ")
        case "conjugations": value = rows(conjugations, ["kind", "form", "reading"])
        case "examples":
            let example = examples?.first { $0.ja.range(of: "教材(?:の第[0-9]+週)?では[「『].+[」』]という表現を学んだ", options: .regularExpression) == nil }
            value = join([example?.ja, example?.zh], "\n")
        case "notes": value = notes?.joined(separator: "\n")
        case "tags": value = tags?.joined(separator: " · ")
        case "source": value = join([source?.sentence, source?.chat_summary], " — ")
        default: value = nil
        }
        return value?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? value : nil
    }
}

struct SpeechConfiguration {
    let provider: String
    let voice: String
    let style: String
    let role: String
    let rate: Double
    let cardAuto: String
    let grammarAuto: Bool
    let includeExample: Bool
    func text(for item: StudyItem) -> String {
        let word = item.reading.flatMap { $0.isEmpty ? nil : $0 } ?? item.original
        return includeExample ? ([word] + (item.examples?.first.map { [$0.ja] } ?? [])).joined(separator: "。") : word
    }
    init(settings: [String: SettingValue]?) {
        if case .string(let value) = settings?["ttsProvider"] { provider = value } else { provider = "browser" }
        let speech: [String: SettingValue]
        if case .object(let value) = settings?["speech"] { speech = value } else { speech = [:] }
        if case .string(let value) = speech["cardAuto"], ["front", "back"].contains(value) { cardAuto = value } else { cardAuto = "off" }
        if case .bool(let value) = speech["grammarAuto"] { grammarAuto = value } else { grammarAuto = false }
        if case .bool(let value) = speech["includeExample"] { includeExample = value } else { includeExample = false }
        let choice: [String: SettingValue]
        if case .object(let voices) = speech["voices"], case .object(let value) = voices[provider] { choice = value } else { choice = [:] }
        func string(_ key: String) -> String { if case .string(let value) = choice[key] { return value }; return "" }
        voice = string("voice"); style = string("style"); role = string("role")
        if case .number(let value) = speech["rate"], value.isFinite { rate = min(1.5, max(0.5, value)) } else { rate = 1 }
    }
    var usesSystemVoice: Bool { provider == "browser" }
    func request(text: String) -> SpeechRequest { SpeechRequest(provider: provider, text: text, voice: voice, style: style, role: role) }
    static func chunks(_ text: String) -> [String] {
        var result: [String] = [], chunk = ""
        for scalar in text.trimmingCharacters(in: .whitespacesAndNewlines).unicodeScalars {
            let part = String(scalar)
            if chunk.utf16.count + part.utf16.count > 450 { result.append(chunk); chunk = "" }
            chunk += part
        }
        if !chunk.isEmpty { result.append(chunk) }
        return result
    }
}
struct SpeechRequest: Codable, Hashable {
    let provider: String
    let text: String
    let voice: String
    let style: String
    let role: String
}


struct NativeAttempt: Codable, Identifiable, Equatable {
    let id: String
    var title: String?
    var practiceId: String?
    let startedAt: String
    var completedAt: String?
    let view: String
    let deck: String
    let questionIds: [String]
    var answers: [AttemptAnswer]
    var summary: Summary?
    var analysisStatus: String?
    var analysisStartedAt: String?
    var analysisCompletedAt: String?
    struct AttemptAnswer: Codable, Equatable {
        let questionId: String; let itemId: String; let kind: String; let selected: String; let correct: Bool
        var startedAt: String?; let answeredAt: String; let elapsedMs: Int
    }
    struct Summary: Codable, Equatable { let total: Int; let correct: Int; let wrong: Int; let accuracy: Double; let elapsedMs: Int }
    var total: Int { summary?.total ?? answers.count }
    var correctCount: Int { summary?.correct ?? answers.filter(\.correct).count }
    var dateKey: String { StudyStatistics.day(StudyDates.parse(completedAt ?? startedAt) ?? .distantPast) }
    static func merging(_ existing: [Self], _ incoming: [Self]) -> [Self] {
        var values = Dictionary(existing.map { ($0.id, $0) }, uniquingKeysWith: { _, new in new })
        for attempt in incoming { values[attempt.id] = attempt }
        return values.values.sorted { ($0.completedAt ?? $0.startedAt) > ($1.completedAt ?? $1.startedAt) }
    }
}
struct StudyStatistics {
    let attempts: [NativeAttempt]
    let today: [NativeAttempt]
    let week: [Day]
    struct Day: Identifiable { let id: String; let total: Int }
    struct Metric { let total: Int; let correct: Int; var accuracy: String { total == 0 ? "—" : "\(Int((Double(correct) / Double(total) * 100).rounded()))%" } }
    static var calendar: Calendar { var value = Calendar(identifier: .gregorian); value.timeZone = TimeZone(identifier: "Asia/Tokyo")!; return value }
    static func day(_ date: Date) -> String {
        let format = DateFormatter(); format.calendar = calendar; format.timeZone = calendar.timeZone; format.locale = Locale(identifier: "en_US_POSIX"); format.dateFormat = "yyyy-MM-dd"; return format.string(from: date)
    }
    init(attempts: [NativeAttempt], now: Date = .now) {
        let completed = attempts.filter { $0.completedAt != nil }.sorted { ($0.completedAt ?? "") > ($1.completedAt ?? "") }
        self.attempts = completed
        today = completed.filter { $0.dateKey == Self.day(now) }
        week = (0..<7).map { index in
            let key = Self.day(Self.calendar.date(byAdding: .day, value: index - 6, to: now)!)
            return Day(id: key, total: completed.filter { $0.dateKey == key }.reduce(0) { $0 + $1.total })
        }
    }
    static func metric(_ attempts: [NativeAttempt]) -> Metric { Metric(total: attempts.reduce(0) { $0 + $1.total }, correct: attempts.reduce(0) { $0 + $1.correctCount }) }
    var modules: [String] {
        var result = ["vocabulary", "grammar", "reading", "listening"]
        for attempt in attempts where !result.contains(attempt.view) { result.append(attempt.view) }
        return result
    }
    static func label(_ view: String) -> String { ["vocabulary": "单词", "grammar": "语法", "reading": "阅读", "listening": "听力", "mixed": "综合", "daily-practice": "今日练习", "mock-exams": "模拟考试"][view] ?? view }
}
