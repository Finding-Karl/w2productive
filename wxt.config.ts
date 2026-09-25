import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    // Public key => stable extension ID (gdhfabadbkagblhlimnicelhnbkonddf) for dev and prod
    // builds on any machine. Supabase's OAuth redirect allowlist depends on it:
    // https://gdhfabadbkagblhlimnicelhnbkonddf.chromiumapp.org/
    // Private key lives in keys/ (gitignored); only needed to pack a .crx with this ID.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsv8qFiB+b3EvbYAwwrLJiAKeMv8NonIBoBqhI5nhXntvOcjL3SBN//+N9JjdWfunIvgQ0RrW0bHZHozkrYdocvsP/5QQJu8pNLz8xLBxDOBA4nAkpED5Fxo+8kQRFFYAmmg340unaDXJ94Tnt3e7auigd8mCm6l/hU72sUFKmeOvktjOYWYeKVO0XCrbfUZJQ86PY7vt3linvcfmhDcHHv+t1W5cT7lAfVVH3s7Uzg3s3LWS+j3NSK+oD8pu2CgLGuw70ySLS4BwvMuo5bcDkqr5WGwewD+r4vMIpZ5Y17OhUepXbVqEQ2Y9XY5H6xnqjhj9jmCLEwBpKKSZa2h0VwIDAQAB',
    name: 'Focus (working name)',
    description: 'Block distractions, earn credit for focused work.',
    permissions: [
      'storage',
      'alarms',
      'tabs',
      'idle',
      'declarativeNetRequest',
      'identity', // launchWebAuthFlow for Google sign-in
      'scripting', // inject the presence overlay into tabs opened before the extension loaded
    ],
    // Needed so DNR can redirect arbitrary sites to our block page.
    host_permissions: ['<all_urls>'],
    web_accessible_resources: [
      { resources: ['blocked.html'], matches: ['<all_urls>'] },
    ],
  },
});
