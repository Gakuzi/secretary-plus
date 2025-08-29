import { GOOGLE_SCOPES } from '../../constants.js';

// Helper function to safely parse date strings from Gmail API
function parseGmailDate(dateString) {
    if (!dateString) return null;
    try {
        // Gmail date format can be inconsistent, Date.parse is more robust.
        const timestamp = Date.parse(dateString);
        if (isNaN(timestamp)) {
            console.warn(`Could not parse invalid date string: ${dateString}`);
            return null;
        }
        return new Date(timestamp).toISOString();
    } catch (e) {
        console.error(`Error parsing date string: ${dateString}`, e);
        return null;
    }
}

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
    }

    getId() {
        return "supabase";
    }

    // --- Auth ---
    async signInWithGoogle() {
        // Dynamically construct the redirect URL to ensure it works correctly
        // on different hosting environments (like GitHub Pages subdirectories).
        const redirectUrl = `${window.location.origin}${window.location.pathname}`;

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

    async syncContacts(googleContacts) {
        // Contacts can be fully fetched, so use full sync.
        return this.#fullSync(
            'contacts',
            googleContacts.filter(c => c.names?.[0]?.displayName), // Only sync contacts with names
            (c, userId) => ({
                user_id: userId,
                source_id: c.resourceName.split('/')[1],
                display_name: c.names?.[0]?.displayName || null,
                email: c.emailAddresses?.[0]?.value || null,
                phone: c.phoneNumbers?.[0]?.value || null,
                avatar_url: c.photos?.[0]?.url || null,
                addresses: c.addresses,
                organizations: c.organizations,
                birthdays: c.birthdays,
            }),
            c => c.resourceName.split('/')[1]
        );
    }
    
    async syncFiles(googleFiles) {
        // Files can be fully fetched, so use full sync.
        return this.#fullSync(
            'files',
            googleFiles,
            (f, userId) => ({
                user_id: userId,
                source_id: f.id,
                name: f.name,
                mime_type: f.mimeType,
                url: f.webViewLink,
                icon_link: f.iconLink,
                created_time: f.createdTime,
                modified_time: f.modifiedTime,
                viewed_by_me_time: f.viewedByMeTime,
                size: f.size ? parseInt(f.size, 10) : null,
                owner: f.owners?.[0]?.displayName || null,
                permissions: f.permissions,
                last_modifying_user: f.lastModifyingUser?.displayName,
            })
        );
    }

    async syncCalendarEvents(googleEvents) {
        // Calendar can have many past events, use incremental sync to avoid deleting them.
         return this.#incrementalSync(
            'calendar_events',
            googleEvents,
            (e, userId) => ({
                user_id: userId,
                source_id: e.id,
                title: e.summary,
                description: e.description,
                start_time: e.start?.dateTime || e.start?.date,
                end_time: e.end?.dateTime || e.end?.date,
                event_link: e.htmlLink,
                meet_link: e.hangoutLink,
                attendees: e.attendees,
                status: e.status,
                creator_email: e.creator?.email,
                is_all_day: !!e.start?.date && !e.start?.dateTime,
            })
        );
    }

    async syncTasks(googleTasks) {
        // Tasks can be completed and old, use incremental sync.
         return this.#incrementalSync(
            'tasks',
            googleTasks,
            (t, userId) => ({
                user_id: userId,
                source_id: t.id,
                title: t.title,
                notes: t.notes,
                due_date: t.due,
                status: t.status,
                completed_at: t.completed,
                parent_task_id: t.parent,
            })
        );
    }

    async syncEmails(googleEmails) {
        // Emails are a perfect use case for incremental sync to build a local archive.
        return this.#incrementalSync(
            'emails',
            googleEmails,
            (e, userId) => ({
                user_id: userId,
                source_id: e.id,
                subject: e.subject,
                sender: e.from,
                snippet: e.snippet,
                received_at: parseGmailDate(e.date),
                full_body: e.body,
                attachments_metadata: e.attachments,
            })
        );
    }

    // --- Data Retrieval (from local cache) ---
    
    async getCalendarEvents({ time_min, time_max, max_results = 10 }) {
        let query = this.client
            .from('calendar_events')
            .select('*')
            .order('start_time', { ascending: true })
            .gte('start_time', time_min || new Date().toISOString())
            .limit(max_results);
            
        if (time_max) {
            query = query.lte('start_time', time_max);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        // Remap to match Google API structure for compatibility with ResultCard
        return data.map(e => ({
            id: e.source_id,
            summary: e.title,
            description: e.description,
            htmlLink: e.event_link,
            hangoutLink: e.meet_link,
            start: { dateTime: e.start_time },
            end: { dateTime: e.end_time }
        }));
    }

     async getTasks({ max_results = 20 }) {
        const { data, error } = await this.client
            .from('tasks')
            .select('*')
            .neq('status', 'completed')
            .order('due_date', { ascending: true, nullsFirst: true })
            .limit(max_results);

        if (error) throw error;
        // Remap for compatibility
        return data.map(t => ({
            id: t.source_id,
            title: t.title,
            notes: t.notes,
            due: t.due_date,
            status: t.status
        }));
    }

    async findContacts(query) {
        const { data, error } = await this.client
            .from('contacts')
            .select('*')
            .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`) // Case-insensitive search
            .limit(10);
            
        if (error) throw error;
        return data;
    }
    
    async findDocuments(query) {
         const { data, error } = await this.client
            .from('files')
            .select('*')
            .ilike('name', `%${query}%`) // Case-insensitive search
            .order('modified_time', { ascending: false, nullsFirst: false })
            .limit(10);
            
        if (error) throw error;
        return data;
    }

    async getRecentFiles({ max_results = 10 }) {
        const { data, error } = await this.client
            .from('files')
            .select('*')
            .order('modified_time', { ascending: false, nullsFirst: false })
            .limit(max_results);

        if (error) throw error;
        return data;
    }

    // --- Notes ---
    async createNote(details) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");
        
        const { data, error } = await this.client
            .from('notes')
            .insert({
                user_id: user.id,
                title: details.title,
                content: details.content,
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async findNotes(query) {
        const { data, error } = await this.client
            .from('notes')
            .select('*')
            .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
            .limit(10);
        
        if (error) throw error;
        return data;
    }

    // --- Long-term Memory ---
    async saveMemory(memoryData) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const { error } = await this.client
            .from('chat_memory')
            .insert({
                user_id: user.id,
                summary: memoryData.summary,
                keywords: memoryData.keywords,
            });

        if (error) throw error;
        return { success: true };
    }

    async recallMemory(query) {
        const { data, error } = await this.client
            .from('chat_memory')
            .select('*')
            // A simple text search. For more advanced search, pg_vector would be used.
            .or(`summary.ilike.%${query}%,keywords.cs.{${query}}`)
            .order('created_at', { ascending: false })
            .limit(5);

        if (error) throw error;
        return data;
    }

    // --- Action Statistics ---
    async getActionStats() {
        const { data, error } = await this.client
            .from('action_stats')
            .select('function_name, call_count');
        if (error) {
            console.error("Error fetching action stats:", error);
            return {}; // Return empty object on error
        }
        // Convert array of objects to a single object like { name: count }
        return data.reduce((acc, stat) => {
            acc[stat.function_name] = stat.call_count;
            return acc;
        }, {});
    }

    async incrementActionStat(functionName) {
        const { error } = await this.client.rpc('increment_stat', { fn_name: functionName });
        if (error) {
            console.error(`Failed to increment action stat for "${functionName}":`, error);
            // Do not throw, this is a non-critical background task.
        }
    }
    
    // --- User Settings & Profiles ---
    async getUserSettings() {
        const { data, error } = await this.client
            .from('user_settings')
            .select('settings')
            .single();
        
        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found, which is ok
            console.error('Error fetching user settings:', error);
            return null; // Return null instead of throwing, so app can proceed with defaults
        }

        return data ? data.settings : null;
    }

    async saveUserSettings(settingsObject) {
        const { error } = await this.client.rpc('upsert_user_settings', { new_settings: settingsObject });
        if (error) {
            console.error('Error saving user settings:', error);
            throw error;
        }
    }

    async deleteUserSettings() {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const { error } = await this.client
            .from('user_settings')
            .delete()
            .eq('user_id', user.id);

        if (error) {
            console.error('Error deleting user settings:', error);
            throw error;
        }
        return { success: true };
    }

    async getCurrentUserProfile() {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) return null;
        
        const { data, error } = await this.client
            .from('profiles')
            .select(`*`)
            .eq('id', user.id)
            .single();
            
        if (error) {
            console.error('Error fetching current user profile:', error);
            // Fallback to auth data if profile doesn't exist yet
            if (error.code === 'PGRST116') {
                return {
                    id: user.id,
                    email: user.email,
                    last_sign_in_at: user.last_sign_in_at,
                    full_name: user.user_metadata.full_name,
                    avatar_url: user.user_metadata.avatar_url,
                    role: 'user', // Default role
                }
            }
            return null;
        }
        
        // Combine auth data with profile data
        return {
            id: user.id,
            email: user.email,
            last_sign_in_at: user.last_sign_in_at,
            full_name: data.full_name || user.user_metadata.full_name,
            avatar_url: data.avatar_url || user.user_metadata.avatar_url,
            role: data.role,
        };
    }

    async getAllUserProfiles() {
        const { data, error } = await this.client
            .from('profiles')
            .select(`
                id,
                full_name,
                avatar_url,
                role,
                user_data:users(email, last_sign_in_at)
            `)
            .order('role', { ascending: false });

        if (error) {
            console.error("Error fetching all user profiles:", error);
            throw error;
        }
        
        // Flatten the response for easier use in the UI
        return data.map(p => ({
            id: p.id,
            full_name: p.full_name || p.user_data?.email,
            avatar_url: p.avatar_url,
            role: p.role,
            email: p.user_data?.email,
            last_sign_in_at: p.user_data?.last_sign_in_at,
        }));
    }

    async updateUserRole(targetUserId, newRole) {
        const { error } = await this.client.rpc('update_user_role', {
            target_user_id: targetUserId,
            new_role: newRole,
        });
        if (error) {
            console.error('Error updating user role:', error);
            throw error;
        }
        return { success: true };
    }
    
    // --- Data Viewer ---
    async getSampleData(tableName, limit = 10) {
        if (!tableName) throw new Error("Table name is required.");

        // Define a list of common timestamp columns to try for ordering
        const orderColumns = ['updated_at', 'created_at', 'modified_time', 'received_at'];

        let query = this.client.from(tableName).select('*').limit(limit);

        // Try to order by the first available timestamp column
        for (const col of orderColumns) {
            const { error } = await this.client.from(tableName).select(col).limit(1);
            if (!error) {
                query = query.order(col, { ascending: false, nullsFirst: true });
                break; // Stop after finding a valid column
            }
        }
        
        try {
            const { data, error } = await query;
            if (error) throw error; // Re-throw to be caught below
            return { data: data || [] };
        } catch (error) {
            console.error(`Error fetching sample data from ${tableName}:`, error);
            return { error: error.message };
        }
    }

    // --- DB Management via Supabase Edge Function ---
    async executeSqlViaFunction(functionUrl, adminToken, sql) {
        if (!functionUrl) throw new Error("URL функции не настроен.");
        if (!adminToken) throw new Error("Токен администратора не предоставлен.");
        
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.anonKey}`,
            },
            body: JSON.stringify({ sql: sql, admin_token: adminToken }),
        });

        const result = await response.json();

        if (!response.ok) {
            console.error("Edge function error response:", result);
            const errorMessage = result.error || result.message || `Edge function failed with status ${response.status}`;
            throw new Error(errorMessage);
        }

        return result;
    }


    // --- Proxy Management ---
    async getProxies() {
        const { data, error } = await this.client
            .from('proxies')
            .select('*')
            .order('priority', { ascending: true })
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    }
    
    async getActiveProxies() {
        const { data, error } = await this.client
            .from('proxies')
            .select('*')
            .eq('is_active', true)
            .order('priority', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    async addProxy(proxyData) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");
        
        const { data, error } = await this.client
            .from('proxies')
            .insert({ 
                ...proxyData, 
                user_id: user.id,
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') { // uniqueness violation
                 throw new Error("Этот URL прокси уже существует в вашем хранилище.");
            }
            throw error;
        }
        return data;
    }
    
    async updateProxy(id, updateData) {
        const { data, error } = await this.client
            .from('proxies')
            .update({ ...updateData, last_checked_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async deleteProxy(id) {
        const { error } = await this.client
            .from('proxies')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { success: true };
    }

    // --- Chat Analytics ---
    async createNewSession() {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const { data, error } = await this.client
            .from('sessions')
            .insert({ user_id: user.id })
            .select('id')
            .single();
        
        if (error) throw error;
        return data.id;
    }

    async logChatMessage(message, sessionId) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user || !sessionId) return; // Don't throw, just fail silently.

        const payload = {
            user_id: user.id,
            session_id: sessionId,
            sender: message.sender,
            text_content: message.text,
            image_metadata: message.image ? { mimeType: message.image.mimeType } : null,
            card_data: message.card,
            contextual_actions: message.contextualActions
        };

        const { error } = await this.client.from('chat_history').insert(payload);
        if (error) {
            console.error("Failed to log chat message:", error);
        }
    }
    
    async getChatHistoryForAdmin() {
        const { data, error } = await this.client
            .from('chat_history')
            .select(`
                *,
                user:profiles(full_name, avatar_url, user_data:users(email))
            `)
            .order('created_at', { ascending: false })
            .limit(500); // Limit to a reasonable number for performance

        if (error) {
            console.error("Error fetching chat history for admin:", error);
            throw error;
        }
        return data;
    }
}