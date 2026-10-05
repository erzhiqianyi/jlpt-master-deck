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
    private var busy: Bool { store.isLoading || store.isDownloadingAudio }
    var body: some View {
        HStack {
            Spacer(minLength: 0)
            CompanionActionButton(identifier: "workspace.companion", hint: "打开\(destination?.rawValue ?? "题库")的快捷操作") {
                Section("\(destination?.rawValue ?? "题库") · 快捷操作") { contextualActions }
                if destination != nil {
                    Button(action: capture) { Label(captureTitle, systemImage: "square.and.pencil") }
                }
                if destination == .today || destination == .history {
                    Divider()
                    Button { Task { await store.refresh() } } label: { Label("同步学习数据", systemImage: "arrow.triangle.2.circlepath") }
                        .disabled(store.isLoading || store.isSaving || store.isDemo || !store.isOnline)
                }
            }
            .overlay(alignment: .topTrailing) {
                if busy { ProgressView().controlSize(.mini).padding(6).background(DeckTheme.surface, in: Circle()).allowsHitTesting(false) }
                else if store.pendingCount > 0 {
                    Image(systemName: "arrow.up.circle.fill").foregroundStyle(DeckTheme.accent)
                        .background(DeckTheme.surface, in: Circle()).allowsHitTesting(false)
                }
            }
        }
        .padding(.trailing, 12).padding(.top, 4).padding(.bottom, 2)
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
    @ViewBuilder private var contextualActions: some View {
        switch destination {
        case .today:
            Button(action: review) { Label("开始记忆复习", systemImage: "rectangle.on.rectangle") }
            Button { practice("daily") } label: { Label("今日练习", systemImage: "calendar") }
        case .practice:
            ForEach(PracticeEntry.all.filter { $0.id != "daily" }) { entry in
                Button { practice(entry.id) } label: { Label(entry.title, systemImage: entry.icon) }
            }
        case .vocabulary, .grammar:
            Button(action: review) { Label(destination == .grammar ? "复习到期语法" : "复习到期词汇", systemImage: "rectangle.on.rectangle") }
            Button { practice("topics") } label: { Label("专项练习", systemImage: "scope") }
        case .reading:
            Button { open(.history) } label: { Label("查看学习统计", systemImage: "chart.bar") }
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
    var celebration = 0
    @ViewBuilder var actions: Actions
    @State private var capturePresented = false
    var body: some View {
        HStack {
            Spacer()
            CompanionActionButton(identifier: "detail.companion", hint: "打开当前页面的快捷操作", celebration: celebration) {
                Section(context) { actions }
                Button { capturePresented = true } label: { Label(captureTitle, systemImage: "square.and.pencil") }
            }
        }.padding(.trailing, 12).padding(.vertical, 2)
            .sheet(isPresented: $capturePresented) { CaptureView(initialContext: context) }
    }
}


/// One task owns the frame cursor. A new request or scene change cancels its predecessor.
/// Frames retain the supplied anchor; no scale/rotation is added to the prototype pixels.
enum CompanionMotion: String, CaseIterable {
    case idle, wave, celebrate
    var sequence: [(frame: Int, milliseconds: Int)] {
        switch self {
        case .idle: [(0, 2600), (1, 90), (2, 120), (1, 90), (0, 300)]
        case .wave: [(0, 260), (1, 110), (2, 130), (1, 110), (0, 110), (5, 110), (4, 130), (5, 110), (0, 930)]
        case .celebrate: [(0, 400), (1, 140), (2, 160), (3, 220), (2, 180), (4, 160), (5, 220), (0, 920)]
        }
    }
    func asset(_ frame: Int) -> String { "Companion-\(rawValue)-\(frame)" }
}

struct CompanionAvatar: View {
    var motion: CompanionMotion = .idle
    var size: CGFloat = 72
    var request = 0
    var completion: () -> Void = {}
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var frameName = CompanionMotion.idle.asset(0)
    private struct Playback: Equatable {
        let motion: CompanionMotion; let request: Int; let active: Bool; let reduced: Bool
    }
    private static let images: [String: UIImage] = {
        var result: [String: UIImage] = [:]
        for motion in CompanionMotion.allCases {
            for frame in 0..<6 {
                let name = motion.asset(frame)
                if let image = UIImage(named: name) { result[name] = image }
            }
        }
        return result
    }()
    private var available: Bool { Self.images.count == 18 }
    var body: some View {
        Group {
            if let image = Self.images[frameName] { Image(uiImage: image).resizable().scaledToFit() }
            else { Image("StudyCompanion").resizable().scaledToFit() }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
        .task(id: Playback(motion: motion, request: request, active: scenePhase == .active, reduced: reduceMotion)) {
            frameName = CompanionMotion.idle.asset(0)
            guard scenePhase == .active else { return }
            guard !reduceMotion, available else {
                if motion != .idle { completion() }
                return
            }
            do {
                repeat {
                    for step in motion.sequence {
                        try Task.checkCancellation()
                        frameName = motion.asset(step.frame)
                        try await Task.sleep(for: .milliseconds(step.milliseconds))
                    }
                } while motion == .idle
                try Task.checkCancellation()
                frameName = CompanionMotion.idle.asset(0)
                completion()
            } catch { /* Replacement task owns the next frame. */ }
        }
    }
}

/// Preserve existing contextual shortcuts; opening waits for the single wave to finish.
struct CompanionActionButton<Actions: View>: View {
    let identifier: String
    let hint: String
    var celebration = 0
    @ViewBuilder var actions: Actions
    var body: some View {
        Menu { actions } label: {
            Image(systemName: "ellipsis").font(.body.weight(.semibold))
                .frame(width: 44, height: 44)
                .foregroundStyle(DeckTheme.green)
                .background(DeckTheme.surface, in: Circle())
                .overlay { Circle().stroke(DeckTheme.line, lineWidth: 1) }
        }
        .accessibilityLabel("快捷操作")
        .accessibilityHint(hint)
        .accessibilityIdentifier(identifier)
    }
}
