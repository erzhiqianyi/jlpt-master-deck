import Foundation

/// 復習の間隔。src/domain/reviewSchedule.mjs（サーバー・Web と共通の規則）をそのまま移したもの。
/// オフラインで評価したカードの次の予定を端末で先に出すために使う。同期するとサーバーの計算で置き換わる。
enum ReviewSchedule {
    private static let day: TimeInterval = 86_400
    private static func clampEase(_ ease: Double) -> Double { max(1.3, min(ease.isFinite ? ease : 2.5, 3.0)) }
    private static func clampInterval(_ days: Int) -> Int { max(0, min(days, 365)) }
    private static func round2(_ value: Double) -> Double { (value * 100).rounded() / 100 }
    /// JavaScript の Math.round と同じ（.5 は大きい方へ）。
    private static func jsRound(_ value: Double) -> Int { Int((value + 0.5).rounded(.down)) }

    static func status(intervalDays: Int, reviewCount: Int) -> String {
        if intervalDays >= 21 && reviewCount >= 4 { return "mastered" }
        if intervalDays >= 1 { return "review" }
        return "learning"
    }

    private static func grow(_ previous: Int, ease: Double) -> Int {
        if previous < 1 { return 1 }
        if previous <= 1 { return 3 }
        return min(365, max(4, jsRound(Double(max(previous, 3)) * ease)))
    }

    static func afterAnswer(_ current: ReviewState?, correct: Bool, now: Date = .now) -> ReviewState {
        let previous = clampInterval(current?.intervalDays ?? 0)
        let ease = clampEase(current?.ease ?? 2.5)
        let due = current?.dueAt.flatMap(StudyDates.parse)
        let early = current != nil && correct && due.map { $0 > now } == true
        let reviewCount = (current?.reviewCount ?? 0) + 1
        let nextEase = early ? ease : correct ? clampEase(ease + 0.15) : clampEase(ease - 0.2)
        let interval = early ? previous : correct ? grow(previous, ease: nextEase) : 1
        return ReviewState(status: correct ? status(intervalDays: interval, reviewCount: reviewCount) : "learning",
                           reviewCount: reviewCount, ease: round2(nextEase), intervalDays: interval,
                           dueAt: StudyDates.iso(early ? due! : now.addingTimeInterval(Double(interval) * day)),
                           firstSeenAt: current?.firstSeenAt ?? StudyDates.iso(now), lastReviewedAt: StudyDates.iso(now))
    }

    private static let ratingEase: [MemoryRating: Double] = [.forgot: -0.2, .hard: -0.05, .remembered: 0.05, .easy: 0.15]

    static func afterRating(_ current: ReviewState?, rating: MemoryRating, now: Date = .now) -> ReviewState {
        let previous = clampInterval(current?.intervalDays ?? 0)
        let ease = clampEase((current?.ease ?? 2.5) + ratingEase[rating]!)
        let reviewCount = (current?.reviewCount ?? 0) + 1
        let interval: Int
        switch rating {
        case .forgot: interval = 0
        case .hard: interval = max(1, jsRound(Double(previous) * 1.2))
        case .remembered: interval = previous < 1 ? 3 : min(365, max(previous + 1, jsRound(Double(previous) * ease)))
        case .easy: interval = previous < 1 ? 7 : min(365, max(previous + 2, jsRound(Double(previous) * ease * 1.3)))
        }
        let due = rating == .forgot ? now.addingTimeInterval(600) : now.addingTimeInterval(Double(interval) * day)
        return ReviewState(status: rating == .forgot ? "learning" : status(intervalDays: interval, reviewCount: reviewCount),
                           reviewCount: reviewCount, ease: round2(ease), intervalDays: interval, dueAt: StudyDates.iso(due),
                           firstSeenAt: current?.firstSeenAt ?? StudyDates.iso(now), lastReviewedAt: StudyDates.iso(now))
    }

    /// 評価ボタンに出す「次の復習」までの目安。
    static func preview(_ current: ReviewState?, rating: MemoryRating) -> String {
        let next = afterRating(current, rating: rating)
        if rating == .forgot { return String(localized: "10 分钟") }
        return String(localized: "\(next.intervalDays) 天")
    }
}

enum StudyDates {
    private static let fractional: ISO8601DateFormatter = {
        let value = ISO8601DateFormatter(); value.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return value
    }()
    private static let plain = ISO8601DateFormatter()
    static func parse(_ value: String) -> Date? { fractional.date(from: value) ?? plain.date(from: value) }
    static func iso(_ date: Date) -> String { fractional.string(from: date) }
    static func day(_ date: Date = .now) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}
