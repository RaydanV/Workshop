# AccessMed

A Manifest V3 browser extension that makes healthcare patient portals usable for
people with visual, motor, and cognitive or literacy barriers. It works on any
portal (Epic MyChart, Cerner, athenahealth, hospital billing sites) with no
cooperation from the vendor.

## Try it in 60 seconds

1. Chrome / Edge: open `chrome://extensions`, enable **Developer mode**, click
   **Load unpacked**, choose this folder.
   Firefox 128+: open `about:debugging#/runtime/this-firefox`, **Load Temporary
   Add-on**, choose `manifest.json`.
2. Serve the demo portal (content scripts don't run on `file://` by default):
   ```bash
   python3 -m http.server 8000
   # open http://localhost:8000/demo/patient-portal.html
   ```
3. Click the AccessMed toolbar icon.

## Architecture

```
accessmed/
├── manifest.json                 MV3; works in Chrome and Firefox (both background keys)
├── background/
│   └── service-worker.js         default settings, keyboard shortcuts → active tab
├── content/                      injected into every page, in this order:
│   ├── timeout-guard-main.js     MAIN world, document_start: spots session-timeout timers
│   ├── namespace.js              window.AccessMed: shared speak(), announce(), settings
│   ├── a11y-fixer.js             audit + repair: labels, alt text, focusability, headers, lang
│   ├── visual.js                 high contrast, font scaling, dyslexia spacing, text-to-speech
│   ├── plain-language.js         jargon glossary + DOM rewriter (also runs in Node and the popup)
│   ├── reading-ruler.js          focus band that follows mouse or keyboard focus
│   ├── voice-commands.js         Web Speech API command grammar
│   ├── billing-parser.js         finds bill/EOB tables → charges, insurance, discounts, owed
│   ├── timeout-guard.js          auto-"Stay signed in", activity pulse, draft autosave
│   ├── keyboard-nav.js           arrow-key calendars, typed-date fallback, menus, skip link
│   ├── panic.js                  Help me button and calm-down screen
│   ├── content.js                orchestrator: settings → modules, popup message router
│   └── content.css               all injected styles, prefixed accessmed-
├── popup/
│   ├── popup.html / .css / .js   four ARIA tabs: See, Move, Understand, My bill
│   └── donut-chart.js            dependency-free SVG chart with keyboard tooltips
├── demo/patient-portal.html      deliberately broken portal for the live demo
└── tests/
    ├── plain-language.test.js    `npm test` (no dependencies)
    └── e2e.mjs                   `npm run e2e`: loads the real extension in Chromium
```

**Data flow.** Settings live in `chrome.storage.sync`. The popup writes them, and
every open tab reacts through `storage.onChanged`, so there is no message plumbing
for toggles. The popup only messages the tab for things that need page data:
`GET_STATUS`, `PARSE_BILL`, `VOICE_COMMAND`, `READ_ALOUD`, `PANIC`.

**Why two timeout scripts.** Content scripts run in an isolated JavaScript world
and cannot see the page's `setTimeout`. A tiny MAIN-world script flags long timers
whose code mentions logout/session/idle and leaves a note on `<html>`. The
isolated script then warns early and presses the portal's own extend button.
It never cancels server-side expiry, so security policy is respected.

**Privacy.** Everything runs locally. No page content leaves the browser.
Draft autosave uses `sessionStorage` and skips password, card and SSN fields.

## Features and how to demo them

| Barrier | Feature | Demo move |
|---|---|---|
| Visual | Auto-labels icon buttons, images, fields | Inspect the top-bar icons before and after |
| Visual | High contrast, text size up to 200%, Alt+hover to hear | See tab |
| Motor | Voice: "scroll down", "click messages", "read prescription summary", "bigger text", "help me" | Move tab → Start voice control, or type the command |
| Motor | Timeout guard | Wait 70 s on the demo: the dialog is dismissed automatically and a green banner appears |
| Motor | Calendar arrow keys, PageUp/Down, typed MM/DD/YYYY box, keyboard menus | Tab to the calendar, use arrows and Enter |
| Cognitive | Plain Language with original on hover/focus | Understand tab → toggle, read the prescription card |
| Cognitive | Reading ruler: Alt+↑/↓ move, Alt+[ / ] resize | Alt+Shift+R |
| Cognitive | Bill breakdown chart, plain summary, read-aloud, table view | Scroll to the statement, open My bill |
| All | Help me button: one press to a call link, bigger text, read aloud, guided breathing | Click the red button or say "help me" |

Keyboard shortcuts: Alt+Shift+R ruler, Alt+Shift+V voice, Alt+Shift+H help screen.

## Plain-language approach

`content/plain-language.js` is a curated glossary of about 100 billing and clinical
terms, compiled into one regex sorted longest-first, so "explanation of
benefits" wins over "benefits". Short abbreviations (PO, BID, STAT, EOB) only
match in capitals, which avoids false hits like "stat" in "statement". The
DOM rewriter walks text nodes only. Each replaced term becomes a focusable span
that keeps the original word in a tooltip, so a caregiver or clinician can still
see the exact term. Terms whose meaning flips with context ("positive",
"negative") are deliberately left out.

**Languages.** There is a glossary per language (English and Spanish today) in
`LANGUAGES`. By default each piece of text uses the language of its nearest
`lang=""` attribute, so a Spanish section on an English page gets Spanish plain
words; pages in a language with no glossary are left unchanged. Users can force
one language in the popup (Understand tab). Spanish matching ignores missing
accents ("hipertension") and skips ambiguous words ("prima", "agudo", "lesión").
To add a language, add a glossary plus its `caseSensitive` list and tooltip strings.

**AI summaries (optional, Chrome only).** `content/ai-rewrite.js` uses Chrome's
built-in Prompt API (`LanguageModel`, stable for extensions since Chrome 138) to
write a simpler version of each hard paragraph (80–1,500 characters; not menus,
forms or tables). It runs entirely on the device.
- The portal's text is never changed. The simpler version appears in a labelled
  box underneath: "written by AI… may contain mistakes… the text above is the original".
- `content/ai-core.js` checks every rewrite before showing it. It must keep every
  number, dose with its unit, date and money amount, and must not add numbers
  (except those that BID/TID/q8h stand for). Anything that fails is dropped.
- Paragraphs on screen go first, one at a time. Results are cached in memory only.
- Turn it on in the popup (Understand tab). The first time, that click starts
  Chrome's one-time model download. Needs a GPU with more than 4 GB of memory, or
  16 GB RAM and 4 cores, plus 22 GB free disk. On Firefox and unsupported machines
  the switch is hidden or disabled, and the glossary keeps working as before.
- The check can't catch everything (a dropped "not", a changed medication name),
  which is why the original always stays in view.

## Hackathon pitch

- **Impact where it hurts most.** About 1 in 4 US adults has a disability, and
  only 12% have proficient health literacy. Patient portals now gate test results,
  prescriptions and bills. AccessMed removes the barriers that make people miss
  results, get signed out mid-message, or pay bills they don't understand. It
  needs no hospital IT project.
- **Works on portals we don't control.** Heuristics infer labels from icon class
  names, detect timeout timers across JavaScript worlds, and read bill tables by
  column meaning, not fixed layouts. Everything runs locally, so no protected
  health information ever leaves the device. That makes it HIPAA-friendly by
  design.
- **One layer for three kinds of disability.** Voice control, the reading ruler,
  plain language and the Help me screen work together. A single voice command
  like "read prescription summary" finds the section, simplifies it and reads it
  aloud. The bill chart turns a 6-column explanation of benefits into one sentence:
  "You owe $448.93."

## Known limits (be upfront with judges)

- Speech recognition works in Chrome and Edge only. Firefox users get the typed
  command box, which runs the same command handler.
- An extension cannot place a phone call. The Help me screen uses a `tel:` link,
  which opens the phone app, FaceTime, Skype or a paired phone. It needs one
  deliberate press so nobody calls 911 by accident.
- Label guessing is heuristic. Anything it can't infer is labeled
  "Unlabeled control" rather than hidden, so screen-reader users know it exists.
- The glossary is a demonstration set and needs clinical review before real use.
- Add 16/48/128 px icons to `manifest.json` before publishing.
