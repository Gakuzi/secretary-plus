// Hardcoded Supabase credentials.
// IMPORTANT: Replace these placeholder values with your actual Supabase project details.
export const SUPABASE_URL = 'https://abdrijvdzuikezysfqzu.supabase.co'; // <-- ВСТАВЬТЕ ВАШ URL СЮДА
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZHJpanZkenVpa2V6eXNmcXp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNzk1ODQsImV4cCI6MjA3MTk1NTU4NH0.gS6ngUXNs8qKRoLlfIGf1VCH7MXxoMxo-H9ZZbi2UsU'; // <-- ВСТАВЬТЕ ВАШ КЛЮЧ СЮДА

export const GEMINI_MODEL = 'gemini-2.5-flash';

// Scopes required for Google services. Supabase needs these to request the correct permissions.
export const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/contacts.readonly',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email'
].join(' ');