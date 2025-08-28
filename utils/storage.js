const SETTINGS_KEY = 'secretary-plus-settings-v4';
const SYNC_STATUS_KEY = 'secretary-plus-sync-status-v1';

const defaultSettings = {
    supabaseUrl: '',
    supabaseAnonKey: '',
    geminiApiKey: '',
    isProxyEnabled: false, // For enabling/disabling proxy usage
    geminiProxyUrl: '', // URL for Gemini API proxy
    isSupabaseEnabled: true,
    isGoogleEnabled: true,
    googleClientId: '',
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
};

export function getSettings() {
    try {
        const savedSettings = localStorage.getItem(SETTINGS_KEY);
        if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            // Ensure serviceMap and timezone exist and have all keys
            const serviceMap = { ...defaultSettings.serviceMap, ...(parsed.serviceMap || {}) };
            return { ...defaultSettings, ...parsed, serviceMap };
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