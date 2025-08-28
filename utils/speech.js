const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export class SpeechRecognizer {
    constructor(onResult, onEnd, onError) {
        if (!SpeechRecognition) {
            console.warn("Speech Recognition API is not supported in this browser.");
            this.isSupported = false;
            return;
        }
        this.isSupported = true;
        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'ru-RU';
        this.recognition.interimResults = true; // Включаем промежуточные результаты
        this.recognition.maxAlternatives = 1;
        this.isListening = false;
        this.manualStop = false;
        this.finalTranscript = '';

        this.onResult = onResult;
        this.onEnd = onEnd; // Changed from onAutoEnd
        this.onError = onError;

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            // Reset final transcript at the beginning of a new result set
            this.finalTranscript = event.results[0].isFinal ? '' : this.finalTranscript; 
            
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    this.finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            // Always provide the combined transcript for a live preview
            this.onResult(this.finalTranscript + interimTranscript);
        };

        this.recognition.onend = () => {
            if (this.isListening) { // Trigger onEnd whenever recognition stops
                this.onEnd(this.finalTranscript);
            }
            this.isListening = false;
        };

        this.recognition.onerror = (event) => {
            this.isListening = false;
            this.onError(event.error);
        };
    }

    start() {
        if (!this.isSupported || this.isListening) return;
        this.manualStop = false;
        this.isListening = true;
        this.finalTranscript = '';
        this.recognition.start();
    }

    stop() {
        if (!this.isSupported || !this.isListening) return;
        this.manualStop = true;
        this.recognition.stop();
        // onend will be called automatically, which then calls this.onEnd
    }
}
