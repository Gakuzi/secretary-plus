import { createDataManagerModal } from './DataManagerModal.js';

// This file is now a proxy to the new DataManagerModal for backwards compatibility.
// The main button in the UI still calls `showSettingsModal`.

export function createSettingsModal(options) {
    // We ignore the old options and pass the required ones to the new modal.
    // This assumes the necessary services are available in the scope where this is called.
    return createDataManagerModal({
        supabaseService: options.supabaseService,
        tasks: options.syncTasks,
        settings: options.settings,
        onClose: options.onClose,
        onRunSingleSync: options.onRunSingleSync,
        onRunAllSyncs: options.onRunAllSyncs
    });
}
