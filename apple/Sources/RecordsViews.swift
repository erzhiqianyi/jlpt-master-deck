import SwiftUI

/// 発見タブ：市場の共有（単語帳・練習）。読むのも取り込むのもオンラインのときだけ。
struct DiscoverView: View {
    @Environment(AppStore.self) private var store
    @State private var shares: [ShareSummary] = []
    @State private var loading = false
    @State private var importing: String?
    var body: some View {
        List {
            if store.isDemo { Text("演示模式不能浏览分享。").foregroundStyle(DeckTheme.muted) } else if !store.isOnline { Text("离线中，联网后可以浏览分享。").foregroundStyle(DeckTheme.muted) }
            ForEach(shares) { share in
                VStack(alignment: .leading, spacing: 6) {
                    Text(share.title ?? share.id).font(.headline)
                    if let description = share.description, !description.isEmpty { Text(description).font(.subheadline).foregroundStyle(DeckTheme.muted).lineLimit(3) }
                    HStack {
                        Text(share.kind == "wordbook" ? LocalizedStringKey("单词本") : LocalizedStringKey("练习")).font(.caption).foregroundStyle(DeckTheme.muted)
                        Spacer()
                        if share.mine != true {
                            Button(importing == share.id ? LocalizedStringKey("正在导入…") : LocalizedStringKey("导入")) { Task { await importShare(share) } }
                                .buttonStyle(.bordered).disabled(importing != nil)
                        }
                    }
                }.padding(.vertical, 4)
            }
            if loading { ProgressView() }
        }
        .navigationTitle("发现")
        .task { await load() }
        .refreshable { await load() }
    }
    private func load() async {
        guard store.isOnline, !store.isDemo else { return }
        loading = true; defer { loading = false }
        do { shares = try await store.shares() } catch { store.handle(error) }
    }
    private func importShare(_ share: ShareSummary) async {
        importing = share.id; defer { importing = nil }
        do { try await store.importShare(share.id); store.notice = "已导入「\(share.title ?? share.id)」。" } catch { store.handle(error) }
    }
}

/// 記録タブ：学習の統計（オンライン）、同期の状態、記録したいこと、設定、アカウント。
struct RecordsView: View {
    @Environment(AppStore.self) private var store
    @State private var overview: StudyOverview?
    @State private var capturing = false
    var body: some View {
        List {
            SyncStatusBar()
            Section("学习统计") {
                if let overview {
                    LabeledContent("连续学习") { Text("\(overview.streak) 天") }
                    LabeledContent("作答", value: "\(overview.totals.answered)")
                    LabeledContent("正确率", value: overview.totals.accuracy.map { "\(Int(($0 * 100).rounded()))%" } ?? "—")
                    LabeledContent("卡片自评", value: "\(overview.totals.ratings)")
                    LabeledContent("待复习", value: "\(overview.knowledge.due)")
                    LabeledContent("已掌握", value: "\(overview.knowledge.mastered) / \(overview.knowledge.total)")
                } else {
                    Text(store.isOnline ? LocalizedStringKey("读取中…") : LocalizedStringKey("统计需要联网。")).foregroundStyle(DeckTheme.muted)
                }
            }
            Section("同步") {
                LabeledContent("待上传") { Text("\(store.pendingCount) 条") }
                LabeledContent("上次同步") { if let last = store.lastSync { Text(last.formatted(date: .abbreviated, time: .shortened)) } else { Text("从未") } }
                LabeledContent("已下载") { Text("\(store.knowledge.count) 个知识点 · \(store.practiceSets.filter { store.bundle($0.code) != nil }.count) 份练习") }
                Button("立即同步") { Task { await store.refresh() } }.disabled(store.isSyncing || store.isDemo || !store.isOnline)
                    .accessibilityIdentifier("records.sync")
                Button("下载练习音频") { Task { await store.downloadPracticeMedia() } }.disabled(store.isSyncing || store.isDemo || !store.isOnline)
                if !store.work.rejected.isEmpty {
                    DisclosureGroup("未能上传的记录（\(store.work.rejected.count)）" as LocalizedStringKey) {
                        ForEach(Array(store.work.rejected.enumerated()), id: \.offset) { _, result in Text(result.error ?? result.status).font(.caption) }
                    }
                }
            }
            Section {
                Button { capturing = true } label: { Label("记录一个疑问", systemImage: "square.and.pencil") }.disabled(store.isDemo)
                NavigationLink { SettingsView() } label: { Label("设置", systemImage: "gearshape") }
            }
            Section("账号") {
                Text(store.username)
                if !store.isDemo {
                    Button("绑定 Google 登录") { Task { do { try await store.acceptIdentity(store.identity.google(link: true), linking: true) } catch { store.handle(error) } } }
                }
                Button("退出登录", role: .destructive) { Task { await store.logout() } }.accessibilityIdentifier("records.logout")
            }
        }
        .navigationTitle("记录")
        .task { await load() }
        .refreshable { await store.refresh(); await load() }
        .sheet(isPresented: $capturing) { CaptureView() }
    }
    private func load() async {
        guard store.isOnline, !store.isDemo else { return }
        overview = try? await store.studyOverview()
    }
}

/// 学習中に気になったことを収集箱へ（AI があとで知識点や問題にする）。オンラインのときだけ。
struct CaptureView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var body_ = ""
    @State private var category = "word"
    @State private var context = ""
    @State private var saving = false
    var body: some View {
        NavigationStack {
            Form {
                TextField("内容（单词、语法、句子…）", text: $body_, axis: .vertical)
                Picker("类别", selection: $category) {
                    Text("单词").tag("word"); Text("语法").tag("grammar"); Text("句子").tag("sentence"); Text("听力").tag("listening"); Text("阅读").tag("reading"); Text("不确定").tag("unsure")
                }
                TextField("出处或上下文", text: $context, axis: .vertical)
                if !store.isOnline { Text("离线中，联网后才能保存。").foregroundStyle(DeckTheme.muted) }
            }
            .navigationTitle("记录疑问")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? LocalizedStringKey("保存中…") : LocalizedStringKey("保存")) {
                        Task {
                            saving = true; defer { saving = false }
                            do { try await store.createCapture(body: body_, category: category, context: context); store.notice = "已加入收集箱。"; dismiss() } catch { store.handle(error) }
                        }
                    }.disabled(body_.trimmingCharacters(in: .whitespaces).isEmpty || saving || !store.isOnline)
                }
            }
        }
    }
}

/// 設定（v3 の設定。保存はオンラインのとき）。
struct SettingsView: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        let settings = store.settings
        Form {
            Section("显示") {
                Picker("界面语言", selection: binding(settings.uiLanguage) { .object(["uiLanguage": .string($0)]) }) {
                    Text("简体中文").tag("zh-CN"); Text("日本語").tag("ja"); Text("English").tag("en")
                }
                Picker("字号", selection: binding(settings.fontScale >= 1.15 ? 1.2 : settings.fontScale < 0.95 ? 0.9 : 1.0) { .object(["fontScale": .number($0)]) }) {
                    Text("小").tag(0.9); Text("标准").tag(1.0); Text("大").tag(1.2)
                }
                Toggle("读音旁显示罗马音", isOn: binding(settings.showRomaji) { .object(["showRomaji": .bool($0)]) })
            }
            Section("练习") {
                Picker("反馈时机", selection: binding(settings.feedbackMode) { .object(["feedbackMode": .string($0)]) }) {
                    Text("每题提交后").tag("immediate"); Text("全部完成后").tag("batch")
                }
            }
            Section("朗读") {
                Picker("朗读服务", selection: binding(settings.speech.provider) { .object(["speech": .object(["provider": .string($0)])]) }) {
                    Text("系统语音").tag("browser"); Text("OpenAI").tag("openai"); Text("Google Cloud").tag("google-cloud"); Text("Azure").tag("azure")
                }
                Text("云端朗读的 API Key 请在网页的设置里配置。").font(.footnote).foregroundStyle(DeckTheme.muted)
            }
            if !store.isOnline { Text("离线中，修改需要联网后才能保存。").foregroundStyle(DeckTheme.muted) }
        }
        .disabled(!store.isOnline || store.isDemo)
        .navigationTitle("设置")
    }
    private func binding<T>(_ value: T, patch: @escaping (T) -> JSONValue) -> Binding<T> {
        Binding(get: { value }, set: { next in
            guard case .object(let body) = patch(next) else { return }
            Task { do { try await store.updateSettings(body) } catch { store.handle(error) } }
        })
    }
}
