// Reading guide / focus ruler. A translucent band follows the pointer (or keyboard
// focus) and dims the rest of the page so the current line stands out.
(() => {
  const AM = window.AccessMed;
  let ruler, topShade, bottomShade, y = window.innerHeight / 3, height = 44, active = false;

  function build() {
    const wrap = document.createElement("div");
    wrap.setAttribute("data-accessmed-ui", "");
    wrap.setAttribute("aria-hidden", "true");
    wrap.className = "accessmed-ruler-wrap";
    topShade = Object.assign(document.createElement("div"), { className: "accessmed-ruler-shade" });
    bottomShade = Object.assign(document.createElement("div"), { className: "accessmed-ruler-shade" });
    ruler = Object.assign(document.createElement("div"), { className: "accessmed-ruler" });
    wrap.append(topShade, ruler, bottomShade);
    document.body.appendChild(wrap);
    return wrap;
  }

  function position() {
    if (!ruler) return;
    const top = Math.max(0, y - height / 2);
    ruler.style.top = `${top}px`;
    ruler.style.height = `${height}px`;
    topShade.style.top = "0";
    topShade.style.height = `${top}px`;
    bottomShade.style.top = `${top + height}px`;
    bottomShade.style.bottom = "0";
  }

  let frame = 0;
  const onMove = (e) => {
    y = e.clientY;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(position);
  };

  // Keyboard users: the ruler jumps to whatever element has focus.
  const onFocus = (e) => {
    if (AM.isOwnNode(e.target)) return;
    const r = e.target.getBoundingClientRect?.();
    if (r) { y = r.top + r.height / 2; position(); }
  };

  // Alt+Up/Down nudges the ruler line-by-line; Alt+[ / Alt+] resizes it.
  const onKey = (e) => {
    if (!e.altKey) return;
    if (e.key === "ArrowDown") y += height * 0.8;
    else if (e.key === "ArrowUp") y -= height * 0.8;
    else if (e.key === "]") height = Math.min(200, height + 8);
    else if (e.key === "[") height = Math.max(20, height - 8);
    else return;
    e.preventDefault();
    position();
  };

  let wrap;
  function enable() {
    if (active) return;
    active = true;
    wrap = wrap || build();
    wrap.hidden = false;
    position();
    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("focusin", onFocus);
    document.addEventListener("keydown", onKey);
  }

  function disable() {
    active = false;
    if (wrap) wrap.hidden = true;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("focusin", onFocus);
    document.removeEventListener("keydown", onKey);
  }

  AM.modules.ruler = { enable, disable, set: (on) => (on ? enable() : disable()) };
})();
