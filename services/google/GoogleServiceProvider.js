export class GoogleServiceProvider {
    constructor() {
        this.gapi = window.gapi;
        this.token = null;
        this.isGapiLoaded = false;
        this.loadGapiPromise = this.loadGapiClient();
    }

    // Устанавливаем токен, полученный от Supabase
    setAuthToken(token) {
        this.token = token;
        if (this.isGapiLoaded && token) {
            this.gapi.client.setToken({ access_token: token });
        }
    }

    // Загружаем клиент GAPI один раз
    async loadGapiClient() {
        if (this.loadGapiPromise) return this.loadGapiPromise;
        
        this.loadGapiPromise = new Promise((resolve) => {
            this.gapi.load('client', () => {
                this.isGapiLoaded = true;
                if (this.token) {
                    this.gapi.client.setToken({ access_token: this.token });
                }
                resolve();
            });
        });
        return this.loadGapiPromise;
    }

    async ensureGapiIsReady() {
        await this.loadGapiClient();
        if (!this.token) {
            throw new Error("Google account is not connected.");
        }
    }

    getId() {
        return "google";
    }

    getName() {
        return "Google";
    }

    // Эти методы больше не управляют состоянием, оно управляется Supabase
    isAuthenticated() {
        return Promise.resolve(!!this.token);
    }

    authenticate() {
        return Promise.reject(new Error("Authentication should be handled via Supabase."));
    }

    disconnect() {
         this.setAuthToken(null);
         return Promise.resolve();
    }

    async getUserProfile() {
        await this.ensureGapiIsReady();
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
        await this.ensureGapiIsReady();
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
    
    // Метод для получения всех контактов для синхронизации
    async getAllContacts() {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('people', 'v1');
        
        const response = await this.gapi.client.people.people.connections.list({
            resourceName: 'people/me',
            personFields: 'names,emailAddresses,phoneNumbers,photos',
            pageSize: 1000, // Получаем больше контактов за раз
        });

        return response.result.connections || [];
    }

    // Метод для получения всех файлов для синхронизации
    async getAllFiles() {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('drive', 'v3');

        let files = [];
        let pageToken = null;
        
        do {
            const response = await this.gapi.client.drive.files.list({
                q: `trashed = false`,
                fields: 'nextPageToken, files(id, name, webViewLink, iconLink, mimeType)',
                spaces: 'drive',
                pageSize: 1000,
                pageToken: pageToken,
            });
            
            files = files.concat(response.result.files);
            pageToken = response.result.nextPageToken;
        } while (pageToken);
        
        return files;
    }


    async findContacts(query) {
       throw new Error("findContacts is deprecated. Use SupabaseService to search for synchronized contacts.");
    }

    async findDocuments(query) {
        throw new Error("findDocuments is deprecated. Use SupabaseService to search for synchronized files.");
    }

    async createGoogleDoc(title) {
        await this.ensureGapiIsReady();
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
        await this.ensureGapiIsReady();
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
    
        await this.gapi.client.load('docs', 'v1');
        await this.gapi.client.docs.documents.batchUpdate({
            documentId: documentId,
            resource: {
                requests: [{
                    insertText: {
                        location: { index: 1 },
                        text: content,
                    },
                }],
            },
        });
    
        return driveResponse.result;
    }

    async createGoogleSheet(title) {
        await this.ensureGapiIsReady();
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
        await this.ensureGapiIsReady();
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
        await this.ensureGapiIsReady();
        await this.gapi.client.load('gmail', 'v1');
        
        const emailLines = [
            `To: ${details.to.join(', ')}`,
            `Subject: ${details.subject}`,
            'Content-Type: text/html; charset=utf-8',
            '',
            details.body,
        ];
        const email = emailLines.join('\r\n');
        
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