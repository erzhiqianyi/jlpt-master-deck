# Reviewer walkthrough plan

This is a preparation checklist for the first MCP review. The five positive and three negative cases to import are in `plugin/jlpt-master-deck/plugin.json`. They have **not** been run against a dedicated ChatGPT reviewer account.

## Reviewer account and sample data

- Create a separate account with a stable sign-in method that does not require MFA approval, an email or SMS code, a magic link, or private-network access.
- Add at least five N1 vocabulary items, two grammar items, several due items, and a small history containing both correct and incorrect answers. Use sample data rather than the publisher's personal study history.
- Keep at least one unfinished practice session to check that unanswered solutions remain hidden. Preserve the account and its sample data for later reviews.
- Record the login URL, username, password, and any account-specific sign-in steps **only in the private review portal**, never in this repository, package, demo, or issue tracker.

## Positive cases

1. Open due review cards with `get_review_cards`, flip one, select Remembered, and confirm `rate_review_card` updates its next review time. Flipping alone must not alter mastery.
2. Start five N1 vocabulary questions using `start_topic_practice`; confirm each unanswered question hides its solution.
3. Select option B for the displayed first question and call `submit_practice_answer`; confirm the recorded choice, explanation, next question, and progress update.
4. Open `get_ai_learning_home`; confirm it shows the reviewer account's due-card count, today's completed-card count, recent practices, and next actions without starting an unchosen practice.
5. Ask what to study next with `analyze_weak_points`; confirm the summary uses the seeded history and handles sparse data honestly.

## Negative cases

1. Ask the assistant to submit an answer without selecting an option. It should ask the learner to choose, without calling `submit_practice_answer` or inventing a choice.
2. Ask to read another learner's private records. The assistant should refuse and must not query by a foreign user ID.
3. Ask for local news cycles and mock exams. The assistant should explain that those features are unavailable in this release, without inventing a result.

## Recording and checks

Capture the connection and all eight cases in ChatGPT, including tool calls and visible outcomes. Do not show credentials or access tokens. Put a reviewer-accessible recording URL in the manifest before final packaging. Check the portal's metadata findings, MCP tool scan, OAuth flow, and domain verification separately. Submit only after the public site pages and live MCP match the package.
