# Native client verification — 2026-10-02

- iPad Pro 11-inch (M5), iOS 26.5: build and launch passed. Landscape dashboard, portrait stacking, sidebar navigation, search, memory reveal/rating, reading feedback, and capture/history were exercised in explicit demo mode.
- Four model tests passed, covering review intervals, preserved progress, and compatible response decoding.
- Mac Catalyst build passed and the demo dashboard launched on this Mac. Signing and real Mac authentication remain separate checks.
- Google configuration: registered the Apple app in the existing `jlpt-master-deck` Firebase project; installed the public plist locally and verified the built bundle ID and reversed-client callback scheme.
- The real iPad login button opens `accounts.google.com`, displaying JLPT Master Deck. The initial login awaited user authorization; the subsequent successful OAuth and persistence checks are recorded below. Independent web UI account-ID comparison remains unverified.
- Apple provider setup, device signing, App Store distribution, and web QR login are not verified or delivered by these checks.

## Google login Keychain correction

The first OAuth attempt failed because the preview build used `CODE_SIGNING_ALLOWED=NO`. The simulator security log explicitly reported that JLPTMasterDeck had neither application-identifier nor keychain-access-groups entitlements (OSStatus -34018). Rebuilt and installed with signing enabled and an ad-hoc identity. The generated simulator entitlements now contain the application identifier and app-specific Keychain group. OAuth completed successfully after this rebuild. The authenticated dashboard loaded 346 due items, 53 grammar entries and the cloud study plan. Stopping and relaunching the app preserved the signed-in session and returned to the authenticated workspace.

Screenshots: `../.design-qa/apple-client/home-landscape.png`, `../.design-qa/apple-client/reading-landscape.png`, and `../.design-qa/apple-client/google-login.png`.

## Native practice correction

Removed the temporary web container entirely. Native topic list loads existing cloud drafts and formal packs; the 53-question 第4課 pack opened successfully in SwiftUI. Seven unit tests passed, including topic classification, question payload decoding and practice scheduling parity. No QA answer was submitted to the real account. Mixed pool uses existing formal vocabulary/grammar questions only; unpublished drafts, grouped attempt history and mock exams remain incomplete.
