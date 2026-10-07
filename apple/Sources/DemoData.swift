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

#if DEBUG
extension DemoData {
    static var itemDetailFixture: StudyItem {
        var item = StudyItem(id: "fixture-katsute", deck: "n1_vocab", original: "かつて", reading: "かつて",
            meaning_zh: "① 曾经、从前：表示过去的某个时期，接近「以前」「昔」。\n② 与否定搭配时表示“此前从未、过去不曾”。重点表达「かつてない」＝从未有过的、前所未有的；「いまだかつて〜ない」＝迄今从未。",
            explanation_zh: "表示过去某个时期；与否定表达搭配时，强调直到现在都没有过这种经历。",
            core_memory: ["かつて：过去某个时期。", "いまだかつて〜ない：迄今从未。"],
            examples: [
                .init(ja: "この建物は、かつては工場だったが、今は図書館として使われている。", zh: "这栋建筑以前曾是工厂，现在被用作图书馆。"),
                .init(ja: "かつての同僚と、久しぶりに会った。", zh: "我和以前的同事久别重逢了。"),
                .init(ja: "今回のイベントには、かつてないほど多くの人が集まった。", zh: "这次活动聚集了前所未有的众多人群。"),
                .init(ja: "こんなに美しい景色は、いまだかつて見たことがない。", zh: "我至今从未见过如此美丽的景色。")],
            jlpt_level: "N1", part_of_speech: "副词", meaning_ja: "以前、過去のある時期。", reference: "IT-000016")
        item.practice_questions = [
            ["id": .string("katsute-context"), "kind": .string("moji_goi"), "prompt": .string("この建物は、（　）は工場だった。"), "choices": .array([.string("かつて"), .string("まもなく"), .string("すでに"), .string("まだ")]), "answer": .string("かつて"), "explanation_zh": .string("かつて表示过去的某个时期。")],
            ["id": .string("katsute-usage"), "kind": .string("usage"), "prompt": .string("かつて"), "choices": .array([.string("かつての同僚に会った。"), .string("かつて明日会う予定だ。")]), "answer": .string("かつての同僚に会った。"), "explanation_zh": .string("かつての表示以前的。")]
        ]
        return item
    }
}
#endif

#if DEBUG
extension DemoData {
    static var japaneseDisplayFixture: StudyItem {
        var item = StudyItem(id: "fixture-keisai", deck: "n1_vocab", original: "掲載", reading: "けいさい",
            meaning_zh: "刊登、登载：把内容放到公开媒体或页面上。",
            explanation_zh: "【核心】掲載＝把内容放到公开媒体或页面上。\n【IT语境】ホームページに掲載する、求人情報を掲載する。公开是让别人能看，掲載是登载到某个媒体或页面上。",
            core_memory: ["【核心】掲載＝把内容放到公开媒体或页面上。", "【IT语境】ホームページに掲載する、求人情報を掲載する、掲載期間。"],
            examples: [.init(ja: "美しい景色を見た。", zh: "看到了美丽的景色。"), .init(ja: "求人情報をホームページに掲載する。", zh: "把招聘信息刊登在网站上。")],
            jlpt_level: "N1", part_of_speech: "名詞・サ変動詞", meaning_ja: "新聞やウェブサイトに文章を載せること。")
        item.japanese_annotations = [
            .init(text: "掲載", tokens: [.init(surface: "掲載", reading: "けいさい", pos: "noun")]),
            .init(text: "美しい景色を見た。", tokens: [.init(surface: "美しい", reading: "うつくしい", pos: "adjective"), .init(surface: "景色", reading: "けしき", pos: "noun"), .init(surface: "を", pos: "particle"), .init(surface: "見た", reading: "みた", pos: "verb"), .init(surface: "。", pos: "other")]),
            .init(text: "求人情報をホームページに掲載する。", tokens: [.init(surface: "求人情報", reading: "きゅうじんじょうほう", pos: "noun"), .init(surface: "を", pos: "particle"), .init(surface: "ホームページ", pos: "noun"), .init(surface: "に", pos: "particle"), .init(surface: "掲載", reading: "けいさい", pos: "noun"), .init(surface: "する", pos: "verb"), .init(surface: "。", pos: "other")])
        ]
        return item
    }
}
#endif

#if DEBUG
extension DemoData {
    static let listeningFixture: [ListeningItem] = (0..<11).map { number in
        ListeningItem(id: "fixture-listening-\(number)", title: "基础训练", question: number == 0 ? "例" : "第 \(number + 1) 题",
                      explanation: "音频中说明已经去了，所以选择「行った」。", questionTypeId: "listening-basic-training",
                      choices: ["行った", "行っていない"], answerIndex: 0,
                      transcript: "昨日、図書館に行きました。", transcriptTranslation: "昨天去了图书馆。",
                      audioAssetId: "fixture-listening-audio", libraryNumber: number + 1,
                      audioFileName: "shinkanzen_chokai_n1_CD-A_013.mp3", audioSize: 0, createdAt: "2026-10-06T00:00:00Z")
    }
}
#endif

#if DEBUG
import SwiftUI
struct NativeVisualFixtures: Decodable {
    let schemaVersion:Int
    let fixtures:[Entry]
    struct Entry:Decodable {
        let id:String;let surface:String;var blockedReason:String?
        var question:SettingValue?
        func staleQuizSource() -> NativeQuestion? {
            guard case .object(var fields)=question else { return nil }
            fields["prompt"] = .string("当前源文本（不应显示）")
            return try? JSONDecoder().decode(NativeQuestion.self,from:JSONEncoder().encode(SettingValue.object(fields)))
        }
        func decoded<T:Decodable>(_ type:T.Type) throws -> T {
            guard let question else { throw APIError.invalidResponse }
            return try JSONDecoder().decode(type,from:JSONEncoder().encode(question))
        }
    }
    static func load() throws -> Self {
        guard let url=Bundle.main.url(forResource:"native-question-visual",withExtension:"json") else { throw APIError.invalidResponse }
        return try JSONDecoder().decode(Self.self,from:Data(contentsOf:url))
    }
    static var requestedID:String? { ProcessInfo.processInfo.arguments.first { $0.hasPrefix("--visual-type=") }.map { String($0.dropFirst("--visual-type=".count)) } }
}
struct NativeVisualFixtureView:View {
    let id:String
    @ViewBuilder var body:some View {
        if let fixture=try? NativeVisualFixtures.load().fixtures.first(where:{$0.id==id}) {
            if fixture.surface=="quiz",let q=try? fixture.decoded(NativeQuestion.self) {
                NativeQuizView(round:NativeRound(title:q.title,questions:[fixture.staleQuizSource() ?? q],view:"vocabulary"))
            } else if fixture.surface=="reading",let q=try? fixture.decoded(ReadingQuestion.self) {
                NavigationStack { ReadingPracticeView(question:q) }
            } else if fixture.surface=="listening",let q=try? fixture.decoded(ListeningItem.self) {
                NavigationStack { ListeningDetailView(group:.init(id:q.audioKey,questions:[q])) }
            } else { ContentUnavailableView("原生payload呈现尚未支持",systemImage:"exclamationmark.triangle",description:Text(fixture.blockedReason ?? id)) }
        } else { ContentUnavailableView("测试fixture读取失败",systemImage:"exclamationmark.triangle") }
    }
}
#endif
