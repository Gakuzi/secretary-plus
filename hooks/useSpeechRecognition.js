import { useState, useEffect, useRef } from 'react';

const getSpeechRecognition = () => {
    if (typeof window !== 'undefined') {
        return window.SpeechRecognition || window.webkitSpeechRecognition;
    }
    return null;
};

const SpeechRecognitionAPI = getSpeechRecognition();

export const useSpeechRecognition = () => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const recognitionRef = useRef(null);

    useEffect(() => {
        if (!SpeechRecognitionAPI) {
            console.warn('Web Speech API не поддерживается в этом браузере.');
            return;
        }

        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ru-RU';

        recognition.onstart = () => {
            setIsListening(true);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognition.onerror = (event) => {
            console.error('Ошибка распознавания речи:', event.error);
            setIsListening(false);
        };

        recognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            // Use the most recent interim result for live transcription
            const interimTranscript = event.results[event.results.length - 1][0].transcript;
            setTranscript(finalTranscript + interimTranscript);
        };

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, []);

    const startListening = () => {
        if (recognitionRef.current && !isListening) {
            setTranscript('');
            recognitionRef.current.start();
        }
    };

    const stopListening = () => {
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
        }
    };

    return {
        transcript,
        isListening,
        startListening,
        stopListening,
        hasRecognitionSupport: !!SpeechRecognitionAPI,
    };
};