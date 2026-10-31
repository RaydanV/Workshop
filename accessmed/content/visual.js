// Visual aids: high contrast, font scaling, dyslexia-friendly spacing, text-to-speech.
(() => {
  const AM = window.AccessMed;
  const root = document.documentElement;

  function apply(settings) {
    root.classList.toggle("accessmed-high-contrast", !!settings.highContrast);
    root.classList.toggle("accessmed-dyslexia", !!settings.dyslexiaFont);
    const scale = Number(settings.fontScale) || 1;
    root.classList.toggle("accessmed-scaled", scale !== 1);
    root.style.setProperty("--accessmed-scale", scale);
    scaleFonts(scale);
  }

  // Many portals hard-code px font sizes, so CSS zoom of the root alone
  // does not work. Record each element's original size once, then scale it.
  function scaleFonts(scale) {
    const els = [...document.body.querySelectorAll("p, li, td, th, label, span, a, button, h1, h2, h3, h4, h5, h6, input, select, textarea, div, dt, dd, caption, legend")]
      .filter((el) => !AM.isOwnNode(el));
    // Pass 1: record every original size BEFORE changing anything. Otherwise a
    // child inherits its already-scaled parent's size and the scale compounds.
    if (scale !== 1) {
      for (const el of els) {
        if (!el.dataset.accessmedFont) el.dataset.accessmedFont = parseFloat(getComputedStyle(el).fontSize);
      }
    }
    // Pass 2: apply (or remove) the scaled sizes.
    for (const el of els) {
      if (!el.dataset.accessmedFont) continue;
      if (scale === 1) {
        el.style.fontSize = "";
        delete el.dataset.accessmedFont;
      } else {
        el.style.fontSize = `${Math.round(parseFloat(el.dataset.accessmedFont) * scale * 10) / 10}px`;
      }
    }
  }

  // Read the user's selection, or the content of the focused / main region.
  function readAloud() {
    const selection = String(window.getSelection() || "").trim();
    if (selection) return AM.speak(selection);
    const target = document.activeElement && document.activeElement !== document.body
      ? document.activeElement
      : document.querySelector("main, [role=main], article") || document.body;
    // Hide AI summary boxes while reading innerText (it skips hidden elements),
    // so each passage isn't read twice. Nothing is painted in between.
    const panels = AM.isOwnNode(target) ? [] : [...document.querySelectorAll(".accessmed-ai-panel:not([hidden])")];
    panels.forEach((p) => (p.hidden = true));
    const text = target.innerText || "";
    panels.forEach((p) => (p.hidden = false));
    AM.speak(text);
  }

  function stopReading() {
    speechSynthesis?.cancel();
  }

  // Hover-to-hear: hold Alt and hover any element to hear it read.
  document.addEventListener("mouseover", (e) => {
    if (!e.altKey || AM.isOwnNode(e.target)) return;
    const text = AM.modules.fixer?.accessibleName(e.target) || e.target.innerText;
    if (text) AM.speak(text.slice(0, 500));
  });

  AM.modules.visual = { apply, readAloud, stopReading };
})();
