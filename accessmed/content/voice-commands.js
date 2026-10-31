// Hands-free navigation with the Web Speech API.
// Chrome / Edge support webkitSpeechRecognition. Firefox does not yet, so the
// module reports "unsupported" and the popup hides the control.
(() => {
  const AM = window.AccessMed;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false, badge = null;

  // Section keywords map spoken words to likely portal headings and links.
  const SECTION_SYNONYMS = {
    messages: ["message", "messages", "inbox", "mail"],
    appointments: ["appointment", "appointments", "visits", "schedule"],
    prescriptions: ["prescription", "prescriptions", "medications", "medicine", "meds", "pharmacy"],
    "lab results": ["lab", "labs", "lab results", "test results", "results"],
    billing: ["bill", "billing", "payments", "statement", "balance"]
  };

  function textOf(el) {
    return (AM.modules.fixer?.accessibleName(el) || el.innerText || "").toLowerCase().trim();
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }

  function wordsFor(target) {
    for (const [, list] of Object.entries(SECTION_SYNONYMS)) if (list.includes(target)) return list;
    return [target];
  }

  // Find the best clickable control whose name contains the spoken words.
  function findClickable(target) {
    const candidates = [...document.querySelectorAll('a, button, [role=button], [role=tab], [role=menuitem], input[type=submit], summary')]
      .filter((el) => visible(el) && !AM.isOwnNode(el));
    const words = wordsFor(target);
    let best = null, bestScore = 0;
    for (const el of candidates) {
      const name = textOf(el);
      if (!name) continue;
      for (const w of words) {
        if (!name.includes(w)) continue;
        const score = (name === w ? 3 : 1) + w.length / (name.length + 1);
        if (score > bestScore) { best = el; bestScore = score; }
      }
    }
    return best;
  }

  // Find a section (heading + following content, or a region) matching the words.
  function findSection(target) {
    const words = wordsFor(target.replace(/\bsummary\b/, "").trim());
    const regions = [...document.querySelectorAll("h1, h2, h3, h4, [role=region][aria-label], section[aria-label], caption, legend")];
    const hit = regions.find((el) => words.some((w) => textOf(el).includes(w)));
    if (!hit) return null;
    return hit.closest("section, article, [role=region], table, fieldset, .card") || hit.parentElement;
  }

  const COMMANDS = [
    { re: /^(scroll )?down$|^page down$/, run: () => scrollBy({ top: innerHeight * 0.8, behavior: "smooth" }), say: "Scrolling down" },
    { re: /^(scroll )?up$|^page up$/, run: () => scrollBy({ top: -innerHeight * 0.8, behavior: "smooth" }), say: "Scrolling up" },
    { re: /^(go to )?(top|start)$/, run: () => scrollTo({ top: 0, behavior: "smooth" }), say: "Top of page" },
    { re: /^(go to )?bottom$/, run: () => scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), say: "Bottom of page" },
    { re: /^go back$/, run: () => history.back(), say: "Going back" },
    {
      re: /^(click|open|press|select|go to|show) (.+)$/,
      run: (m) => {
        const el = findClickable(m[2]);
        if (!el) return `I could not find ${m[2]}`;
        el.focus();
        el.click();
        return `Opening ${textOf(el) || m[2]}`;
      }
    },
    {
      re: /^read (.+)$/,
      run: (m) => {
        if (/^(this|page|everything)$/.test(m[1])) { AM.modules.visual.readAloud(); return null; }
        const sec = findSection(m[1]);
        if (!sec) return `I could not find ${m[1]}`;
        sec.scrollIntoView({ behavior: "smooth", block: "center" });
        let text = sec.innerText;
        if (AM.settings.plainLanguage) {
          const chosen = AM.settings.plainLanguageLang;
          const lang = chosen && chosen !== "auto" ? chosen : AM.modules.plain.languageOf(sec);
          if (lang) text = AM.modules.plain.simplifyText(text, lang);
        }
        AM.speak(text);
        return { silent: `Reading ${m[1]}` };
      }
    },
    { re: /^(stop|quiet|stop reading)$/, run: () => speechSynthesis.cancel(), say: null },
    { re: /^(bigger|larger|zoom in)( text)?$/, run: () => AM.adjustFont(+0.25), say: "Text larger" },
    { re: /^(smaller|zoom out)( text)?$/, run: () => AM.adjustFont(-0.25), say: "Text smaller" },
    { re: /^(plain language|simplify)( on)?$/, run: () => AM.updateSetting("plainLanguage", true), say: "Plain language on" },
    { re: /^(reading )?ruler( on)?$/, run: () => AM.updateSetting("readingRuler", true), say: "Ruler on" },
    { re: /^(help me|i need help|panic|emergency)$/, run: () => AM.modules.panic.open(), say: null },
    { re: /^(stop listening|voice off)$/, run: () => stop(), say: "Voice control off" },
    { re: /^(what can i say|help|commands)$/, run: () => "You can say: scroll down, click messages, read prescription summary, bigger text, plain language, or help me.", say: null }
  ];

  function handle(transcript) {
    const phrase = transcript.toLowerCase().replace(/[.,!?]/g, "").trim();
    if (listening) showBadge(`Heard: "${phrase}"`);
    for (const cmd of COMMANDS) {
      const m = phrase.match(cmd.re);
      if (!m) continue;
      const result = cmd.run(m);
      if (result?.silent) return result.silent; // already speaking content
      const feedback = typeof result === "string" ? result : cmd.say;
      if (feedback) { AM.speak(feedback); AM.announce(feedback); }
      return feedback || "OK";
    }
    const sorry = "Sorry, I did not understand. Say: what can I say.";
    AM.speak(sorry);
    return sorry;
  }

  function showBadge(text) {
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "accessmed-voice-badge";
      badge.setAttribute("data-accessmed-ui", "");
      badge.setAttribute("role", "status");
      document.body.appendChild(badge);
    }
    badge.hidden = !listening;
    badge.textContent = `🎤 ${text}`;
  }

  function start() {
    if (!Recognition) {
      AM.speak("Voice commands are not supported in this browser.");
      return false;
    }
    if (listening) return true;
    rec = new Recognition();
    rec.lang = document.documentElement.lang || "en-US";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      if (last.isFinal) handle(last[0].transcript);
    };
    // Chrome ends sessions after silence; restart while the user wants it on.
    rec.onend = () => { if (listening) try { rec.start(); } catch {} };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        listening = false;
        AM.speak("Microphone permission was denied.");
        showBadge("Microphone blocked");
      }
    };
    listening = true;
    rec.start();
    showBadge("Listening… say “what can I say”");
    AM.speak("Voice control on");
    return true;
  }

  function stop() {
    listening = false;
    rec?.stop();
    if (badge) badge.hidden = true;
  }

  AM.modules.voice = {
    supported: !!Recognition,
    start, stop, handle,
    toggle: () => (listening ? (stop(), false) : start()),
    isListening: () => listening
  };
})();
