import Foundation
import Security
#if DEBUG
import OSLog
#endif

struct APIClient {
    // The website and native client intentionally address the same deployment.
    static let origin = URL(string: "https://jlpt.erzhiqian.cc")!
    var token: String?

    func get<T: Decodable>(_ path: String) async throws -> T { try await send(path) }
    func post<T: Decodable, Body: Encodable>(_ path: String, body: Body) async throws -> T {
        try await send(path, method: "POST", data: JSONEncoder().encode(body))
    }
    func put<T: Decodable, Body: Encodable>(_ path: String, body: Body) async throws -> T {
        try await send(path, method: "PUT", data: JSONEncoder().encode(body))
    }
    private func send<T: Decodable>(_ path: String, method: String = "GET", data: Data? = nil) async throws -> T {
        #if DEBUG
        Logger(subsystem: "cc.erzhiqian.jlptmasterdeck", category: "Network").debug("request \(method, privacy: .public) \(path, privacy: .public)")
        #endif
        var request = URLRequest(url: Self.origin.appendingPathComponent(path))
        request.httpMethod = method
        request.httpBody = data
        request.timeoutInterval = 30
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if data != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (bytes, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: bytes))?.error ?? "请求失败（\(http.statusCode)）"
            throw APIError.http(http.statusCode, message)
        }
        return try JSONDecoder().decode(T.self, from: bytes)
    }
    private struct ErrorBody: Decodable { let error: String }
}
enum APIError: LocalizedError {
    case invalidResponse, http(Int, String)
    var errorDescription: String? {
        switch self { case .invalidResponse: "服务器返回了无效响应"; case .http(let code, let message): code == 401 ? "登录已过期，请重新登录。" : message }
    }
}

enum SessionKeychain {
    private static let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "cc.erzhiqian.jlptmasterdeck.session", kSecAttrAccount as String: APIClient.origin.absoluteString]
    static func read() -> Session? {
        var query = query
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(Session.self, from: data)
    }
    static func save(_ session: Session) throws {
        let data = try JSONEncoder().encode(session)
        let attributes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil) }
        guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }
    static func clear() { SecItemDelete(query as CFDictionary) }
}
