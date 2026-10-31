// Plain Language simplifier.
// Replaces medical and billing jargon with plain words while keeping the
// original term one hover or focus away, so meaning is never lost.
// One glossary per language. The language is picked from the user's setting,
// or automatically from the nearest lang="" attribute on the page.
(() => {
  // Ordered longest-first at build time so "explanation of benefits" wins over "benefits".
  const EN = {
    // ---- Billing & insurance ----
    "explanation of benefits": "insurance summary (not a bill)",
    "eob": "insurance summary (not a bill)",
    "patient responsibility": "what you owe",
    "amount due": "what you owe",
    "balance due": "what you owe",
    "deductible": "amount you pay before insurance starts paying",
    "out-of-pocket maximum": "most you will pay in a year",
    "out of pocket maximum": "most you will pay in a year",
    "coinsurance": "your share of the cost (a percent)",
    "copayment": "flat fee you pay per visit",
    "copay": "flat fee you pay per visit",
    "premium": "monthly insurance payment",
    "contractual adjustment": "discount from your insurance deal",
    "contractual allowance": "discount from your insurance deal",
    "adjustment": "discount or correction",
    "allowed amount": "price your insurance agreed to",
    "billed amount": "full price before discounts",
    "gross charges": "full price before discounts",
    "prior authorization": "insurance approval needed first",
    "pre-authorization": "insurance approval needed first",
    "out-of-network": "not in your insurance's approved list",
    "in-network": "in your insurance's approved list",
    "claim denied": "insurance said no to paying",
    "pending adjudication": "insurance is still reviewing",
    "adjudicated": "reviewed by insurance",
    "coordination of benefits": "sorting out which insurance pays first",
    "guarantor": "person responsible for the bill",
    "cpt code": "procedure code",
    "icd-10": "diagnosis code",
    "date of service": "visit date",
    "remittance": "payment",
    "self-pay": "paying without insurance",
    // ---- Clinical ----
    "hypertension": "high blood pressure",
    "hypotension": "low blood pressure",
    "hyperlipidemia": "high cholesterol",
    "hyperglycemia": "high blood sugar",
    "hypoglycemia": "low blood sugar",
    "myocardial infarction": "heart attack",
    "cerebrovascular accident": "stroke",
    "dyspnea": "shortness of breath",
    "edema": "swelling",
    "benign": "not cancerous",
    "malignant hypertension": "dangerously high blood pressure",
    "malignant": "cancerous",
    "metastasis": "cancer that has spread",
    "neoplasm": "abnormal growth",
    "lesion": "abnormal area",
    "contusion": "bruise",
    "laceration": "cut",
    "fracture": "broken bone",
    "syncope": "fainting",
    "pruritus": "itching",
    "erythema": "redness",
    "afebrile": "no fever",
    "febrile": "has a fever",
    "tachycardia": "fast heart rate",
    "bradycardia": "slow heart rate",
    "nephropathy": "kidney damage",
    "renal": "kidney",
    "hepatic": "liver",
    "cardiac": "heart",
    "pulmonary": "lung",
    "gastrointestinal": "stomach and gut",
    "anticoagulant": "blood thinner",
    "analgesic": "pain reliever",
    "antipyretic": "fever reducer",
    "nsaid": "anti-inflammatory pain reliever",
    "contraindicated": "should not be used",
    "prognosis": "expected outcome",
    "etiology": "cause",
    "idiopathic": "unknown cause",
    "acute": "sudden or short-term",
    "chronic": "long-lasting",
    "bilateral": "both sides",
    "unremarkable": "normal",
    "within normal limits": "normal",
    "wnl": "normal",
    "hemoglobin a1c": "average blood sugar (last 3 months)",
    "a1c": "average blood sugar (last 3 months)",
    "ldl": "bad cholesterol",
    "hdl": "good cholesterol",
    "egfr": "kidney function score",
    "cbc": "complete blood count",
    "prn": "only when needed",
    "bid": "twice a day",
    "tid": "three times a day",
    "qid": "four times a day",
    "qd": "once a day",
    "po": "by mouth",
    "npo": "nothing to eat or drink",
    "stat": "right away"
  };

  // Spanish (US patient portals). Words whose meaning depends on context are left
  // out on purpose: "prima" (premium / cousin), "agudo" (acute / sharp pain),
  // "lesión" (lesion / injury). Gendered adjectives list both forms.
  const ES = {
    // ---- Facturación y seguro ----
    "explicación de beneficios": "resumen del seguro (no es una factura)",
    "eob": "resumen del seguro (no es una factura)",
    "responsabilidad del paciente": "lo que usted debe",
    "saldo pendiente": "lo que usted debe",
    "saldo adeudado": "lo que usted debe",
    "monto adeudado": "lo que usted debe",
    "deducible": "lo que usted paga antes de que el seguro empiece a pagar",
    "máximo de gastos de bolsillo": "lo máximo que pagará en un año",
    "desembolso máximo": "lo máximo que pagará en un año",
    "coseguro": "su parte del costo (un porcentaje)",
    "copago": "cuota fija que paga en cada visita",
    "prima del seguro": "pago mensual del seguro",
    "prima mensual": "pago mensual del seguro",
    "ajuste contractual": "descuento por el acuerdo con su seguro",
    "monto permitido": "precio que su seguro aceptó",
    "monto facturado": "precio completo antes de descuentos",
    "cargos brutos": "precio completo antes de descuentos",
    "autorización previa": "el seguro debe aprobarlo antes",
    "preautorización": "el seguro debe aprobarlo antes",
    "fuera de la red": "no está en la lista aprobada de su seguro",
    "dentro de la red": "en la lista aprobada de su seguro",
    "reclamo denegado": "el seguro se negó a pagar",
    "reclamación denegada": "el seguro se negó a pagar",
    "pendiente de adjudicación": "el seguro todavía lo está revisando",
    "coordinación de beneficios": "decidir qué seguro paga primero",
    "garante": "persona responsable de la factura",
    "código cpt": "código del procedimiento",
    "cie-10": "código del diagnóstico",
    "icd-10": "código del diagnóstico",
    "fecha de servicio": "fecha de la visita",
    "pago por cuenta propia": "pagar sin seguro",
    // ---- Clínico ----
    "hipertensión maligna": "presión arterial peligrosamente alta",
    "hipertensión": "presión arterial alta",
    "hipotensión": "presión arterial baja",
    "hiperlipidemia": "colesterol alto",
    "hiperglucemia": "azúcar alta en la sangre",
    "hipoglucemia": "azúcar baja en la sangre",
    "infarto agudo de miocardio": "ataque al corazón",
    "infarto de miocardio": "ataque al corazón",
    "accidente cerebrovascular": "derrame cerebral",
    "disnea": "falta de aire",
    "edema": "hinchazón",
    "benigno": "no canceroso",
    "benigna": "no cancerosa",
    "maligno": "canceroso",
    "maligna": "cancerosa",
    "metástasis": "cáncer que se ha extendido",
    "neoplasia": "crecimiento anormal",
    "contusión": "moretón",
    "laceración": "corte",
    "fractura": "hueso roto",
    "síncope": "desmayo",
    "prurito": "picazón",
    "eritema": "enrojecimiento",
    "afebril": "sin fiebre",
    "febril": "con fiebre",
    "taquicardia": "latidos rápidos del corazón",
    "bradicardia": "latidos lentos del corazón",
    "nefropatía": "daño en los riñones",
    "renal": "de los riñones",
    "hepático": "del hígado",
    "hepática": "del hígado",
    "cardíaco": "del corazón",
    "cardíaca": "del corazón",
    "pulmonar": "de los pulmones",
    "gastrointestinal": "del estómago y los intestinos",
    "anticoagulante": "medicamento para diluir la sangre",
    "analgésico": "medicamento para el dolor",
    "antipirético": "medicamento para bajar la fiebre",
    "aine": "antiinflamatorio para el dolor",
    "contraindicado": "no se debe usar",
    "contraindicada": "no se debe usar",
    "pronóstico": "resultado esperado",
    "etiología": "causa",
    "idiopático": "de causa desconocida",
    "idiopática": "de causa desconocida",
    "crónico": "de larga duración",
    "crónica": "de larga duración",
    "bilateral": "en ambos lados",
    "sin hallazgos significativos": "normal",
    "dentro de los límites normales": "normal",
    "hemoglobina a1c": "promedio de azúcar en la sangre (últimos 3 meses)",
    "a1c": "promedio de azúcar en la sangre (últimos 3 meses)",
    "ldl": "colesterol malo",
    "hdl": "colesterol bueno",
    "tfge": "puntaje de función de los riñones",
    "egfr": "puntaje de función de los riñones",
    "hemograma completo": "análisis de sangre completo",
    "vía oral": "por la boca",
    "vo": "por la boca",
    "po": "por la boca",
    "prn": "solo cuando lo necesite",
    "bid": "dos veces al día",
    "tid": "tres veces al día",
    "qid": "cuatro veces al día",
    "qd": "una vez al día",
    "nada por vía oral": "no comer ni beber nada",
    "npo": "no comer ni beber nada",
    "stat": "de inmediato"
  };

  // Short abbreviations are only replaced when written in capitals (e.g. "PO", "BID")
  // so normal words like "po" in other languages or "stat" in "statement" are safe.
  const LANGUAGES = {
    en: {
      name: "English",
      glossary: EN,
      caseSensitive: ["eob", "po", "prn", "bid", "tid", "qid", "qd", "npo", "stat", "wnl", "cbc", "ldl", "hdl", "egfr", "nsaid", "a1c"],
      original: (t) => `Original: ${t}`,
      simplifiedFrom: (t) => `Simplified from ${t}`
    },
    es: {
      name: "Español",
      glossary: ES,
      caseSensitive: ["eob", "vo", "po", "prn", "bid", "tid", "qid", "qd", "npo", "stat", "ldl", "hdl", "egfr", "tfge", "aine", "a1c"],
      original: (t) => `Original: ${t}`,
      simplifiedFrom: (t) => `Simplificado de: ${t}`
    }
  };
  const DEFAULT_LANG = "en";

  // "es-MX" -> "es". Returns null for languages without a glossary.
  function resolveLanguage(tag) {
    const base = String(tag || "").trim().toLowerCase().split(/[-_]/)[0];
    return base in LANGUAGES ? base : null;
  }

  // Accent-insensitive key: portals often drop accents ("hipertension").
  const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Compile each language once, on first use.
  const compiled = {};
  function compile(lang) {
    if (compiled[lang]) return compiled[lang];
    const { glossary, caseSensitive } = LANGUAGES[lang];
    const byFolded = {};
    for (const [k, v] of Object.entries(glossary)) byFolded[fold(k)] = v;
    const terms = [...new Set(Object.keys(glossary).flatMap((k) => [k, fold(k)]))].sort((a, b) => b.length - a.length);
    // Unicode-aware word boundaries: \b treats "á" or "ñ" as a non-word character.
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(${terms.map(escape).join("|")})(?![\\p{L}\\p{N}_])`, "giu");
    return (compiled[lang] = { byFolded, caseSensitive: new Set(caseSensitive.map(fold)), pattern });
  }

  // Unknown language tags fall back to English so existing callers keep working.
  const pick = (lang) => resolveLanguage(lang) || DEFAULT_LANG;

  function lookup(match, c) {
    const key = fold(match);
    if (!(key in c.byFolded)) return null;
    if (c.caseSensitive.has(key) && match !== match.toUpperCase()) return null;
    return c.byFolded[key];
  }

  // Pure string version: used by tests, the popup preview, and voice readouts.
  function simplifyText(text, lang) {
    const c = compile(pick(lang));
    return text.replace(c.pattern, (m) => {
      const plain = lookup(m, c);
      if (!plain) return m;
      // Preserve a leading capital ("Hypertension" -> "High blood pressure"), but
      // not for ALL-CAPS abbreviations ("PO BID" -> "by mouth twice a day").
      const titleCase = m[0] !== m[0].toLowerCase() && m !== m.toUpperCase();
      return titleCase
        ? plain[0].toUpperCase() + plain.slice(1)
        : plain;
    });
  }

  // Find terms in text and return their spans (for DOM wrapping).
  function findTerms(text, lang) {
    const c = compile(pick(lang));
    const out = [];
    c.pattern.lastIndex = 0;
    let m;
    while ((m = c.pattern.exec(text))) {
      const plain = lookup(m[0], c);
      if (plain) out.push({ start: m.index, end: m.index + m[0].length, original: m[0], plain });
    }
    return out;
  }

  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "CODE", "PRE", "OPTION"]);

  // Language of one element: its nearest lang="" ancestor, else the browser's.
  // Returns null when that language has no glossary (nothing gets replaced).
  function languageOf(el) {
    const tag = el?.closest?.("[lang]")?.getAttribute("lang") ||
      (typeof navigator !== "undefined" && navigator.language) || DEFAULT_LANG;
    return resolveLanguage(tag);
  }

  // lang: a language code to force one glossary for every node, or
  // "auto"/undefined to follow each element's lang="" attribute.
  function applyToDom(root = document.body, lang = "auto") {
    if (typeof document === "undefined") return 0;
    const forced = lang && lang !== "auto" ? resolveLanguage(lang) : null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || SKIP.has(p.tagName) || p.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (p.closest("[data-accessmed-ui], .accessmed-term")) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    let count = 0;
    for (const node of nodes) {
      const nodeLang = forced || languageOf(node.parentElement);
      if (!nodeLang) continue;
      const strings = LANGUAGES[nodeLang];
      const hits = findTerms(node.nodeValue, nodeLang);
      if (!hits.length) continue;
      const frag = document.createDocumentFragment();
      let cursor = 0;
      for (const h of hits) {
        frag.append(node.nodeValue.slice(cursor, h.start));
        const span = document.createElement("span");
        span.className = "accessmed-term";
        span.tabIndex = 0;
        span.dataset.original = h.original;
        span.textContent = simplifyText(h.original, nodeLang);
        span.title = strings.original(h.original);
        span.setAttribute("aria-description", strings.simplifiedFrom(h.original));
        frag.append(span);
        cursor = h.end;
        count++;
      }
      frag.append(node.nodeValue.slice(cursor));
      node.replaceWith(frag);
    }
    return count;
  }

  function revertDom(root = document.body) {
    root.querySelectorAll(".accessmed-term").forEach((span) => span.replaceWith(span.dataset.original));
    root.normalize();
  }

  const api = {
    GLOSSARY: EN, // kept for existing callers; same as LANGUAGES.en.glossary
    LANGUAGES,
    resolveLanguage,
    languageOf,
    simplifyText,
    findTerms,
    applyToDom,
    revertDom
  };
  if (typeof window !== "undefined") {
    window.AccessMedPlain = api; // used by the popup preview
    if (window.AccessMed) window.AccessMed.modules.plain = api;
  }
  if (typeof module !== "undefined") module.exports = api;
})();
