import * as Icons from './icons/Icons.js';

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
        // Differentiate between links and interactive actions
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

    return `
        <div class="flex items-center mb-2">
            <div class="w-6 h-6 mr-2 text-gray-300">${iconSVG}</div>
            <h4 class="font-bold">${card.title}</h4>
        </div>
        ${card.text ? `<p class="text-sm text-gray-300 mb-3">${card.text}</p>` : ''}
        <div class="space-y-1 mb-3">
            ${detailsHtml}
        </div>
        <div class="flex items-center space-x-2">
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
        case 'document_choice':
            cardElement.innerHTML = createDocumentChoiceCard(card);
            break;
        case 'event':
        case 'document':
        case 'document_prompt':
        default:
            cardElement.innerHTML = createStandardCard(card);
            break;
    }

    return cardElement;
}