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
