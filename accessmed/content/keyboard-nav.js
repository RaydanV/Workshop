// Keyboard-only navigation upgrades for the two worst offenders on portals:
// custom date pickers and hover-only dropdown menus. Also adds a skip link.
(() => {
  const AM = window.AccessMed;

  // ---------- Date pickers ----------
  // Day cells in custom calendars are often <td onclick> or <div class="day">.
  const DAY_SELECTOR = "td[data-date], td[data-day], [role=gridcell], .day:not(.disabled), .calendar-day, [class*=datepicker] td, [class*=calendar] td";

  function enhanceCalendar(cal) {
    // Skip if this calendar, an ancestor, or a descendant was already enhanced
    // (a .calendar wrapper and its inner <table> would otherwise both bind keys).
    if (cal.closest("[data-accessmed-cal]") || cal.querySelector("[data-accessmed-cal]")) return;
    const days = () => [...cal.querySelectorAll(DAY_SELECTOR)].filter((d) => /\d/.test(d.textContent) && !d.matches("[aria-disabled=true], .disabled, .empty"));
    const list = days();
    if (list.length < 7) return;
    cal.dataset.accessmedCal = "1";
    if (!cal.getAttribute("role")) cal.setAttribute("role", "grid");
    if (!cal.getAttribute("aria-label")) cal.setAttribute("aria-label", "Calendar. Use arrow keys to move between days and Enter to choose.");

    // Roving tabindex: exactly one day is in the tab order at a time.
    const current = list.find((d) => d.matches(".selected, .today, [aria-selected=true]")) || list[0];
    list.forEach((d) => {
      d.tabIndex = d === current ? 0 : -1;
      if (!d.getAttribute("role")) d.setAttribute("role", "gridcell");
      if (!d.getAttribute("aria-label")) {
        const heading = cal.querySelector("caption, [class*=title], [class*=month], h2, h3")?.textContent.trim() || "";
        d.setAttribute("aria-label", `${d.textContent.trim()} ${heading}`.trim());
      }
    });

    cal.addEventListener("keydown", (e) => {
      const all = days();
      const i = all.indexOf(document.activeElement);
      if (i < 0) return;
      const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -(i % 7), End: 6 - (i % 7) };
      if (e.key in moves) {
        e.preventDefault();
        const next = all[Math.min(all.length - 1, Math.max(0, i + moves[e.key]))];
        all[i].tabIndex = -1;
        next.tabIndex = 0;
        next.focus();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        document.activeElement.click();
        AM.announce(`Selected ${document.activeElement.getAttribute("aria-label")}`);
      } else if (e.key === "PageDown" || e.key === "PageUp") {
        const btn = cal.querySelector(e.key === "PageDown" ? '[class*=next], [aria-label*=next i]' : '[class*=prev], [aria-label*=prev i]');
        if (btn) { e.preventDefault(); btn.click(); setTimeout(() => days()[0]?.focus(), 50); }
      }
    });
  }

  // Typed-date fallback: a plain text box beside read-only date inputs,
  // so users never have to click through a calendar at all.
  function addTypedDateFallback(input) {
    if (input.dataset.accessmedTyped || input.type === "date" || AM.isOwnNode(input)) return;
    if (!input.readOnly && !/date|dob|birth/i.test(input.name + input.id + input.className)) return;
    input.dataset.accessmedTyped = "1";
    const box = document.createElement("input");
    box.type = "text";
    box.inputMode = "numeric";
    box.placeholder = "MM/DD/YYYY";
    box.className = "accessmed-typed-date";
    box.setAttribute("data-accessmed-ui", "");
    box.setAttribute("aria-label", `Type ${AM.modules.fixer.accessibleName(input) || "date"} as month, day, year`);
    box.addEventListener("change", () => {
      const m = box.value.match(/^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/);
      if (!m) { box.setAttribute("aria-invalid", "true"); AM.announce("Please use month, day, year. For example 03/14/1965."); return; }
      box.removeAttribute("aria-invalid");
      const formatted = `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`;
      // Use the native setter so React/Vue-controlled inputs notice the change.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      const wasReadOnly = input.readOnly;
      input.readOnly = false;
      setter.call(input, formatted);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.readOnly = wasReadOnly;
      AM.announce(`Date set to ${formatted}`);
    });
    input.insertAdjacentElement("afterend", box);
  }

  // ---------- Hover-only menus ----------
  function enhanceMenus(root) {
    root.querySelectorAll("nav li, [role=menubar] > *, .dropdown, [class*=menu] > li").forEach((item) => {
      if (item.dataset.accessmedMenu || AM.isOwnNode(item)) return;
      const trigger = item.querySelector(":scope > a, :scope > button, :scope > span, :scope > [role=button]");
      const submenu = item.querySelector(":scope > ul, :scope > [role=menu], :scope > .dropdown-menu, :scope > [class*=submenu]");
      if (!trigger || !submenu) return;
      item.dataset.accessmedMenu = "1";
      if (trigger.tabIndex < 0 || !trigger.matches("a[href], button")) trigger.tabIndex = 0;
      trigger.setAttribute("aria-haspopup", "true");
      trigger.setAttribute("aria-expanded", "false");
      const setOpen = (open) => {
        item.classList.toggle("accessmed-menu-open", open);
        trigger.setAttribute("aria-expanded", String(open));
      };
      const links = () => [...submenu.querySelectorAll("a, button, [role=menuitem]")];
      trigger.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
          if (e.key !== "ArrowDown" && trigger.matches("a[href]") && item.classList.contains("accessmed-menu-open")) return;
          e.preventDefault();
          setOpen(true);
          links()[0]?.focus();
        }
      });
      submenu.addEventListener("keydown", (e) => {
        const l = links(), i = l.indexOf(document.activeElement);
        if (e.key === "ArrowDown") { e.preventDefault(); l[(i + 1) % l.length]?.focus(); }
        if (e.key === "ArrowUp") { e.preventDefault(); l[(i - 1 + l.length) % l.length]?.focus(); }
        if (e.key === "Escape") { e.preventDefault(); setOpen(false); trigger.focus(); }
      });
      item.addEventListener("focusout", (e) => { if (!item.contains(e.relatedTarget)) setOpen(false); });
    });
  }

  function addSkipLink() {
    if (document.getElementById("accessmed-skip")) return;
    const main = document.querySelector("main, [role=main], h1");
    if (!main) return;
    if (!main.id) main.id = "accessmed-main";
    if (main.tabIndex < 0) main.tabIndex = -1;
    const a = document.createElement("a");
    a.id = "accessmed-skip";
    a.href = `#${main.id}`;
    a.textContent = "Skip to main content";
    a.setAttribute("data-accessmed-ui", "");
    document.body.prepend(a);
  }

  function run(root = document.body) {
    document.documentElement.classList.add("accessmed-focus-visible");
    addSkipLink();
    root.querySelectorAll('table, [class*=calendar], [class*=datepicker], [role=grid]').forEach(enhanceCalendar);
    root.querySelectorAll("input").forEach(addTypedDateFallback);
    enhanceMenus(root);
  }

  AM.modules.keyboard = { run };
})();
