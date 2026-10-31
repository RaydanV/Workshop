// AccessMed popup controller.
const $ = (s) => document.querySelector(s);
let tabId = null;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function send(message) {
  if (!tabId) return null;
  try { return await chrome.tabs.sendMessage(tabId, message); }
  catch { return null; } // page not scriptable (e.g. browser settings pages)
}

// ---------- Accessible tabs (WAI-ARIA tabs pattern, automatic activation) ----------
const tabs = [...document.querySelectorAll("[role=tab]")];
function selectTab(tab, focus = true) {
  tabs.forEach((t) => {
    const on = t === tab;
    t.setAttribute("aria-selected", on);
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
  });
  if (focus) tab.focus();
  if (tab.id === "tab-bill") loadBill();
  chrome.storage.local.set({ lastTab: tab.id });
}
tabs.forEach((t, i) => {
  t.addEventListener("click", () => selectTab(t));
  t.addEventListener("keydown", (e) => {
    const map = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
    if (e.key in map) { e.preventDefault(); selectTab(tabs[(map[e.key] + tabs.length) % tabs.length]); }
  });
});

// ---------- Settings bound to inputs ----------
async function initSettings() {
  const settings = await chrome.storage.sync.get(null);
  document.querySelectorAll("[data-setting]").forEach((el) => {
    const key = el.dataset.setting;
    const value = settings[key];
    if (el.type === "checkbox") el.checked = key === "autoFix" || key === "timeoutGuard" || key === "keyboardNav" || key === "panicButton" ? value !== false : !!value;
    else if (value !== undefined) el.value = value;
    else if (key === "fontScale") el.value = 1;
    else if (key === "emergencyNumber") el.value = "911";
    else if (key === "plainLanguageLang") el.value = "auto";

    const save = () => {
      const v = el.type === "checkbox" ? el.checked : el.type === "range" ? Number(el.value) : el.value.trim();
      chrome.storage.sync.set({ [key]: v });
      if (key === "fontScale") updateFontLabel();
    };
    el.addEventListener(el.type === "range" ? "input" : "change", save);
  });
  updateFontLabel();
}
function updateFontLabel() {
  $("#fontScaleOut").textContent = `${Math.round(Number($("#fontScale").value) * 100)}%`;
}

// ---------- Vision ----------
$("#read").addEventListener("click", () => send({ type: "READ_ALOUD" }));
$("#stop").addEventListener("click", () => send({ type: "STOP_READING" }));

const FIX_LABELS = {
  "missing-label": "Buttons or links given a name",
  "not-focusable": "Clickable items made keyboard-reachable",
  "missing-alt": "Images given a description",
  "decorative-image": "Decorative images hidden from screen readers",
  "unlabeled-field": "Form fields given a label",
  "missing-landmark": "Main content area marked",
  "table-headers": "Table headers marked",
  "missing-lang": "Page language set"
};
async function loadStatus() {
  const status = await send({ type: "GET_STATUS" });
  if (!status) {
    $("#audit-status").textContent = "AccessMed can't run on this page. Open your patient portal to use it.";
    return;
  }
  pageLang = status.pageLang || "";
  showAIPageStatus(status.ai);
  preview();
  updatePlainLangStatus();
  const { total, counts } = status.audit;
  $("#audit-status").textContent = total ? `✅ Fixed ${total} accessibility problem${total === 1 ? "" : "s"} on this page.` : "✅ No common problems found on this page.";
  $("#audit-list").replaceChildren(...Object.entries(counts).map(([k, n]) => {
    const li = document.createElement("li");
    li.textContent = `${FIX_LABELS[k] || k}: ${n}`;
    return li;
  }));

  const voice = $("#voice");
  if (!status.voiceSupported) {
    voice.disabled = true;
    voice.textContent = "🎤 Voice control needs Chrome or Edge";
  } else setVoice(status.voiceListening);
  const n = status.timeout.extendedCount;
  $("#timeout-status").textContent = n ? `Kept your session open ${n} time${n === 1 ? "" : "s"} on this page.` : "";
}

// ---------- Motor ----------
function setVoice(on) {
  $("#voice").setAttribute("aria-pressed", on);
  $("#voice").textContent = on ? "🎤 Listening… press to stop" : "🎤 Start voice control";
}
$("#voice").addEventListener("click", async () => setVoice(!!(await send({ type: "TOGGLE_VOICE" }))));
$("#cmd-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("#cmd").value.trim();
  if (!text) return;
  $("#cmd-result").textContent = (await send({ type: "VOICE_COMMAND", text })) || "This page can't be controlled.";
  $("#cmd").value = "";
});
$("#panic").addEventListener("click", async () => { await send({ type: "PANIC" }); window.close(); });

// ---------- Cognitive: live plain-language preview ----------
const Plain = window.AccessMedPlain;
const SAMPLES = {
  en: "Patient responsibility after deductible and coinsurance. Hypertension, take 1 tab PO BID.",
  es: "Responsabilidad del paciente después del deducible y el coseguro. Hipertensión, tomar 1 tableta VO BID."
};
let pageLang = ""; // filled in by GET_STATUS

// Language used on this page: the user's choice, or the page's own language.
function activePlainLang() {
  const chosen = $("#plainLanguageLang").value;
  if (chosen !== "auto") return chosen;
  return Plain.resolveLanguage(pageLang || navigator.language);
}

function preview() {
  const lang = activePlainLang() || "en";
  const box = $("#tryText");
  // Swap the sample text to match the language, unless the user typed their own.
  if (Object.values(SAMPLES).includes(box.value) && SAMPLES[lang]) box.value = SAMPLES[lang];
  $("#tryOut").textContent = Plain.simplifyText(box.value, lang);
}

function updatePlainLangStatus() {
  const chosen = $("#plainLanguageLang").value;
  const lang = activePlainLang();
  const status = $("#plainLangStatus");
  if (chosen !== "auto") status.textContent = "";
  else if (lang) status.textContent = `This page: ${Plain.LANGUAGES[lang].name}.`;
  else status.textContent = `No plain-word list for this page's language (${pageLang}) yet. Pick one above to use it anyway.`;
}

function initPlainLanguages() {
  const select = $("#plainLanguageLang");
  for (const [code, { name }] of Object.entries(Plain.LANGUAGES)) select.add(new Option(name, code));
  select.addEventListener("change", () => { preview(); updatePlainLangStatus(); });
}
$("#tryText").addEventListener("input", preview);

// ---------- Cognitive: on-device AI summaries (Chrome only) ----------
const AI_LANGS = [{ type: "text", languages: ["en", "es"] }];
async function aiAvailability() {
  try {
    const a = await LanguageModel.availability({ expectedInputs: AI_LANGS, expectedOutputs: AI_LANGS });
    return window.AccessMedAI.normalizeAvailability(a);
  } catch { return "unavailable"; }
}
const aiStatus = (t) => ($("#ai-status").textContent = t);

async function initAI() {
  if (!("LanguageModel" in self)) return; // Firefox or older Chrome: keep the switch hidden
  $("#ai-row").hidden = false;
  const box = $("#aiRewrite");
  const { aiRewrite } = await chrome.storage.sync.get("aiRewrite");
  box.checked = !!aiRewrite;
  const state = await aiAvailability();
  if (state === "unavailable") {
    box.checked = false;
    box.disabled = true;
    aiStatus("This computer can't run Chrome's built-in AI.");
    if (aiRewrite) chrome.storage.sync.set({ aiRewrite: false });
  } else if (state === "downloading") {
    aiStatus("Chrome is downloading its AI model. This can take a while.");
  }

  box.addEventListener("change", async () => {
    if (!box.checked) {
      chrome.storage.sync.set({ aiRewrite: false });
      aiStatus("");
      return;
    }
    const now = await aiAvailability();
    if (now === "unavailable") {
      box.checked = false;
      aiStatus("This computer can't run Chrome's built-in AI.");
      return;
    }
    if (now !== "available") {
      // This click is the user activation Chrome needs to start the download.
      box.disabled = true;
      aiStatus("Downloading Chrome's AI model… 0%");
      try {
        const s = await LanguageModel.create({
          expectedInputs: AI_LANGS,
          expectedOutputs: AI_LANGS,
          monitor(m) {
            m.addEventListener("downloadprogress", (e) => aiStatus(`Downloading Chrome's AI model… ${Math.round(e.loaded * 100)}%`));
          }
        });
        s.destroy();
      } catch {
        box.checked = false;
        aiStatus("Couldn't get Chrome's AI model. Check your connection and free disk space, then try again.");
        return;
      } finally {
        box.disabled = false;
      }
    }
    chrome.storage.sync.set({ aiRewrite: true });
    aiStatus("On. Simpler versions will appear under hard paragraphs.");
  });
}

function showAIPageStatus(ai) {
  if (!ai?.on || $("#aiRewrite").disabled) return;
  if (ai.blocked === "downloading") return aiStatus("Chrome is still downloading its AI model.");
  const parts = [];
  if (ai.done) parts.push(`Made ${ai.done} simpler version${ai.done === 1 ? "" : "s"} on this page.`);
  if (ai.rejected) parts.push(`Skipped ${ai.rejected} we couldn't check.`);
  if (ai.working) parts.push("Working…");
  if (parts.length) aiStatus(parts.join(" "));
}

// ---------- Billing breakdown ----------
const money = (v) => v.toLocaleString(undefined, { style: "currency", currency: "USD" });
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let billSpeech = "";

async function loadBill() {
  const bill = await send({ type: "PARSE_BILL" });
  if (!bill?.found) {
    $("#bill-empty").hidden = false;
    $("#bill-result").hidden = true;
    $("#bill-empty").textContent = bill === null
      ? "Open a bill or statement page in your portal, then come back here."
      : "No bill table found on this page. Open your billing statement and try again.";
    return;
  }
  $("#bill-empty").hidden = true;
  $("#bill-result").hidden = false;

  // Fixed slot order: color follows the entity, never its size.
  const slices = [
    { key: "insurance", label: "Insurance paid", value: bill.insurance, color: cssVar("--series-insurance") },
    { key: "owe", label: "You owe", value: bill.owe, color: cssVar("--series-owe") },
    { key: "adjustments", label: "Discounts", value: bill.adjustments, color: cssVar("--series-discount") }
  ];
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  const pct = (v) => `${Math.round((v / total) * 100)}%`;

  DonutChart.render($("#donut"), slices, { tooltip: $("#tooltip"), format: money });
  $("#bill-total").textContent = money(bill.charges);
  $("#center-owe").textContent = money(bill.owe);

  $("#legend").replaceChildren(...slices.map((d) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="swatch" style="background:${d.color}"></span><span>${d.label}</span><span class="amt"></span>`;
    li.querySelector(".amt").textContent = money(d.value);
    const p = document.createElement("span");
    p.className = "pct";
    p.textContent = pct(d.value);
    li.querySelector(".amt").append(p);
    return li;
  }));

  $("#bill-rows").replaceChildren(...slices.map((d) => {
    const tr = document.createElement("tr");
    [d.label, money(d.value), pct(d.value)].forEach((t) => { const td = document.createElement("td"); td.textContent = t; tr.append(td); });
    return tr;
  }));

  billSpeech =
    `Your bill was ${money(bill.charges)}. ` +
    `Insurance paid ${money(bill.insurance)}. ` +
    (bill.adjustments ? `You got ${money(bill.adjustments)} in discounts. ` : "") +
    `You owe ${money(bill.owe)}${bill.oweEstimated ? ", which is our estimate" : ""}.`;
  $("#bill-plain").textContent = billSpeech + (bill.owe === 0 ? " 🎉 You don't owe anything." : " Before paying, check that the visit dates and services look right.");
  $("#donut-desc").textContent = billSpeech;
}

$("#bill-read").addEventListener("click", () => {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(billSpeech);
  u.rate = 0.9;
  speechSynthesis.speak(u);
});

// ---------- Boot ----------
(async () => {
  // Dev/testing aid: popup.html?tabId=123 targets a specific tab when the popup
  // is opened as a normal page (used by the end-to-end test and for demos).
  const forced = Number(new URLSearchParams(location.search).get("tabId"));
  tabId = forced || (await activeTab())?.id;
  initPlainLanguages();
  await initSettings();
  await initAI();
  preview();
  updatePlainLangStatus();
  loadStatus();
  const { lastTab } = await chrome.storage.local.get("lastTab");
  const start = document.getElementById(lastTab) || tabs[0];
  selectTab(start, false);
})();
