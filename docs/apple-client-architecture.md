# Apple client and shared identity

## Scope and platform

The first native client lives in `apple/`, alongside the web client. It uses SwiftUI, iOS/iPadOS 17+, URLSession, Keychain, Firebase Auth and Google Sign-In. It uses the approved ivory/indigo iPad layout: sidebar, primary study area, secondary due-review/activity column. The right column stacks below the main area in narrower windows. Reading uses two columns only when sufficient width exists. Memory review is a focused full-screen flow.

Mac Catalyst is enabled on the same target. Compatible iPad binaries may also run on Apple silicon Macs, subject to distribution settings. No web app is embedded to simulate native UI.

## Identity and data ownership

Google SDK / Sign in with Apple → Firebase credential → Firebase ID token → existing `POST /api/auth/firebase` → backend session stored in Keychain. API requests use that bearer session. The native app points to the same cloud origin as the website; no user data is copied into a second native backend.

Firebase project ID and Bundle ID are checked before SDK initialization. Real sign-in cannot run with a fabricated iOS client ID or the website's web app ID. `GoogleService-Info.plist` is supplied through a local configuration step. The public API verifies the Firebase ID token and derives the user ID itself; the client never supplies a trusted user ID.

Identity equivalence is `(project, uid)`, not email. Account → bind provider first links the credential to the current Firebase user, then exchanges that identity through the authenticated backend linking endpoint. An already independently linked credential is rejected by Firebase, rather than silently merging personal data. Logout clears app state, Keychain and SDK identity and requests server session revocation. Expired sessions require sign-in again.

## API compatibility

The native client reads review-data, study-state, study-plan, reading-questions, listening-questions and captures. It submits captures through the existing endpoint. Memory ratings follow the website's 10-minute/1-day/3-day/7-day intervals and use the existing `memory-card:<itemId>` answer path. Reading progress uses the original question ID and the web-compatible `lastPracticeSessionId`; it uses the targeted memory-card answer path to update only that progress entry, never replacing the entire web answer or attempt history.

Study writes now save a per-account snapshot and pending answer queue atomically before advancing. Cached content is restored before network refresh. Manual refresh, foregrounding and connectivity recovery replay the queue. Each write checks the current progress against its captured baseline; matching target progress is treated as an already-applied retry, while a changed baseline pauses the queue without deleting local work. There is no automatic conflict-resolution UI. Existing read/modify/write APIs still allow a concurrent edit between the check and POST: a server-side atomic review-event endpoint with idempotency keys remains necessary for guaranteed multi-device synchronization. Do not describe this as conflict-free sync.

Practice packs, reading, vocabulary/grammar, plans, listening metadata and discovery lists persist per account. Audio persists on playback or explicit library download. Captures and discovery imports remain online operations. Logout removes the session and active data but keeps the account-scoped local snapshot/queue for the same account's next login.

Demo mode is explicitly labeled, uses only in-memory fixtures, and does not call mutation endpoints. It is useful for reviewing the design without OAuth configuration; it does not prove real authentication.

## Deferred QR web login

Proposed protocol, not implemented endpoints:

1. Browser creates a short-lived challenge. Server returns a random challenge ID, a separate browser-only polling secret, a short comparison code and an expiry (about 2 minutes). Store only hashes of secrets.
2. QR contains a versioned HTTPS universal link with the challenge ID. It must not contain a bearer session, Firebase token, polling secret or arbitrary redirect destination.
3. Authenticated app resolves the challenge against the pinned trusted origin and displays the requesting browser/device, expiry and comparison code. Scanning does not approve it. User explicitly confirms the matching request in the app.
4. Server records approval for the authenticated account. Browser proves possession of its separate polling secret to consume the approved challenge exactly once and obtains its own new session.
5. Enforce expiry, rate limits, reject replay, bind the browser request and use atomic state transitions: pending → approved → consumed, or denied/expired. App can cancel. Show failure states clearly; never log challenge secrets or tokens.

This requires backend storage, web UI, associated domains/universal links, camera permission, approval UI and security tests. Keep it separate from the first native delivery, as requested.

## Delivery boundaries

Code, simulator UI, unit tests, Mac build, real-provider login, device signing and App Store distribution are separate verification steps. No deployment, commit, upload or publication is implied by this first implementation.
