# Study plan (schema v3)

A plan is one per learner (`learning_plans`) and is written in two calls. The tool input schemas from `tools/list` are authoritative.

## 1. Profile: `save_study_plan_profile`

What the learner tells you. Saving it marks an existing generated plan `needs_refresh`.

```json
{
  "examName": "JLPT 2026年12月",
  "level": "N1",
  "startDate": "2026-10-12",
  "examDate": "2026-12-06",
  "studyDaysPerWeek": 6,
  "dailyMinutes": 45,
  "materialStartStatus": "新完全マスター語彙は第3章から",
  "fixedSchedule": "周日休息",
  "supplementalNeeds": "听力偏弱",
  "materials": [
    { "title": "新完全マスター 語彙 N1", "module": "vocabulary", "currentPosition": "第3章" },
    { "title": "公式問題集 第2集", "module": "other" }
  ],
  "language": "zh-Hans"
}
```

`module` is `vocabulary`, `grammar`, `reading`, `listening` or `other`.

## 2. Generated plan: `save_generated_study_plan`

```json
{
  "goal": "12 月考试达到 N1 合格线，读解与听力各 35 分以上",
  "phaseStrategy": "前四周打基础，之后转为混合练习，最后两周做模拟考试",
  "postMaterialStrategy": "教材学完后用错题和到期卡片复习",
  "phases": [
    { "startDate": "2026-10-12", "endDate": "2026-11-08", "focus": "基础", "goal": "词汇和语法覆盖", "points": ["每天 40 个新词", "语法每天 2 条"] },
    { "startDate": "2026-11-09", "endDate": "2026-11-22", "focus": "混合练习", "goal": "题型熟练" },
    { "startDate": "2026-11-23", "endDate": "2026-12-05", "focus": "模拟与复习", "goal": "时间分配" }
  ],
  "tasks": [
    { "date": "2026-10-12", "module": "vocabulary", "minutes": 20, "material": 0, "title": "第3章 1–40", "detail": "先学再做 文脈規定 10 题" },
    { "date": "2026-10-12", "module": "grammar", "minutes": 15, "title": "～を皮切りに／～をもって", "detail": "例句跟读并做 文の文法1" },
    { "date": "2026-10-12", "module": "other", "minutes": 10, "title": "复习到期卡片" }
  ],
  "language": "zh-Hans"
}
```

- `material` is the 0-based index of a profile material.
- Each task gets a `TK` code. The learner (or you, with `set_plan_task_status`) marks it completed, skipped, missed or pending.
- Saving again replaces pending tasks and keeps completed and skipped ones, so regenerate only the remaining period.

## Content for the first days

Knowledge points and question groups follow `../../jlpt-chat-review/references/review-schema.md`. Bundle a day's questions with `create_practice_draft` (`kind: "daily_review_pack"`, `date`, `minutes`, `objectives`, `sections` with question codes). After the learner confirms it, publish it with `publish_practice_draft`, which creates a daily practice (`DP`).

Everything written through MCP is stored as AI-written and unverified. No extra metadata fields are needed.
