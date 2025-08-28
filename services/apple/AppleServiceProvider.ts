
import { ServiceProvider } from "../ServiceProvider";
import { UserProfile } from "../../types";

export class AppleServiceProvider implements ServiceProvider {
    getId(): string {
        return "apple";
    }
    getName(): string {
        return "Apple";
    }
    isAuthenticated(): Promise<boolean> {
        return Promise.resolve(false);
    }
    authenticate(): Promise<void> {
        return Promise.reject(new Error("Apple Service Provider не реализован."));
    }
    disconnect(): Promise<void> {
        console.warn("Apple Service Provider не реализован.");
        return Promise.resolve();
    }
    getUserProfile(): Promise<UserProfile> {
        return Promise.reject(new Error("Apple Service Provider не реализован."));
    }
    createEvent(details: any): Promise<any> {
        return Promise.reject(new Error("Apple Service Provider не реализован."));
    }
    // FIX: Implement findContacts to conform to ServiceProvider interface.
    findContacts(query: string): Promise<any[]> {
        return Promise.reject(new Error("Apple Service Provider не реализован."));
    }
    // FIX: Implement findDocuments to conform to ServiceProvider interface.
    findDocuments(query: string): Promise<any[]> {
        return Promise.reject(new Error("Apple Service Provider не реализован."));
    }
    createGoogleDoc(title: string): Promise<any> {
        return Promise.reject(new Error("Apple Service Provider не реализован."));
    }
    createGoogleSheet(title: string): Promise<any> {
        return Promise.reject(new Error("Apple Service Provider не реализован."));
    }
}