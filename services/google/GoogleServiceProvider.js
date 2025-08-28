import { GOOGLE_SCOPES } from "../../constants.js";

export class GoogleServiceProvider {
    constructor() {
        this.gapi = window.gapi;
        this.token = null;
        this.isGapiLoaded = false;
        this.loadGapiPromise = null;
        this.gsiClient = null;
        this.clientId = null;
        this.userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    // --- Initialization ---

    async initClient(clientId, onTokenResponse) {
        if (!clientId) {
            this.gsiClient = null;
            return;
        }
        this.clientId = clientId;
        this.gsiClient = google.accounts.oauth2.initTokenClient({
            client_id: this.clientId,
            scope: GOOGLE_SCOPES,
            callback: onTokenResponse, // Callback handles the token
        });
    }

    async loadGapiClient() {
        if (this.loadGapiPromise) return this.loadGapiPromise;

        this.loadGapiPromise = new Promise((resolve) => {
            this.gapi.load('client', async () => {
                await this.gapi.client.init({});
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

    setAuthToken(token) {
        this.token = token;
        if (this.isGapiLoaded && token) {
            this.gapi.client.setToken({ access_token: token });
        }
    }

    setTimezone(timezone) {
        this.userTimezone = timezone;
    }

    // --- Authentication ---

    getId() {
        return "google";
    }

    getName() {
        return "Google";
    }

    isAuthenticated() {
        return Promise.resolve(!!this.token);
    }

    authenticate() {
        // Direct authentication flow
        if (this.gsiClient) {
            this.gsiClient.requestAccessToken();
            return Promise.resolve(); // The actual result is handled by the callback
        }
        return Promise.reject(new Error("Authentication should be handled via Supabase or Google Client must be initialized."));
    }

    disconnect() {
        if (this.token) {
            google.accounts.oauth2.revoke(this.token, () => {});
        }
        this.setAuthToken(null);
        return Promise.resolve();
    }

    // --- API Methods ---

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

    async getCalendarEvents({ time_min, time_max, max_results = 10 }) {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('calendar', 'v3');
        const response = await this.gapi.client.calendar.events.list({
            'calendarId': 'primary',
            'timeMin': time_min || (new Date()).toISOString(),
            'timeMax': time_max,
            'showDeleted': false,
            'singleEvents': true,
            'maxResults': max_results,
            'orderBy': 'startTime'
        });
        return response.result.items;
    }

    async createEvent(details) {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('calendar', 'v3');
        const event = {
            summary: details.title,
            description: details.description,
            start: {
                dateTime: details.startTime,
                timeZone: this.userTimezone,
            },
            end: {
                dateTime: details.endTime,
                timeZone: this.userTimezone,
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

    async getAllContacts() {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('people', 'v1');

        const response = await this.gapi.client.people.people.connections.list({
            resourceName: 'people/me',
            personFields: 'names,emailAddresses,phoneNumbers,photos',
            pageSize: 1000,
        });

        return response.result.connections || [];
    }
    
    // New method for direct contact search
    async findContacts(query) {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('people', 'v1');

        const response = await this.gapi.client.people.people.searchContacts({
            query: query,
            readMask: 'names,emailAddresses,phoneNumbers,photos',
            pageSize: 10,
        });
        
        const results = response.result.results || [];
        // Map the Google API response to the same structure Supabase uses
        // to ensure components like ResultCard work in both modes.
        return results.map(result => {
            const c = result.person;
            return {
                display_name: c.names?.[0]?.displayName || null,
                email: c.emailAddresses?.[0]?.value || null,
                phone: c.phoneNumbers?.[0]?.value || null,
                avatar_url: c.photos?.[0]?.url || null,
            };
        }).filter(c => c.display_name);
    }

    async getAllFiles() {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('drive', 'v3');

        let files = [];
        let pageToken = null;

        do {
            const response = await this.gapi.client.drive.files.list({
                q: `trashed = false and 'me' in owners`,
                fields: 'nextPageToken, files(id, name, webViewLink, iconLink, mimeType, createdTime, modifiedTime, viewedByMeTime, size, owners(displayName))',
                spaces: 'drive',
                pageSize: 1000,
                pageToken: pageToken,
            });

            files = files.concat(response.result.files);
            pageToken = response.result.nextPageToken;
        } while (pageToken);

        return files;
    }
    
    // This is now used for direct Google Drive search when Supabase is disabled.
    async findDocuments(query) {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('drive', 'v3');

        const response = await this.gapi.client.drive.files.list({
            q: `name contains '${query}' and trashed = false`,
            fields: 'files(id, name, webViewLink, iconLink, mimeType, modifiedTime)',
            spaces: 'drive',
            pageSize: 10,
        });

        return response.result.files || [];
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

    async getTasks({ max_results = 20 }) {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('tasks', 'v1');
        const response = await this.gapi.client.tasks.tasks.list({
            tasklist: '@default',
            maxResults: max_results,
            showCompleted: false,
        });
        return response.result.items || [];
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

    async getRecentEmails({ max_results = 5 }) {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('gmail', 'v1');

        const listResponse = await this.gapi.client.gmail.users.messages.list({
            'userId': 'me',
            'maxResults': max_results
        });

        const messages = listResponse.result.messages || [];
        if (messages.length === 0) {
            return [];
        }

        const batch = this.gapi.client.newBatch();
        messages.forEach(message => {
            batch.add(this.gapi.client.gmail.users.messages.get({
                'userId': 'me',
                'id': message.id,
                'format': 'metadata',
                'metadataHeaders': ['Subject', 'From', 'Date']
            }));
        });
        
        const batchResponse = await batch;
        
        return Object.values(batchResponse.result).map(res => {
            const payload = res.result;
            const headers = payload.payload.headers;
            const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

            return {
                id: payload.id,
                snippet: payload.snippet,
                subject: getHeader('Subject'),
                from: getHeader('From'),
                date: getHeader('Date'),
            };
        });
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

    // --- Notes using Google Docs ---
    async createNote(details) {
        return this.createGoogleDocWithContent(details.title, details.content);
    }

    async findNotes(query) {
        // Find documents which can be considered notes
        return this.findDocuments(query);
    }
}