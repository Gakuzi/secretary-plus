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
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;
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
                 this.finalTranscript += (this.finalTranscript ? ' ' : '') + currentFinalTranscript.trim();
            }
           
            this.onResult(this.finalTranscript + (interimTranscript ? (this.finalTranscript ? ' ' : '') + interimTranscript : ''));
        };

        this.recognition.onend = () => {
            if (this.isListening) {
                this.onEnd(this.finalTranscript);
            }
            this.isListening = false;
        };

        this.recognition.onerror = (event) => {
            if(this.isListening) {
                this.isListening = false;
                this.onError(event.error);
            }
        };
    }

    start(continuous = false) {
        if (!this.isSupported || this.isListening) return;
        this.isListening = true;
        this.finalTranscript = '';
        this.recognition.continuous = continuous;
        this.recognition.start();
    }

    stop() {
        if (!this.isSupported || !this.isListening) return;
        this.recognition.stop();
    }

    abort() {
        if (!this.isSupported || !this.isListening) return;
        this.isListening = false;
        this.recognition.abort();
    }
}