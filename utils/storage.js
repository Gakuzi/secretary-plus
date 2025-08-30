import { DB_SCHEMAS } from '../services/supabase/schema.js';

const SETTINGS_KEY = 'secretary-plus-settings-v4';
const SYNC_STATUS_KEY = 'secretary-plus-sync-status-v1';
const GOOGLE_TOKEN_KEY = 'secretary-plus-google-token-v1';

// Helper to build the default field config based on recommended fields from the schema
const buildDefaultFieldConfig = () => {
    const config = {};
    for (const [key, schema] of Object.entries(DB_SCHEMAS)) {
        if (schema.tableName && schema.isEditable) { // Process only schemas that correspond to a table
            config[key] = {};
            for (const field of schema.fields) {
                if (field.recommended) {
                    config[key][field.name] = true;
                }
            }
        }
    }
    return config;
};


const defaultSettings = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    enableEmailPolling: true, // For proactive email notifications
    enableAutoSync: true, // For background data synchronization
    serviceMap: {
        calendar: 'google',
        tasks: 'google',
        contacts: 'google',
        files: 'google',
        notes: 'supabase',
    },
    // New setting to control which services are active
    enabledServices: {
        calendar: true,
        tasks: true,
        contacts: true,
        files: true,
        emails: true,
        notes: true,
    },
    // New setting for fine-grained field control during sync
    serviceFieldConfig: buildDefaultFieldConfig(),
};

export function getSettings() {
    try {
        const savedSettings = localStorage.getItem(SETTINGS_KEY);
        if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            // Ensure all nested objects exist and have default keys
            const serviceMap = { ...defaultSettings.serviceMap, ...(parsed.serviceMap || {}) };
            const enabledServices = { ...defaultSettings.enabledServices, ...(parsed.enabledServices || {}) };
            const serviceFieldConfig = { ...defaultSettings.serviceFieldConfig };
            // Deep merge for serviceFieldConfig
            if (parsed.serviceFieldConfig) {
                for (const serviceKey in serviceFieldConfig) {
                    if (parsed.serviceFieldConfig[serviceKey]) {
                        serviceFieldConfig[serviceKey] = { ...serviceFieldConfig[serviceKey], ...parsed.serviceFieldConfig[serviceKey] };
                    }
                }
            }
            return { ...defaultSettings, ...parsed, serviceMap, enabledServices, serviceFieldConfig };
        }
    } catch (error) {
        console.error("Failed to parse settings from localStorage", error);
    }
    return { ...defaultSettings };
}

export function saveSettings(settings) {
    try {
        // Create a clean settings object to save, removing legacy fields
        const settingsToSave = {
            timezone: settings.timezone,
            enableEmailPolling: settings.enableEmailPolling,
            enableAutoSync: settings.enableAutoSync,
            serviceMap: settings.serviceMap,
            enabledServices: settings.enabledServices, // Save the new setting
            serviceFieldConfig: settings.serviceFieldConfig, // Save the new field config
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsToSave));
    } catch (error)
    {
        console.error("Failed to save settings to localStorage", error);
    }
}

// --- Direct Google Auth Token ---

export function getGoogleToken() {
    try {
        return localStorage.getItem(GOOGLE_TOKEN_KEY);
    } catch (error) {
        console.error("Failed to get Google token from localStorage", error);
        return null;
    }
}

export function saveGoogleToken(token) {
    try {
        localStorage.setItem(GOOGLE_TOKEN_KEY, token);
    } catch (error) {
        console.error("Failed to save Google token to localStorage", error);
    }
}

export function clearGoogleToken() {
    try {
        localStorage.removeItem(GOOGLE_TOKEN_KEY);
    } catch (error) {
        console.error("Failed to remove Google token from localStorage", error);
    }
}


// --- Sync Status ---

export function getSyncStatus() {
    try {
        const savedStatus = localStorage.getItem(SYNC_STATUS_KEY);
        return savedStatus ? JSON.parse(savedStatus) : {};
    } catch (e) {
        console.error("Failed to parse sync status", e);
        return {};
    }
}

export function saveSyncStatus(status) {
    try {
        localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(status));
    } catch (e) {
        console.error("Failed to save sync status", e);
    }
}