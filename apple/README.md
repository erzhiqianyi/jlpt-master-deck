# JLPT Master Deck — iPad / iPhone / Mac Catalyst

Native SwiftUI first version, minimum iOS/iPadOS 17. Open `JLPTMasterDeck.xcodeproj` and select the `JLPTMasterDeck` scheme. The checked-in project needs no generator to build. SPM resolves Firebase Auth/Core 12.9.0 and Google Sign-In 9.2.0.

## Implemented scope

- Adaptive sidebar and today's learning dashboard based on the approved iPad concept. Compact iPhone/iPad windows use five bottom tabs (Today, Practice, Discover, Records, Question Bank), with vocabulary, grammar, reading and listening available in Question Bank.
- The selected workspace section (including the Question Bank root) is saved per account and restored on relaunch. Ordinary background/foreground transitions retain the live navigation stack. Relaunch restoration currently covers the section, not nested details or an unfinished practice round.
- Today displays synchronized daily practice packs with question/answered counts and a direct native quiz entry. An empty practice cache offers manual sync; viewing the dashboard does not initiate a request.
- The existing orange study companion sits above the bottom safe area and opens page-specific shortcuts. Sync/capture moved out of the navigation bar. Its short greeting/tilt animations respect Reduce Motion and stop when inactive. Chinese tab labels are all two characters: 今日、练习、发现、记录、题库.
- Phone layouts use a single-column practice catalog and compact margins for login, review, item details, listening and native exercises. Library search stays within library screens.
- Real cloud library, plans, review progress, reading questions and captures from `https://jlpt.erzhiqian.cc`.
- Searchable vocabulary/grammar library, Japanese system speech, reveal-and-rate memory review.
- Reading passage and question side by side on wide windows; stacked on compact windows; result saved before revealing the explanation.
- Listening library grouped by audio with search/type filters, authenticated playback/pause/restart, native multiple-choice and free-response input, group confirmation and post-answer explanations/transcripts. Practice counts use the same per-audio session key as the web. As on the current web flow, submitted listening selections/free text are stored on this device and visible in History; cloud persistence records the audio practice count. Recording/read-along are not implemented.
- Capture composer, recent item progress and captured-input list.
- Native practice hub, topic/daily pack lists, multiple-choice questions, saved-answer feedback and round summary. Mixed rounds sample up to 20 existing formal vocabulary/grammar questions; this does not yet reproduce all browser-generated questions. Unpublished drafts and mock exams are not supported by the native practice flow. There is no embedded web practice UI.
- Native practice saves per-question answers and item progress through `/api/answers`; full grouped attempt history/resume parity is not yet implemented.
- Google and Apple Firebase sign-in, explicit provider linking, backend session exchange, Keychain persistence and logout revocation.
- Explicit in-memory demo mode. Demo data never reaches the server. Debug launch argument `--demo` opens the demo dashboard for visual testing.

The dashboard uses task counts from the actual study plan, not invented question counts. No fabricated resume position is shown. Downloaded content can be studied offline. This release does not claim web feature parity or QR login.

## Offline study and discovery

- Account → Database Check compares current cloud counts with the saved on-disk snapshot by category. It counts unique formal question IDs, separates local-only responses/pending writes, and counts downloaded audio files separately from linked cloud audio groups. Checking does not write to local storage; syncing refreshes the comparison afterward. Missing network results are shown as unavailable, not zero. The scope is content currently synchronized by the native app, not every backend table.
- Switching tabs, entering listening/practice and returning from a practice round render the local store directly and never initiate a refresh. Missing downloads have an explicit sync action. Startup, true background-to-foreground transitions and network recovery schedule a deferred sync only if the cache is at least five minutes old or answers are pending; automatic attempts are coalesced with a one-minute cooldown. Manual sync bypasses that policy.
- Startup shows a restoration view while Keychain and offline JSON are read off the main actor. Firebase configuration is deferred until the identity service is needed. Restored content is applied only if the account generation still matches.
- Open Account → Sync learning data once while online. Vocabulary, grammar, plans, reading, formal practice packs, listening metadata and discovery listings are stored in the app's Application Support directory, separately for each account. Startup restores the snapshot before refreshing the server.
- Memory ratings, native exercise answers, reading/listening progress and submitted listening text/choices are saved atomically with a pending-write queue before advancing. Foregrounding, manual sync and connectivity recovery retry the queue. Account shows pending count, last completed content sync and failures.
- Before replaying each write, compare its starting progress with the cloud. An already-applied result is acknowledged without incrementing again; a different cloud result stops the queue and retains local records. There is no automatic conflict-resolution UI yet. The existing API is still read/modify/write, so an edit on another device between the check and write can race; this is not a server-atomic or conflict-free synchronization protocol.
- Account → Download listening audio downloads the current listening library. Playing an audio file also saves it locally. Undownloaded audio needs a connection. New captures, sign-in, importing discoveries and obtaining new content still need a connection.
- Logout removes the active session and in-memory data. Account-scoped downloaded data and pending results stay on this device for restoration after signing back into the same account. Demo data stays in memory only.
- Discover lists real shared content with a single native navigation indicator, previews shared questions and wordbook entries, and can import them into the account. Shared practice supports direct trial rounds with answers, explanations and a score; trial rounds do not write personal progress. Opening a detail requires a connection. Vocabulary/grammar remain under Study.
- Today's formal practice comes first until all its questions have answers; then topic practice comes first. No available daily practice is treated as incomplete, not as a fabricated completion.

## Configure real login

Local setup on 2026-10-02: the Apple app `cc.erzhiqian.jlptmasterdeck` was registered in `jlpt-master-deck`, its downloaded Firebase configuration was installed, and the built iPad app's callback scheme was checked against that configuration. Google sign-in opens the Google-hosted login page for JLPT Master Deck. Google OAuth, backend session exchange and cloud data loading succeeded after rebuilding with simulator signing enabled. App restart preserved the session. Browser sign-in on the Mac does not sign in the simulator.

1. Register **an Apple/iOS app** in the existing Firebase project **jlpt-master-deck**, Bundle ID **cc.erzhiqian.jlptmasterdeck**. Do not create a second Firebase project.
2. Enable Google under Authentication providers. Download the iOS `GoogleService-Info.plist`, including `CLIENT_ID` and `REVERSED_CLIENT_ID`.
3. Run `python3 apple/configure-firebase.py /absolute/path/GoogleService-Info.plist`, then `ruby apple/generate-project.rb` (requires Ruby gem `xcodeproj`). Both configuration outputs are ignored by Git. The generator includes the plist resource only when it exists.
4. Select your signing team in Xcode or set `DEVELOPMENT_TEAM` in `Config/Local.xcconfig`. Enable Sign in with Apple and Keychain Sharing for the App ID/provisioning profile, and enable/configure Apple in the **same** Firebase project's Authentication providers. The checked-in entitlements use an app-specific keychain group; macOS sandbox/network entitlements apply only to Catalyst. Apple credentials/private keys belong in the provider console, never the app or repository.
5. Run Google login on a device, and compare the backend `/api/me` user ID and library with the website. Then, while signed in with Google, use Account → bind Apple to associate Apple with that existing Firebase user. Test both providers and logout.

The backend maps `(Firebase project ID, Firebase UID)` to its internal user ID. The same Google identity in the same Firebase project reaches the same cloud account. Localhost SQLite and the cloud deployment remain separate datasets. Apple private-relay emails do **not** establish account equivalence. Existing independently created Apple/Google accounts are not automatically merged; linking errors are shown.

No real OAuth login is considered verified merely because the app compiles. Missing configuration is shown on the login screen. Production authentication needs device/provider validation after configuration.

## Mac

The iOS target enables Mac Catalyst and “Designed for iPad” compatibility on Apple silicon. Select **My Mac (Mac Catalyst)** for a Mac build. Distribution still needs signing, provisioning, App Store configuration and compatibility testing. Intel Macs require the Catalyst build; they cannot directly run the iPad binary. This is not a separate AppKit rewrite.

## Future web QR sign-in

See `docs/apple-client-architecture.md` in the repository. QR login is deliberately deferred: there is no scanner that transmits a session token and no unsecured URL callback path.

## Verification

- Scheme `JLPTMasterDeck` includes `JLPTMasterDeckTests` (review scheduling parity and real web response decoding).
- Keep simulator signing enabled, including for login testing: use `CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-` for ad-hoc simulator builds. Disabling signing omits the simulator's injected Keychain entitlements and causes Google sign-in to fail with OSStatus `-34018`. Device and Catalyst distribution still require their own valid signing configuration.
- Demo validation: navigation, search, card reveal/rating, reading answer/feedback, capture/save/history, logout, portrait and landscape resizing.
- End-to-end real account and Apple provider checks require the configuration above.

Regenerating the project discovers all Swift files in `Sources/` and `Tests/`. Keep the generated project and the package resolution lockfile in version control; do not commit local signing settings or provider files.
