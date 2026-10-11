import Foundation

/// 演示用のデータ（端末の中だけ。サーバーには送らない）。UI テストもこれを使う（起動引数 --demo）。
enum DemoData {
    static var snapshot: LocalSnapshot {
        let today = StudyDates.day()
        let knowledge = [
            Knowledge(code: "W1", kind: "word", wordbook: "WB1", expression: "遅刻", reading: "ちこく", romaji: "chikoku", pos: "noun",
                      meaning: PickedText(text: "迟到"), examples: [KnowledgeExample(sentence: "会議に遅刻した。", translation: PickedText(text: "开会迟到了。"))],
                      memoryPoints: [PickedText(text: "遅れて時刻に間に合わない")]),
            Knowledge(code: "W2", kind: "word", wordbook: "WB1", expression: "概観", reading: "がいかん", romaji: "gaikan", pos: "noun", meaning: PickedText(text: "概观、概况")),
            Knowledge(code: "G1", kind: "grammar", wordbook: "WB1", expression: "〜ざるを得ない", meaning: PickedText(text: "不得不"),
                      patterns: [KnowledgePattern(pattern: "動詞ない形＋ざるを得ない", meaning: PickedText(text: "不得不做"))]),
        ]
        let reading = QuestionGroup(code: "QS1", typeId: "vocabulary-kanji-reading", module: "vocabulary", instruction: "下線部の読み方として最もよいものを選びなさい。",
            questions: [GroupQuestion(code: "QV1", prompt: "会議に遅刻した。", translation: PickedText(text: "开会迟到了。"), marks: [QuestionMark(kind: "target", start: 3, end: 5)],
                options: ["ちこく", "ちごく", "じこく", "ちきょく"].enumerated().map { QuestionOption(id: 101 + $0.offset, position: $0.offset, text: $0.element, correct: $0.offset == 0) },
                explanation: [ExplanationSection(kind: "basis", title: PickedText(text: "正确依据"), body: PickedText(text: "「遅刻」读作「ちこく」。"))],
                knowledge: [QuestionKnowledgeLink(code: "W1", relation: "target", expression: "遅刻")])])
        let grammar = QuestionGroup(code: "QS2", typeId: "grammar-form", module: "grammar",
            questions: [GroupQuestion(code: "QG1", prompt: "雨が降ったので、試合は中止せ（　）。", marks: [QuestionMark(kind: "blank", start: 16, end: 16)],
                options: ["ざるを得なかった", "ずにはいられなかった", "かねなかった", "ようがなかった"].enumerated().map { QuestionOption(id: 201 + $0.offset, position: $0.offset, text: $0.element, correct: $0.offset == 0) },
                explanation: [ExplanationSection(kind: "basis", body: PickedText(text: "因为下雨，比赛不得不取消。"))],
                knowledge: [QuestionKnowledgeLink(code: "G1", relation: "target", expression: "〜ざるを得ない")])])
        let set = PracticeSet(code: "DP1", kind: "daily", date: today, title: PickedText(text: "今日の練習"),
                              sections: [PracticeSection(position: 0, title: PickedText(text: "読みと文法"), entries: [
                                PracticeEntry(position: 0, question: "QV1", group: "QS1", typeId: "vocabulary-kanji-reading"),
                                PracticeEntry(position: 1, question: "QG1", group: "QS2", typeId: "grammar-form")])])
        let overview = SyncOverview(serverTime: StudyDates.iso(.now), settings: UserSettings(),
            wordbooks: [Wordbook(code: "WB1", title: "演示词汇", stats: WordbookStats(total: 3, words: 2, grammar: 1, names: 0, due: 0, new: 3, mastered: 0))],
            cardTemplates: [
                CardTemplate(code: "word_standard", kind: "word", isDefault: true, front: [CardField(field: "expression")],
                             back: [CardField(field: "reading"), CardField(field: "meaning"), CardField(field: "example", maxItems: 1), CardField(field: "memory_point", maxItems: 1)]),
                CardTemplate(code: "grammar_standard", kind: "grammar", isDefault: true, front: [CardField(field: "expression")],
                             back: [CardField(field: "meaning"), CardField(field: "pattern")]),
            ],
            questionTypes: [QuestionTypeInfo(typeId: "vocabulary-kanji-reading", module: "vocabulary", labelJa: "漢字読み", answerMode: "choice"),
                            QuestionTypeInfo(typeId: "grammar-form", module: "grammar", labelJa: "文法形式の判断", answerMode: "choice")],
            knowledge: .init(total: knowledge.count, updatedAt: nil),
            practiceSets: [PracticeSetSummary(code: "DP1", kind: "daily", date: today, questionCount: 2, title: PickedText(text: "今日の練習"))])
        return LocalSnapshot(overview: overview, knowledge: knowledge, practices: ["DP1": PracticeBundle(practice: set, groups: [reading, grammar])], lastSync: .now)
    }
}
