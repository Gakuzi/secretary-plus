import { GOOGLE_SCOPES } from '../../constants.js';

// Helper function to safely parse date strings from Gmail API
function parseGmailDate(dateString) {
    if (!dateString) return null;
    try {
        const date = new Date(dateString);
        // Check if the parsed date is valid
        if (isNaN(date.getTime())) {
            // Attempt to parse more complex date formats if needed,
            // but for now, returning null is the safest option.
            console.warn(`Could not parse invalid date string: ${dateString}`);
            return null;
        }
        return date.toISOString();
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
    }

    // --- Auth ---
    async signInWithGoogle() {
        const { error } = await this.client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                scopes: GOOGLE_SCOPES,
                redirectTo: window.location.href, // Use full current href for reliable redirects
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
     * Synchronizes Google Contacts with the Supabase database.
     * @param {Array<Object>} googleContacts - Array of contact objects from Google People API.
     * @returns {Promise<{synced: number, failed: number}>} - The result of the sync operation.
     */
    async syncContacts(googleContacts) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const formattedContacts = googleContacts.map(c => ({
            user_id: user.id,
            source: 'google',
            source_id: c.resourceName.split('/')[1],
            display_name: c.names?.[0]?.displayName || null,
            email: c.emailAddresses?.[0]?.value || null,
            phone: c.phoneNumbers?.[0]?.value || null,
            avatar_url: c.photos?.[0]?.url || null,
        })).filter(c => c.display_name); // Only sync contacts with names

        // Upsert in chunks to avoid payload size limits
        const chunkSize = 500;
        let syncedCount = 0;
        for (let i = 0; i < formattedContacts.length; i += chunkSize) {
            const chunk = formattedContacts.slice(i, i + chunkSize);
            const { error } = await this.client
                .from('contacts')
                .upsert(chunk, { onConflict: 'user_id,source,source_id', ignoreDuplicates: false });

            if (error) {
                console.error("Error syncing contacts chunk:", error);
                throw error;
            }
            syncedCount += chunk.length;
        }

        return { synced: syncedCount };
    }
    
     /**
     * Synchronizes Google Drive files with the Supabase database.
     * @param {Array<Object>} googleFiles - Array of file objects from Google Drive API.
     * @returns {Promise<{synced: number, failed: number}>} - The result of the sync operation.
     */
    async syncFiles(googleFiles) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const formattedFiles = googleFiles.map(f => ({
            user_id: user.id,
            source: 'google_drive',
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
        }));
        
        // Supabase has a limit on how many rows can be inserted at once, so we do it in chunks.
        const chunkSize = 500;
        let syncedCount = 0;
        for (let i = 0; i < formattedFiles.length; i += chunkSize) {
            const chunk = formattedFiles.slice(i, i + chunkSize);
            const { error } = await this.client
                .from('files')
                .upsert(chunk, { onConflict: 'user_id,source,source_id', ignoreDuplicates: false });

            if (error) {
                console.error("Error syncing files chunk:", error);
                throw error; // Stop on first error
            }
            syncedCount += chunk.length;
        }

        return { synced: syncedCount };
    }

    async syncCalendarEvents(googleEvents) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const formattedEvents = googleEvents.map(e => ({
            user_id: user.id,
            source_id: e.id,
            title: e.summary,
            description: e.description,
            start_time: e.start?.dateTime || e.start?.date,
            end_time: e.end?.dateTime || e.end?.date,
            event_link: e.htmlLink,
            meet_link: e.hangoutLink,
        }));

        // Upsert in chunks to avoid payload size limits
        const chunkSize = 500;
        let syncedCount = 0;
        for (let i = 0; i < formattedEvents.length; i += chunkSize) {
            const chunk = formattedEvents.slice(i, i + chunkSize);
            const { error } = await this.client
                .from('calendar_events')
                .upsert(chunk, { onConflict: 'user_id,source_id', ignoreDuplicates: false });

            if (error) {
                 console.error("Error syncing calendar events chunk:", error);
                throw error;
            }
            syncedCount += chunk.length;
        }

        return { synced: syncedCount };
    }

    async syncTasks(googleTasks) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const formattedTasks = googleTasks.map(t => ({
            user_id: user.id,
            source_id: t.id,
            title: t.title,
            notes: t.notes,
            due_date: t.due,
            status: t.status,
        }));

        // Upsert in chunks for consistency, although tasks are usually fewer.
        const chunkSize = 500;
        let syncedCount = 0;
        for (let i = 0; i < formattedTasks.length; i += chunkSize) {
            const chunk = formattedTasks.slice(i, i + chunkSize);
            const { error } = await this.client
                .from('tasks')
                .upsert(chunk, { onConflict: 'user_id,source_id', ignoreDuplicates: false });

            if (error) {
                 console.error("Error syncing tasks chunk:", error);
                throw error;
            }
            syncedCount += chunk.length;
        }
        
        return { synced: syncedCount };
    }

    async syncEmails(googleEmails) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const formattedEmails = googleEmails.map(e => ({
            user_id: user.id,
            source_id: e.id,
            subject: e.subject,
            sender: e.from,
            snippet: e.snippet,
            received_at: parseGmailDate(e.date),
        }));

        // Upsert in chunks to avoid payload size limits
        const chunkSize = 500;
        let syncedCount = 0;
        for (let i = 0; i < formattedEmails.length; i += chunkSize) {
            const chunk = formattedEmails.slice(i, i + chunkSize);
            const { error } = await this.client
                .from('emails')
                .upsert(chunk, { onConflict: 'user_id,source_id', ignoreDuplicates: false });

            if (error) {
                console.error("Error syncing emails chunk:", error);
                throw error;
            }
            syncedCount += chunk.length;
        }
        
        return { synced: syncedCount };
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
    
    // --- User Settings ---
    async getUserSettings() {
        const { data, error } = await this.client
            .from('user_settings')
            .select('settings')
            .single();
        
        // PGRST116: Supabase error for "No rows found"
        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching user settings:', error);
            throw error;
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

    async addProxy(proxyData) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");
        
        const { data, error } = await this.client
            .from('proxies')
            .insert({ ...proxyData, user_id: user.id })
            .select()
            .single();

        if (error) throw error;
        return data;
    }
    
    async updateProxy(id, updateData) {
        const { data, error } = await this.client
            .from('proxies')
            .update(updateData)
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
    
    async upsertProxies(proxies) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        const formattedProxies = proxies.map(p => ({
            user_id: user.id,
            url: p.url,
            alias: p.alias,
            priority: p.priority,
            is_active: p.is_active,
            geolocation: p.geolocation,
        }));

        const { data, error } = await this.client
            .from('proxies')
            .upsert(formattedProxies, { onConflict: 'user_id, url' })
            .select();

        if (error) throw error;
        return data;
    }
}