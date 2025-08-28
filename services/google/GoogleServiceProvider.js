import { GOOGLE_SCOPES } from "../../constants.js";

export class GoogleServiceProvider {
    constructor() {
        this.gapi = window.gapi;
        this.google = window.google;
        this.tokenClient = null;
        this._clientId = null;
        this.initPromise = null;
        this.storageKey = 'google-oauth-token';
    }

    // Используем сеттер для сброса состояния при изменении ID
    set clientId(id) {
        if (this._clientId !== id) {
            this._clientId = id;
            // Сбрасываем promise, чтобы при следующем вызове произошла новая инициализация
            this.initPromise = null;
            this.tokenClient = null;
        }
    }

    get clientId() {
        return this._clientId;
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
                    // Try to load token from storage
                    const tokenString = localStorage.getItem(this.storageKey);
                    if (tokenString) {
                        const token = JSON.parse(tokenString);
                        // Check for expiration
                        if (token.expires_at && token.expires_at > Date.now()) {
                            this.gapi.client.setToken(token);
                        } else {
                            localStorage.removeItem(this.storageKey);
                        }
                    }

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
                    
                    const tokenWithExpiry = {
                        ...resp,
                        expires_at: Date.now() + (parseInt(resp.expires_in, 10) * 1000)
                    };

                    this.gapi.client.setToken(tokenWithExpiry);
                    localStorage.setItem(this.storageKey, JSON.stringify(tokenWithExpiry));
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

        // Clear local state immediately for a responsive UI
        localStorage.removeItem(this.storageKey);
        this.gapi.client.setToken(null);

        if (token && token.access_token) {
            // Fire-and-forget the token revocation on Google's side
            this.google.accounts.oauth2.revoke(token.access_token, () => {});
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

    async createGoogleDocWithContent(title, content) {
        await this.initialize();
        // 1. Create the document with the Drive API to get an ID
        await this.gapi.client.load('drive', 'v3');
        const fileMetadata = {
            name: title,
            mimeType: 'application/vnd.google-apps.document',
        };
        const driveResponse = await this.gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: 'id, name, webViewLink, iconLink, mimeType',
        });
        const documentId = driveResponse.result.id;
    
        if (!documentId || !content) {
            return driveResponse.result;
        }
    
        // 2. Insert the content using the Docs API
        await this.gapi.client.load('docs', 'v1');
        await this.gapi.client.docs.documents.batchUpdate({
            documentId: documentId,
            resource: {
                requests: [{
                    insertText: {
                        location: { index: 1 }, // Beginning of the document
                        text: content,
                    },
                }],
            },
        });
    
        return driveResponse.result;
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
    
    async createTask(details) {
        await this.initialize();
        await this.gapi.client.load('tasks', 'v1');
        const task = {
            title: details.title,
            notes: details.notes,
            due: details.dueDate,
        };
        const response = await this.gapi.client.tasks.tasks.insert({
            tasklist: '@default',
            resource: task,
        });
        return response.result;
    }

    async sendEmail(details) {
        await this.initialize();
        await this.gapi.client.load('gmail', 'v1');
        
        const emailLines = [
            `To: ${details.to.join(', ')}`,
            `Subject: ${details.subject}`,
            'Content-Type: text/html; charset=utf-8',
            '',
            details.body,
        ];
        const email = emailLines.join('\r\n');
        
        // Base64-encode the email for the Gmail API
        const base64EncodedEmail = btoa(unescape(encodeURIComponent(email))).replace(/\+/g, '-').replace(/\//g, '_');

        const request = this.gapi.client.gmail.users.messages.send({
            'userId': 'me',
            'resource': {
                'raw': base64EncodedEmail
            }
        });
        
        const response = await request;
        return response.result;
    }
}