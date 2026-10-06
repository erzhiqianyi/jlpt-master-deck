# Discover design verification — 2026-10-06

Source visual truth: `/Users/itsuki/Downloads/ChatGPT 画像 2026年10月6日 10_29_06.png` (1470 × 1070 design board, three phone states).
Implementation screenshots:
- `/Users/itsuki/.codex/visualizations/2026/10/06/01a10ed4-b11c-77c2-a3a3-0fcfa65b97bc/discovery/mobile.jpg` (415 × 899 captured pixels; viewport override 430 × 932).
- `/Users/itsuki/.codex/visualizations/2026/10/06/01a10ed4-b11c-77c2-a3a3-0fcfa65b97bc/discovery/desktop.jpg` (1265 × 712 captured pixels; viewport override 1280 × 900).

State: public community, signed out, All. Source contains illustrative mixed content; implementation contains actual public articles. Source and mobile screenshot opened together for comparison. The browser scales screenshots and subtracts the scrollbar; comparison is proportional, not a claim of pixel identity.

## Findings
- Native and authenticated Discover runtime screenshots are missing. No simulator was booted. Both native simulator builds succeeded, but this does not verify the installed navigation, actual share list, or device layout.
- Existing product raster covers are reused. Their subjects differ from the reference's full set of watercolor illustrations; this is a recorded visual limitation, not an exact asset recreation.

## Required fidelity surfaces
- Typography: bold sans-serif title and tabs, serif cover titles, two-line card titles; existing system fonts preserve the product's Chinese/Japanese/English support.
- Layout: two columns on phones, three on tablet-width web, four on desktop; 5:6 cover ratio, 12px corners, 18px mobile grid gap. Mobile public header is reduced to search/title/settings. Public website retains its desktop language/navigation shell; app navigation stays in the existing app shell.
- Colors: warm paper surface; green primary-tab underline; peach selected subject capsule; orange practice badge and green article badge.
- Images: original product PNG covers, real Lucide/SF Symbols icons. No placeholder or handmade illustrations. Covers are sharp but not all the reference's subjects are available.
- Copy: actual published articles and share metadata replace the reference's example titles and counts. Practice filters contain All, Words, Grammar, Reading, Listening. Signed-out public practice shows a sign-in entry; signed-in requests use the existing same-origin token.

## Comparison history
1. Initial public generator did not replace a main element with attributes. Fixed the matcher and retained the skip-link target.
2. Mobile public header and permanent search input added excess height. Reduced to the reference's three-part header and expandable search.
3. Repeated generation duplicated JS/CSS resources. Removed previous tags before insertion; two repeated generation runs confirmed exactly one JS tag. A fresh browser tab reported no console errors.
4. Hidden subject filters previously affected All. Filtering is now conditional on Practice; covered by an interaction test. Article selection exits bulk management and resets My shares.

## Verification
- Browser: mobile and desktop captures; article tab/search; Practice and Grammar selection; signed-out practice entry. Fresh console: no errors.
- React DOM: 11 market interaction tests pass, including reading filter, articles-only state, subject reset behavior, previews, trial answers, imports, withdrawal confirmation, and request races.
- TypeScript: `npx tsc --noEmit` passes.
- Web production build: `npx vite build` passes (existing large bundle warning).
- Native: generic iOS Simulator build and incremental rebuild pass.
- Not verified: installed native app, authenticated browser share rendering, real login/import from the public community.

## Implementation checklist
- Completed: shared editorial catalog generated for all three website locales; Discover two-level filtering; real article links; cover badges and responsive grids.
- Remaining acceptance: native device/simulator screenshots and authenticated browser exercise.

final result: blocked


## Follow-up: own-share management — 2026-10-06

- Removed the My shares switch/filter from Discover. The top-right My shares icon opens a dedicated ownership list (`#/market/mine` on web; `WorkspaceRoute.myShares` on native). The public community has the same entry.
- Own-share detail supports editing title and introduction, updating the snapshot from the original wordbook/practice, cover upload, and confirmed withdrawal. Listening shares support metadata and cover edits; source-audio replacement remains a new share.
- Added authenticated owner-only PATCH and own-list queries. Editing preserves share IDs and independently imported copies. My shares queries include older shares beyond the public newest-200 limit.
- Browser verification used an isolated disposable local database/account at `http://127.0.0.1:5174/`. Verified root icon, dedicated list, editor, saved title/intro after reload, confirmed withdrawal, and resulting empty list. Console had no errors.
- Screenshot: `/Users/itsuki/.codex/visualizations/2026/10/06/01a10ed4-b11c-77c2-a3a3-0fcfa65b97bc/discovery/my-share-editor.jpg`.
- Latest evidence: 12 React interaction tests, 11 local/backend/Cloudflare runtime tests, TypeScript check, web production build, and native Simulator compilation pass.
- Native installed-device visual/navigation acceptance remains unverified; no booted simulator was available. The earlier exact-asset limitation remains.

final result: blocked
