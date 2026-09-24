import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Focus (working name)',
    description: 'Block distractions, earn credit for focused work.',
    permissions: [
      'storage',
      'alarms',
      'tabs',
      'idle',
      'declarativeNetRequest',
    ],
    // Needed so DNR can redirect arbitrary sites to our block page.
    host_permissions: ['<all_urls>'],
    web_accessible_resources: [
      { resources: ['blocked.html'], matches: ['<all_urls>'] },
    ],
  },
});
