export class SupabaseService {
    constructor(supabaseUrl, supabaseAnonKey) {
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
                scopes: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
                redirectTo: window.location.origin + window.location.pathname,
            },
        });
        if (error) throw error;
    }

    async signOut() {
        const { error } = await this.client.auth.signOut();
        if (error) throw error;
    }

    async getSession() {
        const { data, error } = await this.client.auth.getSession();
        if (error) throw error;
        return data.session;
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
        const user = (await this.getSession())?.user;
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

        const { error } = await this.client
            .from('contacts')
            .upsert(formattedContacts, { onConflict: 'user_id,source,source_id', ignoreDuplicates: false });

        if (error) {
            console.error("Error syncing contacts:", error);
            throw error;
        }

        return { synced: formattedContacts.length };
    }
    
     /**
     * Synchronizes Google Drive files with the Supabase database.
     * @param {Array<Object>} googleFiles - Array of file objects from Google Drive API.
     * @returns {Promise<{synced: number, failed: number}>} - The result of the sync operation.
     */
    async syncFiles(googleFiles) {
        const user = (await this.getSession())?.user;
        if (!user) throw new Error("User not authenticated.");

        const formattedFiles = googleFiles.map(f => ({
            user_id: user.id,
            source: 'google_drive',
            source_id: f.id,
            name: f.name,
            mime_type: f.mimeType,
            url: f.webViewLink,
            icon_link: f.iconLink,
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

    // --- Data Retrieval ---
    
    async searchContacts(query) {
        const { data, error } = await this.client
            .from('contacts')
            .select('*')
            .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`) // Case-insensitive search
            .limit(10);
            
        if (error) throw error;
        return data;
    }
    
    async searchFiles(query) {
         const { data, error } = await this.client
            .from('files')
            .select('*')
            .ilike('name', `%${query}%`) // Case-insensitive search
            .limit(10);
            
        if (error) throw error;
        return data;
    }
}