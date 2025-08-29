import * as Icons from './icons/Icons.js';

const CARD_COLORS = {
    'CalendarIcon': 'purple',
    'CheckSquareIcon': 'blue',
    'UsersIcon': 'green',
    'EmailIcon': 'teal',
    'FileIcon': 'orange',
    'AlertTriangleIcon': 'rose',
    'default': 'slate'
};

const getCardColor = (iconName) => CARD_COLORS[iconName] || CARD_COLORS['default'];

function createShareActions(card) {
    if (!card.shareableLink) return '';
    
    const encodedLink = encodeURIComponent(card.shareableLink);
    const encodedText = encodeURIComponent(card.shareText);

    const whatsappUrl = `https://wa.me/?text=${encodedText}`;
    const telegramUrl = `https://t.me/share/url?url=${encodedLink}&text=${encodedText}`;

    return `
        <div class="border-t border-slate-200 dark:border-slate-600 pt-2 mt-3 flex items-center gap-3">
             <span class="text-sm text-slate-500 dark:text-slate-400">Поделиться:</span>
             <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" class="share-button whatsapp" aria-label="Поделиться в WhatsApp">
                ${Icons.WhatsAppIcon}
             </a>
             <a href="${telegramUrl}" target="_blank" rel="noopener noreferrer" class="share-button telegram" aria-label="Поделиться в Telegram">
                ${Icons.TelegramIcon}
             </a>
        </div>
    `;
}

function createStandardCard(card, color) {
    const iconSVG = Icons[card.icon] || '';
    let detailsHtml = '';
    if (card.details) {
        detailsHtml = Object.entries(card.details).map(([key, value]) => `
            <div class="flex justify-between text-sm">
                <span class="text-slate-500 dark:text-slate-400">${key}:</span>
                <span class="font-medium text-slate-700 dark:text-slate-200 text-right">${value}</span>
            </div>
        `).join('');
    }

    let actionsHtml = '';
    if (card.actions) {
        actionsHtml = card.actions.map(action => {
            let buttonClass = "px-3 py-1.5 rounded-md text-sm font-semibold text-white transition-colors ";
            if (action.style === 'danger') {
                buttonClass += 'bg-red-600 hover:bg-red-700';
            } else {
                buttonClass += 'bg-blue-500 hover:bg-blue-600';
            }

            if (action.url) {
                buttonClass = 'px-3 py-1.5 bg-slate-500 dark:bg-slate-600 hover:bg-slate-600 dark:hover:bg-slate-500 text-white rounded-md text-sm font-semibold transition-colors';
                return `<a href="${action.url}" target="_blank" rel="noopener noreferrer" class="${buttonClass}">${action.label}</a>`;
            }
            if (action.clientAction) {
                // This is a new type of action that is handled client-side
                return `<button data-client-action="${action.clientAction}" class="${buttonClass}">${action.label}</button>`;
            }
            if (action.action) {
                 const payload = JSON.stringify(action.payload || {});
                 return `<button data-action="${action.action}" data-payload='${payload}' class="${buttonClass}">${action.label}</button>`;
            }
            return '';
        }).join('');
    }
    
    const shareHtml = createShareActions(card);

    return `
        <div class="flex items-center mb-2">
            <div class="w-6 h-6 mr-2 text-${color}-500 dark:text-${color}-400">${iconSVG}</div>
            <h4 class="font-bold text-slate-800 dark:text-slate-100">${card.title}</h4>
        </div>
        ${card.text ? `<p class="text-sm text-slate-600 dark:text-slate-300 mb-3">${card.text}</p>` : ''}
        <div class="space-y-1 mb-3">
            ${detailsHtml}
        </div>
        <div class="flex flex-wrap gap-2">
            ${actionsHtml}
        </div>
        ${shareHtml}
    `;
}

export function createCalendarViewCard(events) {
    const itemsHtml = events.map(event => {
        const start = event.start.dateTime || event.start.date;
        const end = event.end.dateTime || event.end.date;
        const isAllDay = !event.start.dateTime;
        
        let timeString;
        if (isAllDay) {
            timeString = 'Весь день';
        } else {
            const options = { hour: '2-digit', minute: '2-digit', hour12: false };
            const startTime = new Date(start).toLocaleTimeString('ru-RU', options);
            const endTime = new Date(end).toLocaleTimeString('ru-RU', options);
            timeString = `${startTime} - ${endTime}`;
        }
        
        const payload = {
            type: 'event',
            id: event.id,
            summary: event.summary,
            description: event.description,
            startTime: start,
            endTime: end,
            htmlLink: event.htmlLink,
            hangoutLink: event.hangoutLink,
        };

        return `
            <button data-action="analyze_event" data-payload='${JSON.stringify(payload)}' class="w-full flex items-start gap-3 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors text-left">
                <div class="w-20 text-right font-mono text-sm text-slate-500 dark:text-slate-300 flex-shrink-0">${timeString}</div>
                <div class="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 mt-2 flex-shrink-0"></div>
                <div class="flex-1 min-w-0">
                    <p class="font-semibold text-slate-800 dark:text-slate-100 truncate">${event.summary}</p>
                    ${event.description ? `<p class="text-xs text-slate-500 dark:text-slate-400 truncate">${event.description}</p>` : ''}
                </div>
            </button>
        `;
    }).join('');

    return {
        type: 'calendar_view',
        icon: 'CalendarIcon',
        title: 'Ваше расписание',
        htmlContent: `<div class="space-y-1">${itemsHtml}</div>`
    };
}


export function createTasksViewCard(tasks) {
    const itemsHtml = tasks.map(task => {
        const payload = {
            type: 'task',
            id: task.id,
            title: task.title,
            notes: task.notes,
            due: task.due,
        };
        return `
        <button data-action="analyze_task" data-payload='${JSON.stringify(payload)}' class="w-full flex items-start gap-3 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors text-left">
            <div class="w-5 h-5 border-2 border-slate-400 dark:border-slate-500 rounded mt-0.5 flex-shrink-0"></div>
            <div class="flex-1 min-w-0">
                <p class="font-medium text-slate-800 dark:text-slate-100">${task.title}</p>
                 ${task.notes ? `<p class="text-xs text-slate-500 dark:text-slate-400 truncate">${task.notes.replace(/\n/g, ' ')}</p>` : ''}
            </div>
        </button>
    `}).join('');

    return {
        type: 'tasks_view',
        icon: 'CheckSquareIcon',
        title: 'Активные задачи',
        htmlContent: `<div class="space-y-1">${itemsHtml}</div>`,
    };
}

export function createEmailsViewCard(emails) {
    const itemsHtml = emails.map(email => {
        const from = email.from.replace(/<.*?>/g, '').trim();
        const payload = { ...email, from }; // Pass the full email object to the payload

        return `
            <button data-action="analyze_email" data-payload='${JSON.stringify(payload)}' class="w-full border-b border-slate-200 dark:border-slate-700/50 last:border-b-0 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-900/50 px-2 rounded-md transition-colors">
                <p class="font-semibold text-sm text-slate-600 dark:text-slate-200 truncate">${from}</p>
                <p class="font-medium text-slate-800 dark:text-slate-100">${email.subject || '(Без темы)'}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 truncate">${email.snippet}</p>
            </button>
        `;
    }).join('');

    return {
        type: 'emails_view',
        icon: 'EmailIcon',
        title: 'Последние письма',
        htmlContent: `<div class="space-y-1">${itemsHtml}</div>`
    };
}


export function createNoteCard(note, providerName) {
    const isGoogleDoc = note.mimeType === 'application/vnd.google-apps.document';
    const title = note.title || note.name || 'Безымянная заметка';
    const link = note.url || note.webViewLink;

    const cardData = {
        type: 'note_confirmation',
        icon: 'FileIcon',
        title: title,
        details: {
            'Хранилище': providerName,
            'Тип': isGoogleDoc ? 'Google Документ' : 'Заметка',
        },
        actions: link ? [{ label: 'Открыть', url: link }] : [],
    };

    return cardData;
}


function createDocumentProposalCard(card, color) {
    const iconSVG = Icons[card.icon] || '';
    const summaryHtml = card.summary.replace(/\n/g, '<br>');

    const actionsHtml = card.actions.map(action => {
         const payload = JSON.stringify(action.payload || {});
         const isPrimary = action.label.includes('с содержанием');
         const buttonClass = isPrimary 
            ? 'bg-blue-500 hover:bg-blue-600' 
            : 'bg-slate-500 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500';
         return `<button data-action="${action.action}" data-payload='${payload}' class="px-4 py-2 text-white ${buttonClass} rounded-md text-sm font-semibold transition-colors">${action.label}</button>`;
    }).join('');

    return `
        <div class="flex items-center mb-3">
            <div class="w-6 h-6 mr-2 text-${color}-500 dark:text-${color}-400">${iconSVG}</div>
            <h4 class="font-bold text-slate-800 dark:text-slate-100">${card.title}</h4>
        </div>
        <p class="text-sm text-slate-600 dark:text-slate-300 mb-2">Предлагаемое содержание:</p>
        <div class="text-sm bg-slate-100 dark:bg-slate-900/50 p-3 rounded-md border border-slate-200 dark:border-slate-600 max-h-40 overflow-y-auto mb-4">
            ${summaryHtml}
        </div>
        <div class="flex flex-wrap gap-2 justify-end">
            ${actionsHtml}
        </div>
    `;
}

function createContactCard(card, color) {
    const person = card.person;
    const name = person.display_name || 'Имя не указано';
    const email = person.email || null;
    const phone = person.phone || null;
    
    const payload = JSON.stringify({ name, email });

    let actionsHtml = '';
    const buttonClass = "flex items-center gap-2 px-3 py-1.5 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-100 rounded-md font-semibold text-sm hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors";
    
    if (phone) {
        actionsHtml += `<a href="tel:${phone}" class="${buttonClass}">${Icons.PhoneIcon} Позвонить</a>`;
    }
    if (email) {
        actionsHtml += `<a href="mailto:${email}" class="${buttonClass}">${Icons.EmailIcon} Написать</a>`;
        actionsHtml += `<button data-action="create_meet_with" data-payload='${payload}' class="${buttonClass}">${Icons.VideoIcon} Видеовстреча</button>`;
    }

     return `
        <div class="flex items-center mb-3">
            <div class="w-6 h-6 mr-2 text-${color}-500 dark:text-${color}-400">${Icons.UsersIcon}</div>
            <h4 class="font-bold text-slate-800 dark:text-slate-100">${name}</h4>
        </div>
        <div class="space-y-2 mb-4">
             ${email ? `<p class="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-2">${Icons.EmailIcon} ${email}</p>` : ''}
             ${phone ? `<p class="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">${Icons.PhoneIcon} ${phone}</p>` : ''}
        </div>
        <div class="flex flex-wrap gap-2">
            ${actionsHtml}
        </div>
    `;
}

function createDirectActionCard(card, color) {
    const { person, action } = card;
    const name = person.display_name || 'Имя не указано';
    const email = person.email || null;
    const phone = person.phone || null;
    
    let actionButtonHtml = '';
    let errorMessage = '';

    if (action === 'call') {
        if (phone) {
            actionButtonHtml = `<a href="tel:${phone}" class="inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md font-semibold transition-colors">${Icons.PhoneIcon} Позвонить</a>`;
        } else {
            errorMessage = `<p class="text-sm text-red-500 dark:text-red-400 mt-2">У этого контакта не указан номер телефона.</p>`;
        }
    } else if (action === 'email') {
        if (email) {
            actionButtonHtml = `<a href="mailto:${email}" class="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md font-semibold transition-colors">${Icons.EmailIcon} Написать</a>`;
        } else {
            errorMessage = `<p class="text-sm text-red-500 dark:text-red-400 mt-2">У этого контакта не указан email.</p>`;
        }
    }

    return `
        <div class="flex items-start mb-3">
            <div class="w-6 h-6 mr-2 text-${color}-500 dark:text-${color}-400 flex-shrink-0">${Icons[card.icon]}</div>
            <div>
                 <h4 class="font-bold text-slate-800 dark:text-slate-100">Позвонить ${name}</h4>
                 <div class="text-sm text-slate-500 dark:text-slate-400 space-x-2">
                    ${phone ? `<span>${phone}</span>` : ''}
                    ${phone && email ? `<span>&middot;</span>` : ''}
                    ${email ? `<span>${email}</span>` : ''}
                </div>
            </div>
        </div>
        <div class="mt-4 flex justify-center">
            ${actionButtonHtml}
            ${errorMessage}
        </div>
    `;
}


function createContactChoiceCard(card, color) {
    const iconSVG = Icons[card.icon] || '';
    const optionsHtml = card.options.map(person => {
        const name = person?.display_name || 'Имя не указано';
        const email = person?.email || null;
        const phone = person?.phone || null;
        
        const payload = JSON.stringify(person || {});

        return `
            <button class="choice-item w-full p-3 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-left" data-action="analyze_contact" data-payload='${payload}'>
                <p class="font-semibold text-slate-800 dark:text-white">${name}</p>
                ${email ? `<p class="text-xs text-blue-600 dark:text-blue-400"><a href="mailto:${email}" class="hover:underline" onclick="event.stopPropagation()">${email}</a></p>` : ''}
                ${phone ? `<p class="text-xs text-slate-500 dark:text-slate-400"><a href="tel:${phone}" class="hover:underline" onclick="event.stopPropagation()">${phone}</a></p>` : ''}
            </button>
        `;
    }).join('');

    return `
        <div class="flex items-center mb-2">
            <div class="w-6 h-6 mr-2 text-${color}-500 dark:text-${color}-400">${iconSVG}</div>
            <h4 class="font-bold text-slate-800 dark:text-slate-100">${card.title}</h4>
        </div>
        <div class="space-y-2 mt-2">
            ${optionsHtml}
        </div>
    `;
}

function createDocumentChoiceCard(card, color) {
    const iconSVG = Icons[card.icon] || '';
    const optionsHtml = card.options.map(doc => {
        const payload = JSON.stringify({ name: doc.name, url: doc.url, id: doc.source_id });
        const modifiedDate = doc.modified_time ? new Date(doc.modified_time).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        
        return `
            <button class="choice-item w-full p-2.5 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-left" data-action="analyze_document" data-payload='${payload}'>
                <div class="flex items-center justify-between w-full">
                    <div class="flex items-center min-w-0">
                        <img src="${doc.icon_link}" class="w-4 h-4 mr-2 flex-shrink-0" alt="doc-icon"/>
                        <p class="font-semibold text-slate-800 dark:text-white truncate">${doc.name}</p>
                    </div>
                    ${modifiedDate ? `<span class="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 ml-2">${modifiedDate}</span>` : ''}
                </div>
            </button>
        `;
    }).join('');
    
     return `
        <div class="flex items-center mb-2">
            <div class="w-6 h-6 mr-2 text-${color}-500 dark:text-${color}-400">${iconSVG}</div>
            <h4 class="font-bold text-slate-800 dark:text-slate-100">${card.title}</h4>
        </div>
        <div class="space-y-2 mt-2">
            ${optionsHtml}
        </div>
    `;
}

export function createResultCardElement(card) {
    const cardElement = document.createElement('div');
    const color = getCardColor(card.icon);
    
    cardElement.className = `p-4 bg-white dark:bg-slate-800 rounded-xl shadow-md border-l-4 border-${color}-500`;

    if (card.htmlContent) {
        const iconSVG = Icons[card.icon] || '';
        cardElement.innerHTML = `
            <div class="flex items-center mb-2">
                <div class="w-6 h-6 mr-2 text-${color}-500 dark:text-${color}-400">${iconSVG}</div>
                <h4 class="font-bold text-slate-800 dark:text-slate-100">${card.title}</h4>
            </div>
            ${card.htmlContent}
        `;
        return cardElement;
    }

    switch (card.type) {
        case 'contact_choice':
            cardElement.innerHTML = createContactChoiceCard(card, color);
            break;
        case 'contact':
            cardElement.innerHTML = createContactCard(card, color);
            break;
        case 'direct_action_card':
            cardElement.innerHTML = createDirectActionCard(card, color);
            break;
        case 'document_choice':
            cardElement.innerHTML = createDocumentChoiceCard(card, color);
            break;
        case 'document_creation_proposal':
            cardElement.innerHTML = createDocumentProposalCard(card, color);
            break;
        case 'event':
        case 'document':
        case 'document_prompt':
        case 'task':
        case 'note_confirmation':
        case 'system_action':
        default:
            cardElement.innerHTML = createStandardCard(card, color);
            break;
    }

    return cardElement;
}