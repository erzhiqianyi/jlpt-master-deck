import AVFoundation
import SwiftUI

/// 読み上げ：設定の読み上げサービスが browser なら端末の日本語音声、それ以外はサーバーの /api/tts/speak（キャッシュあり）。
@MainActor @Observable
final class SpeechPlayer: NSObject, AVAudioPlayerDelegate, AVSpeechSynthesizerDelegate {
    private(set) var owner = ""
    private(set) var isPlaying = false
    private(set) var error: String?
    private let synthesizer = AVSpeechSynthesizer()
    private var audio: AVAudioPlayer?
    private var queue: [Data] = []
    private var task: Task<Void, Never>?

    override init() { super.init(); synthesizer.delegate = self }

    func stop() {
        task?.cancel(); task = nil
        audio?.stop(); audio = nil; queue = []
        synthesizer.stopSpeaking(at: .immediate)
        owner = ""; isPlaying = false
    }

    func play(_ text: String, store: AppStore, owner: String) {
        stop()
        self.owner = owner; error = nil; isPlaying = true
        let speech = store.settings.speech
        if speech.provider == "browser" || store.isDemo {
            let utterance = AVSpeechUtterance(string: text)
            let voice = speech.voices["browser"]?.voice
            utterance.voice = voice.flatMap(AVSpeechSynthesisVoice.init(identifier:)) ?? AVSpeechSynthesisVoice(language: "ja-JP")
            utterance.rate = Float(0.45 * speech.rate)
            synthesizer.speak(utterance)
            return
        }
        let voice = speech.voices[speech.provider]
        let api = store.api
        task = Task { [weak self] in
            do {
                var clips: [Data] = []
                for chunk in Self.chunks(text) {
                    let request = SpeechRequest(provider: speech.provider, text: chunk, voice: voice?.voice ?? "", style: voice?.style ?? "", role: voice?.role ?? "")
                    clips.append(try await api.speechAudio(request))
                }
                try Task.checkCancellation()
                self?.queue = clips
                self?.playNext(rate: speech.rate)
            } catch {
                if !(error is CancellationError) { self?.error = error.localizedDescription; self?.isPlaying = false }
            }
        }
    }
    private func playNext(rate: Double) {
        guard !queue.isEmpty else { isPlaying = false; owner = ""; return }
        let data = queue.removeFirst()
        do {
            let player = try AVAudioPlayer(data: data)
            player.delegate = self; player.enableRate = true; player.rate = Float(rate)
            audio = player
            if !player.play() { throw IdentityError.message("语音播放失败，请重试。") }
        } catch { self.error = error.localizedDescription; isPlaying = false }
    }
    /// サーバーの上限（450 文字）を超えないよう文で区切る。
    nonisolated static func chunks(_ text: String) -> [String] {
        var result: [String] = []
        var current = ""
        for character in text {
            if current.utf16.count >= 440, "。！？\n".contains(character) || current.utf16.count >= 450 {
                result.append(current); current = ""
            }
            current.append(character)
        }
        if !current.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { result.append(current) }
        return result
    }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            guard self.audio === player else { return }
            self.playNext(rate: Double(player.rate))
        }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.isPlaying = false; self.owner = "" }
    }
}

struct SpeechButton: View {
    @Environment(AppStore.self) private var store
    let text: String
    var label = "朗读"
    @State private var owner = UUID().uuidString
    private var active: Bool { store.speechPlayer.owner == owner && store.speechPlayer.isPlaying }
    var body: some View {
        Button {
            if active { store.speechPlayer.stop() } else { store.speechPlayer.play(text, store: store, owner: owner) }
        } label: {
            Image(systemName: active ? "stop.fill" : "speaker.wave.2").frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel(active ? "停止" : label)
        .onDisappear { if store.speechPlayer.owner == owner { store.speechPlayer.stop() } }
    }
}

/// 端末に保存した音声（なければダウンロード）を再生する。
struct MediaAudioPlayer: View {
    @Environment(AppStore.self) private var store
    let mediaId: Int
    @State private var player: AVAudioPlayer?
    @State private var loading = false
    @State private var playing = false
    @State private var error: String?
    var body: some View {
        HStack(spacing: 12) {
            Button {
                if playing { player?.pause(); playing = false; return }
                if let player { player.play(); playing = true; return }
                Task {
                    loading = true; defer { loading = false }
                    do {
                        let url = try await store.media(mediaId)
                        let value = try AVAudioPlayer(contentsOf: url)
                        player = value; value.play(); playing = true
                    } catch { self.error = error.localizedDescription }
                }
            } label: {
                if loading { ProgressView().frame(width: 44, height: 44) }
                else { Image(systemName: playing ? "pause.circle.fill" : "play.circle.fill").font(.largeTitle) }
            }.accessibilityLabel(playing ? "暂停" : "播放音频").accessibilityIdentifier("media.play")
            Button { player?.currentTime = 0; player?.play(); playing = player != nil } label: { Image(systemName: "gobackward").frame(width: 44, height: 44) }
                .disabled(player == nil).accessibilityLabel("从头播放")
            if let error { Text(error).font(.caption).foregroundStyle(.red) }
        }
        .onDisappear { player?.stop() }
    }
}
