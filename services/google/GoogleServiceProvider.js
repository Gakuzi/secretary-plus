import { GOOGLE_SCOPES } from "../../constants.js";

export class GoogleServiceProvider {
    constructor(clientId) {
        this.gapi = window.gapi;
        this.google = window.google;
        this.tokenClient = null;
        this.clientId = clientId;
        this.initPromise = null;
    }
    
    initialize() {
        if (this.initPromise) {
            return this.initPromise;
        }
        
        this.initPromise = new Promise((resolve, reject) => {
            if (!this.clientId) {
                return reject(new Error("Google Client ID не был предоставлен. Пожалуйста, укажите его в настройках."));
            }

            this.gapi.load('client', () => {
                try {
                    this.tokenClient = this.google.accounts.oauth2.initTokenClient({
                        client_id: this.clientId,
                        scope: GOOGLE_SCOPES,
                        callback: () => {}, // Callback is handled by the promise in authenticate
                    });
                    resolve();
                } catch(error) {
                    console.error("Error initializing Google token client", error);
                    reject(error);
                }
            });
        });
        
        return this.initPromise;
    }


    getId() {
        return "google";
    }

    getName() {
        return "Google";
    }

    async isAuthenticated() {
        await this.initialize();
        return !!this.gapi.client.getToken();
    }

    authenticate() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.initialize();
                const callback = (resp) => {
                    if (resp.error) {
                        return reject(resp);
                    }
                    this.gapi.client.setToken(resp);
                    resolve();
                };
                this.tokenClient.callback = callback;

                if (this.gapi.client.getToken() === null) {
                    this.tokenClient.requestAccessToken({ prompt: 'consent' });
                } else {
                    this.tokenClient.requestAccessToken({ prompt: '' });
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    async disconnect() {
        await this.initialize();
        const token = this.gapi.client.getToken();
        if (token) {
            return new Promise((resolve) => {
                this.google.accounts.oauth2.revoke(token.access_token, () => {
                    this.gapi.client.setToken(null);
                    resolve();
                });
            });
        }
        return Promise.resolve();
    }

    async getUserProfile() {
        await this.initialize();
        await this.gapi.client.load('oauth2', 'v2');
        const response = await this.gapi.client.oauth2.userinfo.get();
        const profile = response.result;
        return {
            name: profile.name,
            email: profile.email,
            imageUrl: profile.picture,
        };
    }

    async createEvent(details) {
        await this.initialize();
        await this.gapi.client.load('calendar', 'v3');
        const event = {
            summary: details.title,
            description: details.description,
            start: {
                dateTime: details.startTime,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            end: {
                dateTime: details.endTime,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            attendees: details.attendees?.map(email => ({ email })),
            conferenceData: {
                createRequest: {
                  requestId: `secretary-plus-${Date.now()}`
                }
            },
        };

        const request = this.gapi.client.calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            conferenceDataVersion: 1,
        });

        const response = await request;
        return response.result;
    }

    async findContacts(query) {
        await this.initialize();
        await this.gapi.client.load('people', 'v1');
        
        const response = await this.gapi.client.people.people.searchContacts({
            query: query,
            readMask: 'names,emailAddresses,phoneNumbers'
        });

        return response.result.results || [];
    }

    async findDocuments(query) {
        await this.initialize();
        await this.gapi.client.load('drive', 'v3');

        const response = await this.gapi.client.drive.files.list({
            q: `name contains '${query}' and trashed = false`,
            fields: 'files(id, name, webViewLink, iconLink, mimeType)',
            spaces: 'drive',
        });
        
        return response.result.files || [];
    }

    async createGoogleDoc(title) {
        await this.initialize();
        await this.gapi.client.load('drive', 'v3');
        const fileMetadata = {
            'name': title,
            'mimeType': 'application/vnd.google-apps.document'
        };
        const response = await this.gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: 'id, name, webViewLink, iconLink, mimeType'
        });
        return response.result;
    }

    async createGoogleSheet(title) {
        await this.initialize();
        await this.gapi.client.load('drive', 'v3');
        const fileMetadata = {
            'name': title,
            'mimeType': 'application/vnd.google-apps.spreadsheet'
        };
        const response = await this.gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: 'id, name, webViewLink, iconLink, mimeType'
        });
        return response.result;
    }
}