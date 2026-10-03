import SwiftUI
import GoogleSignIn

@main
struct JLPTMasterDeckApp: App {
    @State private var store = AppStore()
    var body: some Scene {
        WindowGroup {
            Group {
                if store.isRestoring {
                    ZStack {
                        DeckTheme.paper.ignoresSafeArea()
                        VStack(spacing: 20) {
                            Image("BrandMark").resizable().scaledToFit().frame(width: 64, height: 64)
                            Text("JLPT Master Deck").font(.title2.bold())
                            ProgressView("正在读取本机学习记录…")
                        }
                    }
                }
                else if store.isSignedIn {
                    let accountID = store.session.map { String($0.user.id) } ?? "demo"
                    WorkspaceView(accountID: accountID).id(accountID)
                }
                else { LoginView() }
            }
            .environment(store)
            .tint(DeckTheme.accent)
            .preferredColorScheme(.light)
            .task { await store.restore() }
            .onOpenURL { GIDSignIn.sharedInstance.handle($0) }
            .alert("提示", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
                Button("知道了") { store.error = nil }
            } message: { Text(store.error ?? "") }
        }
    }
}
