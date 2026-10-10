# spaced-repetition-cards

[![tests](https://github.com/dguywhoknows/spaced-repetition-cards/actions/workflows/tests.yml/badge.svg)](https://github.com/dguywhoknows/spaced-repetition-cards/actions/workflows/tests.yml)

Paste your notes and get AI-written flashcards, then study them with SM-2 spaced repetition.

Live: https://dguywhoknows.github.io/spaced-repetition-cards/

## Overview

FlashForge turns raw notes into well-formed flashcards that follow the minimum-information principle: one atomic fact per card, mixing Q&A and cloze deletions. You review and edit every card before saving, then study with a full SM-2 scheduler like Anki's. While studying, an AI tutor can explain why an answer is right or invent a mnemonic for a card you keep missing.

## Pages

- **Decks**
- **Create**
- **Study**
- **Browse**
- **Stats**
- **Settings**

## Features

- AI card generation with Q&A / cloze mix and a configurable card count
- Inline editor to tweak, retype or delete cards before saving
- SM-2 spaced repetition with Again/Hard/Good/Easy and interval previews
- 3D flip cards with keyboard shortcuts (Space, 1-4)
- Stats: due/new/mature counts, 30-day retention, 14-day review forecast, hardest cards
- Export to JSON or Anki-compatible TSV, plus JSON import
- Everything persists in localStorage, no account needed
- Five pages: Decks dashboard, Create, Study, Browse, Stats (plus Settings)
- Card browser with query syntax (tag:, is:new|due|suspended|leech|mature), multi-select and bulk suspend / tag / reset / move / delete
- In-place card editor with an AI 'improve wording' pass
- Tags on every card; leech detection after 4 lapses
- Daily new-card limit, per-session review cap, cram mode that doesn't touch scheduling, and undo of the last grade
- Stats page: 26-week activity heatmap, 30-day forecast, card-state breakdown, retention per deck, study streak
- Anki-style TSV import/export alongside JSON decks

## How it works

LLM calls are used for:

- JSON-mode card generation from your notes using spaced-repetition best practices
- 'Why is this the answer?' tutoring grounded in the deck's original notes
- On-demand mnemonic generation for stubborn cards

Everything else (scheduling, study sessions, statistics, charts, import/export) runs locally in the browser.

## Getting started

No build step and no dependencies. Serve the folder with any static server:

```bash
git clone https://github.com/dguywhoknows/spaced-repetition-cards.git
cd spaced-repetition-cards
python -m http.server 8000
```

Then open http://localhost:8000.

### Configuration

Without an API key the app runs in demo mode with sample model output. To use a live model, open
**Settings → Configure provider** and paste a key for [Groq](https://console.groq.com/keys) or
[OpenRouter](https://openrouter.ai/keys). The key is stored in this browser's `localStorage` (namespaced to
this app) and is sent only to the selected provider.

## Testing

`src/core.js` holds the app's logic as pure functions and is covered by 11 unit tests.

```bash
node tests/run-node.js        # CI runs this on every push
```

Or open `tests/index.html` in a browser ([live](https://dguywhoknows.github.io/spaced-repetition-cards/tests/)).

## Project structure

```
index.html           markup for every page
src/app.js           UI, page wiring and event handlers
src/core.js          pure logic with no DOM access (unit-tested)
src/demo.js          sample responses used when no API key is configured
src/lib/ai.js        LLM client: Groq / OpenRouter, streaming, JSON mode, retries
src/lib/dom.js       DOM helpers, namespaced storage, markdown renderer
src/lib/router.js    hash router and the Settings page
styles/base.css      design tokens and shared components
styles/app.css       app-specific styles
tests/               unit tests (browser runner + Node runner for CI)
```

## Tech

- SM-2 algorithm implementation
- CSS 3D transforms for card flips
- SVG forecast chart
- Pure scheduler, queue builder, search parser and statistics in src/core.js with unit tests in CI
- Vanilla JavaScript, no framework or bundler
- Deployed with GitHub Pages

## License

MIT
