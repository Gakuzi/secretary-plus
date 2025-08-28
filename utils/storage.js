const SETTINGS_KEY = 'secretary-plus-settings-v4';
const SYNC_STATUS_KEY = 'secretary-plus-sync-status-v1';

const defaultSettings = {
    geminiApiKey: '',
    googleClientId: '', // For direct Google auth fallback
    isSupabaseEnabled: true, // Master switch for Supabase
    supabaseUrl: '',
    supabaseAnonKey: '',
    isProxyEnabled: false, // For enabling/disabling proxy usage
    geminiProxyUrl: '', // URL for Gemini API proxy
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
        // Create a clean settings object to save, removing legacy fields
        const settingsToSave = {
            geminiApiKey: settings.geminiApiKey,
            googleClientId: settings.googleClientId,
            isSupabaseEnabled: settings.isSupabaseEnabled,
            supabaseUrl: settings.supabaseUrl,
            supabaseAnonKey: settings.supabaseAnonKey,
            isProxyEnabled: settings.isProxyEnabled,
            geminiProxyUrl: settings.geminiProxyUrl,
            timezone: settings.timezone,
            enableEmailPolling: settings.enableEmailPolling,
            enableAutoSync: settings.enableAutoSync,
            serviceMap: settings.serviceMap,
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsToSave));
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