// AccessMed content-script orchestrator: loads settings, applies modules,
// and answers messages from the popup and background worker.
(async () => {
  const AM = window.AccessMed;
  const M = AM.modules;
  if (window.top !== window) return; // run once per tab, not in every ad iframe

  const stored = await chrome.storage.sync.get(null);
  const defaults = Object.keys(stored).length ? {} : await chrome.runtime.sendMessage({ type: "GET_DEFAULTS" }).catch(() => ({}));
  AM.settings = { ...defaults, ...stored };

  function applyAll(changedKey) {
    const s = AM.settings;
    const all = !changedKey;
    if (all || ["highContrast", "fontScale", "dyslexiaFont"].includes(changedKey)) M.visual.apply(s);
    if (all || changedKey === "readingRuler") M.ruler.set(!!s.readingRuler);
    if (all || changedKey === "timeoutGuard") M.timeout.set(s.timeoutGuard !== false);
    if (all || changedKey === "panicButton") M.panic.set(s.panicButton !== false);
    if (all || changedKey === "plainLanguage") {
      if (s.plainLanguage) M.plain.applyToDom(document.body, s.plainLanguageLang); else if (!all) M.plain.revertDom();
    }
    if (changedKey === "plainLanguageLang" && s.plainLanguage) {
      M.plain.revertDom();
      M.plain.applyToDom(document.body, s.plainLanguageLang);
    }
    if (all || changedKey === "aiRewrite") M.ai.set(!!s.aiRewrite);
    if (changedKey === "plainLanguageLang") M.ai.refresh();
    if (all && s.autoFix !== false) { M.fixer.run(); M.fixer.watch(); }
    if (all && s.keyboardNav !== false) M.keyboard.run();
  }

  // Settings changed from voice commands or panic mode.
  AM.updateSetting = (key, value, { persist = true } = {}) => {
    AM.settings[key] = value;
    applyAll(key);
    if (persist) chrome.storage.sync.set({ [key]: value });
  };
  AM.adjustFont = (delta) => {
    const next = Math.min(2, Math.max(0.8, (Number(AM.settings.fontScale) || 1) + delta));
    AM.updateSetting("fontScale", Math.round(next * 100) / 100);
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (AM.settings[key] === newValue) continue;
      AM.settings[key] = newValue;
      applyAll(key);
    }
  });

  // Re-run plain language and keyboard fixes on content rendered later (SPAs).
  let pending = false;
  new MutationObserver((records) => {
    if (pending || records.every((r) => [...r.addedNodes].every((n) => n.nodeType !== 1 || AM.isOwnNode(n)))) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      if (AM.settings.plainLanguage) M.plain.applyToDom(document.body, AM.settings.plainLanguageLang);
      if (AM.settings.aiRewrite) M.ai.scan();
      if (AM.settings.keyboardNav !== false) M.keyboard.run();
      if (AM.settings.fontScale && AM.settings.fontScale !== 1) M.visual.apply(AM.settings);
    }, 400);
  }).observe(document.body, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg?.type) {
      case "GET_STATUS":
        sendResponse({
          audit: M.fixer.summary(),
          voiceSupported: M.voice.supported,
          voiceListening: M.voice.isListening(),
          timeout: M.timeout.stats(),
          ai: M.ai.stats(),
          pageLang: document.documentElement.getAttribute("lang") || navigator.language || ""
        });
        break;
      case "RUN_AUDIT":
        sendResponse(M.fixer.run());
        break;
      case "PARSE_BILL":
        sendResponse(M.billing.parse(document));
        break;
      case "TOGGLE_SETTING":
        AM.updateSetting(msg.key, !AM.settings[msg.key]);
        sendResponse(AM.settings[msg.key]);
        break;
      case "TOGGLE_VOICE":
        sendResponse(M.voice.toggle());
        break;
      case "VOICE_COMMAND": // typed fallback (Firefox, no mic) and tests
        sendResponse(M.voice.handle(msg.text || ""));
        break;
      case "READ_ALOUD":
        M.visual.readAloud();
        sendResponse(true);
        break;
      case "STOP_READING":
        M.visual.stopReading();
        sendResponse(true);
        break;
      case "PANIC":
        M.panic.open();
        sendResponse(true);
        break;
    }
  });

  applyAll();
})();
