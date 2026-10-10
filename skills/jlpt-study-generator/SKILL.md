---
name: jlpt-study-generator
description: Generate a general JLPT study plan and AI-created practice content from a target level, available days, daily study time, and focus modules when the learner has no source notes. Do not use for organizing the learner's own questions or exported progress; use jlpt-chat-review for those personalized workflows.
---

# JLPT Study Generator

Use this skill when the learner wants to start without supplying vocabulary, notes, or mistakes. Produce a level-appropriate plan and original JLPT-style practice material from the learner's constraints.

This is a general generation workflow, not a diagnosis. State that the output is less personalized than material created from the learner's own questions or study-record export.

## Inputs

Determine these parameters from the request:

- Target JLPT level: `N5`, `N4`, `N3`, `N2`, or `N1`.
- Study duration: start date or number of available days.
- Daily study time. Default to 45 minutes when omitted.
- Focus modules: vocabulary, grammar, listening, reading, or mixed. Default to balanced coverage.
- Learner-facing output languages. Default to `zh-CN`.
- Desired output: plan only, content only, or both. Default to both.

Ask only for a missing target level or duration when neither can be inferred. For other missing values, use the defaults and list the assumptions before generating.

## Workflow

Everything is written through the JLPT Master Deck MCP tools; there are no data files to edit.

1. Read [references/study-plan-schema.md](references/study-plan-schema.md).
2. Save what the learner told you with `save_study_plan_profile` (level, start and exam dates, study days per week, daily minutes, materials).
3. Call `get_plan_generation_context` for the profile, existing plan, statistics and mistakes. A learner with no history still gets a general plan; say so.
4. Build a schedule for the full duration, divided into foundation, consolidation, mixed practice and final review phases. Scale the phases to the available days instead of forcing every phase into very short plans. Keep each day within the daily time budget, weight the focus modules, and keep some mixed retrieval practice.
5. Save it with `save_generated_study_plan`: strategy texts, `phases` and dated `tasks`. Pending tasks are replaced; completed and skipped ones stay.
6. Generate detailed content for the first seven days only, unless the learner asks for more, so later batches can react to actual progress:
   - vocabulary and grammar: `create_knowledge_point` in a wordbook the learner chose (follow `../jlpt-chat-review/references/review-schema.md`);
   - questions: `validate_question` → `create_question_group`, linked to knowledge points; reading and listening use materials;
   - a daily pack: `create_practice_draft` with the question codes, for the learner to confirm before `publish_practice_draft`.
7. Have each new question group reviewed (`get_question_review_context` → `submit_question_review`) before it goes into a published practice.

## Content Rules

- Create original JLPT-style material. Never describe it as an official JLPT question, past paper, or official syllabus item.
- Match vocabulary, kanji, grammar, sentence length, and distractor difficulty to the target level. When level placement is uncertain, omit `jlptLevel`.
- Every question needs one defensible answer, immediate correct/incorrect judging data, and a complete explanation of the answer and distractors when relevant.
- Do not put furigana in question prompts or options. Add furigana to review content only where the learner asks (`set_ruby_annotation`).
- Listening questions need real audio (`upload_media`). Without audio, generate a script for the learner to read or record instead, and do not present it as a listening question.
- Avoid copying long passages or questions from textbooks, websites, or commercial preparation books. Generate original content.
- Never write review progress. The server computes it from answers and card ratings.

## Human Review Boundary

All generated plans and content are drafts the learner must judge. The server stores everything written through MCP as AI-written and unverified; say so in your reply, in the learner's language. Question groups only reach practice after a review pass, and practice drafts only after the learner confirms them. Surface uncertain readings, meanings, answer keys and JLPT levels instead of hiding them.

## Relationship To Personalized Review

- Use this skill for a general starting curriculum when the learner has no source content.
- Use `jlpt-chat-review` to structure the learner's own questions, notes, mistakes, or exported study records.
- If both are available, prioritize due and weak personalized items, then use generated content to fill coverage gaps.
