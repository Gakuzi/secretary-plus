import { MessageSender } from '../types.js';
import { createResultCardElement } from './ResultCard.js';
import * as Icons from './icons/Icons.js';
import { AppLogoIcon } from './icons/Icons.js';

// A simple markdown to HTML converter
function markdownToHTML(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>')     // Italic
        .replace(/`([^`]+)`/g, '<code class="bg-slate-200 dark:bg-slate-700 text-sm rounded px-1 py-0.5">$1</code>') // Inline code
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-500 dark:text-blue-400 hover:underline">$1</a>') // Link
        .replace(/\n/g, '<br>'); // Newlines
}

export function createMessageElement(message) {
    const isUser = message.sender === MessageSender.USER;
    const isSystem = message.sender === MessageSender.SYSTEM;
    const wrapper = document.createElement('div');
    wrapper.className = `flex items-start space-x-3 message-item ${isUser ? 'justify-end' : ''}`;
    wrapper.dataset.messageId = message.id;

    let authorNameText;
    let bubbleClass;

    const avatar = document.createElement('div');

    if (isUser) {
        authorNameText = 'Вы';
        bubbleClass = 'bg-blue-500 text-white';
        avatar.className = 'w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 bg-blue-500 text-white';
        avatar.textContent = 'ВЫ';
    } else if (isSystem) {
        authorNameText = 'Система';
        bubbleClass = 'bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-200';
        avatar.className = 'w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 bg-amber-400 text-amber-900';
        avatar.textContent = '!';
    } else {
        authorNameText = 'Секретарь+';
        bubbleClass = 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100';
        avatar.className = 'w-10 h-10 flex-shrink-0';
        avatar.innerHTML = AppLogoIcon;
    }
    
    const contentContainer = document.createElement('div');
    contentContainer.className = `max-w-xl ${isUser ? 'order-first' : ''}`;

    const authorName = document.createElement('div');
    authorName.className = 'font-bold';
    authorName.textContent = authorNameText;
    
    contentContainer.appendChild(authorName);

    // If there is a card, we don't use a bubble. The card is the message.
    if (message.card) {
        const cardElement = createResultCardElement(message.card);
        cardElement.classList.add('mt-1'); // Add margin that the bubble would have had
        contentContainer.appendChild(cardElement);

    } else { // Handle regular text/image messages with a bubble
        const messageBubble = document.createElement('div');
        messageBubble.className = `p-3 rounded-lg mt-1 ${bubbleClass}`;
        
        if (message.text) {
            const textElement = document.createElement('div');
            if (isSystem) {
                textElement.innerHTML = `<div class="flex items-start gap-2"><span class="w-5 h-5 mt-0.5 flex-shrink-0">${Icons.AlertTriangleIcon}</span><div>${markdownToHTML(message.text)}</div></div>`;
            } else {
                textElement.innerHTML = markdownToHTML(message.text);
            }
            messageBubble.appendChild(textElement);
        }

        if (message.image) {
            const imageElement = document.createElement('img');
            imageElement.src = `data:${message.image.mimeType};base64,${message.image.base64}`;
            imageElement.className = 'mt-2 rounded-lg max-w-xs';
            messageBubble.appendChild(imageElement);
        }
        
        contentContainer.appendChild(messageBubble);
    }
    
    if (message.suggestedReplies && message.suggestedReplies.length > 0) {
        const repliesContainer = document.createElement('div');
        repliesContainer.className = 'mt-2 flex flex-wrap gap-2 quick-replies-container';
        
        message.suggestedReplies.forEach(replyText => {
            const button = document.createElement('button');
            button.className = 'quick-reply-button bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 px-3 py-1.5 rounded-full text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-all';
            button.textContent = replyText;
            button.dataset.replyText = replyText;
            repliesContainer.appendChild(button);
        });

        contentContainer.appendChild(repliesContainer);
    }

    wrapper.appendChild(avatar);
    wrapper.appendChild(contentContainer);
    
    if (isUser) {
       // Swap order for user messages
       wrapper.insertBefore(contentContainer, avatar);
    }

    return wrapper;
}