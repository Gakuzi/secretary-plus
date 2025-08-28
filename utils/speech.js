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
        this.recognition.continuous = true; // Keep listening
        this.isListening = false;
        this.finalTranscript = '';

        this.onResult = onResult;
        this.onEnd = onEnd;
        this.onError = onError;

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let currentFinalTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    currentFinalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            
            if (currentFinalTranscript) {
                 this.finalTranscript += (this.finalTranscript ? ' ' : '') + currentFinalTranscript;
            }
           
            this.onResult(this.finalTranscript + interimTranscript);
        };

        this.recognition.onend = () => {
            if (this.isListening) { 
                // This is the callback for when stop() is called manually.
                // It will not be called if recognition stops automatically while continuous.
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
        this.isListening = true;
        this.finalTranscript = '';
        this.recognition.start();
    }

    stop() {
        if (!this.isSupported || !this.isListening) return;
        this.isListening = false; // Set to false before stopping to prevent onend from firing the callback incorrectly
        this.recognition.stop();
        // The onend handler will now correctly call the onEnd callback with the final transcript.
        this.onEnd(this.finalTranscript);
    }
}