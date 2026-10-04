import XCTest

final class NavigationLifecycleTests: XCTestCase {
    private var app: XCUIApplication!
    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        app = XCUIApplication()
        app.launchArguments = ["--demo"]
        app.launch()
        XCTAssertTrue(app.buttons["workspace.companion"].firstMatch.waitForExistence(timeout: 10))
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
        }
        if tab.exists { tab.tap() }
        else { sidebar.tap() }
    }
    private func reveal(_ element: XCUIElement) {
        for _ in 0..<6 {
            if element.isHittable { return }
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable)
    }
    func testReadingSelectionAndScrollSurviveBackground() throws {
        primary("今日"); capture("today-portrait")
        primary("练习"); capture("practice-portrait")
        primary("题库")
        capture("library-portrait")
        app.buttons["nav.阅读"].tap()
        app.buttons.containing(.staticText, identifier: "学び続けるために").firstMatch.tap()
        let answer = app.buttons["reading.choice.2"]
        XCTAssertTrue(answer.waitForExistence(timeout: 5))
        reveal(answer)
        answer.tap()
        XCTAssertEqual(answer.value as? String, "已选择")
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
        capture("reading-correct-feedback")
    }
    func testWaveOpensPracticeAndModalSurvivesBackground() throws {
        primary("练习")
        app.buttons["workspace.companion"].firstMatch.tap()
        let topic = app.buttons["专项练习"].firstMatch
        XCTAssertTrue(topic.waitForExistence(timeout: 5))
        capture("companion-shortcuts")
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
