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

    func testItemPracticePreservesSeedsAndAllLinkedQuestions() throws {
        let json = """
        {"id":"word","deck":"n1_vocab","original":"測定","reading":"そくてい","type":"word",
         "meaning_zh":"测定","examples":[{"ja":"温度を測定する。","zh":"测量温度。"}],
         "practice_questions":[
           {"id":"seed-reading","kind":"kanji_to_kana","prompt":"温度を測定する。","choices":["そくてい","そってい"],"answer":"そくてい"},
           {"id":"seed-usage","kind":"usage","prompt":"測定","choices":["温度を測定する。","友達を測定する。"],"answer":"温度を測定する。"}]}
        """
        let item = try JSONDecoder().decode(StudyItem.self, from: Data(json.utf8))
        let cached = try JSONDecoder().decode(StudyItem.self, from: JSONEncoder().encode(item))
        let linked = (0..<25).map { index in
            NativeQuestion(id: "linked-\(index)", itemId: item.id, kind: "meaning", title: "词义", prompt: "測定", choices: ["测定", "决定"], answer: "测定")
        }
        let unrelated = NativeQuestion(id: "other", itemId: "other-item", kind: "meaning", title: "词义", prompt: "別", choices: ["A", "B"], answer: "A")
        let packs = [NativePack(id: "pack", title: "练习", date: "2026-10-05", questions: linked + [linked[0], unrelated])]
        let questions = try NativeItemQuestions.build(item: cached, items: [cached], packs: packs, locale: "zh-CN")
        XCTAssertTrue(Set(questions.map(\.id)).isSuperset(of: linked.map(\.id)))
        XCTAssertEqual(questions.filter { $0.id == "linked-0" }.count, 1)
        XCTAssertTrue(questions.contains { $0.id == "seed-reading" })
        XCTAssertTrue(questions.contains { $0.id == "seed-usage" })
        XCTAssertTrue(questions.allSatisfy { $0.itemId == item.id && $0.isUsable })
    }

    func testTypePracticePoolKeepsBookMetadataAndUniqueSeedIDs() throws {
        let json = """
        {"id":"grammar","deck":"grammar_expression","wordbook_id":"book-1","original":"かつて","meaning_zh":"曾经","tags":["時間"],
         "practice_questions":[{"id":"g-type","kind":"grammar","prompt":"ここは（　）工場だった。","choices":["かつて","まだ"],"answer":"かつて"}]}
        """
        let item = try JSONDecoder().decode(StudyItem.self, from: Data(json.utf8))
        let cached = try JSONDecoder().decode(StudyItem.self, from: JSONEncoder().encode(item))
        XCTAssertEqual(cached.wordbook_id, "book-1")
        XCTAssertEqual(cached.tags, ["時間"])
        let initial = try NativeItemQuestions.buildAll(items: [cached], packs: [], locale: "zh-CN")
        XCTAssertEqual(initial.map(\.id), ["g-type"])
        let pack = NativePack(id: "pack", title: "练习", date: "2026-10-07", questions: initial + initial)
        XCTAssertEqual(try NativeItemQuestions.buildAll(items: [cached], packs: [pack], locale: "zh-CN").map(\.id), ["g-type"])
        var data = LocalStudyData(); data.wordbooks = [NativeWordbook(id: "book-1", title: "时间", deck: "grammar_expression")]
        let restored = try JSONDecoder().decode(LocalStudyData.self, from: JSONEncoder().encode(data))
        XCTAssertEqual(restored.wordbooks?.first?.id, "book-1")
    }

    func testGrammarItemPracticeKeepsEveryAuthoredSeed() throws {
        let json = """
        {"id":"grammar","deck":"grammar_expression","original":"かつて","meaning_zh":"曾经",
         "practice_questions":[
          {"id":"g1","prompt":"ここは（　）工場だった。","choices":["かつて","まだ"],"answer":"かつて","explanation_zh":"表示过去的某个时期。"},
          {"id":"g2","kind":"grammar","prompt":"いまだ（　）見たことがない。","choices":["かつて","まもなく"],"answer":"かつて"}]}
        """
        let item = try JSONDecoder().decode(StudyItem.self, from: Data(json.utf8))
        let questions = try NativeItemQuestions.build(item: item, items: [item], packs: [], locale: "zh-CN")
        XCTAssertEqual(questions.map(\.id), ["g1", "g2"])
        XCTAssertTrue(questions.allSatisfy { $0.kind == "grammar" })
        XCTAssertTrue(questions[0].correctReason?.contains("表示过去") == true)
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
        XCTAssertEqual(uploaded.url?.path, "/api/item-images/vocab-image")
        XCTAssertEqual(uploaded.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
        let relative = try APIClient.itemImageRequest(["url": "/api/item-images/grammar-image"], token: "test-token")
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
        let second = first.afterPractice(correct: true, now: now)
        let third = second.afterPractice(correct: true, now: now)
        XCTAssertEqual(first.intervalDays, 1)
        XCTAssertEqual(second.intervalDays, 3)
        XCTAssertEqual(third.intervalDays, 9)
        XCTAssertEqual(third.correct, 3)
        let wrong = third.afterPractice(correct: false, now: now)
        XCTAssertEqual(wrong.intervalDays, 1)
        XCTAssertEqual(wrong.wrong, 1)
        XCTAssertEqual(wrong.firstSeenAt, first.firstSeenAt)
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
        XCTAssertEqual(data.fixtures.filter { $0.surface != "unsupported" }.count,18)
        XCTAssertEqual(Set(data.fixtures.filter { $0.surface=="unsupported" }.map(\.id)),Set(["grammar-composition","grammar-text","reading-integrated","reading-information","listening-expression"]))
        for fixture in data.fixtures {
            if fixture.surface=="quiz" { let q=try fixture.decoded(NativeQuestion.self);XCTAssertTrue(q.isUsable);XCTAssertEqual(q.questionTypeId,fixture.id);XCTAssertGreaterThan(q.correctReason?.count ?? 0,200) }
            if fixture.surface=="reading" { let q=try fixture.decoded(ReadingQuestion.self);XCTAssertEqual(q.questionTypeId,fixture.id);XCTAssertTrue(q.choices.indices.contains(q.answerIndex));if fixture.id=="reading-long" { XCTAssertGreaterThan(q.passage.count,500) } }
            if fixture.surface=="listening" { let q=try fixture.decoded(ListeningItem.self);XCTAssertEqual(q.questionTypeId,fixture.id);XCTAssertEqual(q.freeResponse,fixture.id=="listening-basic-training");if fixture.id=="listening-quick" { XCTAssertEqual(q.choices.count,3) } }
        }
    }
    func testLocalJapaneseAudioResourcesArePlayable() throws {
        for name in ["native-visual-narrative","native-visual-quick"] {
            let url=try XCTUnwrap(Bundle.main.url(forResource:name,withExtension:"wav"))
            let bytes=try Data(contentsOf:url);XCTAssertEqual(String(data:bytes.prefix(4),encoding:.utf8),"RIFF")
            let player=try AVAudioPlayer(data:bytes);XCTAssertGreaterThan(player.duration,1)
        }
    }
}
