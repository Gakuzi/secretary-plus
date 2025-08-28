// Helper to format date for ICS standard (YYYYMMDDTHHMMSSZ)
function toICSDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    // VcGx-sL7rC_5y2pZ
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export class AppleServiceProvider {
    getId() {
        return "apple";
    }
    getName() {
        return "Apple Calendar (.ics)";
    }
    isAuthenticated() {
        // This provider doesn't require authentication as it works offline.
        return Promise.resolve(true);
    }
    authenticate() {
        // No explicit authentication needed.
        return Promise.resolve();
    }
    disconnect() {
        // No explicit connection to disconnect from.
        return Promise.resolve();
    }
    getUserProfile() {
        return Promise.reject(new Error("Профиль пользователя недоступен для провайдера Apple."));
    }
    createEvent(details) {
        const { title, description, startTime, endTime } = details;

        if (!title || !startTime || !endTime) {
            return Promise.reject(new Error("Для создания события необходимы название, время начала и окончания."));
        }

        const uid = `secretary-plus-${Date.now()}@ical.secretary.plus`;
        const now = toICSDate(new Date().toISOString());

        const icsString = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//SecretaryPlus//App//EN',
            'BEGIN:VEVENT',
            `UID:${uid}`,
            `DTSTAMP:${now}`,
            `DTSTART:${toICSDate(startTime)}`,
            `DTEND:${toICSDate(endTime)}`,
            `SUMMARY:${title}`,
            `DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`,
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        // Use btoa for base64 encoding, ensuring proper handling of unicode characters
        const icsData = btoa(unescape(encodeURIComponent(icsString)));
        const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ics`;

        return Promise.resolve({ icsData, filename });
    }
    findContacts(query) {
        return Promise.reject(new Error("Интеграция с контактами Apple (iCloud) пока не доступна."));
    }
    findDocuments(query) {
        return Promise.reject(new Error("Интеграция с файлами Apple (iCloud) пока не доступна."));
    }
    createGoogleDoc(title) {
        return Promise.reject(new Error("Данная функция доступна только для провайдера Google."));
    }
    createGoogleSheet(title) {
        return Promise.reject(new Error("Данная функция доступна только для провайдера Google."));
    }
    createNote(details) {
        return Promise.reject(new Error("Интеграция с заметками Apple (iCloud) пока не доступна."));
    }
    findNotes(query) {
        return Promise.reject(new Error("Интеграция с заметками Apple (iCloud) пока не доступна."));
    }
}