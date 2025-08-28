const SETTINGS_KEY = 'secretary-plus-settings';

const defaultSettings = {
    googleClientId: '',
    activeProviderId: 'google',
};

export function getSettings() {
    try {
        const savedSettings = localStorage.getItem(SETTINGS_KEY);
        if (savedSettings) {
            return { ...defaultSettings, ...JSON.parse(savedSettings) };
        }
    } catch (error) {
        console.error("Failed to parse settings from localStorage", error);
    }
    return defaultSettings;
}

export function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error)
    {
        console.error("Failed to save settings to localStorage", error);
    }
}