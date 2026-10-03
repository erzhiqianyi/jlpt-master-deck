import SwiftUI

/// The icon stays inside the navigation container's safe area, above the tab bar.
struct StudyCompanion: View {
    let destination: Destination?
    let capture: () -> Void
    let review: () -> Void
    let practice: (String) -> Void
    let open: (Destination) -> Void
    let database: () -> Void
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var lifted = false
    private var motionKey: String { "\(destination?.rawValue ?? "题库")-\(store.isLoading)-\(store.isDownloadingAudio)-\(reduceMotion)-\(scenePhase)" }
    private var busy: Bool { store.isLoading || store.isDownloadingAudio }
    var body: some View {
        HStack {
            Spacer(minLength: 0)
            Menu {
                Section("\(destination?.rawValue ?? "题库") · 快捷操作") { contextualActions }
                if destination != nil {
                    Button(action: capture) { Label(captureTitle, systemImage: "square.and.pencil") }
                }
                if destination == .today || destination == .history {
                    Divider()
                    Button { Task { await store.refresh() } } label: { Label("同步学习数据", systemImage: "arrow.triangle.2.circlepath") }
                        .disabled(store.isLoading || store.isSaving || store.isDemo || !store.isOnline)
                }
            } label: {
                Image("StudyCompanion").resizable().scaledToFit()
                    .frame(width: 80, height: 80)
                    .scaleEffect(lifted ? 1.06 : 1)
                    .rotationEffect(.degrees(lifted ? tilt : 0), anchor: .bottom)
                    .offset(y: lifted ? -5 : 0)
                    .shadow(color: DeckTheme.accent.opacity(0.12), radius: 5, y: 3)
                    .overlay(alignment: .topTrailing) {
                        if busy { ProgressView().controlSize(.mini).padding(6).background(DeckTheme.surface, in: Circle()) }
                        else if store.pendingCount > 0 {
                            Image(systemName: "arrow.up.circle.fill").foregroundStyle(DeckTheme.accent)
                                .background(DeckTheme.surface, in: Circle())
                        }
                    }
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("学习伙伴")
            .accessibilityHint("打开\(destination?.rawValue ?? "题库")的快捷操作")
            .accessibilityIdentifier("workspace.companion")
        }
        .padding(.trailing, 12).padding(.top, 4).padding(.bottom, 2)
        .task(id: motionKey) {
            lifted = false
            guard !reduceMotion, scenePhase == .active else { return }
            // Two small greeting steps on navigation / sync changes, then settle.
            do {
                for _ in 0..<2 {
                    try Task.checkCancellation()
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.55)) { lifted = true }
                    try await Task.sleep(for: .milliseconds(240))
                    withAnimation(.easeOut(duration: 0.22)) { lifted = false }
                    try await Task.sleep(for: .milliseconds(260))
                }
            } catch { lifted = false }
        }
    }
    private var captureTitle: String {
        switch destination {
        case .vocabulary: "记录词汇疑问"
        case .grammar: "记录语法疑问"
        case .reading: "记录阅读疑问"
        case .listening: "记录听力疑问"
        case .practice: "记录练习疑问"
        case .history: "记录复盘笔记"
        case .discovery: "记录学习灵感"
        default: "记录疑问"
        }
    }
    private var tilt: Double {
        switch destination {
        case .practice, .listening: 5
        case .reading, .grammar, .vocabulary: -4
        default: 2
        }
    }
    @ViewBuilder private var contextualActions: some View {
        switch destination {
        case .today:
            Button(action: review) { Label("开始记忆复习", systemImage: "rectangle.on.rectangle") }
            Button { practice("daily") } label: { Label("今日练习", systemImage: "calendar") }
        case .practice:
            ForEach(PracticeEntry.ordered(dailyCompleted: store.dailyPracticeCompleted)) { entry in
                Button { practice(entry.id) } label: { Label(entry.title, systemImage: entry.icon) }
            }
        case .vocabulary, .grammar:
            Button(action: review) { Label(destination == .grammar ? "复习到期语法" : "复习到期词汇", systemImage: "rectangle.on.rectangle") }
            Button { practice("topics") } label: { Label("专项练习", systemImage: "scope") }
        case .reading:
            Button { open(.history) } label: { Label("查看学习记录", systemImage: "chart.bar") }
        case .listening:
            Button { Task { await store.downloadListeningAudio() } } label: { Label("下载听力音频", systemImage: "arrow.down.circle") }
                .disabled(busy || store.isDemo || !store.isOnline || !store.hasListeningCache)
        case .history:
            Button(action: database) { Label("数据库检查", systemImage: "externaldrive.badge.checkmark") }
                .disabled(store.isDemo)
            Button(action: review) { Label("继续复习", systemImage: "rectangle.on.rectangle") }
        case .discovery:
            Button { open(.vocabulary) } label: { Label("我的词汇", systemImage: "character.book.closed") }
            Button { open(.listening) } label: { Label("我的听力", systemImage: "headphones") }
        case nil:
            ForEach(Array(Destination.allCases.suffix(4))) { destination in
                Button { open(destination) } label: { Label(destination.rawValue, systemImage: destination.icon) }
            }
        }
    }
}

struct DatabaseCheckSheet: View {
    var body: some View {
        NavigationStack {
            DatabaseCheckView()
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { DeckDismissButton(kind: .close, label: "关闭数据库检查", identifier: "database.close") } }
        }
    }
}

/// Detail pages own their actions, so a pushed page never inherits its library menu.
struct DetailStudyCompanion<Actions: View>: View {
    let context: String
    let captureTitle: String
    @ViewBuilder var actions: Actions
    @State private var capturePresented = false
    var body: some View {
        HStack {
            Spacer()
            Menu {
                Section(context) { actions }
                Button { capturePresented = true } label: { Label(captureTitle, systemImage: "square.and.pencil") }
            } label: {
                Image("StudyCompanion").resizable().scaledToFit().frame(width: 80, height: 80)
            }.accessibilityLabel("学习伙伴").accessibilityHint("打开当前页面的快捷操作")
                .accessibilityIdentifier("detail.companion")
        }.padding(.trailing, 12).padding(.vertical, 2)
            .sheet(isPresented: $capturePresented) { CaptureView(initialContext: context) }
    }
}
