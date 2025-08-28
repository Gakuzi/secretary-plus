import * as Icons from './icons/Icons.js';

export function createResultCardElement(card) {
    const cardElement = document.createElement('div');
    cardElement.className = 'mt-2 border border-gray-600 rounded-lg p-3 bg-gray-700/50';

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
        actionsHtml = card.actions.map(action => `
            <a href="${action.url}" target="_blank" rel="noopener noreferrer" class="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded-md text-sm transition-colors">${action.label}</a>
        `).join('');
    }
    
    cardElement.innerHTML = `
        <div class="flex items-center mb-2">
            <div class="w-6 h-6 mr-2 text-gray-300">${iconSVG}</div>
            <h4 class="font-bold">${card.title}</h4>
        </div>
        <div class="space-y-1 mb-3">
            ${detailsHtml}
        </div>
        <div class="flex items-center space-x-2">
            ${actionsHtml}
        </div>
    `;

    return cardElement;
}
