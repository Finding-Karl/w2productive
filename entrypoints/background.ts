export default defineBackground(() => {
  // MV3: this worker is killed after ~30s idle. Keep no state in module scope;
  // every listener must re-read what it needs from chrome.storage.
  browser.runtime.onInstalled.addListener(({ reason }) => {
    console.log('[focus] installed:', reason);
  });

  browser.runtime.onStartup.addListener(() => {
    console.log('[focus] browser startup');
  });
});
