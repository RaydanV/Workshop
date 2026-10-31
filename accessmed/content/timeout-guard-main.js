// Runs in the PAGE's JavaScript world (manifest "world": "MAIN") at document_start.
// Content scripts live in an isolated world and cannot see the page's timers,
// so this half watches for session-timeout timers the portal creates.
//
// It does NOT cancel the portal's timers or bypass server-side session expiry.
// It records long timers so the isolated half can warn early and keep the
// session alive through the portal's own "extend session" mechanism.
(() => {
  if (window.__accessmedTimeoutGuard) return;
  window.__accessmedTimeoutGuard = true;

  const LONG_TIMER_MS = 60 * 1000; // 1 minute+ timers are candidate session timeouts.
  const native = { setTimeout: window.setTimeout };

  window.setTimeout = function (fn, delay, ...rest) {
    const id = native.setTimeout.call(this, fn, delay, ...rest);
    if (typeof delay === "number" && delay >= LONG_TIMER_MS) {
      const source = typeof fn === "function" ? fn.toString().slice(0, 300) : String(fn).slice(0, 300);
      if (/logout|log out|signout|sign out|session|expire|timeout|idle|inactiv/i.test(source)) {
        const info = { __accessmed: "TIMEOUT_DETECTED", delay, at: Date.now() };
        // The DOM is shared between worlds, so also leave a note on <html> in case
        // the isolated content script has not loaded yet (it runs at document_idle).
        document.documentElement.setAttribute("data-accessmed-timeout", JSON.stringify(info));
        window.postMessage(info, location.origin);
      }
    }
    return id;
  };
})();
