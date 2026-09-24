import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.WXT_SUPABASE_URL;
const anonKey = import.meta.env.WXT_SUPABASE_ANON_KEY;

/**
 * chrome.storage-backed auth storage. The service worker has no localStorage, and pages
 * and the worker must share one session: the options page signs in, the worker syncs.
 */
const chromeStorage = {
  getItem: async (key: string) => ((await browser.storage.local.get(key))[key] as string) ?? null,
  setItem: (key: string, value: string) => browser.storage.local.set({ [key]: value }),
  removeItem: (key: string) => browser.storage.local.remove(key),
};

/**
 * null when .env isn't configured — the extension then runs fully local, which is also
 * how it behaves when signed out.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: chromeStorage,
          storageKey: 'supabaseAuth',
          persistSession: true,
          // The worker is killed after ~30s idle, so a refresh timer is pointless there;
          // getSession() refreshes an expired token on demand before each sync.
          autoRefreshToken: typeof window !== 'undefined',
          detectSessionInUrl: false,
          flowType: 'pkce',
        },
      })
    : null;

export const isBackendConfigured = supabase !== null;
