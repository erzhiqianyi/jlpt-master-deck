---
name: jlpt-chat-review
description: Turn JLPT study content discussed in an AI coding chat into structured review data for this local JLPT review website.
---

# JLPT Chat Review

Use this skill when the user gives Japanese-learning material in chat and wants it organized for this review website. The website is a viewer and practice tool, not the capture UI: the user chats with an AI assistant, the assistant extracts structured records, and the website reads monthly archives under `public/data/review-data/YYYY/MM.json`.

## Workflow

1. Read `references/review-schema.md`.
2. Ask or infer which output languages the user wants when the request is ambiguous.
3. Extract learnable items from the user's chat or notes.
4. Update the matching monthly archive under `public/data/review-data/YYYY/MM.json`.
5. Keep raw private chat transcripts out of the website data.
6. Run the project build after editing data.

For Codex installations, copy this folder to `~/.codex/skills/jlpt-chat-review`.

For Claude Code or other coding assistants, tell the assistant to read this `SKILL.md` and follow it as project-specific extraction guidance.

## Capture Rules

For each item:

- Store the canonical dictionary form or standard spelling directly in `original`; preserve the learner's surface form or original sentence in source fields when it matters.
- Add `input_at` as an ISO 8601 timestamp for when the user provided the item.
- Do not create a separate `normalized` display attribute.
- Classify the deck as `n1_vocab`, `grammar_expression`, or `name_reading`.
- Estimate JLPT level only when there is enough evidence; otherwise use `unknown`.
- Write Chinese explanations for review.
- When the user asks for multiple languages, keep the Japanese source fields stable and write translated learner-facing text under `localizations`.
- Include reading, core memory, collocations, comparisons, and analysis when relevant.
- Give every vocabulary item at least two natural Japanese example sentences in `examples`. Every sentence must include its learner-language translation; for the default Simplified Chinese workflow, write it in `examples[].zh`.
- Examples used for scored questions must show the expression doing real work in a concrete situation. Sentences such as `教材では「X」という表現を学んだ` are source notes, not valid quiz contexts; do not use them as prompts.
- For verbs and adjectives, include `part_of_speech`, `inflection_class`, `base_form`, and `conjugations`. Use `godan`, `ichidan`, `suru`, `kuru`, `i_adjective`, or `na_adjective` for `inflection_class`. Use stable conjugation `kind` values such as `dictionary`, `polite`, `negative`, `past`, `te`, `conditional`, and `adverbial`; store the actual Japanese surface form in `form`.
- Classify `part_of_speech` grammatically. Do not use generic content labels such as `語句`, `词语`, `word`, or `expression` as a part of speech. Use precise values such as `名詞`, `名詞句`, `動詞`, `動詞句`, `イ形容詞`, `イ形容詞句`, `ナ形容詞`, or `名詞・サ変動詞`, based on the head or predicate of the complete entry.
- Add `meaning_ja` as a concise Japanese dictionary-style definition for every vocabulary item. Keep it distinct from the learner-language meaning and from `core_memory`.
- For `言い換え類義`, write `paraphrase_ja` as a shorter, context-compatible rewording. Never copy `meaning_ja` into it unchanged; if no distinct natural paraphrase exists, do not enable the `meaning` question kind.
- Write `core_memory` as a short exam-room recall note: the minimum cue needed to recognize the word, usage, or contrast quickly. Do not duplicate the full analysis.
- Add kana readings for every Japanese field that contains kanji. Prefer structured `ruby_terms` arrays in data so the app can show or hide furigana without changing the base text.
- Do not add furigana or ruby markup inside quiz prompts, choices, selected answers, or correct answers. Furigana is only for review cards and explanations.
- Put exam-style shortcut reasoning into `analysis`, not into a separate quiz type.
- Generate JLPT-style mixed practice data. Do not force every item into every question type; choose only the types that match the item.
- Every non-`proper_name` item should have enough data to generate at least one complete scored question with one prompt, four choices, one answer, and a full explanation. If the user's source lacks a natural context sentence, create a conservative example sentence and mark uncertain parts in `analysis`.
- For ordinary vocabulary, add `meaning` (`言い換え類義`) when a natural Japanese paraphrase exists, add `moji_goi` (`文脈規定`) when there is a complete natural sentence that can be blanked, and add `kanji_to_kana` (`漢字読み`) when the item contains kanji and has a reliable reading.
- Add `kana_to_kanji` (`表記`) mainly for N2-N5 vocabulary when the spelling contrast is appropriate. Do not default to `kana_to_kanji` for N1 vocabulary.
- Add `usage` (`用法`, N3-N1) as an authored `practice_questions` entry: the word as prompt, four sentences, one natural use and three typical misuses. Add `word_formation` (`語形成`, N2-N3) only for words built with a productive prefix or suffix.
- Every authored `practice_questions` entry needs four choices including the answer, `explanation_zh`, and `distractor_notes` with a concrete reason for each wrong choice; `upsert_review_item` rejects it otherwise.
- For `proper_name` items, keep `question_kinds: []` unless a reliable name-reading practice is explicitly requested and verified.
- Add `question_distractors` when a question needs controlled, type-appropriate wrong choices. For name readings, use reading-shaped distractors and never present another valid reading of the same person as wrong.

## Practice Expectations

For this website version, scored questions use mixed JLPT-style formats:

- `文脈規定`: choose the word that naturally fits the blank in a complete Japanese sentence.
- `言い換え類義`: choose the closest Japanese paraphrase for the underlined word; add `paraphrase_ja` before enabling this type.
- `漢字読み`: choose the reading of an underlined kanji word in a complete Japanese sentence.
- `表記`: choose the correct kanji spelling for an underlined kana word, mainly for N2-N5 items.
- `文の文法1`: choose the grammar form that fits a sentence blank.

Every generated question should support immediate correct/incorrect judging and a full explanation.

Apply the official JLPT-style structure: task instruction, complete natural context, target underlined in context, four options, and no Chinese/English hints inside the prompt or options.

For grammar expressions, prefer a sentence with a blank plus controlled distractors that test connection or function. Do not turn a grammar item into an isolated reading, spelling, or dictionary-meaning question unless that was the learner's actual confusion.

For every grammar expression, record its register explicitly with `usage_register` (`written`, `spoken`, `both`, or `formal`) and explain the nuance in `usage_register_zh`. Add natural conversational equivalents to `everyday_alternatives`, especially when the tested form is written or formal. When an example has a natural spoken rewrite, add it directly to that same example as `spoken_ja` and `spoken_zh` so learners can compare the bookish/test sentence with the conversational version. When variants within one entry differ, explain which variant is more common in conversation instead of assigning an oversimplified label.

Every item in `practice_questions` must include `translation_zh`: a complete, natural Chinese translation of the Japanese sentence after inserting the correct answer. Keep this separate from `explanation_zh`, which explains why the answer is correct.

Furigana must be display-controlled, not baked into visible plain text. The review app should be able to hide furigana during recall and show it in explanations when the learner wants support. Question prompts and answer choices must stay plain so readings do not leak into the test.

## Exported Study Record Workflow

When the user provides an exported study record JSON from the website settings page:

1. Analyze answer history, item progress, review counts, intervals, and `nextReviewAt`.
2. Identify weak modules, weak question types, overdue items, and high-confusion items.
3. Generate a short study diagnosis in the user's requested language.
4. Create a 7-day review plan based on due items and Anki-style spacing.
5. Generate new practice material for weak points and update the matching monthly archive only when the user asks to write the new content into the site.

Do not treat exported SQLite progress as public seed data. It is private learner state used for analysis and planning.

## Boundaries

- Do not include private raw chat logs in public data.
- Do not call external dictionary or translation APIs unless the user explicitly asks.
- Do not invent official JLPT levels for uncertain items.
- Keep user progress out of the seed data; progress belongs in local SQLite.
- Keep review counts, ease factors, intervals, and `nextReviewAt` in SQLite progress only. Seed data should describe content, not a specific learner's schedule.

## Language Output

Default learner-facing language is Simplified Chinese (`zh-CN`). If the user asks for another language or a multilingual deck, output `localizations` for the requested languages.

Supported language keys should use BCP 47 style tags, for example:

- `zh-CN`
- `zh-TW`
- `ja`
- `en`
- `ko`
- `vi`
- `fr`
- `es`

Do not translate Japanese source fields such as `original`, `reading`, `collocations`, or `examples[].ja`. Translate meanings, memory hints, explanations, comparison notes, question explanations, and learner instructions.
