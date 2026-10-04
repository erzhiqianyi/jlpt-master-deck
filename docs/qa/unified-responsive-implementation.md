# Unified responsive Web implementation — 2026-10-04

## Result and boundaries

Implemented the approved mobile-first design templates across all 22 boards / 66
representative states, with a shared desktop sidebar, tablet rail, and focused
reading columns. This is **code implementation and automated verification**, not
a claim that every screen has passed rendered visual acceptance.

Baseline: `809dd38827c8b64a85a20363dcb00da9358562ad` (merged PR #3). The checkout
started clean at `8daeafc`; the merge commit has the same tree. The local feature
branch was fast-forwarded to the verified current main before committing this
work. No pre-existing changes were overwritten.

No Apple/native, server/database, deployment configuration, production content,
or public legal text was changed. No push, merge on GitHub, or deployment was
performed. The public-site appendix remains a template mapping; its 39 existing
routes and translations retain their regression coverage, not a new visual pass.

## Complete implementation / evidence checklist

Every row below has implemented source changes or a deliberately shared template.
DOM tests use synthetic local data. A test on one state does not establish every
possible data or device state. **Rendered verification is blocked for every row.**

| Board | Implemented outcome | Actual automated / source evidence |
| --- | --- | --- |
| 01 | Today next task, three Practice choices, compact Records status and vertical entries | Primary and records DOM tests cover pending/empty/actual counts, completed rounds, task failure and retry |
| 02 | Content-first Discover, four Library rows, compact Grammar list | Primary/content/study tests cover real grouped totals, no guessed activity, closed controls, mascot |
| 03 | Vocabulary rows and vocabulary/grammar reading details | Study tests cover actual completion counts, reading/meaning, all examples/conjugations, retained metadata in explicit detailed mode |
| 04 | Reading library, original passage, answer layout | Reading/content tests preserve passage/choices, answer state, lookup accessibility and detail Back |
| 05 | Listening library, answer detail, read-along | Content/listening tests cover answer continuity, editor → read-along → Back, hidden-action suspension, sharing confirmation |
| 06 | Wordbook New/rename/share, original mascot, content selection | Study/module tests cover contextual New, rename Back, practice capability gates, modal focus return |
| 07 | Topics, share preview/manage, contextual filters | Primary/market/content tests cover summaries/reset, retained sharing, no row revoke, read-only trial, import deduplication and source switching |
| 08 | Question, answer sheet, review/explanation templates | Practice/replay tests retain immediate/batch behavior, answer order, unanswered/missing originals, retry/save isolation and saved verdicts |
| 09 | Draft list, preview, contextual management | Draft/record tests preserve explicit question confirmation, JSON editor isolation, header management/save, retry and unsaved return |
| 10 | History, mistakes, per-item error detail | History/study/navigation tests cover retained historical answers, result/detail Back, filters/reset and unavailable original questions |
| 11 | Captures, capture detail, input form | Record/capture tests cover contextual actions, validation, preserved failure input, status failure, duplicate-submit guards |
| 12 | Due-review list and visible action dock, card front/back | Study tests cover due count/action availability, reveal/rating, failed save, duplicate rating prevention |
| 13 | Plan date picker, agenda, focused preparation view | Plan tests cover collapsed calendar, selection, nested Back, task update failure, dirty draft survival through 20-second refreshes |
| 14 | Guide list/detail and question management | Navigation/study tests cover category summary/reset, add/edit Save, body Back removal, question-source access |
| 15 | Date-coordinated statistics, deliberate global search, results | Shared tests verify date changes both metrics/attempt rows and summary request; search type selector, focus and close behavior |
| 16 | Settings root, display/reading, practice settings | Settings tests verify one section flow at all widths, actual values, explicit search entry, persistence callbacks |
| 17 | Card fields, pronunciation, account | Existing settings tests cover selected controls, account/sign-out entry and browser-TTS path; real credentials and provider audio not exercised |
| 18 | AI home, connection instructions, connected clients | Source reviewed against board; connection row typography and scope descriptions updated, existing authorization/revoke behavior retained; no live connection/revoke claimed |
| 19 | MCP, collaboration, scheduled-task guidance | Shared narrow readable guide template and existing content/link structure; source review and public-link regression coverage, not live agent workflow tests |
| 20 | Word capture, custom tip, draft editor | Study/navigation/record tests cover focused forms, contextual Save, Cancel/Back, validation and retained draft state |
| 21 | Ask-a-question, genuine mock empty state, plan profile edit | Module/study/record tests cover submit-once/retry, complete vs failed catalog reads, native form validation and dirty profile protection |
| 22 | Grammar capture, reading form, listening form | Content/study tests preserve fields, collapsed groups, keyboard-safe non-autofocus arrival and local-state Back |

Detailed route and component mapping: [coverage matrix](unified-responsive-coverage.md).

## Shared contracts implemented

- Only five exact primary roots show phone tabs. Local details/forms suppress
  them; mobile and desktop use one semantic Back resolver
- Page-owned header actions replace universal search. Global search remains an
  explicit Settings entry. List search/filter controls start closed, with active
  summaries and reset when applicable
- The original `study-companion.png` is the module practice launcher. Add/edit,
  import/upload, guide, batch management and sharing remain reachable in their
  contextual locations; no universal overflow bar was introduced
- Default rows are concise. The explicit detailed-list choice retains dates,
  books, study status and other original metadata rather than dropping data
- Today, Practice and Library use actual data. Topic completion counters are
  server receipts; mixed/item counts describe retained completed attempts. No
  opened-page counters or example mockup values are presented as learning
- Responsive rules preserve the same content at 320/375/390 mobile widths,
  768–1100 tablet rail widths and larger desktop widths. These rules are
  implemented in CSS; geometry at those widths has not been observed
- Font-scale tokens, 44px control wrappers, safe-area spacing, scrollable sheets,
  focus return, and last-row clearance are implemented. Media playback, physical
  keyboard/device behavior and Safari layout remain unverified

## Independent review fixes

The independent reviewer inspected actual pixels of all 22 boards and reviewed
the integrated source. Reported findings were fixed and rechecked: plan polling
overwriting dirty drafts; hidden listening editor winning Back; false zero mixed
inventory; missing Records practice CTA; misplaced form actions; hidden due-review
action; lost detailed metadata; missing active filters; radio sizing; unscaled
reading type; and sticky item navigation underneath the global header. No P0 or
unresolved reported P1/P2 remained after the bounded final source recheck.

## Final automated verification

Executed against the final integrated source:

- `npx tsc --noEmit --incremental false`: passed
- `npm run lint`: passed; existing ESLint configuration does **not** lint TS/TSX
- `npm run build`: passed (Web and all three MCP bundles)
- Full repository `node --test` discovery: **312 / 312 passed**, no skipped tests
- `git diff --check`: passed
- Isolated responsive fixture bundles successfully; this is not a browser pass

The pre-existing large-bundle warning remains (main bundle exceeds 500 kB).
Raw command logs are kept locally in `.local/unified-final/`.

## Rendered verification blocker and next acceptance

The ordinary Vite wildcard CLI could not enumerate network interfaces in this
environment. A Vite middleware HTTP server was then started successfully on
`0.0.0.0:4173`. The supported cloud preview address still returned 502 Connection
refused. Trying the server's local URL produced the explicit browser restriction
`net::ERR_BLOCKED_BY_CLIENT`; browser retries stopped at that boundary. No
restriction was bypassed, no user computer was used, and no preview was deployed.

Therefore there are **no implementation screenshot proofs and no pixel-QA pass**.
The remaining acceptance is to render 320/375/390×844, iPad portrait/1024 and
desktop 1440 with standard/large type; compare the approved boards; then check
long content, last row/mascot clearance, native dialog focus, soft keyboard, audio,
and the nested Back/Forward flows. `tests/fixtures/web-audit.html` supplies an
isolated synthetic module fixture; full authenticated route acceptance must use
an authorized test account and must not write demo content into production.
