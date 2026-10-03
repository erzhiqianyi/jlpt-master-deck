# Web responsive audit repair — 2026-10-03

## Scope and delivery

Repository: `erzhiqianyi/jlpt-master-deck`
Baseline: `213d858b23f57fa70de07b8a276d878cd0924d6c`
Local branch: `fix/responsive-web-audit`

This patch repairs the mobile and desktop **Web** experience. It does not edit Apple clients, production records, backend schema, credentials, or deployment configuration. No push, PR, merge or deployment was performed. The accompanying 178-row JSON is the complete audit disposition; it is intentionally not a claim that all 178 design proposals have been implemented.

## Implemented repair areas

1. Restore declared module actions (add/import/upload/tips/focused practice), consistent primary navigation and route-aware browsing/immersive layouts
2. Recover empty reading/listening review paths with truthful saved-progress views; historical redo creates an isolated replay with stable URLs, save ordering, retry protection and correct Back/breadcrumb behavior
3. Stable today-practice entry, compact secondary entries, concise answer feedback, expandable details, summary-first review and accessible answer sheets
4. Explicit per-question draft approval instead of default-true; preserve capture/plan input on failure and prevent duplicate requests
5. Shared 44px controls, compact/regular layout tokens, text scaling, overflow/safe-area adjustments and native dialogs; same settings depth at every width
6. Reading lookup targets and listening question stems, explicit public-share confirmation, capture status/search filters
7. Public guide navigation retains all languages and app CTA on mobile; all 39 routes retained, locale generation deterministic
8. Discovery trial completes through results without writing learning records; import requests deduplicate and retain success after refresh failure
9. Legacy mock browser storage is account/exam/revision scoped, safely handles storage failure, and does not adopt old unscoped state into an account; existing data is left untouched

## Verification

Final frozen-source results: **251/251 tests passed**, TypeScript passed, the repository lint command passed, all Web/MCP builds passed, and whitespace checks passed. The final package includes raw logs. Run:

```sh
npm ci
npx tsc --noEmit --incremental false
npm run lint
npm run build
find . -name '*.test.mjs' -not -path './node_modules/*' -not -path './.git/*' -print0 | xargs -0 node --test
git diff --check
```

The build must precede the complete repository tests because Cloudflare runtime tests consume built MCP app bundles. The existing ESLint configuration covers JavaScript but does not lint TypeScript/TSX; successful lint is not represented as TSX lint coverage. TypeScript checking and real React/jsdom interaction tests provide additional checks. jsdom is pinned to 26.1.0 to remain compatible with the project's Node >=22.13 requirement. Execution used Node 24.19.0.

The baseline had four TypeScript diagnostics in App/StudyPanels; those were fixed. Existing large-bundle warnings remain. An early aggregate test run was interrupted while tests were still being written; it is superseded by the terminal frozen-source run, not counted as a pass.

Independent source review found desktop replay Back, global-answer overwrite, premature double-Retry navigation, historical verdict recalculation and stale navigation after leaving a pending save. All were fixed and covered by regression tests. Stored historical scores/verdicts now remain separate from explicitly labeled current-version question content. Existing server retention of up to 50 attempts is unchanged; this patch does not promise unlimited historical retention or restore deleted question snapshots.

## Browser verification limitation

The available cloud browser rejected the running local Vite URL with `ERR_BLOCKED_BY_CLIENT`. No restriction was bypassed, no production account was used, and no browser geometry, screenshots, native pixel parity, physical audio, microphone or mobile keyboard testing is claimed. DOM interaction tests use synthetic data; native-dialog behavior is shimmed and does not establish real focus-trap or layout correctness.

A repeatable synthetic fixture is included at `/tests/fixtures/web-audit.html` when running `npm run dev:app`. It loads actual components for home, library, practice, actions, results, capture, settings and plan, without authentication or production writes. Capture/plan intentionally fail to expose recovery states.

### Required visual/interaction acceptance matrix

Test widths: 320, 390, 768, 820, 1024 and 1440 CSS px; standard/large app text and 200% browser zoom; Chinese, English and Japanese.

- No horizontal content clipping; controls wrap without covering content; visible targets >=44px except inline lookup words
- Bottom navigation respects safe area and appears only for browsing; selection matches destination; Back/Forward/refresh preserve identity
- Module actions are discoverable in desktop toolbar and mobile sheet; disabled actions stay disabled; Escape/Close restore trigger focus
- Home order is tasks → practice → due review; secondary actions/stats remain reachable
- Practice immediate and batch modes: first/last/unanswered/all-correct/wrong/missing question, answer sheet, repeated Next/Retry and save failure
- Replay: exact source order, original attempt unchanged within existing retention rules, unrelated active answers untouched; resume, refresh and desktop/mobile Back
- Draft: initially zero confirmed, explicitly confirm each, edit invalidates confirmation, publication still gated
- Capture: fail, retry, delayed response, duplicate submit, status failure; typed text and record remain
- Settings: same root/detail section at every width; browser speech hides provider credentials; switching providers shows only selected fields
- Reading: lookup mode and whole-option selection; long ruby/text; listening: distinct stems, real audio and upload device controls
- Discovery trial completion/retry/back, switch between shares, slow old response cannot replace new detail, duplicate import guarded
- Mock: two synthetic users cannot adopt each other's browser answers; storage failure shows warning while answers stay in memory; reload/revision change and scoring gates
- Public `/community/`, `/en/articles/ai-integration/`, `/ja/community/`: all languages/app CTA, collapsible mobile contents, every anchor and direct guide destination

## Explicit remaining scope

See `web-responsive-audit-disposition.json` for every audit ID and remaining recommendation. Major remaining groups include full single-task plan editing, broad detail/management reorganization, source snapshot/versioning for old historical questions, complete unification of old/new mock engines, selected content/editorial/localization proposals and native parity.

Privacy/terms/support pages still contain the original owner-marked drafts. A publisher-approved legal identity, final policies and private support/verification process must come from the owner; this patch does not invent or publish them. Their HTML remains unchanged.
