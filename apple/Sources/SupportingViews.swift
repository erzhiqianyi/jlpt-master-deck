import SwiftUI
import AuthenticationServices
import AVFoundation

struct PracticeHub: View {
    @Environment(AppStore.self) private var store
    @State private var selected: PracticeEntry?
    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(PracticeEntry.all.filter { $0.id != "daily" }) { entry in
                    Button { selected = entry } label: {
                        DeckRow(title: entry.title, subtitle: summary(entry), icon: entry.icon)
                    }.buttonStyle(.plain).accessibilityIdentifier("practice.\(entry.id)")
                    Divider()
                }
            }.frame(maxWidth: 1200, alignment: .leading).modifier(StudyPagePadding()).frame(maxWidth: .infinity, alignment: .leading)
        }.fullScreenCover(item: $selected) { entry in
            Group { if entry.id == "mock" { NativeMockExamView() } else { NativePracticeScreen(entry: entry) } }
        }
    }
    private func summary(_ entry: PracticeEntry) -> String {
        if entry.id == "topics" {
            let count = store.drafts.filter { draft in draft.isTopic && store.packs.contains { $0.sourceDraftId == draft.id } }.count
            return "\(count) 套"
        }
        if entry.id == "mock" { return entry.subtitle }
        if entry.id == "daily" { return "\(store.todayPacks.count) 套" }
        let kinds = ["grammar", "moji_goi", "meaning", "kanji_to_kana", "kana_to_kanji"]
        let count = Set(store.packs.flatMap(\.questions).filter { $0.isUsable && kinds.contains($0.kind) }.map(\.id)).count
        return "\(count) 题"

    }
}
struct IndependentPracticeEntries: View {
    @Environment(AppStore.self) private var store
    @State private var selected: PracticeEntry?
    private var entries: [PracticeEntry] { ["topics", "mixed", "mock"].compactMap { id in PracticeEntry.all.first { $0.id == id } } }
    private func count(_ entry: PracticeEntry) -> String {
        switch entry.id {
        case "topics": return "\(store.drafts.filter { $0.isTopic }.count) 套"
        case "mixed":
            let kinds = ["grammar", "moji_goi", "meaning", "kanji_to_kana", "kana_to_kanji"]
            return "\(Set(store.packs.flatMap(\.questions).filter { $0.isUsable && kinds.contains($0.kind) }.map(\.id)).count) 题"
        default: return "查看试卷"
        }
    }
    private func rounds(_ entry: PracticeEntry) -> Int {
        let topicIDs = Set(store.drafts.filter(\.isTopic).map(\.id))
        let packIDs = Set(store.packs.filter { topicIDs.contains($0.sourceDraftId ?? "") }.map(\.id))
        return (store.state.attemptHistory ?? []).filter { attempt in
            attempt.completedAt != nil && (entry.id == "topics" ? packIDs.contains(attempt.practiceId ?? "") : attempt.view == (entry.id == "mock" ? "mock-exams" : "mixed"))
        }.count
    }
    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(entries) { entry in
                Button { selected = entry } label: {
                    VStack(spacing: 10) {
                        Image(systemName: entry.id == "topics" ? "book" : entry.icon).font(.system(size: 29)).foregroundStyle(DeckTheme.green)
                        Text(entry.title).font(.subheadline.bold())
                        Text(count(entry)).font(.subheadline).foregroundStyle(DeckTheme.muted)
                        Label("\(rounds(entry)) 次", systemImage: "arrow.counterclockwise").font(.caption).foregroundStyle(DeckTheme.muted)
                    }.frame(maxWidth: .infinity).padding(.vertical, 20).padding(.horizontal, 4)
                }.buttonStyle(.plain).accessibilityIdentifier("practice.\(entry.id)")
                if entry.id != "mock" { Rectangle().fill(DeckTheme.line).frame(width: 1, height: 110).padding(.top, 18) }
            }
        }.overlay(RoundedRectangle(cornerRadius: 18).stroke(DeckTheme.line))
            .fullScreenCover(item: $selected) { entry in
                Group { if entry.id == "mock" { NativeMockExamView() } else { NativePracticeScreen(entry: entry) } }
            }
    }
}

struct CaptureView: View {
    init(initialContext: String = "") { _context = State(initialValue: initialContext) }
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var bodyText = ""
    @State private var context = ""
    @State private var category = "unsure"
    @State private var saving = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Section("想记下什么？") {
                    TextEditor(text: $bodyText).frame(minHeight: 150).accessibilityIdentifier("capture.body")
                    Text("\(bodyText.count) / 5000").font(.caption).foregroundStyle(.secondary)
                }
                Section("分类与上下文") {
                    Picker("分类", selection: $category) {
                        Text("暂不分类").tag("unsure"); Text("词汇").tag("word"); Text("语法").tag("grammar")
                        Text("阅读").tag("reading"); Text("听力").tag("listening"); Text("句子").tag("sentence")
                    }
                    TextField("在哪里看到的？（选填）", text: $context, axis: .vertical)
                }
                if store.isDemo { Text("演示模式：仅保留在本次体验中。").foregroundStyle(.secondary) }
                if let error { Text(error).foregroundStyle(.red) }
            }.navigationTitle("记录疑问").navigationBarTitleDisplayMode(.inline).toolbar {
                ToolbarItem(placement: .cancellationAction) { DeckDismissButton(kind: .close, label: "关闭记录疑问", disabled: saving, identifier: "capture.close") }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "保存中…" : "保存") {
                        saving = true
                        Task {
                            defer { saving = false }
                            do { try await store.capture(.init(body: bodyText.trimmingCharacters(in: .whitespacesAndNewlines), category: category, context: context)); dismiss() }
                            catch { self.error = error.localizedDescription }
                        }
                    }.disabled(saving || bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || bodyText.count > 5000 || context.count > 2000)
                        .accessibilityIdentifier("capture.save")
                }
            }
        }.interactiveDismissDisabled(saving)
    }
}
struct HistoryView: View {
    @Environment(AppStore.self) private var store
    @State private var statistics = StudyStatistics(attempts: [])
    @State private var statisticsLoaded = false
    @State private var mistakeIDs: Set<String> = []
    private var green: Color { Color(red: 0.22, green: 0.46, blue: 0.43) }

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if !statisticsLoaded {
                        ProgressView("正在加载统计数据…")
                            .frame(maxWidth: .infinity, minHeight: 240)
                            .accessibilityIdentifier("statistics.loading")
                    } else {
                    if geometry.size.width >= 720 {
                        HStack(alignment: .top, spacing: 24) { todayPanel.frame(maxWidth: .infinity); weekPanel.frame(maxWidth: .infinity) }
                    } else { todayPanel; weekPanel }
                    totalPanel
                    if geometry.size.width >= 720 {
                        HStack(alignment: .top, spacing: 24) { modulePanel.frame(maxWidth: .infinity); recentPanel.frame(maxWidth: .infinity) }
                    } else { modulePanel; recentPanel }
                    linksPanel
                    }
                }.frame(maxWidth: 1120).padding(16).frame(maxWidth: .infinity)
            }.accessibilityIdentifier("statistics.dashboard")
        }
        .task(id: store.state.attemptHistory ?? []) {
            let attempts = store.state.attemptHistory ?? []
            // Yield the first frame, then aggregate off the UI thread.
            await Task.yield()
            let work = Task.detached(priority: .userInitiated) {
                let statistics = StudyStatistics(attempts: attempts)
                let mistakes = Set(statistics.attempts.flatMap(\.answers).filter { !$0.correct }.map(\.itemId))
                return (statistics, mistakes)
            }
            let result = await withTaskCancellationHandler {
                await work.value
            } onCancel: {
                work.cancel()
            }
            guard !Task.isCancelled else { return }
            statistics = result.0
            mistakeIDs = result.1
            statisticsLoaded = true
        }
    }
    private var todayPanel: some View {
        panel(tinted: true) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(Date.now.formatted(.dateTime.month().day().weekday(.wide).locale(Locale(identifier: "zh_CN")))).font(.subheadline).foregroundStyle(DeckTheme.muted)
                    Text("今天的积累").font(.headline)
                }
                Spacer()
                NavigationLink { NativeDailyStatisticsView(attempts: statistics.attempts) } label: { HStack(spacing: 5) { Text("查看统计"); Image(systemName: "arrow.right") }.font(.subheadline).foregroundStyle(green) }
            }
            metrics([(String(statistics.today.count), "完成练习"), (String(StudyStatistics.metric(statistics.today).total), "作答题数"), (StudyStatistics.metric(statistics.today).accuracy, "正确率")])
            if statistics.today.isEmpty { Text("今天还没有完成练习").font(.caption).foregroundStyle(DeckTheme.muted) }
        }
    }
    private var weekPanel: some View {
        panel {
            HStack { Text("近七天作答").font(.headline); Spacer(); Text("\(statistics.week.reduce(0) { $0 + $1.total }) 次作答").font(.caption).foregroundStyle(DeckTheme.muted) }
            HStack(alignment: .bottom, spacing: 12) {
                ForEach(statistics.week) { day in
                    VStack(spacing: 8) {
                        Text("\(day.total)").font(.caption.weight(.semibold)).foregroundStyle(green)
                        GeometryReader { bar in
                            ZStack(alignment: .bottom) {
                                RoundedRectangle(cornerRadius: 4).fill(Color(red: 0.93, green: 0.94, blue: 0.92))
                                RoundedRectangle(cornerRadius: 4).fill(day.id == statistics.week.last?.id ? green : Color(red: 0.47, green: 0.61, blue: 0.52))
                                    .frame(height: bar.size.height * CGFloat(day.total) / CGFloat(max(1, statistics.week.map(\.total).max() ?? 1)))
                            }
                        }.frame(height: 96)
                        Text(String(day.id.suffix(5)).replacingOccurrences(of: "-", with: "/")).font(.system(size: 11)).foregroundStyle(DeckTheme.muted)
                    }.frame(maxWidth: .infinity).accessibilityElement(children: .ignore).accessibilityLabel("\(day.id)：\(day.total) 次作答")
                }
            }.padding(.top, 12)
        }
    }
    private var totalPanel: some View {
        panel {
            Text("累计概况").font(.headline)
            Text("基于当前保留的已完成练习").font(.caption).foregroundStyle(DeckTheme.muted)
            metrics([(String(StudyStatistics.metric(statistics.attempts).total), "作答题数"), (StudyStatistics.metric(statistics.attempts).accuracy, "正确率"), ("\(statistics.week.filter { $0.total > 0 }.count) / 7", "七天活跃")])
        }
    }
    private var modulePanel: some View {
        panel {
            Text("模块表现").font(.headline)
            Text("累计作答 · 正确率").font(.caption).foregroundStyle(DeckTheme.muted)
            ForEach(statistics.modules, id: \.self) { module in
                let metric = StudyStatistics.metric(statistics.attempts.filter { $0.view == module })
                VStack(spacing: 10) {
                    HStack { Text(StudyStatistics.label(module)).font(.subheadline.weight(.medium)); Spacer(); Text("\(metric.total) 次作答 · \(metric.accuracy)").font(.caption).foregroundStyle(DeckTheme.muted) }
                    GeometryReader { bar in
                        ZStack(alignment: .leading) {
                            Capsule().fill(green.opacity(0.08))
                            Capsule().fill(green.opacity(0.65)).frame(width: bar.size.width * CGFloat(metric.correct) / CGFloat(max(1, metric.total)))
                        }
                    }.frame(height: 6)
                }.padding(.top, 14)
            }
        }
    }
    private var recentPanel: some View {
        panel {
            HStack { Text("最近练习").font(.headline); Spacer(); NavigationLink { NativeAttemptsList(attempts: statistics.attempts) } label: { HStack(spacing: 5) { Text("查看全部"); Image(systemName: "arrow.right") }.font(.subheadline).foregroundStyle(green) } }
            if statistics.attempts.isEmpty { Text("完成一次练习后，在这里回顾结果。").font(.subheadline).foregroundStyle(DeckTheme.muted).padding(.vertical, 16) }
            ForEach(Array(statistics.attempts.prefix(4))) { attempt in
                NavigationLink { NativeAttemptDetail(attempt: attempt) } label: { attemptRow(attempt) }.buttonStyle(.plain)
                if attempt.id != statistics.attempts.prefix(4).last?.id { Divider() }
            }
        }
    }
    private var linksPanel: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("回顾与巩固").font(.headline)
            NavigationLink { NativeAttemptsList(attempts: statistics.attempts) } label: { DeckRow(title: "练习历史", subtitle: "\(statistics.attempts.count) 次练习 · \(StudyStatistics.metric(statistics.attempts).total) 次作答", icon: "clock.arrow.circlepath") }.buttonStyle(.plain).accessibilityIdentifier("statistics.history")
            NavigationLink { NativeMistakesView(attempts: statistics.attempts) } label: { DeckRow(title: "错题集", subtitle: "\(mistakeIDs.count) 个知识点", icon: "exclamationmark.circle") }.buttonStyle(.plain)
            Divider()
            Text("学习资料").font(.headline)
            NavigationLink {
                List(store.captures) { capture in VStack(alignment: .leading, spacing: 8) { JapaneseText(text: capture.body); JapaneseText(text: capture.context).font(.caption).foregroundStyle(DeckTheme.muted) } }.navigationTitle("输入记录")
            } label: { DeckRow(title: "输入记录", subtitle: "\(store.captures.count) 条记录", icon: "square.and.pencil") }.buttonStyle(.plain)
            NavigationLink { NativeDraftStatisticsView() } label: { DeckRow(title: "练习草稿", subtitle: "\(store.drafts.count) 条记录", icon: "list.bullet.rectangle") }.buttonStyle(.plain)
        }
    }
    private func metrics(_ values: [(String, String)]) -> some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(values.indices, id: \.self) { index in
                if index > 0 { Rectangle().fill(green.opacity(0.12)).frame(width: 1, height: 64) }
                VStack(alignment: .leading, spacing: 6) {
                    Text(values[index].0).font(.system(size: 30, weight: .semibold)).foregroundStyle(green).monospacedDigit().minimumScaleFactor(0.7).lineLimit(1)
                    Text(values[index].1).font(.subheadline).foregroundStyle(DeckTheme.muted)
                }.padding(.leading, index == 0 ? 0 : 14).frame(maxWidth: .infinity, alignment: .leading)
            }
        }.padding(.top, 16)
    }
    private func panel<Content: View>(tinted: Bool = false, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8, content: content).padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(tinted ? Color(red: 0.957, green: 0.969, blue: 0.949) : DeckTheme.surface, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(DeckTheme.line.opacity(0.7), lineWidth: 1))
    }
    private func attemptRow(_ attempt: NativeAttempt) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 6) { Text(attempt.title ?? StudyStatistics.label(attempt.view)).font(.subheadline.weight(.medium)); Text("\(attempt.dateKey) · \(attempt.total) 次作答").font(.caption).foregroundStyle(DeckTheme.muted) }
            Spacer(); Image(systemName: "chevron.right").font(.caption).foregroundStyle(DeckTheme.muted)
        }.padding(.vertical, 12).foregroundStyle(DeckTheme.ink)
    }
}
struct NativeAttemptsList: View {
    let attempts: [NativeAttempt]
    var body: some View {
        List {
            if attempts.isEmpty { Text("尚无已完成的练习") }
            ForEach(attempts) { attempt in NavigationLink { NativeAttemptDetail(attempt: attempt) } label: { DeckRow(title: attempt.title ?? StudyStatistics.label(attempt.view), subtitle: "\(attempt.dateKey) · \(attempt.total) 次作答 · \(StudyStatistics.metric([attempt]).accuracy)", icon: "doc.text") } }
        }.navigationTitle("练习历史")
    }
}
struct NativeDailyStatisticsView: View {
    @Environment(AppStore.self) private var store
    let attempts: [NativeAttempt]
    @State private var date = Date.now
    var body: some View {
        VStack {
            DatePicker("统计日期", selection: $date, displayedComponents: .date).padding()
            NativeCardReviewStatistics(events: (store.state.cardReviews ?? []).filter { StudyDates.parse($0.reviewedAt).map { StudyStatistics.day($0) == StudyStatistics.day(date) } ?? false }).padding(.horizontal)
            NativeAttemptsList(attempts: attempts.filter { $0.dateKey == StudyStatistics.day(date) }) }.navigationTitle("每日统计")
    }
}
struct NativeAttemptDetail: View {
    @Environment(AppStore.self) private var store
    let attempt: NativeAttempt
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(attempt.title ?? StudyStatistics.label(attempt.view)).font(.title2.bold())
                Text("\(attempt.dateKey) · \(attempt.total) 次作答 · 正确率 \(StudyStatistics.metric([attempt]).accuracy)").foregroundStyle(DeckTheme.muted)
                ForEach(Array(attempt.answers.enumerated()), id: \.offset) { index, answer in
                    VStack(alignment: .leading, spacing: 8) {
                        let question = store.packs.flatMap(\.questions).first { $0.id == answer.questionId }
                        JapaneseText(text: "\(index + 1). \(question?.prompt ?? store.items.first { $0.id == answer.itemId }?.original ?? answer.questionId)", japanese: true, annotations: question?.japaneseAnnotations ?? [], weight: .semibold)
                        Text(answer.correct ? "回答正确" : "回答错误").foregroundStyle(answer.correct ? DeckTheme.green : DeckTheme.accent)
                        JapaneseText(text: "你的答案：\(answer.selected)")
                        if let question { JapaneseText(text: "正确答案：\(question.answer)", annotations: question.japaneseAnnotations ?? []); JapaneseText(text: question.explanationDetails.reason, explanation: true, annotations: question.japaneseAnnotations ?? []).textSelection(.enabled) }
                        else { Text("完整解析需同步对应练习题目。").font(.caption).foregroundStyle(DeckTheme.muted) }
                    }; Divider()
                }
            }.frame(maxWidth: 850).padding(16).frame(maxWidth: .infinity)
        }.navigationTitle("练习结果")
    }
}
struct NativeMistakesView: View {
    let attempts: [NativeAttempt]
    var body: some View {
        let ids = Set(attempts.flatMap(\.answers).filter { !$0.correct }.map(\.itemId))
        List {
            if ids.isEmpty { Text("暂无错题") }
            ForEach(ids.sorted(), id: \.self) { id in
                if let attempt = attempts.first(where: { $0.answers.contains { $0.itemId == id && !$0.correct } }) {
                    NavigationLink { NativeAttemptDetail(attempt: attempt) } label: { Text(attempt.title ?? id) }
                }
            }
        }.navigationTitle("错题集")
    }
}
struct NativeDraftStatisticsView: View {
    @Environment(AppStore.self) private var store
    @State private var reviewingDraft: PracticeDraft?
    @State private var round: NativeRound?
    @State private var confirmedPack: NativePack?

    var body: some View {
        List(store.drafts) { draft in
            let pack = store.packs.first { $0.sourceDraftId == draft.id }
            Button {
                if let pack { start(pack) }
                else { reviewingDraft = draft }
            } label: {
                DeckRow(title: draft.title,
                        subtitle: pack.map { "开始练习 · \($0.questions.count) 题" } ?? "\(statusLabel(draft.status)) · 查看题目",
                        icon: "doc.text")
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("draft.open.\(draft.id)")
        }
        .navigationTitle("练习草稿")
        .fullScreenCover(item: $round) { NativeQuizView(round: $0) }
        .fullScreenCover(item: $reviewingDraft, onDismiss: {
            if let pack = confirmedPack { confirmedPack = nil; start(pack) }
        }) { draft in
            NativeTopicConfirmationView(draftID: draft.id, isDaily: !draft.isTopic) { confirmedPack = $0 }
        }
    }

    private func start(_ pack: NativePack) {
        round = NativeRound(title: pack.title, questions: pack.questions.filter(\.isUsable), view: "daily-practice", practiceId: pack.id)
    }

    private func statusLabel(_ status: String) -> String {
        switch status {
        case "draft": "待审核"
        case "needs_revision": "待修改"
        case "approved": "已确认"
        case "archived": "已归档"
        default: status
        }
    }
}

struct AccountView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var message: String?
    @State private var providers: [String] = []
    var body: some View {
        Form {
                Section("当前账户") {
                    Text(store.username)
                    Text(store.isDemo ? "演示模式，不会同步或保存到真实账户。" : "与 jlpt.erzhiqian.cc 共用学习数据。").foregroundStyle(.secondary)
                }
                if !store.isDemo {
                    Section("本地数据") {
                        NavigationLink { DatabaseCheckView() } label: {
                            Label("数据库检查", systemImage: "externaldrive.badge.checkmark")
                        }.accessibilityIdentifier("account.databaseCheck")
                        if let date = store.lastSync { LabeledContent("上次同步", value: date.formatted(date: .abbreviated, time: .shortened)) }
                        LabeledContent("待同步答题", value: "\(store.pendingCount)")
                        if let notice = store.notice { Text(notice).font(.footnote).foregroundStyle(.secondary) }
                        if let stage = store.syncStage { ProgressView(stage) }
                        Button(store.isLoading ? "同步中…" : "同步学习数据") { Task { await store.refresh() } }
                            .disabled(store.isLoading || store.isSaving)
                        if !store.speechConfiguration.usesSystemVoice {
                            Button(store.isDownloadingSpeech ? "语音下载中… \(store.speechDownloadProgress)" : "下载单词、语法和例句语音") { store.startSpeechDownload() }
                                .disabled(store.isDownloadingSpeech || store.isLoading)
                            if store.isDownloadingSpeech { Button("停止语音下载") { store.cancelSpeechDownload() } }
                            Text("使用网页已配置的朗读音色。下载后优先本地播放；更换音色后需要重新下载。").font(.footnote).foregroundStyle(.secondary)
                        } else {
                            Text("当前使用系统日语朗读。云端语音下载需先在网页配置服务商，再同步学习数据。").font(.footnote).foregroundStyle(.secondary)
                        }
                        LabeledContent("已下载图片", value: "\(store.downloadedImageCount)")
                        if store.isDownloadingImages { ProgressView("图片同步中… \(store.imageDownloadProgress)") }
                        if store.imageDownloadFailures > 0 { Text("\(store.imageDownloadFailures) 张图片未下载，可联网后重试。") }
                        Button(store.isDownloadingImages ? "图片下载中…" : "同步图片到本机") { store.startImageDownload() }.disabled(store.isDownloadingImages)
                        Button(store.isDownloadingAudio ? "下载中…" : "下载听力音频") { Task { await store.downloadListeningAudio() } }
                            .disabled(store.isDownloadingAudio || store.isLoading)
                    }
                }
                if !store.isDemo {
                    Section("绑定登录方式") {
                        Text("绑定后，Apple 和 Google 都可以登录当前账户。已有独立账户不会自动合并。").font(.footnote).foregroundStyle(.secondary)
                        if providers.contains("google.com") { Label("Google 已绑定", systemImage: "checkmark.circle") }
                        else {
                            Button("绑定 Google") {
                                busy = true
                                Task {
                                    defer { busy = false }
                                    do { try await store.acceptIdentity(store.identity.google(link: true), linking: true); providers = store.identity.providerIDs; message = "Google 已绑定" }
                                    catch { message = error.localizedDescription }
                                }
                            }.disabled(busy)
                        }
                        if providers.contains("apple.com") { Label("Apple 已绑定", systemImage: "checkmark.circle") }
                        else {
                            SignInWithAppleButton(.continue) { request in
                                do { try store.identity.prepareApple(request); busy = true }
                                catch { message = error.localizedDescription }
                            } onCompletion: { result in
                                Task {
                                    defer { busy = false }
                                    do { try await store.acceptIdentity(store.identity.apple(result, link: true), linking: true); providers = store.identity.providerIDs; message = "Apple 已绑定" }
                                    catch { message = error.localizedDescription }
                                }
                            }.frame(height: 48).disabled(busy || store.identity.configurationIssue != nil)
                        }
                    }
                }
                if let message { Text(message) }
                Section {
                    Button(store.isDemo ? "退出演示，前往登录" : "退出登录", role: .destructive) {
                        Task { await store.logout(); dismiss() }
                    }.disabled(busy || store.isSaving).accessibilityIdentifier("account.logout")
                }
        }.navigationTitle("账户与数据").navigationBarTitleDisplayMode(.inline)
            .onAppear { providers = store.identity.providerIDs }
    }
}


struct CardSettingsView: View {
    @Environment(AppStore.self) private var store
    @State private var front = CardFields.front
    @State private var back = CardFields.back
    @State private var loaded = false
    @State private var message: String?
    var body: some View {
        Form {
            Section { Text("与 Web 端共用正反面内容设置，缺少内容的字段自动省略。正面读音默认隐藏，可在「卡片正面」中开启「读音」。保存需要联网。") }
            fields("卡片正面", selection: $front)
            fields("卡片背面", selection: $back)
            Section {
                Button(store.isSaving ? "保存中…" : "保存卡片设置") {
                    Task {
                        do { try await store.saveCardFields(front: front, back: back); message = "卡片设置已保存" }
                        catch { message = error.localizedDescription }
                    }
                }.disabled(store.isSaving || store.isLoading).accessibilityIdentifier("settings.cards.save")
                if let message { Text(message).font(.footnote) }
            }
        }.navigationTitle("卡片设置")
        .onAppear { guard !loaded else { return }; loaded = true; front = CardFields.selected(store.state.settings, back: false); back = CardFields.selected(store.state.settings, back: true) }
    }
    private func fields(_ title: String, selection: Binding<[String]>) -> some View {
        Section(title) {
            ForEach(CardFields.all, id: \.self) { field in
                Toggle(CardFields.label(field), isOn: Binding(get: { selection.wrappedValue.contains(field) }, set: { enabled in
                    if enabled { selection.wrappedValue.append(field) }
                    else if selection.wrappedValue.count > 1 { selection.wrappedValue.removeAll { $0 == field } }
                })).accessibilityIdentifier("settings.cards.\(title == "卡片正面" ? "front" : "back").\(field)").disabled(store.isSaving || (selection.wrappedValue.count == 1 && selection.wrappedValue.contains(field)))
            }
        }
    }
}
struct ConfiguredCardView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(AppStore.self) private var store
    let item: StudyItem
    let fields: [String]
    let revealed: Bool
    var speechControls: AnyView? = nil
    var speechSide = "right"
    private var orderedFields: [String] {
        let featured = ["original"] + (revealed ? ["reading", "jlpt_level", "part_of_speech"] : []) + (revealed ? ["core_memory", "images", "meaning", "patterns"] : ["images", "patterns", "meaning"])
        return featured.filter(fields.contains) + fields.filter { !featured.contains($0) && $0 != "core_memory" } + (!revealed && fields.contains("core_memory") ? ["core_memory"] : [])
    }
    private var locale: String {
        if case .string(let locale) = store.state.settings?["locale"] { return locale }
        return "zh-CN"
    }
    private var hasImages: Bool { fields.contains("images") && !(item.images ?? []).isEmpty }
    var body: some View {
        if hasImages && sizeClass != .compact {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 28) {
                    content(includeImages: false).frame(maxWidth: .infinity)
                    VStack(spacing: 16) {
                        ForEach(Array((item.images ?? []).enumerated()), id: \.offset) { _, image in
                            CardImageView(image: image, maxHeight: 560)
                        }
                    }.frame(width: 340)
                }.frame(minWidth: 700)
                content(includeImages: true)
            }
        } else { content(includeImages: true) }
    }
    private var metadata: [String] { revealed ? ["reading", "jlpt_level", "part_of_speech"].filter { fields.contains($0) && item.cardText($0, locale: locale) != nil } : [] }
    private var heading: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let original = item.cardText("original", locale: locale), fields.contains("original") {
                if revealed {
                    HStack(spacing: 8) {
                        if speechSide == "left" { speechControls }
                        headingWord(original)
                        NativeCopyButton(value: item.original, label: "复制单词", identifier: "review.copyWord")
                        if speechSide != "left" { speechControls }
                    }
                } else {
                    VStack(spacing: 12) {
                        headingWord(original)
                        NativeCopyButton(value: item.original, label: "复制单词", identifier: "review.copyWord")
                        speechControls
                    }.frame(maxWidth: .infinity)
                }
            } else { speechControls }
            if revealed, metadata.contains("reading"), !store.displayFlag("showReviewRuby") {
                JapaneseText(text: item.cardText("reading", locale: locale) ?? "", item: item, japanese: true, weight: .semibold).foregroundStyle(DeckTheme.muted)
            }
            if metadata.contains(where: { $0 != "reading" }) {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: 16) { ForEach(metadata.filter { $0 != "reading" }, id: \.self) { metadataEntry($0) } }
                    VStack(alignment: .leading, spacing: 8) { ForEach(metadata.filter { $0 != "reading" }, id: \.self) { metadataEntry($0) } }
                }
            }
        }.padding(revealed ? 22 : 0).frame(maxWidth: .infinity, alignment: .leading)
            .background(revealed ? DeckTheme.green.opacity(0.16) : .clear, in: RoundedRectangle(cornerRadius: 24))
    }
    private func headingWord(_ original: String) -> some View {
        JapaneseText(text: original, item: item, japanese: true, allowsRuby: revealed,
                     fontSize: (revealed ? 36 : 48) * store.textScale,
                     alignment: revealed ? .left : .center, weight: .bold)
            .textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: revealed ? .leading : .center)
    }
    private func metadataEntry(_ field: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(item.cardText(field, locale: locale) ?? "").font(.subheadline.weight(.semibold))
                .padding(.horizontal, 12).padding(.vertical, 6)
                .foregroundStyle(DeckTheme.green).background(DeckTheme.surface.opacity(0.85), in: Capsule())
        }
    }
    private func content(includeImages: Bool) -> some View {
        VStack(alignment: .leading, spacing: revealed ? 28 : 20) {
            heading
            ForEach(orderedFields.filter { $0 != "original" && !metadata.contains($0) && (includeImages || $0 != "images") }, id: \.self) { field in
                if field == "images" {
                    ForEach(Array((item.images ?? []).enumerated()), id: \.offset) { _, image in CardImageView(image: image) }
                } else if field == "examples", !item.reviewExamples.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Divider()
                        Label("例句", systemImage: "quote.opening").font(.headline).foregroundStyle(DeckTheme.green)
                        ForEach(Array(item.reviewExamples.enumerated()), id: \.offset) { index, example in
                            NativeExampleCard(
                                japanese: example.ja,
                                item: item,
                                translation: example.zh,
                                speechText: example.ja,
                                number: item.reviewExamples.count > 1 ? index + 1 : nil,
                                identifier: "review.example.\(index)"
                            )
                        }
                    }
                } else if let text = item.cardText(field, locale: locale) {
                    VStack(alignment: .leading, spacing: 10) {
                        if revealed && field == "meaning" {
                            Divider()
                            HStack(alignment: .top, spacing: 10) {
                                Text("1").font(.headline).foregroundStyle(.white).frame(width: 28, height: 28).background(DeckTheme.green, in: Circle())
                                JapaneseText(text: text, item: item, explanation: true, weight: .semibold).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                            }
                        } else {
                            if !["patterns", "meaning"].contains(field) {
                                if field != "core_memory" { Divider() }
                                Label(CardFields.label(field), systemImage: field == "core_memory" ? "sparkles" : field == "examples" ? "quote.opening" : "text.alignleft")
                                    .font(.headline).foregroundStyle(field == "core_memory" ? Color.orange : DeckTheme.green)
                            }
                            JapaneseText(text: text, item: item, japanese: field == "meaning_ja", explanation: field != "patterns")
                                .lineSpacing(6).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }.foregroundStyle(DeckTheme.ink)
    }
}

/// Keep each sentence and its translation together without reserving text width for audio controls.
struct NativeExampleCard: View {
    let japanese: String
    var item: StudyItem? = nil
    let translation: String?
    let speechText: String
    let number: Int?
    let identifier: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                if let number {
                    Text(String(format: "%02d", number))
                        .font(.caption.monospacedDigit().weight(.semibold))
                        .foregroundStyle(DeckTheme.green)
                }
                Spacer(minLength: 0)
                NativeSpeechControls(text: speechText, label: "朗读例句", iconOnly: true,
                    identifier: identifier, showsRepeat: true)
            }
            JapaneseText(text: japanese, item: item, japanese: true)
                .lineSpacing(4)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let translation, !translation.isEmpty {
                Text(translation)
                    .foregroundStyle(DeckTheme.muted)
                    .lineSpacing(3)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 14)
        .padding(.top, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DeckTheme.green.opacity(0.045), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(DeckTheme.green.opacity(0.12), lineWidth: 1))
    }
}

struct CardImageView: View {
    @Environment(AppStore.self) private var store
    let image: [String: String]
    var maxHeight: CGFloat = 280
    @State private var bitmap: UIImage?
    @State private var failed = false
    @State private var preview: MemoryImagePreview.Selection?
    @State private var retry = 0
    private var caption: String { image["caption"] ?? "助记图" }
    var body: some View {
        VStack {
            if let bitmap {
                Button { preview = .init(bitmap: bitmap, caption: caption) } label: {
                    Image(uiImage: bitmap).resizable().scaledToFit().frame(maxHeight: maxHeight)
                }.buttonStyle(.plain).accessibilityLabel("查看大图：\(caption)")
            } else if failed {
                Button { retry += 1 } label: { Label("图片加载失败，点击重试", systemImage: "arrow.clockwise") }
            } else { ProgressView().accessibilityLabel("正在加载助记图") }
        }
        .fullScreenCover(item: $preview) { MemoryImagePreview(selection: $0) }
        .task(id: "\(image["id"] ?? "")|\(image["url"] ?? "")|\(store.session?.token ?? "")|\(retry)") {
            bitmap = nil; failed = false
            do {
                bitmap = try await store.loadImage(image)
            } catch is CancellationError { }
            catch let error as URLError where error.code == .cancelled { }
            catch { failed = true }
        }
    }
}

struct MemoryImagePreview: View {
    struct Selection: Identifiable {
        let id = UUID()
        let bitmap: UIImage
        let caption: String
    }
    @Environment(\.dismiss) private var dismiss
    let selection: Selection
    @State private var reset = 0
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack(spacing: 16) {
                    Text(selection.caption).font(.subheadline).lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.headline).frame(width: 44, height: 44)
                            .background(.white.opacity(0.15), in: Circle())
                    }.accessibilityLabel("关闭大图").accessibilityIdentifier("imagePreview.close")
                }.padding(.horizontal, 16).padding(.vertical, 8)
                ZoomableMemoryImage(bitmap: selection.bitmap, caption: selection.caption, reset: reset)
                    .accessibilityIdentifier("imagePreview.image")
                HStack {
                    Text("双指缩放 · 双击放大").font(.footnote).foregroundStyle(.white.opacity(0.7))
                    Spacer()
                    Button("还原") { reset += 1 }.frame(minWidth: 44, minHeight: 44)
                        .accessibilityLabel("还原图片大小")
                }.padding(.horizontal, 20).padding(.vertical, 4)
            }
        }.foregroundStyle(.white).environment(\.colorScheme, .dark)
    }
}

struct ZoomableMemoryImage: UIViewRepresentable {
    let bitmap: UIImage
    let caption: String
    let reset: Int
    func makeUIView(context: Context) -> MemoryImageScrollView {
        let view = MemoryImageScrollView()
        view.imageView.image = bitmap
        view.imageView.accessibilityLabel = caption
        return view
    }
    func updateUIView(_ view: MemoryImageScrollView, context: Context) {
        if view.imageView.image !== bitmap {
            view.imageView.image = bitmap
            view.invalidateFit()
        }
        view.imageView.accessibilityLabel = caption
        if view.resetVersion != reset {
            view.resetVersion = reset
            view.setZoomScale(view.minimumZoomScale, animated: true)
        }
    }
}

final class MemoryImageScrollView: UIScrollView, UIScrollViewDelegate {
    let imageView = UIImageView()
    var resetVersion = 0
    private var fittedSize = CGSize.zero
    override init(frame: CGRect) {
        super.init(frame: frame)
        delegate = self
        backgroundColor = .black
        showsHorizontalScrollIndicator = false
        showsVerticalScrollIndicator = false
        contentInsetAdjustmentBehavior = .never
        bouncesZoom = true
        imageView.contentMode = .scaleAspectFit
        imageView.isAccessibilityElement = true
        imageView.accessibilityTraits = .image
        addSubview(imageView)
        let tap = UITapGestureRecognizer(target: self, action: #selector(doubleTapped(_:)))
        tap.numberOfTapsRequired = 2
        addGestureRecognizer(tap)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    func invalidateFit() { fittedSize = .zero; setNeedsLayout() }
    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0, bounds.height > 0, let image = imageView.image,
              image.size.width > 0, image.size.height > 0 else { return }
        if fittedSize != bounds.size {
            fittedSize = bounds.size
            minimumZoomScale = 1; maximumZoomScale = 1; zoomScale = 1
            imageView.frame = CGRect(origin: .zero, size: image.size)
            contentSize = image.size
            let fit = min(bounds.width / image.size.width, bounds.height / image.size.height)
            minimumZoomScale = fit
            maximumZoomScale = fit * 5
            zoomScale = fit
        }
        centerImage()
    }
    func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }
    func scrollViewDidZoom(_ scrollView: UIScrollView) { centerImage() }
    private func centerImage() {
        let horizontal = max(0, (bounds.width - contentSize.width) / 2)
        let vertical = max(0, (bounds.height - contentSize.height) / 2)
        let insets = UIEdgeInsets(top: vertical, left: horizontal, bottom: vertical, right: horizontal)
        if contentInset != insets { contentInset = insets }
    }
    @objc private func doubleTapped(_ gesture: UITapGestureRecognizer) {
        if zoomScale > minimumZoomScale * 1.05 { setZoomScale(minimumZoomScale, animated: true); return }
        let scale = min(maximumZoomScale, minimumZoomScale * 2.5)
        let point = gesture.location(in: imageView)
        let size = CGSize(width: bounds.width / scale, height: bounds.height / scale)
        zoom(to: CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2, width: size.width, height: size.height), animated: true)
    }
}

struct SpeechSettingsView: View {
    @Environment(AppStore.self) private var store
    @State private var provider = "browser"
    @State private var voice = ""
    @State private var style = ""
    @State private var role = ""
    @State private var rate = 1.0
    @State private var cardAuto = "off"
    @State private var grammarAuto = false
    @State private var includeExample = false
    @State private var providers: [Provider] = []
    @State private var voices: [Voice] = []
    @State private var credentials: [String: String] = [:]
    @State private var statuses: [CredentialStatus] = []
    @State private var busy = false
    @State private var message: String?
    struct Provider: Decodable, Identifiable {
        let id: String; let name: String; let credentialFields: [Field]; let voices: [String]; let defaultVoice: String
        struct Field: Decodable { let key: String; let label: String; let secret: Bool }
    }
    struct Voice: Decodable, Identifiable { let id: String; let name: String; let styles: [String]; let roles: [String] }
    struct CredentialStatus: Decodable { let provider: String; let configured: Bool }
    private var selected: Provider? { providers.first { $0.id == provider } }
    var body: some View {
        Form {
            Section("发音服务") {
                Picker("服务商", selection: $provider) {
                    Text("系统日语朗读").tag("browser")
                    ForEach(providers) { Text($0.name).tag($0.id) }
                    if provider != "browser" && selected == nil { Text(provider).tag(provider) }
                }.accessibilityIdentifier("settings.speech.provider")
                if let selected {
                    Text(statuses.first { $0.provider == provider }?.configured == true ? "服务已配置" : "服务尚未配置").font(.caption)
                    ForEach(selected.credentialFields, id: \.key) { field in
                        let binding = Binding(get: { credentials[field.key, default: ""] }, set: { credentials[field.key] = $0 })
                        if field.secret { SecureField(field.label, text: binding) }
                        else { TextField(field.label, text: binding).textInputAutocapitalization(.never).autocorrectionDisabled() }
                    }
                    Button("保存服务配置") { Task { await saveCredentials() } }.disabled(busy || store.isDemo)
                    Text("密钥不会从服务器读回。需要更换服务配置时，请重新填写完整配置。").font(.footnote).foregroundStyle(.secondary)
                }
            }
            Section("朗读偏好") {
                Picker("音色", selection: $voice) {
                    Text("默认音色").tag("")
                    ForEach(voices) { Text($0.name).tag($0.id) }
                    if !voice.isEmpty && !voices.contains(where: { $0.id == voice }) { Text(voice).tag(voice) }
                }
                if provider == "azure" {
                    Picker("风格", selection: $style) {
                        Text("默认").tag("")
                        ForEach(voices.first { $0.id == voice }?.styles ?? [], id: \.self) { Text($0).tag($0) }
                        if !style.isEmpty && !(voices.first { $0.id == voice }?.styles ?? []).contains(style) { Text(style).tag(style) }
                    }
                    Picker("角色", selection: $role) {
                        Text("默认").tag("")
                        ForEach(voices.first { $0.id == voice }?.roles ?? [], id: \.self) { Text($0).tag($0) }
                        if !role.isEmpty && !(voices.first { $0.id == voice }?.roles ?? []).contains(role) { Text(role).tag(role) }
                    }
                }
                LabeledContent("语速", value: String(format: "%.2f×", rate))
                Slider(value: $rate, in: 0.5...1.5, step: 0.05)
                Picker("卡片自动朗读", selection: $cardAuto) { Text("关闭").tag("off"); Text("正面").tag("front"); Text("背面").tag("back") }
                Toggle("语法详情自动朗读", isOn: $grammarAuto)
                Toggle("同时朗读例句", isOn: $includeExample)
                Button("保存发音设置") { Task { await savePreferences() } }.disabled(busy || store.isSaving).accessibilityIdentifier("settings.speech.save")
                NativeSpeechControls(text: "こんにちは。日本語の発音をテストしています。", label: "试听已保存的设置", showsDownload: false)
            }
            if !store.isDemo && provider != "browser" {
                Section("离线语音") {
                    Button(store.isDownloadingSpeech ? "下载中… \(store.speechDownloadProgress)" : "下载单词、语法和例句语音") { store.startSpeechDownload() }.disabled(store.isDownloadingSpeech || store.speechConfiguration.provider != provider)
                    if store.isDownloadingSpeech { Button("停止下载") { store.cancelSpeechDownload() } }
                    Text("播放时优先使用本地语音。更换音色后需重新下载。").font(.footnote).foregroundStyle(.secondary)
                }
            }
            if let message { Text(message).font(.footnote) }
        }.disabled(busy || store.isSaving).navigationTitle("发音设置")
        .task {
            let configuration = store.speechConfiguration
            provider = configuration.provider; rate = configuration.rate
            if case .object(let speech) = store.state.settings?["speech"] {
                if case .string(let value) = speech["cardAuto"] { cardAuto = value }
                if case .bool(let value) = speech["grammarAuto"] { grammarAuto = value }
                if case .bool(let value) = speech["includeExample"] { includeExample = value }
            }
            loadChoice()
            await loadVoices()
            guard !store.isDemo else { return }
            do {
                struct Providers: Decodable { let providers: [Provider] }
                struct Statuses: Decodable { let credentials: [CredentialStatus] }
                let result: Providers = try await store.api.get("api/tts/providers"); providers = result.providers
                let status: Statuses = try await store.api.get("api/tts/credentials"); statuses = status.credentials
                await loadVoices()
            } catch { message = error.localizedDescription }
        }.onChange(of: provider) { _, _ in credentials = [:]; loadChoice(); Task { await loadVoices() } }
    }
    private func loadChoice() {
        var settings = store.state.settings ?? [:]; settings["ttsProvider"] = .string(provider)
        let configuration = SpeechConfiguration(settings: settings)
        voice = configuration.voice; style = configuration.style; role = configuration.role
    }
    private func loadVoices() async {
        let expected = provider
        voices = expected == "browser" ? AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("ja") }.map { Voice(id: $0.identifier, name: $0.name, styles: [], roles: []) } : (selected?.voices ?? []).map { Voice(id: $0, name: $0, styles: [], roles: []) }
        guard expected != "browser", !store.isDemo else { return }
        do {
            struct Result: Decodable { let voices: [Voice] }
            let result: Result = try await store.api.get("api/tts/voices?provider=\(expected)")
            if provider == expected { voices = result.voices }
        } catch { if provider == expected { message = error.localizedDescription } }
    }
    private func saveCredentials() async {
        busy = true; defer { busy = false }
        do {
            struct Result: Decodable { let credentials: [CredentialStatus] }
            let result: Result = try await store.api.put("api/tts/credentials/\(provider)", body: credentials.filter { !$0.value.isEmpty })
            statuses = result.credentials; credentials = [:]; message = "服务配置已保存"; await loadVoices()
        } catch { message = error.localizedDescription }
    }
    private func savePreferences() async {
        busy = true; defer { busy = false }
        do {
            var speech: [String: SettingValue] = [:]
            if case .object(let value) = store.state.settings?["speech"] { speech = value }
            var choices: [String: SettingValue] = [:]
            if case .object(let value) = speech["voices"] { choices = value }
            choices[provider] = .object(["voice": .string(voice), "style": .string(style), "role": .string(role)])
            speech["voices"] = .object(choices); speech["rate"] = .number(rate); speech["cardAuto"] = .string(cardAuto)
            speech["grammarAuto"] = .bool(grammarAuto); speech["includeExample"] = .bool(includeExample)
            try await store.saveSettings(["ttsProvider": .string(provider), "speech": .object(speech)])
            message = "发音设置已保存"
        } catch { message = error.localizedDescription }
    }
}

private extension ISO8601DateFormatter {
    static var fractional: ISO8601DateFormatter {
        let value = ISO8601DateFormatter(); value.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return value
    }
}

struct PracticeFeedbackSettingsView: View {
    @Environment(AppStore.self) private var store
    @State private var mode = "immediate"
    @State private var practiceNavigation = "auto"
    @State private var practiceAutoAdvanceSeconds = 0.5
    @State private var vocabularyKinds: Set<String> = []
    private let vocabularyOptions = [("kanji_to_kana", "漢字読み（汉字读音）"), ("kana_to_kanji", "表記（假名选汉字）"), ("word_formation", "語形成（构词）"), ("moji_goi", "文脈規定（语境填空）"), ("meaning", "言い換え類義（近义替换）"), ("usage", "用法（词语用法）")]
    @State private var message: String?
    @State private var loadingSettings = false
    var body: some View {
        Form {
            Section { NavigationLink("每日练习的数据来源与时间") { NativeDailyPracticeSourceSettings() } }
            Section {
                ForEach(vocabularyOptions, id: \.0) { kind, title in
                    Button {
                        if vocabularyKinds.contains(kind) { vocabularyKinds.remove(kind) }
                        else { vocabularyKinds.insert(kind) }
                    } label: {
                        Label(title, systemImage: vocabularyKinds.contains(kind) ? "checkmark.square.fill" : "square")
                    }.buttonStyle(.plain).disabled(loadingSettings || store.isSaving)
                        .accessibilityIdentifier("settings.vocabularyKinds.\(kind)")
                        .accessibilityValue(vocabularyKinds.contains(kind) ? "已选择" : "未选择")
                }
            } header: {
                Text("单词添加规则")
            } footer: {
                Text("MCP 添加或更新单词时，每个勾选题型须提供至少一道完整题目；全部不选则不校验。此设置与网页端共用。")
            }
            Section {
                Picker("显示答案", selection: $mode) {
                    Text("每答一题后查看").tag("immediate")
                    Text("全部答完后查看").tag("batch")
                }.pickerStyle(.inline)
            } footer: { Text("应用于新开始的练习；与网页端同步。") }
            Section {
                Picker("答题后切换", selection: $practiceNavigation) {
                    Text("自动跳转").tag("auto")
                    Text("手动切换").tag("manual")
                }.pickerStyle(.segmented).accessibilityIdentifier("settings.practiceNavigation")
                if practiceNavigation == "auto" {
                    Stepper(value: $practiceAutoAdvanceSeconds, in: 0...10, step: 0.1) {
                        Text("自动跳转等待：\(practiceAutoAdvanceSeconds, specifier: "%.1f") 秒")
                    }.accessibilityIdentifier("settings.practiceAutoAdvanceSeconds")
                }
            } header: { Text("答题后切换") }
              footer: { Text("用于全部答完后查看答案的模式。0 秒表示立即跳转；逐题查看解析时，阅读后手动切换。") }
              .disabled(loadingSettings || store.isSaving)
            Section {
                Button(store.isSaving ? "保存中…" : "保存设置") {
                    Task {
                        do { try await store.saveSettings(["feedbackMode": .string(mode), "practiceNavigation": .string(practiceNavigation), "practiceAutoAdvanceSeconds": .number((practiceAutoAdvanceSeconds * 10).rounded() / 10), "jlptVocabularyQuestionKinds": .array(vocabularyOptions.map(\.0).filter { vocabularyKinds.contains($0) }.map(SettingValue.string)), "requireJlptVocabularyQuestions": .bool(!vocabularyKinds.isEmpty)]); message = "已保存" }
                        catch { message = error.localizedDescription }
                    }
                }.disabled(loadingSettings || store.isSaving || store.isLoading || (!store.isOnline && !store.isDemo))
                if let message { Text(message).font(.footnote) }
            }
        }.navigationTitle("练习设置").onAppear {
            loadVocabularyKinds(store.state.settings)
            if case .string(let saved) = store.state.settings?["feedbackMode"], ["batch", "immediate"].contains(saved) { mode = saved }
        }.task {
            guard !store.isDemo, store.isOnline else { return }
            loadingSettings = true
            defer { loadingSettings = false }
            do {
                let latest: StudyState = try await store.api.get("api/study-state/settings")
                loadVocabularyKinds(latest.settings)
                if case .string(let saved) = latest.settings?["feedbackMode"], ["batch", "immediate"].contains(saved) { mode = saved }
            } catch { message = error.localizedDescription }
        }
    }
    private func loadVocabularyKinds(_ settings: [String: SettingValue]?) {
        practiceNavigation = settings?["practiceNavigation"] == .string("manual") ? "manual" : "auto"
        if case .number(let seconds) = settings?["practiceAutoAdvanceSeconds"], seconds.isFinite {
            practiceAutoAdvanceSeconds = (min(10, max(0, seconds)) * 10).rounded() / 10
        } else { practiceAutoAdvanceSeconds = 0.5 }
        if case .array(let selected) = settings?["jlptVocabularyQuestionKinds"] {
            vocabularyKinds = Set(selected.compactMap { value in
                if case .string(let kind) = value, vocabularyOptions.contains(where: { $0.0 == kind }) { return kind }
                return nil
            })
        } else {
            vocabularyKinds = settings?["requireJlptVocabularyQuestions"] == .bool(true) ? Set(vocabularyOptions.map(\.0)) : []
        }
    }

}

extension StudyPlanProfile {
    var examLabel: String {
        let name = examName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let grade = level?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !name.isEmpty && name != "JLPT" { return name }
        if !grade.isEmpty { return "JLPT · " + grade }
        return name.isEmpty ? "考试日期" : name
    }
}

struct ExamGoalSettingsView: View {
    @Environment(AppStore.self) private var store
    @State private var kind = "date"
    @State private var name = ""
    @State private var level = ""
    @State private var date = Date.now
    @State private var busy = false
    @State private var message: String?
    private var formatter: DateFormatter {
        let value = DateFormatter(); value.dateFormat = "yyyy-MM-dd"
        value.locale = Locale(identifier: "en_US_POSIX"); value.timeZone = TimeZone(identifier: "Asia/Tokyo")
        return value
    }
    var body: some View {
        Form {
            Section("考试目标") {
                Picker("考试", selection: $kind) {
                    Text("只设置日期").tag("date")
                    Text("JLPT").tag("jlpt")
                    Text("其他考试").tag("other")
                }
                if kind == "jlpt" {
                    Picker("目标级别", selection: $level) {
                        Text("未设置").tag("")
                        ForEach(["N1", "N2", "N3", "N4", "N5"], id: \.self) { Text($0).tag($0) }
                    }
                }
                if kind == "other" { TextField("考试名称，例如 TOEIC", text: $name) }
                DatePicker("考试日期", selection: $date, displayedComponents: .date)
            }
            Section {
                Button(busy ? "保存中…" : "保存目标") { Task { await save() } }
                    .disabled(busy || store.isLoading || store.isSaving || !store.isOnline || store.isDemo)
                if let message { Text(message).font(.footnote) }
            }
        }.navigationTitle("考试目标").onAppear {
            let profile = store.plan.profile
            name = profile?.examName ?? ""
            level = profile?.level ?? ""
            kind = !name.isEmpty && name != "JLPT" ? "other" : name == "JLPT" || !level.isEmpty ? "jlpt" : "date"
            date = profile?.examDate.flatMap(formatter.date(from:)) ?? .now
        }
    }
    private func save() async {
        let examName = kind == "jlpt" ? "JLPT" : kind == "other" ? name.trimmingCharacters(in: .whitespacesAndNewlines) : ""
        guard kind != "other" || !examName.isEmpty else { message = "请输入考试名称"; return }
        busy = true; message = nil
        defer { busy = false }
        do {
            try await store.saveExamGoal(name: examName, level: kind == "jlpt" ? level : "", date: formatter.string(from: date))
            message = "考试目标已保存"
        } catch { message = error.localizedDescription }
    }
}

struct DisplayReadingSettingsView: View {
    @Environment(AppStore.self) private var store
    @State private var language = "zh-CN"
    @State private var fontScale = 1.0
    @State private var japaneseDisplay = JapaneseDisplay()
    @State private var reviewKana = false
    @State private var explanationKana = false
    @State private var saving = false
    @State private var message: String?
    @State private var loaded = false
    var body: some View {
        Form {
            Section("应用语言") {
                Picker("应用语言", selection: $language) {
                    Text("简体中文").tag("zh-CN")
                    Text("日本語").tag("ja")
                    Text("English").tag("en")
                }.accessibilityIdentifier("settings.language")
            }
            Section("字体大小") {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("字体大小")
                        Spacer()
                        Text(String(format: "%.1f×", fontScale)).monospacedDigit()
                    }
                    Slider(value: $fontScale, in: 0.8...2.0, step: 0.1)
                        .accessibilityLabel("字体大小")
                        .accessibilityValue(String(format: "%.1f×", fontScale))
                        .accessibilityIdentifier("settings.fontSize")
                    HStack {
                        Text("0.8×")
                        Spacer()
                        Text("2.0×")
                    }.font(.caption).foregroundStyle(DeckTheme.muted)
                }
                Text("显示与阅读").font(.system(size: 20 * fontScale))
            }
            Section {
                Toggle("复习时显示假名", isOn: $reviewKana).accessibilityIdentifier("settings.reviewKana")
                Toggle("解析中显示假名", isOn: $explanationKana).accessibilityIdentifier("settings.explanationKana")
                JapaneseText(text: "見落とす", japanese: true, terms: [.init(text: "見落とす", reading: "みおとす")], fontSize: 24, displayOverride: japaneseDisplay, rubyOverride: reviewKana)
            } header: { Text("假名显示") } footer: {
                Text("使用词条中保存的读音；读音题作答时不显示提示。")
            }
            Section {
                Toggle("分词模式", isOn: $japaneseDisplay.segmented).accessibilityIdentifier("settings.japanese.segmented")
                ForEach(JapaneseDisplay.categories, id: \.self) { category in
                    VStack(alignment: .leading, spacing: 8) {
                        Picker(JapaneseDisplay.labels[category] ?? category, selection: Binding(
                            get: { japaneseDisplay.styles[category]?.mode ?? "none" },
                            set: { japaneseDisplay.styles[category]?.mode = $0 }
                        )) {
                            Text("不标记").tag("none")
                            Text("彩色下划线").tag("underline")
                            Text("文字颜色").tag("text")
                        }.accessibilityIdentifier("settings.japanese.\(category).mode")
                        ColorPicker("标记颜色", selection: Binding(
                            get: { Color(UIColor(japaneseHex: japaneseDisplay.styles[category]?.color ?? "#326B9C") ?? .label) },
                            set: { japaneseDisplay.styles[category]?.color = UIColor($0).japaneseHex }
                        ), supportsOpacity: false).accessibilityIdentifier("settings.japanese.\(category).color")
                    }.disabled(!japaneseDisplay.segmented)
                }
                JapaneseText(text: "美しい景色を見た。", japanese: true,
                    annotations: [.init(text: "美しい景色を見た。", tokens: [
                        .init(surface: "美しい", reading: "うつくしい", pos: "adjective"),
                        .init(surface: "景色", reading: "けしき", pos: "noun"),
                        .init(surface: "を", pos: "particle"),
                        .init(surface: "見た", reading: "みた", pos: "verb"), .init(surface: "。")])],
                    displayOverride: japaneseDisplay, rubyOverride: reviewKana)
                    .accessibilityIdentifier("settings.japanese.preview")
            } header: { Text("日语分词与词性") } footer: {
                Text("应用于卡片、详情、练习、阅读与听力。优先使用内容中的分词标注；缺失时离线分词，无法确定词性的词不着色。")
            }
            Section {
                Button {
                    saving = true; message = nil
                    Task {
                        do {
                            try await store.saveSettings(["locale": .string(language), "fontScale": .number(fontScale), "showReviewRuby": .bool(reviewKana), "showExplanationRuby": .bool(explanationKana), "japaneseDisplay": japaneseDisplay.setting])
                            message = "已保存"
                        } catch { message = error.localizedDescription }
                        saving = false
                    }
                } label: { if saving { ProgressView() } else { Text("保存设置") } }
                .disabled(saving || store.isSaving || store.isLoading).accessibilityIdentifier("settings.display.save")
                if let message { Text(LocalizedStringKey(message)).foregroundStyle(DeckTheme.muted).accessibilityIdentifier("settings.display.status") }
            }
        }.navigationTitle(store.interfaceText("显示与阅读")).navigationBarTitleDisplayMode(.inline)
            .task {
                guard !loaded else { return }
                language = store.appLanguage
                fontScale = Double(store.textScale)
                japaneseDisplay = JapaneseDisplay(settings: store.state.settings)
                reviewKana = store.displayFlag("showReviewRuby")
                explanationKana = store.displayFlag("showExplanationRuby")
                loaded = true
            }
    }
}

struct NativeSettingsView: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        Form {
            Section("显示与阅读") {
                NavigationLink { DisplayReadingSettingsView() } label: { Label("语言、字体与日语显示", systemImage: "textformat.size") }.accessibilityIdentifier("settings.display")
            }
            Section("学习与练习") {
                NavigationLink { ExamGoalSettingsView() } label: { Label("考试目标", systemImage: "target") }.accessibilityIdentifier("settings.examGoal")
                NavigationLink { PracticeFeedbackSettingsView() } label: { Label("练习设置", systemImage: "checkmark.bubble") }.accessibilityIdentifier("settings.feedback")
                NavigationLink { CardSettingsView() } label: { Label("记忆卡片", systemImage: "rectangle.on.rectangle") }.accessibilityIdentifier("settings.cards")
            }
            Section("发音与朗读") {
                NavigationLink { SpeechSettingsView() } label: { Label("发音设置", systemImage: "speaker.wave.2") }.accessibilityIdentifier("settings.speech")
            }
            Section("AI 与 Agent") {
                NavigationLink { NativeAICommunityView() } label: {
                    Label("AI 学习社区", systemImage: "sparkles")
                }.accessibilityIdentifier("settings.ai")
            }
            Section("账户与数据") {
                NavigationLink { AccountView() } label: {
                    Label("账户、同步与离线数据", systemImage: "person.crop.circle")
                }.accessibilityIdentifier("settings.account")
            }
        }.navigationTitle(store.interfaceText("设置")).navigationBarTitleDisplayMode(.large)
            .accessibilityIdentifier("settings.page")
    }
}

private struct NativeAgentGrant: Decodable, Identifiable {
    let id: String
    let name: String
    let scopes: [String]
    let expiresAt: String
    let lastUsedAt: String
    let revoked: Bool
    let expired: Bool
}

struct NativeAISettingsView: View {
    @Environment(AppStore.self) private var store
    @State private var grants: [NativeAgentGrant] = []
    @State private var loading = false
    @State private var loaded = false
    @State private var error: String?
    @State private var pending: NativeAgentGrant?
    @State private var revoking = false
    @State private var copied = false
    private var endpoint: String { APIClient.origin.appendingPathComponent("api/jlpt/mcp").absoluteString }
    var body: some View {
        Form {
            Section("AI 学习助手") {
                Text("通过 MCP 连接 ChatGPT、Claude 等 AI 助手，整理学习笔记、生成练习和分析学习记录。")
                Text("每日练习的数据来源、复习评分、读取范围、时区与执行时间可在练习设置中配置。请在自己的 AI 客户端创建定时任务，先读取 get_daily_practice_source_context，再准备并保存练习。复习来源只复用已有题目，无题库则跳过；卡片评分不计入做题正确率。MCP 本身不执行定时任务。")
                Text("AI 生成内容需要核验后再用于正式学习。").font(.footnote).foregroundStyle(.secondary)
            }
            Section("接入 AI") {
                Text(endpoint).font(.footnote.monospaced()).textSelection(.enabled)
                Button(copied ? "已复制连接地址" : "复制连接地址") {
                    UIPasteboard.general.string = endpoint
                    copied = true
                }.accessibilityIdentifier("settings.ai.copy")
                Text("在 AI 客户端中添加此 MCP 地址，使用当前学习账户登录并确认授权范围。读写权限以授权页面为准。").font(.footnote).foregroundStyle(.secondary)
                Link("查看接入步骤", destination: APIClient.origin.appendingPathComponent("articles/ai-integration/"))
            }
            Section("已连接的 Agent") {
                if store.isDemo {
                    Text("登录后查看和管理当前账户的 AI 授权。")
                } else {
                    if loading { ProgressView("正在读取连接…") }
                    if loaded && grants.isEmpty { Text("还没有已连接的 Agent。") }
                    ForEach(grants) { grant in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack { Text(grant.name).font(.headline); Spacer(); Text(grant.expired ? "已过期" : "已授权").font(.caption).foregroundStyle(.secondary) }
                            Text("权限：" + grant.scopes.joined(separator: "、")).font(.footnote).foregroundStyle(.secondary)
                            if !grant.lastUsedAt.isEmpty { Text("最近使用：" + grant.lastUsedAt).font(.caption).foregroundStyle(.secondary) }
                            Button("断开连接", role: .destructive) { pending = grant }.disabled(revoking || loading)
                        }.padding(.vertical, 4)
                    }
                    Button("刷新连接") { Task { await load() } }.disabled(loading || revoking)
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
        }.navigationTitle("AI 与 Agent").navigationBarTitleDisplayMode(.inline)
            .task { if !store.isDemo && !loaded { await load() } }
            .alert("断开 \(pending?.name ?? "Agent")？", isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } })) {
                Button("取消", role: .cancel) { pending = nil }
                Button("断开", role: .destructive) {
                    if let grant = pending { Task { await revoke(grant) } }
                }
            } message: { Text("此 Agent 的访问令牌将立即失效，再次连接需要重新授权。") }
    }
    @MainActor private func load() async {
        guard !loading, let token = store.session?.token else { return }
        loading = true; error = nil
        defer { loading = false }
        do {
            struct Result: Decodable { let grants: [NativeAgentGrant] }
            let result: Result = try await APIClient(token: token).get("api/agents")
            grants = result.grants.filter { !$0.revoked }; loaded = true
        } catch { self.error = error.localizedDescription }
    }
    @MainActor private func revoke(_ grant: NativeAgentGrant) async {
        guard !revoking, let token = store.session?.token else { return }
        pending = nil; revoking = true; error = nil
        defer { revoking = false }
        do {
            let id = grant.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? grant.id
            let _: [String: SettingValue] = try await APIClient(token: token).post("api/agents/\(id)/revoke", body: [String: String]())
            await load()
        } catch { self.error = error.localizedDescription }
    }
}

struct NativeCopyButton: View {
    let value: String
    let label: String
    let identifier: String
    @State private var copied = false
    var body: some View {
        Button {
            UIPasteboard.general.string = value
            copied = true
        } label: {
            Image(systemName: copied ? "checkmark" : "doc.on.doc").frame(minWidth: 44, minHeight: 44)
        }.buttonStyle(.plain).foregroundStyle(copied ? DeckTheme.green : DeckTheme.muted)
            .accessibilityLabel(copied ? "已复制" : label).accessibilityIdentifier(identifier)
            .task(id: copied) {
                guard copied else { return }
                do { try await Task.sleep(for: .seconds(2)); copied = false } catch { }
            }
    }
}
struct CardIdentityFooter: View {
    let item: StudyItem
    var body: some View {
        Text(item.copyIdentifier).font(.caption.monospaced()).multilineTextAlignment(.center).textSelection(.enabled)
            .accessibilityIdentifier("review.reference.value")
            .padding(.horizontal, 48).frame(maxWidth: .infinity, minHeight: 44, alignment: .center)
            .overlay(alignment: .trailing) {
                NativeCopyButton(value: item.copyIdentifier, label: "复制编号", identifier: "review.copyReference")
            }.foregroundStyle(DeckTheme.muted).padding(.top, 16)
    }
}

struct NativeCardReviewStatistics: View {
    let events: [CardReview]
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("卡片复习情况").font(.headline)
            Text("\(events.count) 次复习 · \(Set(events.map(\.itemId)).count) 张卡片")
            Text([("forgot", "忘记"), ("hard", "困难"), ("remembered", "记得"), ("easy", "轻松")].map { rating, label in "\(label) \(events.filter { $0.rating == rating }.count)" }.joined(separator: " · "))
                .font(.caption).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
struct NativeDailyPracticeSourceSettings: View {
    @Environment(AppStore.self) private var store
    @State private var answers = true
    @State private var cardReviews = true
    @State private var ratings = ["forgot", "hard"]
    @State private var window = "previous_day"
    @State private var hours = 24
    @State private var timeZone = "Asia/Tokyo"
    @State private var runTime = Date.now
    @State private var loaded = false
    @State private var message: String?
    private var runAt: String {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "HH:mm"
        return formatter.string(from: runTime)
    }
    var body: some View {
        Form {
            Section {
                Toggle("答题记录", isOn: $answers)
                Toggle("卡片复习记录", isOn: $cardReviews)
                ForEach(["forgot", "hard", "remembered", "easy"], id: \.self) { rating in
                    Toggle(["forgot": "忘记", "hard": "困难", "remembered": "记得", "easy": "轻松"][rating]!, isOn: Binding(get: { ratings.contains(rating) }, set: { enabled in
                        if enabled { if !ratings.contains(rating) { ratings.append(rating) } }
                        else { ratings.removeAll { $0 == rating } }
                    })).disabled(!cardReviews)
                }
            } header: { Text("每日练习的数据来源") } footer: { Text("复习记录只使用卡片自带的题目，没有题库的卡片跳过，不重新生成。自评分布与做题正确率分开统计。") }
            Section {
                Picker("数据范围", selection: $window) { Text("前一天").tag("previous_day"); Text("过去若干小时").tag("last_hours") }
                if window == "last_hours" { Stepper("过去 \(hours) 小时", value: $hours, in: 1...720) }
                Picker("时区", selection: $timeZone) { ForEach(Array(Set(TimeZone.knownTimeZoneIdentifiers + [timeZone])).sorted(), id: \.self) { Text($0).tag($0) } }
                DatePicker("AI 执行时间", selection: $runTime, displayedComponents: .hourAndMinute)
            } header: { Text("时间配置") } footer: { Text("请在自己的 AI 客户端按此时间和时区配置定时任务。MCP 供 AI 读取设置与数据；保存此设置不会启动定时任务。") }
            Section {
                Button("保存设置") {
                    Task {
                        do {
                            try await store.saveSettings(["dailyPracticeSources": .object(["answers": .bool(answers), "cardReviews": .bool(cardReviews), "ratings": .array(ratings.map { .string($0) }), "window": .string(window), "hours": .number(Double(hours)), "timeZone": .string(timeZone), "runAt": .string(runAt)])])
                            message = "已保存"
                        } catch { message = error.localizedDescription }
                    }
                }.disabled(!loaded || store.isSaving || store.isLoading || (!store.isOnline && !store.isDemo))
                if let message { Text(message).font(.footnote) }
            }
        }.navigationTitle("每日练习来源").task {
            guard !loaded else { return }
            do {
                let state = store.isDemo ? store.state : try await store.api.get("api/study-state/settings") as StudyState
                if case .object(let saved) = state.settings?["dailyPracticeSources"] {
                    if case .bool(let v) = saved["answers"] { answers = v }
                    if case .bool(let v) = saved["cardReviews"] { cardReviews = v }
                    if case .array(let v) = saved["ratings"] { ratings = v.compactMap { if case .string(let s) = $0 { return s }; return nil } }
                    if case .string(let v) = saved["window"] { window = v }
                    if case .number(let v) = saved["hours"] { hours = Int(v) }
                    if case .string(let v) = saved["timeZone"] { timeZone = v }
                    if case .string(let v) = saved["runAt"] { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "HH:mm"; runTime = f.date(from: v) ?? .now }
                } else { let f = DateFormatter(); f.dateFormat = "HH:mm"; runTime = f.date(from: "07:00") ?? .now }
                loaded = true
            } catch { message = error.localizedDescription }
        }
    }
}
