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
        return Promise.reject(new Error("Apple Service Provider не реализован."));
    }
    disconnect() {
        console.warn("Apple Service Provider не реализован.");
        return Promise.resolve();
    }
    getUserProfile() {
        return Promise.reject(new Error("Apple Service Provider не реализован."));
    }
    createEvent(details) {
        return Promise.reject(new Error("Apple Service Provider не реализован."));
    }
    findContacts(query) {
        return Promise.reject(new Error("Apple Service Provider не реализован."));
    }
    findDocuments(query) {
        return Promise.reject(new Error("Apple Service Provider не реализован."));
    }
    createGoogleDoc(title) {
        return Promise.reject(new Error("Apple Service Provider не реализован."));
    }
    createGoogleSheet(title) {
        return Promise.reject(new Error("Apple Service Provider не реализован."));
    }
}