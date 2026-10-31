// On-device AI plain-language summaries (Chrome's built-in Prompt API).
// When on, each hard paragraph gets a labelled "simpler version" box underneath.
// The portal's own text is never changed, and any rewrite whose numbers, doses
// or dates don't match the original is thrown away (see ai-core.js).
(() => {
  const AM = window.AccessMed;
  const core = window.AccessMedAI;
  const supported = typeof LanguageModel !== "undefined";

  const BLOCKS = "p, li, dd, blockquote";
  const SKIP_INSIDE = "nav, header, footer, form, table, [contenteditable], [aria-hidden=true], [data-accessmed-ui]";
  const MIN_CHARS = 80;
  const MAX_CHARS = 1500;
  const TIMEOUT_MS = 30000;

  let on = false;
  let blocked = ""; // "downloadable" | "downloading" | "unavailable" when the model can't be used yet
  let controller = null;
  let observer = null;
  let running = false;
  const queue = [];
  const visible = new Set();
  const cache = new Map(); // `${lang}\n${text}` -> rewrite, or null if it failed the check. Memory only.
  let sessions = {}; // lang -> Promise<LanguageModel session | null>
  const counts = { done: 0, rejected: 0 };

  function languageFor(el) {
    const plain = AM.modules.plain;
    const chosen = AM.settings.plainLanguageLang;
    const lang = chosen && chosen !== "auto" ? plain.resolveLanguage(chosen) : plain.languageOf(el);
    return lang && core.STRINGS[lang] ? lang : null;
  }

  // The portal's real wording: glossary swaps undone, AccessMed UI removed.
  function originalText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(".accessmed-term").forEach((s) => s.replaceWith(s.dataset.original));
    clone.querySelectorAll("[data-accessmed-ui]").forEach((n) => n.remove());
    return clone.textContent.replace(/\s+/g, " ").trim();
  }

  function candidates(root = document.body) {
    return [...root.querySelectorAll(BLOCKS)].filter((el) =>
      !el.dataset.accessmedAi &&
      !el.closest(SKIP_INSIDE) &&
      !el.querySelector(BLOCKS) && // prefer the innermost block
      el.getClientRects().length > 0 // skip hidden elements
    );
  }

  async function availability(lang) {
    try {
      const io = [{ type: "text", languages: [lang] }];
      return core.normalizeAvailability(await LanguageModel.availability({ expectedInputs: io, expectedOutputs: io }));
    } catch {
      return "unavailable";
    }
  }

  // One base session per language. Never triggers a download: that needs a
  // user click, and only the popup asks for it.
  function session(lang) {
    if (!sessions[lang]) {
      const signal = controller.signal;
      const pending = (async () => {
        const state = await availability(lang);
        if (state !== "available") { blocked = state; return null; }
        const io = [{ type: "text", languages: [lang] }];
        return LanguageModel.create({
          initialPrompts: [{ role: "system", content: core.systemPrompt(lang) }],
          expectedInputs: io,
          expectedOutputs: io,
          temperature: 0.2,
          topK: 3,
          signal
        });
      })().catch(() => null).then((s) => {
        // Don't cache a failure: the model may be ready on the next scan.
        if (!s && sessions[lang] === pending) delete sessions[lang];
        return s;
      });
      sessions[lang] = pending;
    }
    return sessions[lang];
  }

  async function rewrite(text, lang, signal) {
    const base = await session(lang);
    if (!base) return undefined; // model not ready: leave the paragraph for a later scan
    const s = await base.clone({ signal }); // fresh context per paragraph
    try {
      const raw = await s.prompt(core.userPrompt(text, lang), {
        responseConstraint: core.RESPONSE_SCHEMA,
        signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
      });
      const out = core.parseResponse(raw);
      return core.checkRewrite(text, out).ok ? out : null;
    } finally {
      s.destroy();
    }
  }

  function addPanel(el, text, lang) {
    const S = core.STRINGS[lang];
    const panel = document.createElement("aside");
    panel.dataset.accessmedUi = "";
    panel.className = "accessmed-ai-panel";
    panel.setAttribute("role", "note");
    panel.setAttribute("aria-label", S.region);
    panel.lang = lang;

    const label = document.createElement("div");
    label.className = "accessmed-ai-label";
    const badge = document.createElement("span");
    badge.className = "accessmed-ai-badge";
    badge.textContent = S.badge;
    badge.setAttribute("aria-hidden", "true");
    label.append(badge, " ", S.notice);

    const body = document.createElement("div");
    body.className = "accessmed-ai-text";
    body.textContent = text;

    const actions = document.createElement("div");
    actions.className = "accessmed-ai-actions";
    const read = document.createElement("button");
    read.type = "button";
    read.textContent = `🔊 ${S.read}`;
    read.addEventListener("click", () => AM.speak(text));
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = S.hide;
    toggle.setAttribute("aria-expanded", "true");
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? S.hide : S.show;
      label.hidden = body.hidden = read.hidden = !open;
    });
    actions.append(read, toggle);
    panel.append(label, body, actions);

    // A list item can only hold content inside itself; paragraphs get the box after them.
    if (el.matches("li, dd")) el.append(panel); else el.after(panel);
  }

  async function processOne(el, signal) {
    if (!el.isConnected) return;
    const lang = languageFor(el);
    const text = originalText(el);
    if (!lang || text.length < MIN_CHARS || text.length > MAX_CHARS) {
      el.dataset.accessmedAi = "skipped";
      return;
    }
    const key = `${lang}\n${text}`;
    let result = cache.get(key);
    if (result === undefined) {
      try {
        result = await rewrite(text, lang, signal);
      } catch {
        if (signal.aborted) return;
        result = null; // error or timeout: count it, but allow a retry on a later visit
        el.dataset.accessmedAi = "rejected";
        counts.rejected++;
        return;
      }
      if (result === undefined) { delete el.dataset.accessmedAi; return; } // model not ready
      cache.set(key, result);
    }
    if (signal.aborted || !on) return;
    if (!result) {
      el.dataset.accessmedAi = "rejected";
      counts.rejected++;
      return;
    }
    addPanel(el, result, lang);
    el.dataset.accessmedAi = "done";
    counts.done++;
  }

  // One paragraph at a time (the model runs locally), visible ones first.
  async function pump() {
    if (running) return;
    running = true;
    try {
      while (on && queue.length && !blocked) {
        let i = queue.findIndex((el) => visible.has(el));
        if (i < 0) i = 0;
        const [el] = queue.splice(i, 1);
        observer?.unobserve(el);
        visible.delete(el);
        await processOne(el, controller.signal);
      }
    } finally {
      running = false;
    }
    if (blocked) for (const el of queue.splice(0)) { delete el.dataset.accessmedAi; observer?.unobserve(el); }
  }

  function scan(root = document.body) {
    if (!on || !supported) return;
    blocked = "";
    for (const el of candidates(root)) {
      el.dataset.accessmedAi = "queued";
      queue.push(el);
      observer.observe(el);
    }
    pump();
  }

  function set(value) {
    value = !!value && supported;
    if (value === on) return;
    on = value;
    if (on) {
      controller = new AbortController();
      blocked = "";
      observer = new IntersectionObserver((entries) => {
        for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
      }, { rootMargin: "300px" });
      scan();
      return;
    }
    controller?.abort();
    observer?.disconnect();
    observer = null;
    queue.length = 0;
    visible.clear();
    document.querySelectorAll(".accessmed-ai-panel").forEach((p) => p.remove());
    document.querySelectorAll("[data-accessmed-ai]").forEach((el) => delete el.dataset.accessmedAi);
    const old = sessions;
    sessions = {};
    Object.values(old).forEach((p) => p.then((s) => s?.destroy()).catch(() => {}));
    counts.done = counts.rejected = 0;
    blocked = "";
  }

  // Re-run from scratch, e.g. after the plain-language language changes.
  function refresh() {
    if (!on) return;
    set(false);
    set(true);
  }

  function stats() {
    return {
      supported,
      on,
      blocked,
      working: running || queue.length > 0,
      pending: queue.length,
      done: counts.done,
      rejected: counts.rejected
    };
  }

  AM.modules.ai = { set, scan, refresh, stats };
})();
