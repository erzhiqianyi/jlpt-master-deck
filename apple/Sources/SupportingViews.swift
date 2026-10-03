import SwiftUI
import AuthenticationServices
import AVFoundation

struct PracticeHub: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(AppStore.self) private var store
    @State private var selected: PracticeEntry?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                LazyVGrid(columns: sizeClass == .compact ? [GridItem(.flexible())] : [GridItem(.adaptive(minimum: 360), spacing: 20)], spacing: 20) {
                    ForEach(PracticeEntry.ordered(dailyCompleted: store.dailyPracticeCompleted)) { entry in
                        Button { selected = entry } label: {
                            VStack(alignment: .leading, spacing: 16) {
                                Image(systemName: entry.icon).font(.title).foregroundStyle(DeckTheme.accent)
                                Text(entry.title).font(.title2.bold()).foregroundStyle(.primary)
                                Label("进入练习", systemImage: "arrow.right").font(.subheadline.bold()).foregroundStyle(DeckTheme.accent)
                            }.padding(24).frame(maxWidth: .infinity, minHeight: 150, alignment: .leading)
                                .background(.background, in: RoundedRectangle(cornerRadius: 22))
                        }.buttonStyle(.plain).accessibilityIdentifier("practice.\(entry.id)")
                    }
                }
            }.frame(maxWidth: 1000).modifier(StudyPagePadding()).frame(maxWidth: .infinity)
        }.fullScreenCover(item: $selected) { entry in
            NativePracticeScreen(entry: entry)
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
    var body: some View {
        List {
            Section("最近学习") {
                let entries = store.state.progress.sorted { ($0.value.lastReviewedAt ?? "") > ($1.value.lastReviewedAt ?? "") }
                if entries.isEmpty { Text("还没有复习记录。完成一轮练习后，会显示在这里。").foregroundStyle(.secondary) }
                ForEach(entries, id: \.key) { id, progress in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(store.items.first(where: { $0.id == id })?.original ?? store.reading.first(where: { $0.id == id })?.title ?? id).font(.headline)
                        Text("复习 \(progress.reviewCount ?? 0) 次 · 正确 \(progress.correct) · 待巩固 \(progress.wrong)").font(.subheadline).foregroundStyle(.secondary)
                    }.padding(.vertical, 8)
                }
            }
            if !store.responses.isEmpty {
                Section("本机答题") {
                    ForEach(store.responses.sorted { $0.value.answeredAt > $1.value.answeredAt }, id: \.key) { _, response in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(response.title).font(.headline)
                            Text(response.selected)
                            if let correct = response.correct {
                                Text(correct ? "回答正确" : "待巩固").font(.caption).foregroundStyle(.secondary)
                            }
                        }.padding(.vertical, 8)
                    }
                }
            }
            Section("记录的疑问") {
                if store.captures.isEmpty { Text("尚未记录疑问").foregroundStyle(.secondary) }
                ForEach(store.captures) { capture in
                    VStack(alignment: .leading, spacing: 8) { Text(capture.body); if !capture.context.isEmpty { Text(capture.context).font(.caption).foregroundStyle(.secondary) } }.padding(.vertical, 8)
                }
            }
        }.scrollContentBackground(.hidden)
    }
}
struct AccountView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var message: String?
    @State private var providers: [String] = []
    var body: some View {
        NavigationStack {
            Form {
                Section("设置") {
                    NavigationLink { CardSettingsView() } label: { Label("卡片设置", systemImage: "rectangle.on.rectangle") }
                        .accessibilityIdentifier("settings.cards")
                }
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
                        Button(store.isLoading ? "同步中…" : "同步学习数据") { Task { await store.refresh() } }
                            .disabled(store.isLoading || store.isSaving)
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
            }.navigationTitle("账户").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { DeckDismissButton(kind: .close, label: "关闭账户设置", disabled: busy || store.isSaving, identifier: "account.close") } }
        }.onAppear { providers = store.identity.providerIDs }.interactiveDismissDisabled(busy)
    }
}


struct CardSettingsView: View {
    @Environment(AppStore.self) private var store
    @State private var front = CardFields.front
    @State private var back = CardFields.back
    @State private var message: String?
    var body: some View {
        Form {
            Section { Text("与 Web 端共用正反面内容设置，缺少内容的字段自动省略。保存需要联网。") }
            fields("卡片正面", selection: $front)
            fields("卡片背面", selection: $back)
            Section {
                Button(store.isSaving ? "保存中…" : "保存卡片设置") {
                    Task {
                        do { try await store.saveCardFields(front: front, back: back); message = "卡片设置已保存" }
                        catch { message = error.localizedDescription }
                    }
                }.disabled(store.isSaving || store.isLoading)
                if let message { Text(message).font(.footnote) }
            }
        }.navigationTitle("卡片设置")
        .onAppear { front = CardFields.selected(store.state.settings, back: false); back = CardFields.selected(store.state.settings, back: true) }
    }
    private func fields(_ title: String, selection: Binding<[String]>) -> some View {
        Section(title) {
            ForEach(CardFields.all, id: \.self) { field in
                Toggle(CardFields.label(field), isOn: Binding(get: { selection.wrappedValue.contains(field) }, set: { enabled in
                    if enabled { selection.wrappedValue.append(field) }
                    else if selection.wrappedValue.count > 1 { selection.wrappedValue.removeAll { $0 == field } }
                })).disabled(store.isSaving || (selection.wrappedValue.count == 1 && selection.wrappedValue.contains(field)))
            }
        }
    }
}
struct ConfiguredCardView: View {
    @Environment(AppStore.self) private var store
    let item: StudyItem
    let fields: [String]
    let revealed: Bool
    private var orderedFields: [String] {
        let featured = ["original"] + (revealed ? ["reading", "jlpt_level", "part_of_speech"] : []) + ["images", "patterns", "meaning"]
        return featured.filter(fields.contains) + fields.filter { !featured.contains($0) && $0 != "core_memory" } + (fields.contains("core_memory") ? ["core_memory"] : [])
    }
    private var locale: String {
        if case .string(let locale) = store.state.settings?["locale"] { return locale }
        return "zh-CN"
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            ForEach(orderedFields, id: \.self) { field in
                if field == "images" {
                    ForEach(Array((item.images ?? []).enumerated()), id: \.offset) { _, image in
                        CardImageView(image: image)
                    }
                } else if let text = item.cardText(field, locale: locale) {
                    VStack(alignment: .leading, spacing: 8) {
                        if field != "original" { Text(CardFields.label(field)).font(.caption).foregroundStyle(DeckTheme.muted) }
                        Text(text).font(field == "original" ? .system(size: 42, weight: .medium, design: .serif) : field == "meaning" ? .title2 : .body)
                            .textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}
struct CardImageView: View {
    @Environment(AppStore.self) private var store
    let image: [String: String]
    @State private var bytes: Data?
    @State private var failed = false
    var body: some View {
        VStack {
            if let bytes, let bitmap = UIImage(data: bytes) { Image(uiImage: bitmap).resizable().scaledToFit().frame(maxHeight: 280) }
            else if failed { Label("图片暂时无法加载", systemImage: "photo") }
            else { ProgressView() }
            if let caption = image["caption"] { Text(caption).font(.caption).foregroundStyle(DeckTheme.muted) }
        }.task(id: image["id"] ?? image["url"]) {
            do {
                let url: URL?
                if let id = image["id"] { url = APIClient.origin.appendingPathComponent("api/item-images").appendingPathComponent(id) }
                else { url = image["url"].flatMap(URL.init(string:)) }
                guard let url, url.scheme == "https" else { failed = true; return }
                var request = URLRequest(url: url)
                if image["id"] != nil, let token = store.session?.token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
                let (data, response) = try await URLSession.shared.data(for: request)
                guard (response as? HTTPURLResponse)?.statusCode == 200, UIImage(data: data) != nil else { failed = true; return }
                bytes = data
            } catch { failed = true }
        }
    }
}
