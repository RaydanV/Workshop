// AccessMed background service worker.
// Owns default settings and routes keyboard shortcuts to the active tab.

const DEFAULTS = {
  autoFix: true,
  highContrast: false,
  fontScale: 1,
  dyslexiaFont: false,
  plainLanguage: false,
  plainLanguageLang: "auto", // "auto" follows the page's lang="", or a code like "es"
  aiRewrite: false, // on-device AI summaries; the popup turns it on after the model is ready
  readingRuler: false,
  timeoutGuard: true,
  keyboardNav: true,
  panicButton: true,
  emergencyNumber: "911",
  speechRate: 0.9
};

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(null);
  // Only fill missing keys so upgrades never wipe user preferences.
  const missing = Object.fromEntries(
    Object.entries(DEFAULTS).filter(([k]) => !(k in stored))
  );
  if (Object.keys(missing).length) await chrome.storage.sync.set(missing);
});

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // Content scripts cannot run on chrome:// or store pages; ignore quietly.
  }
}

chrome.commands.onCommand.addListener((command) => {
  const map = {
    "toggle-ruler": { type: "TOGGLE_SETTING", key: "readingRuler" },
    "toggle-voice": { type: "TOGGLE_VOICE" },
    panic: { type: "PANIC" }
  };
  if (map[command]) sendToActiveTab(map[command]);
});

// Content scripts ask for defaults on first load in case onInstalled has not run.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_DEFAULTS") {
    sendResponse(DEFAULTS);
  }
});
