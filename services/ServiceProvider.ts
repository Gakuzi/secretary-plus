

import { UserProfile } from "../types";

export interface ServiceProvider {
    getId(): string;
    getName(): string;
    isAuthenticated(): Promise<boolean>;
    authenticate(): Promise<void>;
    disconnect(): Promise<void>;
    getUserProfile(): Promise<UserProfile>;
    createEvent(details: { title: string; startTime: string; endTime: string; attendees?: string[]; description?: string }): Promise<any>;
    findContacts(query: string): Promise<any[]>;
    findDocuments(query: string): Promise<any[]>;
    createGoogleDoc(title: string): Promise<any>;
    createGoogleSheet(title: string): Promise<any>;
}