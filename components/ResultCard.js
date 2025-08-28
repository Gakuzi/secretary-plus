import * as Icons from './icons/Icons.js';

function createShareActions(card) {
    if (!card.shareableLink) return '';
    
    const encodedLink = encodeURIComponent(card.shareableLink);
    const encodedText = encodeURIComponent(card.shareText);

    const whatsappUrl = `https://wa.me/?text=${encodedText}`;
    const telegramUrl = `https://t.me/share/url?url=${encodedLink}&text=${encodedText}`;

    return `
        <div class="border-t border-gray-600 pt-2 mt-3 flex items-center gap-3">
             <span class="text-sm text-gray-400">Поделиться:</span>
             <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" class="share-button whatsapp" aria-label="Поделиться в WhatsApp">
                ${Icons.WhatsAppIcon}
             </a>
             <a href="${telegramUrl}" target="_blank" rel="noopener noreferrer" class="share-button telegram" aria-label="Поделиться в Telegram">
                ${Icons.TelegramIcon}
             </a>
        </div>
    `;
}

function createStandardCard(card) {
    const iconSVG = Icons[card.icon] || '';
    let detailsHtml = '';
    if (card.details) {
        detailsHtml = Object.entries(card.details).map(([key, value]) => `
            <div class="flex justify-between text-sm">
                <span class="text-gray-400">${key}:</span>
                <span class="font-medium text-right">${value}</span>
            </div>
        `).join('');
    }

    let actionsHtml = '';
    if (card.actions) {
        actionsHtml = card.actions.map(action => {
            let buttonClass = "px-3 py-1 rounded-md text-sm transition-colors ";
            if (action.style === 'danger') {
                buttonClass += 'bg-red-600 hover:bg-red-500';
            } else {
                buttonClass += 'bg-blue-600 hover:bg-blue-500';
            }

            if (action.url) {
                // For links, we'll use a slightly different style to distinguish them
                buttonClass = 'px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded-md text-sm transition-colors';
                return `<a href="${action.url}" target="_blank" rel="noopener noreferrer" class="${buttonClass}">${action.label}</a>`;
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
            <div class="w-6 h-6 mr-2 text-gray-300">${iconSVG}</div>
            <h4 class="font-bold">${card.title}</h4>
        </div>
        ${card.text ? `<p class="text-sm text-gray-300 mb-3">${card.text}</p>` : ''}
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
            <button data-action="analyze_event" data-payload='${JSON.stringify(payload)}' class="w-full flex items-start gap-3 p-2 rounded-md hover:bg-gray-900/50 transition-colors text-left">
                <div class="w-20 text-right font-mono text-sm text-gray-300 flex-shrink-0">${timeString}</div>
                <div class="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0"></div>
                <div class="flex-1 min-w-0">
                    <p class="font-semibold text-gray-100 truncate">${event.summary}</p>
                    ${event.description ? `<p class="text-xs text-gray-400 truncate">${event.description}</p>` : ''}
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
        <button data-action="analyze_task" data-payload='${JSON.stringify(payload)}' class="w-full flex items-start gap-3 p-2 rounded-md hover:bg-gray-900/50 transition-colors text-left">
            <div class="w-5 h-5 border-2 border-gray-500 rounded mt-0.5 flex-shrink-0"></div>
            <div class="flex-1 min-w-0">
                <p class="font-medium text-gray-100">${task.title}</p>
                 ${task.notes ? `<p class="text-xs text-gray-400 truncate">${task.notes.replace(/\n/g, ' ')}</p>` : ''}
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
            <button data-action="analyze_email" data-payload='${JSON.stringify(payload)}' class="w-full border-b border-gray-700/50 last:border-b-0 py-2 text-left hover:bg-gray-900/50 px-2 rounded-md transition-colors">
                <p class="font-semibold text-sm text-gray-200 truncate">${from}</p>
                <p class="font-medium text-gray-100">${email.subject || '(Без темы)'}</p>
                <p class="text-xs text-gray-400 truncate">${email.snippet}</p>
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


function createDocumentProposalCard(card) {
    const iconSVG = Icons[card.icon] || '';
    const summaryHtml = card.summary.replace(/\n/g, '<br>');

    const actionsHtml = card.actions.map(action => {
         const payload = JSON.stringify(action.payload || {});
         const isPrimary = action.label.includes('с содержанием');
         const buttonClass = isPrimary 
            ? 'bg-blue-600 hover:bg-blue-500' 
            : 'bg-gray-600 hover:bg-gray-500';
         return `<button data-action="${action.action}" data-payload='${payload}' class="px-4 py-2 ${buttonClass} rounded-md text-sm font-semibold transition-colors">${action.label}</button>`;
    }).join('');

    return `
        <div class="flex items-center mb-3">
            <div class="w-6 h-6 mr-2 text-gray-300">${iconSVG}</div>
            <h4 class="font-bold">${card.title}</h4>
        </div>
        <p class="text-sm text-gray-300 mb-2">Предлагаемое содержание:</p>
        <div class="text-sm bg-gray-900/50 p-3 rounded-md border border-gray-600 max-h-40 overflow-y-auto mb-4">
            ${summaryHtml}
        </div>
        <div class="flex flex-wrap gap-2 justify-end">
            ${actionsHtml}
        </div>
    `;
}

function createContactCard(card) {
    const person = card.person;
    const name = person.display_name || 'Имя не указано';
    const email = person.email || null;
    const phone = person.phone || null;
    
    const payload = JSON.stringify({ name, email });

    let actionsHtml = '';
    if (phone) {
        actionsHtml += `<a href="tel:${phone}" class="card-action-button">${Icons.PhoneIcon} Позвонить</a>`;
    }
    if (email) {
        actionsHtml += `<a href="mailto:${email}" class="card-action-button">${Icons.EmailIcon} Написать</a>`;
        actionsHtml += `<button data-action="create_meet_with" data-payload='${payload}' class="card-action-button">${Icons.VideoIcon} Видеовстреча</button>`;
    }

     return `
        <div class="flex items-center mb-3">
            <div class="w-6 h-6 mr-2 text-gray-300">${Icons.UsersIcon}</div>
            <h4 class="font-bold">${name}</h4>
        </div>
        <div class="space-y-2 mb-4">
             ${email ? `<p class="text-sm text-blue-400 flex items-center gap-2">${Icons.EmailIcon} ${email}</p>` : ''}
             ${phone ? `<p class="text-sm text-gray-300 flex items-center gap-2">${Icons.PhoneIcon} ${phone}</p>` : ''}
        </div>
        <div class="flex flex-wrap gap-2">
            ${actionsHtml}
        </div>
    `;
}

function createDirectActionCard(card) {
    const { person, action } = card;
    const name = person.display_name || 'Имя не указано';
    const email = person.email || null;
    const phone = person.phone || null;
    const iconSVG = Icons[card.icon] || '';
    
    let actionButtonHtml = '';
    let errorMessage = '';

    if (action === 'call') {
        if (phone) {
            actionButtonHtml = `<a href="tel:${phone}" class="card-primary-action-button">${Icons.PhoneIcon} Позвонить ${name}</a>`;
        } else {
            errorMessage = `<p class="text-sm text-red-400">У этого контакта не указан номер телефона.</p>`;
        }
    } else if (action === 'email') {
        if (email) {
            actionButtonHtml = `<a href="mailto:${email}" class="card-primary-action-button">${Icons.EmailIcon} Написать ${name}</a>`;
        } else {
            errorMessage = `<p class="text-sm text-red-400">У этого контакта не указан email.</p>`;
        }
    }

    return `
        <div class="flex items-center mb-3">
            <div class="w-6 h-6 mr-2 text-gray-300">${iconSVG}</div>
            <h4 class="font-bold">${card.title}</h4>
        </div>
        <div class="mt-4 text-center">
            ${actionButtonHtml}
            ${errorMessage}
        </div>
        <div class="text-center mt-3 text-xs text-gray-400">
            ${phone ? `<span>${phone}</span>` : ''}
            ${phone && email ? `<span class="mx-2">&middot;</span>` : ''}
            ${email ? `<span>${email}</span>` : ''}
        </div>
    `;
}


function createContactChoiceCard(card) {
    const iconSVG = Icons[card.icon] || '';
    const optionsHtml = card.options.map(person => {
        const name = person.display_name || 'Имя не указано';
        const email = person.email || null;
        const phone = person.phone || null;
        
        const payload = JSON.stringify(person);

        return `
            <button class="choice-item" data-action="analyze_contact" data-payload='${payload}'>
                <p class="font-semibold text-white">${name}</p>
                ${email ? `<p class="text-xs text-blue-400"><a href="mailto:${email}" class="hover:underline" onclick="event.stopPropagation()">${email}</a></p>` : ''}
                ${phone ? `<p class="text-xs text-gray-400"><a href="tel:${phone}" class="hover:underline" onclick="event.stopPropagation()">${phone}</a></p>` : ''}
            </button>
        `;
    }).join('');

    return `
        <div class="flex items-center mb-2">
            <div class="w-6 h-6 mr-2 text-gray-300">${iconSVG}</div>
            <h4 class="font-bold">${card.title}</h4>
        </div>
        <div class="space-y-2 mt-2">
            ${optionsHtml}
        </div>
    `;
}

function createDocumentChoiceCard(card) {
    const iconSVG = Icons[card.icon] || '';
    const optionsHtml = card.options.map(doc => {
        const payload = JSON.stringify({ name: doc.name, url: doc.url, id: doc.source_id });
        const modifiedDate = doc.modified_time ? new Date(doc.modified_time).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        
        return `
            <button class="choice-item" data-action="analyze_document" data-payload='${payload}'>
                <div class="flex items-center justify-between w-full">
                    <div class="flex items-center min-w-0">
                        <img src="${doc.icon_link}" class="w-4 h-4 mr-2 flex-shrink-0" alt="doc-icon"/>
                        <p class="font-semibold text-white truncate">${doc.name}</p>
                    </div>
                    ${modifiedDate ? `<span class="text-xs text-gray-400 flex-shrink-0 ml-2">${modifiedDate}</span>` : ''}
                </div>
            </button>
        `;
    }).join('');
    
     return `
        <div class="flex items-center mb-2">
            <div class="w-6 h-6 mr-2 text-gray-300">${iconSVG}</div>
            <h4 class="font-bold">${card.title}</h4>
        </div>
        <div class="space-y-2 mt-2">
            ${optionsHtml}
        </div>
    `;
}

export function createResultCardElement(card) {
    const cardElement = document.createElement('div');
    cardElement.className = 'mt-2 border border-gray-600 rounded-lg p-3 bg-gray-700/50';

    if (card.htmlContent) {
        const iconSVG = Icons[card.icon] || '';
        cardElement.innerHTML = `
            <div class="flex items-center mb-2">
                <div class="w-6 h-6 mr-2 text-gray-300">${iconSVG}</div>
                <h4 class="font-bold">${card.title}</h4>
            </div>
            ${card.htmlContent}
        `;
        return cardElement;
    }

    switch (card.type) {
        case 'contact_choice':
            cardElement.innerHTML = createContactChoiceCard(card);
            break;
        case 'contact':
            cardElement.innerHTML = createContactCard(card);
            break;
        case 'direct_action_card':
            cardElement.innerHTML = createDirectActionCard(card);
            break;
        case 'document_choice':
            cardElement.innerHTML = createDocumentChoiceCard(card);
            break;
        case 'document_creation_proposal':
            cardElement.innerHTML = createDocumentProposalCard(card);
            break;
        case 'event':
        case 'document':
        case 'document_prompt':
        case 'task':
        case 'note_confirmation':
        default:
            cardElement.innerHTML = createStandardCard(card);
            break;
    }

    return cardElement;
}