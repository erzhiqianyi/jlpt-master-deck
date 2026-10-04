# Native companion and lifecycle integration — 2026-10-04

## Baseline and isolation

Original checkout: `/Users/itsuki/AI/jlpt-master-deck`, clean `main` at `778d7b5`.
Read-only remote inspection found `origin/main` at `31ee3eb` (PR #5). Work was done in an isolated local clone, branch `codex/native-companion-restoration`, based on that latest commit. The original checkout was not edited. No repository AGENTS.md or .agents directory was present. No push, merge, release or physical-device installation was performed.

## Source material

- Animation: Library `libfile_1daf2a04b234819195ee46efd604135d`, file `file_00000000e0b481f99de2cc395ab3f608`, version 0, `jlpt-mascot-animation-prototype.zip` (8,843,411 bytes).
- Design: Library `libfile_063396a499e08191b9253285591e77ea`, file `file_000000004ec881fdb01c46bf47b81ece`, version 0, `JLPT-全页面视觉设计与覆盖索引.pdf` (7,109,131 bytes).
- Both were materialized into the task workspace using the Library transfer helper, with Library identity metadata. The supplied 18-frame contact sheet and design boards were visually inspected. Existing latest Web source and `docs/ui-design-guidelines.md` were also checked; no previous Web commit was restored.

## Changes

- Native and Web use the original transparent frames and supplied timing at 72pt/72px. No rotation, scaling pulses, synthesized intermediate poses or enlarged frames amplify the prototype's small color/outline differences.
- One timeline per companion owns the current action: idle blink, a single wave before the original shortcuts, and fresh correct-answer celebration before returning to idle. Native quiz, reading and listening use accepted answer feedback; Web also covers official samples. Group feedback never celebrates before reveal. Missing assets and Reduce Motion fall back to a still; background views do not advance the timeline or open delayed shortcuts.
- Native keeps explicit per-destination ID paths. Reading/listening pin their current question snapshot so content synchronization cannot reorder an unsubmitted choice. Invalid route IDs render an unavailable page with normal back navigation. The existing authenticated root tears down on logout/account change.
- Both iPhone and iPad have five primary entries: 今日、练习、发现、记录、题库. iPad retains a native sidebar. Secondary phone routes hide primary tabs, keeping contextual back navigation. Search/filter UI starts closed. Practice uses quiet rows with real available pack/question counts and excludes daily work, which remains on Today. Discovery descriptions collapse to two lines; import is in the top-right. Listening counts use a static cycle icon.

## Restoration boundary

| Event | Behavior |
| --- | --- |
| Ordinary background/foreground | Keep the mounted route, local question snapshot, selection, modal and scroll position. A deferred data refresh does not replace the navigation root. |
| Cold process launch | Restore the existing per-account primary tab/module preference only. Nested routes and unsubmitted answers are not persisted. |
| System process eviction vs user force quit | No attempt to infer which caused a cold launch; both use the same safe cold-start policy. No claim of OS-eviction simulation. |
| Logout or invalid session | Existing login flow removes the authenticated workspace; no navigation tokens or credentials are written by this change. |

## Verification

- Xcode 26.6, iOS 26.5 Simulator, ad-hoc simulator signing enabled.
- iPad Pro 11-inch (M5): 28/28 tests passed (26 unit tests and 2 UI lifecycle tests).
- UI tests enter a reading detail, select an answer without submitting, press Home, reactivate, and assert the same choice plus scroll position within 3pt. They also exercise wave → shortcuts → original practice modal, background/reactivation, and cold-launch primary-tab restoration. All use explicit demo data, with no cloud writes.
- Web: 88/88 focused animation, responsive design, navigation/replay, shared trial and content interaction tests passed. Animation tests include delayed answer acceptance, background timer races, repeated clicks, reduced motion, failed frames and cleanup.
- TypeScript and Vite production build passed. The isolated clone reused installed dependencies by symlink; Vite used `--configLoader runner` to keep its temporary config outside the original checkout.
- iPhone 17 Pro: 2/2 UI lifecycle tests passed. Both simulator sizes produced nine named screenshot attachments (18 total), including before/after background, accepted feedback, shortcuts, modal return and cold-launch tab restoration. Final result bundles: `test_sim_2026-10-04T10-31-01-827Z_pid90853_314c25d3.xcresult` (iPad) and `test_sim_2026-10-04T10-36-52-321Z_pid90853_2b2555b0.xcresult` (iPhone).
- Initial UI test attempts exposed duplicate accessibility matches and a test helper that did not back out of a restored phone module. These test selectors were corrected; the final runs above passed.

## Limits

This is a targeted alignment of existing native screens, not a claim that every one of the 66 Web design states has a native equivalent. Native mock exams, author-owned share management, draft editing and full grouped attempt-history parity remain pre-existing capability gaps. No fabricated management actions or simulated production statistics were added.

Real-account refresh while answering, missing-content fallback, native Reduce Motion toggling, low-memory process eviction, every practice type and physical devices were not exhaustively exercised. Native asset and timing validation is automated; Web fallback/state-machine edge cases are automated. Screenshot comparisons cover representative primary, reading and shortcut/modal screens, not complete pixel parity across all pages.
