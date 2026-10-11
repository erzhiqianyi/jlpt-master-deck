import XCTest
@testable import JLPTMasterDeck

/// v3 のデータ層：サーバーの出力を読めること、復習間隔がサーバーと同じこと、オフラインの学習がイベントとして残ること。
@MainActor
final class StudyTests: XCTestCase {
    private var root: URL!
    override func setUp() async throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }
    override func tearDown() async throws { try? FileManager.default.removeItem(at: root) }

    private func signedIn(_ snapshot: LocalSnapshot = DemoData.snapshot) async -> AppStore {
        let store = AppStore(readSavedSession: { Session(user: Account(id: 7, username: "tester"), token: "test") }, storageRoot: root, syncsAutomatically: false)
        await store.restore()
        store.replaceSnapshotForTesting(snapshot)
        return store
    }

    func testDecodesTheServerSyncPayloads() throws {
        let decoder = JSONDecoder()
        let overview = try decoder.decode(SyncOverview.self, from: Data(GeneratedFixtures.overview.utf8))
        XCTAssertEqual(overview.wordbooks.first?.code, "WB1")
        XCTAssertFalse(overview.cardTemplates.isEmpty)
        XCTAssertEqual(overview.questionTypes.first { $0.typeId == "vocabulary-kanji-reading" }?.answerMode, "choice")
        XCTAssertEqual(overview.schedules.first?.code, "W1")
        XCTAssertEqual(overview.practiceSets.first?.code, "DP1")
        let page = try decoder.decode(KnowledgePage.self, from: Data(GeneratedFixtures.knowledge.utf8))
        let word = try XCTUnwrap(page.items.first { $0.code == "W1" })
        XCTAssertEqual(word.reading, "とらえる")
        XCTAssertEqual(word.examples.first?.translation?.text, "抓住要点。")
        XCTAssertFalse(word.conjugations.isEmpty)
        XCTAssertEqual(page.codes, ["W1", "G1"])
        let bundle = try decoder.decode(PracticeBundle.self, from: Data(GeneratedFixtures.practice.utf8))
        XCTAssertEqual(bundle.practice.allEntries.map(\.question), ["QV1"])
        XCTAssertEqual(bundle.groups.first?.questions.first?.correctOption?.text, "とらえる")
        XCTAssertEqual(bundle.groups.first?.questions.first?.marks.first?.start, 3)
    }

    func testReviewScheduleMatchesTheSharedJavaScriptRules() throws {
        struct Case: Decodable { let start: ReviewState?; let rating: String?; let correct: Bool?; let expected: ReviewState }
        let cases = try JSONDecoder().decode([Case].self, from: Data(GeneratedFixtures.scheduleCases.utf8))
        let now = try XCTUnwrap(StudyDates.parse(GeneratedFixtures.now))
        XCTAssertEqual(cases.count, 36)
        for value in cases {
            let actual = value.rating.map { ReviewSchedule.afterRating(value.start, rating: MemoryRating(rawValue: $0)!, now: now) }
                ?? ReviewSchedule.afterAnswer(value.start, correct: value.correct!, now: now)
            let label = "\(value.start?.intervalDays.description ?? "new") \(value.rating ?? value.correct!.description)"
            XCTAssertEqual(actual.status, value.expected.status, label)
            XCTAssertEqual(actual.intervalDays, value.expected.intervalDays, label)
            XCTAssertEqual(actual.reviewCount, value.expected.reviewCount, label)
            XCTAssertEqual(actual.ease, value.expected.ease, accuracy: 0.0001, label)
            XCTAssertEqual(actual.dueAt.flatMap(StudyDates.parse), value.expected.dueAt.flatMap(StudyDates.parse), label)
        }
    }

    func testTextAnswersUseTheServerNormalization() {
        XCTAssertEqual(AppStore.normalized("ちこく。"), AppStore.normalized("ちこく"))
        XCTAssertEqual(AppStore.normalized("ＡＢＣ　です、"), "ABCです")
        XCTAssertNotEqual(AppStore.normalized("ちこく"), AppStore.normalized("じこく"))
    }

    func testOfflinePracticeIsGradedLocallyAndQueuedAsEvents() async throws {
        let store = await signedIn()
        let key = try store.startPractice("DP1")
        XCTAssertEqual(try store.startPractice("DP1"), key, "进行中的同一份练习继续做")
        let attempt = try XCTUnwrap(store.attempt(key))
        let group = try XCTUnwrap(attempt.groups["QS1"])
        let question = group.questions[0]
        let wrong = store.answer(key, question: question, group: group, optionId: 102)
        XCTAssertEqual(wrong?.correct, false)
        XCTAssertEqual(store.schedule("W1")?.intervalDays, 1)
        let right = store.answer(key, question: question, group: group, optionId: 101)
        XCTAssertEqual(right?.correct, true)
        store.complete(key)
        XCTAssertNil(store.answer(key, question: question, group: group, optionId: 101), "结束后不能再答")
        let events = store.work.events
        XCTAssertEqual(events.map(\.type), [.attemptStarted, .answerSubmitted, .answerSubmitted, .attemptCompleted])
        XCTAssertEqual(events[0].eventId, key)
        XCTAssertEqual(events[1].attempt, key)
        XCTAssertEqual(events[2].selectedOptionId, 101)
        XCTAssertEqual(Set(events.map(\.eventId)).count, events.count)
        // アプリを作り直しても残っている
        let reopened = await signedIn()
        XCTAssertEqual(reopened.work.events.map(\.eventId), events.map(\.eventId))
        XCTAssertEqual(reopened.finishedAttempts.first?.correctCount, 1)
    }

    func testCardRatingsUpdateTheLocalScheduleAndRepeatForgottenCards() async throws {
        let store = await signedIn()
        store.startCards()
        let codes = try XCTUnwrap(store.cardSession?.codes)
        XCTAssertEqual(codes, ["W1", "W2", "G1"], "没学过的卡片")
        store.revealCard()
        store.rate("W1", .forgot)
        XCTAssertEqual(store.cardSession?.codes.last, "W1", "忘记的卡片今天再出一次")
        XCTAssertEqual(store.cardSession?.index, 1)
        XCTAssertEqual(store.cardSession?.revealed, false)
        store.rate("W2", .easy)
        XCTAssertEqual(store.schedule("W2")?.intervalDays, 7)
        XCTAssertEqual(store.work.events.map(\.rating), ["forgot", "easy"])
        XCTAssertEqual(store.dueCards(now: .now.addingTimeInterval(3600)).due, ["W1"], "10 分钟后忘记的卡片到期")
    }

    func testDemoModeNeverQueuesEvents() async throws {
        let store = AppStore(readSavedSession: { nil }, storageRoot: root, syncsAutomatically: false)
        store.startDemo()
        let key = try store.startPractice("DP1")
        store.rate("W1", .hard)
        store.complete(key)
        XCTAssertTrue(store.work.events.isEmpty)
    }

    func testMarkedTextUsesUTF16Offsets() {
        let text = MarkedText.attributed("𠮷野で会議に遅刻した。", marks: [QuestionMark(kind: "target", start: 7, end: 9)], size: 18)
        let underlined = text.runs.filter { $0.underlineStyle != nil }.map { String(text[$0.range].characters) }
        XCTAssertEqual(underlined, ["遅刻"])
    }

    func testSpeechChunksStayWithinTheServerLimit() {
        let text = String(repeating: "あいうえお。", count: 200)
        let chunks = SpeechPlayer.chunks(text)
        XCTAssertGreaterThan(chunks.count, 1)
        XCTAssertTrue(chunks.allSatisfy { $0.utf16.count <= 450 })
        XCTAssertEqual(chunks.joined(), text)
    }
}
