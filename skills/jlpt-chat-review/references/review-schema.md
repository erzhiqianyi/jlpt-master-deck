# Field guide (schema v3)

The library is a relational database (`server/v3/schema.sql`, design in `docs/schema-v3-design.md`). This guide maps what the learner gives you to MCP tool inputs. The tool input schemas from `tools/list` are authoritative; this file explains intent.

Records are addressed by business codes, never internal ids:

| Prefix | Record |
|---|---|
| `WB` | wordbook |
| `W` / `G` / `N` | knowledge point: word / grammar / name |
| `QS` | question group |
| `QV` / `QG` / `QR` / `QL` | question: vocabulary / grammar / reading / listening |
| `MT` | material (passage, notice, image, audio) |
| `DP` / `TP` / `MX` | practice set: daily / topic or mixed / mock exam |
| `AT` | practice record (attempt) |
| `DR` | practice draft |
| `IN` | inbox capture |
| `TK` | study plan task |
| `RC` | speaking recording |

## Knowledge point (`create_knowledge_point`, `update_knowledge_point`)

```json
{
  "kind": "word",
  "wordbook": "WB1",
  "expression": "捉える",
  "reading": "とらえる",
  "pos": "verb_2",
  "transitivity": "transitive",
  "jlptLevel": "N2",
  "meaning": "抓住；把握（要点、特征）",
  "meaningJa": "しっかりとつかむ。物事の本質や要点を把握する。",
  "paraphrase": "把握する",
  "examples": [
    { "sentence": "彼は問題の本質を的確に捉えている。", "translation": "他准确地把握了问题的本质。" },
    { "sentence": "写真は子どもの笑顔をうまく捉えた。", "translation": "照片很好地捕捉到了孩子的笑容。" }
  ],
  "memoryPoints": ["捉える＝抽象的に「つかむ」", "捕らえる＝犯人・動物を物理的に捕まえる"],
  "patterns": [{ "pattern": "～を捉える", "example": "特徴を捉える", "meaning": "抓住特征" }],
  "comparisons": [{ "target": "捕らえる", "kind": "synonym", "difference": "捕らえる 用于抓获犯人、猎物等具体对象。" }],
  "notes": [{ "kind": "exam_tip", "body": "N2 表記题常考 捉える／捕らえる 的区别。" }],
  "tags": ["动词"],
  "sourceSentence": "要点を捉えて話す。",
  "questionKinds": ["vocabulary-kanji-reading", "vocabulary-context"],
  "language": "zh-Hans"
}
```

- `kind`: `word`, `grammar` or `name`. It cannot be changed later.
- `pos` (words only): `verb_1` 五段, `verb_2` 一段, `verb_3_suru`, `verb_3_kuru`, `i_adjective`, `na_adjective`, `noun`, `adverb`, `conjunction`, `adnominal`, `interjection`, `prefix`, `suffix`, `phrase`, `idiom`. Conjugations are generated from it and returned by `get_knowledge_point`.
- `isSuruNoun`: a noun that takes する. `baseForm`: the dictionary form when it differs from `expression`.
- `jlptLevel`: `"N2"` or `{ "min": "N2", "max": "N1" }`. Omit it when uncertain.
- `register` (mainly grammar): `written`, `spoken`, `formal`, `both`.
- Learner-language fields (`meaning`, `explanation`, `examples[].translation`, `examples[].analysis`, `patterns[].meaning`, `comparisons[].difference`, `notes[].body`, `memoryPoints`) are written in `language`. Writing another language later keeps the existing ones.
- Lists replace by position on update. To change one example, read the point, edit the list and send it back.
- `relatedWords`, `alternateForms`: Japanese spellings. `sources`: dictionaries, official pages or textbook chapters (`{ "title", "url" }`).
- `compileNote`: internal note on how you compiled the item; it is not shown to learners.

Memory images: write the concept and prompt with `set_memory_image`. The learner, or an image tool, supplies the picture later.

## Question group (`validate_question`, `create_question_group`)

One group is one 大問: a single vocabulary or grammar question, or one passage or audio with its questions.

```json
{
  "typeId": "vocabulary-kanji-reading",
  "level": "N2",
  "instruction": "＿＿＿の言葉の読み方として最もよいものを、１・２・３・４から一つ選びなさい。",
  "questions": [{
    "prompt": "彼は問題の本質を的確に捉えている。",
    "marks": [{ "kind": "target", "start": 11, "end": 14 }],
    "translation": "他准确地把握了问题的本质。",
    "options": [
      { "text": "とらえて", "correct": true, "analysis": "捉える 读作 とらえる。" },
      { "text": "おさえて", "correct": false, "distractorType": "语义相近", "analysis": "押さえる 也有“把握”的意思，但汉字不同。" },
      { "text": "かかえて", "correct": false, "distractorType": "形式相近", "analysis": "抱える 读作 かかえる。" },
      { "text": "つかまえて", "correct": false, "distractorType": "语义相近", "analysis": "捕まえる 指抓住具体对象。" }
    ],
    "explanation": [{ "kind": "basis", "body": "「捉」的训读是 とら(える)。" }],
    "knowledge": [{ "code": "W12", "relation": "target" }]
  }]
}
```

- `typeId` comes from `get_question_types`, which also gives each type's levels, required materials, marking style and rules.
- `marks` use UTF-16 offsets into the prompt (JavaScript `text.slice(start, end)`). Underline types use `target`, blank types use `blank`, and 文の組み立て uses one `slot` per blank plus exactly one `star_slot`.
- Exactly one option is `correct`. Options keep a fixed `id` once saved; send the ids back when editing with `update_question_group`.
- `explanation` sections: `basis` (required for most types), `step`, `full_answer`, `tip`, `objective`.
- Reading and listening: put the passage, notice or audio in `materials` (`role` main / passage_a / passage_b / notice / scene_image / audio). Upload files with `upload_media` and reuse existing materials by code. `evidence[].quote` must be verbatim.
- New groups are `needs_review`. A second pass (`get_question_review_context` → `submit_question_review` with pass / revise / reject) makes them `ready`.
- Duplicates are detected by type and prompt. When one is reported, edit the existing group instead.

## Inbox (`list_learning_captures`, `update_learning_capture_status`)

Process `status: "inbox"` page by page (`limit`, then `cursor` = previous `nextCursor`), and `count_learning_captures` for the total. Each entry has `body`, `category` (word, grammar, sentence, listening, reading, unsure), `context` and the target `wordbook`. Mark an entry `processed` only after the result was saved.

## What is gone

The old monthly archives (`public/data/review-data/YYYY/MM.json`), decks (`n1_vocab`, `grammar_expression`, `name_reading`), `ruby_terms` / `japanese_annotations`, `inflection_class`, hand-written `conjugations`, `*_zh` fields, `level_confidence` and review counts stored with content are not part of v3. Do not write them anywhere.
