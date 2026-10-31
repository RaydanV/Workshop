// Parses hospital bill / EOB tables on the page into a simple breakdown:
// total charges, what insurance paid, discounts/adjustments, and what you owe.
(() => {
  const COLUMN_PATTERNS = {
    charges: /\b(billed|charges?|gross|total charge|amount billed|provider charge|price)\b/i,
    insurance: /\b(insurance|plan|payer|insurer)\b.*\b(paid|payment|pays|covered)\b|\bpaid by (insurance|plan)\b|\bplan paid\b/i,
    adjustments: /\b(adjust|discount|allowance|write.?off|not allowed|savings)\w*/i,
    owe: /\b(you owe|patient (responsibility|balance|owes|portion)|your (cost|share|responsibility)|amount due|balance due|you may owe)\b/i
  };
  const DESCRIPTION = /\b(description|service|procedure|item|details?)\b/i;

  function parseMoney(text) {
    if (!text) return null;
    const t = text.replace(/\s/g, "");
    const m = t.match(/(\()?-?\$?(-)?([\d,]+(?:\.\d{1,2})?)(\))?/);
    if (!m) return null;
    const value = parseFloat(m[3].replace(/,/g, ""));
    if (Number.isNaN(value)) return null;
    // Accounting negatives like ($120.00) or -$120 are treated as magnitudes.
    return Math.abs(value);
  }

  // Read the ORIGINAL header text even when Plain Language has rewritten it,
  // e.g. "Billed amount" -> "full price before discounts" must not look like a discount.
  function originalText(cell) {
    if (!cell.querySelector(".accessmed-term")) return (cell.innerText ?? cell.textContent).trim();
    const clone = cell.cloneNode(true);
    clone.querySelectorAll(".accessmed-term").forEach((t) => t.replaceWith(t.dataset.original));
    return clone.textContent.trim();
  }

  function headerCells(table) {
    const head = table.tHead?.rows[0] || table.rows[0];
    return head ? [...head.cells].map(originalText) : [];
  }

  function mapColumns(headers) {
    const map = {};
    headers.forEach((h, i) => {
      // Test "owe" first: "Patient responsibility" should not also count as charges.
      for (const key of ["owe", "insurance", "adjustments", "charges"]) {
        if (map[key] === undefined && COLUMN_PATTERNS[key].test(h)) { map[key] = i; return; }
      }
    });
    // Prefer a literal "Description" column over e.g. "Date of service".
    const exact = headers.findIndex((h) => /\bdescription\b/i.test(h));
    const loose = headers.findIndex((h, i) => DESCRIPTION.test(h) && !Object.values(map).includes(i));
    if (exact >= 0 || loose >= 0) map.description = exact >= 0 ? exact : loose;
    return map;
  }

  function parseTable(table) {
    const headers = headerCells(table);
    const cols = mapColumns(headers);
    const known = ["charges", "insurance", "adjustments", "owe"].filter((k) => cols[k] !== undefined);
    if (known.length < 2) return null;

    const bodyRows = [...table.rows].slice(table.tHead ? table.tHead.rows.length : 1);
    const totals = { charges: 0, insurance: 0, adjustments: 0, owe: 0 };
    const items = [];
    let totalRow = null;

    for (const row of bodyRows) {
      const cells = [...row.cells];
      const label = cells[cols.description ?? 0] ? originalText(cells[cols.description ?? 0]) : "";
      const values = Object.fromEntries(known.map((k) => [k, parseMoney(cells[cols[k]] && (cells[cols[k]].innerText ?? cells[cols[k]].textContent)) ?? 0]));
      if (/^(total|grand total|totals|balance)\b/i.test(label) || row.closest("tfoot")) {
        totalRow = values;
        continue;
      }
      if (!known.some((k) => values[k])) continue;
      items.push({ label, ...values });
      known.forEach((k) => (totals[k] += values[k]));
    }

    // Prefer the page's own total row when present: it matches what the user sees.
    const result = { ...totals, ...(totalRow || {}) };
    if (cols.owe === undefined) {
      result.owe = Math.max(0, result.charges - result.insurance - result.adjustments);
      result.oweEstimated = true;
    }
    if (cols.charges === undefined) result.charges = result.insurance + result.adjustments + result.owe;
    return { ...round(result), items, headers, source: "table" };
  }

  // Fallback for summary cards like "Insurance paid: $1,234.00".
  function parseSummaryText(root) {
    const text = root.innerText || "";
    const grab = (re) => {
      const m = text.match(new RegExp(re.source + String.raw`[^\d$(\n]{0,30}(\(?-?\$?[\d,]+(?:\.\d{2})?\)?)`, "i"));
      return m ? parseMoney(m[m.length - 1]) : null;
    };
    const r = {
      charges: grab(/total charges|amount billed|billed amount/),
      insurance: grab(/insurance (paid|payments?)|plan paid|paid by insurance/),
      adjustments: grab(/adjustments?|discounts?/),
      owe: grab(/you owe|patient responsibility|amount due|balance due/)
    };
    const found = Object.values(r).filter((v) => v !== null).length;
    if (found < 2) return null;
    for (const k in r) r[k] ??= 0;
    if (!r.charges) r.charges = r.insurance + r.adjustments + r.owe;
    return { ...round(r), items: [], source: "summary" };
  }

  function round(r) {
    const out = { ...r };
    for (const k of ["charges", "insurance", "adjustments", "owe"]) out[k] = Math.round((r[k] || 0) * 100) / 100;
    return out;
  }

  function parse(root = document) {
    const tables = [...root.querySelectorAll("table")].map(parseTable).filter(Boolean);
    if (tables.length) {
      // Choose the table with the largest total; bills often show a summary + detail.
      tables.sort((a, b) => b.charges - a.charges);
      return { found: true, ...tables[0], tableCount: tables.length };
    }
    const summary = root.body ? parseSummaryText(root.body) : null;
    return summary ? { found: true, ...summary } : { found: false };
  }

  const api = { parse, parseMoney, mapColumns };
  if (typeof window !== "undefined" && window.AccessMed) window.AccessMed.modules.billing = api;
  if (typeof module !== "undefined") module.exports = api;
})();
