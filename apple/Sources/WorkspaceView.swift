import SwiftUI

enum Destination: String, CaseIterable, Identifiable {
    case today = "今日", practice = "练习", discovery = "发现", history = "记录"
    case vocabulary = "词汇", grammar = "语法", reading = "阅读", listening = "听力"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .today: "house"; case .practice: "doc.text"; case .discovery: "safari"; case .history: "chart.bar"
        case .vocabulary: "character.book.closed"; case .grammar: "list.bullet.rectangle"; case .reading: "book"; case .listening: "headphones"
        }
    }
}
enum WorkspaceSheet: Identifiable {
    case capture(String), account, database
    var id: String {
        switch self {
        case .capture(let context): "capture-\(context)"
        case .account: "account"
        case .database: "database"
        }
    }
}
struct ReviewSession: Identifiable { let id = UUID(); let items: [StudyItem] }

// Routes contain IDs only. They live for this account's workspace lifetime; answers
// and detail scroll positions remain owned by the mounted destination views.
// A cold launch restores the last module only, never an unfinished answer.
enum WorkspaceRoute: Hashable {
    case module(Destination), item(String), reading(String), listening(String), discovery(String)
}

struct WorkspaceNavigation {
    var paths: [Destination: [WorkspaceRoute]] = [:]
    var bank: [WorkspaceRoute] = []
    mutating func openModule(_ destination: Destination) {
        guard bank.first != .module(destination) else { return }
        bank = [.module(destination)]
    }
    var bankModule: Destination? {
        guard case .module(let destination) = bank.first else { return nil }
        return destination
    }
}

struct WorkspaceView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.horizontalSizeClass) private var sizeClass
    @AppStorage private var savedDestination: String
    private var selection: Destination? {
        get { savedDestination.isEmpty ? nil : Destination(rawValue: savedDestination) ?? .today }
        nonmutating set {
            if let newValue, Destination.allCases.suffix(4).contains(newValue) {
                navigation.openModule(newValue)
            }
            savedDestination = newValue?.rawValue ?? ""
        }
    }
    @State private var navigation = WorkspaceNavigation()
    @State private var sheet: WorkspaceSheet?
    @State private var review: ReviewSession?
    @State private var query = ""
    @State private var companionPractice: PracticeEntry?
    @State private var foregroundGate = ForegroundRefreshGate()
    init(accountID: String) {
        _savedDestination = AppStorage(wrappedValue: Destination.today.rawValue,
                                      "workspace.destination.\(accountID)")
    }
    private var usesTabs: Bool { UIDevice.current.userInterfaceIdiom == .phone || sizeClass == .compact }
    var body: some View {
        Group {
            if usesTabs {
                TabView(selection: compactSelection) {
                    ForEach(Array(Destination.allCases.prefix(4))) { destination in
                        NavigationStack(path: path(for: destination)) {
                            detail(destination).navigationDestination(for: WorkspaceRoute.self, destination: routeView)
                        }
                            .tabItem { Label(destination.rawValue, systemImage: destination.icon) }
                            .tag(destination)
                    }
                    NavigationStack(path: bankPath) {
                        bankRoot.navigationDestination(for: WorkspaceRoute.self, destination: routeView)
                    }
                    .tabItem { Label("题库", systemImage: "square.grid.2x2") }
                    .tag(Destination.reading)
                }.tint(DeckTheme.accent)
            } else {
                NavigationSplitView {
                    VStack(alignment: .leading, spacing: 12) {
                        Label { Text("JLPT\nMaster Deck").font(.title2.weight(.semibold)) } icon: {
                            Image("BrandMark").resizable().scaledToFit().frame(width: 40, height: 40)
                        }.padding(.horizontal, 20).padding(.top, 25).padding(.bottom, 15)
                        List(selection: Binding<Destination?>(get: { compactDestination }, set: { value in
                            if let value { compactSelection.wrappedValue = value }
                        })) {
                            ForEach(Array(Destination.allCases.prefix(4))) { destination in nav(destination) }
                            NavigationLink(value: Destination.reading) {
                                Label("题库", systemImage: "square.grid.2x2").padding(.vertical, 8)
                            }.tag(Destination.reading).accessibilityIdentifier("nav.题库")
                        }.listStyle(.sidebar).scrollContentBackground(.hidden)
                        Button { sheet = .account } label: {
                            HStack { Image(systemName: "person.crop.circle.fill").font(.title); Text(store.username).lineLimit(1); Spacer(); Image(systemName: "gearshape") }
                                .foregroundStyle(DeckTheme.muted).padding(20)
                        }.buttonStyle(.plain).accessibilityIdentifier("workspace.account")
                    }.background(DeckTheme.paper).navigationSplitViewColumnWidth(min: 190, ideal: 215, max: 250)
                } detail: {
                    if compactDestination == .reading {
                        NavigationStack(path: bankPath) {
                            bankRoot.navigationDestination(for: WorkspaceRoute.self, destination: routeView)
                        }
                    } else {
                        NavigationStack(path: path(for: compactDestination)) {
                            detail(compactDestination).navigationDestination(for: WorkspaceRoute.self, destination: routeView)
                        }.id(compactDestination)
                    }
                }.navigationSplitViewStyle(.balanced)
            }
        }
        .foregroundStyle(DeckTheme.ink)
        .sheet(item: $sheet) { value in
            switch value { case .capture(let context): CaptureView(initialContext: context); case .account: AccountView(); case .database: DatabaseCheckSheet() }
        }
        .fullScreenCover(item: $companionPractice) { NativePracticeScreen(entry: $0) }
        .fullScreenCover(item: $review) { session in MemoryReviewView(items: session.items) }
        .onAppear {
            if let selection, Destination.allCases.suffix(4).contains(selection) {
                navigation.openModule(selection)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if foregroundGate.update(phase) { store.scheduleAutomaticRefresh() }
        }
    }
    // All four study modules belong to the final tab, while retaining their route.
    private var compactDestination: Destination {
        guard let selection else { return .reading }
        return Destination.allCases.prefix(4).contains(selection) ? selection : .reading
    }
    private var compactSelection: Binding<Destination> {
        Binding(get: { compactDestination }, set: { value in
            // SwiftUI can write the current tab again while restoring the scene.
            // Keep a selected study module when its containing tab is unchanged.
            guard value != compactDestination else { return }
            selection = value == .reading ? navigation.bankModule : value
        })
    }
    private func path(for destination: Destination) -> Binding<[WorkspaceRoute]> {
        Binding(get: { navigation.paths[destination, default: []] },
                set: { navigation.paths[destination] = $0 })
    }
    private var bankPath: Binding<[WorkspaceRoute]> {
        Binding(get: { navigation.bank }, set: { routes in
            navigation.bank = routes
            if compactDestination == .reading { savedDestination = navigation.bankModule?.rawValue ?? "" }
        })
    }
    private var bankRoot: some View {
        List(Array(Destination.allCases.suffix(4))) { destination in
            Button { selection = destination } label: {
                DeckRow(title: destination.rawValue, subtitle: "", icon: destination.icon)
            }.buttonStyle(.plain)
                .listRowBackground(DeckTheme.surface)
                .accessibilityIdentifier("nav.\(destination.id)")
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .modifier(WorkspacePageStyle(title: "题库"))
        .safeAreaInset(edge: .bottom, spacing: 0) { companion(nil) }
        .toolbar { workspaceToolbar(showAccount: true) }
    }
    private func routeView(_ route: WorkspaceRoute) -> some View {
        routeContent(route).toolbar(usesTabs ? .hidden : .automatic, for: .tabBar)
    }
    @ViewBuilder private func routeContent(_ route: WorkspaceRoute) -> some View {
        switch route {
        case .module(let destination): detail(destination)
        case .item(let id):
            if let item = store.items.first(where: { $0.id == id }) {
                ItemDetailView(item: item, review: { review = ReviewSession(items: [item]) })
            } else { unavailableRoute }
        case .reading(let id):
            if let question = store.reading.first(where: { $0.id == id }) {
                ReadingPracticeView(question: question)
            } else { unavailableRoute }
        case .listening(let id):
            if let group = ListeningGroup.make(store.listening).first(where: { $0.id == id }) {
                ListeningDetailView(group: group)
            } else { unavailableRoute }
        case .discovery(let id):
            if let share = store.shares.first(where: { $0.id == id }) {
                DiscoveryDetailView(share: share)
            } else { unavailableRoute }
        }
    }
    private var unavailableRoute: some View {
        ContentUnavailableView("内容已不可用", systemImage: "doc.questionmark", description: Text("请返回列表选择其他内容。"))
            .navigationTitle("内容已不可用")
    }
    private func detail(_ destination: Destination) -> some View {
        Group {
            switch destination {
            case .today: TodayView(open: { selection = $0 }, review: startReview, capture: { sheet = .capture("今日") })
            case .practice: PracticeHub()
            case .discovery: DiscoveryView()
            case .vocabulary, .grammar:
                LibraryView(grammarOnly: destination == .grammar, vocabularyOnly: destination == .vocabulary, query: query, review: { review = ReviewSession(items: [$0]) })
            case .reading: ReadingLibraryView()
            case .history: HistoryView()
            case .listening: ListeningLibraryView()
            }
        }
        .modifier(WorkspacePageStyle(title: destination == .today ? "今日学习" : destination.rawValue))
        .toolbar { workspaceToolbar(showAccount: Destination.allCases.prefix(4).contains(destination)) }
        .safeAreaInset(edge: .bottom, spacing: 0) { companion(destination).id(destination) }
        .modifier(LibrarySearch(enabled: [.vocabulary, .grammar].contains(destination), query: $query))
    }
    @ToolbarContentBuilder
    private func workspaceToolbar(showAccount: Bool) -> some ToolbarContent {
        if usesTabs && showAccount {
            ToolbarItem(placement: .topBarLeading) {
                Button { sheet = .account } label: { Image(systemName: "person.crop.circle") }
                    .accessibilityLabel("账户").accessibilityIdentifier("workspace.account")
            }
        }
    }
    private func companion(_ destination: Destination?) -> some View {
        StudyCompanion(destination: destination, capture: {
            sheet = .capture(destination?.rawValue ?? "题库")
        }, review: { startReview(in: destination) }, practice: { id in
            companionPractice = PracticeEntry.all.first { $0.id == id }
        }, open: { selection = $0 }, database: { sheet = .database })
    }
    private func nav(_ destination: Destination) -> some View {
        NavigationLink(value: destination) {
            Label(destination.rawValue, systemImage: destination.icon).padding(.vertical, 8)
        }.tag(destination)
            .accessibilityIdentifier("nav.\(destination.id)")
    }
    private func startReview() { startReview(in: nil) }
    private func startReview(in destination: Destination?) {
        guard store.isSignedIn else { return }
        let items = store.dueItems.filter { item in
            destination == .grammar ? item.isGrammar : destination == .vocabulary ? !item.isGrammar : true
        }
        if items.isEmpty { store.error = "本机暂无待复习词条。可以在题库中选择词条，或通过学习伙伴同步数据。" }
        else { review = ReviewSession(items: items) }
    }

}

struct TodayView: View {
    @Environment(AppStore.self) private var store
    @State private var round: NativeRound?
    let open: (Destination) -> Void
    let review: () -> Void
    let capture: () -> Void
    var body: some View {
        GeometryReader { geometry in
            let due = store.dueItems
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    Text(Date.now.formatted(.dateTime.month(.wide).day().weekday(.wide).locale(Locale(identifier: "zh_CN"))))
                        .font(.subheadline).foregroundStyle(DeckTheme.muted)
                    if geometry.size.width >= 850 {
                        HStack(alignment: .top, spacing: 32) {
                            mainColumn(dueCount: due.count).frame(maxWidth: .infinity)
                            Rectangle().fill(DeckTheme.line).frame(width: 1)
                            supportColumn(dueItems: due).frame(width: 265)
                        }.fixedSize(horizontal: false, vertical: true)
                    } else {
                        mainColumn(dueCount: due.count)
                        Divider()
                        supportColumn(dueItems: due)
                    }
                }.padding(geometry.size.width > 700 ? 32 : 20)
            }.refreshable { await store.refresh() }
                .fullScreenCover(item: $round) { NativeQuizView(round: $0) }
        }
    }
    private func mainColumn(dueCount: Int) -> some View {
        VStack(alignment: .leading, spacing: 28) {
            DeckPanel {
                VStack(alignment: .leading, spacing: 22) {
                    Text("今日计划").font(.title3.bold())
                    if store.todayTasks.isEmpty {
                        Text("今天还没有安排任务").font(.title2.weight(.medium))
                        Text("可以先复习到期词条，学习计划会从网页版同步。").foregroundStyle(DeckTheme.muted)
                    } else {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("\(store.completedTasks) / \(store.todayTasks.count)").font(.system(size: 30, weight: .semibold, design: .rounded))
                            Text("项任务已完成").foregroundStyle(DeckTheme.muted)
                        }
                        ProgressView(value: Double(store.completedTasks), total: Double(max(1, store.todayTasks.count))).tint(DeckTheme.green)
                        Text(store.todayTasks.prefix(3).map(\.title).joined(separator: " · ")).font(.subheadline).foregroundStyle(DeckTheme.muted)
                    }
                    Button(action: review) { Label("开始记忆复习", systemImage: "arrow.right") }.buttonStyle(PrimaryButton()).accessibilityIdentifier("today.review")
                    Text("\(dueCount) 项待复习 · 今日已复习 \(store.reviewedToday) 项")
                        .font(.footnote).foregroundStyle(DeckTheme.muted).frame(maxWidth: .infinity)
                }
            }
            DeckPanel {
                VStack(alignment: .leading, spacing: 16) {
                    Text("今日练习").font(.title3.bold())
                    if store.todayPacks.isEmpty {
                        Text(store.hasPracticeCache ? "今天暂无已同步的练习" : "尚未下载今日练习")
                            .foregroundStyle(DeckTheme.muted)
                        Button(store.isLoading ? "正在同步…" : "同步学习数据") {
                            Task { await store.refresh() }
                        }.disabled(store.isLoading || !store.isOnline || store.isDemo)
                    } else {
                        ForEach(store.todayPacks) { pack in
                            let questions = pack.questions.filter(\.isUsable)
                            let answered = questions.filter { store.state.answers[$0.id] != nil }.count
                            VStack(alignment: .leading, spacing: 12) {
                                Text(pack.title).font(.headline)
                                Text("\(questions.count) 题 · 已答 \(answered) 题")
                                    .font(.subheadline).foregroundStyle(DeckTheme.muted)
                                Button {
                                    round = NativeRound(title: pack.title, questions: questions)
                                } label: {
                                    Label("开始练习", systemImage: "arrow.right")
                                }.buttonStyle(PrimaryButton()).disabled(questions.isEmpty)
                                    .accessibilityIdentifier("today.practice.\(pack.id)")
                            }
                        }
                    }
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                Text("继续学习").font(.title3.bold()).padding(.bottom, 14)
                Divider()
                Button { open(.reading) } label: { DeckRow(title: "阅读理解", subtitle: store.reading.first?.title ?? "打开阅读题库", icon: "book") }.buttonStyle(.plain)
                Divider()
                Button { open(.grammar) } label: { DeckRow(title: "语法表达", subtitle: "\(store.items.filter(\.isGrammar).count) 个学习词条", icon: "list.bullet.rectangle") }.buttonStyle(.plain)
                Divider()
            }
            Button(action: capture) {
                HStack { Image(systemName: "square.and.pencil"); Text("遇到不懂的日语？记下来。"); Spacer(); Image(systemName: "plus") }.font(.subheadline).padding(18)
                    .overlay(RoundedRectangle(cornerRadius: 7).stroke(DeckTheme.line))
            }.buttonStyle(.plain)
        }
    }
    private func supportColumn(dueItems: [StudyItem]) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack { Text("待复习").font(.title3.bold()); Spacer(); Button("查看全部") { open(.vocabulary) }.font(.caption) }
            VStack(alignment: .leading, spacing: 4) {
                Text("\(dueItems.count)").font(.system(size: 54, weight: .medium, design: .rounded)).foregroundStyle(DeckTheme.green)
                Text("项可开始复习").foregroundStyle(DeckTheme.muted)
            }
            VStack(spacing: 0) {
                ForEach(Array(dueItems.prefix(3))) { item in
                    Divider()
                    Button { open(item.isGrammar ? .grammar : .vocabulary) } label: {
                        DeckRow(title: item.original, subtitle: item.reading ?? "语法表达", icon: item.isGrammar ? "list.bullet" : "character.book.closed")
                    }.buttonStyle(.plain)
                }
                if dueItems.isEmpty { Text("没有到期内容，休息一下也很好。").font(.subheadline).foregroundStyle(DeckTheme.muted) }
            }
            Divider().padding(.vertical, 6)
            Text("最近 7 天").font(.title3.bold())
            WeekActivityView(summaries: store.plan.dailySummaries)
        }
    }
}

struct WeekActivityView: View {
    let summaries: [DailySummary]
    private var days: [(date: Date, minutes: Int)] {
        (0..<7).reversed().map { offset in
            let date = Calendar.current.date(byAdding: .day, value: -offset, to: .now)!
            return (date, summaries.first(where: { $0.date == StudyDates.day(date) })?.practiceMinutes ?? 0)
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .bottom, spacing: 12) {
                ForEach(days.indices, id: \.self) { index in
                    VStack(spacing: 9) {
                        RoundedRectangle(cornerRadius: 3).fill(DeckTheme.green.opacity(index == 6 ? 1 : 0.65))
                            .frame(height: max(2, 75 * Double(days[index].minutes) / Double(max(1, days.map(\.minutes).max() ?? 1))))
                        Text(days[index].date.formatted(.dateTime.day())).font(.caption2).foregroundStyle(DeckTheme.muted)
                    }.frame(maxWidth: .infinity).accessibilityLabel("\(StudyDates.day(days[index].date))，学习 \(days[index].minutes) 分钟")
                }
            }.frame(height: 100, alignment: .bottom)
            Text("已学习 \(days.filter { $0.minutes > 0 }.count) 天 · \(days.map(\.minutes).reduce(0, +)) 分钟").font(.subheadline).foregroundStyle(DeckTheme.muted)
        }
    }
}

private struct LibrarySearch: ViewModifier {
    let enabled: Bool
    @Binding var query: String
    @State private var showingSearch = false
    @ViewBuilder func body(content: Content) -> some View {
        if enabled {
            content.toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("搜索词汇、语法", systemImage: "magnifyingglass") { showingSearch = true }
                }
            }.sheet(isPresented: $showingSearch) {
                NavigationStack {
                    Form {
                        TextField("搜索词汇、语法", text: $query)
                        Button("清除搜索") { query = "" }
                    }.navigationTitle("搜索题库").navigationBarTitleDisplayMode(.inline)
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { showingSearch = false } } }
                }.presentationDetents([.medium])
            }
        } else { content }
    }
}

private struct WorkspacePageStyle: ViewModifier {
    let title: String
    func body(content: Content) -> some View {
        content.frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(DeckTheme.paper)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
    }
}

struct ForegroundRefreshGate {
    private var wasBackgrounded = false
    mutating func update(_ phase: ScenePhase) -> Bool {
        if phase == .background { wasBackgrounded = true }
        guard phase == .active, wasBackgrounded else { return false }
        wasBackgrounded = false
        return true
    }
}
