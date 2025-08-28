const SETTINGS_KEY = 'secretary-plus-settings-v3';

const defaultSettings = {
    supabaseUrl: '',
    supabaseAnonKey: '',
    geminiApiKey: '',
    isSupabaseEnabled: true,
    isGoogleEnabled: true,
    googleClientId: '',
};

export function getSettings() {
    try {
        const savedSettings = localStorage.getItem(SETTINGS_KEY);
        if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            return { ...defaultSettings, ...parsed };
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
