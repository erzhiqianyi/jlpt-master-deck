import XCTest

final class NavigationLifecycleTests: XCTestCase {
    private var app: XCUIApplication!
    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        app = XCUIApplication()
        app.launchArguments = ["--demo"]
        app.launch()
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            self.app.buttons["workspace.account"].firstMatch.exists || self.app.buttons["nav.阅读"].exists || self.app.tabBars.firstMatch.exists || self.app.navigationBars.buttons.firstMatch.exists
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 10), .completed)
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
    private func primary(_ title: String) {
        let tab = app.tabBars.buttons[title]
        let sidebar = app.buttons["nav.\(title)"]
        // Cold launch may restore a library module, whose focused phone route
        // intentionally hides the primary tab bar. Return via its context first.
        for _ in 0..<4 {
            if tab.exists || sidebar.exists { break }
            let back = app.buttons["BackButton"].firstMatch
            if back.exists { back.tap() }
            else if app.navigationBars.buttons.firstMatch.exists { app.navigationBars.buttons.firstMatch.tap() }
        }
        if tab.exists { tab.tap() }
        else { sidebar.tap() }
    }
    private func reveal(_ element: XCUIElement) {
        for _ in 0..<6 {
            if element.isHittable && element.frame.midY > 140 && element.frame.midY < app.frame.height - 140 { return }
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable)
    }
    private func revealStatistics(_ element: XCUIElement) {
        let scroll = app.scrollViews["statistics.dashboard"]
        for _ in 0..<15 {
            if element.isHittable && element.frame.midY > 140 && element.frame.midY < app.frame.height - 160 { return }
            scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.70)).press(forDuration: 0.1, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35)))
        }
        XCTAssertTrue(element.isHittable)
    }
    func testJapaneseRubySegmentationAndSettingsPersist() throws {
        app.terminate(); app.launchArguments = ["--demo", "--japanese-display-fixture"]; app.launch()
        primary("题库")
        app.buttons["nav.词汇"].tap()
        app.buttons.containing(.staticText, identifier: "掲載").firstMatch.tap()
        XCTAssertTrue(app.buttons["entry.practice"].waitForExistence(timeout: 5))
        capture("japanese-ruby-detail-top")
        app.swipeUp(); capture("japanese-ruby-segmented-examples")
        XCTAssertFalse(app.staticTexts["掲載（けいさい）"].exists)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.navigationBars.buttons.element(boundBy: 0).tap()
        primary("学习")
        app.buttons["workspace.account"].firstMatch.tap()
        app.buttons["settings.display"].tap()
        let segmented = app.switches["settings.japanese.segmented"]
        reveal(segmented)
        XCTAssertEqual(segmented.value as? String, "1")
        capture("japanese-display-settings")
        segmented.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        let disabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "0"), object: segmented)
        XCTAssertEqual(XCTWaiter.wait(for: [disabled], timeout: 5), .completed)
        let save = app.buttons["settings.display.save"]
        reveal(save); save.tap()
        XCTAssertEqual(app.staticTexts["settings.display.status"].label, "已保存")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["settings.display"].tap()
        reveal(segmented)
        XCTAssertEqual(segmented.value as? String, "0")
        segmented.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        reveal(app.staticTexts["settings.japanese.preview"].firstMatch)
        capture("japanese-ruby-settings-preview")
    }

    func testItemDetailStartsVocabularyAndGrammarQuestions() throws {
        app.terminate(); app.launchArguments = ["--demo", "--item-detail-fixture"]; app.launch()
        primary("题库")
        app.buttons["nav.词汇"].tap()
        app.buttons.containing(.staticText, identifier: "かつて").firstMatch.tap()
        let start = app.buttons["entry.practice"]
        XCTAssertTrue(start.waitForExistence(timeout: 5))
        XCTAssertTrue(start.isHittable, "Practice must be available without scrolling to the bottom")
        capture("item-detail-katsute-top")
        app.swipeUp(); capture("item-detail-katsute-examples")
        start.tap()
        XCTAssertTrue(app.buttons["quiz.back"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["review.reveal"].exists)
        XCTAssertTrue(app.staticTexts["第 1 题 / 共 3 题"].exists)
        capture("item-related-vocabulary-practice")
        app.buttons["quiz.back"].tap()
        XCTAssertTrue(start.waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["nav.语法"].tap()
        app.buttons.containing(.staticText, identifier: "もさることながら").firstMatch.tap()
        XCTAssertTrue(start.waitForExistence(timeout: 5))
        start.tap()
        XCTAssertTrue(app.buttons["quiz.back"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["review.reveal"].exists)
        XCTAssertTrue(app.staticTexts["第 1 题 / 共 1 题"].exists)
        capture("item-related-grammar-practice")
    }

    func testStatisticsDashboardMatchesWebReference() throws {
        app.terminate(); app.launchArguments = ["--demo", "--statistics-fixture"]; app.launch()
        primary("统计")
        XCTAssertTrue(app.staticTexts["今天的积累"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["90%"].exists)
        XCTAssertTrue(app.staticTexts["234 次作答"].exists)
        capture("statistics-reference-top")
        revealStatistics(app.staticTexts["累计概况"])
        XCTAssertTrue(app.staticTexts["404"].exists)
        XCTAssertTrue(app.staticTexts["89%"].exists)
        XCTAssertTrue(app.staticTexts["5 / 7"].exists)
        capture("statistics-reference-overall")
        revealStatistics(app.staticTexts["模块表现"])
        capture("statistics-reference-modules")
        revealStatistics(app.buttons["statistics.history"])
        app.buttons["statistics.history"].tap()
        XCTAssertTrue(app.staticTexts["综合练习 · 每组 20 题"].waitForExistence(timeout: 5))
        app.buttons.containing(.staticText, identifier: "综合练习 · 每组 20 题").firstMatch.tap()
        XCTAssertTrue(app.staticTexts["你的答案：そくてい"].firstMatch.waitForExistence(timeout: 5))
        capture("statistics-reference-attempt-detail")
    }
    func testDisplayPreferencesSaveAndSwitchLanguage() throws {
        primary("学习")
        app.buttons["workspace.account"].firstMatch.tap()
        app.buttons["settings.display"].tap()
        XCTAssertTrue(app.navigationBars["显示与阅读"].waitForExistence(timeout: 5))
        app.segmentedControls["settings.fontSize"].buttons["大"].tap()
        app.switches["settings.reviewKana"].tap()
        app.buttons["settings.language"].tap()
        app.buttons["English"].tap()
        app.buttons["settings.display.save"].tap()
        XCTAssertTrue(app.navigationBars["Display & reading"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Saved"].waitForExistence(timeout: 5))
        capture("native-display-settings-english-large")
    }
    func testSettingsPageAndAIConnectionNavigation() throws {
        primary("学习")
        app.buttons["workspace.account"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["设置"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["account.close"].exists)
        XCTAssertTrue(app.buttons["settings.cards"].exists)
        capture("native-settings-page")
        app.buttons["settings.ai"].tap()
        XCTAssertTrue(app.buttons["ai.article.ai-vocabulary-notes"].waitForExistence(timeout: 5))
        capture("native-ai-community")
        app.buttons["ai.article.ai-vocabulary-notes"].tap()
        XCTAssertTrue(app.navigationBars["文章详情"].waitForExistence(timeout: 5))
        capture("native-ai-article")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["settings.ai.connections"].tap()
        XCTAssertTrue(app.buttons["settings.ai.copy"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["登录后查看和管理当前账户的 AI 授权。"].exists)
        capture("native-settings-ai")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.buttons["settings.account"].exists)
        app.buttons["settings.account"].tap()
        XCTAssertTrue(app.buttons["account.logout"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.buttons["workspace.account"].firstMatch.waitForExistence(timeout: 5))
    }

    func testStatisticsMockExamAndCardSettingsPersist() throws {
        primary("练习")
        XCTAssertTrue(app.buttons["practice.mock"].waitForExistence(timeout: 5))
        app.buttons["practice.mock"].tap()
        XCTAssertTrue(app.staticTexts["登录后查看账户里的试卷和考试安排。"].waitForExistence(timeout: 5))
        app.buttons["practice.back"].tap()
        primary("统计")
        XCTAssertTrue(app.staticTexts["今天的积累"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["近七天作答"].exists)
        capture("native-statistics")
        app.buttons["workspace.account"].firstMatch.tap()
        app.buttons["settings.cards"].tap()
        let image = app.switches["settings.cards.back.images"]
        reveal(image)
        XCTAssertEqual(image.value as? String, "1")
        image.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
        XCTAssertEqual(image.value as? String, "0")
        let save = app.buttons["settings.cards.save"]
        reveal(save); save.tap()
        XCTAssertTrue(app.staticTexts["卡片设置已保存"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["settings.cards"].tap()
        reveal(image)
        XCTAssertEqual(image.value as? String, "0")
        capture("native-memory-image-settings-saved")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["settings.speech"].tap()
        XCTAssertTrue(app.buttons["settings.speech.save"].waitForExistence(timeout: 5))
        capture("native-speech-settings")
    }
    func testReadingSelectionAndScrollSurviveBackground() throws {
        primary("学习"); capture("today-portrait")
        primary("练习"); capture("practice-portrait")
        primary("题库")
        capture("library-portrait")
        app.buttons["nav.阅读"].tap()
        app.buttons.containing(.staticText, identifier: "学び続けるために").firstMatch.tap()
        XCTAssertFalse(app.buttons["reading.speak"].exists, "Reading speech stays hidden before confirmation")
        let answer = app.buttons["reading.choice.2"]
        XCTAssertTrue(answer.waitForExistence(timeout: 5))
        reveal(answer)
        capture("reading-option-visible-before-tap")
        answer.tap()
        XCTAssertTrue(NSPredicate(format: "value == %@", "已选择").evaluate(with: answer) || {
            let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "已选择"), object: answer)
            return XCTWaiter.wait(for: [expectation], timeout: 3) == .completed
        }())
        let beforeY = answer.frame.minY
        capture("reading-selected-before-background")
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(app.wait(for: .runningBackground, timeout: 5))
        app.activate()
        XCTAssertTrue(answer.waitForExistence(timeout: 5))
        XCTAssertEqual(answer.value as? String, "已选择")
        XCTAssertEqual(answer.frame.minY, beforeY, accuracy: 3)
        capture("reading-selected-after-background")
        let confirm = app.buttons["确认答案"]
        reveal(confirm); confirm.tap()
        XCTAssertTrue(app.staticTexts["回答正确"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["reading.speak"].exists, "Confirmed answers unlock reading speech")
        capture("reading-correct-feedback")
    }
    func testReviewSpeechMovesWithinContentAndRemembersSide() throws {
        primary("学习")
        let start = app.buttons["today.review"]
        reveal(start); start.tap()
        let speech = app.buttons["review.speech"]
        XCTAssertTrue(speech.waitForExistence(timeout: 5))
        app.buttons["review.speech-position"].tap()
        app.buttons["放到右侧"].tap()
        let term = app.staticTexts["測定"].firstMatch
        XCTAssertTrue(term.exists)
        XCTAssertGreaterThan(speech.frame.minX, term.frame.minX)
        app.buttons["review.speech-position"].tap()
        app.buttons["放到左侧"].tap()
        XCTAssertLessThan(speech.frame.minX, term.frame.minX)
        capture("review-speech-left-inside-card")
        app.buttons["显示答案"].tap()
        XCTAssertTrue(speech.exists)
        XCTAssertLessThan(speech.frame.minX, app.staticTexts["測定"].firstMatch.frame.minX)
        app.terminate(); app.launch()
        primary("学习")
        reveal(start); start.tap()
        XCTAssertTrue(speech.waitForExistence(timeout: 5))
        XCTAssertLessThan(speech.frame.minX, app.staticTexts["測定"].firstMatch.frame.minX)
        app.buttons["review.speech-position"].tap()
        app.buttons["放到右侧"].tap()
    }
    func testReviewExamplePlaybackAndCopyActions() throws {
        primary("学习")
        let start = app.buttons["today.review"]
        reveal(start); start.tap()
        let copyWord = app.buttons["review.copyWord"]
        XCTAssertTrue(copyWord.waitForExistence(timeout: 5))
        copyWord.tap()
        XCTAssertEqual(copyWord.label, "已复制")
        XCTAssertTrue(app.buttons["review.reveal"].exists, "Copying must not flip the card")
        app.buttons["review.speech"].tap()
        XCTAssertTrue(app.buttons["review.reveal"].exists, "Playing must not flip the card")
        app.scrollViews["review.card"].coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.15)).tap()
        XCTAssertTrue(app.buttons["review.forgot"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["review.reveal"].exists)
        let play = app.buttons["review.example.0"]
        reveal(play)
        XCTAssertTrue(play.isHittable)
        let loop = app.buttons["review.example.0.repeat"]
        loop.tap()
        XCTAssertEqual(loop.value as? String, "开启")
        play.tap()
        XCTAssertTrue(play.waitForExistence(timeout: 5))
        play.tap()
        loop.tap()
        XCTAssertEqual(loop.value as? String, "关闭")
        let copyReference = app.buttons["review.copyReference"]
        reveal(copyReference)
        XCTAssertTrue(copyReference.isHittable)
        XCTAssertEqual(app.staticTexts["review.reference.value"].label, "demo-measure")
        XCTAssertEqual(app.staticTexts["review.reference.value"].frame.midX, app.frame.midX, accuracy: 3)
        copyReference.tap()
        XCTAssertEqual(copyReference.label, "已复制")
        capture("review-example-playback-and-copy")
    }
    func testReviewViewportAndRatingDockStayStable() throws {
        primary("学习")
        let start = app.buttons["today.review"]
        reveal(start); start.tap()
        let revealButton = app.buttons["review.reveal"]
        XCTAssertTrue(revealButton.waitForExistence(timeout: 5))
        let term = app.staticTexts["測定"].firstMatch
        XCTAssertTrue(term.exists)
        XCTAssertGreaterThan(term.frame.midY, app.frame.height * 0.25)
        XCTAssertLessThan(term.frame.midY, app.frame.height * 0.7)
        capture("review-centered-front")
        revealButton.tap()
        let ratings = ["forgot", "hard", "remembered", "easy"].map { app.buttons["review.\($0)"] }
        for rating in ratings { XCTAssertTrue(rating.isHittable); XCTAssertEqual(rating.frame.minY, ratings[0].frame.minY, accuracy: 2) }
        let dockY = ratings[0].frame.minY
        capture("review-back-redesigned-top")
        app.swipeUp()
        XCTAssertEqual(ratings[0].frame.minY, dockY, accuracy: 2)
        capture("review-back-fixed-rating-dock")
    }
    func testVocabularyAndGrammarAnswerAndExplanationMatchWeb() throws {
        app.terminate(); app.launchArguments = ["--demo", "--practice-fixture"]; app.launch()
        primary("学习")
        let start = app.buttons["today.practice.ui-fixture"]
        reveal(start); start.tap()
        let confirm = app.buttons["quiz.confirm"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        XCTAssertFalse(confirm.isEnabled)
        XCTAssertFalse(app.staticTexts["解题依据"].exists)
        let wrong = app.buttons["quiz.choice.1"]
        reveal(wrong); wrong.tap(); confirm.tap()
        let outcome = app.staticTexts["回答错误"]
        XCTAssertTrue(outcome.waitForExistence(timeout: 5)); reveal(outcome)
        capture("vocabulary-wrong-answer-feedback")
        let analysis = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "选项辨析")).firstMatch
        reveal(analysis); analysis.tap()
        XCTAssertTrue(app.staticTexts["「測」的读音不能省略く。"].exists)
        capture("vocabulary-expanded-choice-analysis")
        XCTAssertTrue(app.buttons["quiz.next"].isHittable)
        app.buttons["quiz.next"].tap()
        // Page-style TabView may retain the adjacent page in the accessibility tree.
        XCTAssertFalse(app.staticTexts["回答错误"].isHittable)
        XCTAssertFalse(app.staticTexts["解题依据"].isHittable)
        let right = app.buttons["quiz.choice.1"]
        reveal(right); right.tap(); app.buttons["quiz.confirm"].tap()
        let correct = app.staticTexts["回答正确"]
        XCTAssertTrue(correct.waitForExistence(timeout: 5)); reveal(correct)
        capture("grammar-correct-answer-feedback")
        reveal(analysis); analysis.tap()
        XCTAssertTrue(app.staticTexts["承认味道，同时强调外观符合题意。"].exists)
        let translation = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "完整中文翻译")).firstMatch
        reveal(translation); translation.tap()
        XCTAssertTrue(app.staticTexts["味道自不必说，外观也很漂亮。"].exists)
        capture("grammar-expanded-explanation-and-translation")
        app.buttons["quiz.next"].tap()
        let mistakes = app.buttons["quiz.review.mistakes"]
        XCTAssertTrue(mistakes.waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["解题依据"].exists, "Summary must not contain question explanations")
        XCTAssertTrue(app.buttons["quiz.review.all"].exists)
        capture("practice-summary-only")
        mistakes.tap()
        XCTAssertTrue(app.staticTexts["原题第 1 题"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["回答错误"].exists)
        XCTAssertFalse(app.staticTexts["原题第 2 题"].isHittable)
        capture("practice-review-wrong-only")
        app.buttons["quiz.review.summary"].tap()
        XCTAssertFalse(app.staticTexts["解题依据"].exists)
        app.buttons["quiz.review.all"].tap()
        app.swipeLeft()
        XCTAssertTrue(app.staticTexts["原题第 2 题"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["原题第 2 题"].isHittable)
        capture("practice-review-all-swiped")
    }
    func testPracticeEntryWorksWithoutFloatingActionsAndSurvivesBackground() throws {
        primary("练习")
        XCTAssertFalse(app.buttons["workspace.companion"].exists)
        XCTAssertFalse(app.buttons["detail.companion"].exists)
        let topic = app.buttons["practice.topics"].firstMatch
        XCTAssertTrue(topic.waitForExistence(timeout: 5))
        capture("native-practice-without-floating-action")
        topic.tap()
        XCTAssertTrue(app.staticTexts["演示模式"].waitForExistence(timeout: 5))
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(app.wait(for: .runningBackground, timeout: 5))
        app.activate()
        XCTAssertTrue(app.buttons["practice.back"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["演示模式"].exists)
        capture("practice-modal-after-background")
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["practice.topics"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["practice.back"].exists)
        capture("cold-launch-restored-practice-tab")
    }
}
