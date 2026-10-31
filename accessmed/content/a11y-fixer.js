// Detects common WCAG failures on patient portals and repairs them in place.
// Every fix is tagged with data-accessmed-fixed so it can be reported and undone.
(() => {
  const AM = window.AccessMed;

  // Icon-name hints frequently found in class names, icon fonts and SVG ids.
  const ICON_HINTS = {
    mail: "Messages", envelope: "Messages", message: "Messages", inbox: "Messages",
    calendar: "Appointments", appointment: "Appointments", schedule: "Schedule",
    pill: "Medications", rx: "Prescriptions", prescription: "Prescriptions", medication: "Medications",
    flask: "Lab results", lab: "Lab results", test: "Test results",
    bill: "Billing", dollar: "Billing", payment: "Payments", invoice: "Billing", wallet: "Payments",
    user: "Profile", profile: "Profile", account: "Account", gear: "Settings", cog: "Settings", settings: "Settings",
    search: "Search", magnify: "Search", bell: "Notifications", notification: "Notifications",
    home: "Home", menu: "Menu", hamburger: "Menu", bars: "Menu", close: "Close", times: "Close",
    x: "Close", logout: "Sign out", signout: "Sign out", download: "Download", print: "Print",
    phone: "Call", video: "Video visit", chat: "Chat", help: "Help", question: "Help",
    edit: "Edit", pencil: "Edit", trash: "Delete", delete: "Delete", plus: "Add", add: "Add",
    next: "Next", prev: "Previous", back: "Back", forward: "Forward", left: "Previous", right: "Next",
    chevron: "Expand", caret: "Expand", arrow: "Go", heart: "Health summary", file: "Documents", doc: "Documents"
  };

  const issues = [];

  function accessibleName(el) {
    if (el.getAttribute("aria-label")?.trim()) return el.getAttribute("aria-label").trim();
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const text = labelledby.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ").trim();
      if (text) return text;
    }
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab?.textContent.trim()) return lab.textContent.trim();
    }
    if (el.closest("label")?.textContent.trim()) return el.closest("label").textContent.trim();
    const text = (el.innerText || el.textContent || "").trim();
    if (text) return text;
    const img = el.querySelector("img[alt]");
    if (img?.alt.trim()) return img.alt.trim();
    if (el.title?.trim()) return el.title.trim();
    if (el.placeholder?.trim()) return el.placeholder.trim();
    if (el.value && el.type && /submit|button|reset/.test(el.type)) return el.value;
    return "";
  }

  // Build a human label from class names, ids, hrefs, icon children and file names.
  function guessLabel(el) {
    const sources = [
      el.className?.baseVal ?? el.className,
      el.id,
      el.getAttribute("href"),
      el.getAttribute("data-icon"),
      el.getAttribute("name"),
      ...[...el.querySelectorAll("[class], svg use, img")].map(
        (c) => `${c.className?.baseVal ?? c.className ?? ""} ${c.getAttribute("href") || c.getAttribute("xlink:href") || ""} ${c.getAttribute("src") || ""}`
      )
    ].filter(Boolean).join(" ").toLowerCase();

    const tokens = sources.split(/[^a-z]+/).filter(Boolean);
    for (const t of tokens) if (ICON_HINTS[t]) return ICON_HINTS[t];
    // Fall back to partial matches like "icon-messages-24".
    for (const key of Object.keys(ICON_HINTS)) {
      if (key.length > 2 && sources.includes(key)) return ICON_HINTS[key];
    }
    return null;
  }

  function fileNameToAlt(src) {
    try {
      const name = new URL(src, location.href).pathname.split("/").pop() || "";
      const words = name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\d+/g, "").trim();
      return words.length > 2 ? words : "";
    } catch { return ""; }
  }

  function mark(el, kind, detail) {
    if (el.hasAttribute("data-accessmed-fixed")) return; // count each element once
    el.setAttribute("data-accessmed-fixed", kind);
    issues.push({ kind, detail });
  }

  function fixInteractive(root) {
    const selector = 'button, a[href], [role="button"], [role="menuitem"], [role="tab"], [onclick], input[type="button"], input[type="submit"], input[type="image"]';
    root.querySelectorAll(selector).forEach((el) => {
      if (AM.isOwnNode(el) || el.hasAttribute("data-accessmed-fixed")) return;
      if (accessibleName(el)) return;
      const label = guessLabel(el) || "Unlabeled control";
      el.setAttribute("aria-label", label);
      mark(el, "missing-label", label);
    });

    // Clickable divs/spans that are not keyboard reachable.
    root.querySelectorAll("div[onclick], span[onclick], [data-click], [role='button']:not(button)").forEach((el) => {
      if (AM.isOwnNode(el)) return;
      if (!el.hasAttribute("role")) el.setAttribute("role", "button");
      if (!el.hasAttribute("tabindex")) {
        el.tabIndex = 0;
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); }
        });
        mark(el, "not-focusable", accessibleName(el) || "clickable element");
      }
    });
  }

  function fixImages(root) {
    root.querySelectorAll("img:not([alt])").forEach((img) => {
      if (AM.isOwnNode(img)) return;
      const inControl = img.closest("a, button");
      const hint = guessLabel(img) || fileNameToAlt(img.currentSrc || img.src);
      // Tiny spacer images are decorative; meaningful ones get a best-guess alt.
      const decorative = (img.width && img.width < 4) || (!hint && !inControl);
      img.alt = decorative ? "" : hint || "Image";
      mark(img, decorative ? "decorative-image" : "missing-alt", img.alt || "(decorative)");
    });
  }

  // Walk backwards over sibling nodes (skipping <br> and whitespace) to find
  // visible text like "Reason<br><input>".
  function precedingText(el) {
    for (let n = el.previousSibling, hops = 0; n && hops < 4; n = n.previousSibling, hops++) {
      if (n.nodeType === 1 && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(n.tagName)) return "";
      const text = (n.textContent || "").trim();
      if (text) return text.slice(0, 80);
    }
    return "";
  }

  function fixFormFields(root) {
    root.querySelectorAll("input:not([type=hidden]):not([type=button]):not([type=submit]), select, textarea").forEach((el) => {
      if (AM.isOwnNode(el) || accessibleName(el)) return;
      // Look at the nearest preceding text, which is how sighted users read the form.
      const label = precedingText(el) || el.name?.replace(/[-_]/g, " ") || "Form field";
      el.setAttribute("aria-label", label);
      mark(el, "unlabeled-field", label);
    });
  }

  function fixLandmarksAndTables(root) {
    if (!document.querySelector("main, [role=main]")) {
      const guess = document.querySelector("#content, #main, .main, .content, [id*=content]");
      if (guess) { guess.setAttribute("role", "main"); mark(guess, "missing-landmark", "main"); }
    }
    root.querySelectorAll("table").forEach((t) => {
      if (AM.isOwnNode(t)) return;
      // Promote first-row <td>s to header cells so screen readers announce columns.
      if (!t.querySelector("th") && !t.hasAttribute("data-accessmed-fixed")) {
        const first = t.rows[0];
        if (first) {
          [...first.cells].forEach((c) => c.setAttribute("role", "columnheader"));
          mark(t, "table-headers", "promoted first row to headers");
        }
      }
    });
    if (!document.documentElement.lang) {
      document.documentElement.lang = navigator.language || "en";
      issues.push({ kind: "missing-lang", detail: document.documentElement.lang });
    }
  }

  function run(root = document.body) {
    fixInteractive(root);
    fixImages(root);
    fixFormFields(root);
    fixLandmarksAndTables(root);
    return summary();
  }

  function summary() {
    const counts = issues.reduce((acc, i) => ((acc[i.kind] = (acc[i.kind] || 0) + 1), acc), {});
    return { total: issues.length, counts, recent: issues.slice(-15) };
  }

  // Portals are single-page apps, so watch for newly rendered content.
  let observer;
  function watch() {
    if (observer) return;
    let pending = false;
    observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 300));
      schedule(() => { pending = false; run(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  AM.modules.fixer = { run, watch, summary, accessibleName, guessLabel };
})();
