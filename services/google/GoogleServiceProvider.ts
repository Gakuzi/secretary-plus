

import { ServiceProvider } from "../ServiceProvider";
import { UserProfile } from "../../types";
import { GOOGLE_SCOPES } from "../../constants";

declare global {
    interface Window {
        gapi: any;
        google: any;
    }
}

export class GoogleServiceProvider implements ServiceProvider {
    private gapi: any;
    private google: any;
    private tokenClient: any;
    private clientId: string;
    private initPromise: Promise<void> | null = null;

    constructor(clientId: string) {
        this.gapi = window.gapi;
        this.google = window.google;
        this.clientId = clientId;
    }
    
    private initialize(): Promise<void> {
        if (this.initPromise) {
            return this.initPromise;
        }
        
        this.initPromise = new Promise((resolve, reject) => {
            this.gapi.load('client', async () => {
                try {
                    await this.gapi.client.init({});
                    this.tokenClient = this.google.accounts.oauth2.initTokenClient({
                        client_id: this.clientId,
                        scope: GOOGLE_SCOPES,
                        callback: () => {}, // Callback is handled by the promise in authenticate
                    });
                    resolve();
                } catch(error) {
                    console.error("Error initializing GAPI client", error);
                    reject(error);
                }
            });
        });
        
        return this.initPromise;
    }


    getId(): string {
        return "google";
    }

    getName(): string {
        return "Google";
    }

    async isAuthenticated(): Promise<boolean> {
        await this.initialize();
        return !!this.gapi.client.getToken();
    }

    authenticate(): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                await this.initialize();
                const callback = (resp: any) => {
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

    async disconnect(): Promise<void> {
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

    async getUserProfile(): Promise<UserProfile> {
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

    async createEvent(details: { title: string; startTime: string; endTime: string; attendees?: string[]; description?: string }): Promise<any> {
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

    async findContacts(query: string): Promise<any[]> {
        await this.initialize();
        await this.gapi.client.load('people', 'v1');
        
        const response = await this.gapi.client.people.people.searchContacts({
            query: query,
            readMask: 'names,emailAddresses,phoneNumbers'
        });

        return response.result.results || [];
    }

    async findDocuments(query: string): Promise<any[]> {
        await this.initialize();
        await this.gapi.client.load('drive', 'v3');

        const response = await this.gapi.client.drive.files.list({
            q: `name contains '${query}' and trashed = false`,
            fields: 'files(id, name, webViewLink, iconLink, mimeType)',
            spaces: 'drive',
        });
        
        return response.result.files || [];
    }

    async createGoogleDoc(title: string): Promise<any> {
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

    async createGoogleSheet(title: string): Promise<any> {
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