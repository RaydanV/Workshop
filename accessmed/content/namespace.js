// Shared namespace for all AccessMed content-script modules.
// Classic scripts (not ES modules) are used because MV3 content_scripts
// cannot be declared as modules.
window.AccessMed = window.AccessMed || {
  settings: {},
  modules: {},
  // Speak text with the Web Speech API. Used by TTS, voice feedback and panic mode.
  // Long text is queued as short sentence-sized utterances (see speech-chunks.js)
  // because Chrome tends to go silent partway through one long utterance.
  // speechSynthesis.cancel() clears the whole queue, so stopping still works.
  speak(text, { interrupt = true } = {}) {
    if (!("speechSynthesis" in window) || !text) return;
    if (interrupt) speechSynthesis.cancel();
    const split = window.AccessMedSpeech?.splitIntoChunks;
    const chunks = split ? split(text, { locale: document.documentElement.lang || undefined }) : [text];
    const rate = window.AccessMed.settings.speechRate || 0.9;
    for (const chunk of chunks) {
      const u = new SpeechSynthesisUtterance(chunk);
      u.rate = rate;
      speechSynthesis.speak(u);
    }
  },
  // Polite live region so status updates reach screen-reader users too.
  announce(text) {
    let region = document.getElementById("accessmed-live");
    if (!region) {
      region = document.createElement("div");
      region.id = "accessmed-live";
      region.className = "accessmed-sr-only";
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      document.body.appendChild(region);
    }
    region.textContent = "";
    setTimeout(() => (region.textContent = text), 50);
  },
  isOwnNode(el) {
    return !!el?.closest?.("[data-accessmed-ui]");
  }
};
