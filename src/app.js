const { $, $$, h, esc, busy, toast, download, store, md, rng } = Kit;

/* ---------------- state ---------------- */
let S = store.get('state', null);
const save = () => store.set('state', S);
const allCards = () => S.decks.flatMap((d) => d.cards.map((c) => Object.assign(c, { _deck: d.id })));
const deckOf = (id) => S.decks.find((d) => d.id === id);
const cardById = (id) => allCards().find((c) => c.id === id);
const strip = (c) => { const { _deck, ...rest } = c; return rest; };
const now = () => Date.now();

function seed() {
  const r = rng(7), t = now();
  const bio = { id: uid(), name: 'Photosynthesis (sample)', notes: DEMO_NOTES, created: t - 60 * DAY_MS, cards: DEMO_CARDS.map((c, i) => newCard(c, t - 60 * DAY_MS + i)) };
  const geo = { id: uid(), name: 'World capitals (sample)', notes: '', created: t - 20 * DAY_MS, cards: DEMO_GEO.map((c, i) => newCard(c, t - 20 * DAY_MS + i)) };
  const log = [];
  // Simulate two months of realistic study so every page has data to show.
  for (let d = 59; d >= 1; d--) {
    if (r() < 0.22) continue;
    const day = t - d * DAY_MS;
    [bio, geo].forEach((deck) => {
      deck.cards.forEach((c, i) => {
        const fresh = c.history.length === 0;
        if (deck === geo && d > 20) return;
        if (!(fresh ? i < (60 - d) / 4 : c.due <= day)) return;
        const q = r() < 0.12 + (i === 4 ? 0.35 : 0) ? 1 : r() < 0.15 ? 3 : r() < 0.85 ? 4 : 5;
        Object.assign(c, schedule(c, q, day + i * 60e3));
        log.push({ t: day + i * 60e3, q, cardId: c.id, deckId: deck.id, first: fresh });
      });
    });
  }
  bio.cards[11].suspended = true;
  return { decks: [bio, geo], log, prefs: { newLimit: 20, reviewLimit: 200 } };
}
if (!S) { S = seed(); save(); }

/* ---------------- decks (home) ---------------- */
function deckStats(d, t = now()) {
  return { due: d.cards.filter((c) => isDue(c, t)).length, fresh: Math.min(d.cards.filter((c) => isNew(c) && !c.suspended).length, S.prefs.newLimit), mature: d.cards.filter((c) => c.interval >= 21).length, total: d.cards.length };
}
function renderDecks() {
  const t = now(), cards = allCards();
  const dueAll = cards.filter((c) => isDue(c, t)).length;
  const todayN = S.log.filter((r) => r.t >= startOfDay(t)).length;
  $('#todaySummary').textContent = dueAll ? `${dueAll} card${dueAll > 1 ? 's' : ''} due today.` : 'Nothing due right now.';
  const ret = retention(S.log, t - 30 * DAY_MS);
  $('#homeKpis').innerHTML = [['Due today', dueAll], ['Reviewed today', todayN], ['Streak', streak(S.log, t) + ' days'], ['30-day retention', ret == null ? '—' : Math.round(ret * 100) + '%']].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  const box = $('#deckList');
  box.innerHTML = '';
  if (!S.decks.length) box.append(h('div', { class: 'empty' }, 'No decks yet. Create one from your notes.'));
  S.decks.forEach((d) => {
    const st = deckStats(d, t);
    box.append(h('div', { class: 'card deck' },
      h('div', { class: 'row between' }, h('h2', {}, d.name), h('button', { class: 'btn ghost sm', title: 'Rename', onclick: () => { const n = prompt('Deck name', d.name); if (n && n.trim()) { d.name = n.trim(); save(); renderDecks(); } } }, '✎')),
      h('div', { class: 'small muted' }, `${st.total} cards · created ${new Date(d.created).toLocaleDateString()}`),
      h('div', { class: 'nums' }, h('span', {}, h('b', { style: 'color:var(--accent)' }, st.due), 'due'), h('span', {}, h('b', {}, st.fresh), 'new'), h('span', {}, h('b', {}, st.mature), 'mature')),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary sm', onclick: () => { $('#studyDeck').value = d.id; Router.go('study'); startStudy(); } }, 'Study'),
        h('button', { class: 'btn sm', onclick: () => { $('#createDeck').value = d.id; syncCreateDeck(); Router.go('create'); } }, 'Add cards'),
        h('button', { class: 'btn ghost sm', onclick: () => { $('#bDeck').value = d.id; Router.go('browse'); } }, 'Browse'),
        h('button', { class: 'btn ghost sm', onclick: () => download(d.name.replace(/\W+/g, '_') + '.json', JSON.stringify({ ...d, cards: d.cards.map(strip) }, null, 2), 'application/json') }, 'Export'),
        h('button', { class: 'btn ghost sm danger', onclick: () => { if (confirm(`Delete deck "${d.name}" and its ${d.cards.length} cards?`)) { S.decks = S.decks.filter((x) => x !== d); save(); renderDecks(); } } }, 'Delete'))));
  });
  refreshDeckSelects();
}
function refreshDeckSelects() {
  const opts = (all) => (all ? '<option value="*">All decks</option>' : '') + S.decks.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  [['#studyDeck', true], ['#bDeck', true]].forEach(([sel, all]) => { const el = $(sel), cur = el.value; el.innerHTML = opts(all); el.value = [...el.options].some((o) => o.value === cur) ? cur : '*'; });
  const cd = $('#createDeck'), cur = cd.value;
  cd.innerHTML = '<option value="__new">+ New deck</option>' + opts(false);
  cd.value = [...cd.options].some((o) => o.value === cur) ? cur : '__new';
  $('#moveTo').innerHTML = '<option value="">Move to deck…</option>' + opts(false);
  syncCreateDeck();
}
$('#newDeckBtn').onclick = () => { $('#createDeck').value = '__new'; syncCreateDeck(); Router.go('create'); };
$('#importFile').onchange = async (e) => {
  const f = e.target.files[0];
  try {
    const text = await f.text();
    if (/\.json$/i.test(f.name)) {
      const d = JSON.parse(text);
      if (!Array.isArray(d.cards)) throw new Error('Not a deck file');
      S.decks.push({ id: uid(), name: d.name || f.name, notes: d.notes || '', created: now(), cards: d.cards.map((c) => ({ ...newCard(c), ...c, id: uid(), tags: normalizeTags(c.tags) })) });
      toast(`Imported ${d.cards.length} cards`);
    } else {
      const cards = parseTSV(text);
      if (!cards.length) throw new Error('No cards found. Expected front<TAB>back[<TAB>tags] per line.');
      S.decks.push({ id: uid(), name: f.name.replace(/\.\w+$/, ''), notes: '', created: now(), cards: cards.map((c) => newCard(c)) });
      toast(`Imported ${cards.length} cards from TSV`);
    }
    save(); renderDecks();
  } catch (err) { toast(err.message, 'err'); }
  e.target.value = '';
};

/* ---------------- create ---------------- */
let draft = [];
function syncCreateDeck() { $('#newDeckRow').classList.toggle('hidden', $('#createDeck').value !== '__new'); }
$('#createDeck').onchange = syncCreateDeck;
function renderDraft() {
  const box = $('#draft');
  box.innerHTML = '';
  $('#draftCount').textContent = draft.length + ' cards';
  $('#saveDeck').disabled = !draft.length;
  if (!draft.length) { box.append(h('div', { class: 'empty' }, 'Generated cards appear here. Edit anything before saving.')); return; }
  draft.forEach((c, i) => {
    const front = h('textarea', { rows: 2, oninput: (e) => { c.front = e.target.value; } }); front.value = c.front;
    const back = h('textarea', { rows: 2, oninput: (e) => { c.back = e.target.value; }, placeholder: c.type === 'cloze' ? 'Optional extra context' : 'Answer' }); back.value = c.back;
    box.append(h('div', { class: 'dc' + (validCard(c) ? '' : ' invalid') },
      h('div', { class: 'row' },
        h('select', { style: 'width:auto;padding:3px 6px;font-size:12px', onchange: (e) => { c.type = e.target.value; renderDraft(); } }, h('option', { value: 'qa', selected: c.type === 'qa' }, 'Q&A'), h('option', { value: 'cloze', selected: c.type === 'cloze' }, 'Cloze')),
        h('button', { class: 'btn ghost sm danger', onclick: () => { draft.splice(i, 1); renderDraft(); } }, 'Remove')),
      front, back,
      c.type === 'cloze' && !/\{\{c::/.test(c.front) ? h('span', { class: 'small', style: 'color:var(--warn)' }, 'Cloze cards need {{c::answer}} in the front.') : null));
  });
}
async function generate() {
  const notes = $('#notes').value.trim();
  if (notes.length < 40) return toast('Paste at least a paragraph of notes', 'err');
  const n = +$('#nCards').value, mix = $('#mix').value;
  const out = await AI.chat([
    { role: 'system', content: `You are an expert at writing spaced-repetition flashcards (minimum-information principle: one atomic fact per card, unambiguous, no yes/no questions).
Types: "qa" = {"type":"qa","front":"question","back":"short answer"}; "cloze" = {"type":"cloze","front":"sentence with exactly one {{c::hidden answer}}","back":"optional extra context"}.
Return JSON {"cards":[...]} only.` },
    { role: 'user', content: `Write ${n} cards (${mix === 'mixed' ? 'about 60% qa, 40% cloze' : mix + ' only'}) covering the most important, testable ideas in these notes:\n\n${notes.slice(0, 12000)}` },
  ], { json: true, temperature: 0.4, maxTokens: 3000, demo: { cards: DEMO_CARDS.slice(0, n) } });
  draft = (out.cards || []).filter((c) => c.front).map((c) => ({ type: c.type === 'cloze' ? 'cloze' : 'qa', front: String(c.front), back: String(c.back || '') }));
  renderDraft();
}
$('#gen').onclick = (e) => busy(e.currentTarget, generate);
$('#addCard').onclick = () => { draft.push({ type: 'qa', front: '', back: '' }); renderDraft(); };
$('#saveDeck').onclick = () => {
  const good = draft.filter(validCard);
  if (!good.length) return toast('No valid cards to save', 'err');
  const tags = normalizeTags($('#createTags').value);
  let d = deckOf($('#createDeck').value);
  if (!d) { d = { id: uid(), name: $('#deckName').value.trim() || 'Untitled deck', notes: $('#notes').value, created: now(), cards: [] }; S.decks.push(d); }
  good.forEach((c) => d.cards.push(newCard({ ...c, tags: [...tags, ...normalizeTags(c.tags)] })));
  save();
  toast(`Saved ${good.length} card${good.length > 1 ? 's' : ''} to “${d.name}”${draft.length > good.length ? ` (${draft.length - good.length} invalid skipped)` : ''}`);
  draft = []; renderDraft();
  Router.go('decks');
};

/* ---------------- study ---------------- */
let session = null, undoStack = [];
const GRADES = [{ k: 'again', q: 1, label: 'Again', key: '1' }, { k: 'hard', q: 3, label: 'Hard', key: '2' }, { k: 'good', q: 4, label: 'Good', key: '3' }, { k: 'easy', q: 5, label: 'Easy', key: '4' }];
const clozeBackHTML = (c) => (c.type === 'cloze' ? esc(c.front).replace(/\{\{c::(.*?)\}\}/g, '<span class="cloze">$1</span>') + (c.back ? `<div class="small muted" style="margin-top:10px">${esc(c.back)}</div>` : '') : esc(c.back));
function startStudy() {
  refreshDeckSelects();
  const sel = $('#studyDeck').value, t = now();
  const pool = allCards().filter((c) => sel === '*' || c._deck === sel);
  const q = buildQueue(pool, t, { cram: $('#cram').checked, newLimit: S.prefs.newLimit, reviewLimit: S.prefs.reviewLimit, newSeenToday: newSeenToday(S.log, null, t) });
  session = { queue: q.map((c) => c.id), done: 0, cram: $('#cram').checked };
  undoStack = [];
  renderCard();
}
function renderCard() {
  const box = $('#cardBox'), s = session;
  $('#queueInfo').textContent = `${s.queue.length} left · ${s.done} reviewed${s.cram ? ' · cram (no scheduling)' : ''}`;
  $('#progress').style.width = (s.done + s.queue.length ? (100 * s.done) / (s.done + s.queue.length) : 100) + '%';
  if (!s.queue.length) {
    const next = allCards().filter((c) => !isNew(c) && !c.suspended).map((c) => c.due).sort((a, b) => a - b)[0];
    box.innerHTML = `<div class="card empty"><h2>All caught up</h2><p>${s.done ? `You reviewed ${s.done} cards.` : 'Nothing is due right now.'}${next ? ` Next review: ${new Date(next).toLocaleString()}.` : ''}</p><p class="small">Turn on cram mode to practice anyway, or add new cards.</p></div>`;
    return;
  }
  const c = cardById(s.queue[0]);
  if (!c) { s.queue.shift(); return renderCard(); }
  s.flipped = false;
  const flash = h('div', { class: 'flash card', style: 'padding:0', tabindex: 0, role: 'button', 'aria-label': 'Flip card' },
    h('div', { class: 'inner' },
      h('div', { class: 'face front' }, h('div', { html: esc(clozeFront(c)).replace(/\[…\]/g, '<span class="cloze">[…]</span>') }), h('span', { class: 'hint' }, `${deckOf(c._deck)?.name || ''}${c.tags.length ? ' · ' + c.tags.map((x) => '#' + x).join(' ') : ''}`)),
      h('div', { class: 'face back' }, h('div', { html: clozeBackHTML(c) }), h('span', { class: 'hint' }, isLeech(c) ? 'leech: consider rewriting this card' : ''))));
  const grades = h('div', { class: 'grades hidden' }, GRADES.map((g) => h('button', { class: 'btn g-' + g.k, onclick: () => grade(g.q) }, g.label, h('small', {}, (s.cram ? '' : intervalLabel(c, g.q) + ' · '), h('kbd', {}, g.key)))));
  const why = h('div', { class: 'prose', style: 'margin-top:12px' });
  const tools = h('div', { class: 'row hidden', style: 'margin-top:10px;justify-content:center' },
    h('button', { class: 'btn ghost sm', onclick: (e) => busy(e.currentTarget, () => explain(c, why)) }, 'Why?'),
    h('button', { class: 'btn ghost sm', onclick: (e) => busy(e.currentTarget, () => mnemonic(c, why)) }, 'Mnemonic'),
    h('button', { class: 'btn ghost sm', onclick: () => editCard(c.id, true) }, 'Edit'),
    h('button', { class: 'btn ghost sm', onclick: () => suspendCurrent() }, '⏸ Suspend'));
  const flip = () => { if (s.flipped) return; s.flipped = true; flash.classList.add('flipped'); grades.classList.remove('hidden'); tools.classList.remove('hidden'); };
  flash.onclick = flip;
  box.innerHTML = '';
  box.append(flash, grades, tools, why, h('div', { class: 'row', style: 'justify-content:center;margin-top:8px' }, undoStack.length ? h('button', { class: 'btn ghost sm', onclick: undo }, '↶ Undo last grade') : null));
  s.flip = flip;
}
function grade(q) {
  const s = session, id = s.queue.shift(), c = cardById(id), d = deckOf(c._deck), t = now();
  undoStack.push({ id, before: JSON.stringify(strip(c)), logLen: S.log.length, queue: [id, ...s.queue], done: s.done });
  if (!s.cram) {
    const fresh = isNew(c);
    const n = schedule(strip(c), q, t);
    d.cards[d.cards.findIndex((x) => x.id === id)] = n;
    S.log.push({ t, q, cardId: id, deckId: d.id, first: fresh });
    save();
  }
  if (q < 3) s.queue.splice(Math.min(3, s.queue.length), 0, id); else s.done++;
  renderCard();
}
function undo() {
  const u = undoStack.pop();
  if (!u) return;
  const c = cardById(u.id), d = deckOf(c._deck);
  d.cards[d.cards.findIndex((x) => x.id === u.id)] = JSON.parse(u.before);
  S.log.length = u.logLen;
  session.queue = u.queue; session.done = u.done;
  save(); renderCard();
}
function suspendCurrent() {
  const id = session.queue.shift(), c = cardById(id);
  c.suspended = true; save();
  toast('Card suspended. Find it in Browse with is:suspended');
  renderCard();
}
document.addEventListener('keydown', (e) => {
  if (Router.current !== 'study' || !session || /input|textarea|select/i.test(e.target.tagName)) return;
  if (e.key.toLowerCase() === 'u') return undo();
  if (!session.queue.length) return;
  if (e.code === 'Space') { e.preventDefault(); session.flip(); }
  const g = GRADES.find((x) => x.key === e.key);
  if (g && session.flipped) grade(g.q);
  if (e.key.toLowerCase() === 'e' && session.flipped) editCard(session.queue[0], true);
  if (e.key.toLowerCase() === 's' && session.flipped) suspendCurrent();
});
$('#studyDeck').onchange = startStudy;
$('#cram').onchange = startStudy;
$('#newLimit').onchange = (e) => { S.prefs.newLimit = Math.max(0, +e.target.value || 0); save(); startStudy(); };
$('#reviewLimit').onchange = (e) => { S.prefs.reviewLimit = Math.max(10, +e.target.value || 200); save(); startStudy(); };

async function explain(c, out) {
  const d = deckOf(c._deck);
  const text = await AI.chat([
    { role: 'system', content: 'You are a patient tutor. Explain why the answer is correct in 2-4 sentences, linking it to the bigger idea. Markdown allowed.' },
    { role: 'user', content: `Deck notes (context):\n${(d.notes || '').slice(0, 4000)}\n\nCard question: ${clozeFront(c)}\nAnswer: ${clozeBack(c)}` },
  ], { temperature: 0.4, demo: `The answer follows from the core idea of **${d.name}**: ${clozeBack(c)}. Linking it to *why* the process works this way makes it much easier to recall than memorizing the phrase.\n\n*(Demo explanation. Add an API key in Settings for real tutoring.)*` });
  out.innerHTML = md(text);
}
async function mnemonic(c, out) {
  const text = await AI.chat([
    { role: 'system', content: 'Invent one short, vivid, memorable mnemonic (acronym, rhyme or image) for this fact. One or two sentences.' },
    { role: 'user', content: `Q: ${clozeFront(c)}\nA: ${clozeBack(c)}` },
  ], { temperature: 0.9, demo: '*Picture the answer written in giant glowing letters on the question itself.* Vivid, absurd images stick better than plain repetition. *(demo)*' });
  out.innerHTML = md(text);
}

/* ---------------- browse ---------------- */
let selected = new Set();
function browseList() {
  const deck = $('#bDeck').value;
  return searchCards(allCards().filter((c) => deck === '*' || c._deck === deck), $('#bq').value, now());
}
function renderBrowse() {
  refreshDeckSelects();
  const list = browseList(), t = now();
  selected = new Set([...selected].filter((id) => list.some((c) => c.id === id)));
  $('#bCount').textContent = `${list.length} card${list.length === 1 ? '' : 's'}`;
  $('#selCount').textContent = selected.size;
  const all = h('input', { type: 'checkbox', 'aria-label': 'Select all', checked: list.length && selected.size === list.length, onchange: (e) => { selected = new Set(e.target.checked ? list.map((c) => c.id) : []); renderBrowse(); } });
  const tb = $('#bTable');
  tb.innerHTML = '';
  tb.append(h('tr', {}, h('th', {}, all), h('th', {}, 'Front'), h('th', {}, 'Deck'), h('th', {}, 'Tags'), h('th', {}, 'State'), h('th', {}, 'Due'), h('th', {}, 'Ease'), h('th', {}, 'Lapses')));
  list.slice(0, 300).forEach((c) => {
    const st = cardState(c, t);
    tb.append(h('tr', { class: selected.has(c.id) ? 'sel' : '' },
      h('td', {}, h('input', { type: 'checkbox', 'aria-label': 'Select card', checked: selected.has(c.id), onchange: (e) => { e.target.checked ? selected.add(c.id) : selected.delete(c.id); $('#selCount').textContent = selected.size; } })),
      h('td', { class: 'clickable', onclick: () => editCard(c.id) }, clozeFront(c).slice(0, 90)),
      h('td', { class: 'small' }, deckOf(c._deck)?.name || ''),
      h('td', { class: 'small' }, c.tags.map((x) => h('span', { class: 'tag' }, x))),
      h('td', {}, h('span', { class: 'tag ' + ({ due: 'warn', suspended: '', new: 'accent', mature: 'good' }[st] || '') }, st), isLeech(c) ? h('span', { class: 'tag bad' }, 'leech') : null),
      h('td', { class: 'small mono' }, isNew(c) ? '—' : new Date(c.due).toLocaleDateString()),
      h('td', { class: 'small mono' }, c.ef.toFixed(2)),
      h('td', { class: 'small mono' }, c.lapses)));
  });
  if (list.length > 300) tb.append(h('tr', {}, h('td', { colspan: 8, class: 'small muted' }, `Showing 300 of ${list.length}. Refine the search.`)));
}
function editCard(id, fromStudy = false) {
  const c = cardById(id), d = deckOf(c._deck);
  if (fromStudy) Router.go('browse');
  const box = $('#editor');
  box.classList.remove('hidden');
  const front = h('textarea', { rows: 3 }); front.value = c.front;
  const back = h('textarea', { rows: 3 }); back.value = c.back;
  const tags = h('input', { class: 'input', value: c.tags.join(' ') });
  const type = h('select', {}, h('option', { value: 'qa', selected: c.type === 'qa' }, 'Q&A'), h('option', { value: 'cloze', selected: c.type === 'cloze' }, 'Cloze'));
  box.innerHTML = '';
  box.append(h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, 'Edit card'), h('button', { class: 'btn ghost sm', onclick: () => box.classList.add('hidden') }, '✕')),
    h('div', { class: 'grid cols-2', style: 'margin-top:10px' }, h('label', {}, 'Front', front), h('label', {}, 'Back', back)),
    h('div', { class: 'grid cols-2' }, h('label', {}, 'Type', type), h('label', {}, 'Tags', tags)),
    h('p', { class: 'small muted' }, `Reviewed ${c.history.length}× · ease ${c.ef.toFixed(2)} · interval ${c.interval}d · lapses ${c.lapses}`),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => {
      const next = { ...strip(c), front: front.value, back: back.value, type: type.value, tags: normalizeTags(tags.value) };
      if (!validCard(next)) return toast('Card is incomplete (cloze needs {{c::…}}, Q&A needs a back)', 'err');
      d.cards[d.cards.findIndex((x) => x.id === id)] = next;
      save(); box.classList.add('hidden'); renderBrowse(); toast('Card saved');
    } }, 'Save'), h('button', { class: 'btn', onclick: (e) => busy(e.currentTarget, async () => {
      const out = await AI.chat([{ role: 'system', content: 'Rewrite this flashcard to follow the minimum-information principle: atomic, unambiguous, concise. Keep the same fact. Return JSON {"front":"","back":""}.' }, { role: 'user', content: JSON.stringify({ front: front.value, back: back.value, type: type.value }) }], { json: true, temperature: 0.3, demo: { front: front.value.replace(/\s+/g, ' ').trim(), back: back.value.split(/[.;]/)[0].trim() } });
      front.value = out.front || front.value; back.value = out.back ?? back.value;
      toast('Suggestion applied. Review, then Save.');
    }) }, 'Improve wording')));
  box.scrollIntoView({ behavior: 'smooth' });
}
$('#bq').addEventListener('input', renderBrowse);
$('#bDeck').onchange = renderBrowse;
$$('[data-bulk]').forEach((b) => (b.onclick = () => {
  if (!selected.size) return toast('Select some cards first', 'err');
  const ids = [...selected], act = b.dataset.bulk;
  if (act === 'delete' && !confirm(`Delete ${ids.length} cards?`)) return;
  let tag = '';
  if (act === 'tag') { tag = normalizeTags(prompt('Tag to add') || '')[0]; if (!tag) return; }
  S.decks.forEach((d) => {
    if (act === 'delete') d.cards = d.cards.filter((c) => !selected.has(c.id));
    else d.cards = d.cards.map((c) => {
      if (!selected.has(c.id)) return c;
      if (act === 'suspend') return { ...c, suspended: true };
      if (act === 'unsuspend') return { ...c, suspended: false };
      if (act === 'tag') return { ...c, tags: normalizeTags([...c.tags, tag]) };
      if (act === 'reset') return { ...newCard(c), id: c.id, created: c.created };
      return c;
    });
  });
  save(); toast(`${act[0].toUpperCase() + act.slice(1)}: ${ids.length} card${ids.length > 1 ? 's' : ''}`);
  if (act === 'delete') selected.clear();
  renderBrowse();
}));
$('#moveTo').onchange = (e) => {
  const target = deckOf(e.target.value);
  if (!target || !selected.size) { e.target.value = ''; return; }
  const moving = allCards().filter((c) => selected.has(c.id)).map(strip);
  S.decks.forEach((d) => { d.cards = d.cards.filter((c) => !selected.has(c.id)); });
  target.cards.push(...moving);
  save(); toast(`Moved ${moving.length} cards to “${target.name}”`); e.target.value = ''; renderBrowse();
};
$('#exportSel').onclick = () => { const cards = selected.size ? allCards().filter((c) => selected.has(c.id)) : browseList(); download('cards.tsv', toTSV(cards), 'text/tab-separated-values'); };

/* ---------------- stats ---------------- */
function renderStats() {
  const cards = allCards(), t = now();
  const ret = retention(S.log, t - 30 * DAY_MS);
  const per = reviewsPerDay(S.log, t, 182);
  const avg = per.slice(-30).reduce((a, d) => a + d.count, 0) / 30;
  $('#statTiles').innerHTML = [['Cards', cards.length], ['Due now', cards.filter((c) => isDue(c, t)).length], ['Reviews (30d)', per.slice(-30).reduce((a, d) => a + d.count, 0)], ['Daily average', avg.toFixed(1)], ['Retention (30d)', ret == null ? '—' : Math.round(ret * 100) + '%'], ['Current streak', streak(S.log, t) + ' days']].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  const max = Math.max(1, ...per.map((d) => d.count));
  const first = new Date(per[0].date + 'T00:00').getDay();
  const cells = Array(first).fill(null).concat(per);
  const cols = Math.ceil(cells.length / 7);
  let svg = '';
  cells.forEach((d, i) => { if (!d) return; const x = Math.floor(i / 7) * 14, y = (i % 7) * 14; const lv = d.count ? 0.25 + 0.75 * (d.count / max) : 0; svg += `<rect x="${x}" y="${y}" width="11" height="11" rx="2" fill="${d.count ? 'var(--accent)' : 'var(--panel-2)'}" fill-opacity="${d.count ? lv : 1}"><title>${d.date}: ${d.count} reviews</title></rect>`; });
  $('#heatmap').innerHTML = `<svg viewBox="0 0 ${cols * 14} ${7 * 14}" width="100%" style="max-width:${cols * 14 * 1.6}px" role="img" aria-label="Review activity heatmap">${svg}</svg>`;
  const f = forecast(cards, t, 30), fm = Math.max(1, ...f), W = 600, H = 140;
  $('#forecast').innerHTML = `<svg viewBox="0 0 ${W} ${H + 20}" width="100%" role="img" aria-label="Review forecast">${f.map((v, i) => { const bw = W / 30 - 3, x = i * (W / 30), bh = (v / fm) * (H - 16); return `<rect x="${x}" y="${H - bh}" width="${bw}" height="${bh}" rx="2" fill="var(--accent)" opacity="${i ? 0.7 : 1}"><title>${i ? '+' + i + 'd' : 'today'}: ${v}</title></rect>${i % 5 === 0 ? `<text x="${x + bw / 2}" y="${H + 14}" font-size="10" text-anchor="middle" fill="var(--muted)">${i ? '+' + i + 'd' : 'today'}</text>` : ''}`; }).join('')}</svg>`;
  const states = {};
  cards.forEach((c) => { const s = cardState(c, t); states[s] = (states[s] || 0) + 1; });
  const colors = { new: 'var(--accent)', learning: '#c98a0b', due: '#d64545', young: '#2f7de1', mature: '#1f9d63', suspended: '#8a90a2' };
  const tot = cards.length || 1;
  $('#states').innerHTML = `<div class="stackbar">${Object.entries(states).map(([k, v]) => `<span style="width:${(100 * v) / tot}%;background:${colors[k]}" title="${k}: ${v}"></span>`).join('')}</div><div class="row small" style="margin-top:8px">${Object.entries(states).map(([k, v]) => `<span><i class="sw" style="background:${colors[k]}"></i>${k} ${v}</span>`).join('')}</div>`;
  $('#deckRet').innerHTML = S.decks.map((d) => { const r = retention(S.log.filter((x) => x.deckId === d.id), t - 30 * DAY_MS); return `<div class="bar-row"><span>${esc(d.name)}</span><div class="bar"><span style="width:${r == null ? 0 : r * 100}%"></span></div><b class="mono">${r == null ? '—' : Math.round(r * 100) + '%'}</b></div>`; }).join('') || '<div class="empty">No reviews yet.</div>';
  const hard = cards.filter((c) => c.history.length).sort((a, b) => b.lapses - a.lapses || a.ef - b.ef).slice(0, 8);
  $('#hardest').innerHTML = hard.length ? `<table><tr><th>Card</th><th>Lapses</th><th>Ease</th></tr>${hard.map((c) => `<tr class="clickable" data-id="${c.id}"><td>${isLeech(c) ? '⚠ ' : ''}${esc(clozeFront(c).slice(0, 70))}</td><td>${c.lapses}</td><td>${c.ef.toFixed(2)}</td></tr>`).join('')}</table>` : '<div class="empty">Study a few cards to see which ones give you trouble.</div>';
  $$('#hardest tr[data-id]').forEach((tr) => (tr.onclick = () => { Router.go('browse'); editCard(tr.dataset.id); }));
}

/* ---------------- routing ---------------- */
Router.on('decks', renderDecks);
Router.on('create', () => { refreshDeckSelects(); renderDraft(); });
Router.on('study', () => { $('#newLimit').value = S.prefs.newLimit; $('#reviewLimit').value = S.prefs.reviewLimit; startStudy(); });
Router.on('browse', renderBrowse);
Router.on('stats', renderStats);
$('#notes').value = DEMO_NOTES;
