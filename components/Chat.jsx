import React, { useState, useRef, useEffect, useContext } from 'react';
import { AppContext } from '../contexts/AppContext.jsx';
import { MessageSender } from '../types.js';
import Message from './Message.jsx';
import CameraView from './CameraView.jsx';
import { PaperclipIcon, MicIcon, SendIcon, CameraIcon, CloseIcon } from './icons/Icons.jsx';
import { callGemini } from '../services/geminiService.js';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition.js';

const Chat = () => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [attachedImage, setAttachedImage] = useState(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const chatEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const { serviceProvider, isUnsupportedDomain } = useContext(AppContext);

    const {
        transcript,
        isListening,
        startListening,
        stopListening,
        hasRecognitionSupport,
    } = useSpeechRecognition();

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (transcript) {
            setInput(transcript);
        }
    }, [transcript]);

    const handleMicClick = () => {
        if (isListening) {
            stopListening();
        } else {
            setInput(''); // Clear input before starting
            startListening();
        }
    };
    
    const sendMessage = async (userMessage, messageHistory) => {
        setIsLoading(true);

        const loadingMessage = {
            id: (Date.now() + 1).toString(),
            sender: MessageSender.ASSISTANT,
            isLoading: true,
        };
        setMessages(prev => [...prev, loadingMessage]);

        try {
            const response = await callGemini(userMessage.text || '', messageHistory, serviceProvider, isUnsupportedDomain, userMessage.image);
            
            setMessages(prev => [...prev.filter(m => !m.isLoading), response]);
        } catch (error) {
            console.error("Ошибка при вызове Gemini:", error);
            const errorMessage = {
                id: (Date.now() + 2).toString(),
                sender: MessageSender.SYSTEM,
                text: "Произошла ошибка. Не удалось получить ответ от ассистента.",
            };
            setMessages(prev => [...prev.filter(m => !m.isLoading), errorMessage]);
        } finally {
            setIsLoading(false);
        }
    }

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (isListening) {
            stopListening();
        }
        if ((!input.trim() && !attachedImage) || isLoading) return;

        const userMessage = {
            id: Date.now().toString(),
            sender: MessageSender.USER,
            text: input,
            image: attachedImage || undefined,
        };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setAttachedImage(null);
        
        const history = messages.filter(m => !m.isLoading);
        sendMessage(userMessage, [...history, userMessage]);
    };

    const handleSelection = (messageId, type, option) => {
        const originalMessage = messages.find(m => m.id === messageId);
        if (!originalMessage || !originalMessage.originalPrompt) return;

        setMessages(prevMessages => 
            prevMessages.map(msg => 
                msg.id === messageId 
                    ? { ...msg, card: undefined, text: `Вы выбрали: ${option.label}` } 
                    : msg
            )
        );

        const context = type === 'contact' 
            ? `Пользователь выбрал контакт: ${option.label} (${option.description}). Данные: ${JSON.stringify(option.data)}`
            : `Пользователь выбрал документ: ${option.label}. Данные: ${JSON.stringify(option.data)}`;
        
        const newPrompt = `Контекст: ${context}\n\nИсходный запрос пользователя: "${originalMessage.originalPrompt}"\n\nПродолжи выполнение исходного запроса с учетом предоставленного контекста. Задавай дальнейшие уточняющие вопросы, если это необходимо.`;

        const history = messages.filter(m => m.id !== messageId && !m.isLoading);
        sendMessage({ id: 'continuation', sender: MessageSender.USER, text: newPrompt }, history);
    };

    const handleFileAttach = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event) => {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = (e.target?.result).split(',')[1];
                if (base64) {
                    setAttachedImage({ base64, mimeType: file.type });
                }
            };
            reader.readAsDataURL(file);
        } else if (file) {
            alert("Пожалуйста, выберите файл изображения.");
        }
        event.target.value = ''; // Reset input
    };

    const handleCapture = (imageDataUrl) => {
        const [header, base64] = imageDataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
        if (base64) {
            setAttachedImage({ base64, mimeType });
        }
        setIsCameraOpen(false);
    };

    return (
        <div className="flex flex-col h-full bg-gray-900">
            {isCameraOpen && <CameraView onCapture={handleCapture} onClose={() => setIsCameraOpen(false)} />}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                {messages.map(msg => (
                    <Message 
                        key={msg.id} 
                        message={msg} 
                        onSelection={(type, option) => handleSelection(msg.id, type, option)}
                    />
                ))}
                <div ref={chatEndRef} />
            </div>
            <div className="p-4 bg-gray-800 border-t border-gray-700">
                {attachedImage && (
                    <div className="relative w-24 h-24 mb-2 p-1 border border-gray-600 rounded-lg">
                        <img 
                            src={`data:${attachedImage.mimeType};base64,${attachedImage.base64}`} 
                            alt="Preview" 
                            className="w-full h-full object-cover rounded"
                        />
                        <button 
                            onClick={() => setAttachedImage(null)}
                            className="absolute -top-2 -right-2 bg-gray-900 rounded-full p-1 text-white hover:bg-red-600"
                            aria-label="Удалить изображение"
                        >
                            <CloseIcon className="w-4 h-4" />
                        </button>
                    </div>
                )}
                <form onSubmit={handleSendMessage} className="flex items-center space-x-2 md:space-x-4">
                     <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        style={{ display: 'none' }}
                    />
                    <button 
                        type="button" 
                        onClick={handleFileAttach}
                        className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-700 transition-colors"
                        aria-label="Прикрепить файл"
                    >
                        <PaperclipIcon />
                    </button>
                    {hasRecognitionSupport ? (
                        <button 
                            type="button" 
                            onClick={handleMicClick} 
                            className={`p-2 rounded-full transition-colors ${isListening ? 'text-red-500 bg-red-900 bg-opacity-50' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                            title={isListening ? 'Остановить запись' : 'Начать голосовой ввод'}
                        >
                            <MicIcon />
                        </button>
                    ) : (
                         <button type="button" disabled className="p-2 text-gray-600 rounded-full cursor-not-allowed" title="Голосовой ввод не поддерживается в вашем браузере">
                            <MicIcon />
                        </button>
                    )}
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={isListening ? "Слушаю..." : "Спросите что-нибудь..."}
                        className="flex-1 p-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                        disabled={isLoading}
                    />
                     <button
                        type="button"
                        onClick={() => setIsCameraOpen(true)}
                        className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-700 transition-colors"
                        aria-label="Сделать снимок"
                    >
                        <CameraIcon />
                    </button>
                    <button
                        type="submit"
                        disabled={(!input.trim() && !attachedImage) || isLoading}
                        className="p-3 bg-indigo-600 rounded-lg text-white disabled:bg-indigo-900 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
                    >
                        <SendIcon />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Chat;