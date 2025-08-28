const SETTINGS_KEY = 'secretary-plus-settings-v4';

const defaultSettings = {
    supabaseUrl: '',
    supabaseAnonKey: '',
    geminiApiKey: '',
    isSupabaseEnabled: true,
    isGoogleEnabled: true,
    googleClientId: '',
    serviceMap: {
        calendar: 'google',
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
            // Ensure serviceMap exists and has all keys
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