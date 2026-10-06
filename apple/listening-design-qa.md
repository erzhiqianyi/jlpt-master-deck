# iOS listening design verification — 2026-10-06

Reference: user-supplied 写真1.jpg and 写真2.jpg, showing single-question answering, answer card, pause, resume, completion summary, and mistake review.

Implemented in native SwiftUI with white content, existing brick-red accent, circular playback control, fixed audio progress slider, rounded answer choices, four-column answer card, and fixed previous/next controls. System navigation/status areas retain native iOS appearance. Result data comes from the submitted answers; free-response questions require self-review and do not count toward objective accuracy.

## Validation

- Signed iOS Simulator Debug build passed on the final source.
- `NavigationLifecycleTests/testListeningCardResumeAndResults` passed twice, with zero failures. The fixture chooses eight correct and three incorrect answers, verifies the calculated 73%, saves and exits, reopens the same group, resumes, and advances between incorrect questions.
- Six simulator screenshots were captured and inspected against the supplied six-state design. Answer-card clipping, secondary-button contrast, accent icons, sheet background and outlined save/exit button were corrected and recaptured.
- Final screenshots and export manifest: `.local/listening-design-qa/` (ignored generated output).
- Final UI test result: `/tmp/jlpt-listening-redesign-final.xcresult`.
- Final build log: `/tmp/jlpt-listening-final-build.log`.

The UI fixture uses a demo account and does not validate authenticated audio download/playback, audio seek restoration against a real recording, cloud writes, app relaunch restoration, iPad layout or physical-device interaction. A supplementary manual swipe check was unavailable because the simulator had shut down after the automated run; the automated test verifies button-based paging, while swipe paging uses the native page-style TabView.

Final result: passed for the six iPhone UI states and the tested demo workflow; the live-audio/device checks above remain unverified.
