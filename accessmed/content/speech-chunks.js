// Splits text into short, sentence-sized pieces for speech synthesis.
// Chrome often goes silent partway through one long utterance, so long text
// is spoken as a queue of short ones. Pure function: also runs in Node tests.
(() => {
  const BREAK_AFTER = /[,;:]/;

  function sentences(line, locale) {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      try {
        const seg = new Intl.Segmenter(locale, { granularity: "sentence" });
        return [...seg.segment(line)].map((s) => s.segment);
      } catch { /* bad locale tag: fall through */ }
    }
    return line.split(/(?<=[.!?])\s+/);
  }

  // Cut one over-long sentence at the last comma/semicolon/colon, else the
  // last space, before maxLength. Only hard-cut a word with no spaces at all.
  function cutLong(text, maxLength) {
    const out = [];
    let rest = text;
    while (rest.length > maxLength) {
      const window = rest.slice(0, maxLength + 1);
      let cut = -1;
      for (let i = window.length - 1; i > 0; i--) {
        if (BREAK_AFTER.test(window[i]) && /\s/.test(rest[i + 1] || "")) { cut = i + 1; break; }
      }
      if (cut === -1) cut = window.lastIndexOf(" ");
      if (cut <= 0) cut = maxLength;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
    return out;
  }

  function splitIntoChunks(text, { maxLength = 200, locale } = {}) {
    if (!text) return [];
    const chunks = [];
    for (const rawLine of String(text).split(/\n+/)) {
      const line = rawLine.replace(/\s+/g, " ").trim();
      if (!line) continue;
      for (const s of sentences(line, locale)) {
        const sentence = s.trim();
        if (!sentence) continue;
        chunks.push(...(sentence.length > maxLength ? cutLong(sentence, maxLength) : [sentence]));
      }
    }
    return chunks.filter(Boolean);
  }

  const api = { splitIntoChunks };
  if (typeof window !== "undefined") window.AccessMedSpeech = api;
  if (typeof module !== "undefined") module.exports = api;
})();
