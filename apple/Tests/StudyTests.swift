import XCTest
import UIKit
import SwiftUI
import AVFoundation
import CoreText
@testable import JLPTMasterDeck

final class StudyTests: XCTestCase {
    func testSyncPreservesConjugationStepsInOfflineSnapshots() throws {
        let bytes = Data(#"{"changes":[{"collection":"items","id":"verb","value":{"id":"verb","deck":"n1_vocab","original":"考え込む","conjugations":[{"kind":"polite","form":"考え込みます","reading":"かんがえこみます","steps":["词尾む变为み。","接上ます。"]},{"kind":"te","form":"考え込んで"}]}}]}"#.utf8)
        let page = try JSONDecoder().decode(StudySyncPage.self, from: bytes)
        var data = LocalStudyData()
        try data.applySync(try XCTUnwrap(page.changes))
        let restored = try JSONDecoder().decode(LocalStudyData.self, from: JSONEncoder().encode(data))
        let item = try XCTUnwrap(restored.items.first)
        XCTAssertEqual(item.conjugations?.first?.steps, ["词尾む变为み。", "接上ます。"])
        XCTAssertEqual(item.conjugations?.first?.reading, "かんがえこみます")
        XCTAssertNil(item.conjugations?.last?.steps)
        XCTAssertTrue(item.cardText("conjugations", locale: "zh-CN")?.contains("考え込みます") == true)
    }

    func testSyncDecodingFailureIdentifiesRecordAndField() throws {
        let bytes = Data(#"{"changes":[{"collection":"items","id":"broken-card","value":{"id":"broken-card","deck":"n1_vocab","original":[]}}]}"#.utf8)
        let page = try JSONDecoder().decode(StudySyncPage.self, from: bytes)
        var data = LocalStudyData()
        XCTAssertThrowsError(try data.applySync(try XCTUnwrap(page.changes))) { error in
            guard case APIError.decoding(let path, let field) = error else {
                return XCTFail("Expected a contextual sync decoding error, got \(error)")
            }
            XCTAssertEqual(path, "api/sync · items[broken-card]")
            XCTAssertEqual(field, "original")
        }
    }

    @MainActor func testBackgroundPracticeDraftWritesKeepLatestSelectionAndCompletion() async throws {
        let key = "practice-writer-test-\(UUID().uuidString)"
        defer { UserDefaults.standard.removeObject(forKey: key) }
        var draft = NativePracticeCheckpoint(questionIDs: ["q1", "q2"], index: 0,
                                              selections: ["q1": "A"], answers: [],
                                              attemptID: "attempt", started: .now, elapsed: [:], batchFeedback: true)
        NativePracticeDraftWriter.write(draft, key: key)
        draft.index = 1; draft.selections["q1"] = "B"
        NativePracticeDraftWriter.write(draft, key: key)
        XCTAssertEqual(NativePracticeDraftWriter.read(key: key)?.selections["q1"], "B")
        for _ in 0..<100 {
            if NativePracticeCheckpoint.load(key: key, questionIDs: draft.questionIDs)?.selections["q1"] == "B" { break }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTAssertEqual(NativePracticeCheckpoint.load(key: key, questionIDs: draft.questionIDs)?.index, 1)
        NativePracticeDraftWriter.write(nil, key: key)
        XCTAssertNil(NativePracticeDraftWriter.read(key: key))
        for _ in 0..<100 {
            if UserDefaults.standard.data(forKey: key) == nil { break }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTAssertNil(UserDefaults.standard.data(forKey: key))
    }

    func testPracticeDraftRestoresUnsubmittedChoicesAndPositionForSameAccount() throws {
        let suite = "practice-draft-test-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let round = NativeRound(title: "今日练习", questions: [], view: "daily-practice", practiceId: "pack-1")
        let key = NativePracticeCheckpoint.key(accountID: 1, round: round)
        let started = Date(timeIntervalSince1970: 100)
        NativePracticeCheckpoint(questionIDs: ["q1", "q2"], index: 1,
                                 selections: ["q1": "A", "q2": "B"],
                                 answers: [.init(questionId: "q1", itemId: "item1", kind: "vocabulary", selected: "A", correct: true, answeredAt: "2026-10-06T00:00:00Z", elapsedMs: 1200)],
                                 attemptID: "original-attempt", started: started,
                                 elapsed: ["q1": 1200], batchFeedback: true).save(key: key, defaults: defaults)
        let draft = try XCTUnwrap(NativePracticeCheckpoint.load(key: key, questionIDs: ["q1", "q2"], defaults: defaults))
        XCTAssertEqual(draft.index, 1)
        XCTAssertEqual(draft.selections["q2"], "B")
        XCTAssertEqual(draft.answers.first?.questionId, "q1")
        XCTAssertEqual(draft.attemptID, "original-attempt")
        XCTAssertEqual(draft.started, started)
        XCTAssertEqual(draft.elapsed["q1"], 1200)
        XCTAssertTrue(draft.batchFeedback)
        XCTAssertNil(NativePracticeCheckpoint.load(key: NativePracticeCheckpoint.key(accountID: 2, round: round), questionIDs: ["q1", "q2"], defaults: defaults))
        XCTAssertNil(NativePracticeCheckpoint.load(key: key, questionIDs: ["q2", "q1"], defaults: defaults))
        defaults.removeObject(forKey: key)
        XCTAssertNil(NativePracticeCheckpoint.load(key: key, questionIDs: ["q1", "q2"], defaults: defaults))
    }

    func testDailyDraftQuestionFormatsCanBePreviewedAndPublished() throws {
        for key in ["generated_practice", "quiz", "practice_questions", "review_questions"] {
            let json = """
            {"id":"daily","title":"每日练习","status":"draft","updated_at":"v1","content":{"sections":[{"questions":[{"prompt":"旧题"}]}],"\(key)":[{"prompt":"每日题目","choices":["A","B"],"answer":1}]}}
            """
            let draft = try JSONDecoder().decode(NativeTopicDraft.self, from: Data(json.utf8))
            XCTAssertEqual(draft.sectionQuestions.count, 1)
            XCTAssertTrue(draft.canPublish)
            guard case .object(let fields) = draft.sectionQuestions[0] else { return XCTFail("Missing question") }
            guard case .string(let prompt) = fields["prompt"] else { return XCTFail("Missing prompt") }
            XCTAssertEqual(prompt, "每日题目")
        }
    }

    func testIncrementalChangesMergeDeleteAndPreserveLocalQueue() throws {
        var data = LocalStudyData()
        data.syncCursor = "old"
        let before = ProgressEntry()
        data.pending = [PendingAnswer(id: UUID(), before: before, input: .init(questionId: "memory-card:a", itemId: "a", selected: "forgot", correct: false, progressEntry: before.rated(.forgot)))]
        let bytes = Data(#"{"changes":[{"collection":"items","id":"a","value":{"id":"a","deck":"grammar_expression","original":"古い"}},{"collection":"items","id":"b","value":{"id":"b","deck":"grammar_expression","original":"残す"}}]}"#.utf8)
        let page = try JSONDecoder().decode(StudySyncPage.self,from:bytes)
        try data.applySync(page.changes!)
        let delta = try JSONDecoder().decode(StudySyncPage.self,from:Data(#"{"changes":[{"collection":"items","id":"a","deleted":true},{"collection":"progress","id":"b","value":{"correct":2,"wrong":1,"status":"review"}}]}"#.utf8))
        try data.applySync(delta.changes!)
        XCTAssertEqual(data.items.map(\.id),["b"])
        XCTAssertEqual(data.state.progress["b"]?.correct,2)
        XCTAssertEqual(data.pending.count,1)
        XCTAssertEqual(data.syncCursor,"old")
        let restored = try JSONDecoder().decode(LocalStudyData.self,from:JSONEncoder().encode(data))
        XCTAssertEqual(restored.syncCursor,"old")
    }

    func testJapaneseAnnotationsAreLosslessAndOverrideLocalAnalysis() throws {
        let source = " 😊 温度を測定する。\n"
        let annotation = JapaneseAnnotation(text: source, tokens: [
            .init(surface: " 😊 "), .init(surface: "温度", reading: "おんど", pos: "noun"),
            .init(surface: "を", pos: "particle"), .init(surface: "測定", reading: "そくてい", pos: "noun"),
            .init(surface: "する", pos: "verb"), .init(surface: "。\n")])
        let tokens = JapaneseAnalysis.tokens(source, japanese: true, annotations: [annotation], items: [], terms: [])
        XCTAssertEqual(tokens.map(\.surface).joined(), source)
        XCTAssertEqual(tokens.first { $0.surface == "温度" }?.reading, "おんど")
        XCTAssertEqual(tokens.first { $0.surface == "する" }?.pos, "verb")
        let invalid = JapaneseAnnotation(text: source, tokens: [.init(surface: "違う文")])
        let fallback = JapaneseAnalysis.tokens(source, japanese: true, annotations: [invalid], items: [], terms: [])
        XCTAssertEqual(fallback.map(\.surface).joined(), source)
        XCTAssertGreaterThan(fallback.count, 3)
        XCTAssertTrue(fallback.contains { $0.surface == "を" && $0.pos == "particle" })
        let chinese = JapaneseAnalysis.tokens("中文内容保持原样。", japanese: false, annotations: [], items: [], terms: [])
        XCTAssertTrue(chinese.allSatisfy { $0.pos == nil && $0.reading == nil })
    }

    func testJapaneseRubyAndStylesDoNotRewriteSourceOrRevealReadingAnswers() throws {
        let tokens = [JapaneseAnnotation.Token(surface: "温度", reading: "おんど", pos: "noun", isJapanese: true),
                      .init(surface: "を", pos: "particle", isJapanese: true),
                      .init(surface: "測定", reading: "そくてい", pos: "noun", isJapanese: true)]
        var display = JapaneseDisplay(); display.segmented = true
        display.styles["noun"] = .init(mode: "text", color: "#123456")
        let font = UIFont.systemFont(ofSize: 18)
        let styled = JapaneseAttributed.make(tokens: tokens, display: display, ruby: true, font: font, color: .black)
        let rubyKey = NSAttributedString.Key(kCTRubyAnnotationAttributeName as String)
        XCTAssertNotNil(styled.attribute(rubyKey, at: 0, effectiveRange: nil))
        XCTAssertFalse(styled.string.contains("おんど"))
        XCTAssertTrue(styled.string.contains("\u{2009}"))
        XCTAssertEqual((styled.attribute(.foregroundColor, at: 0, effectiveRange: nil) as? UIColor)?.japaneseHex, "#123456")
        let hidden = JapaneseAttributed.make(tokens: tokens, display: display, ruby: false, font: font, color: .black)
        XCTAssertNil(hidden.attribute(rubyKey, at: 0, effectiveRange: nil))
        display.segmented = false
        let plain = JapaneseAttributed.make(tokens: tokens, display: display, ruby: false, font: font, color: .black)
        XCTAssertEqual(plain.string, "温度を測定")
        XCTAssertNil(plain.attribute(.underlineStyle, at: 0, effectiveRange: nil))
        let restored = JapaneseDisplay(settings: ["japaneseDisplay": display.setting])
        XCTAssertEqual(restored, display)
    }

    func testItemPracticeUsesBankAndPackQuestionsLinkedToTheItem() throws {
        let linked = (0..<25).map { index in
            NativeQuestion(id: "QV\(index + 1)", itemId: "W1", kind: "meaning", title: "词义", prompt: "測定", choices: ["测定", "决定"], answer: "测定")
        }
        let unrelated = NativeQuestion(id: "QV99", itemId: "W2", kind: "meaning", title: "词义", prompt: "別", choices: ["A", "B"], answer: "A")
        NativeItemQuestions.bank = [linked[0], unrelated]
        defer { NativeItemQuestions.bank = [] }
        let item = try JSONDecoder().decode(StudyItem.self, from: Data(#"{"id":"W1","deck":"n1_vocab","original":"測定"}"#.utf8))
        let packs = [NativePack(id: "DP1", title: "练习", date: "2026-10-05", questions: linked + [linked[0], unrelated])]
        let questions = try NativeItemQuestions.build(item: item, items: [item], packs: packs, locale: "zh-CN")
        XCTAssertEqual(Set(questions.map(\.id)), Set(linked.map(\.id)))
        XCTAssertEqual(questions.filter { $0.id == "QV1" }.count, 1)
        XCTAssertTrue(questions.allSatisfy { $0.itemId == "W1" && $0.isUsable })
    }

    func testTypePracticePoolDeduplicatesBankAndPackQuestions() throws {
        let question = NativeQuestion(id: "QG1", itemId: "G1", kind: "grammar", title: "文法", prompt: "ここは（　）工場だった。", choices: ["かつて", "まだ"], answer: "かつて")
        NativeItemQuestions.bank = [question]
        defer { NativeItemQuestions.bank = [] }
        XCTAssertEqual(try NativeItemQuestions.buildAll(items: [], packs: [], locale: "zh-CN").map(\.id), ["QG1"])
        let pack = NativePack(id: "DP1", title: "练习", date: "2026-10-07", questions: [question, question])
        XCTAssertEqual(try NativeItemQuestions.buildAll(items: [], packs: [pack], locale: "zh-CN").map(\.id), ["QG1"])
        var data = LocalStudyData(); data.wordbooks = [NativeWordbook(id: "WB1", title: "时间", deck: "all")]; data.bank = [question]
        let restored = try JSONDecoder().decode(LocalStudyData.self, from: JSONEncoder().encode(data))
        XCTAssertEqual(restored.wordbooks?.first?.id, "WB1")
        XCTAssertEqual(restored.bank?.map(\.id), ["QG1"])
    }

    actor ImageDownloads {
        var calls = 0
        func fetch(_ bytes: Data) async throws -> Data { calls += 1; try await Task.sleep(for: .milliseconds(50)); return bytes }
        func count() -> Int { calls }
    }
    @MainActor
    func testImageCacheCoalescesDownloadsAndSurvivesOfflineRestart() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        let bytes = try XCTUnwrap(UIGraphicsImageRenderer(size: CGSize(width: 80, height: 60), format: format).image { context in
            UIColor.green.setFill(); context.fill(CGRect(x: 0, y: 0, width: 80, height: 60))
        }.pngData())
        let counter = ImageDownloads()
        let cache = NativeImageCache(root: root, download: { _ in try await counter.fetch(bytes) })
        let request = try APIClient.itemImageRequest(["id": "offline-image"], token: "secret-token")
        async let first = cache.data(userID: 21, request: request)
        async let second = cache.data(userID: 21, request: request)
        let loaded = try await (first, second)
        XCTAssertEqual(loaded.0, bytes); XCTAssertEqual(loaded.1, bytes)
        let calls = await counter.count(); XCTAssertEqual(calls, 1)
        let file = try await cache.fileURL(userID: 21, request: request)
        XCTAssertFalse(file.path.contains("secret-token"))
        XCTAssertEqual(try Data(contentsOf: file), bytes)
        let missing = try APIClient.itemImageRequest(["id": "missing-image"], token: "secret-token")
        let missingRequests = await cache.missingRequests(userID: 21, requests: [request, missing])
        XCTAssertEqual(missingRequests.map(\.url), [missing.url])
        let otherAccountMissing = await cache.missingRequests(userID: 22, requests: [request])
        XCTAssertEqual(otherAccountMissing.count, 1)
        try Data().write(to: file)
        let emptyFileMissing = await cache.missingRequests(userID: 21, requests: [request])
        XCTAssertEqual(emptyFileMissing.count, 1)
        try bytes.write(to: file)
        let offline = NativeImageCache(root: root, download: { _ in throw URLError(.notConnectedToInternet) })
        let restored = try await offline.bitmap(userID: 21, request: request)
        XCTAssertEqual(restored.image.size.width, 80)
        do { _ = try await offline.data(userID: 22, request: request); XCTFail("Another account must not use the previous account cache") } catch { }
        try Data("corrupt".utf8).write(to: file)
        let repaired = try await cache.data(userID: 21, request: request)
        XCTAssertEqual(repaired, bytes)
        let repairCalls = await counter.count(); XCTAssertEqual(repairCalls, 2)
    }
    @MainActor
    func testInvalidImageResponseIsNotSavedAndRetrySucceeds() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let request = try APIClient.itemImageRequest(["id": "broken-image"], token: nil)
        let cache = NativeImageCache(root: root, download: { _ in Data("not an image".utf8) })
        do { _ = try await cache.data(userID: 21, request: request); XCTFail("Invalid media must fail") } catch { }
        let url = try await cache.fileURL(userID: 21, request: request)
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
        let valid = try XCTUnwrap(UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { context in
            UIColor.blue.setFill(); context.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }.pngData())
        let retry = NativeImageCache(root: root, download: { _ in valid })
        let retried = try await retry.data(userID: 21, request: request)
        XCTAssertEqual(retried, valid)
    }

    @MainActor
    func testDisplayPreferencesDoNotMixReviewAndExplanationKana() throws {
        let store = AppStore()
        store.startDemo()
        let item = try XCTUnwrap(store.items.first { $0.reading != nil && $0.reading != $0.original })
        store.state.settings = ["locale": .string("ja"), "fontSize": .string("large"), "showReviewRuby": .bool(true), "showExplanationRuby": .bool(false)]
        XCTAssertEqual(store.appLanguage, "ja")
        XCTAssertEqual(store.interfaceText("设置"), "設定")
        XCTAssertGreaterThan(store.textScale, 1)
        let tokens = JapaneseAnalysis.tokens(item.original, japanese: true, annotations: [], items: [item], terms: [])
        func rendered(explanation: Bool) -> NSAttributedString {
            JapaneseAttributed.make(tokens: tokens, display: JapaneseDisplay(), ruby: store.displayFlag(explanation ? "showExplanationRuby" : "showReviewRuby"), font: .systemFont(ofSize: 17), color: .black)
        }
        let key = NSAttributedString.Key(kCTRubyAnnotationAttributeName as String)
        XCTAssertNotNil(rendered(explanation: false).attribute(key, at: 0, effectiveRange: nil))
        XCTAssertNil(rendered(explanation: true).attribute(key, at: 0, effectiveRange: nil))
        store.state.settings?["showReviewRuby"] = .bool(false)
        store.state.settings?["showExplanationRuby"] = .bool(true)
        XCTAssertNil(rendered(explanation: false).attribute(key, at: 0, effectiveRange: nil))
        XCTAssertNotNil(rendered(explanation: true).attribute(key, at: 0, effectiveRange: nil))
        let verbRuby = JapaneseAttributed.rubyBase(surface: "見落とす", reading: "みおとす")
        XCTAssertEqual(verbRuby.range, NSRange(location: 0, length: 2))
        XCTAssertEqual(verbRuby.reading, "みお")
        store.state.settings?["locale"] = .string("invalid")
        XCTAssertEqual(store.appLanguage, "zh-CN")
    }

    @MainActor
    func testWorkspaceBecomesReadyBeforeSlowLocalRestoreAndBlocksPrematureWrites() async throws {
        let reading = expectation(description: "Local read suspended")
        var resume: CheckedContinuation<LocalStudyData?, Error>?
        let store = AppStore(readSavedSession: { Session(user: Account(id: -901, username: "Startup test"), token: "test") }, readLocalData: { _ in
            try await withCheckedThrowingContinuation { continuation in
                resume = continuation
                reading.fulfill()
            }
        })
        let task = Task { await store.restore() }
        await fulfillment(of: [reading], timeout: 3)
        XCTAssertFalse(store.isRestoring, "The root must show the workspace while disk work is suspended")
        XCTAssertTrue(store.isSignedIn)
        XCTAssertTrue(store.isRestoringLocal)
        let prematureSync = await store.refresh()
        XCTAssertNil(prematureSync, "Do not replace a snapshot before restoring its pending answers")
        XCTAssertFalse(store.isLoading)
        XCTAssertThrowsError(try store.saveAnswerLocally(questionID: "q", itemID: "item", selected: "A", correct: true, progress: ProgressEntry()))
        XCTAssertTrue(store.pending.isEmpty)
        var cached = LocalStudyData()
        cached.items = DemoData.items
        cached.lastSync = .now
        cached.hasPracticeCache = true
        resume?.resume(returning: cached)
        await task.value
        XCTAssertFalse(store.isRestoringLocal)
        XCTAssertEqual(store.items.map(\.id), cached.items.map(\.id))
        XCTAssertTrue(store.hasPracticeCache)
        store.startDemo()
    }

    @MainActor
    func testAbandonedRestoreCannotPublishIntoAnotherWorkspace() async throws {
        let reading = expectation(description: "Old account read suspended")
        var resume: CheckedContinuation<LocalStudyData?, Error>?
        let store = AppStore(readSavedSession: { Session(user: Account(id: -902, username: "Old account"), token: "test") }, readLocalData: { _ in
            try await withCheckedThrowingContinuation { continuation in
                resume = continuation
                reading.fulfill()
            }
        })
        let task = Task { await store.restore() }
        await fulfillment(of: [reading], timeout: 3)
        store.startDemo()
        let currentIDs = store.items.map(\.id)
        resume?.resume(returning: LocalStudyData())
        await task.value
        XCTAssertTrue(store.isDemo)
        XCTAssertFalse(store.isRestoringLocal)
        XCTAssertEqual(store.items.map(\.id), currentIDs)
        XCTAssertFalse(store.isLoading)
    }

    func testBatchSubmissionStagesAllAnswersAndRetriesWithoutDoubleCounting() throws {
        let questions = [
            NativeQuestion(id: "q1", itemId: "shared", kind: "grammar", title: "第一题", prompt: "题干一", choices: ["A", "B"], answer: "A"),
            NativeQuestion(id: "q2", itemId: "shared", kind: "grammar", title: "第二题", prompt: "题干二", choices: ["C", "D"], answer: "C")
        ]
        let answers = [
            NativeAttempt.AttemptAnswer(questionId: "q1", itemId: "shared", kind: "grammar", selected: "A", correct: true, answeredAt: "2026-10-05T10:00:00Z", elapsedMs: 1000),
            NativeAttempt.AttemptAnswer(questionId: "q2", itemId: "shared", kind: "grammar", selected: "D", correct: false, answeredAt: "2026-10-05T10:00:01Z", elapsedMs: 1000)
        ]
        let attempt = NativeAttempt(id: "batch-one", startedAt: "2026-10-05T09:59:00Z", completedAt: "2026-10-05T10:00:01Z", view: "daily-practice", deck: "all", questionIds: questions.map(\.id), answers: answers)
        let original = LocalStudyData()
        let next = try original.recordingNativeBatch(questions: questions, attempt: attempt)
        XCTAssertTrue(original.pending.isEmpty)
        XCTAssertEqual(next.pending.count, 2)
        XCTAssertEqual(next.state.answers["q1"]?.selected, "A")
        XCTAssertEqual(next.state.answers["q2"]?.selected, "D")
        XCTAssertEqual(next.state.progress["shared"]?.correct, 1)
        XCTAssertEqual(next.state.progress["shared"]?.wrong, 1)
        XCTAssertEqual(next.pending[1].before, next.pending[0].input.progressEntry)
        XCTAssertNil(next.pending[0].input.attemptHistory)
        XCTAssertEqual(next.pending[1].input.attemptHistory?.first?.id, attempt.id)
        let retry = try next.recordingNativeBatch(questions: questions, attempt: attempt)
        XCTAssertEqual(retry.pending.count, 2)
        XCTAssertEqual(retry.state.progress["shared"], next.state.progress["shared"])
        var incomplete = attempt; incomplete.answers.removeLast()
        XCTAssertThrowsError(try original.recordingNativeBatch(questions: questions, attempt: incomplete))
        XCTAssertTrue(original.state.answers.isEmpty)
        let partial = try original.recordingNativeBatch(questions: questions, attempt: incomplete, allowUnanswered: true)
        XCTAssertEqual(partial.pending.count, 1)
        XCTAssertNil(partial.state.answers["q2"])
        XCTAssertEqual(partial.state.progress["shared"]?.reviewCount, 1)
        XCTAssertEqual(partial.state.attemptHistory?.first?.questionIds.count, 2)
        XCTAssertEqual(partial.state.attemptHistory?.first?.answers.count, 1)
        let partialRetry = try partial.recordingNativeBatch(questions: questions, attempt: incomplete, allowUnanswered: true)
        XCTAssertEqual(partialRetry.pending.count, 1)
        var empty = incomplete; empty.answers = []
        let emptySubmission = try original.recordingNativeBatch(questions: questions, attempt: empty, allowUnanswered: true)
        XCTAssertEqual(emptySubmission.pending.count, 1)
        XCTAssertTrue(emptySubmission.state.answers.isEmpty)
        XCTAssertTrue(emptySubmission.state.progress.isEmpty)
        XCTAssertEqual(emptySubmission.pending.first?.historyOnly, true)
        let reloaded = try JSONDecoder().decode(LocalStudyData.self, from: JSONEncoder().encode(emptySubmission))
        let restored = original.preservingLocalWork(pending: reloaded.pending, responses: [:], syncedAt: .now)
        XCTAssertTrue(restored.state.answers.isEmpty)
        XCTAssertTrue(restored.state.progress.isEmpty)
        XCTAssertEqual(restored.state.attemptHistory?.first?.completedAt, empty.completedAt)
        var invalid = attempt
        invalid.answers[0] = .init(questionId: "q1", itemId: "shared", kind: "grammar", selected: "missing", correct: false, answeredAt: answers[0].answeredAt, elapsedMs: 1000)
        XCTAssertThrowsError(try original.recordingNativeBatch(questions: questions, attempt: invalid))
    }

    func testReadingTargetRecoversAuthoredKanjiWithoutRevealingPronunciation() throws {
        let question = try JSONDecoder().decode(NativeQuestion.self, from: Data(#"{"id":"q","itemId":"v","kind":"kanji_to_kana","title":"读音","prompt":"糖尿病や高血圧のデータ","promptTarget":"とうにょうびょう","memoryPoint":"糖尿病","choices":["とうにょうびょう","とうびょう"],"answer":"とうにょうびょう"}"#.utf8))
        XCTAssertEqual(question.readingTarget, "糖尿病")
        XCTAssertEqual(String(question.markedPrompt.characters), question.prompt)
        XCTAssertTrue(question.markedPrompt.runs.contains { $0.underlineStyle == .single })
    }

    func testDailyDraftSelectionPreservesPendingStateAndExcludesTopicsAndOtherDates() throws {
        let draft = try JSONDecoder().decode(PracticeDraft.self, from: Data(#"{"id":"daily","title":"2026-10-05 每日薄弱点强化练习","status":"draft","created_at":"2026-10-05T06:00:00+09:00","updated_at":"2026-10-05T06:00:00+09:00"}"#.utf8))
        let day = StudyDates.day(try XCTUnwrap(StudyDates.parse(draft.created_at!)))
        XCTAssertTrue(draft.isPendingDaily(on: day))
        XCTAssertFalse(draft.isPendingDaily(on: "2026-10-01"))
        XCTAssertFalse(PracticeDraft(id: "topic", title: "语法专项练习", status: "draft", created_at: draft.created_at).isPendingDaily(on: day))
        XCTAssertFalse(PracticeDraft(id: "published", title: draft.title, status: "archived", created_at: draft.created_at).isPendingDaily(on: day))
        XCTAssertTrue(PracticeDraft(id: "approved", title: draft.title, status: "approved", created_at: draft.created_at).isPendingDaily(on: day))
        XCTAssertFalse(PracticeDraft(id: "legacy", title: draft.title, status: "draft").isPendingDaily(on: day))
    }

    func testTopicConfirmationDistinguishesApprovedDraftFromPublishableQuestionSet() throws {
        let draft = try JSONDecoder().decode(NativeTopicDraft.self, from: Data(#"{"id":"topic","title":"语法专项","status":"draft","updated_at":"v1","content":{"sections":[{"questions":[{"prompt":"问题","choices":["A","B"],"answerIndex":0}]}]}}"#.utf8))
        XCTAssertFalse(draft.approved)
        XCTAssertTrue(draft.canPublish)
        XCTAssertEqual(draft.sectionQuestions.count, 1)
        let pending = try JSONDecoder().decode(NativeTopicDraft.self, from: Data(#"{"id":"topic","title":"语法专项","status":"approved","updated_at":"v2","content":{"notes":"等待生成题目"}}"#.utf8))
        XCTAssertTrue(pending.approved)
        XCTAssertFalse(pending.canPublish)
    }

    @MainActor
    func testBackgroundSavePreservesPendingAnswersAndReportsDiskFailure() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let files = LocalStudyFiles(root: root)
        let before = ProgressEntry()
        let after = before.rated(.remembered)
        let operation = PendingAnswer(id: UUID(), before: before, input: .init(questionId: "q", itemId: "v", selected: "A", correct: true, progressEntry: after))
        let snapshot = LocalStudyData().preservingLocalWork(pending: [operation], responses: [:], syncedAt: .now)
        try await files.saveInBackground(snapshot, userID: 1)
        let restored = try XCTUnwrap(files.load(userID: 1))
        XCTAssertEqual(restored.pending.map(\.id), [operation.id])
        XCTAssertEqual(restored.state.progress["v"], after)
        XCTAssertEqual(restored.state.answers["q"]?.selected, "A")
        XCTAssertNil(try files.load(userID: 2))
        let blocked = root.appendingPathComponent("not-a-directory")
        try Data("blocked".utf8).write(to: blocked)
        do {
            try await LocalStudyFiles(root: blocked).saveInBackground(snapshot, userID: 1)
            XCTFail("Disk failure must reach the caller before it acknowledges an upload")
        } catch { }
        XCTAssertEqual(try files.load(userID: 1)?.pending.map(\.id), [operation.id])
    }
    @MainActor
    func testUploadConflictStillDownloadsAndPersistsNewImagesWithoutLosingLocalAnswers() async throws {
        let before = ProgressEntry()
        let after = before.rated(.remembered)
        let operation = PendingAnswer(id: UUID(), before: before, input: .init(questionId: "q", itemId: "v", selected: "A", correct: true, progressEntry: after))
        var vocabulary = StudyItem(id: "v", deck: "vocabulary", original: "青春")
        vocabulary.images = [["id": "new-image"]]
        var cloud = LocalStudyData(items: [vocabulary], state: StudyState(progress: ["other": before.rated(.easy)]))
        cloud.hasPracticeCache = true; cloud.hasListeningCache = true
        let result = try await StudySynchronization.fetch {
            throw IdentityError.message("本机记录与云端进度冲突")
        } download: { cloud }
        XCTAssertNotNil(result.uploadError)
        let now = Date()
        let responses = ["q": LocalStudyResponse(title: "青春", selected: "A", correct: true, answeredAt: now.ISO8601Format(), sessionID: nil)]
        let merged = result.data.preservingLocalWork(pending: [operation], responses: responses, syncedAt: now)
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let files = LocalStudyFiles(root: root)
        try files.save(merged, userID: 1)
        let saved = try XCTUnwrap(files.load(userID: 1))
        XCTAssertEqual(saved.items.first?.images?.first?["id"], "new-image")
        XCTAssertEqual(saved.pending.map(\.id), [operation.id])
        XCTAssertEqual(saved.pending.first?.before, before)
        XCTAssertEqual(saved.state.progress["v"], after)
        XCTAssertEqual(saved.state.progress["other"], cloud.state.progress["other"])
        XCTAssertEqual(saved.state.answers["q"]?.selected, "A")
        XCTAssertEqual(saved.responses?["q"]?.selected, "A")
        XCTAssertEqual(saved.lastSync, now)
        XCTAssertEqual(StudyDataCategory.vocabularyImages.count(in: saved), 1)
        XCTAssertEqual(StudyDataCategory.grammarImages.count(in: saved), 0)
    }
    @MainActor
    func testExpiredSessionAndCancellationDoNotContinueSync() async {
        for failure: Error in [APIError.http(401, "expired"), CancellationError(), URLError(.cancelled)] {
            var downloaded = false
            do {
                _ = try await StudySynchronization.fetch { throw failure } download: {
                    downloaded = true; return LocalStudyData()
                }
                XCTFail("A cancelled or unauthenticated operation must stop")
            } catch { XCTAssertFalse(downloaded) }
        }
    }
    @MainActor
    func testDownloadFailureIsNotReportedAsSuccessfulSync() async {
        do {
            _ = try await StudySynchronization.fetch { } download: { throw URLError(.timedOut) }
            XCTFail("A failed download must not replace the local snapshot")
        } catch { XCTAssertEqual((error as? URLError)?.code, .timedOut) }
    }
    func testImageRequestsHandleUploadedRelativeAndExternalImages() throws {
        let uploaded = try APIClient.itemImageRequest(["id": "vocab-image"], token: "test-token")
        XCTAssertEqual(uploaded.url?.path, "/api/v3/media/vocab-image")
        XCTAssertEqual(uploaded.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
        let relative = try APIClient.itemImageRequest(["url": "/api/v3/media/12"], token: "test-token")
        XCTAssertEqual(relative.url?.host, APIClient.origin.host)
        XCTAssertEqual(relative.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
        let external = try APIClient.itemImageRequest(["url": "https://example.com/image.jpg"], token: "test-token")
        XCTAssertNil(external.value(forHTTPHeaderField: "Authorization"))
        XCTAssertThrowsError(try APIClient.itemImageRequest(["url": "file:///private/image.jpg"], token: nil))
    }
    @MainActor
    func testImagePreviewFitsAndResetsAfterRotation() {
        let bitmap = UIGraphicsImageRenderer(size: CGSize(width: 1200, height: 800)).image { context in
            UIColor.orange.setFill(); context.fill(CGRect(x: 0, y: 0, width: 1200, height: 800))
        }
        let view = MemoryImageScrollView(frame: CGRect(x: 0, y: 0, width: 390, height: 700))
        view.imageView.image = bitmap
        view.layoutIfNeeded()
        XCTAssertEqual(view.minimumZoomScale, 390.0 / 1200, accuracy: 0.001)
        XCTAssertEqual(view.zoomScale, view.minimumZoomScale, accuracy: 0.001)
        view.setZoomScale(view.minimumZoomScale * 2, animated: false)
        XCTAssertGreaterThan(view.zoomScale, view.minimumZoomScale)
        view.frame = CGRect(x: 0, y: 0, width: 700, height: 300)
        view.layoutIfNeeded()
        XCTAssertEqual(view.zoomScale, 300.0 / 800, accuracy: 0.001)
        XCTAssertGreaterThanOrEqual(view.contentInset.left, 0)
    }
    @MainActor
    func testImagePreviewRendersPortraitAndLandscape() throws {
        let bitmap = UIGraphicsImageRenderer(size: CGSize(width: 1200, height: 800)).image { context in
            UIColor(red: 0.93, green: 0.88, blue: 0.77, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 1200, height: 800))
            UIColor(red: 0.25, green: 0.45, blue: 0.55, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 1200, height: 420))
            ("青春（せいしゅん）" as NSString).draw(at: CGPoint(x: 80, y: 490), withAttributes: [.font: UIFont.boldSystemFont(ofSize: 70), .foregroundColor: UIColor.black])
            ("年轻时的时光 · Youth" as NSString).draw(at: CGPoint(x: 80, y: 600), withAttributes: [.font: UIFont.systemFont(ofSize: 46), .foregroundColor: UIColor.darkGray])
        }
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let previous = scene.windows.first { $0.isKeyWindow }
        let window = UIWindow(windowScene: scene)
        defer { window.isHidden = true; previous?.makeKeyAndVisible() }
        for size in [CGSize(width: 390, height: 844), CGSize(width: 844, height: 390)] {
            window.frame = CGRect(origin: .zero, size: size)
            let host = UIHostingController(rootView: MemoryImagePreview(selection: .init(bitmap: bitmap, caption: "青春：年轻时的时光")))
            window.rootViewController = host
            window.makeKeyAndVisible()
            host.view.frame = window.bounds
            host.view.setNeedsLayout(); host.view.layoutIfNeeded()
            let image = UIGraphicsImageRenderer(size: size).image { _ in
                XCTAssertTrue(host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true))
            }
            let attachment = XCTAttachment(image: image)
            attachment.name = "image-preview-\(Int(size.width))x\(Int(size.height))"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }
    func testSpeechSettingsAndChunkingPreserveJapaneseText() {
        let settings: [String: SettingValue] = ["ttsProvider": .string("azure"), "speech": .object([
            "rate": .number(0.8), "voices": .object(["azure": .object(["voice": .string("Nanami"), "style": .string("chat")])])
        ])]
        let configuration = SpeechConfiguration(settings: settings)
        XCTAssertEqual(configuration.provider, "azure")
        XCTAssertEqual(configuration.voice, "Nanami")
        XCTAssertEqual(configuration.style, "chat")
        XCTAssertEqual(configuration.rate, 0.8)
        let text = String(repeating: "青春です。", count: 200) + String(repeating: "𠮷", count: 300)
        let chunks = SpeechConfiguration.chunks(text)
        XCTAssertEqual(chunks.joined(), text)
        XCTAssertTrue(chunks.allSatisfy { $0.utf16.count <= 450 })
    }
    func testDownloadedSpeechSurvivesRestartAndIsIsolatedByAccountAndVoice() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let files = LocalStudyFiles(root: root)
        let request = SpeechRequest(provider: "azure", text: "せいしゅん", voice: "Nanami", style: "", role: "")
        let audio = Data([1, 2, 3])
        var requests = 0
        let downloaded = try await files.speechAudio(userID: 1, request: request) { requests += 1; return audio }
        XCTAssertEqual(downloaded, audio)
        let restored = LocalStudyFiles(root: root)
        let offline = try await restored.speechAudio(userID: 1, request: request) { throw URLError(.notConnectedToInternet) }
        XCTAssertEqual(offline, audio)
        XCTAssertEqual(requests, 1)
        XCTAssertNotEqual(try files.speechURL(userID: 1, request: request), try files.speechURL(userID: 2, request: request))
        let changed = SpeechRequest(provider: "azure", text: "せいしゅん", voice: "Keita", style: "", role: "")
        XCTAssertNotEqual(try files.speechURL(userID: 1, request: request), try files.speechURL(userID: 1, request: changed))
        do {
            _ = try await restored.speechAudio(userID: 2, request: request) { throw URLError(.notConnectedToInternet) }
            XCTFail("A second account must not read another account's downloaded speech")
        } catch { XCTAssertEqual((error as? URLError)?.code, .notConnectedToInternet) }
    }
    @MainActor
    func testNativeAnswersAddCompletedHistoryWithoutCountingPartialRounds() async throws {
        let store = AppStore(); store.startDemo()
        var attempt = DemoData.statisticsFixture()[0]
        attempt.completedAt = nil; attempt.analysisStatus = "completed"
        let question = DemoData.practiceFixture.questions[0]
        try await store.submitNativeQuestion(question, selected: question.answer, attempt: attempt)
        XCTAssertEqual(store.state.attemptHistory?.count, 1)
        XCTAssertTrue(StudyStatistics(attempts: store.state.attemptHistory ?? []).attempts.isEmpty)
        attempt.completedAt = Date.now.ISO8601Format()
        try await store.submitNativeQuestion(question, selected: question.answer, attempt: attempt)
        XCTAssertEqual(StudyStatistics(attempts: store.state.attemptHistory ?? []).attempts.count, 1)
        let request = AnswerInput(questionId: question.id, itemId: question.itemId, selected: question.answer, correct: true, progressEntry: ProgressEntry(), attemptHistory: [attempt])
        let saved = try JSONDecoder().decode(AnswerInput.self, from: JSONEncoder().encode(request))
        XCTAssertEqual(saved.attemptHistory?.first?.analysisStatus, "completed")
    }
    func testStatisticsUseCompletedAttemptsAndTokyoDates() throws {
        let now = try XCTUnwrap(StudyDates.parse("2026-10-05T00:00:00Z"))
        let values = DemoData.statisticsFixture(now: now)
        let state = StudyState(attemptHistory: values)
        let copy = try JSONDecoder().decode(StudyState.self, from: JSONEncoder().encode(state))
        let statistics = StudyStatistics(attempts: copy.attemptHistory ?? [], now: now)
        XCTAssertEqual(statistics.attempts.count, 13)
        XCTAssertEqual(statistics.modules, ["vocabulary", "grammar", "reading", "listening", "mixed", "daily-practice"])
        XCTAssertEqual(statistics.today.count, 1)
        XCTAssertEqual(StudyStatistics.metric(statistics.today).accuracy, "90%")
        XCTAssertEqual(statistics.week.map(\.total), [0,14,10,0,107,83,20])
        XCTAssertEqual(StudyStatistics.metric(statistics.attempts).total, 404)
        XCTAssertEqual(StudyStatistics.metric(statistics.attempts).accuracy, "89%")
        XCTAssertEqual(statistics.week.filter { $0.total > 0 }.count, 5)
        var partial = values[0]; partial.completedAt = nil
        XCTAssertTrue(StudyStatistics(attempts: [partial], now: now).attempts.isEmpty)
        XCTAssertEqual(StudyStatistics.day(try XCTUnwrap(StudyDates.parse("2026-10-04T15:00:00Z"))), "2026-10-05")
        XCTAssertEqual(try JSONDecoder().decode(StudyState.self, from: Data(#"{"progress":{},"answers":{}}"#.utf8)).attemptHistory, nil)
        XCTAssertEqual(NativeAttempt.merging(values, [values[0]]).count, 13)
    }
    func testSpeechAutoPreferencesAndImageRemovalRoundTrip() throws {
        let settings: [String: SettingValue] = ["memoryCardFieldsVersion": .number(2), "memoryCardBackFields": .array([.string("original"), .string("meaning")]),
            "speech": .object(["cardAuto": .string("back"), "grammarAuto": .bool(true), "includeExample": .bool(true), "rate": .number(1.25)])]
        let copy = try JSONDecoder().decode([String: SettingValue].self, from: JSONEncoder().encode(settings))
        XCTAssertFalse(CardFields.selected(copy, back: true).contains("images"))
        let speech = SpeechConfiguration(settings: copy)
        XCTAssertEqual(speech.cardAuto, "back")
        XCTAssertTrue(speech.grammarAuto); XCTAssertTrue(speech.includeExample)
        XCTAssertEqual(speech.rate, 1.25)
    }
    func testSchemaV2ItemFieldsSyncAndPreferTheExplanationLanguage() throws {
        // Payload shape returned by /api/sync after the schema v2 migration: code, romaji and localized texts.
        let bytes = Data(#"{"changes":[{"collection":"items","id":"n1-概観","value":{"id":"n1-概観","deck":"n1_vocab","original":"概観","reading":"がいかん","meaning_zh":"概观","explanation_zh":"从整体上把握。","reference":"W5","romaji":"gaikan","localized":{"language":"en","meaning":{"text":"overview","language":"en","isFallback":false,"origin":"ai","verified":false},"explanation":{"text":"从整体上把握。","language":"zh-Hans","isFallback":true,"origin":"legacy","verified":true}}}}]}"#.utf8)
        let page = try JSONDecoder().decode(StudySyncPage.self, from: bytes)
        var data = LocalStudyData()
        try data.applySync(try XCTUnwrap(page.changes))
        let item = try XCTUnwrap(try JSONDecoder().decode(LocalStudyData.self, from: JSONEncoder().encode(data)).items.first)
        XCTAssertEqual(item.copyIdentifier, "W5")
        XCTAssertEqual(item.cardText("romaji", locale: "zh-CN"), "gaikan")
        XCTAssertEqual(item.cardText("meaning", locale: "zh-CN"), "overview")
        XCTAssertEqual(item.localized?.meaning?.note(requested: "en"), "AI 译文，未核对")
        XCTAssertEqual(item.cardText("explanation", locale: "zh-CN"), "从整体上把握。")
        XCTAssertEqual(item.localized?.explanation?.note(requested: "en"), "暂无English译文，显示简体中文")
        let annotated = try JSONDecoder().decode(StudyItem.self, from: Data(#"{"id":"y","deck":"n1_vocab","original":"概観","ruby_annotations":{"日本経済の歴史を概観する。":"日本経済[にほんけいざい]の 歴史[れきし]を 概観[がいかん]する。"}}"#.utf8))
        let annotation = try XCTUnwrap(annotated.aiRubyAnnotations.first)
        XCTAssertTrue(annotation.isValid)
        XCTAssertEqual(annotation.tokens.compactMap(\.reading), ["にほんけいざい", "れきし", "がいかん"])
        let tokens = JapaneseAnalysis.tokens("日本経済の歴史を概観する。", japanese: true, annotations: annotated.aiRubyAnnotations, items: [], terms: [.init(text: "日本", reading: "にほん")])
        XCTAssertEqual(tokens.first?.surface, "日本経済")
        XCTAssertEqual(tokens.first?.reading, "にほんけいざい")
        // Items synced before the migration have none of the new fields and keep working.
        let legacy = try JSONDecoder().decode(StudyItem.self, from: Data(#"{"id":"x","deck":"n1_vocab","original":"概観","meaning_zh":"概观"}"#.utf8))
        XCTAssertNil(legacy.cardText("romaji", locale: "zh-CN"))
        XCTAssertEqual(legacy.cardText("meaning", locale: "zh-CN"), "概观")
    }
    func testCardFieldDefaultsAndNormalizationMatchWeb() throws {
        XCTAssertEqual(CardFields.selected(nil, back: false), ["original"])
        XCTAssertEqual(CardFields.selected(nil, back: true), ["original", "reading", "images", "patterns", "meaning", "examples", "core_memory"])
        let settings: [String: SettingValue] = ["memoryCardFrontFields": .array([.string("unknown"), .string("reading"), .string("reading")])]
        XCTAssertEqual(CardFields.selected(settings, back: false), ["reading"])
        XCTAssertEqual(CardFields.selected(["memoryCardBackFields": .array([])], back: true), CardFields.back)
    }
    func testCardContentAndSettingsSurviveOfflineRoundTrip() throws {
        let json = #"{"id":"grammar","deck":"grammar_expression","original":"たとたん（に）","reading":"たとたんに","meaning_zh":"刚一","patterns":[{"pattern":"Vた＋とたん","connection_zh":"接续"}],"examples":[{"ja":"教材では「とたん」という表現を学んだ","zh":"skip"},{"ja":"出たとたん、雨が降った。","zh":"刚出去就下雨了。"}],"localizations":{"ja":{"meaning":"直後"}},"images":[{"id":"img1"}]}"#
        let item = try JSONDecoder().decode(StudyItem.self, from: Data(json.utf8))
        XCTAssertNil(item.cardText("reading", locale: "zh-CN"))
        XCTAssertEqual(item.cardText("meaning", locale: "ja"), "直後")
        XCTAssertEqual(item.cardText("patterns", locale: "zh-CN"), "Vた＋とたん：接续")
        XCTAssertEqual(item.cardText("examples", locale: "zh-CN"), "出たとたん、雨が降った。\n刚出去就下雨了。")
        XCTAssertNil(item.cardText("source", locale: "zh-CN"))
        let copy = try JSONDecoder().decode(StudyItem.self, from: JSONEncoder().encode(item))
        XCTAssertEqual(copy.images?.first?["id"], "img1")
        let stateJSON = #"{"progress":{},"answers":{},"settings":{"memoryCardFrontFields":["original"],"showReviewRuby":true,"fontSize":"large","requireJlptVocabularyQuestions":true,"jlptVocabularyQuestionKinds":["meaning","usage"],"future":{"value":2}}}"#
        let state = try JSONDecoder().decode(StudyState.self, from: Data(stateJSON.utf8))
        let restored = try JSONDecoder().decode(StudyState.self, from: JSONEncoder().encode(state))
        XCTAssertEqual(restored.settings, state.settings)
        XCTAssertEqual(restored.settings?["requireJlptVocabularyQuestions"], .bool(true))
        XCTAssertEqual(restored.settings?["jlptVocabularyQuestionKinds"], .array([.string("meaning"), .string("usage")]))
    }

    func testPracticeSchedulingMatchesWebSequence() {
        let now = Date(timeIntervalSince1970: 1_791_000_000)
        let first = ProgressEntry().afterPractice(correct: true, now: now)
        let second = first.afterPractice(correct: true, now: now.addingTimeInterval(86400))
        let third = second.afterPractice(correct: true, now: now.addingTimeInterval(4 * 86400))
        XCTAssertEqual(first.intervalDays, 1)
        XCTAssertEqual(second.intervalDays, 3)
        XCTAssertEqual(third.intervalDays, 9)
        XCTAssertEqual(third.correct, 3)
        let wrong = third.afterPractice(correct: false, now: now)
        XCTAssertEqual(wrong.intervalDays, 1)
        XCTAssertEqual(wrong.wrong, 1)
        XCTAssertEqual(wrong.firstSeenAt, first.firstSeenAt)
    }
    func testEarlyPracticeKeepsDueDateAndInflatedIntervalsRecover() {
        let now = Date(timeIntervalSince1970: 1_791_000_000)
        let first = ProgressEntry().afterPractice(correct: true, now: now)
        var repeated = first
        for _ in 0..<100 { repeated = repeated.afterPractice(correct: true, now: now) }
        XCTAssertEqual(repeated.nextReviewAt, first.nextReviewAt)
        XCTAssertEqual(repeated.intervalDays, 1)
        XCTAssertEqual(repeated.correct, 101)
        var inflated = repeated
        inflated.intervalDays = 80_714_138
        inflated.nextReviewAt = "+223014-07-29T01:10:48.000Z"
        let repaired = inflated.afterPractice(correct: true, now: now)
        XCTAssertEqual(repaired.intervalDays, 365)
        XCTAssertNotNil(repaired.nextReviewAt.flatMap { StudyDates.parse($0) })
    }
    func testTopicClassificationMatchesExistingWebsite() {
        XCTAssertFalse(PracticeDraft(id: "daily", title: "2026-10-02 每日练习", status: "archived").isTopic)
        XCTAssertTrue(PracticeDraft(id: "topic", title: "第4課・並列表現专项训练", status: "archived").isTopic)
    }
    func testDiscoveryDecodesSharedQuestionsWithoutPrivateIDs() throws {
        let json = #"{"package":{"kind":"practice","title":"共有文法","questions":[{"prompt":"問題","choices":["A","B"],"answer":"B","correctReason":"理由"},{"prompt":"不完全","choices":[],"answer":""}]}}"#
        let detail = try JSONDecoder().decode(DiscoveryDetail.self, from: Data(json.utf8))
        XCTAssertEqual(detail.package.questions?.count, 2)
        XCTAssertEqual(detail.package.practiceQuestions.count, 1)
        XCTAssertEqual(detail.package.practiceQuestions.first?.answer, "B")
        XCTAssertEqual(detail.package.practiceQuestions.first?.correctReason, "理由")
    }

    func testDiscoveryWordbookDoesNotRequirePrivateItemIDs() throws {
        let json = #"{"package":{"kind":"wordbook","title":"単語","items":[{"original":"共有","reading":"きょうゆう","meaning_zh":"共享"}]}}"#
        let detail = try JSONDecoder().decode(DiscoveryDetail.self, from: Data(json.utf8))
        XCTAssertEqual(detail.package.items?.first?.reading, "きょうゆう")
        XCTAssertTrue(detail.package.practiceQuestions.isEmpty)
    }

    func testNativeQuestionDecodesExistingPracticePayload() throws {
        let data = Data(#"{"id":"q1","itemId":"i1","kind":"grammar","title":"文法","prompt":"問題","choices":["A","B"],"answer":"A","correctReason":"理由","choiceAnalysis":[{"choice":"A","correct":true,"explanation":"正解"}]}"#.utf8)
        let question = try JSONDecoder().decode(NativeQuestion.self, from: data)
        XCTAssertTrue(question.isUsable)
        XCTAssertEqual(question.choiceAnalysis?.first?.explanation, "正解")
    }
    func testListeningGroupsSharedAudioAndPreservesNumberOnlyChoices() throws {
        let json = #"{"questions":[{"id":"b","title":"Audio","question":"Q2","explanation":"E","questionTypeId":"listening-quick","choices":["","",""],"answerIndex":1,"audioAssetId":"shared","libraryNumber":2,"audioFileName":"a.mp3","audioSize":100,"createdAt":"2026-10-02"},{"id":"a","title":"Audio","question":"Q1","explanation":"E","questionTypeId":"listening-quick","choices":[],"answerIndex":-1,"audioAssetId":"shared","libraryNumber":1,"audioFileName":"a.mp3","audioSize":100,"createdAt":"2026-10-02"}]}"#
        let items = try JSONDecoder().decode(ListeningEnvelope.self, from: Data(json.utf8)).questions
        let groups = ListeningGroup.make(items)
        XCTAssertEqual(groups.count, 1)
        XCTAssertEqual(groups[0].questions.map(\.id), ["a", "b"])
        XCTAssertTrue(groups[0].questions[0].freeResponse)
        XCTAssertFalse(groups[0].questions[1].freeResponse)
    }
    func testListeningCountsOncePerAudioSessionWithoutChangingCorrectness() {
        let prior = ProgressEntry(correct: 2, wrong: 1, status: "review")
        let next = prior.afterListening(sessionID: "same")
        XCTAssertEqual(next.reviewCount, 1)
        XCTAssertEqual(next.correct, 2)
        XCTAssertEqual(next.wrong, 1)
        XCTAssertEqual(next.afterListening(sessionID: "same").reviewCount, 1)
        XCTAssertEqual(next.afterListening(sessionID: "new").reviewCount, 2)
    }
    func testForgotSchedulesTenMinutesAndPreservesHistory() throws {
        let now = try XCTUnwrap(StudyDates.parse("2026-10-02T03:00:00.000Z"))
        var prior = ProgressEntry(correct: 4, wrong: 1, status: "review")
        prior.reviewCount = 5; prior.ease = 1.3; prior.lastPracticeSessionId = "reading-session"
        let next = prior.rated(.forgot, now: now)
        XCTAssertEqual(next.correct, 4); XCTAssertEqual(next.wrong, 1)
        XCTAssertEqual(next.reviewCount, 6); XCTAssertEqual(next.status, "learning")
        XCTAssertEqual(next.ease, 1.3)
        XCTAssertEqual(try XCTUnwrap(StudyDates.parse(next.nextReviewAt!)).timeIntervalSince(now), 600, accuracy: 0.01)
        XCTAssertEqual(next.lastPracticeSessionId, "reading-session")
    }
    func testRememberedAndEasyMatchWebIntervals() throws {
        let now = Date(timeIntervalSince1970: 1_791_000_000)
        for (rating, days) in [(MemoryRating.hard, 1), (.remembered, 3), (.easy, 7)] {
            let next = ProgressEntry().rated(rating, now: now)
            XCTAssertEqual(next.correct, 0); XCTAssertEqual(next.wrong, 0)
            XCTAssertEqual(next.intervalDays, days)
            XCTAssertEqual(StudyDates.parse(next.nextReviewAt!), Calendar.current.date(byAdding: .day, value: days, to: now))
        }
    }
    func testWebStudyPayloadIgnoresAdditionalFieldsWithoutLosingProgress() throws {
        let bytes = Data(#"{"settings":{"locale":"zh-CN"},"answers":{},"progress":{"IT-1":{"correct":2,"wrong":1,"status":"review","nextReviewAt":"2026-10-03T10:00:00.000Z"}},"attemptHistory":[],"activeAttempt":null,"practiceCompletionCounts":{"PR-1":9}}"#.utf8)
        let state = try JSONDecoder().decode(StudyState.self, from: bytes)
        XCTAssertEqual(state.progress["IT-1"]?.correct, 2)
        XCTAssertNotNil(StudyDates.parse(state.progress["IT-1"]!.nextReviewAt!))
    }
    func testMinimalAndGeneratedItemsDecode() throws {
        let bytes = Data(#"{"items":[{"id":"1","deck":"n1_vocab","original":"測定"},{"id":"2","deck":"grammar_expression","original":"もさることながら","content_origin":"ai_generated","verification_status":"unverified"}]}"#.utf8)
        let items = try JSONDecoder().decode(ReviewData.self, from: bytes).items
        XCTAssertNil(items[0].meaning_zh)
        XCTAssertTrue(items[1].isGrammar)
        XCTAssertEqual(items[1].sourceLabel, "AI 生成 · 待核验")
    }
    func testPracticeExplanationPreservesLegacyReasonsAndCanonicalChoiceOrder() {
        let question = NativeQuestion(id: "legacy", itemId: "item", kind: "grammar", title: "语法", prompt: "例句", choices: ["A", "B", "C"], answer: "B",
            correctReason: "本题依据。\n「A」：接续不同。\n「B」：符合语境。\n「C」：含义不同。",
            choiceAnalysis: [.init(choice: "A", correct: false, explanation: "不符合本题语境。"), .init(choice: "C", correct: true, explanation: "保留已有具体解析。")])
        let details = question.explanationDetails
        XCTAssertEqual(details.reason, "本题依据。")
        XCTAssertEqual(details.choices.map(\.choice), ["A", "B", "C"])
        XCTAssertEqual(details.choices.map(\.correct), [false, true, false])
        XCTAssertEqual(details.choices.map(\.explanation), ["接续不同。", "符合语境。", "保留已有具体解析。"])
        let excerpt = PracticeExcerpt("【核心】本题依据。\n完整依据仍保留。")
        XCTAssertEqual(excerpt.summary, "本题依据。")
        XCTAssertTrue(excerpt.hasMore)
        XCTAssertFalse(PracticeExcerpt("简短依据。", limit: 120).hasMore)
    }

}

final class OfflineStudyTests: XCTestCase {
    func testSnapshotRestoresAnswersAndPendingWritesWithoutMixingAccounts() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let files = LocalStudyFiles(root: root)
        let now = Date(timeIntervalSince1970: 1_791_000_000)
        let before = ProgressEntry()
        let progress = before.afterPractice(correct: false, now: now)
        let input = AnswerInput(questionId: "q1", itemId: "i1", selected: "B", correct: false, progressEntry: progress)
        var snapshot = LocalStudyData()
        snapshot.pending = [PendingAnswer(id: UUID(), before: before, input: input)]
        snapshot.state.progress["i1"] = progress
        snapshot.state.answers["q1"] = .init(selected: "B", correct: false, answeredAt: now.ISO8601Format())
        snapshot.packs = [NativePack(id: "daily", title: "Today", date: StudyDates.day(now), questions: [question()])]
        snapshot.hasPracticeCache = true
        snapshot.responses = ["listening-free": LocalStudyResponse(title: "自由回答", selected: "駅で待ちます", correct: nil, answeredAt: now.ISO8601Format(), sessionID: "round-1")]
        try files.save(snapshot, userID: 1)
        let restored = try XCTUnwrap(files.load(userID: 1))
        XCTAssertEqual(restored.pending.first?.id, snapshot.pending.first?.id)
        XCTAssertEqual(restored.state.progress["i1"]?.wrong, 1)
        XCTAssertEqual(restored.state.answers["q1"]?.selected, "B")
        XCTAssertEqual(restored.packs.first?.questions.first?.answer, "A")
        XCTAssertTrue(restored.hasPracticeCache)
        XCTAssertEqual(restored.responses?["listening-free"]?.selected, "駅で待ちます")
        XCTAssertNil(restored.responses?["listening-free"]?.correct)
        XCTAssertNil(try files.load(userID: 2))
    }
    func testCardReviewEventsUploadRegardlessOfCloudProgress() {
        let before = ProgressEntry()
        let next = before.rated(.remembered)
        let pending = PendingAnswer(id: UUID(), before: before, input: .init(questionId: "memory-card:i", itemId: "i", selected: "remembered", correct: true, progressEntry: next))
        XCTAssertEqual(pending.disposition(cloud: before), .send)
        XCTAssertEqual(pending.disposition(cloud: next), .send)
        XCTAssertEqual(pending.disposition(cloud: next.rated(.easy)), .send)
        XCTAssertEqual(pending.disposition(cloud: before.rated(.forgot)), .send)
    }
    func testObjectiveAnswersStillDetectConflictingProgress() {
        let before = ProgressEntry()
        let next = before.rated(.remembered)
        let pending = PendingAnswer(id: UUID(), before: before, input: .init(questionId: "q", itemId: "i", selected: "1", correct: true, progressEntry: next))
        XCTAssertEqual(pending.disposition(cloud: before), .send)
        XCTAssertEqual(pending.disposition(cloud: next), .alreadyApplied)
        XCTAssertEqual(pending.disposition(cloud: before.rated(.forgot)), .conflict)
    }
    func testSyncReviewStateSurvivesDiskAndDoesNotTriggerAutomaticUploads() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let files = LocalStudyFiles(root: root)
        var snapshot = LocalStudyData()
        let before = ProgressEntry()
        var operation = PendingAnswer(id: UUID(), before: before, input: .init(questionId: "q", itemId: "i", selected: "A", correct: true, progressEntry: before.rated(.remembered)))
        operation.needsSyncReview = true
        snapshot.pending = [operation]
        snapshot.lastSync = .now
        try files.save(snapshot, userID: 1)
        let restored = try XCTUnwrap(files.load(userID: 1))
        XCTAssertEqual(restored.syncReviewCount, 1)
        XCTAssertEqual(restored.uploadableCount, 0)
        XCTAssertFalse(AutomaticRefreshPolicy.shouldRefresh(lastSync: restored.lastSync, lastAttempt: nil, hasPending: restored.uploadableCount > 0))
        operation.needsSyncReview = false
        operation.syncDecision = "merge"
        snapshot.pending = [operation]
        try files.save(snapshot, userID: 1)
        XCTAssertEqual(try files.load(userID: 1)?.pending.first?.syncDecision, "merge")
        XCTAssertEqual(try files.load(userID: 1)?.uploadableCount, 1)
    }
    func testLegacyQueueDecodesWithoutSyncMetadata() throws {
        let operation = PendingAnswer(id: UUID(), before: ProgressEntry(), input: .init(questionId: "q", itemId: "i", selected: "A", correct: true, progressEntry: ProgressEntry()))
        let decoded = try JSONDecoder().decode(PendingAnswer.self, from: JSONEncoder().encode(operation))
        XCTAssertNil(decoded.needsSyncReview)
        XCTAssertNil(decoded.input.syncEventId)
        XCTAssertTrue(decoded.canAutomaticallyUpload)
    }
    @MainActor func testDailyOrderingChangesOnlyAfterEveryQuestionHasAnAnswer() {
        let pack = NativePack(id: "today", title: "Today", date: StudyDates.day(), questions: [question(), question(id: "q2")])
        var answers: [String: StudyState.Answer] = [:]
        XCTAssertFalse(AppStore.dailyCompleted(packs: [], answers: answers))
        XCTAssertFalse(AppStore.dailyCompleted(packs: [pack], answers: answers))
        answers["q1"] = .init(selected: "B", correct: false)
        XCTAssertFalse(AppStore.dailyCompleted(packs: [pack], answers: answers))
        answers["q2"] = .init(selected: "A", correct: true)
        XCTAssertTrue(AppStore.dailyCompleted(packs: [pack], answers: answers))
        XCTAssertEqual(PracticeEntry.ordered(dailyCompleted: false).map(\.id), ["daily", "topics", "mixed"])
        XCTAssertEqual(PracticeEntry.ordered(dailyCompleted: true).first?.id, "topics")
    }
    func testAudioCacheIsScopedToAccountAndAudioVersion() throws {
        let bytes = Data(#"{"id":"a","title":"Audio","question":"Q1","explanation":"E","questionTypeId":"listening-quick","choices":[],"answerIndex":-1,"audioAssetId":"shared","audioFileName":"a.mp3","audioSize":100,"createdAt":"2026-10-02"}"#.utf8)
        let item = try JSONDecoder().decode(ListeningItem.self, from: bytes)
        let files = LocalStudyFiles()
        XCTAssertNotEqual(files.audioURL(userID: 1, item: item), files.audioURL(userID: 2, item: item))
        let updated = try JSONDecoder().decode(ListeningItem.self, from: Data(String(decoding: bytes, as: UTF8.self).replacingOccurrences(of: "100", with: "200").utf8))
        XCTAssertEqual(files.audioURL(userID: 1, item: item), files.audioURL(userID: 1, item: updated))
        XCTAssertEqual(files.audioURL(userID:1,item:item),files.audioMaterialURL(userID:1,assetID:"shared"))
        XCTAssertNotEqual(files.audioURL(userID:1,item:item),files.legacyAudioURL(userID:1,item:item))
    }
    private func question(id: String = "q1") -> NativeQuestion {
        NativeQuestion(id: id, itemId: "i1", kind: "grammar", title: "Grammar", prompt: "Q", choices: ["A", "B"], answer: "A")
    }
}

final class DatabaseCheckTests: XCTestCase {
    func testCountsPartitionCardsAndDeduplicateQuestionsAcrossPacks() throws {
        var data = LocalStudyData()
        data.items = try JSONDecoder().decode(ReviewData.self, from: Data(#"{"items":[{"id":"v","deck":"n1_vocab","original":"測定"},{"id":"g","deck":"grammar_expression","original":"ながら"}]}"#.utf8)).items
        let question = NativeQuestion(id: "shared", itemId: "v", kind: "grammar", title: "Q", prompt: "Q", choices: ["A", "B"], answer: "A")
        data.packs = [NativePack(id: "one", title: "One", date: "2026-10-03", questions: [question]),
                      NativePack(id: "two", title: "Two", date: "2026-10-03", questions: [question])]
        data.state.progress["v"] = ProgressEntry()
        data.state.answers["shared"] = .init(selected: "B", correct: false)
        data.pending = [PendingAnswer(id: UUID(), before: ProgressEntry(), input: .init(questionId: "shared", itemId: "v", selected: "B", correct: false, progressEntry: ProgressEntry()))]
        XCTAssertEqual(StudyDataCategory.vocabulary.count(in: data), 1)
        XCTAssertEqual(StudyDataCategory.grammar.count(in: data), 1)
        XCTAssertEqual(StudyDataCategory.packs.count(in: data), 2)
        XCTAssertEqual(StudyDataCategory.questions.count(in: data), 1)
        XCTAssertEqual(StudyDataCategory.progress.count(in: data), 1)
        XCTAssertEqual(StudyDataCategory.answers.count(in: data), 1)
        XCTAssertEqual(StudyDataCategory.reading.count(in: data), 0)
    }
    func testLocalInspectionUsesPersistedSnapshotNotUnsavedChanges() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let files = LocalStudyFiles(root: root)
        var data = LocalStudyData()
        try files.save(data, userID: 1)
        data.state.progress["unsaved"] = ProgressEntry()
        let disk = try XCTUnwrap(files.load(userID: 1))
        XCTAssertEqual(StudyDataCategory.progress.count(in: data), 1)
        XCTAssertEqual(StudyDataCategory.progress.count(in: disk), 0)
    }
    func testAudioCountsOnlyNonemptyCurrentAccountFilesAndGroupsSharedAudio() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let files = LocalStudyFiles(root: root)
        let item = try JSONDecoder().decode(ListeningItem.self, from: Data(#"{"id":"a","title":"Audio","question":"Q","explanation":"E","questionTypeId":"listening-quick","choices":[],"answerIndex":-1,"audioAssetId":"shared","audioFileName":"a.mp3","audioSize":100,"createdAt":"2026-10-03"}"#.utf8))
        XCTAssertEqual(try files.downloadedAudioCount(userID: 1, items: [item]), 0)
        let url = files.audioURL(userID: 1, item: item)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data().write(to: url)
        XCTAssertEqual(try files.downloadedAudioCount(userID: 1, items: [item]), 0)
        try Data([1, 2, 3]).write(to: url)
        XCTAssertEqual(try files.downloadedAudioCount(userID: 1, items: [item, item]), 1)
        XCTAssertEqual(try files.downloadedAudioCount(userID: 2, items: [item]), 0)
    }
}

final class LocalFirstNavigationTests: XCTestCase {
    func testOpeningCurrentModuleKeepsItsDetailPath() {
        var navigation = WorkspaceNavigation()
        navigation.openModule(.reading)
        navigation.bank.append(.reading("question-1"))
        navigation.openModule(.reading)
        XCTAssertEqual(navigation.bank, [.module(.reading), .reading("question-1")])
        XCTAssertEqual(navigation.bankModule, .reading)
        navigation.openModule(.grammar)
        XCTAssertEqual(navigation.bank, [.module(.grammar)])
    }
    func testCardReviewPositionSurvivesDiskRestoreAndCloudRefresh() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let files = LocalStudyFiles(root: root)
        var review = ReviewSession(items: DemoData.items)
        review.index = 1
        review.revealed = true
        var snapshot = LocalStudyData()
        snapshot.memoryReview = review
        try files.save(snapshot, userID: 1)
        let restored = try XCTUnwrap(files.load(userID: 1)?.memoryReview)
        XCTAssertEqual(restored.id, review.id)
        XCTAssertEqual(restored.index, 1)
        XCTAssertTrue(restored.revealed)
        XCTAssertEqual(restored.items.map(\.id), review.items.map(\.id))
        XCTAssertNil(try files.load(userID: 2), "Review sessions belong to one account")
        let updated = LocalStudyData().preservingLocalWork(pending: [], responses: [:], syncedAt: .now, memoryReview: restored)
        XCTAssertEqual(updated.memoryReview?.id, review.id)
        XCTAssertEqual(updated.memoryReview?.index, 1)
        XCTAssertEqual(updated.memoryReview?.revealed, true)
    }
    @MainActor func testRestoredAccountResumesReviewBeforeAnyNetworkRefresh() async throws {
        var cached = LocalStudyData(items: DemoData.items, lastSync: .now)
        cached.memoryReview = ReviewSession(items: DemoData.items, index: 1, revealed: true)
        let store = AppStore(readSavedSession: { Session(user: Account(id: -903, username: "Review restore"), token: "test") }, readLocalData: { _ in cached })
        await store.restore()
        XCTAssertEqual(store.memoryReview?.id, cached.memoryReview?.id)
        XCTAssertEqual(store.memoryReview?.index, 1)
        XCTAssertEqual(store.memoryReview?.revealed, true)
        store.startDemo()
        XCTAssertNil(store.memoryReview, "Switching accounts must clear the previous account's presentation")
    }
    @MainActor func testCardRatingAdvancesTheSessionOnlyOnceAndExplicitExitClearsIt() async throws {
        let store = AppStore(); store.startDemo()
        try store.startMemoryReview(items: DemoData.items)
        let review = try XCTUnwrap(store.memoryReview)
        let first = try XCTUnwrap(review.items.first)
        try store.revealMemoryReview(id: review.id)
        try await store.rate(first, .hard, reviewSessionID: review.id)
        XCTAssertEqual(store.memoryReview?.index, 1)
        XCTAssertEqual(store.memoryReview?.revealed, false)
        do {
            try await store.rate(first, .hard, reviewSessionID: review.id)
            XCTFail("A repeated tap from the previous card cannot count twice")
        } catch { }
        XCTAssertEqual(store.memoryReview?.index, 1)
        XCTAssertEqual(store.state.progress[first.id]?.reviewCount, 1)
        try store.endMemoryReview(id: review.id)
        XCTAssertNil(store.memoryReview)
    }
    func testTabPathsStayIndependentAcrossBackgroundRefreshGate() {
        var navigation = WorkspaceNavigation()
        navigation.paths[.discovery] = [.discovery("share-1")]
        navigation.paths[.vocabulary] = [.item("word-1")]
        let before = navigation.paths
        var gate = ForegroundRefreshGate()
        XCTAssertFalse(gate.update(.background))
        XCTAssertTrue(gate.update(.active))
        XCTAssertEqual(navigation.paths, before)
        navigation.paths[.discovery] = []
        XCTAssertEqual(navigation.paths[.vocabulary], [.item("word-1")])
        // A new workspace deliberately restores no draft or detail path.
        XCTAssertTrue(WorkspaceNavigation().paths.isEmpty)
        XCTAssertNil(WorkspaceNavigation().bankModule)
    }

    func testTransientInactiveEventsDoNotRefreshButBackgroundReturnDoes() {
        var gate = ForegroundRefreshGate()
        XCTAssertFalse(gate.update(.active))
        XCTAssertFalse(gate.update(.inactive))
        XCTAssertFalse(gate.update(.active))
        XCTAssertFalse(gate.update(.background))
        XCTAssertFalse(gate.update(.inactive))
        XCTAssertTrue(gate.update(.active))
        XCTAssertFalse(gate.update(.active))
    }
    func testFreshCacheSkipsAutomaticRequestsAndFailuresAreThrottled() {
        let now = Date(timeIntervalSince1970: 1_791_000_000)
        XCTAssertFalse(AutomaticRefreshPolicy.shouldRefresh(lastSync: now, lastAttempt: nil, hasPending: false, now: now))
        XCTAssertTrue(AutomaticRefreshPolicy.shouldRefresh(lastSync: now.addingTimeInterval(-301), lastAttempt: nil, hasPending: false, now: now))
        XCTAssertTrue(AutomaticRefreshPolicy.shouldRefresh(lastSync: nil, lastAttempt: nil, hasPending: false, now: now))
        XCTAssertTrue(AutomaticRefreshPolicy.shouldRefresh(lastSync: now, lastAttempt: nil, hasPending: true, now: now))
        XCTAssertFalse(AutomaticRefreshPolicy.shouldRefresh(lastSync: nil, lastAttempt: now.addingTimeInterval(-10), hasPending: true, now: now))
        XCTAssertTrue(AutomaticRefreshPolicy.shouldRefresh(lastSync: nil, lastAttempt: now.addingTimeInterval(-61), hasPending: true, now: now))
    }
    func testOptimizedDateParsingPreservesTimeZonesAndFractionalSeconds() throws {
        let whole = try XCTUnwrap(StudyDates.parse("2026-10-03T00:00:00Z"))
        let fractional = try XCTUnwrap(StudyDates.parse("2026-10-03T00:00:00.250Z"))
        XCTAssertEqual(fractional.timeIntervalSince(whole), 0.25, accuracy: 0.001)
        XCTAssertEqual(StudyDates.parse("2026-10-03T09:00:00+09:00"), whole)
        XCTAssertNil(StudyDates.parse("invalid"))
    }
}

final class CompanionAssetTests: XCTestCase {
    func testAllTransparentMotionFramesAreBundledAndTimingsAreValid() throws {
        var names = Set<String>()
        for motion in CompanionMotion.allCases {
            XCTAssertFalse(motion.sequence.isEmpty)
            for step in motion.sequence {
                XCTAssertTrue((0..<6).contains(step.frame))
                XCTAssertGreaterThan(step.milliseconds, 0)
            }
            for frame in 0..<6 {
                let name = motion.asset(frame)
                XCTAssertTrue(names.insert(name).inserted)
                let image = try XCTUnwrap(UIImage(named: name), "Missing bundled motion frame: \(name)")
                let pixels = try XCTUnwrap(image.cgImage)
                XCTAssertEqual(pixels.width, 320)
                XCTAssertEqual(pixels.height, 320)
                XCTAssertTrue([CGImageAlphaInfo.premultipliedFirst, .premultipliedLast, .first, .last].contains(pixels.alphaInfo))
            }
        }
        XCTAssertEqual(names.count, 18)
    }


}

final class QuestionBankSyncTests: XCTestCase {
    @MainActor func testPracticeResolvesFrozenVersionAndBatchRetainsItsReference() throws {
        let store = AppStore()
        let question = NativeQuestion(canonicalQuestionId: "bank-Q", questionRevision: 1, id: "legacy-Q", itemId: "I1", kind: "grammar", title: "题", prompt: "当前题", choices: ["B", "A"], answer: "B")
        let old = BankCachedVersion(id: "bank-Q", revision: 1, schemaVersion: 1, payload: .object([
            "legacy": .object(["prompt": .string("冻结原题"), "taskConditions": .array([.string("平日18時以降")])]),
            "options": .array([.object(["id": .string("option-0"), "text": .string("A")]), .object(["id": .string("option-1"), "text": .string("B")])]),
            "answer": .object(["type": .string("option"), "optionId": .string("option-0")])
        ]))
        store.bankVersions = ["questionVersions": [old.versionKey: old]]
        let frozen = store.resolvedBankQuestion(question)
        XCTAssertEqual(frozen.id, question.id); XCTAssertEqual(frozen.prompt, "冻结原题")
        XCTAssertEqual(frozen.choices, ["A", "B"]); XCTAssertEqual(frozen.answer, "A")
        XCTAssertEqual(frozen.questionRevision, 1)
        XCTAssertEqual(frozen.taskConditions, ["平日18時以降"])
        let replay = AnswerInput(questionId: frozen.id, itemId: frozen.itemId, selected: "A", correct: true, progressEntry: ProgressEntry(), canonicalQuestionId: frozen.canonicalQuestionId, questionRevision: frozen.questionRevision, kind: frozen.kind)
        let decoded = try JSONDecoder().decode(AnswerInput.self, from: JSONEncoder().encode(replay))
        XCTAssertEqual(decoded.canonicalQuestionId, "bank-Q"); XCTAssertEqual(decoded.questionRevision, 1)
    }
    func testImmutableVersionsDecodePersistAndRemainAcrossLaterRevisions() throws {
        var data = LocalStudyData()
        let old = BankCachedVersion(id: "article:A/B", revision: 1, schemaVersion: 1, payload: .object(["text": .string("旧本文")]))
        let newer = BankCachedVersion(id: old.id, revision: 2, schemaVersion: 1, payload: .object(["text": .string("新本文")]))
        try data.applySync([.init(collection: "materialVersions", id: old.versionKey, value: try JSONDecoder().decode(SettingValue.self, from: JSONEncoder().encode(old)))])
        try data.applySync([.init(collection: "materialVersions", id: newer.versionKey, value: try JSONDecoder().decode(SettingValue.self, from: JSONEncoder().encode(newer)))])
        let copy = try JSONDecoder().decode(LocalStudyData.self, from: JSONEncoder().encode(data))
        XCTAssertEqual(copy.bankVersion(collection: "materialVersions", ref: .init(id:old.id,revision:1)), old)
        XCTAssertEqual(copy.bankVersion(collection: "materialVersions", ref: .init(id:old.id,revision:2)), newer)
        XCTAssertEqual(old.versionKey, #"["article:A/B",1]"#)
        var legacy = try JSONDecoder().decode(LocalStudyData.self, from: Data(#"{"items":[],"state":{"progress":{},"answers":{}},"plan":{"tasks":[],"dailySummaries":[]},"reading":[],"captures":[],"packs":[],"drafts":[],"listening":[],"shares":[],"pending":[],"hasPracticeCache":false,"hasListeningCache":false}"#.utf8))
        XCTAssertNil(legacy.bankVersions)
        try legacy.applySync([.init(collection:"materialVersions",id:old.versionKey,deleted:true)])
    }
    func testWrongVersionKeyCannotBeAcknowledgedAsCached() throws {
        var data=LocalStudyData()
        let value=BankCachedVersion(id:"Q1",revision:1,schemaVersion:1,payload:.object([:]))
        let json=try JSONDecoder().decode(SettingValue.self,from:JSONEncoder().encode(value))
        XCTAssertThrowsError(try data.applySync([.init(collection:"questionVersions",id:#"["Q1",2]"#,value:json)]))
        XCTAssertNil(data.bankVersions)
    }
}

final class FrozenAttemptCompatibilityTests: XCTestCase {
    func testOriginalSnapshotAndMaterialReferenceSurviveOfflineRoundTrip() throws {
        let question = NativeQuestion(canonicalQuestionId:"bank-old",questionRevision:1,materialRefs:[.init(id:"audio:AU-old",revision:2)],id:"Q-old",itemId:"I-old",kind:"grammar",title:"原题",prompt:"原始题干",choices:["A","B"],answer:"B")
        let attempt = NativeAttempt(id:"AT-old",startedAt:"2026-10-07",view:"mixed",deck:"all",questionIds:[question.id],questionManifest:[.init(instanceId:question.id,status:"frozen",questionRef:.init(id:"bank-old",revision:1),snapshot:question)],answers:[])
        let decoded = try JSONDecoder().decode(NativeAttempt.self,from:JSONEncoder().encode(attempt))
        XCTAssertEqual(decoded,attempt)
        XCTAssertEqual(decoded.questionManifest?.first?.snapshot?.answer,"B")
        XCTAssertEqual(decoded.questionManifest?.first?.snapshot?.materialRefs?.first?.id,"audio:AU-old")
        let legacy = try JSONDecoder().decode(NativeAttempt.self,from:Data(#"{"id":"old","startedAt":"2026-10-01","view":"mixed","deck":"all","questionIds":["q"],"answers":[]}"#.utf8))
        XCTAssertNil(legacy.questionManifest)
    }
}

final class HistoricalListeningDraftTests: XCTestCase {
    func testDeletedLSSnapshotCanResumeOnlyForItsOwner() throws {
        let name = "jlpt-historical-listening-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName:name)); defer { defaults.removePersistentDomain(forName:name) }
        let item = try JSONDecoder().decode(ListeningItem.self,from:Data(#"{"id":"LS-old","title":"Old","question":"原始问题","explanation":"旧解析","questionTypeId":"listening-task","choices":["A","B","C","D"],"answerIndex":2,"audioAssetId":"AU-old","audioFileName":"old.mp3","audioSize":20,"createdAt":"2026-10-01","materialRefs":[{"id":"audio:AU-old","revision":1}]}"#.utf8))
        let draft = ListeningDraft(questionSnapshots:[item],questionIDs:[item.id],currentQuestion:0,selected:[item.id:2],written:[:],audioTime:7,sessionID:"session-old")
        defaults.set(try JSONEncoder().encode(draft),forKey:"listening-draft-v1:1:AU-old")
        XCTAssertTrue(ListeningGroup.restorable([],owner:"2",defaults:defaults).isEmpty)
        let group = try XCTUnwrap(ListeningGroup.restorable([],owner:"1",defaults:defaults).first)
        XCTAssertEqual(group.questions.first?.question,"原始问题"); XCTAssertEqual(group.questions.first?.answerIndex,2)
        XCTAssertEqual(group.questions.first?.materialRefs?.first?.revision,1)
    }
}

final class DedicatedAttemptTests: XCTestCase {
    @MainActor func testReadingFreezesBeforeAnswerAndUsesUnifiedObjectiveHistory() async throws {
        let store=AppStore();store.startDemo()
        let source=ReadingQuestion(id:"RD-new",title:"阅读",passage:"原始文章",question:"首次呈现的问题",choices:["A","B","C","D"],answerIndex:1,explanation:"原始解析")
        let first=DedicatedAttempts.reading(source,sessionID:"reading-new",now:Date(timeIntervalSince1970:100))
        try store.presentDedicatedAttempt(first)
        XCTAssertTrue(store.state.attemptHistory?.first { $0.id==first.id }?.answers.isEmpty == true)
        XCTAssertEqual(first.questionManifest?.first?.snapshot?.context,"原始文章")
        try await store.answer(source,selection:1,sessionID:"reading-new")
        let completed=try XCTUnwrap(store.state.attemptHistory?.first { $0.id==first.id })
        XCTAssertEqual(completed.startedAt,first.startedAt);XCTAssertEqual(completed.answers.first?.questionId,"RD-new");XCTAssertEqual(completed.answers.first?.selected,"B")
        XCTAssertEqual(completed.correctCount,1);XCTAssertEqual(store.responses["RD-new"]?.correct,true)
    }
    func testListeningScoredAndFreeResponsesHaveSeparateStatisticsAndRetainLegacyData() throws {
        func item(_ id:String,free:Bool) throws -> ListeningItem {
            try JSONDecoder().decode(ListeningItem.self,from:Data("{\"id\":\"\(id)\",\"title\":\"音频\",\"question\":\"问题\",\"explanation\":\"解析\",\"questionTypeId\":\"listening-basic-training\",\"choices\":\(free ? "[]" : "[\"A\",\"B\",\"C\",\"D\"]"),\"answerIndex\":\(free ? -1 : 1),\"audioAssetId\":\"AU-old\",\"audioFileName\":\"old.mp3\",\"audioSize\":100,\"createdAt\":\"2026-10-01\"}".utf8))
        }
        let group=ListeningGroup(id:"AU-old",questions:[try item("scored",free:false),try item("free",free:true)])
        let start=DedicatedAttempts.listening(group,sessionID:"s")
        XCTAssertTrue(start.answers.isEmpty);XCTAssertNil(start.completedAt);XCTAssertEqual(start.questionManifest?.count,2)
        let complete=DedicatedAttempts.listening(group,sessionID:"s",selected:["scored":1],written:["free":"私の回答"],submitted:true)
        var old=LocalStudyData();old.state.progress["listening-audio:AU-old"]=ProgressEntry(correct:17,wrong:9,status:"review")
        old.responses=["legacy":.init(title:"旧题",selected:"旧回答",correct:false,answeredAt:"2026-10-01",sessionID:nil)]
        let next=try old.recordingNativeBatch(questions:complete.questionManifest!.compactMap(\.snapshot),attempt:complete,allowUnanswered:true)
        XCTAssertEqual(complete.total,1);XCTAssertEqual(complete.correctCount,1);XCTAssertEqual(complete.unscoredResponses?.count,1)
        XCTAssertEqual(next.responses?["free"]?.selected,"私の回答");XCTAssertNil(next.responses?["free"]?.correct);XCTAssertNotNil(next.responses?["legacy"])
        XCTAssertEqual(next.state.progress["listening-audio:AU-old"]?.correct,17);XCTAssertEqual(next.pending.count,1);XCTAssertEqual(next.pending[0].input.questionId,"scored")
        XCTAssertEqual(try next.recordingNativeBatch(questions:complete.questionManifest!.compactMap(\.snapshot),attempt:complete,allowUnanswered:true).pending.count,1)
        let decoded=try JSONDecoder().decode(NativeAttempt.self,from:JSONEncoder().encode(complete));XCTAssertEqual(decoded,complete)
        let freeGroup=ListeningGroup(id:"AU-free",questions:[try item("free-only",free:true)])
        let freeAttempt=DedicatedAttempts.listening(freeGroup,sessionID:"free-s",written:["free-only":"自由回答"],submitted:true)
        let freeSaved=try old.recordingNativeBatch(questions:freeAttempt.questionManifest!.compactMap(\.snapshot),attempt:freeAttempt,allowUnanswered:true)
        XCTAssertEqual(freeAttempt.total,0);XCTAssertEqual(freeSaved.pending.count,1);XCTAssertEqual(freeSaved.pending[0].historyOnly,true)
        XCTAssertTrue(freeAttempt.answers.isEmpty)

    }
}

final class NativeVisualFixtureContractTests:XCTestCase {
    func testFixturesDeclareRealNativeCapabilitiesAndValidContent() throws {
        let data=try NativeVisualFixtures.load()
        XCTAssertEqual(data.fixtures.count,23);XCTAssertEqual(Set(data.fixtures.map(\.id)).count,23)
        XCTAssertEqual(data.fixtures.filter { $0.surface != "unsupported" }.count,23)
        XCTAssertTrue(data.fixtures.allSatisfy { $0.bankPayload != nil })
        for fixture in data.fixtures {
            if fixture.surface=="quiz" { let q=try fixture.decoded(NativeQuestion.self);XCTAssertTrue(q.isUsable);XCTAssertEqual(q.questionTypeId,fixture.id);XCTAssertGreaterThan(q.correctReason?.count ?? 0,200) }
            if fixture.surface=="reading" { let q=try fixture.decoded(ReadingQuestion.self);XCTAssertEqual(q.questionTypeId,fixture.id);XCTAssertTrue(q.choices.indices.contains(q.answerIndex));if fixture.id=="reading-long" { XCTAssertGreaterThan(q.passage.count,500) } }
            if fixture.surface=="listening" { let q=try fixture.decoded(ListeningItem.self);XCTAssertEqual(q.questionTypeId,fixture.id);XCTAssertEqual(q.freeResponse,fixture.id=="listening-basic-training");if fixture.id=="listening-quick" { XCTAssertEqual(q.choices.count,3) } }
        }
    }
    func testLocalJapaneseAudioResourcesArePlayable() throws {
        for name in ["native-visual-narrative","native-visual-quick","native-visual-expression"] {
            let url=try XCTUnwrap(Bundle.main.url(forResource:name,withExtension:"wav"))
            let bytes=try Data(contentsOf:url);XCTAssertEqual(String(data:bytes.prefix(4),encoding:.utf8),"RIFF")
            let player=try AVAudioPlayer(data:bytes);XCTAssertGreaterThan(player.duration,1)
        }
    }
}

final class TypedQuestionPresentationTests: XCTestCase {
    private func fixture(_ id: String) throws -> (NativeVisualFixtures.Entry, NativeQuestionPresentation) {
        let entry = try XCTUnwrap(NativeVisualFixtures.load().fixtures.first { $0.id == id })
        let value = try XCTUnwrap(entry.bankPayload)
        let payload = try JSONDecoder().decode(NativeQuestionPayload.self, from: JSONEncoder().encode(value))
        return (entry, .init(payload: payload, materials: entry.materialVersions ?? []))
    }
    func testEveryRegistryTypeDecodesCanonicalSchemaAndFiveStructuralTypesHaveMaterials() throws {
        let ids = try NativeVisualFixtures.load().fixtures.map(\.id)
        XCTAssertEqual(Set(ids), NativeQuestionPayload.types)
        for id in ids { let (_, p) = try fixture(id); XCTAssertTrue(p.payload.valid, id); XCTAssertFalse(p.missingMaterial, id) }
        let (_, integrated) = try fixture("reading-integrated")
        XCTAssertEqual(integrated.materials.count, 2)
        let (_, info) = try fixture("reading-information")
        XCTAssertEqual(info.payload.legacy.taskConditions?.count, 3)
        XCTAssertEqual(info.materials.compactMap { info.material(.init(id: $0.id, revision: $0.revision)) }.first?.rows?.count, 4)
    }
    func testAssemblyRequiresEveryFragmentOnceAndReturnsStarOptionWithoutChangingLegacyAnswer() throws {
        let (_, p) = try fixture("grammar-composition")
        XCTAssertNil(p.payload.selectedOption(order: ["option-0"]))
        XCTAssertNil(p.payload.selectedOption(order: ["option-0","option-0","option-2","option-3"]))
        XCTAssertEqual(p.payload.selectedOption(order: ["option-0","option-1","option-2","option-3"]), 2)
        XCTAssertEqual(p.payload.options?[2].text, "会った")
        XCTAssertEqual(p.payload.selectedOption(order: ["option-0","option-2","option-1","option-3"]), 1)
    }
    @MainActor func testFrozenPresentationAndMaterialSnapshotsSurviveSourceEditsAndAttemptRoundTrip() throws {
        let (entry, p) = try fixture("reading-integrated")
        let source = try entry.decoded(ReadingQuestion.self)
        let store = AppStore(); store.startDemo()
        let ref = BankVersionReference(id: try XCTUnwrap(source.canonicalQuestionId), revision: 1)
        store.bankVersions = ["questionVersions": [ref.versionKey: .init(id: ref.id, revision: 1, schemaVersion: 1, payload: try XCTUnwrap(entry.bankPayload))], "materialVersions": Dictionary(p.materials.map { ($0.versionKey, $0) }, uniquingKeysWith: { first, _ in first })]
        let frozen = store.resolvedReadingQuestion(source)
        store.bankVersions = nil
        XCTAssertEqual(store.resolvedReadingQuestion(frozen).presentation, p)
        let attempt = DedicatedAttempts.reading(frozen, sessionID: "typed", selection: 0)
        let roundTrip = try JSONDecoder().decode(NativeAttempt.self, from: JSONEncoder().encode(attempt))
        XCTAssertEqual(roundTrip.questionManifest?.first?.snapshot?.presentation, p)
        XCTAssertEqual(roundTrip.answers.first?.selected, "本を借りること")
        XCTAssertTrue(roundTrip.answers.first?.correct == true)
    }
    func testMultiBlankSharesOneArticleAndKeepsIndependentCanonicalQuestionIDs() throws {
        let (entry, first) = try fixture("grammar-text")
        let secondRecord = try XCTUnwrap(entry.questionVersions?.first)
        let second = try JSONDecoder().decode(NativeQuestionPayload.self, from: JSONEncoder().encode(secondRecord.payload))
        XCTAssertEqual(first.payload.materialRefs, second.materialRefs)
        XCTAssertEqual(first.payload.legacy.blankId, "【1】")
        XCTAssertEqual(second.legacy.blankId, "【2】")
        XCTAssertNotEqual(entry.relatedQuestions?.first?.canonicalQuestionId, "visual-bank-grammar-text")
        XCTAssertEqual(second.answerIndex, 0)
    }
    func testImageOptionsResolveOwnedFrozenImageBytesAndMissingMaterialBlocksSubmission() throws {
        let (_, p) = try fixture("listening-expression")
        XCTAssertEqual(p.payload.legacy.optionMaterials?.count, 3)
        for binding in p.payload.legacy.optionMaterials ?? [] {
            let image = try XCTUnwrap(p.material(binding.materialRef)); let url = try XCTUnwrap(image.url)
            let data = try XCTUnwrap(Data(base64Encoded: String(url.split(separator: ",", maxSplits: 1)[1])))
            XCTAssertNotNil(UIImage(data: data)); XCTAssertFalse((image.alt ?? "").isEmpty)
        }
        var missing = p; missing.materials.removeLast(); XCTAssertTrue(missing.missingMaterial)
    }
    func testAudioPolicyAndPermissionDoNotRevealBeforePlaybackOrUnauthorizedReview() throws {
        let (_, p) = try fixture("listening-outline")
        XCTAssertFalse(p.payload.visibleAfterAudio(false, question: true))
        XCTAssertFalse(p.payload.visibleAfterAudio(false, question: false))
        XCTAssertTrue(p.payload.visibleAfterAudio(true, question: true))
        XCTAssertFalse(NativeQuestionPresentation.revealAllowed(requested: true, permitted: false))
        XCTAssertTrue(NativeQuestionPresentation.revealAllowed(requested: true, permitted: true))
    }
    func testTargetSpanMarksSecondOccurrenceWithUTF16OffsetsAndPreservesRedTokenStyle() throws {
        let (_, p) = try fixture("vocabulary-kanji-reading")
        let span = try XCTUnwrap(p.payload.legacy.targetSpan); let range = try XCTUnwrap(span.range(in: p.payload.prompt))
        XCTAssertGreaterThan(range.location, 0)
        let tokens = [JapaneseAnnotation.Token(surface: p.payload.prompt, pos: "noun")]
        var display = JapaneseDisplay(); display.segmented = true; display.styles["noun"] = .init(mode: "text", color: "#FF0000")
        let value = JapaneseAttributed.make(tokens: tokens, display: display, ruby: false, font: .systemFont(ofSize: 18), color: .black, targetRange: range)
        XCTAssertNil(value.attribute(.underlineStyle, at: 0, effectiveRange: nil))
        XCTAssertNotNil(value.attribute(.underlineStyle, at: range.location, effectiveRange: nil))
        XCTAssertEqual(value.attribute(.foregroundColor, at: range.location, effectiveRange: nil) as? UIColor, UIColor.red)
        XCTAssertNil(NativeTargetSpan(start: 1, end: 2, text: "x").range(in: "😀x"))
    }
}


/// The v3 adapter, fed with real output of the v3 server (generated by the Node repositories).
final class V3BridgeTests: XCTestCase {
    static let records = #"""
[{"collection": "settings", "code": null, "value": {"uiLanguage": "zh-CN", "explanationLanguage": "zh-Hans", "fontScale": 1, "feedbackMode": "immediate", "practiceNavigation": "auto", "autoAdvanceSeconds": 0.5, "showReviewRuby": true, "showExplanationRuby": true, "showRomaji": true, "cardWordSpacing": true, "segmentedDisplay": false, "dailySource": {"answers": true, "cardReviews": true, "window": null, "hours": null, "timeZone": null, "runAt": null, "ratings": []}, "questionKinds": [], "posStyles": {}, "questionTypeTips": {}, "customTips": [], "speech": {"provider": "browser", "rate": 1, "cardAuto": "off", "grammarAuto": false, "includeExample": false, "voices": {}}, "cardTemplates": {"word": "word_standard", "grammar": "grammar_standard", "name": "name_standard"}}}, {"collection": "wordbooks", "code": null, "value": [{"code": "WB1", "title": "词汇", "createdAt": "2026-10-10T00:48:32.121Z", "updatedAt": "2026-10-10T00:48:32.121Z", "stats": {"total": 1, "words": 1, "grammar": 0, "names": 0, "due": 0, "new": 0, "mastered": 0}}]}, {"collection": "plan", "code": null, "value": {"status": "ready", "generatedAt": "2026-10-10T00:48:32.205Z", "updatedAt": "2026-10-10T00:48:32.205Z", "language": "zh-Hans", "profile": {"examName": "JLPT", "level": "N2", "startDate": null, "examDate": "2026-12-06", "studyDaysPerWeek": null, "dailyMinutes": 30, "materialStartStatus": null, "fixedSchedule": null, "supplementalNeeds": null, "materials": []}, "strategy": {"phaseStrategy": null, "postMaterialStrategy": null, "goal": null}, "phases": [], "tasks": [{"code": "TK1", "date": "2026-10-10", "module": "vocabulary", "minutes": 20, "material": null, "status": "pending", "completedAt": null, "title": {"text": "単語", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "detail": null, "sourceLabel": null}]}}, {"collection": "inbox", "code": null, "value": [{"code": "IN1", "body": "面目躍如", "category": "word", "context": null, "wordbook": "WB1", "status": "inbox", "createdAt": "2026-10-10T00:48:32.200Z", "updatedAt": "2026-10-10T00:48:32.200Z"}]}, {"collection": "drafts", "code": null, "value": [{"code": "DR1", "status": "draft", "kind": null, "date": null, "questionCount": 1, "commentCount": 0, "title": {"text": "复习包", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "createdAt": "2026-10-10T00:48:32.208Z", "updatedAt": "2026-10-10T00:48:32.208Z"}]}, {"collection": "attempts", "code": null, "value": [{"code": "AT1", "kind": "mixed", "practice": null, "active": false, "startedAt": "2026-10-10T00:48:32.186Z", "completedAt": "2026-10-10T00:48:32.192Z", "title": null, "summary": {"total": 1, "answered": 1, "scored": 1, "correct": 1, "elapsedMs": 0}}]}, {"collection": "ratings", "code": null, "value": [{"eventId": "r1", "code": "W1", "rating": "hard", "reviewedAt": "2026-10-10T00:48:32.195Z", "source": "mcp"}]}, {"collection": "knowledge", "code": "W1", "value": {"code": "W1", "kind": "word", "wordbook": "WB1", "language": "zh-Hans", "expression": "捉える", "reading": "とらえる", "romaji": "toraeru", "pos": "verb_2", "transitivity": null, "isSuruNoun": false, "baseForm": null, "jlptLevel": {"min": "N2", "max": "N2"}, "register": null, "paraphrase": null, "meaning": {"text": "抓住", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "meaningJa": "しっかりつかむ。", "explanation": {"text": "解释", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "examples": [{"sentence": "要点を捉える。", "reading": null, "spokenSentence": null, "targetReading": null, "translation": {"text": "抓住要点。", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "spokenTranslation": null, "analysis": null, "formAnalysis": null}], "memoryPoints": [{"text": "抽象", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}], "patterns": [{"pattern": "～を捉える", "example": null, "connection": null, "meaning": {"text": "抓住", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "exampleTranslation": null}], "notes": [{"kind": "exam_tip", "title": null, "body": {"text": "tip", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}], "comparisons": [{"target": "捕らえる", "kind": "synonym", "difference": {"text": "具体", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}], "alternateForms": [], "relatedWords": [], "sources": [], "tags": ["动词"], "questionKinds": [], "distractors": {}, "memoryImage": null, "conjugations": [{"form": "dictionary", "label": "辞書形", "written": "捉える", "reading": "とらえる", "exception": false, "step": {"text": "去掉词尾「る」，接「る」", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}, {"form": "polite", "label": "ます形", "written": "捉えます", "reading": "とらえます", "exception": false, "step": {"text": "去掉词尾「る」，接「ます」", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}, {"form": "negative", "label": "ない形", "written": "捉えない", "reading": "とらえない", "exception": false, "step": {"text": "去掉词尾「る」，接「ない」", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}, {"form": "past", "label": "た形", "written": "捉えた", "reading": "とらえた", "exception": false, "step": {"text": "去掉词尾「る」，接「た」", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}, {"form": "te", "label": "て形", "written": "捉えて", "reading": "とらえて", "exception": false, "step": {"text": "去掉词尾「る」，接「て」", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}, {"form": "potential", "label": "可能形", "written": "捉えられる", "reading": "とらえられる", "exception": false, "step": {"text": "去掉词尾「る」，接「られる」", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}, {"form": "passive", "label": "受身形", "written": "捉えられる", "reading": "とらえられる", "exception": false, "step": {"text": "去掉词尾「る」，接「られる」", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}, {"form": "causative", "label": "使役形", "written": "捉えさせる", "reading": "とらえさせる", "exception": false, "step": {"text": "去掉词尾「る」，接「させる」", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}, {"form": "causative_passive", "label": "使役受身形", "written": "捉えさせられる", "reading": "とらえさせられる", "exception": false, "step": {"text": "去掉词尾「る」，接「させられる」", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}, {"form": "volitional", "label": "意向形", "written": "捉えよう", "reading": "とらえよう", "exception": false, "step": {"text": "去掉词尾「る」，接「よう」", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}, {"form": "conditional_ba", "label": "条件形（ば）", "written": "捉えれば", "reading": "とらえれば", "exception": false, "step": {"text": "去掉词尾「る」，接「れば」", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}, {"form": "conditional_tara", "label": "たら形", "written": "捉えたら", "reading": "とらえたら", "exception": false, "step": {"text": "去掉词尾「る」，接「たら」", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}, {"form": "imperative", "label": "命令形", "written": "捉えろ", "reading": "とらえろ", "exception": false, "step": {"text": "去掉词尾「る」，接「ろ」", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}, {"form": "prohibitive", "label": "禁止形", "written": "捉えるな", "reading": "とらえるな", "exception": false, "step": {"text": "去掉词尾「る」，接「るな」", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}], "questions": [{"code": "QV1", "typeId": "vocabulary-kanji-reading", "status": "ready", "relation": "target"}], "sourceSentence": "要点を捉えて話す。", "compileNote": null, "review": {"status": "review", "reviewCount": 2, "ease": 2.6, "intervalDays": 1, "dueAt": "2026-10-11T00:48:32.195Z", "firstSeenAt": "2026-10-10T00:48:32.189Z", "lastReviewedAt": "2026-10-10T00:48:32.195Z"}, "capturedAt": "2026-10-10T00:48:32.127Z", "createdAt": "2026-10-10T00:48:32.127Z", "updatedAt": "2026-10-10T00:48:32.127Z"}}, {"collection": "questionGroups", "code": "QS1", "value": {"code": "QS1", "typeId": "vocabulary-kanji-reading", "module": "vocabulary", "status": "ready", "level": "N2", "official": false, "shuffleOptions": true, "instruction": "読み方", "instructionTranslation": null, "context": null, "contextTranslation": null, "sourceReference": null, "language": "zh-Hans", "materials": [], "questions": [{"code": "QV1", "position": 0, "prompt": "彼は問題の本質を的確に捉えている。", "promptMediaId": null, "expectedText": null, "translation": {"text": "t", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "marks": [{"kind": "target", "start": 11, "end": 14, "label": null, "material": null}], "options": [{"id": 1, "position": 0, "text": "とらえて", "mediaId": null, "correct": true, "distractorType": null, "analysis": {"text": "a", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "translation": null}, {"id": 2, "position": 1, "text": "おさえて", "mediaId": null, "correct": false, "distractorType": "x", "analysis": {"text": "b", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "translation": null}, {"id": 3, "position": 2, "text": "かかえて", "mediaId": null, "correct": false, "distractorType": "x", "analysis": {"text": "c", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "translation": null}, {"id": 4, "position": 3, "text": "つかまえて", "mediaId": null, "correct": false, "distractorType": "x", "analysis": {"text": "d", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "translation": null}], "explanation": [{"kind": "basis", "title": null, "body": {"text": "basis", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}], "evidence": [], "tags": [], "knowledge": [{"code": "W1", "relation": "target", "expression": "捉える"}]}], "review": {"latest": {"reviewer": "ai", "verdict": "pass", "agentLabel": null, "summary": {"text": "ok", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "createdAt": "2026-10-10T00:48:32.158Z"}, "openFindings": []}, "createdAt": "2026-10-10T00:48:32.153Z", "updatedAt": "2026-10-10T00:48:32.158Z"}}, {"collection": "questionGroups", "code": "QS2", "value": {"code": "QS2", "typeId": "reading-short", "module": "reading", "status": "ready", "level": "N2", "official": false, "shuffleOptions": true, "instruction": null, "instructionTranslation": null, "context": null, "contextTranslation": null, "sourceReference": null, "language": "zh-Hans", "materials": [{"role": "main", "material": "MT1", "kind": "passage", "body": "素材が変わった。だから味も変わった。", "transcript": null, "mediaId": null, "mediaUrl": null, "clipStartMs": null, "clipEndMs": null, "title": null, "bodyTranslation": {"text": "食材变了。", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "summary": null, "structure": null, "transcriptTranslation": null, "sentences": [], "createdAt": "2026-10-10T00:48:32.173Z", "updatedAt": "2026-10-10T00:48:32.173Z"}], "questions": [{"code": "QR1", "position": 0, "prompt": "何が変わったか。", "promptMediaId": null, "expectedText": null, "translation": null, "marks": [], "options": [{"id": 5, "position": 0, "text": "素材", "mediaId": null, "correct": true, "distractorType": null, "analysis": {"text": "a", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "translation": null}, {"id": 6, "position": 1, "text": "場所", "mediaId": null, "correct": false, "distractorType": "x", "analysis": {"text": "b", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "translation": null}, {"id": 7, "position": 2, "text": "人", "mediaId": null, "correct": false, "distractorType": "x", "analysis": {"text": "c", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "translation": null}, {"id": 8, "position": 3, "text": "時間", "mediaId": null, "correct": false, "distractorType": "x", "analysis": {"text": "d", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "translation": null}], "explanation": [{"kind": "basis", "title": null, "body": {"text": "basis", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}], "evidence": [{"option": null, "material": "main", "source": "body", "start": null, "end": null, "quote": "素材が変わった。"}], "tags": [], "knowledge": []}], "review": {"latest": {"reviewer": "ai", "verdict": "pass", "agentLabel": null, "summary": {"text": "ok", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "createdAt": "2026-10-10T00:48:32.183Z"}, "openFindings": []}, "createdAt": "2026-10-10T00:48:32.172Z", "updatedAt": "2026-10-10T00:48:32.183Z"}}, {"collection": "questionGroups", "code": "QS3", "value": {"code": "QS3", "typeId": "listening-points", "module": "listening", "status": "ready", "level": "N2", "official": false, "shuffleOptions": true, "instruction": null, "instructionTranslation": null, "context": null, "contextTranslation": null, "sourceReference": null, "language": "zh-Hans", "materials": [{"role": "audio", "material": "MT2", "kind": "audio", "body": null, "transcript": "男：明日は雨です。", "mediaId": 1, "mediaUrl": "/api/v3/media/1", "clipStartMs": null, "clipEndMs": null, "title": null, "bodyTranslation": null, "summary": null, "structure": null, "transcriptTranslation": null, "sentences": [], "createdAt": "2026-10-10T00:48:32.179Z", "updatedAt": "2026-10-10T00:48:32.179Z"}], "questions": [{"code": "QL1", "position": 0, "prompt": "天気は？", "promptMediaId": null, "expectedText": null, "translation": null, "marks": [], "options": [{"id": 9, "position": 0, "text": "雨", "mediaId": null, "correct": true, "distractorType": null, "analysis": {"text": "a", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "translation": null}, {"id": 10, "position": 1, "text": "晴れ", "mediaId": null, "correct": false, "distractorType": "x", "analysis": {"text": "b", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "translation": null}, {"id": 11, "position": 2, "text": "雪", "mediaId": null, "correct": false, "distractorType": "x", "analysis": {"text": "c", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "translation": null}, {"id": 12, "position": 3, "text": "曇り", "mediaId": null, "correct": false, "distractorType": "x", "analysis": {"text": "d", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "translation": null}], "explanation": [{"kind": "basis", "title": null, "body": {"text": "basis", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}}], "evidence": [], "tags": [], "knowledge": []}], "review": {"latest": {"reviewer": "ai", "verdict": "pass", "agentLabel": null, "summary": {"text": "ok", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "createdAt": "2026-10-10T00:48:32.184Z"}, "openFindings": []}, "createdAt": "2026-10-10T00:48:32.179Z", "updatedAt": "2026-10-10T00:48:32.184Z"}}, {"collection": "practiceSets", "code": "DP1", "value": {"code": "DP1", "kind": "daily", "date": "2026-10-10", "version": 1, "minutes": null, "strategy": null, "level": null, "title": {"text": "今日の練習", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "description": null, "disclaimer": null, "sourceSummary": null, "sections": [{"position": 0, "instruction": null, "scheduledDate": null, "durationMinutes": null, "title": {"text": "語彙", "language": "zh-Hans", "isFallback": false, "origin": "manual", "verified": true}, "description": null, "entries": [{"position": 0, "question": "QV1", "group": "QS1", "typeId": "vocabulary-kanji-reading", "groupStatus": "ready"}]}], "entries": [], "attempts": [], "createdAt": "2026-10-10T00:48:32.197Z", "updatedAt": "2026-10-10T00:48:32.197Z"}}]
"""#
    static let share = #"""
{"list": [{"id": "764951d0-c83b-48bf-a699-f11f8f571f43", "kind": "practice", "title": "共有練習", "description": "説明", "knowledgeCount": 1, "groupCount": 1, "questionCount": 1, "mine": true, "withdrawn": false, "createdAt": "2026-10-10T00:48:32.221Z"}], "detail": {"id": "764951d0-c83b-48bf-a699-f11f8f571f43", "kind": "practice", "title": "共有練習", "description": "説明", "knowledgeCount": 1, "groupCount": 1, "questionCount": 1, "mine": false, "withdrawn": false, "createdAt": "2026-10-10T00:48:32.221Z", "revisions": [{"revision": 1, "createdAt": "2026-10-10T00:48:32.221Z"}], "package": {"format": "jlpt-share", "version": 2, "kind": "practice", "title": "共有練習", "description": "説明", "language": "zh-Hans", "knowledge": [{"kind": "word", "expression": "捉える", "reading": "とらえる", "pos": "verb_2", "jlptLevel": {"min": "N2", "max": "N2"}, "meaning": "抓住", "meaningJa": "しっかりつかむ。", "explanation": "解释", "examples": [{"sentence": "要点を捉える。", "translation": "抓住要点。"}], "memoryPoints": ["抽象"], "patterns": [{"pattern": "～を捉える", "meaning": "抓住"}], "notes": [{"kind": "exam_tip", "body": "tip"}], "comparisons": [{"target": "捕らえる", "kind": "synonym", "difference": "具体"}], "alternateForms": [], "relatedWords": [], "tags": ["动词"], "sources": []}], "groups": [{"typeId": "vocabulary-kanji-reading", "level": "N2", "official": false, "shuffleOptions": true, "instruction": "読み方", "materials": [], "questions": [{"prompt": "彼は問題の本質を的確に捉えている。", "translation": "t", "marks": [{"kind": "target", "start": 11, "end": 14, "label": null, "material": null}], "options": [{"text": "とらえて", "correct": true, "analysis": "a"}, {"text": "おさえて", "correct": false, "distractorType": "x", "analysis": "b"}, {"text": "かかえて", "correct": false, "distractorType": "x", "analysis": "c"}, {"text": "つかまえて", "correct": false, "distractorType": "x", "analysis": "d"}], "explanation": [{"kind": "basis", "body": "basis"}], "evidence": [], "tags": [], "knowledge": [{"index": 0, "relation": "target"}]}]}], "media": []}}}
"""#
    private func snapshot() throws -> LocalStudyData {
        let records = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(Self.records.utf8)) as? [[String: Any]])
        return try V3Bridge.snapshot(records)
    }

    func testSyncRecordsBecomeTheCachedModels() throws {
        let data = try snapshot()
        let item = try XCTUnwrap(data.items.first)
        XCTAssertEqual(item.id, "W1")
        XCTAssertEqual(item.deck, "n1_vocab")
        XCTAssertEqual(item.original, "捉える")
        XCTAssertEqual(item.reading, "とらえる")
        XCTAssertEqual(item.meaning_zh, "抓住")
        XCTAssertEqual(item.jlpt_level, "N2")
        XCTAssertEqual(item.examples?.first?.ja, "要点を捉える。")
        XCTAssertEqual(item.examples?.first?.zh, "抓住要点。")
        XCTAssertEqual(item.core_memory, ["抽象"])
        XCTAssertEqual(item.wordbook_id, "WB1")
        XCTAssertTrue(item.conjugations?.contains { $0.form == "捉えます" } == true)
        XCTAssertEqual(item.localized?.meaning?.text, "抓住")
        XCTAssertEqual(data.state.progress["W1"]?.reviewCount, 2, "the practice answer and the hard rating both scheduled the card")
        XCTAssertEqual(data.wordbooks?.map(\.id), ["WB1"])
        XCTAssertEqual(data.captures.map(\.body), ["面目躍如"])
        XCTAssertEqual(data.drafts.map(\.id), ["DR1"])
        XCTAssertEqual(data.plan.profile?.examDate, "2026-12-06")
        XCTAssertEqual(data.plan.tasks.map(\.id), ["TK1"])
        XCTAssertEqual(data.state.cardReviews?.map(\.itemId), ["W1"])
        XCTAssertEqual(data.state.attemptHistory?.first?.correctCount, 1)
    }

    func testQuestionGroupsBecomePracticeReadingAndListening() throws {
        let data = try snapshot()
        let question = try XCTUnwrap(data.bank?.first)
        XCTAssertEqual(question.id, "QV1")
        XCTAssertEqual(question.itemId, "W1")
        XCTAssertEqual(question.kind, "kanji_to_kana")
        XCTAssertEqual(question.answer, "とらえて")
        XCTAssertEqual(question.promptTarget, "捉えて", "UTF-16 mark offsets")
        XCTAssertEqual(question.choiceAnalysis?.count, 4)
        XCTAssertEqual(data.optionIds?["QV1"]?["とらえて"], 1)
        XCTAssertEqual(data.packs.map(\.id), ["DP1"])
        XCTAssertEqual(data.packs.first?.questions.map(\.id), ["QV1"])
        let reading = try XCTUnwrap(data.reading.first)
        XCTAssertEqual(reading.id, "QR1")
        XCTAssertTrue(reading.passage.contains("素材が変わった"))
        XCTAssertEqual(reading.choices[reading.answerIndex], "素材")
        let listening = try XCTUnwrap(data.listening.first)
        XCTAssertEqual(listening.id, "QL1")
        XCTAssertEqual(listening.audioAssetId, "1")
        XCTAssertEqual(listening.transcript, "男：明日は雨です。")
    }

    func testSettingsTranslateBothWays() throws {
        let data = try snapshot()
        let settings = try XCTUnwrap(data.state.settings)
        XCTAssertEqual(settings["locale"], .string("zh-CN"))
        XCTAssertEqual(settings["practiceAutoAdvanceSeconds"], .number(0.5))
        XCTAssertEqual(settings["ttsProvider"], .string("browser"))
        let patch = try XCTUnwrap(try JSONSerialization.jsonObject(with: V3Bridge.settingsPatch([
            "locale": .string("ja"), "practiceAutoAdvanceSeconds": .number(1), "jlptVocabularyQuestionKinds": .array([.string("kanji_to_kana")]),
            "japaneseDisplay": .object(["segmented": .bool(true), "styles": .object([:])]), "memoryCardFrontFields": .array([]),
        ])) as? [String: Any])
        XCTAssertEqual(patch["uiLanguage"] as? String, "ja")
        XCTAssertEqual(patch["autoAdvanceSeconds"] as? Double, 1)
        XCTAssertEqual(patch["questionKinds"] as? [String], ["vocabulary-kanji-reading"])
        XCTAssertEqual(patch["segmentedDisplay"] as? Bool, true)
        XCTAssertNil(patch["memoryCardFrontFields"], "keys v3 does not store stay on the device")
    }

    func testSharesAndPackagesDecode() throws {
        let share = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(Self.share.utf8)) as? [String: Any])
        let list = try XCTUnwrap(share["list"] as? [[String: Any]])
        let row = V3Bridge.share(list[0])
        XCTAssertEqual(row.kind, "practice")
        XCTAssertEqual(row.count, 1)
        XCTAssertEqual(row.mine, true)
        let package = try V3Bridge.package(try XCTUnwrap(share["detail"] as? [String: Any]))
        XCTAssertEqual(package.items?.first?.original, "捉える")
        XCTAssertEqual(package.practiceQuestions.first?.answer, "とらえて")
    }

    func testOptionalsInsideJSONDoNotCrashSerialization() throws {
        let missing: String? = nil
        let cleaned = try XCTUnwrap(V3Bridge.clean(["a": missing as Any, "b": [1, NSNull()], "c": "x"]) as? [String: Any])
        XCTAssertTrue(JSONSerialization.isValidJSONObject(cleaned))
        XCTAssertNil(cleaned["a"])
        XCTAssertEqual(cleaned["c"] as? String, "x")
    }

    func testOnlyV3QuestionCodesAreUploaded() {
        XCTAssertTrue(V3Bridge.isQuestionCode("QV15"))
        XCTAssertTrue(V3Bridge.isQuestionCode("QL2"))
        XCTAssertFalse(V3Bridge.isQuestionCode("pq-1"))
        XCTAssertFalse(V3Bridge.isQuestionCode("memory-card:W1"))
    }
}
