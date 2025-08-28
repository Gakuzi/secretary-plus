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
            if (action.url) {
                return `<a href="${action.url}" target="_blank" rel="noopener noreferrer" class="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded-md text-sm transition-colors">${action.label}</a>`;
            }
            if (action.action) {
                 const payload = JSON.stringify(action.payload || {});
                 return `<button data-action="${action.action}" data-payload='${payload}' class="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded-md text-sm transition-colors">${action.label}</button>`;
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

function createContactCard(card) {
    const person = card.person;
    const name = person.names?.[0]?.displayName || 'Имя не указано';
    const email = person.emailAddresses?.[0]?.value || null;
    const phone = person.phoneNumbers?.[0]?.value || null;
    
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

function createContactChoiceCard(card) {
    const iconSVG = Icons[card.icon] || '';
    const optionsHtml = card.options.map(person => {
        const name = person.names?.[0]?.displayName || 'Имя не указано';
        const email = person.emailAddresses?.[0]?.value || null;
        const phone = person.phoneNumbers?.[0]?.value || null;
        
        const payload = JSON.stringify({ name, email });

        return `
            <button class="choice-item" data-action="select_contact" data-payload='${payload}'>
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
        const payload = JSON.stringify({ name: doc.name, url: doc.webViewLink, id: doc.id });
        return `
            <button class="choice-item" data-action="select_document" data-payload='${payload}'>
                 <div class="flex items-center">
                    <img src="${doc.iconLink}" class="w-4 h-4 mr-2" alt="doc-icon"/>
                    <p class="font-semibold text-white truncate">${doc.name}</p>
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

    switch (card.type) {
        case 'contact_choice':
            cardElement.innerHTML = createContactChoiceCard(card);
            break;
        case 'contact':
            cardElement.innerHTML = createContactCard(card);
            break;
        case 'document_choice':
            cardElement.innerHTML = createDocumentChoiceCard(card);
            break;
        case 'event':
        case 'document':
        case 'document_prompt':
        case 'task':
        default:
            cardElement.innerHTML = createStandardCard(card);
            break;
    }

    return cardElement;
}