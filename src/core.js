/* Scheduling, queues, statistics and import/export for the flashcard app (pure, unit-tested). */

var DAY_MS = 864e5;

function uid() { return Math.random().toString(36).slice(2, 10); }

function newCard(c, now) {
  return {
    id: c.id || uid(), type: c.type === 'cloze' ? 'cloze' : 'qa', front: String(c.front || ''), back: String(c.back || ''),
    tags: normalizeTags(c.tags), ef: 2.5, interval: 0, reps: 0, lapses: 0, due: 0, suspended: false, created: now || Date.now(), history: [],
  };
}
function normalizeTags(t) {
  var list = Array.isArray(t) ? t : String(t || '').split(/[\s,]+/);
  return list.map(function (x) { return String(x).trim().toLowerCase().replace(/[^a-z0-9_:-]/g, ''); }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
}

var isNew = function (c) { return c.reps === 0 && !c.history.length; };
var isDue = function (c, now) { return !c.suspended && !isNew(c) && c.due <= now; };
var isLeech = function (c) { return c.lapses >= 4; };
function cardState(c, now) {
  if (c.suspended) return 'suspended';
  if (isNew(c)) return 'new';
  if (c.interval === 0) return 'learning';
  if (c.due <= now) return 'due';
  return c.interval >= 21 ? 'mature' : 'young';
}

/* SM-2 with a relearning step: failed cards come back in 10 minutes. q: 1 again, 3 hard, 4 good, 5 easy. */
function schedule(c, q, now) {
  now = now || Date.now();
  var n = Object.assign({}, c);
  if (q < 3) { n.reps = 0; n.interval = 0; n.lapses = (c.lapses || 0) + 1; }
  else {
    n.reps = c.reps + 1;
    if (n.reps === 1) n.interval = q === 5 ? 3 : 1;
    else if (n.reps === 2) n.interval = q === 3 ? 3 : 6;
    else n.interval = Math.max(c.interval + 1, Math.round(c.interval * (q === 3 ? 1.2 : c.ef * (q === 5 ? 1.3 : 1))));
  }
  n.ef = Math.max(1.3, c.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  n.due = q < 3 ? now + 10 * 60e3 : now + n.interval * DAY_MS;
  n.history = (c.history || []).concat([{ t: now, q: q }]);
  return n;
}
function intervalLabel(c, q, now) {
  var n = schedule(c, q, now || 0);
  if (q < 3) return '10m';
  return n.interval >= 365 ? (n.interval / 365).toFixed(1) + 'y' : n.interval >= 31 ? Math.round(n.interval / 30) + 'mo' : n.interval + 'd';
}

/* Cloze helpers: "The {{c::stroma}} hosts the Calvin cycle." */
function clozeFront(c) { return c.type === 'cloze' ? c.front.replace(/\{\{c::(.*?)\}\}/g, '[…]') : c.front; }
function clozeBack(c) { return c.type === 'cloze' ? c.front.replace(/\{\{c::(.*?)\}\}/g, '$1') + (c.back ? ' — ' + c.back : '') : c.back; }
function validCard(c) { return !!String(c.front || '').trim() && (c.type !== 'cloze' || /\{\{c::.+?\}\}/.test(c.front)) && (c.type === 'cloze' || !!String(c.back || '').trim()); }

/* Study queue: due reviews (most overdue first), then new cards up to the remaining daily limit.
   cram=true ignores scheduling and returns every unsuspended card. */
function buildQueue(cards, now, opts) {
  opts = opts || {};
  var active = cards.filter(function (c) { return !c.suspended; });
  if (opts.cram) return active.slice();
  var due = active.filter(function (c) { return isDue(c, now); }).sort(function (a, b) { return a.due - b.due; });
  if (opts.reviewLimit != null) due = due.slice(0, opts.reviewLimit);
  var newLeft = Math.max(0, (opts.newLimit == null ? 20 : opts.newLimit) - (opts.newSeenToday || 0));
  var fresh = active.filter(isNew).sort(function (a, b) { return a.created - b.created; }).slice(0, newLeft);
  return due.concat(fresh);
}

function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

/* How many reviews fall on each of the next `days` days (overdue counted today). */
function forecast(cards, now, days) {
  var s = startOfDay(now), out = [];
  for (var i = 0; i < days; i++) out.push(0);
  cards.forEach(function (c) {
    if (c.suspended || isNew(c)) return;
    var i = Math.max(0, Math.floor((c.due - s) / DAY_MS));
    if (i < days) out[i]++;
  });
  return out;
}

/* Review log helpers. log entries: {t, q, cardId, deckId} */
function reviewsPerDay(log, now, days) {
  var counts = {};
  log.forEach(function (r) { var k = dayKey(r.t); counts[k] = (counts[k] || 0) + 1; });
  var out = [], end = startOfDay(now);
  for (var i = days - 1; i >= 0; i--) { var t = end - i * DAY_MS; out.push({ date: dayKey(t), count: counts[dayKey(t)] || 0 }); }
  return out;
}
function streak(log, now) {
  var days = {};
  log.forEach(function (r) { days[dayKey(r.t)] = true; });
  var n = 0, t = startOfDay(now);
  if (!days[dayKey(t)]) t -= DAY_MS; // today not done yet doesn't break the streak
  while (days[dayKey(t)]) { n++; t -= DAY_MS; }
  return n;
}
function retention(log, since) {
  var r = log.filter(function (x) { return x.t >= since; });
  return r.length ? r.filter(function (x) { return x.q >= 3; }).length / r.length : null;
}
function newSeenToday(log, cardsById, now) {
  var s = startOfDay(now), seen = {};
  log.forEach(function (r) { if (r.t >= s && r.first) seen[r.cardId] = 1; });
  return Object.keys(seen).length;
}

/* Card browser search: free text + tag:x + is:new|due|suspended|leech|mature + deck filter. */
function searchCards(cards, query, now) {
  var tokens = String(query || '').trim().split(/\s+/).filter(Boolean);
  return cards.filter(function (c) {
    return tokens.every(function (tok) {
      var m = tok.match(/^(tag|is):(.+)$/i);
      if (m && m[1].toLowerCase() === 'tag') return c.tags.indexOf(m[2].toLowerCase()) >= 0;
      if (m) { var v = m[2].toLowerCase(); return v === 'leech' ? isLeech(c) : cardState(c, now) === v || (v === 'due' && isDue(c, now)); }
      return (c.front + ' ' + c.back).toLowerCase().indexOf(tok.toLowerCase()) >= 0;
    });
  });
}

/* Anki-style TSV import: front<TAB>back[<TAB>tags]. Lines starting with # are comments. Cloze detected from {{c::}}. */
function parseTSV(text) {
  return String(text).replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() && l[0] !== '#'; }).map(function (l) {
    var p = l.split('\t');
    var front = (p[0] || '').trim(), back = (p[1] || '').trim();
    return { type: /\{\{c::/.test(front) ? 'cloze' : 'qa', front: front, back: back, tags: normalizeTags(p[2] || '') };
  }).filter(function (c) { return c.front; });
}
function toTSV(cards) {
  var clean = function (s) { return String(s || '').replace(/[\t\n]/g, ' '); };
  return cards.map(function (c) { return [clean(c.front), clean(c.back), c.tags.join(' ')].join('\t'); }).join('\n');
}
