# Review Data Schema

The website reads monthly archive files:

```text
public/data/review-data/YYYY/MM.json
```

Top-level shape:

```json
{
  "generated_at": "2026-08-27T20:20:00+09:00",
  "archive_month": "2026/08",
  "items": []
}
```

Each item:

```json
{
  "id": "n1-vocab-001",
  "input_at": "2026-08-27T20:20:00+09:00",
  "deck": "n1_vocab",
  "type": "word",
  "jlpt_level": "N1",
  "original": "測定",
  "reading": "そくてい",
  "meaning_ja": "一定の方法や器具を使って、数値を正確に調べること。",
  "paraphrase_ja": "数値を測る",
  "question_kinds": ["meaning"],
  "question_distractors": {
    "kanji_to_kana": ["そってい", "そくじょう", "しょくてい"]
  },
  "ruby_terms": [
    {
      "text": "測定",
      "reading": "そくてい"
    }
  ],
  "meaning_zh": "测定、测量，用一定方法或器具测出数值。",
  "core_memory": "按标准、用仪器把客观数据测出来。",
  "localizations": {
    "en": {
      "meaning": "Measurement; determining a numeric value with a method or instrument.",
      "core_memory": "Measure objective data by a standard method.",
      "explanation": "Use it for measurable quantities such as temperature, blood pressure, concentration, or speed."
    },
    "ja": {
      "meaning": "一定の方法や器具で数値を調べること。",
      "core_memory": "基準や器具を使って客観的な数値を出す。",
      "explanation": "温度・血圧・濃度・速度など、数値化できる対象で使いやすい。"
    }
  },
  "part_of_speech": "名词・サ变动词",
  "patterns": [
    { "pattern": "血圧を測定する", "meaning_zh": "测量血压" },
    { "pattern": "測定結果", "meaning_zh": "测定结果" }
  ],
  "examples": [
    {
      "ja": "室内の温度を測定した。",
      "ruby": [
        { "text": "室内", "reading": "しつない" },
        { "text": "温度", "reading": "おんど" },
        { "text": "測定", "reading": "そくてい" }
      ],
      "zh": "测定了室内温度。"
    }
  ],
  "comparisons": [
    {
      "target": "測る",
      "difference_zh": "日常说“量一下”；測定する更正式、客观。"
    }
  ],
  "explanation_zh": "看到温度、血压、浓度、速度等可数值化对象时，理解为按标准测出数值。",
  "tags": ["漢語", "正式語", "技术"]
}
```

## Decks

- `n1_vocab`: ordinary JLPT vocabulary.
- `grammar_expression`: expressions, forms, and grammar-like vocabulary.
- `name_reading`: Japanese name or place-name readings.

## Types

Recommended values:

- `word`
- `proper_name`
- `expression`
- `verb_form`
- `question`

## Required Fields

- `id`
- `input_at`
- `deck`
- `type`
- `original`
- `meaning_zh`
- `core_memory`

## Optional But Useful Fields

`original` is the canonical dictionary form or standard spelling used throughout the app. Preserve a learner-provided inflected or nonstandard surface form in the relevant source sentence or source metadata instead of adding a separate `normalized` attribute.

- `reading`
- `meaning_ja` for the Japanese dictionary-style definition shown on the reading page
- `paraphrase_ja` for the Japanese answer used by `meaning` / `言い換え類義`
- Keep those two fields semantically distinct: `meaning_ja` explains the entry, while `paraphrase_ja` is a shorter replacement that still fits the question sentence. An exact duplicate is invalid for a `meaning` question.
- `ruby_terms`
- `localizations`
- `jlpt_level`
- `part_of_speech`
  - Use a grammatical category such as `名詞`, `名詞句`, `動詞`, `動詞句`, `イ形容詞`, `イ形容詞句`, `ナ形容詞`, or `名詞・サ変動詞`.
  - Do not store generic content labels such as `語句`, `词语`, `word`, or `expression` as the part of speech.
- `patterns`
- `points`
- `examples`
- `comparisons`
- `register`
- `explanation_zh`
- `images`
- `tags`

### Shared Fields for Vocabulary and Grammar

Every deck uses the same fields; the app shows a section only when it has data.

- `patterns[]`: `{ "pattern", "connection_zh"?, "meaning_zh"?, "example"?, "example_zh"? }`. Grammar connection forms (`Vた + とたん（に）`), vocabulary usage patterns (`N＋だけでは済まない`) and collocations (`血圧を測定する`). Leave `example` empty when the sentence is already in `examples[]`.
- `points[]`: `{ "label", "detail_zh" }`. Grammar features, transitivity (`自他`), orthography, word formation, traps.
- `comparisons[]`: `{ "target", "difference_zh", "kind"? }`. Near-synonym contrasts; set `kind: "everyday"` for natural conversational alternatives.
- `register`: `{ "level", "note_zh", "exam_tip_zh" }` with `level` one of `written`, `spoken`, `both`, `formal`.
- `explanation_zh`: the detailed explanation (one field; there is no separate `analysis`).
- `source`: `{ "sentence", "chat_summary" }` for provenance. Omit `sentence` when it is already an example.
- `base_form`: only when it differs from `original`.
- `images[]`: `{ "url", "caption" }` with an https image URL, or attach an uploaded image with the `attach_review_item_image` tool. Use an image only when it genuinely helps recall (a scene, an object, a gesture).

Legacy names (`grammar_forms`, `grammar_features`, `collocations`, `comparison_notes`, `everyday_alternatives`, `usage_register`, `usage_register_zh`, `exam_register_zh`, `analysis`, `date`, `source_*`) are still accepted and converted, but new items should use the shared fields.
- `question_kinds`
- `question_distractors`

### Grammar Register Fields

Every `grammar_expression` item should include:

- `register.level`: one of `written`, `spoken`, `both`, or `formal`.
- `register.note_zh`: a concise Chinese explanation of where the form sounds natural. If variants differ, explain each variant separately.
- `comparisons[]` with `kind: "everyday"`: natural conversational equivalents as `{ "target": "...", "difference_zh": "...", "kind": "everyday" }`. This is especially important for written or formal grammar.
- `register.exam_tip_zh`: an optional exam-focused note kept separate from real-world register.
- `practice_questions[].translation_zh`: the complete Chinese translation of the sentence with the correct answer inserted. It is required for practice analysis and must not be replaced by a partial paraphrase or answer rationale.

Example:

```json
{
  "register": {
    "level": "both",
    "note_zh": "「〜たと思うと」偏叙述和书面描写；「〜たと思ったら」在日常口语中更常见。"
  },
  "comparisons": [
    { "target": "Vたらすぐ", "difference_zh": "口语：一……就马上……", "kind": "everyday" }
  ]
}
```

## Furigana Fields

Every Japanese field that contains kanji should have kana reading metadata.

The reading page has its own furigana switch. Keep `meaning_ja`, patterns, examples, and explanations as clean Japanese text, and include every needed kanji reading in `ruby_terms` so that switch controls the annotation consistently.

Use `ruby_terms` arrays instead of embedding readings directly into display text:

```json
[
  { "text": "測定", "reading": "そくてい" },
  { "text": "結果", "reading": "けっか" }
]
```

Rules:

- `text` is the exact kanji-containing substring found in the Japanese field.
- `reading` is hiragana unless the source requires katakana.
- Do not add readings for kana-only text.
- For uncertain proper-name readings, include the most likely reading and mention uncertainty in `explanation_zh`.
- Keep base fields such as `original`, `patterns[].pattern`, and `examples[].ja` clean, without parentheses readings.
- Do not add furigana to quiz prompts, choices, selected answers, or correct answers. Use readings in explanations or `ruby_terms`, not as answer hints.

## Practice Question Types

Generate mixed JLPT-style practice types from item data:

- `grammar`: `文の文法1`; choose the form that fits a Japanese sentence blank.
- `moji_goi`: `文脈規定`; choose the word that fits a Japanese sentence blank.
- `meaning`: `言い換え類義`; underline the target in a complete sentence and choose its closest Japanese paraphrase from four Japanese choices. This type requires `paraphrase_ja`.
- `kana_to_kanji`: `表記`; underline the kana target in a complete sentence and choose the correct kanji form. Use this for N2-N5, not N1.
- `word_formation`: `語形成`; a sentence blank tested on a prefix or suffix (e.g. `（　）規制` → 脱, or `国際（　）` → 化). Choices are affixes that plausibly attach to similar words. N2-N3 only; authored in `practice_questions`.
- `usage`: `用法`; the prompt is the target word alone and the four choices are complete sentences using it, exactly one natural. Wrong sentences must be typical misuses (wrong collocation, register, or confusion with a near-synonym), not ungrammatical nonsense. N3-N1; authored in `practice_questions`.
- `kanji_to_kana`: `漢字読み`; use a complete natural Japanese sentence, mark the target kanji substring for visual underlining, and choose the correct reading from four kana-only options. Keep the shared task instruction separate from the sentence and do not repeat the target in a meta-prompt. Distractors should model plausible reading mistakes for the same kanji, not unrelated vocabulary readings.

Every website question uses the official booklet pattern: a Japanese task instruction separate from the item, one natural Japanese sentence, four numbered choices, and no translated hint in the prompt or options. Question prompts, choices, and answer keys stay plain text. Full explanations may use the selected learner language and can be annotated by the app when explanation furigana is enabled.

### Question Suitability

Do not generate all types for every item. The website mixes suitable question types automatically, so `question_kinds` should describe the item honestly instead of forcing a single default. An explicit empty array means the item stays available for review but does not generate an automatically scored question.

Every non-`proper_name` item should be covered by at least one complete scored question. A complete question has one JLPT-style instruction, one natural Japanese prompt, four choices, one answer, and a full explanation. If the source material lacks a natural sentence, create a conservative example sentence before enabling a scored question.

- N1 kanji vocabulary with a reliable reading, natural sentence, and Japanese paraphrase can use `moji_goi`, `meaning`, `kanji_to_kana`, and `usage` (the four N1 vocabulary types); N1 does not use `kana_to_kanji` or `word_formation` by default.
- N2-N5 kanji vocabulary may also use `kana_to_kanji` when the orthographic contrast is appropriate.
- Kana-only vocabulary should not generate `kana_to_kanji` or `kanji_to_kana` unless the item explicitly teaches an orthographic contrast.
- Grammar expressions and verb forms normally use `grammar` with a sentence blank and controlled, function-specific distractors. Add reading or spelling questions only when that is the learner's actual confusion.
- `proper_name` items normally use only the supplementary `kanji_to_kana` practice, and only when the source establishes one intended reading. Do not present it as an official JLPT type.
- Names with multiple valid readings, uncertain readings, or AI-inferred candidate readings must use `question_kinds: []` until verified.

Authored questions go in `practice_questions[]` as `{ id, kind, instruction, prompt, target, choices, answer, explanation_zh, distractor_notes }`. An authored question replaces the synthetic question of the same kind. `upsert_review_item` rejects it unless it has at least four distinct choices including `answer`, a non-empty `explanation_zh`, and a specific `distractor_notes[choice]` for every wrong choice explaining the concrete confusion (on/kun reading, voicing, long vowel, collocation, register, near-synonym), never just "does not fit".

Use `question_distractors` to provide controlled wrong options per question type. Distractors must be plausible for the tested skill, must not duplicate the answer, and must not be another valid answer in the given context. For a name-reading question, explain that the answer is the recorded whole-name reading and should be confirmed from the source rather than mechanically assembled from individual kanji.

## Localizations

Use `localizations` for multilingual learner-facing output. Keys should be BCP 47 style language tags.

```json
{
  "localizations": {
    "en": {
      "meaning": "Measurement; determining a numeric value with a method or instrument.",
      "core_memory": "Measure objective data by a standard method.",
      "explanation": "Use it for measurable quantities such as temperature or speed."
    }
  }
}
```

Keep Japanese source fields stable. Translate learner-facing fields only.

## Review Scheduling

Do not store learner-specific scheduling state in seed data. Store only the content timestamp `input_at` in each item.

SQLite progress may contain:

```json
{
  "firstSeenAt": "2026-08-27T20:20:00.000Z",
  "lastReviewedAt": "2026-08-27T20:25:00.000Z",
  "reviewCount": 2,
  "ease": 2.8,
  "intervalDays": 3,
  "nextReviewAt": "2026-08-30T20:25:00.000Z"
}
```

Use a simplified Anki/SM-2 style rule: first correct answer reviews tomorrow, second correct answer reviews after 3 days, later correct answers multiply the interval by ease, and wrong answers return to tomorrow with lower ease.

## AI-Generated Content Metadata

Content created without learner-provided source material must be visibly distinguishable from captured study notes:

```json
{
  "content_origin": "ai_generated",
  "verification_status": "unverified",
  "level_confidence": "medium"
}
```

Do not apply this marker to content extracted from the learner's own notes. AI-generated readings, meanings, answers, and JLPT-level estimates require learner review. Only set `verification_status` to `verified` after explicit learner confirmation or a user-requested verification pass.

## Privacy Rule

Do not copy raw chat transcripts into monthly archive files. Store only structured learning content and short explanations needed for review.
