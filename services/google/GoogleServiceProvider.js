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
        const name = match[1].trim().replace(/^['"]|['"]$/g, '');
        return { name: name || match[2].trim(), email: match[2].trim() };
    }
    return { name: header.trim(), email: header.trim() };
}

// Helper to parse headers with multiple email addresses (like To, Cc)
function parseMultipleEmailAddresses(header) {
    if (!header) return [];
    // Split by comma, but not inside quotes
    return header.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/g).map(e => parseSingleEmailAddress(e.trim())).filter(Boolean);
}


// Finds the most appropriate text part from a Gmail message payload
function getEmailBody(payload) {
    let body = '';
    
    // Prioritize text/plain over text/html
    const findPart = (parts, mimeType) => {
        let result = null;
        if (!parts) return null;
        for (const part of parts) {
            if (part.mimeType === mimeType && part.body && part.body.data) {
                return part.body.data;
            }
            if (part.parts) {
                result = findPart(part.parts, mimeType);
                if (result) return result;
            }
        }
        return null;
    };
    
    const plainTextPart = findPart([payload], 'text/plain');
    if (plainTextPart) {
        body = base64UrlDecode(plainTextPart);
    } else {
        const htmlPart = findPart([payload], 'text/html');
        if (htmlPart) {
            body = base64UrlDecode(htmlPart);
            // Simple strip of HTML tags
            body = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        }
    }
    
    // Fallback for non-multipart messages
    if (!body && payload.body && payload.body.data) {
        body = base64UrlDecode(payload.body.data);
    }

    return body;
}


export class GoogleServiceProvider {
    constructor() {
        this.gapi = null; // Initialize as null to avoid race conditions. Will be set in loadGapiClient.
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

        // FIX: Ensure gapi is initialized, even if the constructor ran before the script loaded.
        if (!this.gapi && window.gapi) {
            this.gapi = window.gapi;
        }

        // Add a robust check to prevent the 'undefined is not an object' error.
        if (!this.gapi || typeof this.gapi.load !== 'function') {
            console.error("Google API client (gapi) is not available.");
            return Promise.reject(new Error("Не удалось загрузить клиент Google API. Проверьте подключение к интернету или настройки блокировщика рекламы."));
        }


        this.loadGapiPromise = new Promise((resolve, reject) => {
            try {
                this.gapi.load('client', async () => {
                    try {
                        await this.gapi.client.init({});
                        this.isGapiLoaded = true;
                        if (this.token) {
                            this.gapi.client.setToken({ access_token: this.token });
                        }
                        resolve();
                    } catch (initError) {
                         console.error("Error initializing GAPI client:", initError);
                         reject(new Error("Ошибка инициализации клиента Google API."));
                    }
                });
            } catch (loadError) {
                console.error("Error calling gapi.load:", loadError);
                reject(new Error("Ошибка загрузки модуля клиента Google API."));
            }
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
        if (!this.gsiClient) {
            return Promise.reject(new Error("Google Client ID не настроен. Проверьте настройки."));
        }
        this.gsiClient.requestAccessToken();
        return Promise.resolve();
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
        
        // Add validation to ensure we have a valid profile with all required fields.
        if (!profile || !profile.email || !profile.name || !profile.picture) {
            console.error('Incomplete user profile response from Google:', response);
            throw new Error("Не удалось получить полные данные профиля Google. Токен может быть недействительным или иметь недостаточные права.");
        }

        return {
            name: profile.name,
            email: profile.email,
            imageUrl: profile.picture,
        };
    }

    async getCalendarEvents({ time_min, time_max, max_results = 1000, showDeleted = false }) {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('calendar', 'v3');
        const response = await this.gapi.client.calendar.events.list({
            'calendarId': 'primary',
            'timeMin': time_min, // If undefined, fetches all future events
            'timeMax': time_max,
            'showDeleted': showDeleted,
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

    async deleteCalendarEvent({ eventId, calendarId = 'primary' }) {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('calendar', 'v3');
        await this.gapi.client.calendar.events.delete({
            calendarId: calendarId,
            eventId: eventId,
        });
        return { success: true, eventId };
    }


    async getAllContacts() {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('people', 'v1');

        const response = await this.gapi.client.people.people.connections.list({
            resourceName: 'people/me',
            personFields: 'names,emailAddresses,phoneNumbers,photos,addresses,organizations,birthdays',
            pageSize: 2000,
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
                fields: 'nextPageToken, files(id, name, webViewLink, iconLink, mimeType, createdTime, modifiedTime, viewedByMeTime, size, owners(displayName), lastModifyingUser(displayName))',
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

    async getRecentFiles({ max_results = 10 }) {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('drive', 'v3');
        const response = await this.gapi.client.drive.files.list({
            orderBy: 'modifiedTime desc',
            q: `trashed = false and 'me' in owners`,
            pageSize: max_results,
            fields: 'files(id, name, webViewLink, iconLink, mimeType, modifiedTime)',
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

    async getTasks({ max_results = 1000, showCompleted = true, showHidden = true }) {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('tasks', 'v1');
        
        const tasklistsResponse = await this.gapi.client.tasks.tasklists.list();
        const tasklists = tasklistsResponse.result.items;
        let allTasks = [];

        if (tasklists && tasklists.length > 0) {
            for (const tasklist of tasklists) {
                const tasksResponse = await this.gapi.client.tasks.tasks.list({
                    tasklist: tasklist.id,
                    maxResults: max_results,
                    showCompleted: showCompleted,
                    showHidden: showHidden,
                });
                if (tasksResponse.result.items) {
                    allTasks = allTasks.concat(tasksResponse.result.items);
                }
            }
        }
        return allTasks;
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

    async updateTask(details) {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('tasks', 'v1');
        const { taskId, ...updateFields } = details;
        
        if (!taskId) throw new Error("Task ID is required for an update.");

        const resource = {};
        if (updateFields.title) resource.title = updateFields.title;
        if (updateFields.notes) resource.notes = updateFields.notes;
        if (updateFields.dueDate) resource.due = updateFields.dueDate;
        
        const response = await this.gapi.client.tasks.tasks.patch({
            tasklist: '@default',
            task: taskId,
            resource: resource,
        });
        return response.result;
    }

     async deleteTask({ taskId, tasklist = '@default' }) {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('tasks', 'v1');
        await this.gapi.client.tasks.tasks.delete({
            tasklist: tasklist,
            task: taskId,
        });
        return { success: true, taskId };
    }

    async getRecentEmails({ max_results = 50 }) {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('gmail', 'v1');
    
        const listResponse = await this.gapi.client.gmail.users.messages.list({
            userId: 'me',
            maxResults: max_results,
            q: 'in:inbox category:primary -in:draft -in:spam -in:trash',
        });
    
        const messages = listResponse.result.messages || [];
        if (messages.length === 0) {
            return [];
        }
    
        const allEmails = [];
        const CHUNK_SIZE = 100; // Max batch size for Gmail API is 100
    
        for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
            const chunk = messages.slice(i, i + CHUNK_SIZE);
            const batch = this.gapi.client.newBatch();
    
            chunk.forEach(message => {
                batch.add(this.gapi.client.gmail.users.messages.get({
                    userId: 'me',
                    id: message.id,
                    format: 'full',
                }));
            });
            
            let attempt = 0;
            const maxRetries = 3;
            let batchResponse;
            let success = false;

            while (attempt < maxRetries && !success) {
                try {
                    batchResponse = await batch;
                    success = true; // If no error, we are successful
                } catch (batchError) {
                    attempt++;
                    if (batchError.status === 429 && attempt < maxRetries) {
                        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                        console.warn(`Gmail API rate limit exceeded. Retrying in ${Math.round(delay / 1000)}s... (Attempt ${attempt}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        console.error("A non-retriable batch request for emails failed:", batchError);
                        throw batchError; // Re-throw if it's not a rate limit error or retries exhausted
                    }
                }
            }
            
            if (!success) {
                console.error("Batch request for emails failed after multiple retries.");
                continue; // Skip to the next chunk
            }

            const batchResult = batchResponse.result;

            Object.values(batchResult).forEach(res => {
                if (res.error) {
                    console.warn('Skipping an email in batch due to Google API error:', res.error);
                    return;
                }

                try {
                    const payload = res.result;
                    if (!payload || !payload.id || !payload.payload) {
                        console.warn('Skipping a malformed email response from batch.', res);
                        return;
                    }

                    const headers = payload.payload.headers || [];
                    const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

                    const attachments = [];
                    const findAttachments = (parts) => {
                         if (!parts) return;
                         for (const part of parts) {
                            if (part.filename && part.body && part.body.attachmentId) {
                                attachments.push({
                                    filename: part.filename,
                                    mimeType: part.mimeType,
                                    size: part.body.size,
                                });
                            }
                            if (part.parts) {
                                findAttachments(part.parts);
                            }
                        }
                    };
                    findAttachments(payload.payload.parts);

                    allEmails.push({
                        id: payload.id,
                        threadId: payload.threadId,
                        snippet: payload.snippet,
                        subject: getHeader('Subject'),
                        senderInfo: parseSingleEmailAddress(getHeader('From')),
                        recipientsInfo: {
                            to: parseMultipleEmailAddresses(getHeader('To')),
                            cc: parseMultipleEmailAddresses(getHeader('Cc')),
                        },
                        receivedAt: payload.internalDate ? new Date(parseInt(payload.internalDate, 10)).toISOString() : null,
                        body: getEmailBody(payload.payload),
                        hasAttachments: attachments.length > 0,
                        attachments: attachments,
                        labelIds: payload.labelIds || [],
                        gmailLink: `https://mail.google.com/mail/u/0/#inbox/${payload.id}`,
                        from: getHeader('From'),
                        date: getHeader('Date'),
                    });
                } catch (e) {
                    console.error(`Error processing an individual email (ID: ${res?.result?.id}) during sync. Skipping it.`, e);
                }
            });
            // Add a small delay between batches to avoid hitting rate limits too quickly
            if (i + CHUNK_SIZE < messages.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        return allEmails;
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
    
    async deleteEmail({ messageId, userId = 'me' }) {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('gmail', 'v1');
        // We use 'trash' instead of 'delete' for safety.
        const response = await this.gapi.client.gmail.users.messages.trash({
            userId: userId,
            id: messageId,
        });
        return response.result;
    }

    // --- Notes using Google Docs ---
    async createNote(details) {
        return this.createGoogleDocWithContent(details.title, details.content);
    }

    async findNotes(query) {
        await this.ensureGapiIsReady();
        await this.gapi.client.load('drive', 'v3');

        // Specifically search for Google Docs to better represent "notes"
        const response = await this.gapi.client.drive.files.list({
            q: `name contains '${query}' and mimeType='application/vnd.google-apps.document' and trashed = false`,
            fields: 'files(id, name, webViewLink, iconLink, mimeType, modifiedTime)',
            spaces: 'drive',
            pageSize: 10,
        });

        return response.result.files || [];
    }
}
