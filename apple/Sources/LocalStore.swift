import Foundation

/// 端末に置く学習データ（アカウントごと、Application Support）。
/// snapshot：サーバーから読んだもの（同期のたびに置き換える）。work：端末で起きたこと（送信待ちのイベント、進行中の練習、カード復習の位置）。
struct LocalSnapshot: Codable {
    var overview: SyncOverview?
    var knowledge: [Knowledge] = []
    var knowledgeVersion: String?
    var practices: [String: PracticeBundle] = [:]
    var lastSync: Date?
}

/// 端末で解いている練習。clientKey が AttemptStarted の eventId になる（サーバー側で一つにまとまる）。
struct LocalAttempt: Codable, Identifiable, Hashable {
    struct Answer: Codable, Hashable {
        var selectedOptionId: Int?
        var answerText: String?
        var correct: Bool?
        var answeredAt: String
    }
    struct Item: Codable, Hashable { let group: String; let question: String }
    let clientKey: String
    var serverCode: String?
    var practice: String?
    var title: String
    var kind: String
    var items: [Item]
    var groups: [String: QuestionGroup]
    var answers: [String: Answer] = [:]
    var position = 0
    var startedAt: String
    var completedAt: String?
    var id: String { clientKey }
    var answeredCount: Int { answers.count }
    var correctCount: Int { answers.values.filter { $0.correct == true }.count }
    var scoredCount: Int { answers.values.filter { $0.correct != nil }.count }
}

struct CardSession: Codable, Hashable {
    var codes: [String]
    var index = 0
    var revealed = false
}

struct LocalWork: Codable {
    var events: [StudyEvent] = []
    var rejected: [EventResult] = []
    var attempts: [LocalAttempt] = []
    var schedules: [String: ReviewState] = [:]
    var cards: CardSession?
}

struct LocalStore {
    let directory: URL
    init(accountID: Int, root: URL? = nil) {
        let base = root ?? (FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? URL(fileURLWithPath: NSTemporaryDirectory()))
        directory = base.appendingPathComponent("v3/accounts/\(accountID)", isDirectory: true)
    }
    private var snapshotURL: URL { directory.appendingPathComponent("snapshot.json") }
    private var workURL: URL { directory.appendingPathComponent("work.json") }
    var mediaDirectory: URL { directory.appendingPathComponent("media", isDirectory: true) }

    func load() -> (LocalSnapshot, LocalWork) {
        let decoder = JSONDecoder()
        let snapshot = (try? Data(contentsOf: snapshotURL)).flatMap { try? decoder.decode(LocalSnapshot.self, from: $0) } ?? LocalSnapshot()
        let work = (try? Data(contentsOf: workURL)).flatMap { try? decoder.decode(LocalWork.self, from: $0) } ?? LocalWork()
        return (snapshot, work)
    }
    func save(snapshot: LocalSnapshot) throws { try write(snapshot, to: snapshotURL) }
    func save(work: LocalWork) throws { try write(work, to: workURL) }
    private func write<T: Encodable>(_ value: T, to url: URL) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONEncoder().encode(value).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    func mediaURL(_ id: Int) -> URL { mediaDirectory.appendingPathComponent("\(id)") }
    func hasMedia(_ id: Int) -> Bool { FileManager.default.fileExists(atPath: mediaURL(id).path) }
    func saveMedia(_ id: Int, data: Data) throws {
        try FileManager.default.createDirectory(at: mediaDirectory, withIntermediateDirectories: true)
        try data.write(to: mediaURL(id), options: .atomic)
    }
}
