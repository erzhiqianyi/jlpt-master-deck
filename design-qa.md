# Library four-quadrant redesign QA — 2026-10-05

final result: passed

Scope: responsive web component visual acceptance. Native compile-only verification is reported separately.

## Visual evidence

- Source: `/tmp/codex-remote-attachments/01a109d9-d02a-7501-9762-7208184c5582/779FD546-2BE7-4DDD-843E-48B900CC0A61/1-写真1.jpg` (589 × 1280).
- Preview: `http://127.0.0.1:4220/.local/library-preview/index.html`.
- Production StudyModulesHub and shared navigation rendered with explicitly labeled synthetic data. The fixture verifies callbacks; it does not replace authenticated integration testing of downstream lists.
- Evidence: `.design-qa/library-grid/mobile.png` (375 × 812 actual capture), `tablet.png` (834 × 1112), `desktop.png` (1440 × 1000). The mobile override was requested at 390 × 844; the returned mobile image is 375 × 812, so comparison uses the actual capture size, not an assumed DPR. Tablet/desktop captures match their requested CSS viewport at 1:1.
- Opened source and latest mobile screenshot together. Compared four quadrants at normalized content widths, keeping native/product navigation chrome separate. Full views show the illustrations, labels, counts and dividing lines clearly; no detail crop was necessary.

## Findings and accepted adaptations

No actionable P0/P1/P2 findings in the tested library surface.

- Four transparent generated paper illustrations: vocabulary flashcards, grammar bracket/strips, open book and headphones. Originals interpret the reference style rather than copy its pixels.
- Two-by-two layout retained across phone/tablet/desktop with restrained cross dividers, large illustrations, strong labels and compact counts. Desktop uses a centered maximum width and existing sidebar.
- Phone title left, settings right; library tab uses the four-square library symbol. Existing product tab container and ink colors remain consistent with Learning/Discover.
- Total values derive from current data; studied values only count saved review/answer activity. Reading passages and listening audio are deduplicated. Status icons have accessible 已学/已练 labels. No mock values enter production code.
- Initial phone capture had undersized illustrations; reduced horizontal tile padding from 18 to 8 pixels. Latest mobile capture verifies larger imagery and aligned labels.
- At 320 CSS pixels the document scroll width is 305 (scrollbar reservation), so no horizontal overflow. All four assets loaded at 768 × 768. Browser error log is empty.
- P3: retained desktop sidebar brand/collapse control is crowded in its current narrow width; outside the library surface change.

## Interaction and verification

- Browser: all four tile buttons dispatch the existing vocabulary/grammar/reading/listening `words` routes; fixture return works; settings callback and close work.
- Two focused library count/navigation tests pass; 17 navigation/shared-header regression tests pass.
- Broader primary-redesign run: 21 of 26 pass, with five Today-specific legacy assertions failing against the previously merged Learning layout. Those tests query removed task/review-preview elements. HomeDashboard was not changed by this library task; this is not a claim that the entire repository test suite passes.
- TypeScript and production web build pass. iOS Simulator compilation and Mac Catalyst compilation (signing disabled) pass.
- Native resources and four-quadrant view are implemented; native simulator/device UI was not run. No authenticated data mutation, signed release or deployment performed.

---

# Discover cover redesign QA — 2026-10-05

final result: passed (responsive web component scope)

## Visual truth and evidence

- Reference: `/tmp/codex-remote-attachments/01a109d9-d02a-7501-9762-7208184c5582/ADF9DDF2-327E-4E61-83EF-90F2175C40CB/1-写真1.jpg`, 1280 × 910, three concept panels.
- Runnable preview: `http://127.0.0.1:4220/.local/discovery-preview/index.html`.
- Uses production MarketPanel, navigation, header and CSS with explicitly labeled synthetic data; no production account writes.
- Captures in `.design-qa/discovery-covers/`: `mobile-list.png`, `mobile-cover.png`, `mobile-question.png` (390 × 844), `tablet.png` (834 × 1112), `desktop.png` (1440 × 1000).
- Screenshot scale is one image pixel per CSS pixel. The reference has no known device scale; compared panel hierarchy and relative sizes, not literal pixel equality. Source and mobile list opened together; cover and question screenshots inspected at full resolution.

## Design review

No outstanding P0/P1/P2 visual findings in the tested web component scope.

- Two-column portrait covers on phone, three on tablet, four on desktop. Existing sidebar retained at wider widths. No horizontal overflow at 320 and 1440 CSS pixels.
- Visible 全部 / 词汇 / 语法 / 听力 filters, title and search icon. Search and optional management remain in the shared controls sheet; removed the irrelevant detailed-list toggle from this cover catalog.
- Generated stair, clock, coffee and gold illustrations follow the reference palettes and subjects. They are original interpretations, not exact copies. Real titles/levels overlay the images and real counts remain below.
- Detail follows cover → question preview, page counters, title/count, author row, expandable description and vermilion action. Teal selected options remain local state.
- Existing sans-serif product typography retained outside the serif cover titles. Existing warm background and rounded tab bar retained. Author identity is unavailable from the public API, so the neutral label 学习者分享 is used.
- Navigation arrows supplement horizontal scrolling for pointer/keyboard users. Offscreen questions are inert; radio groups support arrow-key selection. Exact touch-swipe behavior on physical hardware remains unverified.
- Bookmarks invoke the existing import-to-library operation, with duplicate/in-flight protection. Own-share management and listening playback are preserved.

## Iterations and interaction evidence

1. Replaced scrollIntoView with rail-only scrollTo after observing the whole detail page move during next-page navigation. Verified page 2/69 remains correctly positioned and selection turns teal.
2. Verified list → cover → next question → local selection → Start practice (question 1/68, no prefilled answer) → Back to cover → Back to list.
3. Verified vocabulary filter produces its matching card; searched the visible cover title 時間 and corrected search to include coverTitle in web and native filters. One matching clock card displayed after the fix.
4. Checked desktop/tablet captures and narrow phone overflow. Reset temporary browser viewport override after verification.

## Build and test evidence

- TypeScript checking, production web build and Cloud API bundle pass.
- 30 relevant React interaction/shared-header/list/server-market tests pass. Tests cover import races/idempotency, trial lifecycle, carousel selection without writes and category filtering.
- iOS Simulator compile succeeds. Mac Catalyst compile succeeds with signing disabled; the first ad-hoc signing attempt was rejected by development-certificate entitlements. This is compile evidence, not a signed distribution artifact.
- Native implementation and image assets updated for iPhone/iPad/Mac Catalyst. Native runtime/device visual acceptance was not performed. Authenticated production integration and deployment were not performed.

---

# Learning tab merge QA — 2026-10-05

final result: passed

Scope: responsive web visual/component QA against the supplied reference, using the production HomeDashboard, navigation, header components and styles in an isolated synthetic-data fixture. This result does not assert authenticated account integration, native runtime acceptance, or deployment.

## Visual truth and evidence

- Source: `/tmp/codex-remote-attachments/01a109d9-d02a-7501-9762-7208184c5582/3A0C110F-4E86-45C2-AF2A-0D36EAA9AE87/1-写真1.jpg` (1181 × 1280 pixels, two mobile examples).
- Preview: `http://127.0.0.1:4220/.local/learning-preview/index.html`.
- Mobile: `.design-qa/learning-merge/mobile-ready.png` (390 × 844 viewport), `.design-qa/learning-merge/mobile-progress.png` (390 CSS-pixel viewport, full-page capture).
- Tablet: `.design-qa/learning-merge/tablet.png` (834 × 1112).
- Desktop: `.design-qa/learning-merge/desktop.png` (1440 × 1000).
- Browser captures use 1 image pixel per CSS pixel. The source is a photographed two-panel concept, not a device screenshot with a known DPR. Compared each panel by content width and structure; no unsupported claim of pixel equality.
- Source and mobile in-progress capture were opened together for comparison. Full views keep all text and controls legible, so a separate detail crop was unnecessary.

## Findings and accepted adaptations

No outstanding P0/P1/P2 visual findings in the tested web component scope.

- Typography: existing system sans-serif retained; stronger practice title, secondary metadata, compact status badge, readable card labels. Long real titles may wrap.
- Spacing: one daily card followed by three equal practice columns and the due-review row; four fixed phone tabs. Tablet/desktop retain the existing sidebar. Content remains scrollable beneath phone navigation with bottom clearance.
- Colors: pale coral daily card, vermilion action/active tab, teal icons and progress, neutral secondary text match the selected direction while preserving product tokens.
- Assets: existing Lucide icons, no raster assets required; native implementation uses SF Symbols. Exact glyph shapes differ between libraries by design.
- Copy: 学习 / 发现 / 记录 / 题库; 待开始 / 进行中 / 已完成. Counts come from data in production. The preview is explicitly labeled synthetic.
- Countdown is added above the daily card as explicitly requested. This adds vertical height relative to the reference; on a short phone viewport the due row requires scrolling.
- Plan remains accessible from the calendar header action and countdown. Missing mock totals are shown as unavailable, not invented.

## Comparison history

1. First mobile fixture capture showed duplicate headers because the fixture omitted WorkspaceLayout.css. Included the same global layout/style stack as the app. Recaptured: only one phone header remains (`mobile-ready.png`). No product-code workaround was added for a fixture-only defect.
2. Checked ready and 8/20 in-progress states against the corresponding reference panels. Progress fill, status color and CTA update correctly (`mobile-progress.png`).
3. Verified tablet/desktop column adaptation and the completed state. No horizontal overflow or missing persistent navigation observed in captures.

## Verification

- 27 navigation, replay, shared chrome, route compatibility and learning component behavior checks pass.
- New checks cover legacy mixed-home route migration, saved-answer progress, completed state, and callbacks for daily/topic/mixed/mock/due-review destinations.
- Browser: ready → in-progress and completed states; no captured console errors.
- TypeScript check and web production build passed; final prop cleanup also type-checked.
- iOS Simulator Debug build passed after the native changes.
- Mac Catalyst Debug build passed for the configured architectures.
- Native runtime remains unverified: all simulators were shut down and startup authorization is pending; attempting to open the Mac app was blocked because macOS was locked.
- The local app login gate prevented authenticated browser acceptance; the component preview does not pretend to be a signed-in end-to-end test.

## Implementation checklist

- [x] Four shared primary destinations and old route compatibility.
- [x] Daily card, progress states, practice entries and due review.
- [x] Preserve JLPT countdown; decode native plan profile without breaking old caches.
- [x] Restore native daily practice to unanswered questions.
- [x] Web screenshots, behavior checks, web/iOS/Catalyst builds.
- [ ] Native device/simulator runtime acceptance after unlocking/starting the device.
- [ ] Authenticated account end-to-end validation and deployment (not performed).

---

## Previous unrelated QA report (preserved)

# AI assistant illustrated guide QA

final result: passed

Scope: visual and interaction QA of the real AboutPanel / GuideBook components in an isolated local preview. The preview uses an empty authorization fixture, a simplified navigation shell, and no personal learning data. Production login, live MCP calls, and deployment are not part of this pass.

## Reference and evidence

Selected visual: option 1, `exec-44e283a9-a7ed-43aa-a935-2082e84210b0.png` in the task's generated-images folder.

Local preview: `http://localhost:4220/.local/ai-guide-preview.html#/about/guide`.

Desktop comparison uses 1487 × 1058, matching the selected source. Evidence retained locally in `.local/guide-desktop.png`, `.local/guide-comparison.jpg`; mobile evidence in `.local/guide-mobile.png` at 390 × 844.

Compared the source and implemented article in a single side-by-side image. The surrounding shell is intentionally an existing-product approximation in this fixture, not the production shell. The implemented content preserves the chapter rail, serif title, sage/ivory illustrations, reading objective, explanatory sequence and copyable example. Detailed articles continue below the initial frame.

## Iteration

P2: the reading objective initially sat above the artwork on desktop, widening the illustration and pushing the first example below the viewport. Lowered the desktop margin-note breakpoint to 1380px, constrained the article width, and moved the objective into the right margin. Recaptured and compared: the example is now visible in the first desktop viewport, and the intended three-column reading hierarchy is restored.

## Interaction checks

- Home entry opens the guide; chapter links, results directory and automation chapter render.
- All eight scenario selections update the article and hash route.
- Copy button displays success and a live-region announcement; direct browser clipboard readback was unavailable, so clipboard contents were not independently verified.
- Client selection displays Codex add/login commands.
- Result links reference existing app routes; authenticated destination content was not inspected in the isolated fixture.
- At mobile width the chapter rail wraps above the article; measured document width does not exceed viewport width; artwork loads and labels remain readable.
- A fresh preview tab has no browser console errors after scenario and chapter navigation. Earlier transient HMR messages during file creation were excluded from this final run.

## Build checks

`npm run build` passes, including the MCP app bundle (existing large-chunk warning remains).

`tsc --noEmit` reports 11 diagnostics. Compared against an archived HEAD baseline: same diagnostic files, codes and messages, with only union-member display ordering differing. No new type diagnostics.

The repository ESLint configuration does not match TS/TSX source files; this was not counted as a successful lint check.

## Remaining polish

P3: art is original and follows the chosen style rather than duplicating every decorative detail of the concept. Each caption and example is selectable localized HTML. Live-account and deployed-site verification remain separate from this component QA.

## 2026-10-02 — Selected vermilion brand

- Target: third displayed generated concept, `exec-21b002e7-1260-4260-a623-774c62f8218a.png`.
- Scope: logo and primary palette, preserving the user's later removal of the duplicate practice title and More Practice section. Keep JLPT Master Deck as the real product name; do not copy the concept's invented name or presentation swatches into UI.
- Compared source and desktop capture together: `.design-qa/web-light/vermilion-practice.jpg`. The reference includes a presentation strip; compare application content only, allowing the existing responsive density.
- Typography: existing legible system font retained. Spacing: two-column desktop practice grid and one-column mobile; no extra headings. Colors: vermilion #B65340, paper #FAF7F2, ink #30302D. Image: generated transparent overlapping-card mark shared with native assets, visibly legible at sidebar size. Copy: no new explanatory prose.
- Mobile capture: `.design-qa/web-light/vermilion-mobile.jpg`; selected navigation corrected from green to vermilion. All four practice actions remain present, scrolling supported.
- Whole-sidebar hide/show previously verified and retained. No P0/P1/P2 findings in this scoped brand change. Existing detailed learning-page styles are outside this pass.
- final result: passed
