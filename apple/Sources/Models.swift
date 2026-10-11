import Foundation

// v3 のデータ（サーバーの /api/v3 と同じ形）。記録は code（W12、QV15、DP3）で指す。

struct Account: Codable, Equatable { let id: Int; let username: String }
struct Session: Codable { let user: Account; let token: String }

/// 説明語の文字（選んだ言語、無ければ別の言語で代わりに出す）。
struct PickedText: Codable, Hashable {
    let text: String
    var language: String?
    var isFallback: Bool?
}
extension Optional where Wrapped == PickedText {
    var text: String { self?.text ?? "" }
}

// MARK: - 設定

struct SpeechVoice: Codable, Hashable { var voice: String; var style: String?; var role: String? }
struct SpeechSettings: Codable, Hashable {
    var provider: String = "browser"
    var rate: Double = 1
    var cardAuto: String = "off"
    var grammarAuto: Bool = false
    var includeExample: Bool = false
    var voices: [String: SpeechVoice] = [:]
}
struct UserSettings: Codable, Hashable {
    var uiLanguage: String = "zh-CN"
    var explanationLanguage: String = "zh-Hans"
    var fontScale: Double = 1
    var feedbackMode: String = "immediate"
    var practiceNavigation: String = "auto"
    var autoAdvanceSeconds: Double = 0.5
    var showReviewRuby: Bool = true
    var showRomaji: Bool = true
    var speech = SpeechSettings()
    var cardTemplates: [String: String?] = [:]
}

// MARK: - 単語帳・知識点・カード

struct WordbookStats: Codable, Hashable { var total = 0, words = 0, grammar = 0, names = 0, due = 0, new = 0, mastered = 0 }
struct Wordbook: Codable, Identifiable, Hashable {
    let code: String
    let title: String
    var stats = WordbookStats()
    var id: String { code }
}

struct LevelRange: Codable, Hashable { let min: String; let max: String }
struct KnowledgeExample: Codable, Hashable {
    let sentence: String
    var reading: String?
    var translation: PickedText?
    var analysis: PickedText?
}
struct KnowledgePattern: Codable, Hashable { let pattern: String; var example: String?; var connection: PickedText?; var meaning: PickedText?; var exampleTranslation: PickedText? }
struct KnowledgeNote: Codable, Hashable { var kind: String?; var title: PickedText?; var body: PickedText? }
struct KnowledgeComparison: Codable, Hashable { let target: String; var kind: String?; var difference: PickedText? }
struct Conjugation: Codable, Hashable { let form: String; let label: String; let written: String; var reading: String?; var exception: Bool?; var step: PickedText? }
struct MemoryImage: Codable, Hashable { var media: Int?; var url: String?; var caption: String? }

struct Knowledge: Codable, Identifiable, Hashable {
    let code: String
    let kind: String
    let wordbook: String
    let expression: String
    var reading: String?
    var romaji: String?
    var pos: String?
    var jlptLevel: LevelRange?
    var paraphrase: String?
    var meaning: PickedText?
    var meaningJa: String?
    var explanation: PickedText?
    var examples: [KnowledgeExample] = []
    var memoryPoints: [PickedText] = []
    var patterns: [KnowledgePattern] = []
    var notes: [KnowledgeNote] = []
    var comparisons: [KnowledgeComparison] = []
    var alternateForms: [String] = []
    var tags: [String] = []
    var memoryImage: MemoryImage?
    var conjugations: [Conjugation] = []
    var id: String { code }
}

/// 復習予定（サーバーの review_schedules と同じ）。
struct ReviewState: Codable, Hashable {
    var status: String
    var reviewCount: Int
    var ease: Double
    var intervalDays: Int
    var dueAt: String?
    var firstSeenAt: String?
    var lastReviewedAt: String?
}
struct ScheduleRow: Codable, Hashable {
    let code: String
    var status: String, reviewCount: Int, ease: Double, intervalDays: Int
    var dueAt: String?, firstSeenAt: String?, lastReviewedAt: String?
    var state: ReviewState { ReviewState(status: status, reviewCount: reviewCount, ease: ease, intervalDays: intervalDays, dueAt: dueAt, firstSeenAt: firstSeenAt, lastReviewedAt: lastReviewedAt) }
}

struct CardField: Codable, Hashable { let field: String; var maxItems: Int?; var withTranslation: Bool? }
struct CardTemplate: Codable, Identifiable, Hashable {
    let code: String
    let kind: String
    var isDefault: Bool?
    var name: PickedText?
    var description: PickedText?
    var front: [CardField] = []
    var back: [CardField] = []
    var id: String { code }
}

enum MemoryRating: String, CaseIterable, Identifiable, Codable {
    case forgot, hard, remembered, easy
    var id: String { rawValue }
    var title: String {
        switch self {
        case .forgot: String(localized: "忘记了"); case .hard: String(localized: "有点难")
        case .remembered: String(localized: "记得"); case .easy: String(localized: "很简单")
        }
    }
}

// MARK: - 題型・題組・練習

struct QuestionTypeInfo: Codable, Hashable { let typeId: String; let module: String; let labelJa: String; let answerMode: String }

struct GroupMaterial: Codable, Hashable {
    var role: String?
    var material: String?
    var kind: String?
    var body: String?
    var transcript: String?
    var mediaId: Int?
    var mediaUrl: String?
    var title: PickedText?
    var bodyTranslation: PickedText?
    var transcriptTranslation: PickedText?
}
struct QuestionMark: Codable, Hashable { let kind: String; let start: Int; let end: Int; var label: String? }
struct QuestionOption: Codable, Hashable, Identifiable {
    let id: Int
    var position: Int?
    var text: String?
    var mediaId: Int?
    var correct: Bool?
    var analysis: PickedText?
    var translation: PickedText?
}
struct ExplanationSection: Codable, Hashable { let kind: String; var title: PickedText?; var body: PickedText? }
struct QuestionKnowledgeLink: Codable, Hashable { let code: String; var relation: String?; var expression: String? }
struct GroupQuestion: Codable, Hashable, Identifiable {
    let code: String
    var position: Int?
    var prompt: String?
    var promptMediaId: Int?
    var expectedText: String?
    var translation: PickedText?
    var marks: [QuestionMark] = []
    var options: [QuestionOption] = []
    var explanation: [ExplanationSection] = []
    var knowledge: [QuestionKnowledgeLink] = []
    var id: String { code }
    var correctOption: QuestionOption? { options.first { $0.correct == true } }
}
struct QuestionGroup: Codable, Hashable, Identifiable {
    let code: String
    let typeId: String
    let module: String
    var level: String?
    var shuffleOptions: Bool?
    var instruction: String?
    var instructionTranslation: PickedText?
    var context: String?
    var materials: [GroupMaterial] = []
    var questions: [GroupQuestion] = []
    var updatedAt: String?
    var id: String { code }
}

struct PracticeSetSummary: Codable, Hashable, Identifiable {
    let code: String
    let kind: String
    var date: String?
    var minutes: Int?
    var level: String?
    var questionCount: Int = 0
    var completedCount: Int = 0
    var title: PickedText?
    var createdAt: String?
    var id: String { code }
}
struct PracticeEntry: Codable, Hashable { let position: Int; let question: String; let group: String; var typeId: String? }
struct PracticeSection: Codable, Hashable { let position: Int; var title: PickedText?; var instruction: String?; var entries: [PracticeEntry] = [] }
struct PracticeSet: Codable, Hashable {
    let code: String
    let kind: String
    var date: String?
    var minutes: Int?
    var title: PickedText?
    var description: PickedText?
    var sections: [PracticeSection] = []
    var entries: [PracticeEntry] = []
    var updatedAt: String?
    var allEntries: [PracticeEntry] { (entries + sections.flatMap(\.entries)).sorted { $0.position < $1.position } }
}
/// オフラインで解くための練習一式（正解と解説を含む。表示は答えたあとだけ）。
struct PracticeBundle: Codable, Hashable {
    let practice: PracticeSet
    let groups: [QuestionGroup]
}

// MARK: - 同期

struct SyncOverview: Codable {
    let serverTime: String
    var settings = UserSettings()
    var wordbooks: [Wordbook] = []
    var cardTemplates: [CardTemplate] = []
    var questionTypes: [QuestionTypeInfo] = []
    var knowledge: KnowledgeVersion
    var schedules: [ScheduleRow] = []
    var practiceSets: [PracticeSetSummary] = []
    struct KnowledgeVersion: Codable { let total: Int; var updatedAt: String? }
}
struct KnowledgePage: Codable { let total: Int; let items: [Knowledge]; var nextOffset: Int?; var codes: [String]? }

/// オフラインのあいだに起きた学習（サーバーの /api/v3/sync/events にまとめて送る）。
struct StudyEvent: Codable, Identifiable, Hashable {
    enum Kind: String, Codable { case memoryRated = "MemoryRated", attemptStarted = "AttemptStarted", answerSubmitted = "AnswerSubmitted", attemptCompleted = "AttemptCompleted" }
    let eventId: String
    let type: Kind
    let occurredAt: String
    var knowledge: String?
    var rating: String?
    var practice: String?
    var questions: [String]?
    var kind: String?
    var attempt: String?
    var question: String?
    var selectedOptionId: Int?
    var answerText: String?
    var elapsedMs: Int?
    var id: String { eventId }
}
struct EventResult: Codable { let eventId: String?; let status: String; var error: String?; var attempt: String? }
struct EventResponse: Codable { let results: [EventResult] }

// MARK: - 発見・統計・収集箱

struct ShareSummary: Codable, Identifiable, Hashable {
    let id: String
    let kind: String
    var title: String?
    var description: String?
    var mine: Bool?
    var knowledgeCount: Int?
    var questionCount: Int?
    var createdAt: String?
}
struct StudyOverview: Codable {
    struct Totals: Codable { var answered = 0, scored = 0, correct = 0; var accuracy: Double?; var ratings = 0 }
    struct Day: Codable, Hashable { let date: String; var answered = 0, correct = 0, ratings = 0 }
    struct KnowledgeStates: Codable { var total = 0, new = 0, learning = 0, review = 0, mastered = 0, due = 0 }
    var today: String?
    var totals = Totals()
    var daily: [Day] = []
    var streak = 0
    var knowledge = KnowledgeStates()
}
struct Capture: Codable, Identifiable, Hashable { let code: String; let body: String; let category: String; var context: String?; var status: String; var createdAt: String?; var id: String { code } }

struct SpeechRequest: Codable, Hashable {
    let provider: String
    let text: String
    let voice: String
    let style: String
    let role: String
}
