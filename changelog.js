document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('changelog-container');

    fetch('./app-info.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (!data.changelog || data.changelog.length === 0) {
                container.innerHTML = '<p class="text-center text-gray-400">История изменений пуста.</p>';
                return;
            }

            const fullChangelogHtml = data.changelog.map(log => `
                <section class="p-6 bg-gray-800 rounded-lg border border-gray-700">
                    <div class="flex justify-between items-center mb-3">
                        <h2 class="font-bold text-xl text-white">Версия ${log.version}</h2>
                        <span class="text-sm text-gray-400 font-mono">${log.date}</span>
                    </div>
                    <ul class="list-disc list-inside text-gray-300 text-sm space-y-2">
                        ${log.changes.map(change => `<li>${change}</li>`).join('')}
                    </ul>
                </section>
            `).join('');

            container.innerHTML = fullChangelogHtml;
        })
        .catch(error => {
            console.error("Could not load app info:", error);
            container.innerHTML = `<p class="text-center text-red-400">Не удалось загрузить историю изменений. ${error.message}</p>`;
        });
});
