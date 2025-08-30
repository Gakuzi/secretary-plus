import { DB_SCHEMAS } from '../services/supabase/schema.js';

const SETTINGS_KEY = 'secretary-plus-settings-v5';
const SYNC_STATUS_KEY = 'secretary-plus-sync-status-v1';


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
    // New settings for the DB Management Worker
    managementWorkerUrl: '',
    adminSecretToken: '',
    customProxyPrompt: '',
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
            // Deep merge to ensure all keys from default settings are present
            const merged = {
                ...defaultSettings,
                ...parsed,
                serviceMap: { ...defaultSettings.serviceMap, ...(parsed.serviceMap || {}) },
                enabledServices: { ...defaultSettings.enabledServices, ...(parsed.enabledServices || {}) },
                serviceFieldConfig: { ...defaultSettings.serviceFieldConfig }
            };
             // Deep merge for serviceFieldConfig
            if (parsed.serviceFieldConfig) {
                for (const serviceKey in merged.serviceFieldConfig) {
                    if (parsed.serviceFieldConfig[serviceKey]) {
                        merged.serviceFieldConfig[serviceKey] = { ...merged.serviceFieldConfig[serviceKey], ...parsed.serviceFieldConfig[serviceKey] };
                    }
                }
            }
            return merged;
        }
    } catch (error) {
        console.error("Failed to parse settings from localStorage", error);
    }
    return { ...defaultSettings };
}

export function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error)
    {
        console.error("Failed to save settings to localStorage", error);
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
