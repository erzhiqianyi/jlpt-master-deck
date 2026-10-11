import SwiftUI

enum DeckTheme {
    static let paper = Color(red: 0.980, green: 0.969, blue: 0.949)
    static let surface = Color(red: 1, green: 0.996, blue: 0.980)
    static let ink = Color(red: 0.188, green: 0.188, blue: 0.176)
    static let muted = Color(red: 0.44, green: 0.47, blue: 0.46)
    static let accent = Color(red: 0.714, green: 0.325, blue: 0.251)
    static let green = Color(red: 0.31, green: 0.486, blue: 0.36)
    static let line = Color(red: 0.88, green: 0.87, blue: 0.84)
}
struct PrimaryButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.headline).frame(maxWidth: .infinity).padding(.vertical, 16)
            .foregroundStyle(.white).background(DeckTheme.accent.opacity(configuration.isPressed ? 0.7 : 1), in: RoundedRectangle(cornerRadius: 7))
    }
}
struct DeckPanel<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content.padding(20).frame(maxWidth: .infinity, alignment: .leading)
            .background(DeckTheme.surface, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(DeckTheme.line, lineWidth: 1))
    }
}
struct DeckRow: View {
    let title: String; let subtitle: String; let icon: String
    var showsChevron = true
    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon).font(.title3).foregroundStyle(DeckTheme.accent).frame(width: 38, height: 42)
            VStack(alignment: .leading, spacing: 6) {
                Text(title).fontWeight(.semibold).foregroundStyle(DeckTheme.ink)
                if !subtitle.isEmpty { Text(subtitle).font(.subheadline).foregroundStyle(DeckTheme.muted).lineLimit(2) }
            }
            Spacer(minLength: 8)
            if showsChevron { Image(systemName: "chevron.right").font(.caption).foregroundStyle(DeckTheme.muted) }
        }.padding(.vertical, 12).contentShape(Rectangle())
    }
}
struct StudyPagePadding: ViewModifier {
    @Environment(\.horizontalSizeClass) private var sizeClass
    func body(content: Content) -> some View { content.padding(sizeClass == .compact ? 16 : 24) }
}
struct DeckDismissButton: View {
    enum Kind { case back, close }
    @Environment(\.dismiss) private var dismiss
    let kind: Kind
    let label: String
    var identifier = "navigation.dismiss"
    var body: some View {
        Button { dismiss() } label: {
            Label(label, systemImage: kind == .back ? "chevron.backward" : "xmark").labelStyle(.iconOnly)
                .font(.body.weight(.semibold)).frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
        }
        .accessibilityLabel(label).accessibilityIdentifier(identifier).keyboardShortcut(.cancelAction)
    }
}

/// 選択肢（練習の選択肢・答えたあとの正誤表示）。
struct AnswerChoice: View {
    @Environment(AppStore.self) private var store
    let number: Int
    let text: String
    let selected: Bool
    var correct: Bool? = nil
    var tint: Color { correct == true ? DeckTheme.green : correct == false && selected ? DeckTheme.accent : DeckTheme.ink }
    var fill: Color { correct == true ? DeckTheme.green.opacity(0.08) : selected ? DeckTheme.accent.opacity(0.08) : .clear }
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text("\(number)").font(.body.monospacedDigit()).frame(width: 30, height: 30).background(tint.opacity(0.07), in: Circle())
            Text(text).font(.system(size: 18 * store.textScale)).lineSpacing(5).multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
            if correct == true { Image(systemName: "checkmark.circle.fill") }
            else if selected { Image(systemName: correct == false ? "xmark.circle.fill" : "checkmark.circle.fill") }
        }.padding(.vertical, 14).padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading).foregroundStyle(tint)
            .background(fill, in: RoundedRectangle(cornerRadius: 10))
            .overlay { RoundedRectangle(cornerRadius: 10).stroke(selected || correct == true ? tint.opacity(0.5) : DeckTheme.line, lineWidth: 1) }
            .contentShape(Rectangle())
    }
}

extension MemoryRating {
    var symbol: String {
        switch self { case .forgot: "arrow.counterclockwise"; case .hard: "exclamationmark.triangle"; case .remembered: "checkmark.circle"; case .easy: "target" }
    }
    var tint: Color {
        switch self { case .forgot: DeckTheme.accent; case .hard: Color(red: 0.62, green: 0.46, blue: 0.25); case .remembered: DeckTheme.green; case .easy: Color(red: 0.28, green: 0.53, blue: 0.74) }
    }
}

/// 下線や空欄（UTF-16 の位置、サーバーと同じ）を付けた問題文。
enum MarkedText {
    static func attributed(_ text: String, marks: [QuestionMark], size: CGFloat) -> AttributedString {
        let utf16 = Array(text.utf16)
        func piece(_ range: Range<Int>, bold: Bool = false, placeholder: String? = nil) -> AttributedString {
            var value = AttributedString(placeholder ?? String(decoding: utf16[range], as: UTF16.self))
            value.font = .system(size: size, weight: bold ? .semibold : .regular)
            if bold { value.underlineStyle = .single }
            return value
        }
        var result = AttributedString()
        var cursor = 0
        for mark in marks.sorted(by: { $0.start < $1.start }) where mark.start >= cursor && mark.end <= utf16.count && mark.start <= mark.end {
            result += piece(cursor..<mark.start)
            result += piece(mark.start..<mark.end, bold: mark.kind == "target", placeholder: mark.start == mark.end ? "（　　）" : nil)
            cursor = mark.end
        }
        result += piece(min(cursor, utf16.count)..<utf16.count)
        return result
    }
}
