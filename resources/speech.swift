import Speech
import AVFoundation
import Foundation

// Reads a command from stdin: "start" or "stop"
// Writes transcription results to stdout as JSON lines:
//   {"type":"interim","text":"..."}
//   {"type":"final","text":"..."}
//   {"type":"error","message":"..."}
//   {"type":"stopped"}

final class Recognizer: NSObject, SFSpeechRecognizerDelegate {
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))!
    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?

    func start() {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                self.emit(["type": "error", "message": "Speech recognition not authorized"])
                return
            }
            DispatchQueue.main.async { self.beginRecognition() }
        }
    }

    private func beginRecognition() {
        do {
            let node = audioEngine.inputNode
            let format = node.outputFormat(forBus: 0)

            recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
            guard let request = recognitionRequest else { return }
            request.shouldReportPartialResults = true

            recognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
                guard let self else { return }
                if let result {
                    let text = result.bestTranscription.formattedString
                    if result.isFinal {
                        self.emit(["type": "final", "text": text])
                    } else {
                        self.emit(["type": "interim", "text": text])
                    }
                }
                if let error {
                    self.emit(["type": "error", "message": error.localizedDescription])
                    self.stop()
                }
            }

            node.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }

            audioEngine.prepare()
            try audioEngine.start()
        } catch {
            emit(["type": "error", "message": error.localizedDescription])
        }
    }

    func stop() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask?.cancel()
        recognitionTask = nil
        emit(["type": "stopped"])
    }

    private func emit(_ obj: [String: String]) {
        if let data = try? JSONSerialization.data(withJSONObject: obj),
           let line = String(data: data, encoding: .utf8) {
            print(line)
            fflush(stdout)
        }
    }
}

let recognizer = Recognizer()
var running = true

// Read commands from stdin
Thread.detachNewThread {
    while let line = readLine() {
        let cmd = line.trimmingCharacters(in: .whitespacesAndNewlines)
        if cmd == "start" {
            recognizer.start()
        } else if cmd == "stop" {
            recognizer.stop()
        } else if cmd == "quit" {
            running = false
            exit(0)
        }
    }
}

RunLoop.main.run()
