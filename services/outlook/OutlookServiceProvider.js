export class OutlookServiceProvider {
    getId() {
        return "outlook";
    }
    getName() {
        return "Outlook";
    }
    isAuthenticated() {
        return Promise.resolve(false);
    }
    authenticate() {
        return Promise.reject(new Error("Outlook Service Provider не реализован."));
    }
    disconnect() {
        console.warn("Outlook Service Provider не реализован.");
        return Promise.resolve();
    }
    getUserProfile() {
        return Promise.reject(new Error("Outlook Service Provider не реализован."));
    }
    createEvent(details) {
        return Promise.reject(new Error("Outlook Service Provider не реализован."));
    }
    findContacts(query) {
        return Promise.reject(new Error("Outlook Service Provider не реализован."));
    }
    findDocuments(query) {
        return Promise.reject(new Error("Outlook Service Provider не реализован."));
    }
    createGoogleDoc(title) {
        return Promise.reject(new Error("Outlook Service Provider не реализован."));
    }
    createGoogleSheet(title) {
        return Promise.reject(new Error("Outlook Service Provider не реализован."));
    }
    createNote(details) {
        return Promise.reject(new Error("Outlook Service Provider не реализован."));
    }
    findNotes(query) {
        return Promise.reject(new Error("Outlook Service Provider не реализован."));
    }
}