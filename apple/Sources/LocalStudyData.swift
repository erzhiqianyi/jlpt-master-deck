import Foundation
import CryptoKit

struct PendingAnswer: Codable, Identifiable {
    let id: UUID
    let before: ProgressEntry
    let input: AnswerInput
    enum Disposition { case send, alreadyApplied, conflict }
    func disposition(cloud: ProgressEntry) -> Disposition {
        if cloud == input.progressEntry { return .alreadyApplied }
        return cloud == before ? .send : .conflict
    }
}

struct LocalStudyResponse: Codable {
    let title: String
    let selected: String
    let correct: Bool?
    let answeredAt: String
    let sessionID: String?
}

struct LocalStudyData: Codable {
    var items: [StudyItem] = []
    var state = StudyState()
    var plan = StudyPlan()
    var reading: [ReadingQuestion] = []
    var captures: [Capture] = []
    var packs: [NativePack] = []
    var drafts: [PracticeDraft] = []
    var listening: [ListeningItem] = []
    var shares: [DiscoveryShare] = []
    var pending: [PendingAnswer] = []
    var lastSync: Date?
    var hasPracticeCache = false
    var hasListeningCache = false
    var responses: [String: LocalStudyResponse]?
}

struct LocalStudyFiles {
    let root: URL
    init(root: URL? = nil) {
        self.root = root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("OfflineStudy-v1", isDirectory: true)
    }
    func directory(userID: Int) -> URL { root.appendingPathComponent("user-\(userID)", isDirectory: true) }
    func load(userID: Int) throws -> LocalStudyData? {
        let url = directory(userID: userID).appendingPathComponent("study.json")
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try JSONDecoder().decode(LocalStudyData.self, from: Data(contentsOf: url))
    }
    func save(_ snapshot: LocalStudyData, userID: Int) throws {
        let folder = directory(userID: userID)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try JSONEncoder().encode(snapshot).write(to: folder.appendingPathComponent("study.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    func downloadedAudioCount(userID: Int, items: [ListeningItem]) throws -> Int {
        try ListeningGroup.make(items).reduce(0) { count, group in
            guard let item = group.questions.first else { return count }
            let url = audioURL(userID: userID, item: item)
            guard FileManager.default.fileExists(atPath: url.path) else { return count }
            let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
            return count + (values.isRegularFile == true && (values.fileSize ?? 0) > 0 ? 1 : 0)
        }
    }
    func audioURL(userID: Int, item: ListeningItem) -> URL {
        let key = "\(item.audioKey)|\(item.audioSize)|\(item.createdAt)"
        let name = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        return directory(userID: userID).appendingPathComponent("audio", isDirectory: true).appendingPathComponent(name)
    }
}
