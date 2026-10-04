# Unified responsive design coverage

Date: 2026-10-04. Scope: signed-in Web application only.

This is a **source-level coverage and integration review**, not a claim that all
screens have passed visual or real-browser QA. The 22 board names and 66
representative screens below are transcribed from the delivered design archive
index. The final integrated code passed the automated checks recorded in unified-responsive-implementation.md. Native Apple,
public articles, and embedded MCP applications are outside this implementation.

Board 14 and board 20 pixels were additionally inspected for the guide list,
guide detail, and custom-tip editing refinements. This is design-reference
inspection, not rendered-application verification.

## Navigation and shared components

- Five primary roots: `#/home`, `#/mixed/tips` without an item, `#/market`
  without an item, `#/history` without a selected record, and `#/study`
- `domain/appNavigation.ts:isPrimaryNavigationRoot` is the sole phone-tab
  visibility policy. A registered local screen or selected record suppresses tabs
- `contextualBackRoute` supplies the same semantic parent to the desktop and
  mobile headers. Breadcrumb display no longer determines the Back action
- `components/AuthoringNavigation.tsx` has owner-scoped registration, priority,
  and restoration of an underlying local screen when a nested one closes
- `components/PageChrome.tsx` collects page-owned header actions
- `components/LearningList.tsx` owns closed-by-default search/filter sheets,
  focus restoration, and list-density choice
- `components/ModuleActionBar.tsx` restores the existing
  `/study-companion.png` launcher while retaining current confirmation,
  submission, disabled-action, and focus behavior
- `components/UnifiedResponsive.css` applies the shared paper, ink, accent,
  responsive content column, 44px controls, bottom navigation, and mascot space

## All 22 design boards mapped to implementation

“Mapped” means the indicated code exists and owns the represented state. It does
not mean the pictured layout has been visually matched. “Shared” means the
common navigation/list/chrome changes apply, while feature-specific rendering
needs the checks listed in the last column.

| Board | Representative screens | Routes / local state | Implementation owner | Source coverage and remaining verification |
| --- | --- | --- | --- | --- |
| 01 | Today / Practice / Records | `home`; `mixed/tips`; `history` | `HomeDashboard`, `MixedPracticeHub`, `HistoryPanel.RecordHome`, `DailySummaryPanel` | Dedicated primary structures; five-root tabs. Verify empty, pending draft, resumable practice, completed practice, and meaningful daily records. Statistics must describe real stored activity rather than example board values |
| 02 | Discover / Library / Grammar list | `market`; `study`; `grammar/words` | `MarketPanel`, `StudyModulesHub`, `StudyPanels.WordIndexPanel` | Discover rows simplified; library counts group passages/audio using real data; grammar is secondary with mascot. Verify final App data props, closed filters, list management access, and last-row clearance |
| 03 | Vocabulary list / Vocabulary detail / Grammar detail | `vocabulary/words`; `vocabulary/words/:id`; `grammar/words/:id` | `WordIndexPanel`, `WordDetailPanel`, shared entry content | Shared list density and no secondary tabs. Verify previous/next URL identity, missing entry handling, examples/ruby, tag/image management, and navigator Back |
| 04 | Reading list / Passage / Reading answers | `reading/words`; `reading/words/:id`; local passage/answer state | `ReadingPanel`, `ReadingPassage`, `ReadingQuestionItem`, `ReadingChoiceGrid`, `ReadingExplanation` | Reading source uses local navigation for answer state and page-owned management. Verify passage remains available, answers survive toggling, no premature answer reveal, and lookup controls remain distinct from answer buttons |
| 05 | Listening list / Listening answers / Read-along | `listening/words`; `listening/words/:id`; local read-along and edit state | `ListeningPanel`, `ListeningQuestionGroup`, `ListeningReadAlongWorkspace` | Share is contextual; read-along and edit have local Back registrations. Verify audio/answer continuity, hidden background audio, edit-vs-read-along priority, pending save, and transcript navigation |
| 06 | Wordbooks / Mascot practice menu / Practice by content | `{vocabulary,grammar}/wordbooks`; ModuleActionBar mode/content dialog; focused selector | `WordbookManagerPanel`, `ModuleActionBar`, `WordIndexPanel` | Create/rename and focused selector register local states; mascot is restored. Verify menu keyboard focus, native Escape, disabled content, retained question draft, content selection and editor dismissal |
| 07 | Topic practice / Share detail / Search and filters | `mixed/tips/topics`; `market/:id`; list-controls dialog | `MixedPracticeHub`, `MarketPanel`, `SharedPractice`, `LearningListHeader` | Topic filters expose summary/reset; share preview is content-first and introduction collapsible. Verify own-share management vs import, cancellation, duplicate import prevention, trial → results → question Back stack |
| 08 | Multiple-choice practice / Answer sheet / Explanation | module `questions`, `mixed/questions`, `daily-practice/questions/:id`; answer-sheet modal; local review index | `PracticePanel`, `PracticeReviewPanel`, `AnswerPanel` | Existing scoring/answer state remains; local answer explanation registers Back. Verify batch/immediate feedback, last unanswered item, submit interruption, explanation return, replay isolation, and no unrelated header search |
| 09 | Draft list / Draft preview / Draft management | `drafts`; selected draft ID; local editing draft ID | `DraftsPanel`, `DraftContentPreview`, `QuestionReviewWorkspace`, `PreviewDisclosure` | Shared list and selected-record navigation apply; local editor is registered with form priority. Verify invalid JSON recovery, cancel retention, all-questions-explicitly-confirmed gate, delete confirmation, and management modal cleanup |
| 10 | Practice history / Mistakes / Knowledge-point error history | `history/history`; `mistakes`; selected mistake ID | `HistoryPanel`, `DataManagementPanel`, `PracticeReviewPanel`, `MistakesPanel` | Mistake detail and review question register local navigation. Verify answer detail → results → history list → records root; stale/missing original questions must preserve historical score |
| 11 | Captures / Capture detail / New capture | `captures`; selected capture ID; `capture` | `HistoryPanel`, `CaptureDetail`, `CapturePanel` | Selected capture suppresses tabs; new-capture parent is captures. Verify input validation, save retry/deduplication, target book creation, status update failure, and Back without an unexpected write |
| 12 | Due review / Memory card front / Memory card back | `memory`; separate `memory-review` shell | `RecordsOverview`, `FocusedMemoryReview` | Due list inherits shared controls; focused card shell intentionally stays independent of global navigation. Verify review action remains reachable in default density, rate-once behavior, front/back fields, safe area, and exit |
| 13 | Study plan / Date picker / Exam preparation | `plan`; calendar dialog; collapsed overview; `plan/textbooks` | `StudyPlanPanel`, `PlanCalendar`, `PlanOverviewPanel` | Plan is secondary; profile form registers Back. Verify date selection, task status failure rollback, opening/closing calendar, retained profile draft, and direct textbook bookmark parent |
| 14 | Question-type guide / Guide detail / Question management | `question-types`; module `tips`; `question-types/:id`; module `tips/:id`; `grammar/bank` | `QuestionTypeGuide`, `QuestionTypeDetail`, `QuestionBankPanel` | Category/search/Add are in the contextual tools sheet; add form unmounts list chrome. Detail supplies contextual Edit/Save and its actual title, with no duplicated body Back or title. DOM tests cover close, reopen, preserved text, and save; question-bank source links and visual matching still need verification |
| 15 | Today statistics / Global search / Search results | `history/today`; explicit GlobalSearch dialog | `DailySummaryPanel`, `HistoryPanel`, `GlobalSearch`, `SettingsView` | Global search removed from universal headers; SettingsView accepts explicit search entry. Verify App passes `onSearch`, search open/close/focus, result navigation, empty results, and real-data summaries |
| 16 | Settings / Display and reading / Practice experience | `settings`; `settings/display`; `settings/practice` | `SettingsView` | All are secondary; section Back returns to settings index. Verify persisted font/ruby/locale/feedback changes, selected values, responsive controls, and no accidental save controls for immediate-persistence settings |
| 17 | Memory-card fields / Pronunciation / User profile | `settings/memory`; `settings/pronunciation`; `settings/account` (legacy `profile` retained) | `SettingsView`, `PronunciationSettings`, `UserProfilePanel` | Shared secondary chrome applies. Verify field selection limits, browser-TTS path, service credential handling without exposing values, retained account/sign-out confirmation, and profile statistics |
| 18 | AI assistant / Connect and verify / Connected AI | `about`; `about/connect`; `about/agents` | `AboutPanel`, `ConnectionStatus`, `AgentsSection`, `ConnectedAgents` | Shared no-tab and contextual Back apply; existing feature code retained. Verify real connection state, copy feedback, external destination, loading/failure and revoke confirmation; do not claim a live agent connection from a fixture |
| 19 | MCP explanation / Study collaboration guide / Scheduled-task explanation | `about/mcp`; `about/guide` and `about/guide-*`; `about/automation` | `AboutPanel`, `GuideBook`, `guideLessons` | Guide chapter Back returns to guide index; other sections return to About. Verify all chapter links, localized long text, code/copy controls, and absence of generic search |
| 20 | Add vocabulary / Custom tip / Edit draft | WordIndex local capture form; QuestionTypeGuide adding; DraftsPanel editing | `WordIndexPanel`, `QuestionTypeGuide`, `DraftEditor` | All three register local Back; custom-tip add/edit uses contextual Save and preserves unsaved values across close/reopen. Verify no underlying list-filter dialog stays open over a newly opened form and unsaved input follows intentional Cancel/Back behavior |
| 21 | Ask a question / Empty mock exams / Edit learning profile | ModuleActionBar ask dialog; `mock-exams`; StudyPlanPanel edit state | `ModuleActionBar`, `MockExamCatalog`, `PlanSetupForm` | Existing async submission guard retained, mock catalog secondary, profile form registered. Verify error retains question, repeat submit writes once, unavailable catalog empty state, and profile draft cancellation |
| 22 | Add grammar / Add reading / Add listening | WordIndex local grammar capture; ReadingPanel showForm; ListeningPanel showForm | `WordIndexPanel`, `ReadingPanel`, `ListeningPanel` | Existing authoring registrations retained. Verify required fields inside collapsed groups expand on invalid, reading/listening file validation, failed save retains inputs, and header actions are form-relevant |

## Desktop equivalents

Large screens derive from the approved mobile content and tokens. Older desktop mock headings/statistics are not authoritative. The same components cover:

1. Today / Practice: board 01 components, with sidebar and desktop page header
2. Discover / Records: boards 01, 02, 07, 10 and 15
3. Library / Grammar: boards 02, 03, 06 and 22
4. Topic filters / Share detail: board 07

Verify at narrow mobile, tablet/sidebar boundary, and wide desktop widths. This
review does not infer viewport dimensions or overflow from source alone.

## Integration findings to resolve or explicitly recheck

1. **Default-density filter controls can be hidden by an older rule.**
   `features/home/LightWorkspace.css` hides `.is-simple-study-list .list-tools`
   and `.list-management-control` with `!important`. The initial
   `UnifiedResponsive.css` `.list-controls-body .list-tools` rule is not
   important. Categories and batch management inside the new sheet therefore
   need a scoped override; do not require enabling “Detailed list” to recover
   functionality. Reported to the shared CSS owner.
2. **A filter-sheet action must dismiss the sheet before displaying a form.**
   WordIndexPanel initially kept `showEntryLibrary = true` during its local
   capture form, leaving the list dialog mounted and open after choosing Add.
   The study-feature owner was asked to hide/unmount controls during local
   authoring and focused selection. Reading already makes its library
   conditional on `!showForm && !showAiForm`.
3. **Applied non-query filters need a visible summary and reset.**
   LearningListHeader supports `appliedSummary`/`onReset`; topic practice uses
   them. Discover scope/category and other non-query filters must supply them
   too. Query-only automatic text does not communicate an active category.
4. **Global search must remain deliberately reachable.**
   Universal header search was removed. SettingsView accepts `onSearch`; the
   final App integration must wire the rendered settings surface. Keeping the
   GlobalSearch component mounted by itself does not make it reachable.
5. **Page action registration depends on unmounting or suppressing background
   controls.** `usePageHeaderActions([])` currently declines registration; it
   does not intentionally mask a lower-priority parent. Hidden-but-mounted
   background components with actions require explicit handling. Check forms,
   read-along, reading answer modes and practice results. Owner cleanup prevents
   stale unmounted entries, but not still-mounted hidden entries.
6. **Nested local Back must close one level.** Share trial → results → answer
   explanation, dialogue list → scenario → roleplay, listening → read-along,
   and history list → result → question need interaction tests. Do not infer
   correctness merely because every screen is already secondary.

## Automated evidence from this review

`node --test tests/navigation-redesign.test.mjs tests/navigation-replay.test.mjs`
passed 17 tests after the guide and daily-origin refinements, covering exact roots, semantic parents,
owner-safe registry cleanup, actual dialogue roleplay Back, custom-tip form Back,
custom-tip unsaved text after reopening, contextual Edit/Save, Today-vs-topic
daily Back, replay route identity, original-question attribution, and save ordering.

Source recheck at 04:00 UTC confirmed the shared CSS owner added a scoped
important override for filter-sheet tools; WordIndexPanel hides its list for both
capture and focused selection; Discover now supplies applied summary/reset; and
App passes the explicit search callback to its settings surfaces. These close
findings 1–4 at the source-integration level, subject to final browser checks.
At 04:02 UTC the listening owner confirmed hidden-group navigation is explicitly
suspended during read-along while keeping the edit draft mounted. Its targeted
regression covers Edit → unsaved text → Shadowing → header Back → restored
editor with unchanged text and share-action restoration. This result was
reported by the feature owner, rather than independently rerun in this review.

An intermediate `npx tsc --noEmit --incremental false` completed without type
diagnostics after the shared-header syntax correction. The subsequent whole-tree
`git diff --check` reported whitespace in concurrently edited feature files;
assigned navigation files passed their scoped diff check. All checks must be
rerun against the final integrated tree.

At 04:03 UTC, typecheck and the assigned-file diff check passed again. Running
navigation-redesign, navigation-replay, and shared-responsive-chrome together
passed **21/21 tests**, including filter Escape/focus restoration, prioritized
page actions, deliberate global search, and mock-catalog count failure handling.

At 04:09 UTC, the guide's chosen category is now shown even when its tools are
closed, including the initial vocabulary restriction. Reset restores the initial
category and clears the list query. The updated regression also verifies that
add/edit forms expose only their Save action, without a generic list filter.
The same three suites now pass **22/22 tests**; typecheck and scoped diff check pass.

Other relevant existing suites: `module-actions`, `web-audit-interactions`,
`market-preview-interactions`, `history-replay-interactions`, `learning-list`,
`reading-listening-accessibility`, `settings-capture-review`, and
`practice-presentation`. A named suite is a verification target here unless its
result is explicitly stated above.

No browser pass, live-account verification, push, merge, or deployment is claimed
by this source review.
