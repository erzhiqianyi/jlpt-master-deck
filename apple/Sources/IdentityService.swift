import AuthenticationServices
import CryptoKit
import FirebaseCore
import FirebaseAuth
import GoogleSignIn
import UIKit

@MainActor
final class IdentityService {
    private(set) var configurationIssue: String?
    private var nonce: String?

    init() {
        guard let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
              let options = FirebaseOptions(contentsOfFile: path) else {
            configurationIssue = "尚未配置原生登录。请将 Firebase iOS 配置 GoogleService-Info.plist 加入 App 后重新构建。"
            return
        }
        guard options.projectID == "jlpt-master-deck", options.bundleID == Bundle.main.bundleIdentifier else {
            configurationIssue = "Firebase 项目或 Bundle ID 不匹配，无法安全连接网页版账户。"
            return
        }
        FirebaseApp.configure(options: options)
    }

    private func requireConfiguration() throws {
        if let configurationIssue { throw IdentityError.message(configurationIssue) }
    }
    func google(link: Bool = false) async throws -> String {
        try requireConfiguration()
        guard let clientID = FirebaseApp.app()?.options.clientID,
              let presenter = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
                .filter({ $0.activationState == .foregroundActive }).flatMap(\.windows).first(where: \.isKeyWindow)?.rootViewController else {
            throw IdentityError.message("Google 登录配置缺少 CLIENT_ID，或当前窗口尚未就绪。")
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        var top = presenter
        while let presented = top.presentedViewController { top = presented }
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: top)
        guard let token = result.user.idToken?.tokenString else { throw IdentityError.message("Google 未返回身份凭据。") }
        let credential = GoogleAuthProvider.credential(withIDToken: token, accessToken: result.user.accessToken.tokenString)
        return try await finish(credential, link: link)
    }
    func prepareApple(_ request: ASAuthorizationAppleIDRequest) throws {
        try requireConfiguration()
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw IdentityError.message("无法生成登录校验码，请重试。") }
        let value = bytes.map { String(format: "%02x", $0) }.joined()
        nonce = value
        request.requestedScopes = [.fullName, .email]
        request.nonce = SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    func apple(_ result: Result<ASAuthorization, Error>, link: Bool = false) async throws -> String {
        defer { nonce = nil }
        try requireConfiguration()
        let authorization = try result.get()
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let bytes = credential.identityToken, let token = String(data: bytes, encoding: .utf8), let nonce else {
            throw IdentityError.message("Apple 未返回有效的身份凭据。")
        }
        return try await finish(OAuthProvider.appleCredential(withIDToken: token, rawNonce: nonce, fullName: credential.fullName), link: link)
    }
    private func finish(_ credential: AuthCredential, link: Bool) async throws -> String {
        if link {
            guard let current = Auth.auth().currentUser else { throw IdentityError.message("请先重新登录原账户，再绑定另一种登录方式。") }
            _ = try await current.link(with: credential)
            return try await current.getIDToken(forcingRefresh: true)
        }
        let result = try await Auth.auth().signIn(with: credential)
        return try await result.user.getIDToken()
    }
    var providerIDs: [String] {
        guard FirebaseApp.app() != nil else { return [] }
        return Auth.auth().currentUser?.providerData.map(\.providerID) ?? []
    }
    func signOut() {
        guard FirebaseApp.app() != nil else { return }
        try? Auth.auth().signOut()
        GIDSignIn.sharedInstance.signOut()
    }
}
enum IdentityError: LocalizedError {
    case message(String)
    var errorDescription: String? { switch self { case .message(let text): text } }
}
