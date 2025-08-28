

import React from 'react';
import { ChatMessage, MessageSender, SelectionOption } from '../types';
import ResultCard from './ResultCard';

interface MessageProps {
    message: ChatMessage;
    onSelection?: (type: 'contact' | 'document', option: SelectionOption) => void;
}

const Message: React.FC<MessageProps> = ({ message, onSelection }) => {
    const isUser = message.sender === MessageSender.USER;
    const isAssistant = message.sender === MessageSender.ASSISTANT;
    const isSystem = message.sender === MessageSender.SYSTEM;

    if (message.isLoading) {
        return (
            <div className="flex items-start space-x-3">
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center font-bold">A</div>
                <div className="flex items-center space-x-2 pt-2">
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
            </div>
        );
    }
    
    if (isSystem) {
        return (
            <div className="flex justify-center">
                <p className="px-4 py-2 text-sm bg-red-900 bg-opacity-50 text-red-300 rounded-full">{message.text}</p>
            </div>
        )
    }

    return (
        <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
            {isAssistant && <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center font-bold flex-shrink-0">A</div>}
            <div className={`max-w-xl rounded-lg shadow ${isUser ? 'bg-indigo-600' : 'bg-gray-700'} ${!message.text && message.image ? 'p-1' : 'p-3'}`}>
                {message.image && (
                    <img 
                        src={`data:${message.image.mimeType};base64,${message.image.base64}`}
                        alt="Прикрепленное изображение"
                        className={`rounded-lg max-w-xs ${message.text ? 'mb-2' : ''}`}
                    />
                )}
                {message.text && <p className="text-white whitespace-pre-wrap">{message.text}</p>}
                {message.card && <ResultCard cardData={message.card} onSelection={onSelection} />}
            </div>
        </div>
    );
};

export default Message;