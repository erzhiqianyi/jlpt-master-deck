import SwiftUI

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
