import XCTest
import UIKit
@testable import JLPTMasterDeck

final class StudyTests: XCTestCase {
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
        let stateJSON = #"{"progress":{},"answers":{},"settings":{"memoryCardFrontFields":["original"],"showReviewRuby":true,"fontSize":"large","future":{"value":2}}}"#
        let state = try JSONDecoder().decode(StudyState.self, from: Data(stateJSON.utf8))
        let restored = try JSONDecoder().decode(StudyState.self, from: JSONEncoder().encode(state))
        XCTAssertEqual(restored.settings, state.settings)
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
        XCTAssertEqual(next.correct, 4); XCTAssertEqual(next.wrong, 2)
        XCTAssertEqual(next.reviewCount, 6); XCTAssertEqual(next.status, "learning")
        XCTAssertEqual(next.ease, 1.3)
        XCTAssertEqual(try XCTUnwrap(StudyDates.parse(next.nextReviewAt!)).timeIntervalSince(now), 600, accuracy: 0.01)
        XCTAssertEqual(next.lastPracticeSessionId, "reading-session")
    }
    func testRememberedAndEasyMatchWebIntervals() throws {
        let now = Date(timeIntervalSince1970: 1_791_000_000)
        for (rating, days) in [(MemoryRating.hard, 1), (.remembered, 3), (.easy, 7)] {
            let next = ProgressEntry().rated(rating, now: now)
            XCTAssertEqual(next.correct, 1); XCTAssertEqual(next.wrong, 0)
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
    func testRetryRecognizesAppliedWriteAndStopsOnNewerCloudProgress() {
        let before = ProgressEntry()
        let next = before.rated(.remembered)
        let pending = PendingAnswer(id: UUID(), before: before, input: .init(questionId: "memory-card:i", itemId: "i", selected: "remembered", correct: true, progressEntry: next))
        XCTAssertEqual(pending.disposition(cloud: before), .send)
        XCTAssertEqual(pending.disposition(cloud: next), .alreadyApplied)
        XCTAssertEqual(pending.disposition(cloud: next.rated(.easy)), .conflict)
        XCTAssertEqual(pending.disposition(cloud: before.rated(.forgot)), .conflict)
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
        XCTAssertNotEqual(files.audioURL(userID: 1, item: item), files.audioURL(userID: 1, item: updated))
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
