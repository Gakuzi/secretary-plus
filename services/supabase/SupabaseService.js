import { GOOGLE_SCOPES } from '../../constants.js';

// Helper function to safely parse date strings from Gmail API
function parseGmailDate(dateString) {
    if (!dateString) return null;
    try {
        const date = new Date(dateString);
        // Check if the parsed date is valid
        if (isNaN(date.getTime())) {
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

    getId() {
        return "supabase";
    }

    // --- Auth ---
    async signInWithGoogle() {
        const { error } = await this.client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                scopes: GOOGLE_SCOPES,
                redirectTo: window.location.origin + window.location.pathname,
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
    
    // --- Data Sync (New logic with Hard Deletes) ---

    async #genericSync(tableName, googleItems, formatterFn, idExtractorFn = item => item.id) {
        const { data: { user } } = await this.client.auth.getUser();
        if (!user) throw new Error("User not authenticated.");

        // 1. Get all relevant source IDs from the Google API response.
        const googleSourceIds = new Set(googleItems.map(idExtractorFn));

        // 2. Fetch ALL corresponding source IDs from Supabase for the current user.
        // This query is now guaranteed not to reference 'is_deleted'.
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
    
    async syncContacts(googleContacts) {
        return this.#genericSync(
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
        return this.#genericSync(
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
         return this.#genericSync(
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
         return this.#genericSync(
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
        return this.#genericSync(
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
    
    // --- User Settings ---
    async getUserSettings() {
        const { data, error } = await this.client
            .from('user_settings')
            .select('settings')
            .single();
        
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
    
    // --- Data Viewer ---
    async getSampleData(tableName, limit = 10) {
        if (!tableName) throw new Error("Table name is required.");
        
        const orderColumn = ['notes', 'files', 'contacts'].includes(tableName) ? 'updated_at' : 'created_at';

        const { data, error } = await this.client
            .from(tableName)
            .select('*')
            .order(orderColumn, { ascending: false, nullsFirst: true })
            .limit(limit);
            
        if (error) {
            console.error(`Error fetching sample data from ${tableName}:`, error);
            return { error: error.message };
        }
        
        return { data: data || [] };
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
            .insert({ 
                ...proxyData, 
                user_id: user.id,
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                 const { data: updateData, error: updateError } = await this.client
                    .from('proxies')
                    .update({ ...proxyData, last_checked_at: new Date().toISOString() })
                    .eq('user_id', user.id)
                    .eq('url', proxyData.url)
                    .select()
                    .single();
                 if (updateError) throw updateError;
                 return updateData;
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

    // --- Schema Management ---
    async executeSql(managementWorkerUrl, sqlScript) {
        if (!managementWorkerUrl) {
            throw new Error("Management Worker URL is not configured.");
        }
        
        const { data: { session } } = await this.client.auth.getSession();
        if (!session || !session.provider_token) {
            throw new Error("User is not authenticated or provider token is missing.");
        }

        const response = await fetch(managementWorkerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Pass the Google token to the worker for potential validation if needed
                'Authorization': `Bearer ${session.provider_token}`
            },
            body: JSON.stringify({ query: sqlScript }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Schema update failed with status ${response.status}: ${errorText}`);
        }

        return await response.json();
    }
}