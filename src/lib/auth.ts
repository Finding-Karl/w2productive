import { supabase } from './supabase';

/**
 * Google sign-in via chrome.identity.launchWebAuthFlow + Supabase PKCE.
 *
 * Run this from an extension *page* (options), not the popup: the auth window steals focus,
 * which closes the popup and would kill the flow mid-way. The worker could run it too, but
 * it may be terminated while the user is on Google's consent screen.
 */
export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error('Backend not configured (.env missing)');
  // https://<extension-id>.chromiumapp.org/ — must be in Supabase's allowed redirect URLs.
  const redirectTo = browser.identity.getRedirectURL();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;

  const result = await browser.identity.launchWebAuthFlow({ url: data.url, interactive: true });
  if (!result) throw new Error('Sign-in was cancelled');

  const params = new URL(result).searchParams;
  const code = params.get('code');
  if (!code) throw new Error(params.get('error_description') ?? 'No auth code returned');

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

export async function signOut(): Promise<void> {
  // 'local' only drops this browser's session; local data stays and keeps working offline.
  await supabase?.auth.signOut({ scope: 'local' });
}
