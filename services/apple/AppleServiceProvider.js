export class AppleServiceProvider {
    getId() {
        return "apple";
    }
    getName() {
        return "Apple";
    }
    isAuthenticated() {
        return Promise.resolve(false);
    }
    authenticate() {
        return Promise.reject(new Error("Интеграция с Apple (iCloud) пока не доступна."));
    }
    disconnect() {
        console.warn("Интеграция с Apple (iCloud) пока не доступна.");
        return Promise.resolve();
    }
    getUserProfile() {
        return Promise.reject(new Error("Интеграция с Apple (iCloud) пока не доступна."));
    }
    createEvent(details) {
        return Promise.reject(new Error("Интеграция с Apple (iCloud) пока не доступна."));
    }
    findContacts(query) {
        return Promise.reject(new Error("Интеграция с Apple (iCloud) пока не доступна."));
    }
    findDocuments(query) {
        return Promise.reject(new Error("Интеграция с Apple (iCloud) пока не доступна."));
    }
    createGoogleDoc(title) {
        return Promise.reject(new Error("Интеграция с Apple (iCloud) пока не доступна."));
    }
    createGoogleSheet(title) {
        return Promise.reject(new Error("Интеграция с Apple (iCloud) пока не доступна."));
    }
    createNote(details) {
        return Promise.reject(new Error("Интеграция с Apple (iCloud) пока не доступна."));
    }
    findNotes(query) {
        return Promise.reject(new Error("Интеграция с Apple (iCloud) пока не доступна."));
    }
}