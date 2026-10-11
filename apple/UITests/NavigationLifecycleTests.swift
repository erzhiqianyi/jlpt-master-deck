import XCTest

/// 演示データ（--demo）で主な流れを通す：タブ、記憶カード、練習（解答・結果・合計）、題庫の検索と詳細。
final class NavigationLifecycleTests: XCTestCase {
    private var app: XCUIApplication!
    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        app = XCUIApplication()
        app.launchArguments = ["--demo"]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 10))
    }
    private func tab(_ title: String) {
        let button = app.tabBars.buttons[title]
        XCTAssertTrue(button.waitForExistence(timeout: 5), "Missing tab \(title)")
        button.tap()
    }

    func testEveryTabOpens() {
        for (title, marker) in [("今日", "记忆卡片"), ("练习", "每日练习"), ("题库", "演示词汇"), ("发现", "演示模式不能浏览分享。"), ("记录", "同步")] {
            tab(title)
            XCTAssertTrue(app.staticTexts[marker].waitForExistence(timeout: 5), "\(title) shows \(marker)")
        }
    }

    func testCardReviewRevealsRatesAndFinishes() {
        tab("今日")
        app.buttons["today.review"].tap()
        XCTAssertTrue(app.staticTexts["遅刻"].waitForExistence(timeout: 5))
        for _ in 0..<3 {
            app.buttons["cards.show"].tap()
            XCTAssertTrue(app.buttons["cards.rate.easy"].waitForExistence(timeout: 5))
            app.buttons["cards.rate.easy"].tap()
        }
        XCTAssertTrue(app.staticTexts["今天的卡片都复习完了"].waitForExistence(timeout: 5))
        app.buttons["返回"].tap()
        XCTAssertTrue(app.staticTexts["待复习 0 · 新卡 0"].waitForExistence(timeout: 5))
    }

    func testDailyPracticeShowsFeedbackAndScore() {
        tab("练习")
        app.buttons["practice.set.DP1"].tap()
        XCTAssertTrue(app.buttons["practice.option.1"].waitForExistence(timeout: 5))
        app.buttons["practice.option.1"].tap()
        app.buttons["practice.submit"].tap()
        XCTAssertTrue(app.staticTexts["回答正确"].waitForExistence(timeout: 5))
        app.buttons["practice.next"].tap()
        app.buttons["practice.option.2"].tap()
        app.buttons["practice.submit"].tap()
        XCTAssertTrue(app.staticTexts["回答错误"].waitForExistence(timeout: 5))
        app.buttons["practice.finish"].tap()
        XCTAssertTrue(app.staticTexts["答对 1 / 2"].waitForExistence(timeout: 5))
    }

    func testPracticeResumesFromToday() {
        tab("练习")
        app.buttons["practice.set.DP1"].tap()
        app.buttons["practice.option.1"].tap()
        app.buttons["practice.submit"].tap()
        XCTAssertTrue(app.staticTexts["回答正确"].waitForExistence(timeout: 5))
        // 演示データはメモリだけなので、ここではタブを移っても続きから出ることを確かめる
        tab("今日")
        XCTAssertTrue(app.buttons["today.resume"].waitForExistence(timeout: 5))
        app.buttons["today.resume"].tap()
        XCTAssertTrue(app.staticTexts["回答正确"].waitForExistence(timeout: 5))
    }

    func testLibrarySearchOpensDetail() {
        tab("题库")
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("chikoku")
        let row = app.staticTexts["遅刻"]
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        row.tap()
        XCTAssertTrue(app.staticTexts["开会迟到了。"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["例句"].exists)
    }
}
