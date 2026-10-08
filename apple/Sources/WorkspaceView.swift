import SwiftUI

enum Destination: String, CaseIterable, Identifiable {
    case today = "学习", practice = "练习", discovery = "发现", history = "统计"
    case vocabulary = "词汇", grammar = "语法", reading = "阅读", listening = "听力"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .today: "book"; case .practice: "doc.text"; case .discovery: "safari"; case .history: "chart.bar"
        case .vocabulary: "character.book.closed"; case .grammar: "list.bullet.rectangle"; case .reading: "book"; case .listening: "headphones"
        }
    }
}
enum WorkspaceSheet: Identifiable {
    case capture(String), database
    var id: String {
        switch self {
        case .capture(let context): "capture-\(context)"
        case .database: "database"
        }
    }
}
struct ReviewSession: Codable, Identifiable {
    var id = UUID()
    let items: [StudyItem]
    var index = 0
    var revealed = false
}

// Routes contain IDs only. They live for this account's workspace lifetime; answers
// and detail scroll positions remain owned by the mounted destination views.
// Card review is restored separately from the last module and navigation paths.
enum WorkspaceRoute: Hashable {
    case module(Destination), item(String), reading(String), listening(String), discovery(String), myShares, settings
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
        get { savedDestination.isEmpty ? nil : Destination(rawValue: savedDestination == "记录" ? "统计" : ["今日", "练习"].contains(savedDestination) ? "学习" : savedDestination) ?? .today }
        nonmutating set {
            if let newValue, Destination.allCases.suffix(4).contains(newValue) {
                navigation.openModule(newValue)
            }
            savedDestination = newValue?.rawValue ?? ""
        }
    }
    @State private var navigation = WorkspaceNavigation()
    @State private var sheet: WorkspaceSheet?
    @State private var query = ""
    @State private var companionPractice: PracticeEntry?
    @State private var foregroundGate = ForegroundRefreshGate()
    init(accountID: String) {
        let key = "workspace.destination.\(accountID)"
        _savedDestination = AppStorage(wrappedValue: Destination.today.rawValue, key)
        var initialNavigation = WorkspaceNavigation()
        if let raw = UserDefaults.standard.string(forKey: key), let destination = Destination(rawValue: raw),
           Destination.allCases.suffix(4).contains(destination) {
            initialNavigation.openModule(destination)
        }
        _navigation = State(initialValue: initialNavigation)
    }
    private var usesTabs: Bool { UIDevice.current.userInterfaceIdiom == .phone || sizeClass == .compact }
    var body: some View {
        Group {
            if usesTabs {
                TabView(selection: compactSelection) {
                    ForEach([Destination.today, .discovery, .history]) { destination in
                        NavigationStack(path: path(for: destination)) {
                            detail(destination).navigationDestination(for: WorkspaceRoute.self, destination: routeView)
                        }
                            .tabItem { Label(LocalizedStringKey(destination.rawValue), systemImage: destination.icon) }
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
                            ForEach([Destination.today, .discovery, .history]) { destination in nav(destination) }
                            NavigationLink(value: Destination.reading) {
                                Label("题库", systemImage: "square.grid.2x2").padding(.vertical, 8)
                            }.tag(Destination.reading).accessibilityIdentifier("nav.题库")
                        }.listStyle(.sidebar).scrollContentBackground(.hidden)
                        Button { openSettings() } label: {
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
            switch value { case .capture(let context): CaptureView(initialContext: context); case .database: DatabaseCheckSheet() }
        }
        .fullScreenCover(item: $companionPractice) { entry in Group { if entry.id == "mock" { NativeMockExamView() } else { NativePracticeScreen(entry: entry) } } }
        .fullScreenCover(item: Binding(get: { store.memoryReview }, set: { _ in
            // Scene transitions must not discard the review. Its explicit exit action
            // clears the account-scoped session only after saving that decision.
        })) { session in MemoryReviewView(session: session) }
        .safeAreaInset(edge: .top, spacing: 0) {
            if store.isRestoringLocal {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("正在后台恢复本机记录，完成后自动同步…").font(.footnote)
                    Spacer(minLength: 0)
                }.padding(12).background(DeckTheme.paper)
                    .accessibilityIdentifier("workspace.restoringLocal")
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if foregroundGate.update(phase) { store.scheduleAutomaticRefresh() }
        }
    }
    // All four study modules belong to the final tab, while retaining their route.
    private var compactDestination: Destination {
        guard let selection else { return .reading }
        return [Destination.today, .discovery, .history].contains(selection) ? selection : .reading
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
                set: { routes in
                    guard navigation.paths[destination, default: []] != routes else { return }
                    navigation.paths[destination] = routes
                })
    }
    private var bankPath: Binding<[WorkspaceRoute]> {
        Binding(get: { navigation.bank }, set: { routes in
            guard navigation.bank != routes else { return }
            navigation.bank = routes
            if compactDestination == .reading {
                let next = navigation.bankModule?.rawValue ?? ""
                if savedDestination != next { savedDestination = next }
            }
        })
    }
    private func bankCounts(_ destination: Destination) -> (total: Int, studied: Int, unit: String, asset: String) {
        func studied(_ id: String) -> Bool {
            guard let value = store.state.progress[id] else { return false }
            return (value.reviewCount ?? 0) > 0 || value.correct + value.wrong > 0
        }
        switch destination {
        case .vocabulary, .grammar:
            let values = store.items.filter { ($0.deck == "grammar_expression") == (destination == .grammar) }
            return (values.count, values.filter { studied($0.id) }.count, destination == .grammar ? "项" : "词", destination == .grammar ? "grammar" : "vocabulary")
        case .reading:
            let groups = Dictionary(grouping: store.reading) { question in
                let passage = question.passage.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                return passage.isEmpty ? question.id : passage
            }
            return (groups.count, groups.values.filter { $0.contains { studied($0.id) } }.count, "篇", "reading")
        case .listening:
            let groups = ListeningGroup.restorable(store.listening,owner:store.isDemo ? "demo" : String(store.session?.user.id ?? 0))
            return (groups.count, groups.filter { studied("listening-audio:\($0.id)") }.count, "套", "listening")
        default: return (0, 0, "", "vocabulary")
        }
    }
    private var bankRoot: some View {
        GeometryReader { geometry in
            let artworkHeight: CGFloat = 72
            ScrollView {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16), count: geometry.size.width >= 1100 ? 4 : 2), spacing: 16) {
                    ForEach(Array(Destination.allCases.suffix(4).enumerated()), id: \.element.id) { index, destination in
                        let counts = bankCounts(destination)
                        VStack(alignment: .leading, spacing: 0) {
                        Button { selection = destination } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                Image("Library-\(counts.asset)").resizable().scaledToFit().frame(height: artworkHeight).frame(maxWidth: .infinity).accessibilityHidden(true)
                                HStack {
                                    Text(LocalizedStringKey(destination.rawValue)).font(.title2.bold())
                                    Spacer(minLength: 4)
                                    Image(systemName: "chevron.right").font(.body).foregroundStyle(DeckTheme.muted)
                                }
                                HStack(spacing: 5) {
                                    Text("\(counts.total) \(counts.unit) ·")
                                    if geometry.size.width < 1100 { Text(index < 2 ? "已学" : "已练") }
                                    Image(systemName: index < 2 ? "checkmark.circle" : "arrow.triangle.2.circlepath")
                                    Text("\(counts.studied)")
                                }.font(.subheadline).foregroundStyle(DeckTheme.green)
                                    .accessibilityLabel("共 \(counts.total) \(counts.unit)，\(index < 2 ? "已学" : "已练") \(counts.studied)")
                            }.padding(.horizontal, 18).padding(.vertical, 16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                        }.buttonStyle(.plain)
                            .accessibilityIdentifier("nav.\(destination.id)")
                        if geometry.size.width >= 1100 { NativeLibraryTypeSummary(module: counts.asset) }
                        }.background(DeckTheme.surface, in: RoundedRectangle(cornerRadius: 16))

                    }
                }.frame(maxWidth: 1200).padding(.horizontal, 20).padding(.vertical, 12).frame(maxWidth: .infinity)
            }
        }
        .modifier(WorkspacePageStyle(title: "题库"))
        .toolbar { workspaceToolbar(showAccount: true) }
    }
    private func routeView(_ route: WorkspaceRoute) -> some View {
        routeContent(route).toolbar(usesTabs ? .hidden : .automatic, for: .tabBar)
    }
    @ViewBuilder private func routeContent(_ route: WorkspaceRoute) -> some View {
        switch route {
        case .myShares: MyDiscoverySharesView()
        case .settings: NativeSettingsView()
        case .module(let destination): detail(destination)
        case .item(let id):
            if let item = store.items.first(where: { $0.id == id }) {
                ItemDetailView(item: item)
            } else { unavailableRoute }
        case .reading(let id):
            if let question = store.reading.first(where: { $0.id == id }) {
                ReadingPracticeView(question: question)
            } else { unavailableRoute }
        case .listening(let id):
            if let group = ListeningGroup.restorable(store.listening,owner:store.isDemo ? "demo" : String(store.session?.user.id ?? 0)).first(where: { $0.id == id }) {
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
                LibraryView(grammarOnly: destination == .grammar, vocabularyOnly: destination == .vocabulary, query: query)
            case .reading: ReadingLibraryView()
            case .history: HistoryView()
            case .listening: ListeningLibraryView()
            }
        }
        .modifier(WorkspacePageStyle(title: destination == .today ? "学习" : destination.rawValue))
        .toolbar { workspaceToolbar(showAccount: [.today, .history].contains(destination)) }
        .modifier(LibrarySearch(enabled: [.vocabulary, .grammar].contains(destination), query: $query))
    }
    private func openSettings() {
        if compactDestination == .reading {
            if navigation.bank.last != .settings { navigation.bank.append(.settings) }
        } else if navigation.paths[compactDestination, default: []].last != .settings {
            navigation.paths[compactDestination, default: []].append(.settings)
        }
    }
    @ToolbarContentBuilder
    private func workspaceToolbar(showAccount: Bool) -> some ToolbarContent {
        if showAccount {
            ToolbarItem(placement: .topBarTrailing) {
                Button { openSettings() } label: { Image(systemName: "gearshape") }
                    .accessibilityLabel("设置").accessibilityIdentifier("workspace.account")
            }
        }
    }
    private func nav(_ destination: Destination) -> some View {
        NavigationLink(value: destination) {
            Label(LocalizedStringKey(destination.rawValue), systemImage: destination.icon).padding(.vertical, 8)
        }.tag(destination)
            .accessibilityIdentifier("nav.\(destination.id)")
    }
    private func startReview() { startReview(in: nil) }
    private func startReview(in destination: Destination?) {
        guard store.isSignedIn else { return }
        let items = store.dueItems.filter { item in
            destination == .grammar ? item.isGrammar : destination == .vocabulary ? !item.isGrammar : true
        }
        if items.isEmpty { store.error = "本机暂无待复习词条。可以在题库中选择词条，或前往账户设置同步数据。" }
        else {
            do { try store.startMemoryReview(items: items) }
            catch { store.error = error.localizedDescription }
        }
    }

}

struct TodayView: View {
    @Environment(AppStore.self) private var store
    @State private var round: NativeRound?
    @State private var showingPlan = false
    @State private var reviewingDraft: PracticeDraft?
    @State private var confirmedPack: NativePack?
    @Environment(\.horizontalSizeClass) private var sizeClass
    let open: (Destination) -> Void
    let review: () -> Void
    let capture: () -> Void
    private var examDays: Int? {
        guard let value = store.plan.profile?.examDate else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "Asia/Tokyo")
        guard let date = formatter.date(from: value) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = formatter.timeZone
        return calendar.dateComponents([.day], from: calendar.startOfDay(for: .now), to: date).day
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Button { showingPlan = true } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "calendar").font(.title2)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(store.plan.profile?.examLabel ?? "考试日期").font(.subheadline.bold())
                            if let date = store.plan.profile?.examDate { Text(date).font(.caption).foregroundStyle(DeckTheme.muted) }
                        }
                        Spacer()
                        if let days = examDays {
                            Text(days > 0 ? "还有 \(days) 天" : days == 0 ? "今天考试" : "请更新考试日期").font(.headline)
                        } else {
                            Text("设置考试日期").font(.subheadline)
                        }
                        Image(systemName: "chevron.right").font(.caption)
                    }.foregroundStyle(DeckTheme.green).padding(16)
                        .background(DeckTheme.green.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                }.buttonStyle(.plain).accessibilityIdentifier("learning.countdown")
                let layout = sizeClass == .regular ? AnyLayout(HStackLayout(alignment: .top, spacing: 16)) : AnyLayout(VStackLayout(spacing: 16))
                layout { dailyPractice; dueReview }
                let pending = store.drafts.filter { draft in ["draft", "needs_revision", "approved"].contains(draft.status) && !store.packs.contains { $0.sourceDraftId == draft.id } }.sorted { ($0.created_at ?? "") > ($1.created_at ?? "") }
                if !pending.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack { Text("待确认练习 · \(pending.count)").font(.headline); Spacer(); NavigationLink("查看全部") { NativePendingPracticesView() } }
                        ForEach(Array(pending.prefix(3))) { draft in
                            Button { reviewingDraft = draft } label: { DeckRow(title: draft.title, subtitle: draft.status == "approved" ? "已确认，待发布" : draft.status == "needs_revision" ? "需要修改 · 查看题目" : "查看并确认", icon: "doc.text") }.buttonStyle(.plain)
                        }
                    }.padding(16).background(DeckTheme.surface, in: RoundedRectangle(cornerRadius: 16))
                }
                VStack(alignment: .leading, spacing: 10) {
                    Text("自主练习").font(.headline)
                    IndependentPracticeEntries()
                }
            }.frame(maxWidth: 800).padding(20).frame(maxWidth: .infinity)
        }.refreshable { await store.refresh() }
            .fullScreenCover(item: $round) { NativeQuizView(round: $0) }
            .fullScreenCover(item: $reviewingDraft, onDismiss: {
                if let pack = confirmedPack {
                    confirmedPack = nil
                    round = NativeRound(title: pack.title, questions: pack.questions.filter(\.isUsable), view: "daily-practice", practiceId: pack.id, resumeSavedAnswers: true)
                }
            }) { draft in
                NativeTopicConfirmationView(draftID: draft.id, isDaily: !draft.isTopic) { confirmedPack = $0 }
            }
            .toolbar { ToolbarItem(placement: .topBarLeading) {
                Button { showingPlan = true } label: { Image(systemName: "calendar") }.accessibilityLabel("学习计划")
            } }
            .sheet(isPresented: $showingPlan) {
                NavigationStack {
                    List {
                        Section("考试目标") {
                            NavigationLink { ExamGoalSettingsView() } label: {
                                DeckRow(title: store.plan.profile?.examLabel ?? "设置考试目标", subtitle: store.plan.profile?.examDate ?? "设置考试日期", icon: "target")
                            }
                        }
                        Section("今日计划") {
                            if store.todayTasks.isEmpty { Text("今天还没有安排任务") }
                            ForEach(store.todayTasks) { task in Label(task.title, systemImage: task.status == "completed" ? "checkmark.circle.fill" : "circle") }
                        }
                    }.navigationTitle("学习计划")
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { showingPlan = false } } }
                }
            }
    }
    private func compactPracticeTitle(_ title: String) -> String {
        let trimmed = title.replacingOccurrences(of: #"^(?:\d{4}-\d{2}-\d{2}|\d{1,2}月\d{1,2}日)[\s・｜|：:—-]*"#, with: "", options: .regularExpression)
        if let separator = trimmed.firstIndex(of: "｜") {
            let focus = String(trimmed[trimmed.index(after: separator)...]).trimmingCharacters(in: .whitespaces)
            if !focus.isEmpty { return focus }
        }
        return trimmed.replacingOccurrences(of: "每日薄弱点强化练习", with: "弱点强化")
            .replacingOccurrences(of: "每日强化练习", with: "弱点强化")
    }
    private var dueReview: some View {
        Button(action: review) {
            HStack(spacing: 16) {
                Image(systemName: "clock.arrow.circlepath").font(.system(size: 30)).foregroundStyle(DeckTheme.green)
                VStack(alignment: .leading, spacing: 6) {
                    Text("到期复习").font(.headline)
                    Text(store.dueItems.isEmpty ? "今天已完成" : "开始复习").font(.subheadline).foregroundStyle(DeckTheme.green)
                }
                Spacer()
                Text("\(store.dueItems.count)").font(.title.bold().monospacedDigit()).foregroundStyle(DeckTheme.green)
                Text("项").font(.subheadline).foregroundStyle(DeckTheme.muted)
                Image(systemName: "chevron.right").font(.caption)
            }.padding(.horizontal, 20).padding(.vertical, 18).frame(maxWidth: .infinity, minHeight: 92, alignment: .leading)
                .background(DeckTheme.green.opacity(0.09), in: RoundedRectangle(cornerRadius: 16))
        }.buttonStyle(.plain).disabled(store.dueItems.isEmpty).accessibilityIdentifier("today.review")
    }
    private func dailyPracticeRow(_ pack: NativePack) -> some View {
        let questions = pack.questions.filter(\.isUsable)
        let answered = questions.filter { store.state.answers[$0.id] != nil }.count
        let complete = !questions.isEmpty && answered == questions.count
        let action = complete ? "查看练习" : answered > 0 ? "继续练习" : "开始练习"
        return Button {
            round = NativeRound(title: pack.title, questions: questions, view: "daily-practice", practiceId: pack.id, resumeSavedAnswers: true)
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(pack.title).font(.subheadline.bold()).foregroundStyle(DeckTheme.ink).fixedSize(horizontal: false, vertical: true)
                    Text(["\(answered)/\(questions.count) 题", pack.minutes.map { "约 \($0) 分钟" }, complete ? "已完成" : answered > 0 ? "进行中" : "待开始"].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(DeckTheme.muted)
                    ProgressView(value: Double(answered), total: Double(max(1, questions.count))).tint(DeckTheme.green)
                }.frame(maxWidth: .infinity, alignment: .leading)
                Text(action).font(.caption).foregroundStyle(DeckTheme.green)
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(DeckTheme.green)
            }.padding(.vertical, 8).contentShape(Rectangle())
        }.buttonStyle(.plain).disabled(questions.isEmpty).accessibilityIdentifier("today.practice.\(pack.id)")
    }
    private var dailyPractice: some View {
        VStack(alignment: .leading, spacing: 12) {
            if store.todayPacks.count > 1 {
                HStack {
                    Text("今日练习").font(.headline)
                    Spacer()
                    Text("\(store.todayPacks.count) 套").font(.caption).foregroundStyle(DeckTheme.muted)
                }
                ForEach(store.todayPacks) { pack in
                    dailyPracticeRow(pack)
                    if pack.id != store.todayPacks.last?.id { Divider() }
                }
            } else if let pack = store.todayPacks.first {
                let questions = pack.questions.filter(\.isUsable)
                let answered = questions.filter { store.state.answers[$0.id] != nil }.count
                let complete = !questions.isEmpty && answered == questions.count
                HStack {
                    Text("今日练习").font(.headline)
                    Spacer()
                    Text(complete ? "已完成" : answered > 0 ? "进行中" : "待开始")
                        .font(.caption.bold()).padding(.horizontal, 12).padding(.vertical, 6)
                        .foregroundStyle(answered > 0 ? DeckTheme.green : DeckTheme.accent)
                        .background((answered > 0 ? DeckTheme.green : DeckTheme.accent).opacity(0.12), in: Capsule())
                }
                Text(compactPracticeTitle(pack.title)).font(.title3.bold()).lineLimit(2)
                Text(["\(answered)/\(questions.count) 题", pack.minutes.map { "约 \($0) 分钟" }].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline).foregroundStyle(DeckTheme.muted)
                ProgressView(value: Double(answered), total: Double(max(1, questions.count))).tint(DeckTheme.green)
                Button { round = NativeRound(title: pack.title, questions: questions, view: "daily-practice", practiceId: pack.id, resumeSavedAnswers: true) } label: {
                    Label(complete ? "查看练习" : answered > 0 ? "继续练习" : "开始练习", systemImage: "arrow.right")
                }.buttonStyle(PrimaryButton()).disabled(questions.isEmpty).accessibilityIdentifier("today.practice.\(pack.id)")
            } else if let draft = store.todayDraft {
                HStack {
                    Text("今日练习").font(.headline)
                    Spacer()
                    Text(draft.status == "approved" ? "已确认" : "待确认").font(.caption.bold())
                }
                Text(compactPracticeTitle(draft.title)).font(.title3.bold()).lineLimit(2)
                Button(draft.status == "approved" ? "开始练习" : "确认题目") { reviewingDraft = draft }
                    .buttonStyle(PrimaryButton()).disabled(!store.isOnline).accessibilityIdentifier("today.draft.\(draft.id)")
            } else {
                Text("今日练习").font(.headline)
                Text(store.hasPracticeCache ? "今天暂无已同步的练习" : "尚未下载今日练习").foregroundStyle(DeckTheme.muted)
                Button(store.isLoading ? "正在同步…" : "同步学习数据") { Task { await store.refresh() } }
                    .buttonStyle(PrimaryButton()).disabled(store.isLoading || !store.isOnline || store.isDemo)
            }
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(DeckTheme.accent.opacity(0.07), in: RoundedRectangle(cornerRadius: 18))
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
    @Environment(AppStore.self) private var store
    let title: String
    func body(content: Content) -> some View {
        content.frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(DeckTheme.paper)
            .navigationTitle(store.interfaceText(title))
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
