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
        this.recognition.continuous = true;
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
            // Only fire the callback if we were actively listening until the end.
            // This prevents firing on aborts or errors that have already been handled.
            if (this.isListening) {
                this.onEnd(this.finalTranscript);
            }
            this.isListening = false;
        };

        this.recognition.onerror = (event) => {
            // isListening is set to false before calling onError to prevent onend from firing.
            if(this.isListening) {
                this.isListening = false;
                this.onError(event.error);
            }
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
        // Let the 'onend' event handler call the onEnd callback to ensure all results are processed.
        this.recognition.stop();
    }

    abort() {
        if (!this.isSupported || !this.isListening) return;
        // Set listening to false *before* aborting.
        // This prevents the 'onend' handler from calling the onEnd callback.
        this.isListening = false;
        this.recognition.abort();
    }
}