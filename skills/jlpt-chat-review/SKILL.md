---
name: jlpt-chat-review
description: Turn JLPT study content discussed in an AI chat (words, grammar, sentences, full questions, mistakes, exported study records) into knowledge points and question groups in the learner's JLPT Master Deck library through its MCP tools.
---

# JLPT Chat Review

Use this skill when the learner gives Japanese-learning material in chat and wants it organized into their library. The learner chats with an AI assistant; the assistant writes structured records through the JLPT Master Deck MCP server (local stdio, local HTTP or the hosted connector). The website and iOS app read the same database.

There are no data files to edit. Every write goes through an MCP tool, and the server validates it.

## Workflow

1. Read `references/review-schema.md` for the field guide.
2. Call `get_settings` once: `explanationLanguage` is the default language for meanings, explanations and translations. Ask only when the learner wants a different or an additional language.
3. Call `list_wordbooks` and pick the wordbook the learner named. Create one with `create_wordbook` only when asked.
4. For each item, check for duplicates first with `lookup_word` (words: it also matches conjugated forms) or `list_knowledge_points` with `q`. Update the existing point with `update_knowledge_point` instead of creating a second one.
5. Write knowledge points with `create_knowledge_point` (`kind` word, grammar or name; codes W12 / G3 / N1 come back).
6. Write questions with `validate_question` and then `create_question_group`. Link each question to its knowledge point with `questions[].knowledge` (`{ "code": "W12", "relation": "target" }`). New groups wait in `needs_review`. They are usable in practice only after another review pass: `get_question_review_context` → `submit_question_review`.
7. When the input came from the inbox, call `update_learning_capture_status` with `processed` only after everything was saved. Leave failed or ambiguous entries in `inbox`.
8. Add other languages afterwards with `list_missing_translations` → `set_translation`. Add furigana only where the learner asks, with `set_ruby_annotation`.

Keep raw private chat transcripts out of the library: store the extracted item and, when useful, the one source sentence (`sourceSentence`).

## Knowledge Points

- `expression` is the dictionary form or standard spelling (for grammar, the pattern such as `～を皮切りに`). Keep the learner's surface form in `sourceSentence` when it matters.
- `kind` is only `word` (including phrases, idioms and expression sets), `grammar` (including spoken sound-change rules) or `name`. Finer categories go into `tags`.
- Words need `pos`, using the Japanese-language-education categories `verb_1` (五段), `verb_2` (一段), `verb_3_suru`, `verb_3_kuru`, `i_adjective`, `na_adjective`, `noun`, `adverb`, `conjunction`, `adnominal`, `interjection`, `prefix`, `suffix`, `phrase`, `idiom`. Conjugations are generated from `pos`; never write them yourself. Set `isSuruNoun` for nouns that take する and `transitivity` for verbs. Grammar points and names have no `pos`.
- `reading` is kana only; romaji is generated.
- `jlptLevel` only when there is evidence (`N2`, or a range `{ "min": "N2", "max": "N1" }`); otherwise omit it. Never invent an official level.
- `meaning` is in the call's `language`. `meaningJa` is a concise Japanese dictionary-style definition. `paraphrase` is a shorter context-compatible rewording; it must differ from `meaningJa`, and without a natural one do not plan 言い換え類義 questions.
- `examples`: at least two natural sentences for every word, each with `translation`. Examples used for questions must show the expression doing real work in a concrete situation; sentences such as `教材では「X」という表現を学んだ` are source notes, not quiz contexts. When a bookish sentence has a natural spoken version, add `spokenSentence` and `spokenTranslation` to the same example.
- `memoryPoints`: short exam-room recall cues, one per entry. Do not repeat the explanation.
- `patterns` for connection forms, usage patterns and collocations; `comparisons` for near-synonyms (`kind: "synonym"`) and everyday alternatives (`kind: "everyday"`); `notes` for register, exam tips and traps.
- Grammar points: always set `register` (`written`, `spoken`, `formal` or `both`) and explain the nuance in a `notes` entry with `kind: "register"`. Add everyday equivalents to `comparisons`.
- `questionKinds` lists the question type ids suited to the item (from `get_question_types`); `distractors` holds controlled wrong options per type id. Name points normally have none; never present another valid reading of the same name as wrong.

## Questions

Call `get_question_types` once per session. It lists the 26 types with their module, levels, required materials, marks and validation rules. All types use one structure: question group → questions → options.

- Choose only the types that fit the item. Ordinary vocabulary: 文脈規定 when a complete sentence can be blanked, 言い換え類義 when `paraphrase` exists, 漢字読み when the item has kanji and a reliable reading. 表記 mainly for N2–N5. 用法 (N3–N1) needs one natural use and three typical misuses. 語形成 (N2–N3) only for productive prefixes or suffixes.
- For grammar, prefer a sentence with a blank and distractors that test connection or function. Do not turn a grammar point into an isolated reading or spelling question unless that was the learner's actual confusion.
- Follow the official structure: task instruction, complete natural context, target marked in context (`marks` with UTF-16 offsets), four options, no Chinese or English hints in the prompt or options.
- Exactly one option has `correct: true`. The answer is the option, never a position. Every wrong option gets a `distractorType` and an `analysis` of why it is wrong.
- Every question needs `explanation` sections (at least `basis`, why the answer is right) and a `translation` of the prompt with the correct answer filled in. Reading and listening questions quote their `evidence` verbatim. Put exam-style shortcut reasoning in the explanation, not in a separate question.
- No furigana in prompts or options. Furigana belongs to review cards and explanations, through `set_ruby_annotation`.
- If the source lacks a natural context sentence, write a conservative one and say so in the explanation.
- Run `validate_question` first. Errors would be rejected; warnings are saved as review findings.

## Exported Study Record Workflow

When the learner asks for a diagnosis or plan, read their data instead of an export file:

1. `get_study_overview` (accuracy per question type, daily activity, item states), `list_mistakes`, `get_due_cards`, `list_practice_history`.
2. Identify weak modules, weak question types, overdue items and confusing pairs.
3. Write a short diagnosis in the learner's language.
4. For a plan, use `get_plan_generation_context` and `save_generated_study_plan`. For a daily summary, use `get_daily_summary_context` and `save_daily_summary`.
5. Create new practice for weak points only when the learner asks: questions with `create_question_group`, then `create_practice_draft` for the learner to confirm, then `publish_practice_draft`.

Review progress (ratings, intervals, due dates) is computed by the server from answers and card ratings. Never write it yourself.

## Boundaries

- Do not store private raw chat logs.
- Do not call external dictionary or translation APIs unless the learner explicitly asks.
- Do not invent official JLPT levels for uncertain items.
- Everything you write is saved as AI-written and unverified. Surface uncertain readings, meanings, answers and levels instead of hiding them.

## Language Output

The default language is the learner's `explanationLanguage`. Pass `language` on a call to write another one. Supported codes: `ja`, `zh-Hans`, `zh-Hant`, `en`, `ko`, `vi`, `id`, `th`, `my`, `ne`, `es`, `fr` (`list_languages`).

Do not translate Japanese source fields (`expression`, `reading`, `examples[].sentence`, `patterns[].pattern`, question prompts and options). Translate meanings, explanations, memory points, comparison notes, example translations and question explanations.

## Setup

For Codex, copy this folder to `~/.codex/skills/jlpt-chat-review`. For Claude Code or other assistants, tell the assistant to read this `SKILL.md`. In both cases the assistant needs the JLPT Master Deck MCP server connected; see `docs/local-backend-mcp.md`.
