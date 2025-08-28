import { MessageSender } from '../types.js';
import { createResultCardElement } from './ResultCard.js';

// A simple markdown to HTML converter
function markdownToHTML(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>')     // Italic
        .replace(/`([^`]+)`/g, '<code class="bg-gray-700 text-sm rounded px-1 py-0.5">$1</code>') // Inline code
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">$1</a>') // Link
        .replace(/\n/g, '<br>'); // Newlines
}

export function createMessageElement(message) {
    const isUser = message.sender === MessageSender.USER;
    const wrapper = document.createElement('div');
    wrapper.className = `flex items-start space-x-3 message-item ${isUser ? 'justify-end' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = `w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 ${isUser ? 'bg-blue-600' : 'bg-gray-700'}`;
    avatar.textContent = isUser ? 'ВЫ' : 'S+';
    
    const contentContainer = document.createElement('div');
    contentContainer.className = `max-w-xl ${isUser ? 'order-first' : ''}`;

    const authorName = document.createElement('div');
    authorName.className = 'font-bold';
    authorName.textContent = isUser ? 'Вы' : 'Секретарь+';

    const messageBubble = document.createElement('div');
    messageBubble.className = `p-3 rounded-lg mt-1 ${isUser ? 'bg-blue-700' : 'bg-gray-800'}`;
    
    if (message.text) {
        const textElement = document.createElement('div');
        textElement.innerHTML = markdownToHTML(message.text);
        messageBubble.appendChild(textElement);
    }

    if (message.image) {
        const imageElement = document.createElement('img');
        imageElement.src = `data:${message.image.mimeType};base64,${message.image.base64}`;
        imageElement.className = 'mt-2 rounded-lg max-w-xs';
        messageBubble.appendChild(imageElement);
    }
    
    if (message.card) {
        const cardElement = createResultCardElement(message.card);
        messageBubble.appendChild(cardElement);
    }

    contentContainer.appendChild(authorName);
    contentContainer.appendChild(messageBubble);

    wrapper.appendChild(avatar);
    wrapper.appendChild(contentContainer);
    
    if (isUser) {
       // Swap order for user messages
       wrapper.insertBefore(contentContainer, avatar);
    }

    return wrapper;
}
