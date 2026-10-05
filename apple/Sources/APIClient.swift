import Foundation
import Security
#if DEBUG
import OSLog
#endif

struct APIClient {
    // The website and native client intentionally address the same deployment.
    static let origin = URL(string: "https://jlpt.erzhiqian.cc")!
    var token: String?

    static func itemImageRequest(_ image: [String: String], token: String?) throws -> URLRequest {
        let url: URL?
        if let id = image["id"], !id.isEmpty {
            url = origin.appendingPathComponent("api/item-images").appendingPathComponent(id)
        } else {
            url = image["url"].flatMap { URL(string: $0, relativeTo: origin.appendingPathComponent("/"))?.absoluteURL }
        }
        guard let url, url.scheme == "https" else { throw APIError.invalidResponse }
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if url.host == origin.host, url.port == origin.port, let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

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
        guard let url = URL(string: path, relativeTo: Self.origin.appendingPathComponent("/")) else { throw APIError.invalidResponse }
        var request = URLRequest(url: url)
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
        do { return try JSONDecoder().decode(T.self, from: bytes) }
        catch let error as DecodingError {
            let context: DecodingError.Context
            switch error {
            case .keyNotFound(_, let value), .valueNotFound(_, let value), .typeMismatch(_, let value), .dataCorrupted(let value): context = value
            @unknown default: throw error
            }
            var fields = context.codingPath.map(\.stringValue)
            if case .keyNotFound(let key, _) = error { fields.append(key.stringValue) }
            throw APIError.decoding(path, fields.joined(separator: "."))
        }
    }
    func speechAudio(_ input: SpeechRequest) async throws -> Data {
        var request = URLRequest(url: Self.origin.appendingPathComponent("api/tts/speak"))
        request.httpMethod = "POST"; request.httpBody = try JSONEncoder().encode(input)
        request.timeoutInterval = 60; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (bytes, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: bytes))?.error ?? "语音下载失败（\(http.statusCode)）"
            throw APIError.http(http.statusCode, message)
        }
        guard !bytes.isEmpty, http.mimeType?.hasPrefix("audio/") == true else { throw APIError.invalidResponse }
        return bytes
    }
    private struct ErrorBody: Decodable { let error: String }
}
enum APIError: LocalizedError {
    case invalidResponse, http(Int, String)
    case decoding(String, String)
    var errorDescription: String? {
        switch self {
        case .invalidResponse: "服务器返回了无效响应"
        case .http(let code, let message): code == 401 ? "登录已过期，请重新登录。" : message
        case .decoding(let path, let field): "数据格式不匹配：\(path)\(field.isEmpty ? "" : " · \(field)")"
        }
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
