import SwiftUI
import GoogleSignIn
import OSLog

@main
struct JLPTMasterDeckApp: App {
    @State private var store = AppStore()
    init() {
        Logger(subsystem: "cc.erzhiqian.jlptmasterdeck", category: "Performance").info("App initialized")
    }
    var body: some Scene {
        WindowGroup {
            Group {
                if store.isRestoring {
                    ZStack {
                        DeckTheme.paper.ignoresSafeArea()
                        VStack(spacing: 20) {
                            Image("BrandMark").resizable().scaledToFit().frame(width: 64, height: 64)
                            Text("JLPT Master Deck").font(.title2.bold())
                            ProgressView("正在恢复登录状态…")
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
            .environment(\.locale, Locale(identifier: store.appLanguage))
            .tint(DeckTheme.accent)
            .preferredColorScheme(.light)
            .onAppear {
                Logger(subsystem: "cc.erzhiqian.jlptmasterdeck", category: "Performance").info("Root view appeared")
            }
            .task { await store.restore() }
            .onOpenURL { GIDSignIn.sharedInstance.handle($0) }
            .alert("提示", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
                Button("知道了") { store.error = nil }
            } message: { Text(store.error ?? "") }
            .alert("完成", isPresented: Binding(get: { store.notice != nil }, set: { if !$0 { store.notice = nil } })) {
                Button("好的") { store.notice = nil }
            } message: { Text(store.notice ?? "") }
        }
    }
}
