import SwiftUI
import AuthenticationServices

struct LoginView: View {
    @Environment(AppStore.self) private var store
    @State private var busy = false
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 26) {
                    Image("BrandMark").resizable().scaledToFit().frame(width: 72, height: 72)
                    Text("JLPT Master Deck").font(.largeTitle.bold())
                    Text("每天一点，日语更进一步。").font(.title2)
                    Text("登录后，与网页版共用词库、学习计划和复习进度。").foregroundStyle(DeckTheme.muted).multilineTextAlignment(.center)
                    VStack(spacing: 16) {
                        Button { Task { await google() } } label: {
                            Text("使用 Google 登录").frame(maxWidth: .infinity)
                        }.buttonStyle(PrimaryButton()).accessibilityIdentifier("login.google")
                        SignInWithAppleButton(.signIn) { request in
                            do { try store.identity.prepareApple(request); busy = true }
                            catch { store.handle(error) }
                        } onCompletion: { result in
                            Task {
                                defer { busy = false }
                                do { try await store.acceptIdentity(store.identity.apple(result)) }
                                catch { store.handle(error) }
                            }
                        }.signInWithAppleButtonStyle(.black).frame(height: 52)
                        .disabled(store.identity.configurationIssue != nil)
                    }.disabled(busy)
                    if busy { ProgressView("正在登录…") }
                    if let issue = store.identity.configurationIssue {
                        Text(issue).font(.footnote).foregroundStyle(DeckTheme.muted).multilineTextAlignment(.center)
                    }
                    Divider()
                    Button("先体验演示版") { store.startDemo() }.accessibilityIdentifier("login.demo")
                    Text("演示内容仅用于体验，不会写入你的账户。").font(.footnote).foregroundStyle(DeckTheme.muted)
                }.frame(maxWidth: 460).modifier(StudyPagePadding()).frame(maxWidth: .infinity, minHeight: geometry.size.height)
            }.background(DeckTheme.paper).foregroundStyle(DeckTheme.ink)
        }
    }
    private func google() async {
        busy = true; defer { busy = false }
        do { try await store.acceptIdentity(store.identity.google()) }
        catch { store.handle(error) }
    }
}
