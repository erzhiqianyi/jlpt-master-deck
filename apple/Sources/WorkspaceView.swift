import SwiftUI

enum Destination: String, CaseIterable, Identifiable {
    case today = "今日", practice = "练习", library = "题库", discovery = "发现", records = "记录"
    var id: String { rawValue }
    var icon: String {
        switch self { case .today: "sun.max"; case .practice: "doc.text"; case .library: "books.vertical"; case .discovery: "safari"; case .records: "chart.bar" }
    }
}

/// 5 つのタブ。各タブは自分のナビゲーションを持つ。選んだタブはアカウントごとに覚える。
struct WorkspaceView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    let accountID: String
    @AppStorage private var selected: String
    init(accountID: String) {
        self.accountID = accountID
        _selected = AppStorage(wrappedValue: Destination.today.rawValue, "workspace.tab.\(accountID)")
    }
    var body: some View {
        TabView(selection: $selected) {
            ForEach(Destination.allCases) { destination in
                NavigationStack { screen(destination) }
                    .tabItem { Label(LocalizedStringKey(destination.rawValue), systemImage: destination.icon) }
                    .tag(destination.rawValue)
                    .accessibilityIdentifier("tab.\(destination)")
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, !store.isDemo, store.isOnline,
               store.pendingCount > 0 || (store.lastSync.map { Date.now.timeIntervalSince($0) > 300 } ?? true) { store.scheduleRefresh() }
        }
    }
    @ViewBuilder private func screen(_ destination: Destination) -> some View {
        switch destination {
        case .today: TodayView()
        case .practice: PracticeHomeView()
        case .library: LibraryView()
        case .discovery: DiscoverView()
        case .records: RecordsView()
        }
    }
}

/// 同期の状態（各画面の上に出す）。
struct SyncStatusBar: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        if let stage = store.syncStage {
            HStack(spacing: 8) { ProgressView().controlSize(.small); Text(stage).font(.footnote) }
                .foregroundStyle(DeckTheme.muted).frame(maxWidth: .infinity, alignment: .leading)
        } else if !store.isOnline {
            Group {
                if store.pendingCount > 0 { Label("离线 · \(store.pendingCount) 条记录待上传", systemImage: "wifi.slash") }
                else { Label("离线 · 使用已下载的内容", systemImage: "wifi.slash") }
            }.font(.footnote).foregroundStyle(DeckTheme.muted).frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct TodayView: View {
    @Environment(AppStore.self) private var store
    @State private var reviewing = false
    @State private var runner: String?
    private var cards: (due: [String], new: [String]) { store.dueCards() }
    private var todaySets: [PracticeSetSummary] {
        let today = StudyDates.day()
        return store.practiceSets.filter { $0.kind == "daily" && ($0.date ?? "") >= today }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SyncStatusBar()
                HStack(alignment: .center, spacing: 12) {
                    CompanionAvatar(size: 56)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("今天也一起学习吧").font(.title2.bold())
                        Text(store.username).foregroundStyle(DeckTheme.muted)
                    }
                }
                DeckPanel {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("记忆卡片").font(.headline)
                        Text("待复习 \(cards.due.count) · 新卡 \(cards.new.count)").foregroundStyle(DeckTheme.muted)
                        Button(store.cardSession == nil ? "开始复习" : "继续复习") {
                            if store.cardSession == nil { store.startCards() }
                            reviewing = true
                        }.buttonStyle(PrimaryButton()).disabled(cards.due.isEmpty && cards.new.isEmpty && store.cardSession == nil)
                            .accessibilityIdentifier("today.review")
                    }
                }
                DeckPanel {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("今日练习").font(.headline)
                        if todaySets.isEmpty {
                            Text("今天还没有练习。可以让 AI 按你的情况出一份（create_practice_set），同步后就会出现在这里。").foregroundStyle(DeckTheme.muted)
                        }
                        ForEach(todaySets) { set in
                            Button { open(set.code) } label: {
                                DeckRow(title: set.title.text.isEmpty ? set.code : set.title.text, subtitle: String(localized: "\(set.questionCount) 题") + (set.completedCount > 0 ? " · " + String(localized: "完成 \(set.completedCount) 次") : ""), icon: "calendar")
                            }.buttonStyle(.plain)
                        }
                    }
                }
                if let active = store.activeAttempts.first {
                    DeckPanel {
                        Button { runner = active.clientKey } label: {
                            DeckRow(title: String(localized: "继续练习：\(active.title)"), subtitle: String(localized: "已答 \(active.answeredCount) / \(active.items.count)"), icon: "play.circle")
                        }.buttonStyle(.plain).accessibilityIdentifier("today.resume")
                    }
                }
            }.modifier(StudyPagePadding())
        }
        .background(DeckTheme.paper)
        .navigationTitle("今日")
        .refreshable { await store.refresh() }
        .fullScreenCover(isPresented: $reviewing) { CardReviewView() }
        .navigationDestination(item: $runner) { PracticeRunnerView(attemptKey: $0) }
    }
    private func open(_ code: String) {
        do { runner = try store.startPractice(code) } catch { store.handle(error) }
    }
}
