// Dependency-free SVG donut chart with hover/focus tooltips.
// Slices are separated by a 2px surface-colored stroke; identity is never
// color-alone (legend + direct values + table view in popup.html).
(() => {
  const NS = "http://www.w3.org/2000/svg";

  function arcPath(cx, cy, rOuter, rInner, start, end) {
    // Full-circle slices need two arcs; SVG cannot draw a 360° arc in one command.
    if (end - start >= Math.PI * 2 - 1e-6) end = start + Math.PI * 2 - 1e-4;
    const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const large = end - start > Math.PI ? 1 : 0;
    const [x1, y1] = p(rOuter, start), [x2, y2] = p(rOuter, end);
    const [x3, y3] = p(rInner, end), [x4, y4] = p(rInner, start);
    return `M${x1},${y1} A${rOuter},${rOuter} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${rInner},${rInner} 0 ${large} 0 ${x4},${y4} Z`;
  }

  function render(svg, slices, { tooltip, format }) {
    svg.replaceChildren();
    const total = slices.reduce((s, d) => s + d.value, 0);
    if (!total) return;
    let angle = -Math.PI / 2; // start at 12 o'clock
    for (const d of slices) {
      if (d.value <= 0) continue;
      const sweep = (d.value / total) * Math.PI * 2;
      const start = angle; // captured per slice for the focus tooltip
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", arcPath(100, 100, 96, 62, start, start + sweep));
      path.setAttribute("fill", d.color);
      path.setAttribute("tabindex", "0");
      const pct = Math.round((d.value / total) * 100);
      path.setAttribute("aria-label", `${d.label}: ${format(d.value)}, ${pct} percent`);
      const show = (x, y) => {
        tooltip.textContent = `${d.label}: ${format(d.value)} (${pct}%)`;
        tooltip.hidden = false;
        tooltip.style.left = `${Math.min(x + 12, 120)}px`;
        tooltip.style.top = `${y - 30}px`;
      };
      path.addEventListener("mousemove", (e) => {
        const r = svg.getBoundingClientRect();
        show(e.clientX - r.left, e.clientY - r.top);
      });
      path.addEventListener("focus", () => {
        const mid = start + sweep / 2;
        show(100 + 80 * Math.cos(mid), 100 + 80 * Math.sin(mid));
      });
      const hide = () => (tooltip.hidden = true);
      path.addEventListener("mouseleave", hide);
      path.addEventListener("blur", hide);
      svg.appendChild(path);
      angle += sweep;
    }
  }

  window.DonutChart = { render };
})();
