# JLPT Master Deck — iPad / iPhone / Mac Catalyst

Native SwiftUI first version, minimum iOS/iPadOS 17. Open `JLPTMasterDeck.xcodeproj` and select the `JLPTMasterDeck` scheme. The checked-in project needs no generator to build. SPM resolves Firebase Auth/Core 12.9.0 and Google Sign-In 9.2.0.

## Implemented scope

- Five-destination adaptive sidebar and today's learning dashboard based on the approved iPad concept. Compact iPhone/iPad windows use five bottom tabs (Today, Practice, Discover, Records, Question Bank), with vocabulary, grammar, reading and listening available in Question Bank.
- The selected workspace section (including the Question Bank root) is saved per account and restored on relaunch. Ordinary background/foreground transitions retain explicit per-tab navigation paths and mounted detail/answer state. Reading and listening pin the displayed question snapshot during synchronization. Missing route IDs show a safe return page. Relaunch restoration currently covers the section, not nested details or an unfinished practice round.
- Today displays synchronized daily practice packs with question/answered counts and a direct native quiz entry. An empty practice cache offers manual sync; viewing the dashboard does not initiate a request.
- The existing orange study companion sits above the bottom safe area and opens page-specific shortcuts. Sync/capture moved out of the navigation bar. Its supplied 72pt transparent frames blink while idle and wave before opening the original shortcuts; newly saved correct answers celebrate and return to idle. One cancellable timeline owns each character, stops when inactive and uses a static fallback for Reduce Motion or missing assets. Chinese tab labels are all two characters: 今日、练习、发现、记录、题库.
- Phone layouts use a flat practice catalog (topic and mixed practice; daily work stays on Today) and compact margins for login, review, item details, listening and native exercises. Library search stays within library screens.
- Real cloud library, plans, review progress, reading questions and captures from `https://jlpt.erzhiqian.cc`.
- Searchable vocabulary/grammar library, Japanese system speech for entries and individual examples, reveal-and-rate memory review. Entry speech prefers the supplied reading when available; speech uses the synchronized web provider and voice settings for cloud audio, or Apple system Japanese voices when the browser/system provider is selected.
- Entry and example cloud speech uses the existing authenticated `/api/tts/speak` endpoint and its R2 cache. Playback saves account-scoped MP3 files locally; the speaker controls can download a single clip, and Account → local data can download the current vocabulary/grammar entries and examples in bulk. Downloads can be stopped and resumed without fetching completed clips again. Downloaded clips play offline; changing provider/voice/style/role uses a different local key.
- Memory-review speaker controls sit beside the entry within the card. The position menu selects left or right and saves the preference on this device.
- Reading passage and question side by side on wide windows; stacked on compact windows with compact margins and flat, separated answer rows. Results are saved before revealing the explanation and full-passage speech controls.
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

- Scheme `JLPTMasterDeck` includes `JLPTMasterDeckTests` (review scheduling, account isolation, route ownership and transparent animation assets) and `JLPTMasterDeckUITests` (demo-only lifecycle/navigation regression with screenshot attachments).
- Keep simulator signing enabled, including for login testing: use `CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-` for ad-hoc simulator builds. Disabling signing omits the simulator's injected Keychain entitlements and causes Google sign-in to fail with OSStatus `-34018`. Device and Catalyst distribution still require their own valid signing configuration.
- Demo validation: navigation, search, card reveal/rating, reading answer/feedback, capture/save/history, logout, portrait and landscape resizing.
- End-to-end real account and Apple provider checks require the configuration above.

Regenerating the project discovers all Swift files in `Sources/` and `Tests/`. Keep the generated project and the package resolution lockfile in version control; do not commit local signing settings or provider files.

答题与复习界面与网页保持同一布局规则：iPhone 使用紧凑单列、阅读分隔线选项和固定底部操作；iPad 使用有最大宽度的内容区，阅读在可用宽度至少 760pt 时左右排列。复习正面居中，背面将读音、等级、词性收进标题摘要，四个评分按钮始终同排固定；宽屏助记图位于右侧，窄屏上下排列，点击图片可放大，图片说明仅用于辅助阅读。

单词与语法共用原生答题和解析组件：未确认时隐藏解析，确认后显示答题结果、所选答案、编号后的正确答案、解题依据摘要和记忆点；完整依据、逐项辨析、完整翻译及来源词条按需展开。逐项辨析依照题目选项排序，正确标记以题目答案为准，旧版合并解析中的「选项」理由会保留。计时在确认成功后冻结，下一题重置计时及展开状态。Debug UI 测试使用独立示例，不修改正式练习数据。

原生 iPhone、iPad 仅在练习完成总结页展示学习伙伴形象，配合一次挥手或庆祝动作及鼓励文案，遵循系统减少动态效果设置。上下文快捷操作使用省略号菜单，答题底部只保留确认或下一题按钮；菜单直接打开，无动画等待。

练习首页提供专项、综合和模拟考试入口。模拟考试在 App 内复用网页试卷与考试流程，网页数据按原生账户隔离保留，需要联网；普通练习仍使用原生离线答题组件。“统计”首页与网页采用同一已完成练习口径，显示今天的积累、近七天作答柱状图、累计概况、模块表现、最近练习、回顾与巩固和学习资料。iPhone 单列，iPad 可用宽度至少 720pt 时两列；今日、七天和累计值均来自练习历史，按东京日期汇总，未完成练习不计入。统计页不显示底部快捷菜单。旧版“记录”导航偏好自动映射到“统计”。

账户设置包含发音设置：系统/云端服务、服务凭据、音色、Azure 风格与角色、语速、卡片正面/背面自动朗读、语法详情自动朗读、例句朗读和批量离线下载。卡片只保留播放按钮，不显示下载状态图标。卡片字段保存明确发送版本 2，返回结果与选择不一致时报告错误；返回设置页不会重新覆盖尚未保存的选择。

原生单词/语法练习随每题将练习记录写入本机待同步队列，最后一题确认后标记完成；上传时按练习 ID 合并云端历史，不覆盖网页当前正在进行的练习。同步得到的练习历史随本机学习快照保存，统计和历史回顾可离线读取。Debug 专用 `--statistics-fixture` 仅用于截图和测试，不写入真实账户。

原生 iPhone、iPad 各页已移除右下角悬浮快捷操作按钮及其占位；练习入口、朗读、答题确认与账户同步仍使用页面内的操作。

同步下载与答题上传失败分开处理：进度冲突或上传错误不会阻止题库、图片关联和练习更新；待上传队列、作答内容与本机进度保留，401 或取消仍中止。新快照原子写入成功后才更新同步时间。数据库检查顶部显示结果，并分别统计有图词汇和有图语法（关联数量，不是离线图片文件数）。助记图使用黑底全屏预览，支持双指缩放、双击放大、拖动及还原；加载失败可重试，同源图片携带账户凭据，外部图片不携带凭据。

启动分为登录状态恢复、本机快照恢复和云端同步三个阶段。登录状态确认后立即挂载主界面，本机快照在后台读取，顶部显示恢复提示；本机待上传记录加载完成前，自动/手动同步暂不执行，本机学习数据写入会提示稍后重试，避免空快照覆盖现有记录。恢复结束后按现有策略自动同步，退出或切换账户后旧恢复结果不再应用。Performance 日志分别记录登录状态恢复、本机数据恢复和云端同步耗时。

设置入口使用工作区 NavigationStack 的独立页面：iPhone 通过齿轮进入并返回原页面，iPad 在右侧内容区展示，保留侧栏。首页按学习与练习、发音与朗读、AI 与 Agent、账户与数据分组，各项进入单独子页面。账户页保留同步、离线下载、绑定与退出功能。AI 页提供 MCP 接入地址复制、接入说明、账户授权列表、刷新与确认后断开连接；演示模式仅展示接入说明，不读取或修改真实授权。

AI 入口以内容社区形式展示：复用发现封面与自适应网格，支持分类、搜索、文章详情和示例请求复制。首批八篇编辑文章来自 `scripts/build-community-articles.mjs`，包含词汇、语法、阅读、听力、每日练习、备考计划和 Dots 协作案例；标明编辑来源。连接与授权管理作为社区页面中的独立入口。当前文章为内置编辑内容，尚无用户投稿、评论或点赞后端。

显示与阅读设置提供中文、日文、英文界面语言，小／标准／大字号，以及复习和解析两个独立假名开关。保存使用网页相同的 `locale`、`fontSize`、`showReviewRuby`、`showExplanationRuby` 字段，并持久化到账户学习快照。假名以保存的 `reading` 和 `ruby_terms` 标注，不自动推测读音；题目作答区域不显示读音提示。发现列表上方直接切换“全部分享／我的分享”。

助记图和远端发现封面使用按账户隔离的 Application Support 图片缓存。显示优先读取本机文件，网络请求、文件读写和缩略图解码在独立 actor 执行。学习数据保存后独立启动图片同步，最多并发四张；图片失败不撤销题库同步，账户页显示图片下载数量、进度与重试入口。内置发现封面与 AI 社区配图已随应用安装，本身可离线显示。

复习卡片逐条显示有效例句，日文旁提供播放与循环开关，翻译单独显示。循环沿用系统／云端朗读配置，停止或离开卡片时结束。词条标题提供复制原词按钮；卡片内容底部居中显示正式编号（缺省时使用条目 ID），右侧可复制纯编号，复制后显示勾选反馈。
