import Foundation

/// Schema v3 API → the models the views already use.
///
/// `GET /api/v3/sync` returns the learner's records by business code (W12, QV15, DP3). They become the
/// ids of the cached items, questions and packs, so uploads can address them directly. Each complete
/// traversal replaces the downloaded part of the offline snapshot; queued local work is kept by
/// `LocalStudyData.preservingLocalWork`.
enum V3Bridge {
    typealias JSON = [String: Any]

    // MARK: Small JSON helpers

    /// A plain string, or the `text` of a v3 picked text (`{text, language, isFallback, …}`).
    static func text(_ value: Any?) -> String? {
        if let string = value as? String { return string.isEmpty ? nil : string }
        if let object = value as? JSON, let string = object["text"] as? String { return string.isEmpty ? nil : string }
        return nil
    }
    static func string(_ value: Any?) -> String { text(value) ?? "" }
    static func int(_ value: Any?) -> Int? { (value as? NSNumber)?.intValue }
    static func array(_ value: Any?) -> [JSON] { value as? [JSON] ?? [] }
    /// Removes nil (including Optionals boxed in `Any`) and NSNull, recursively. JSONSerialization
    /// raises an Objective-C exception for a boxed nil, so everything passes through here first.
    static func clean(_ value: Any) -> Any? {
        let mirror = Mirror(reflecting: value)
        if mirror.displayStyle == .optional {
            guard let inner = mirror.children.first?.value else { return nil }
            return clean(inner)
        }
        if value is NSNull { return nil }
        if let dictionary = value as? [String: Any] { return dictionary.compactMapValues { clean($0) } }
        if let list = value as? [Any] { return list.compactMap { clean($0) } }
        return value
    }
    /// Decodes a plain JSON object into a Codable model (missing values become nil).
    static func decode<T: Decodable>(_ type: T.Type, _ object: Any) throws -> T {
        let cleaned = clean(object) ?? [String: Any]()
        guard JSONSerialization.isValidJSONObject(cleaned) else { throw APIError.invalidResponse }
        return try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: cleaned))
    }
    static func object(_ data: Data) throws -> JSON {
        guard let value = try JSONSerialization.jsonObject(with: data) as? JSON else { throw APIError.invalidResponse }
        return value
    }

    // MARK: Download

    static func download(api: APIClient, progress: (@MainActor @Sendable (Int, Int) -> Void)? = nil) async throws -> LocalStudyData {
        var records: [JSON] = []
        var cursor: String?
        repeat {
            try Task.checkCancellation()
            // Cursors are base64url, which is safe inside a query string.
            let page = try object(try await api.data("api/v3/sync?limit=100" + (cursor.map { "&cursor=\($0)" } ?? "")))
            guard page["format"] as? String == "jlpt-v3-sync" else { throw APIError.invalidResponse }
            records += array(page["records"])
            cursor = page["nextCursor"] as? String
            await progress?(records.count, cursor == nil ? records.count : records.count + 100)
        } while cursor != nil
        var data = try snapshot(records)
        data.shares = try await shares(api: api)
        data.lastSync = .now
        data.hasPracticeCache = true; data.hasListeningCache = true
        return data
    }

    static func snapshot(_ records: [JSON]) throws -> LocalStudyData {
        var data = LocalStudyData()
        var groups: [JSON] = []
        var sets: [JSON] = []
        for record in records {
            let value = record["value"]
            switch record["collection"] as? String {
            case "settings": data.state.settings = legacySettings(value as? JSON ?? [:])
            case "wordbooks":
                // One v3 wordbook may hold words, grammar and names.
                data.wordbooks = array(value).map { NativeWordbook(id: string($0["code"]), title: string($0["title"]), deck: "all") }
            case "plan": data.plan = try plan(value as? JSON ?? [:])
            case "inbox": data.captures = array(value).map(capture)
            case "drafts":
                data.drafts = array(value).map { PracticeDraft(id: string($0["code"]), title: text($0["title"]) ?? string($0["code"]), status: string($0["status"]),
                                                               created_at: $0["createdAt"] as? String, updated_at: $0["updatedAt"] as? String) }
            case "attempts": data.state.attemptHistory = try array(value).map(attempt)
            case "ratings":
                data.state.cardReviews = array(value).map { CardReview(eventId: string($0["eventId"]), itemId: string($0["code"]), rating: string($0["rating"]),
                                                                       reviewedAt: string($0["reviewedAt"]), source: $0["source"] as? String) }
            case "knowledge":
                guard let point = value as? JSON else { continue }
                let item = try decode(StudyItem.self, studyItem(point))
                data.items.append(item)
                if let review = point["review"] as? JSON { data.state.progress[item.id] = try progressEntry(review) }
            case "questionGroups": if let group = value as? JSON { groups.append(group) }
            case "practiceSets": if let set = value as? JSON { sets.append(set) }
            default: continue
            }
        }
        data.state.cardReviews?.sort { $0.reviewedAt < $1.reviewedAt }

        // Questions: every question of every group, keyed by its code.
        var choiceQuestions: [String: NativeQuestion] = [:]
        var optionIds: [String: [String: Int]] = [:]
        for group in groups {
            let module = group["module"] as? String
            for question in array(group["questions"]) {
                let code = string(question["code"])
                optionIds[code] = Dictionary(array(question["options"]).compactMap { option in
                    guard let id = int(option["id"]), let text = option["text"] as? String else { return nil }
                    return (text, id)
                }, uniquingKeysWith: { first, _ in first })
                if module == "reading" {
                    if group["status"] as? String == "ready", let value = try? decode(ReadingQuestion.self, readingQuestion(group: group, question: question)) { data.reading.append(value) }
                } else if module == "listening" {
                    if group["status"] as? String == "ready", let value = try? decode(ListeningItem.self, listeningItem(group: group, question: question)) { data.listening.append(value) }
                } else if let native = try? decode(NativeQuestion.self, nativeQuestion(group: group, question: question)) {
                    choiceQuestions[code] = native
                }
            }
        }
        data.optionIds = optionIds
        // The practice pool only uses questions that passed review.
        let ready = Set(groups.filter { $0["status"] as? String == "ready" }.map { string($0["code"]) })
        data.bank = groups.filter { ready.contains(string($0["code"])) }
            .flatMap { array($0["questions"]).compactMap { choiceQuestions[string($0["code"])] } }
            .filter(\.isUsable)
        data.packs = sets.compactMap { pack($0, questions: choiceQuestions) }.sorted { $0.date > $1.date }
        return data
    }

    // MARK: Records

    static let posLabels = ["verb_1": "五段動詞", "verb_2": "一段動詞", "verb_3_suru": "サ変動詞", "verb_3_kuru": "カ変動詞", "i_adjective": "イ形容詞",
                            "na_adjective": "ナ形容詞", "noun": "名詞", "adverb": "副詞", "conjunction": "接続詞", "adnominal": "連体詞", "interjection": "感動詞",
                            "prefix": "接頭辞", "suffix": "接尾辞", "phrase": "連語", "idiom": "慣用句"]

    static func level(_ value: Any?) -> String? {
        if let single = value as? String { return single }
        guard let range = value as? JSON, let min = range["min"] as? String, let max = range["max"] as? String else { return nil }
        return min == max ? min : "\(min)-\(max)"
    }

    /// Knowledge point → the legacy item fields the cards and detail pages read.
    static func studyItem(_ point: JSON) -> JSON {
        let kind = point["kind"] as? String
        var item: JSON = [:]
        item["id"] = string(point["code"])
        item["reference"] = string(point["code"])
        item["deck"] = kind == "grammar" ? "grammar_expression" : kind == "name" ? "name_reading" : "n1_vocab"
        item["original"] = string(point["expression"])
        item["reading"] = point["reading"] as? String
        item["romaji"] = point["romaji"] as? String
        item["meaning_zh"] = text(point["meaning"])
        item["meaning_ja"] = point["meaningJa"] as? String
        item["explanation_zh"] = text(point["explanation"])
        item["paraphrase_ja"] = point["paraphrase"] as? String
        item["jlpt_level"] = level(point["jlptLevel"])
        item["part_of_speech"] = (point["pos"] as? String).map { posLabels[$0] ?? $0 }
        item["wordbook_id"] = point["wordbook"] as? String
        item["tags"] = point["tags"] as? [String] ?? []
        item["question_kinds"] = point["questionKinds"] as? [String] ?? []
        let memory: [String] = (point["memoryPoints"] as? [Any] ?? []).compactMap { text($0) }
        item["core_memory"] = memory
        var examples: [JSON] = []
        for example in array(point["examples"]) {
            var value: JSON = ["ja": string(example["sentence"])]
            value["zh"] = text(example["translation"])
            examples.append(value)
        }
        item["examples"] = examples
        var patterns: [[String: String]] = []
        for pattern in array(point["patterns"]) {
            var value = ["pattern": string(pattern["pattern"])]
            if let connection = text(pattern["connection"]) { value["connection_zh"] = connection }
            if let meaning = text(pattern["meaning"]) { value["meaning_zh"] = meaning }
            if let example = text(pattern["example"]) { value["example"] = example }
            patterns.append(value)
        }
        item["patterns"] = patterns
        var comparisons: [[String: String]] = []
        for comparison in array(point["comparisons"]) {
            comparisons.append(["target": string(comparison["target"]), "difference_zh": string(comparison["difference"]), "kind": string(comparison["kind"])])
        }
        item["comparisons"] = comparisons
        var points: [[String: String]] = []
        for note in array(point["notes"]) { points.append(["label": text(note["title"]) ?? "", "detail_zh": string(note["body"])]) }
        item["points"] = points
        var conjugations: [[String: String]] = []
        for form in array(point["conjugations"]) {
            conjugations.append(["kind": string(form["form"]), "form": string(form["written"]), "reading": string(form["reading"])])
        }
        item["conjugations"] = conjugations
        if let sentence = point["sourceSentence"] as? String { item["source"] = ["sentence": sentence] }
        if let register = point["register"] as? String { item["register"] = ["level": register] }
        if let image = point["memoryImage"] as? JSON, let media = int(image["media"]) {
            item["images"] = [["id": String(media), "caption": text(image["caption"]) ?? ""]]
        }
        var localized: JSON = [:]
        localized["language"] = point["language"] as? String
        localized["meaning"] = point["meaning"] as? JSON
        localized["explanation"] = point["explanation"] as? JSON
        item["localized"] = localized
        return item
    }

    static func progressEntry(_ review: JSON) throws -> ProgressEntry {
        var fields: JSON = ["correct": 0, "wrong": 0, "status": review["status"] as? String ?? "new"]
        fields["firstSeenAt"] = review["firstSeenAt"]
        fields["lastReviewedAt"] = review["lastReviewedAt"]
        fields["reviewCount"] = review["reviewCount"]
        fields["ease"] = review["ease"]
        fields["intervalDays"] = review["intervalDays"]
        fields["nextReviewAt"] = review["dueAt"]
        return try decode(ProgressEntry.self, fields)
    }

    /// v3 question type ids ↔ the kinds the native practice screens know.
    static let kinds = ["vocabulary-kanji-reading": "kanji_to_kana", "vocabulary-orthography": "kana_to_kanji", "vocabulary-word-formation": "word_formation",
                        "vocabulary-context": "moji_goi", "vocabulary-paraphrase": "meaning", "vocabulary-usage": "usage"]
    static func kind(_ typeId: String) -> String { kinds[typeId] ?? (typeId.hasPrefix("grammar") ? "grammar" : typeId) }

    /// Text between the first target mark's UTF-16 offsets.
    static func target(_ prompt: String, _ question: JSON) -> String? {
        guard let mark = array(question["marks"]).first(where: { ["target", "blank"].contains($0["kind"] as? String) }),
              let start = int(mark["start"]), let end = int(mark["end"]) else { return nil }
        let utf16 = prompt as NSString
        guard start >= 0, end > start, end <= utf16.length else { return nil }
        return utf16.substring(with: NSRange(location: start, length: end - start))
    }
    static func explanation(_ question: JSON) -> String {
        array(question["explanation"]).compactMap { section in
            guard let body = text(section["body"]) else { return nil }
            return text(section["title"]).map { "\($0)\n\(body)" } ?? body
        }.joined(separator: "\n\n")
    }

    static func nativeQuestion(group: JSON, question: JSON) -> JSON {
        let options = array(question["options"])
        let prompt = string(question["prompt"])
        let typeId = string(group["typeId"])
        var value: JSON = [
            "id": string(question["code"]),
            "itemId": string(array(question["knowledge"]).first?["code"]),
            "kind": kind(typeId), "questionTypeId": typeId,
            "title": text(group["instruction"]) ?? typeId,
            "prompt": prompt,
            "choices": options.map { string($0["text"]) },
            "answer": string(options.first { $0["correct"] as? Bool == true }?["text"]),
            "correctReason": explanation(question),
            "choiceAnalysis": options.map { option -> JSON in
                ["choice": string(option["text"]), "correct": option["correct"] as? Bool == true, "explanation": text(option["analysis"]) ?? ""]
            },
        ]
        value["promptTarget"] = target(prompt, question)
        value["instruction"] = text(group["instruction"])
        value["translationZh"] = text(question["translation"])
        value["context"] = text(group["context"])
        return value.compactMapValues { $0 is NSNull ? nil : $0 }
    }

    static func readingQuestion(group: JSON, question: JSON) -> JSON {
        let options = array(question["options"])
        let passage = array(group["materials"]).compactMap { text($0["body"]) }.joined(separator: "\n\n")
        return [
            "id": string(question["code"]), "title": text(array(group["materials"]).first?["title"]) ?? string(group["code"]),
            "passage": passage, "question": string(question["prompt"]),
            "choices": options.map { string($0["text"]) },
            "answerIndex": options.firstIndex { $0["correct"] as? Bool == true } ?? 0,
            "explanation": explanation(question), "questionTypeId": string(group["typeId"]),
            "tags": question["tags"] as? [String] ?? [],
        ]
    }

    static func listeningItem(group: JSON, question: JSON) -> JSON {
        let options = array(question["options"])
        let audio = array(group["materials"]).first { $0["kind"] as? String == "audio" }
        let mediaId = int(audio?["mediaId"]) ?? int(question["promptMediaId"])
        var value: JSON = [
            "id": string(question["code"]), "title": text(audio?["title"]) ?? string(group["code"]),
            "question": string(question["prompt"]), "explanation": explanation(question),
            "questionTypeId": string(group["typeId"]),
            "choices": options.map { string($0["text"]) },
            "answerIndex": options.firstIndex { $0["correct"] as? Bool == true } ?? -1,
            "audioFileName": text(audio?["title"]) ?? string(group["code"]),
            "audioSize": 0, "createdAt": string(group["createdAt"]),
            "choiceDetails": options.map { option -> JSON in
                var detail: JSON = [:]
                detail["translation"] = text(option["translation"])
                detail["explanation"] = text(option["analysis"])
                return detail
            },
        ]
        value["audioAssetId"] = mediaId.map(String.init)
        value["transcript"] = text(audio?["transcript"])
        value["transcriptTranslation"] = text(audio?["transcriptTranslation"])
        value["reference"] = string(group["code"])
        return value.compactMapValues { $0 is NSNull ? nil : $0 }
    }

    static func pack(_ set: JSON, questions: [String: NativeQuestion]) -> NativePack? {
        let entries = array(set["sections"]).flatMap { array($0["entries"]) } + array(set["entries"])
        let list = entries.compactMap { questions[string($0["question"])] }
        guard !list.isEmpty else { return nil }
        let date = (set["date"] as? String) ?? String(string(set["createdAt"]).prefix(10))
        return NativePack(id: string(set["code"]), title: text(set["title"]) ?? string(set["code"]), date: date, questions: list,
                          minutes: int(set["minutes"]), version: int(set["version"]))
    }

    static func capture(_ entry: JSON) -> Capture {
        Capture(id: string(entry["code"]), body: string(entry["body"]), category: string(entry["category"]), context: string(entry["context"]),
                createdAt: string(entry["createdAt"]), status: entry["status"] as? String)
    }

    static func plan(_ value: JSON) throws -> StudyPlan {
        let source = value["profile"] as? JSON ?? [:]
        var profile: JSON = [:]
        profile["examName"] = source["examName"]
        profile["examDate"] = source["examDate"]
        profile["level"] = source["level"]
        let tasks = array(value["tasks"]).map { task -> JSON in
            ["id": string(task["code"]), "date": string(task["date"]), "title": string(task["title"]), "module": string(task["module"]),
             "minutes": int(task["minutes"]) ?? 0, "status": string(task["status"])]
        }
        let fields: JSON = ["profile": profile, "tasks": tasks, "dailySummaries": [JSON]()]
        return try decode(StudyPlan.self, fields)
    }

    static let attemptViews = ["daily": "daily-practice", "mock": "mock-exams"]
    /// v3 practice records keep their answers on the server; history shows their totals.
    static func attempt(_ entry: JSON) throws -> NativeAttempt {
        let summary = entry["summary"] as? JSON ?? [:]
        let total = int(summary["total"]) ?? 0, scored = int(summary["scored"]) ?? 0, correct = int(summary["correct"]) ?? 0
        let kind = string(entry["kind"])
        let accuracy: Double = scored == 0 ? 0 : Double(correct) / Double(scored)
        let totals: JSON = ["total": total, "correct": correct, "wrong": max(0, scored - correct), "accuracy": accuracy, "elapsedMs": int(summary["elapsedMs"]) ?? 0]
        var value: JSON = [
            "id": string(entry["code"]), "startedAt": string(entry["startedAt"]),
            "view": attemptViews[kind] ?? kind, "deck": "all", "questionIds": [String](), "answers": [JSON](),
            "summary": totals,
        ]
        value["title"] = text(entry["title"])
        value["practiceId"] = entry["practice"] as? String
        value["completedAt"] = entry["completedAt"] as? String
        return try decode(NativeAttempt.self, value.compactMapValues { $0 is NSNull ? nil : $0 })
    }

    // MARK: Discover

    static func share(_ entry: JSON) -> DiscoveryShare {
        let kind = string(entry["kind"])
        let count = kind == "wordbook" ? (int(entry["knowledgeCount"]) ?? 0) : (int(entry["questionCount"]) ?? 0)
        return DiscoveryShare(id: string(entry["id"]), title: string(entry["title"]), kind: kind, description: string(entry["description"]),
                              count: count, mine: entry["mine"] as? Bool)
    }
    static func shares(api: APIClient) async throws -> [DiscoveryShare] {
        let all = array(try object(try await api.data("api/v3/market"))["shares"])
        let mine = array(try object(try await api.data("api/v3/market?mine=1"))["shares"])
        var seen = Set<String>()
        return (mine.map { entry -> DiscoveryShare in var value = share(entry); value.mine = true; return value } + all.map(share)).filter { seen.insert($0.id).inserted }
    }
    /// A `jlpt-share` v2 package (knowledge points and question groups) as the preview the views show.
    static func package(_ share: JSON) throws -> DiscoveryPackage {
        let pkg = share["package"] as? JSON ?? [:]
        let questions = array(pkg["groups"]).flatMap { group in
            array(group["questions"]).map { question -> JSON in
                let options = array(question["options"])
                var value: JSON = [
                    "kind": kind(string(group["typeId"])), "prompt": string(question["prompt"]),
                    "choices": options.map { string($0["text"]) },
                    "answer": string(options.first { $0["correct"] as? Bool == true }?["text"]),
                    "correctReason": explanation(question),
                ]
                value["instruction"] = text(group["instruction"])
                value["translationZh"] = text(question["translation"])
                return value.compactMapValues { $0 is NSNull ? nil : $0 }
            }
        }
        let items = array(pkg["knowledge"]).map { point -> JSON in
            var item: JSON = ["original": string(point["expression"])]
            item["reading"] = text(point["reading"])
            item["meaning_zh"] = text(point["meaning"])
            return item
        }
        let fields: JSON = ["kind": string(pkg["kind"]), "title": string(pkg["title"]), "items": items, "questions": questions]
        return try decode(DiscoveryPackage.self, fields)
    }
    static func shareDetail(api: APIClient, id: String) async throws -> DiscoveryPackage {
        try package(try object(try await api.data("api/v3/market/\(id)"))["share"] as? JSON ?? [:])
    }

    // MARK: Drafts

    /// A whole question group by its code (QS4). Draft and practice entries name their group.
    static func group(api: APIClient, code: String) async throws -> JSON? {
        try object(try await api.data("api/v3/question-groups/\(code)"))["group"] as? JSON
    }

    /// A v3 draft with its questions resolved from the question bank, in the shape the confirmation view reads.
    static func topicDraft(api: APIClient, code: String) async throws -> NativeTopicDraft {
        let draft = try object(try await api.data("api/v3/drafts/\(code)"))["draft"] as? JSON ?? [:]
        var groups: [String: JSON] = [:]
        func resolve(_ entries: [JSON]) async throws -> [JSON] {
            var result: [JSON] = []
            for entry in entries {
                let questionCode = string(entry["question"])
                let groupCode = string(entry["group"])
                if groups[groupCode] == nil { groups[groupCode] = try await Self.group(api: api, code: groupCode) }
                guard let group = groups[groupCode], let question = array(group["questions"]).first(where: { string($0["code"]) == questionCode }) else { continue }
                result.append(nativeQuestion(group: group, question: question))
            }
            return result
        }
        var sections: [JSON] = []
        for section in array(draft["sections"]) {
            let questions = try await resolve(array(section["questions"]))
            let entry: JSON = ["title": text(section["title"]) ?? "", "body": text(section["body"]) ?? "", "questions": questions]
            sections.append(entry)
        }
        let quiz = try await resolve(array(draft["quiz"]))
        let generated = try await resolve(array(draft["generated"]))
        // The view treats approved and archived drafts as confirmed.
        let content: JSON = ["sections": sections, "quiz": quiz, "practice_questions": generated]
        let fields: JSON = [
            "id": string(draft["code"]), "title": text(draft["title"]) ?? string(draft["code"]), "status": string(draft["status"]),
            "content": content, "updated_at": string(draft["updatedAt"]), "created_at": string(draft["createdAt"]),
        ]
        return try decode(NativeTopicDraft.self, fields)
    }
    /// Publishes a confirmed draft as today's practice and returns it as a native pack.
    static func publishDraft(api: APIClient, code: String, date: String, title: String) async throws -> NativePack {
        struct Input: Encodable { let date: String; let title: String }
        let result = try object(try await api.data("api/v3/drafts/\(code)/publish", method: "POST", body: JSONEncoder().encode(Input(date: date, title: title))))
        let practice = string(result["practice"])
        let set = try object(try await api.data("api/v3/practice-sets/\(practice)"))["practice"] as? JSON ?? [:]
        var questions: [String: NativeQuestion] = [:]
        var groups: [String: JSON] = [:]
        for entry in array(set["sections"]).flatMap({ array($0["entries"]) }) {
            let code = string(entry["question"])
            let groupCode = string(entry["group"])
            if groups[groupCode] == nil { groups[groupCode] = try await Self.group(api: api, code: groupCode) }
            guard let group = groups[groupCode], let question = array(group["questions"]).first(where: { string($0["code"]) == code }) else { continue }
            questions[code] = try decode(NativeQuestion.self, nativeQuestion(group: group, question: question))
        }
        guard let practicePack = Self.pack(set, questions: questions) else { throw IdentityError.message("练习里没有可用的题目。") }
        return practicePack
    }

    // MARK: Settings

    /// v3 settings → the keys the views read.
    static func legacySettings(_ v3: JSON) -> [String: SettingValue] {
        var json: JSON = [:]
        json["locale"] = v3["uiLanguage"]
        for key in ["explanationLanguage", "fontScale", "feedbackMode", "practiceNavigation", "showReviewRuby", "showExplanationRuby", "showRomaji"] { json[key] = v3[key] }
        json["practiceAutoAdvanceSeconds"] = v3["autoAdvanceSeconds"]
        let kinds = (v3["questionKinds"] as? [String] ?? []).compactMap { Self.kinds[$0] }
        json["jlptVocabularyQuestionKinds"] = kinds
        json["requireJlptVocabularyQuestions"] = !kinds.isEmpty
        let styles = (v3["posStyles"] as? [String: JSON] ?? [:]).mapValues { style -> JSON in
            ["mode": style["mode"] as? String ?? "underline", "color": style["color"] as? String ?? "#326B9C"]
        }
        let display: JSON = ["segmented": v3["segmentedDisplay"] as? Bool ?? false, "styles": styles]
        json["japaneseDisplay"] = display
        if let speech = v3["speech"] as? JSON {
            json["speech"] = speech
            json["ttsProvider"] = speech["provider"]
        }
        json["dailyPracticeSources"] = v3["dailySource"]
        json = json.compactMapValues { $0 is NSNull ? nil : $0 }
        return (try? decode([String: SettingValue].self, json)) ?? [:]
    }

    /// The server's current settings, in the keys the views read.
    static func latestSettings(api: APIClient) async throws -> [String: SettingValue] {
        legacySettings(try object(try await api.data("api/v3/settings"))["settings"] as? JSON ?? [:])
    }

    /// The legacy keys a view changed → a v3 settings patch. Keys v3 does not store are dropped.
    static func settingsPatch(_ changes: [String: SettingValue]) throws -> Data {
        let legacy = try JSONSerialization.jsonObject(with: JSONEncoder().encode(changes)) as? JSON ?? [:]
        var patch: JSON = [:]
        if let locale = legacy["locale"] { patch["uiLanguage"] = locale }
        for key in ["explanationLanguage", "fontScale", "feedbackMode", "practiceNavigation", "showReviewRuby", "showExplanationRuby", "showRomaji"] where legacy[key] != nil { patch[key] = legacy[key] }
        if let seconds = legacy["practiceAutoAdvanceSeconds"] { patch["autoAdvanceSeconds"] = seconds }
        if let kinds = legacy["jlptVocabularyQuestionKinds"] as? [String] {
            let reverse = Dictionary(Self.kinds.map { ($1, $0) }, uniquingKeysWith: { first, _ in first })
            patch["questionKinds"] = kinds.compactMap { reverse[$0] }
        } else if let required = legacy["requireJlptVocabularyQuestions"] as? Bool {
            patch["questionKinds"] = required ? Array(Self.kinds.keys).sorted() : []
        }
        if let display = legacy["japaneseDisplay"] as? JSON {
            if let segmented = display["segmented"] { patch["segmentedDisplay"] = segmented }
            if let styles = display["styles"] { patch["posStyles"] = styles }
        }
        if var speech = legacy["speech"] as? JSON {
            if let provider = legacy["ttsProvider"] { speech["provider"] = provider }
            patch["speech"] = speech
        } else if let provider = legacy["ttsProvider"] {
            let speech: JSON = ["provider": provider]
            patch["speech"] = speech
        }
        if let sources = legacy["dailyPracticeSources"] { patch["dailySource"] = sources }
        return try JSONSerialization.data(withJSONObject: patch)
    }

    // MARK: Uploads

    /// A queued memory rating. The server stores each event id once, so retries are safe.
    static func uploadRating(_ input: AnswerInput, api: APIClient) async throws {
        struct Body: Encodable { let code: String; let rating: String; let eventId: String; let reviewedAt: String?; let source: String }
        _ = try await api.data("api/v3/cards/ratings", method: "POST", body: JSONEncoder().encode(
            Body(code: input.itemId, rating: input.selected, eventId: input.reviewEventId ?? input.syncEventId ?? "card:\(input.itemId):\(input.reviewedAt ?? ""):\(input.selected)",
                 reviewedAt: input.reviewedAt ?? input.progressEntry.lastReviewedAt, source: "ios")))
    }

    /// Starts the server practice record that queued answers of one native round go into.
    static func startAttempt(questions: [String], title: String?, api: APIClient) async throws -> String {
        struct Body: Encodable { let questions: [String]; let title: String? }
        let result = try object(try await api.data("api/v3/attempts", method: "POST", body: JSONEncoder().encode(Body(questions: questions, title: title))))
        guard let code = (result["attempt"] as? JSON)?["code"] as? String else { throw APIError.invalidResponse }
        return code
    }

    /// One queued answer. A repeated event in the same practice record counts once.
    static func uploadAnswer(_ input: AnswerInput, attempt: String, optionId: Int?, api: APIClient) async throws {
        struct Body: Encodable {
            let question: String; let selectedOptionId: Int?; let answerText: String?
            let eventId: String; let answeredAt: String?; let source: String
        }
        let body = Body(question: input.questionId, selectedOptionId: optionId, answerText: optionId == nil ? input.selected : nil,
                        eventId: input.syncEventId ?? UUID().uuidString, answeredAt: input.progressEntry.lastReviewedAt, source: "ios")
        do { _ = try await api.data("api/v3/attempts/\(attempt)/answers", method: "POST", body: JSONEncoder().encode(body)) }
        catch APIError.http(409, let message) where message.contains("已用于另一次作答") { return } // already stored earlier
    }

    static func completeAttempt(_ attempt: String, api: APIClient) async throws {
        do { _ = try await api.data("api/v3/attempts/\(attempt)/complete", method: "POST", body: Data("{}".utf8)) }
        catch APIError.http(409, _) { return } // already complete
    }

    /// v3 question codes look like QV15 / QG3 / QR2 / QL4.
    static func isQuestionCode(_ value: String) -> Bool { value.range(of: "^Q[VGRL][0-9]+$", options: .regularExpression) != nil }
}
