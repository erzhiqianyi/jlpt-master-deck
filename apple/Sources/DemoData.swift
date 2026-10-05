import Foundation

enum DemoData {
    static let items: [StudyItem] = [
        .init(id: "demo-measure", deck: "n1_vocab", original: "測定", reading: "そくてい", meaning_zh: "测量；测定", core_memory: ["用仪器或方法，确定长度、温度、速度等。"], examples: [.init(ja: "温度を測定する。", zh: "测量温度。")]),
        .init(id: "demo-grammar", deck: "grammar_expression", original: "もさることながら", meaning_zh: "……自不必说，……更是如此", explanation_zh: "承认前项，同时把重点放在后项。", examples: [.init(ja: "味もさることながら、見た目も美しい。", zh: "味道自不必说，外观也很漂亮。")], content_origin: "ai_generated", verification_status: "unverified"),
        .init(id: "demo-values", deck: "n1_vocab", original: "価値観", reading: "かちかん", meaning_zh: "价值观", examples: [.init(ja: "人によって価値観は異なる。", zh: "每个人的价值观都不同。")]),
        .init(id: "demo-continue", deck: "n1_vocab", original: "継続", reading: "けいぞく", meaning_zh: "持续；继续", examples: [.init(ja: "学習を継続する。", zh: "持续学习。")])
    ]
    static let reading = [ReadingQuestion(id: "demo-reading", title: "学び続けるために",
        passage: "新しいことを学ぶとき、最初からすべてを覚えようとする必要はない。大切なのは、少しずつでも学び続けることだ。\n\nたとえば、一日に十個の言葉を覚えても、使わなければ忘れてしまう。一方、三個だけでも、自分の経験と結びつけて使えば、記憶に残りやすい。\n\n学習の成果は、量だけで決まるものではない。学んだことをどう使うかにも目を向けたい。",
        question: "筆者が最も伝えたいことは何か。", choices: ["最初からすべてを覚えるべきだ。", "言葉をたくさん覚えることが大切だ。", "学んだことを実際に使うことが大切だ。", "同じ言葉だけを繰り返すべきだ。"], answerIndex: 2,
        explanation: "作者强调将学习内容与自己的经历联系并实际运用，而非单纯追求数量。原文依据：自分の経験と結びつけて使えば、記憶に残りやすい。")]
    static var plan: StudyPlan {
        .init(tasks: [
            PlanTask(id: "demo-task1", date: StudyDates.day(), title: "复习到期词汇", module: "vocabulary", minutes: 10, status: "pending"),
            PlanTask(id: "demo-task2", date: StudyDates.day(), title: "语法表达巩固", module: "grammar", minutes: 10, status: "completed"),
            PlanTask(id: "demo-task3", date: StudyDates.day(), title: "短文理解", module: "reading", minutes: 15, status: "pending")
        ], dailySummaries: (0..<5).map { offset in
            DailySummary(date: StudyDates.day(Calendar.current.date(byAdding: .day, value: -offset, to: .now)!), practiceMinutes: [18, 10, 25, 0, 15][offset], attempted: [8, 6, 12, 0, 7][offset])
        })
    }
}

#if DEBUG
extension DemoData {
    static var practiceFixture: NativePack {
        let word = NativeQuestion(id: "fixture-word", itemId: "demo-sokutei", kind: "kanji_to_kana", title: "读音",
            prompt: "温度を測定する。", choices: ["そくてい", "そってい", "そくじょう", "そくとう"], answer: "そくてい",
            instruction: "「測定」の読み方を選びなさい。", translationZh: "测量温度。", correctReason: "「測定」读作「そくてい」，指用仪器或方法确定数量。例句中测量的是温度。",
            memoryPoint: "測＝そく；定＝てい。结合温度、长度等被测量对象记忆。",
            choiceAnalysis: ["「測」读作そく，「定」读作てい。", "「測」的读音不能省略く。", "「定」在该词中不读じょう。", "「定」在该词中不读とう。"].enumerated().map { .init(choice: ["そくてい", "そってい", "そくじょう", "そくとう"][$0.offset], correct: $0.offset == 0, explanation: $0.element) })
        let grammar = NativeQuestion(id: "fixture-grammar", itemId: "demo-grammar", kind: "grammar", title: "语法",
            prompt: "味も（　）、見た目も美しい。", choices: ["にかかわらず", "さることながら", "に反して", "を問わず"], answer: "さることながら",
            instruction: "文に合う表現を選びなさい。", translationZh: "味道自不必说，外观也很漂亮。",
            correctReason: "「Aもさることながら、B」承认A，同时把重点放在B。这里既认可味道，又进一步评价外观。",
            memoryPoint: "A也很好，B更值得提起。用「も」引出前项。",
            choiceAnalysis: ["表示不受前项影响，不是追加评价。", "承认味道，同时强调外观符合题意。", "表示与前项相反，句中没有转折。", "表示不论某种条件，句中不是范围条件。"].enumerated().map { .init(choice: ["にかかわらず", "さることながら", "に反して", "を問わず"][$0.offset], correct: $0.offset == 1, explanation: $0.element) })
        return NativePack(id: "ui-fixture", title: "单词与语法 · 界面测试示例", date: StudyDates.day(), questions: [word, grammar])
    }
}
#endif

#if DEBUG
extension DemoData {
    // Independent visual/test data; never shown or stored in a real account.
    static func statisticsFixture(now: Date = .now) -> [NativeAttempt] {
        let rows: [(Int, Int, Int, String)] = [
            (-15,25,22,"vocabulary"), (-14,20,18,"daily-practice"), (-13,20,18,"daily-practice"),
            (-12,20,18,"daily-practice"), (-11,20,18,"daily-practice"), (-10,20,18,"daily-practice"),
            (-9,20,18,"daily-practice"), (-8,25,22,"daily-practice"),
            (-5,14,12,"daily-practice"), (-4,10,9,"daily-practice"), (-2,107,95,"daily-practice"),
            (-1,83,74,"daily-practice"), (0,20,18,"mixed")
        ]
        return rows.enumerated().map { index, row in
            let date = StudyStatistics.calendar.date(byAdding: .day, value: row.0, to: now)!.ISO8601Format()
            let answers = (0..<row.1).map { answerIndex in
                NativeAttempt.AttemptAnswer(questionId: answerIndex == 0 ? "fixture-word" : "fixture-\(index)-\(answerIndex)", itemId: "demo-measure", kind: "kanji_to_kana", selected: answerIndex < row.2 ? "そくてい" : "そってい", correct: answerIndex < row.2, answeredAt: date, elapsedMs: 1000)
            }
            return NativeAttempt(id: "statistics-fixture-\(index)", title: row.3 == "mixed" ? "综合练习 · 每组 20 题" : "界面测试练习 \(index + 1)", startedAt: date, completedAt: date, view: row.3, deck: "all", questionIds: answers.map(\.questionId), answers: answers, summary: .init(total: row.1, correct: row.2, wrong: row.1-row.2, accuracy: Double(row.2)/Double(row.1)*100, elapsedMs: row.1 * 1000))
        }
    }
}
#endif
