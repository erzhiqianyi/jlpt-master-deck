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
