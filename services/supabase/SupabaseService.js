import { GOOGLE_SCOPES } from '../../constants.js';
import { DB_SCHEMAS } from './schema.js';
import { getSettings } from '../../utils/storage.js';

export class SupabaseService {
    constructor(supabaseUrl, supabaseAnonKey) {
        if (!window.supabase) {
            throw new Error('Клиент Supabase JS не загружен. Проверьте URL скрипта в index.html и подключение к интернету.');
        }
        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error('Supabase URL and Anon Key are required.');
        }
        this.client = supabase.createClient(supabaseUrl, supabaseAnonKey);
        this.url = supabaseUrl;
        this.anonKey = supabaseAnonKey;
        this.settings = {}; // Initialize settings object
    }
    
    // Method to update settings from the main app
    setSettings(settings) {
        this.settings = settings;
    }

    getId() {
        return "supabase";
    }

    // --- Auth ---
    async signInWithGoogle() {
        // Dynamically construct a clean redirect URL to ensure it works correctly
        // on different hosting environments (like GitHub Pages subdirectories) and
        // avoids mismatches due to 'index.html'.
        let path = window.location.pathname;
        if (path.endsWith('index.html')) {
            path = path.substring(0, path.lastIndexOf('/') + 1);
        }
        const redirectUrl = `${window.location.origin}${path}`;

        const { error } = await this.client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                scopes: GOOGLE_SCOPES,
                redirectTo: redirectUrl,
            },
        });
        if (error) throw error;
    }

    async signOut() {
        const { error } = await this.client.auth.signOut();
        if (error) throw error;
    }

    onAuthStateChange(callback) {
        return this.client.auth.onAuthStateChange(callback);
    }
    
    // --- Data Sync ---

    /**
     * Performs a full sync. Fetches all items from Google, compares with Supabase,
     * deletes what's missing, and upserts the rest. Ideal for datasets that can be
     * fully fetched each time (e.g., contacts).
     */
    async #fullSync(tableName, googleItems, formatterFn, idExtractorFn = item => item.id) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        // 1. Get all relevant source IDs from the Google API response.
        const googleSourceIds = new Set(googleItems.map(idExtractorFn));

        // 2. Fetch ALL corresponding source IDs from Supabase for the current user.
        const { data: existingDbItems, error: fetchError } = await this.client
            .from(tableName)
            .select('source_id')
            .eq('user_id', user.id);

        if (fetchError) {
            console.error(`Error fetching existing items from ${tableName}:`, fetchError);
            throw fetchError;
        }
        const supabaseSourceIds = new Set(existingDbItems.map(item => item.source_id));

        // 3. Determine which items need to be deleted from Supabase (hard delete).
        const deletedSourceIds = [...supabaseSourceIds].filter(id => !googleSourceIds.has(id));

        // 4. Perform the hard delete if necessary.
        if (deletedSourceIds.length > 0) {
            const { error: deleteError } = await this.client
                .from(tableName)
                .delete()
                .eq('user_id', user.id)
                .in('source_id', deletedSourceIds);

            if (deleteError) {
                console.error(`Error deleting items from ${tableName}:`, deleteError);
                throw deleteError;
            }
        }

        // 5. Upsert all items from Google. This will insert new and update existing items.
        if (googleItems.length > 0) {
            const formattedItems = googleItems.map(item => formatterFn(item, user.id));
            const { error: upsertError } = await this.client
                .from(tableName)
                .upsert(formattedItems, { onConflict: 'user_id,source_id' });

            if (upsertError) {
                console.error(`Error upserting items to ${tableName}:`, upsertError);
                throw upsertError;
            }
        }
    }
    
    /**
     * Performs an incremental sync. Fetches recent items from Google and upserts them.
     * Does NOT delete old records, allowing the local cache to grow over time.
     * Ideal for large datasets like emails or calendar events.
     */
    async #incrementalSync(tableName, googleItems, formatterFn) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");
        if (googleItems.length === 0) return; // Nothing to do

        const formattedItems = googleItems.map(item => formatterFn(item, user.id));
        const { error: upsertError } = await this.client
            .from(tableName)
            .upsert(formattedItems, { onConflict: 'user_id,source_id' });

        if (upsertError) {
            console.error(`Error upserting items to ${tableName}:`, upsertError);
            throw upsertError;
        }
    }

    async syncCalendarEvents(googleItems) {
        const config = this.settings.serviceFieldConfig?.calendar || {};
        const formatter = (event, userId) => {
            const item = { user_id: userId, source_id: event.id };
            if (config.title) item.title = event.summary;
            if (config.description) item.description = event.description;
            if (config.start_time) item.start_time = event.start?.dateTime || event.start?.date;
            if (config.end_time) item.end_time = event.end?.dateTime || event.end?.date;
            if (config.event_link) item.event_link = event.htmlLink;
            if (config.meet_link) item.meet_link = event.hangoutLink;
            if (config.attendees) item.attendees = event.attendees;
            if (config.status) item.status = event.status;
            if (config.creator_email) item.creator_email = event.creator?.email;
            if (config.is_all_day) item.is_all_day = !event.start?.dateTime;
            return item;
        };
        await this.#incrementalSync('calendar_events', googleItems, formatter);
    }

    async syncContacts(googleItems) {
        const config = this.settings.serviceFieldConfig?.contacts || {};
        const formatter = (contact, userId) => {
            const c = contact; // Alias for brevity
            const item = { user_id: userId, source_id: c.resourceName };
            if (config.display_name) item.display_name = c.names?.[0]?.displayName;
            if (config.email) item.email = c.emailAddresses?.[0]?.value;
            if (config.phone) item.phone = c.phoneNumbers?.[0]?.value;
            if (config.avatar_url) item.avatar_url = c.photos?.[0]?.url;
            if (config.addresses) item.addresses = c.addresses;
            if (config.organizations) item.organizations = c.organizations;
            if (config.birthdays) item.birthdays = c.birthdays;
            return item;
        };
        const idExtractor = item => item.resourceName;
        await this.#fullSync('contacts', googleItems, formatter, idExtractor);
    }

    async syncFiles(googleItems) {
        const config = this.settings.serviceFieldConfig?.files || {};
        const formatter = (file, userId) => {
            const item = { user_id: userId, source_id: file.id };
            if (config.name) item.name = file.name;
            if (config.mime_type) item.mime_type = file.mimeType;
            if (config.url) item.url = file.webViewLink;
            if (config.icon_link) item.icon_link = file.iconLink;
            if (config.created_time) item.created_time = file.createdTime;
            if (config.modified_time) item.modified_time = file.modifiedTime;
            if (config.viewed_by_me_time) item.viewed_by_me_time = file.viewedByMeTime;
            if (config.size) item.size = file.size;
            if (config.owner) item.owner = file.owners?.[0]?.displayName;
            if (config.last_modifying_user) item.last_modifying_user = file.lastModifyingUser?.displayName;
            return item;
        };
        await this.#fullSync('files', googleItems, formatter);
    }
    
    async syncTasks(googleItems) {
        const config = this.settings.serviceFieldConfig?.tasks || {};
        const formatter = (task, userId) => {
            const item = { user_id: userId, source_id: task.id };
            if (config.title) item.title = task.title;
            if (config.notes) item.notes = task.notes;
            if (config.due_date) item.due_date = task.due;
            if (config.status) item.status = task.status;
            if (config.completed_at) item.completed_at = task.completed;
            if (config.parent_task_id) item.parent_task_id = task.parent;
            return item;
        };
        await this.#fullSync('tasks', googleItems, formatter);
    }

    async syncEmails(googleItems) {
         const config = this.settings.serviceFieldConfig?.emails || {};
         const formatter = (email, userId) => {
            const item = { user_id: userId, source_id: email.id };
            if (config.thread_id) item.thread_id = email.threadId;
            if (config.subject) item.subject = email.subject;
            if (config.snippet) item.snippet = email.snippet;
            if (config.sender_info) item.sender_info = email.senderInfo;
            if (config.recipients_info) item.recipients_info = email.recipientsInfo;
            if (config.received_at) item.received_at = email.receivedAt;
            if (config.full_body) item.full_body = email.body;
            if (config.has_attachments) item.has_attachments = email.hasAttachments;
            if (config.attachments_metadata) item.attachments_metadata = email.attachments;
            if (config.label_ids) item.label_ids = email.labelIds;
            if (config.gmail_link) item.gmail_link = email.gmailLink;
            return item;
        };
        await this.#incrementalSync('emails', googleItems, formatter);
    }

    // --- Search ---
    async findContacts(query) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");
        const { data, error } = await this.client.rpc('search_contacts', { query: query, p_user_id: user.id });
        if (error) throw error;
        return data;
    }

    async findDocuments(query) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");
        const { data, error } = await this.client.from('files').select('name, url:webViewLink, icon_link, id:source_id, modified_time')
            .eq('user_id', user.id).ilike('name', `%${query}%`).limit(10);
        if (error) throw error;
        return data;
    }
    
    // --- Notes ---
    async createNote(details) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");
        const { data, error } = await this.client.from('notes')
            .insert({
                user_id: user.id,
                title: details.title,
                content: details.content,
            }).select().single();
        if (error) throw error;
        return data;
    }
    
    async findNotes(query) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");
        const { data, error } = await this.client.from('notes')
            .select('id, title, created_at, updated_at')
            .eq('user_id', user.id)
            .ilike('content', `%${query}%`)
            .limit(10);
        if (error) throw error;
        return data.map(n => ({ ...n, name: n.title, url: `#note-${n.id}`}));
    }

    // --- User Profile & Settings ---
     async getCurrentUserProfile() {
        const { data, error } = await this.client.rpc('get_or_create_profile');
        if (error) throw error;
        return data?.[0] || null;
    }

    async getUserSettings() {
        const { data, error } = await this.client.from('user_settings').select('settings').maybeSingle();
        if (error) {
             console.warn("Could not fetch user settings:", error.message);
             return null;
        }
        return data?.settings || null;
    }
    
    async saveUserSettings(settings) {
        const { error } = await this.client.rpc('upsert_user_settings', { new_settings: settings });
        if (error) throw error;
    }

    async deleteUserSettings() {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");
        const { error } = await this.client.from('user_settings').delete().eq('user_id', user.id);
        if (error) throw error;
    }

    // --- Data Management & Testing (for Profile Modal) ---
    async testConnection() {
        // A simple query to a known table to verify the connection and RLS policies.
        const { error } = await this.client.from('profiles').select('id').limit(1);
        if (error) {
            console.error("Supabase connection test failed:", error);
            throw new Error(`Connection failed: ${error.message}`);
        }
        return { success: true };
    }

    async getSampleData(tableName) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        // Simple validation to allow only table names from the schema
        const allowedTables = Object.values(DB_SCHEMAS).map(s => s.tableName);
        if (!allowedTables.includes(tableName)) {
            throw new Error(`Access to table "${tableName}" is not permitted.`);
        }

        const query = this.client
            .from(tableName)
            .select('*')
            .limit(10);

        // Only add user_id filter if the table is not a shared one
        const sharedTables = ['shared_proxies', 'shared_gemini_keys'];
        if (!sharedTables.includes(tableName)) {
            query.eq('user_id', user.id);
        }

        const { data, error } = await query;

        if (error) {
            console.error(`Error fetching sample data from ${tableName}:`, error);
            throw error;
        }
        return data;
    }


    // --- Chat Logging & Sessions ---
    async createNewSession() {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) {
            console.warn("createNewSession called without an authenticated user.");
            throw new Error("Не удалось создать сессию: пользователь не аутентифицирован.");
        }
        const { data, error } = await this.client.from('sessions').insert({ user_id: user.id }).select().single();
        if (error) throw error;
        return data.id;
    }

    async logChatMessage(message, sessionId) {
         if (!sessionId) {
            console.warn("Cannot log chat message, session ID is missing.");
            return;
        }
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) {
            console.error("Failed to log chat message: User not authenticated.");
            return;
        }
        const { error } = await this.client.from('chat_history').insert({
            user_id: user.id, // CRITICAL FIX: Add user_id to the payload
            session_id: sessionId,
            sender: message.sender,
            text_content: message.text,
            card_data: message.card,
            contextual_actions: message.contextualActions,
        });
        if (error) {
            console.error("Failed to log chat message:", error);
        }
    }
    
    // --- Admin & Schema Functions ---
    async checkSchemaVersion() {
        // This is a lightweight check. We query for a table that we know is part of the latest schema.
        // If it fails, we know the schema is outdated. This is much faster than checking all tables/columns.
        const { error } = await this.client.from('shared_gemini_keys').select('id').limit(1);
        if (error) throw error;
    }

    async executeSqlViaFunction(sql, overrideUrl = null, overrideToken = null) {
        const settings = getSettings();
        // Use override values if provided (for setup wizard), otherwise use saved settings
        const managementWorkerUrl = overrideUrl || settings.managementWorkerUrl;
        const adminSecretToken = overrideToken || settings.adminSecretToken;

        if (!managementWorkerUrl || !adminSecretToken) {
            throw new Error("URL или токен управляющего воркера не настроены в 'Центре Управления'.");
        }
        const { data: { session } } = await this.client.auth.getSession();
        if (!session || !session.access_token) {
            throw new Error("Не удалось получить токен аутентификации.");
        }

        const response = await fetch(managementWorkerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`, // Send user's JWT
                'x-admin-secret-token': adminSecretToken // Send the shared secret
            },
            body: JSON.stringify({ sql_query: sql })
        });
        
        const responseData = await response.json();
        
        if (!response.ok) {
            const errorMessage = responseData.error || `HTTP error! status: ${response.status}`;
            throw new Error(errorMessage);
        }
        
        return responseData;
    }

    async getAllUserProfiles() {
        const { data, error } = await this.client.rpc('get_all_user_profiles_with_email');
        if (error) throw error;
        return data;
    }
    
    async updateUserRole(userId, newRole) {
        const { error } = await this.client.rpc('update_user_role', { target_user_id: userId, new_role: newRole });
        if (error) throw error;
    }

    async getChatHistoryForAdmin() {
         const { data, error } = await this.client.rpc('get_chat_history_with_user_info');
         if (error) throw error;
         return data;
    }

    async getFullStats() {
        const { data, error } = await this.client.rpc('get_full_stats');
        if (error) throw error;
        return data;
    }
    
    async incrementActionStat(functionName) {
        const { error } = await this.client.rpc('increment_stat', { fn_name: functionName });
        if(error) console.error("Failed to increment stat:", error.message);
    }

    // --- SHARED Resource Pools ---
    async getSharedGeminiKeys() {
        const { data, error } = await this.client.from('shared_gemini_keys').select('api_key').eq('is_active', true).order('priority');
        if (error) throw error;
        return data;
    }
    
    async getSharedProxies() {
        const { data, error } = await this.client.from('shared_proxies').select('url').eq('is_active', true).order('priority');
        if (error) throw error;
        return data;
    }

    // --- Admin Functions for Shared Keys ---
    async getAllSharedGeminiKeysForAdmin() {
        const { data, error } = await this.client.rpc('get_all_shared_gemini_keys_for_admin');
        if (error) throw error;
        return data;
    }

    async addSharedGeminiKey({ apiKey, description, priority }) {
        const { error } = await this.client.rpc('add_shared_gemini_key', {
            p_api_key: apiKey,
            p_description: description,
            p_priority: priority
        });
        if (error) throw error;
    }

    async updateSharedGeminiKey(id, updates) {
        const { error } = await this.client.rpc('update_shared_gemini_key', {
            p_id: id,
            p_updates: updates
        });
        if (error) throw error;
    }

    async deleteSharedGeminiKey(id) {
        const { error } = await this.client.rpc('delete_shared_gemini_key', { p_id: id });
        if (error) throw error;
    }
}