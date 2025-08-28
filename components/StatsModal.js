import { ChartBarIcon } from './icons/Icons.js';

// Predefined colors for chart slices
const CHART_COLORS = [
    '#3b82f6', // blue-500
    '#8b5cf6', // violet-500
    '#10b981', // emerald-500
    '#ef4444', // red-500
    '#f97316', // orange-500
    '#eab308', // yellow-500
    '#6366f1', // indigo-500
    '#ec4899', // pink-500
];

// Human-readable names for function calls
const ACTION_NAMES = {
    'create_calendar_event': 'Создание событий',
    'find_contacts': 'Поиск контактов',
    'perform_contact_action': 'Действия с контактами',
    'find_documents': 'Поиск документов',
    'create_google_doc': 'Создание Google Docs',
    'create_google_sheet': 'Создание Google Sheets',
    'create_google_doc_with_content': 'Создание Docs с текстом',
    'create_task': 'Создание задач',
    'send_email': 'Отправка Email',
    'propose_document_with_content': 'Предложение документа',
};

export function createStatsModal(statsData, onClose) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';

    modalOverlay.innerHTML = `
        <div class="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col m-4" id="stats-content">
            <header class="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
                <h2 class="text-2xl font-bold flex items-center gap-2">${ChartBarIcon} Статистика использования</h2>
                <button id="close-stats" class="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Закрыть статистику">&times;</button>
            </header>
            
            <main class="p-6 flex-1 flex items-center justify-center">
                <!-- Chart or empty state will be rendered here -->
            </main>
        </div>
    `;

    const mainContent = modalOverlay.querySelector('main');
    const dataEntries = Object.entries(statsData);

    if (dataEntries.length === 0) {
        mainContent.innerHTML = `
            <div class="text-center text-gray-400">
                <p class="font-semibold text-lg">Данных пока нет</p>
                <p>Начните использовать ассистента, и здесь появится статистика выполненных действий.</p>
            </div>
        `;
    } else {
        const chartContainer = document.createElement('div');
        chartContainer.className = 'relative w-full h-full max-w-md max-h-md'; // Limit chart size
        const canvas = document.createElement('canvas');
        canvas.id = 'stats-chart';
        chartContainer.appendChild(canvas);
        mainContent.appendChild(chartContainer);

        const labels = dataEntries.map(([key]) => ACTION_NAMES[key] || key);
        const data = dataEntries.map(([, value]) => value);

        // Use a timeout to ensure the canvas is in the DOM and has dimensions before Chart.js tries to render to it.
        setTimeout(() => {
            const ctx = canvas.getContext('2d');
            new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Количество вызовов',
                        data: data,
                        backgroundColor: CHART_COLORS,
                        borderColor: '#1f2937', // bg-gray-800
                        borderWidth: 2,
                        hoverOffset: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                color: '#d1d5db', // text-gray-300
                                font: {
                                    size: 14,
                                    family: "'Inter', sans-serif"
                                }
                            }
                        },
                        tooltip: {
                            titleFont: {
                                size: 16,
                                family: "'Inter', sans-serif"
                            },
                             bodyFont: {
                                size: 14,
                                family: "'Inter', sans-serif"
                            },
                            backgroundColor: '#111827', // bg-gray-900
                            titleColor: '#f9fafb', // text-gray-50
                            bodyColor: '#d1d5db', // text-gray-300
                            borderColor: '#4b5563', // border-gray-600
                            borderWidth: 1,
                        }
                    }
                }
            });
        }, 0);
    }


    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            onClose();
        }
    });

    modalOverlay.querySelector('#close-stats').addEventListener('click', onClose);

    return modalOverlay;
}