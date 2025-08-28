

import React from 'react';

export enum MessageSender {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export interface CardAction {
    label: string;
    url?: string;
    onClick?: () => void;
}

export interface SelectionOption {
    id: string;
    label: string;
    description?: string;
    data: any; // The full contact/file object
}

export interface CardData {
    type: 'event' | 'task' | 'contact' | 'email' | 'contact-selection' | 'document-selection' | 'document';
    icon: React.ReactNode;
    title: string;
    details?: { [key: string]: string | string[] };
    actions?: CardAction[];
    selectionOptions?: SelectionOption[]; // The items to select from
}

export interface ChatMessage {
    id: string;
    sender: MessageSender;
    text?: string;
    image?: {
        base64: string;
        mimeType: string;
    };
    card?: CardData;
    isLoading?: boolean;
    originalPrompt?: string; // To hold context for multi-step interactions
}

export interface UserProfile {
    name: string;
    email: string;
    imageUrl: string;
}

export interface AppSettings {
    // FIX: Per coding guidelines, the Gemini API key should not be part of user settings.
    googleClientId: string;
}