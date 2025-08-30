import { GOOGLE_SCOPES } from "../../constants.js";

// Helper to decode base64url string
function base64UrlDecode(str) {
    let output = str.replace(/-/g, '+').replace(/_/g, '/');
    switch (output.length % 4) {
        case 0: break;
        case 2: output += '=='; break;
        case 3: output += '='; break;
        default: throw 'Illegal base64url string!';
    }
    try {
        return decodeURIComponent(atob(output).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    } catch (e) {
        console.error("Base64 decoding failed:", e);
        return atob(output); // Fallback to raw decoding
    }
}

// Helper to parse a single email address header (like From)
function parseSingleEmailAddress(header) {
    if (!header) return null;
    const match = header.match(/(.*)<(.*)>/);
    if (match) {
        return { name: match[1].trim(), email: match[2].trim() };
    }
    return { name: header, email: header };
}

export class GoogleServiceProvider {
    constructor() {
        this.token = null;
        this.timezone = 'UTC';
        this.gapiReady = false;
    }

    getId() {
        return "google";
    }

    getName() {
        return "Google";
    }

    setAuthToken(token) {
        this.token = token;
        if (window.gapi && this.token) {
            window.gapi.auth.setToken({ access_token: this.token });
        }
    }
    
    setTimezone(timezone) {
        this.timezone = timezone;
    }

    async #loadClientWithRetries(name, version, retries = 3, delay = 1000) {
        for (let i = 0; i < retries; i++) {
            try {
                await gapi.client.load(name, version);
                console.log(`Successfully loaded Google API client for ${name} v${version}.`);
                return; // Success
            } catch (error) {
                console.warn(`Failed to load Google API client for ${name} v${version} (attempt ${i + 1}/${retries}). Retrying in ${delay * Math.pow(2, i)}ms...`, error);
                if (i === retries - 1) {
                    throw new Error(`Failed to load ${name} API after ${retries} attempts: ${error.message}`);
                }
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i))); // Exponential backoff
            }
        }
    }

    async loadGapiClient() {
        if (this.gapiReady) return;
        
        await new Promise((resolve, reject) => {
            if (window.gapi && window.gapi.client) {
                resolve();
            } else {
                 gapi.load('client', { callback: resolve, onerror: reject, timeout: 5000 });
            }
        });

        if (this.token) {
             gapi.auth.setToken({ access_token: this.token });
        }
        
        // Load all required services with retry logic
        await Promise.all([
            this.#loadClientWithRetries('calendar', 'v3'),
            this.#loadClientWithRetries('tasks', 'v1'),
            this.#loadClientWithRetries('people', 'v1'),
            this.#loadClientWithRetries('drive', 'v3'),
            this.#loadClientWithRetries('docs', 'v1'),
            this.#loadClientWithRetries('sheets', 'v4'),
            this.#loadClientWithRetries('gmail', 'v1'),
        ]);
        
        this.gapiReady = true;
    }

    async getUserProfile() {
        if (!this.gapiReady) await this.loadGapiClient();
        const response = await gapi.client.oauth2.userinfo.get();
        return {
            name: response.result.name,
            email: response.result.email,
            avatar_url: response.result.picture
        };
    }
    
    // --- Calendar ---
    async getCalendarEvents(options = {}) {
        if (!this.gapiReady) await this.loadGapiClient();
        const response = await gapi.client.calendar.events.list({
            'calendarId': 'primary',
            'timeMin': options.time_min || (new Date()).toISOString(),
            'timeMax': options.time_max,
            'showDeleted': options.showDeleted || false,
            'singleEvents': true,
            'maxResults': options.max_results || 250,
            'orderBy': 'startTime'
        });
        return response.result.items;
    }

    async createEvent(details) {
        if (!this.gapiReady) await this.loadGapiClient();
        const event = {
            'summary': details.title,
            'description': details.description,
            'start': { 'dateTime': details.startTime, 'timeZone': this.timezone },
            'end': { 'dateTime': details.endTime, 'timeZone': this.timezone },
            'attendees': details.attendees ? details.attendees.map(email => ({ 'email': email })) : [],
            'conferenceData': { 'createRequest': { 'requestId': `secretary-plus-${Date.now()}` } },
        };
        const response = await gapi.client.calendar.events.insert({
            'calendarId': 'primary',
            'conferenceDataVersion': 1,
            'resource': event
        });
        return response.result;
    }

    // --- Tasks ---
    async getTasks(options = {}) {
        if (!this.gapiReady) await this.loadGapiClient();
        const response = await gapi.client.tasks.tasks.list({
            tasklist: '@default',
            showCompleted: options.showCompleted || false,
            showHidden: options.showHidden || false,
            maxResults: options.max_results || 100
        });
        return response.result.items || [];
    }

    async createTask(details) {
         if (!this.gapiReady) await this.loadGapiClient();
         const task = {
             'title': details.title,
             'notes': details.notes,
             'due': details.dueDate
         };
         const response = await gapi.client.tasks.tasks.insert({
             tasklist: '@default',
             resource: task
         });
         return response.result;
    }
    
    // --- Contacts ---
    async getAllContacts() {
        if (!this.gapiReady) await this.loadGapiClient();
        const response = await gapi.client.people.people.connections.list({
            resourceName: 'people/me',
            pageSize: 2000,
            personFields: 'names,emailAddresses,phoneNumbers,photos,organizations,birthdays,addresses',
        });
        return response.result.connections || [];
    }
    
     // --- Files ---
    async getAllFiles() {
        if (!this.gapiReady) await this.loadGapiClient();
        const response = await gapi.client.drive.files.list({
            pageSize: 1000,
            fields: "nextPageToken, files(id, name, mimeType, webViewLink, iconLink, createdTime, modifiedTime, viewedByMeTime, size, owners, lastModifyingUser)"
        });
        return response.result.files || [];
    }
    
    // --- Emails ---
    async getRecentEmails({ max_results = 20 }) {
        if (!this.gapiReady) await this.loadGapiClient();
        const listResponse = await gapi.client.gmail.users.messages.list({
            'userId': 'me',
            'maxResults': max_results,
            'q': 'in:inbox'
        });

        const messages = listResponse.result.messages || [];
        if (messages.length === 0) return [];
        
        const batch = gapi.client.newBatch();
        messages.forEach(message => {
            batch.add(gapi.client.gmail.users.messages.get({ 'userId': 'me', 'id': message.id, format: 'full' }));
        });
        
        const batchResponse = await batch;
        return Object.values(batchResponse.result).map(res => {
            const payload = res.result.payload;
            const getHeader = (name) => payload.headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
            
            let body = '';
            if (payload.body.size > 0) {
                 body = base64UrlDecode(payload.body.data);
            } else {
                const part = payload.parts?.find(p => p.mimeType === 'text/plain') || payload.parts?.[0];
                if (part?.body.size > 0) body = base64UrlDecode(part.body.data);
            }
            
            return {
                id: res.result.id,
                threadId: res.result.threadId,
                subject: getHeader('Subject'),
                from: getHeader('From'),
                to: getHeader('To'),
                date: getHeader('Date'),
                snippet: res.result.snippet,
                body: body,
            };
        });
    }

    async sendEmail({ to, subject, body }) {
        if (!this.gapiReady) await this.loadGapiClient();
        const rawEmail = [
            `To: ${to.join(',')}`,
            `Subject: ${subject}`,
            'Content-Type: text/html; charset=UTF-8',
            '',
            body
        ].join('\n');
        
        const encodedEmail = btoa(unescape(encodeURIComponent(rawEmail))).replace(/\+/g, '-').replace(/\//g, '_');

        await gapi.client.gmail.users.messages.send({
            'userId': 'me',
            'resource': {
                'raw': encodedEmail
            }
        });
    }
    
    // --- Docs ---
    async createGoogleDocWithContent(title, content) {
        if (!this.gapiReady) await this.loadGapiClient();
        const doc = await gapi.client.docs.documents.create({ title });
        await gapi.client.docs.documents.batchUpdate({
            documentId: doc.result.documentId,
            resource: {
                requests: [{
                    insertText: {
                        location: { index: 1 },
                        text: content
                    }
                }]
            }
        });
        
        // We need to fetch the doc again to get the webViewLink
        const file = await gapi.client.drive.files.get({
            fileId: doc.result.documentId,
            fields: 'name, webViewLink'
        });
        return file.result;
    }
}
