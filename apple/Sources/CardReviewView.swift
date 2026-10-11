import SwiftUI

/// 記憶カード：種類ごとのカード模板（設定で選ぶ）に従って表と裏を出し、4 段階で評価する。オフラインでも使える。
struct CardReviewView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Group {
                if let session = store.cardSession, session.index < session.codes.count, let item = store.knowledge(session.codes[session.index]) {
                    card(item, session: session)
                } else {
                    VStack(spacing: 16) {
                        Image(systemName: "checkmark.seal").font(.system(size: 48)).foregroundStyle(DeckTheme.green)
                        Text("今天的卡片都复习完了").font(.title3.bold())
                        Button("返回") { store.endCards(); dismiss() }.buttonStyle(PrimaryButton()).frame(maxWidth: 240)
                    }.frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .background(DeckTheme.paper)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { DeckDismissButton(kind: .close, label: "退出复习", identifier: "cards.close") }
                if let session = store.cardSession {
                    ToolbarItem(placement: .principal) { Text("\(min(session.index + 1, session.codes.count)) / \(session.codes.count)").monospacedDigit() }
                }
            }
        }
    }

    private func card(_ item: Knowledge, session: CardSession) -> some View {
        let template = store.template(for: item.kind)
        let state = store.schedule(item.code)
        return ScrollView {
            VStack(spacing: 0) {
                VStack(spacing: 14) {
                    ForEach(template?.front ?? [CardField(field: "expression")], id: \.field) { CardFieldView(item: item, field: $0, front: true) }
                }.padding(28).frame(maxWidth: .infinity)
                if session.revealed {
                    Divider()
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(template?.back ?? [CardField(field: "reading"), CardField(field: "meaning")], id: \.field) { CardFieldView(item: item, field: $0, front: false) }
                    }.padding(24).frame(maxWidth: .infinity, alignment: .leading).background(DeckTheme.paper)
                }
            }
            .background(DeckTheme.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(DeckTheme.line))
            .padding(.bottom, 16)
            if session.revealed {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 10)], spacing: 10) {
                    ForEach(MemoryRating.allCases) { rating in
                        Button { store.rate(item.code, rating) } label: {
                            VStack(spacing: 4) {
                                Label(rating.title, systemImage: rating.symbol).font(.headline)
                                Text(ReviewSchedule.preview(state, rating: rating)).font(.caption).foregroundStyle(DeckTheme.muted)
                            }.frame(maxWidth: .infinity, minHeight: 56).foregroundStyle(rating.tint)
                                .background(DeckTheme.surface, in: RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(DeckTheme.line))
                        }.buttonStyle(.plain).accessibilityIdentifier("cards.rate.\(rating.rawValue)")
                    }
                }
            } else {
                Button("显示答案") { store.revealCard() }.buttonStyle(PrimaryButton()).accessibilityIdentifier("cards.show")
            }
        }
        .modifier(StudyPagePadding())
        .frame(maxWidth: 720)
        .frame(maxWidth: .infinity)
    }
}

/// カード模板の一項目。データがない項目は何も出さない。
struct CardFieldView: View {
    @Environment(AppStore.self) private var store
    let item: Knowledge
    let field: CardField
    let front: Bool
    var body: some View {
        let limit = field.maxItems ?? .max
        switch field.field {
        case "expression":
            HStack(spacing: 4) {
                Text(item.expression).font(.system(size: (front ? 34 : 26) * store.textScale, weight: .bold))
                SpeechButton(text: item.reading?.isEmpty == false && item.kind == "word" ? item.reading! : item.expression, label: "朗读词条")
            }
        case "reading": if let reading = item.reading, !reading.isEmpty { labeled("读音", reading) }
        case "romaji": if store.settings.showRomaji, let romaji = item.romaji, !romaji.isEmpty { labeled("罗马音", romaji) }
        case "meaning": if let meaning = item.meaning { labeled("释义", meaning.text) }
        case "meaning_ja", "paraphrase": if let text = item.meaningJa ?? item.paraphrase, !text.isEmpty { labeled("日语释义", text) }
        case "example":
            ForEach(Array(item.examples.prefix(limit).enumerated()), id: \.offset) { _, example in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline) { Text(example.sentence).font(.system(size: 18 * store.textScale)); SpeechButton(text: example.sentence, label: "朗读例句") }
                    if field.withTranslation != false, let translation = example.translation { Text(translation.text).foregroundStyle(DeckTheme.muted) }
                }
            }
        case "memory_point":
            ForEach(Array(item.memoryPoints.prefix(limit).enumerated()), id: \.offset) { _, point in labeled("记忆要点", point.text) }
        case "pattern":
            ForEach(Array(item.patterns.prefix(limit).enumerated()), id: \.offset) { _, pattern in
                labeled("句型", [pattern.pattern, pattern.meaning?.text].compactMap { $0 }.joined(separator: " · "))
            }
        case "note":
            ForEach(Array(item.notes.prefix(limit).enumerated()), id: \.offset) { _, note in labeled(LocalizedStringKey(note.title?.text ?? "补充"), note.body?.text ?? "") }
        case "image": if let id = item.memoryImage?.media { MemoryImageView(mediaId: id) }
        default: EmptyView()
        }
    }
    private func labeled(_ title: LocalizedStringKey, _ value: String) -> some View {
        VStack(alignment: front ? .center : .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(DeckTheme.muted)
            Text(value).font(.system(size: 18 * store.textScale)).multilineTextAlignment(front ? .center : .leading).fixedSize(horizontal: false, vertical: true)
        }.frame(maxWidth: .infinity, alignment: front ? .center : .leading)
    }
}

struct MemoryImageView: View {
    @Environment(AppStore.self) private var store
    let mediaId: Int
    @State private var image: UIImage?
    var body: some View {
        Group {
            if let image { Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 220).clipShape(RoundedRectangle(cornerRadius: 8)) }
            else { Color.clear.frame(height: 1) }
        }.task(id: mediaId) {
            guard let url = try? await store.media(mediaId), let data = try? Data(contentsOf: url) else { return }
            image = UIImage(data: data)
        }
    }
}
