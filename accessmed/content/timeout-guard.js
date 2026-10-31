// Neutralizes strict inactivity timeouts (WCAG 2.2.1 "Timing Adjustable").
// Strategy, in order of preference:
//   1. Auto-press the portal's own "Stay signed in / Continue / Extend" button
//      when a timeout warning dialog appears.
//   2. Send gentle synthetic activity events so client-side idle timers reset.
//   3. Warn the user with speech + a banner before a detected timer fires,
//      and autosave form drafts locally so typed text is never lost.
(() => {
  const AM = window.AccessMed;
  const EXTEND_TEXT = /(stay (signed|logged) in|keep (me )?(signed|logged) in|continue (session|working)?|extend( session)?|i'?m still here|keep working|yes,? continue|remain logged)/i;
  const WARNING_TEXT = /(session (will )?(expire|time ?out|end)|you will be (signed|logged) out|inactiv|are you still there|time ?out warning)/i;
  let heartbeat = null, observer = null, enabled = false, extendedCount = 0;

  function findExtendButton(root) {
    return [...root.querySelectorAll("button, a, [role=button], input[type=button], input[type=submit]")]
      .find((b) => !AM.isOwnNode(b) && EXTEND_TEXT.test(b.innerText || b.value || b.getAttribute("aria-label") || ""));
  }

  function scanForWarning() {
    const dialogs = document.querySelectorAll('[role=dialog], [role=alertdialog], dialog[open], .modal, [class*=timeout], [id*=timeout], [class*=session]');
    for (const d of dialogs) {
      if (AM.isOwnNode(d) || d.getClientRects().length === 0) continue; // skip hidden dialogs
      if (!WARNING_TEXT.test(d.innerText || "")) continue;
      const btn = findExtendButton(d);
      if (btn) {
        btn.click();
        extendedCount++;
        AM.announce("AccessMed kept your session open.");
        banner("Your session was about to time out. AccessMed kept it open for you.");
      }
    }
  }

  function pulseActivity() {
    // Most portals reset idle timers on these events. Dispatched on document
    // only, at the user's last known position, so nothing on the page is clicked.
    for (const type of ["mousemove", "keydown", "scroll"]) {
      document.dispatchEvent(new Event(type, { bubbles: true }));
    }
  }

  function banner(text) {
    let el = document.getElementById("accessmed-timeout-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "accessmed-timeout-banner";
      el.setAttribute("data-accessmed-ui", "");
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.hidden = true), 8000);
  }

  // Draft autosave: restores typed text after an unavoidable server logout.
  const draftKey = (el) => `accessmed-draft:${location.pathname}:${el.name || el.id}`;
  function onInput(e) {
    const el = e.target;
    if (!(el.matches?.("textarea, input[type=text], input:not([type])")) || !(el.name || el.id)) return;
    if (/pass|card|ssn|cvv|social/i.test(el.name + el.id + el.autocomplete)) return; // never store secrets
    sessionStorage.setItem(draftKey(el), el.value);
  }
  function restoreDrafts() {
    document.querySelectorAll("textarea, input[type=text], input:not([type])").forEach((el) => {
      if (!(el.name || el.id) || el.value) return;
      const saved = sessionStorage.getItem(draftKey(el));
      if (saved) { el.value = saved; el.classList.add("accessmed-restored"); }
    });
  }

  function onPageMessage(e) {
    if (e.source !== window || e.data?.__accessmed !== "TIMEOUT_DETECTED") return;
    scheduleWarning(e.data);
  }

  let lastScheduled = 0;
  function scheduleWarning(info) {
    if (!info || info.at === lastScheduled) return;
    lastScheduled = info.at;
    const minutes = Math.max(1, Math.round(info.delay / 60000));
    const remaining = info.delay - (Date.now() - info.at);
    if (remaining <= 0) return;
    const warnAt = Math.max(0, remaining - 60000);
    setTimeout(() => {
      if (!enabled) return;
      AM.speak("Heads up. This page may sign you out soon. AccessMed is keeping it active.");
      banner(`This page has a ${minutes}-minute inactivity timer. AccessMed is keeping your session active.`);
      pulseActivity();
    }, warnAt);
  }
  window.addEventListener("message", onPageMessage);

  function enable() {
    if (enabled) return;
    enabled = true;
    heartbeat = setInterval(pulseActivity, 45 * 1000);
    let queued = false;
    observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      setTimeout(() => { queued = false; scanForWarning(); }, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "open", "hidden"] });
    document.addEventListener("input", onInput, true);
    restoreDrafts();
    scanForWarning();
    // Pick up timers the page created before this script loaded.
    try { scheduleWarning(JSON.parse(document.documentElement.getAttribute("data-accessmed-timeout"))); } catch {}
  }

  function disable() {
    enabled = false;
    clearInterval(heartbeat);
    observer?.disconnect();
    document.removeEventListener("input", onInput, true);
  }

  AM.modules.timeout = { enable, disable, set: (on) => (on ? enable() : disable()), stats: () => ({ extendedCount }) };
})();
