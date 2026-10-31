// Emergency "Help me" button. One press opens a calm, high-contrast help screen
// with voice guidance. From there the user is one press from calling for help.
(() => {
  const AM = window.AccessMed;
  let fab, dialog, lastFocus, maximized = false;

  function createFab() {
    if (fab) return fab;
    fab = document.createElement("button");
    fab.type = "button";
    fab.id = "accessmed-panic-fab";
    fab.setAttribute("data-accessmed-ui", "");
    fab.setAttribute("aria-label", "Help me. Opens emergency and calm-down options.");
    fab.innerHTML = '<span aria-hidden="true">🆘</span> Help me';
    fab.addEventListener("click", open);
    document.body.appendChild(fab);
    return fab;
  }

  function createDialog() {
    const num = AM.settings.emergencyNumber || "911";
    const care = AM.settings.careTeamNumber;
    const d = document.createElement("div");
    d.id = "accessmed-panic";
    d.setAttribute("data-accessmed-ui", "");
    d.setAttribute("role", "alertdialog");
    d.setAttribute("aria-modal", "true");
    d.setAttribute("aria-labelledby", "accessmed-panic-title");
    d.setAttribute("aria-describedby", "accessmed-panic-desc");
    d.innerHTML = `
      <div class="accessmed-panic-card">
        <h2 id="accessmed-panic-title">You are safe. Let's take this one step at a time.</h2>
        <p id="accessmed-panic-desc">Choose what you need. Press Escape to close.</p>
        <div class="accessmed-panic-actions">
          <a class="accessmed-panic-btn accessmed-call" href="tel:${encodeURIComponent(num)}" data-action="call">📞 Call ${num} now</a>
          ${care ? `<a class="accessmed-panic-btn" href="tel:${encodeURIComponent(care)}" data-action="care">👩‍⚕️ Call my care team</a>` : ""}
          <button type="button" class="accessmed-panic-btn" data-action="bigger">🔍 Make everything bigger</button>
          <button type="button" class="accessmed-panic-btn" data-action="read">🔊 Read this page to me</button>
          <button type="button" class="accessmed-panic-btn" data-action="breathe">🫁 Breathe with me</button>
          <button type="button" class="accessmed-panic-btn accessmed-quiet" data-action="close">I'm OK, close this</button>
        </div>
        <p class="accessmed-panic-note">If this is a medical emergency, call ${num}. This portal is not monitored in real time.</p>
      </div>`;
    d.addEventListener("click", onAction);
    d.addEventListener("keydown", trapFocus);
    document.body.appendChild(d);
    return d;
  }

  function onAction(e) {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "call") AM.speak(`Calling ${AM.settings.emergencyNumber || "911"}. Stay on the line.`);
    if (action === "bigger") maximize();
    if (action === "read") { close(); AM.modules.visual.readAloud(); }
    if (action === "breathe") breathe();
    if (action === "close") close();
  }

  // Maximum readability preset. Not persisted, so a page reload returns to normal.
  function maximize() {
    maximized = true;
    AM.updateSetting("fontScale", 2, { persist: false });
    AM.updateSetting("highContrast", true, { persist: false });
    AM.speak("I made the text as big as it goes, with high contrast. You can close this screen when you are ready.");
  }

  function breathe() {
    const steps = ["Breathe in slowly... two, three, four.", "Hold... two, three, four.", "Breathe out slowly... two, three, four, five, six."];
    speechSynthesis.cancel();
    for (let round = 0; round < 3; round++) for (const s of steps) {
      const u = new SpeechSynthesisUtterance(s);
      u.rate = 0.75;
      speechSynthesis.speak(u);
    }
  }

  function trapFocus(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const items = [...dialog.querySelectorAll("a, button")];
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open() {
    lastFocus = document.activeElement;
    dialog?.remove();
    dialog = createDialog();
    document.documentElement.classList.add("accessmed-panic-open");
    dialog.querySelector(".accessmed-call").focus();
    AM.speak(
      `You are safe. Take a slow breath. To call ${AM.settings.emergencyNumber || "911"}, press Enter now. ` +
      "Or press Tab to hear other choices: make everything bigger, read this page to me, or breathe with me."
    );
    AM.modules.timeout?.enable(); // never let a session expire while someone is in distress
  }

  function close() {
    if (!dialog) return;
    dialog.remove();
    dialog = null;
    document.documentElement.classList.remove("accessmed-panic-open");
    // Keep the bigger text if the user asked for it; just tell them how to undo it.
    if (maximized) AM.announce("Help screen closed. Text stays large until you reload or change it in AccessMed.");
    lastFocus?.focus?.();
  }

  function set(on) {
    createFab().hidden = !on;
  }

  AM.modules.panic = { open, close, set, maximize };
})();
