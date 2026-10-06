import Foundation
import CryptoKit
import UIKit
import ImageIO

struct PendingAnswer: Codable, Identifiable {
    let id: UUID
    let before: ProgressEntry
    let input: AnswerInput
    var historyOnly: Bool? = nil
    // Optional for backwards-compatible decoding of existing on-device queues.
    var needsSyncReview: Bool? = nil
    var syncDecision: String? = nil
    var isCardReview: Bool { input.questionId.hasPrefix("memory-card:") && MemoryRating(rawValue: input.selected) != nil }
    var canAutomaticallyUpload: Bool { needsSyncReview != true }
    enum Disposition { case send, alreadyApplied, conflict }
    func disposition(cloud: ProgressEntry) -> Disposition {
        // Subjective ratings are immutable events. The server deduplicates and merges
        // them even when another device has advanced this card's progress.
        if input.questionId.hasPrefix("memory-card:"), MemoryRating(rawValue: input.selected) != nil { return .send }
        if historyOnly == true { return .alreadyApplied }
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
    var syncCursor: String?
    var hasPracticeCache = false
    var hasListeningCache = false
    var uploadableCount: Int { pending.filter(\.canAutomaticallyUpload).count }
    var syncReviewCount: Int { pending.count - uploadableCount }
    var responses: [String: LocalStudyResponse]?

    /// Downloaded content can advance independently of queued, unacknowledged answers.
    func preservingLocalWork(pending: [PendingAnswer], responses: [String: LocalStudyResponse], syncedAt: Date) -> Self {
        var result = self
        result.pending = pending
        result.responses = responses
        result.lastSync = syncedAt
        for operation in pending {
            let input = operation.input
            if operation.historyOnly != true { result.state.progress[input.itemId] = input.progressEntry }
            if let attempts = input.attemptHistory {
                result.state.attemptHistory = NativeAttempt.merging(result.state.attemptHistory ?? [], attempts)
            }
            if operation.historyOnly != true && !input.questionId.hasPrefix("memory-card:") {
                result.state.answers[input.questionId] = .init(selected: input.selected, correct: input.correct, answeredAt: input.progressEntry.lastReviewedAt)
            }
        }
        return result
    }
}

enum StudySynchronization {
    @MainActor
    static func fetch(upload: () async throws -> Void, download: () async throws -> LocalStudyData) async throws -> (data: LocalStudyData, uploadError: String?) {
        var uploadError: String?
        do { try await upload() }
        catch APIError.http(401, let message) { throw APIError.http(401, message) }
        catch is CancellationError { throw CancellationError() }
        catch let error as URLError where error.code == .cancelled { throw error }
        catch { uploadError = error.localizedDescription }
        try Task.checkCancellation()
        return (try await download(), uploadError)
    }
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
    /// Sync callers hold the store's saving gate until this atomic write completes.
    func saveInBackground(_ snapshot: LocalStudyData, userID: Int) async throws {
        try await Task.detached(priority: .utility) {
            try self.save(snapshot, userID: userID)
        }.value
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
    func speechAudio(userID: Int, request: SpeechRequest, download: () async throws -> Data) async throws -> Data {
        let url = try speechURL(userID: userID, request: request)
        if FileManager.default.fileExists(atPath: url.path) {
            let bytes = try Data(contentsOf: url)
            if !bytes.isEmpty {
                #if DEBUG
                print("[Speech][Cache] HIT user=\(userID) key=\(url.lastPathComponent) bytes=\(bytes.count) provider=\(request.provider) voice=\(request.voice) text=\(String(reflecting: request.text))")
                #endif
                return bytes
            }
        }
        #if DEBUG
        print("[Speech][Cache] MISS user=\(userID) key=\(url.lastPathComponent) provider=\(request.provider) voice=\(request.voice) style=\(request.style) role=\(request.role) text=\(String(reflecting: request.text))")
        #endif
        let bytes = try await download()
        try Task.checkCancellation()
        guard !bytes.isEmpty else { throw APIError.invalidResponse }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try bytes.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #if DEBUG
        print("[Speech][Cache] SAVED user=\(userID) key=\(url.lastPathComponent) bytes=\(bytes.count)")
        #endif
        return bytes
    }
    func speechURL(userID: Int, request: SpeechRequest) throws -> URL {
        let encoder = JSONEncoder(); encoder.outputFormatting = .sortedKeys
        let key = try encoder.encode(request)
        let name = SHA256.hash(data: key).map { String(format: "%02x", $0) }.joined()
        return directory(userID: userID).appendingPathComponent("speech-v1", isDirectory: true).appendingPathComponent(name + ".mp3")
    }
    func audioURL(userID: Int, item: ListeningItem) -> URL {
        let key = "\(item.audioKey)|\(item.audioSize)|\(item.createdAt)"
        let name = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        return directory(userID: userID).appendingPathComponent("audio", isDirectory: true).appendingPathComponent(name)
    }
}

extension LocalStudyData {
    /// Stage the whole submission before the caller saves once, so failed persistence is retryable.
    func recordingNativeBatch(questions: [NativeQuestion], attempt: NativeAttempt, allowUnanswered: Bool = false) throws -> Self {
        let questionIDs = Set(questions.map(\.id))
        guard questionIDs.count == questions.count, Set(attempt.questionIds) == questionIDs,
              Set(attempt.answers.map(\.questionId)).isSubset(of: questionIDs),
              Set(attempt.answers.map(\.questionId)).count == attempt.answers.count,
              allowUnanswered || attempt.answers.count == questions.count,
              attempt.completedAt != nil else { throw IdentityError.message("题目尚未全部作答。") }
        let answers = Dictionary(attempt.answers.map { ($0.questionId, $0) }, uniquingKeysWith: { _, last in last })
        for question in questions {
            guard let answer = answers[question.id] else { continue }
            guard question.choices.contains(answer.selected),
                  answer.correct == (answer.selected == question.answer), answer.itemId == question.itemId else {
                throw IdentityError.message("答案内容无效，请重新选择。")
            }
        }
        let previousAttempt = state.attemptHistory?.first { $0.id == attempt.id }
        if previousAttempt?.completedAt != nil { return self }
        let recordedIDs = Set(previousAttempt?.answers.map(\.questionId) ?? [])
        let additions = questions.filter { answers[$0.id] != nil && !recordedIDs.contains($0.id) }
        var next = self
        for (index, question) in additions.enumerated() {
            let answer = answers[question.id]!
            let before = next.state.progress[question.itemId] ?? ProgressEntry()
            let progress = before.afterPractice(correct: answer.correct, now: StudyDates.parse(answer.answeredAt) ?? .now)
            let eventID = UUID()
            var operation = PendingAnswer(id: eventID, before: before,
                input: .init(questionId: question.id, itemId: question.itemId, selected: answer.selected, correct: answer.correct,
                             progressEntry: progress, attemptHistory: index == additions.count - 1 ? [attempt] : nil, syncEventId: eventID.uuidString))
            if next.pending.contains(where: { $0.input.itemId == question.itemId && $0.needsSyncReview == true }) { operation.needsSyncReview = true }
            next.pending.append(operation)
            next.state.progress[question.itemId] = progress
            next.state.answers[question.id] = .init(selected: answer.selected, correct: answer.correct, answeredAt: answer.answeredAt)
            next.responses = next.responses ?? [:]
            next.responses?[question.id] = .init(title: question.title, selected: answer.selected, correct: answer.correct, answeredAt: answer.answeredAt, sessionID: attempt.id)
        }
        if additions.isEmpty {
            next.pending.append(PendingAnswer(id: UUID(), before: ProgressEntry(),
                input: .init(questionId: "", itemId: "", selected: "", correct: false, progressEntry: ProgressEntry(), attemptHistory: [attempt]), historyOnly: true))
        }
        next.state.attemptHistory = NativeAttempt.merging(next.state.attemptHistory ?? [], [attempt])
        return next
    }
}

// Network, file I/O and image decoding run on this actor, away from the UI actor.
// Account + URL identifies a file; bearer tokens are never written to disk.
actor NativeImageCache {
    static let shared = NativeImageCache()
    typealias Download = @Sendable (URLRequest) async throws -> Data
    private let files: LocalStudyFiles
    private let download: Download
    private var pending: [String: Task<Data, Error>] = [:]
    struct Bitmap: @unchecked Sendable { let image: UIImage }
    init(root: URL? = nil, download: @escaping Download = { request in
        let (bytes, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, response.statusCode == 200 else { throw APIError.invalidResponse }
        return bytes
    }) {
        files = LocalStudyFiles(root: root)
        self.download = download
    }
    func fileURL(userID: Int, request: URLRequest) throws -> URL {
        guard let url = request.url else { throw APIError.invalidResponse }
        let key = SHA256.hash(data: Data(url.absoluteString.utf8)).map { String(format: "%02x", $0) }.joined()
        return files.directory(userID: userID).appendingPathComponent("images-v1", isDirectory: true).appendingPathComponent(key)
    }
    private func source(_ bytes: Data) throws -> CGImageSource {
        guard !bytes.isEmpty, bytes.count <= 20 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(bytes as CFData, nil), CGImageSourceGetCount(source) > 0,
              let bitmap = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 16] as CFDictionary), bitmap.width > 0 else { throw APIError.invalidResponse }
        return source
    }
    func data(userID: Int, request: URLRequest) async throws -> Data {
        let url = try fileURL(userID: userID, request: request)
        let key = url.path
        if let task = pending[key] { return try await task.value }
        if let bytes = try? Data(contentsOf: url), (try? source(bytes)) != nil { return bytes }
        // A damaged or partial file must never turn an offline miss into a permanent blank.
        try? FileManager.default.removeItem(at: url)
        let task = Task {
            let bytes = try await download(request)
            _ = try source(bytes)
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try bytes.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return bytes
        }
        pending[key] = task
        defer { pending[key] = nil }
        return try await task.value
    }

    func bitmap(userID: Int, request: URLRequest) async throws -> Bitmap {
        let bytes = try await data(userID: userID, request: request)
        try Task.checkCancellation()
        let source = try source(bytes)
        let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 4096,
            kCGImageSourceShouldCacheImmediately: true]
        guard let decoded = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { throw APIError.invalidResponse }
        return Bitmap(image: UIImage(cgImage: decoded))
    }
    func count(userID: Int, requests: [URLRequest]) -> Int {
        Set(requests.compactMap { try? fileURL(userID: userID, request: $0) }).filter { url in
            guard let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]) else { return false }
            return values.isRegularFile == true && (values.fileSize ?? 0) > 0
        }.count
    }
}


struct StudySyncChange: Decodable {
    let collection: String
    let id: String
    var value: SettingValue?
    var deleted: Bool?
}
struct StudySyncPage: Decodable {
    var changes: [StudySyncChange]?
    var cursor: String?
    var nextPage: String?
    var reset: Bool?
    var restart: Bool?
    var total: Int?
}
extension LocalStudyData {
    mutating func applySync(_ changes: [StudySyncChange]) throws {
        func decode<T: Decodable>(_ change: StudySyncChange) throws -> T {
            guard let value = change.value else { throw APIError.invalidResponse }
            return try JSONDecoder().decode(T.self, from: JSONEncoder().encode(value))
        }
        func update<T: Decodable & Identifiable>(_ values: inout [T], _ change: StudySyncChange) throws where T.ID == String {
            values.removeAll { $0.id == change.id }
            if change.deleted != true { values.append(try decode(change)) }
        }
        for change in changes {
            switch change.collection {
            case "items": try update(&items,change)
            case "reading": try update(&reading,change)
            case "listening": try update(&listening,change)
            case "captures": try update(&captures,change)
            case "packs": try update(&packs,change)
            case "drafts": try update(&drafts,change)
            case "shares": try update(&shares,change)
            case "cardReviews":
                var values = state.cardReviews ?? []; try update(&values,change); state.cardReviews = values
            case "attemptHistory":
                var values = state.attemptHistory ?? []; try update(&values,change); state.attemptHistory = values
            case "progress":
                if change.deleted == true { state.progress.removeValue(forKey: change.id) }
                else { state.progress[change.id] = try decode(change) }
            case "answers":
                if change.deleted == true { state.answers.removeValue(forKey: change.id) }
                else { state.answers[change.id] = try decode(change) }
            case "stateMeta":
                struct Meta: Decodable { var settings: [String: SettingValue]? }
                let meta: Meta = try decode(change); state.settings = meta.settings
            case "plan":
                let header: StudyPlan = try decode(change); plan.profile = header.profile
            case "planTasks": try update(&plan.tasks,change)
            case "planDays": try update(&plan.dailySummaries,change)
            default: break // Collections used only by the web client.
            }
        }
        packs.sort { $0.date > $1.date }
        state.cardReviews?.sort { $0.reviewedAt < $1.reviewedAt }
        state.attemptHistory?.sort { ($0.completedAt ?? $0.startedAt) > ($1.completedAt ?? $1.startedAt) }
    }
}
