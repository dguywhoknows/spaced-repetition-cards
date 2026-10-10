const T0 = new Date(2026, 0, 10, 9, 0, 0).getTime();
const DAY = 864e5;

test('newCard normalizes tags and defaults', () => {
  const c = newCard({ front: 'Q', back: 'A', tags: 'Bio, cells  bio #x' }, T0);
  assert.deepEq(c.tags, ['bio', 'cells', 'x']);
  assert.eq(c.ef, 2.5);
  assert.ok(isNew(c));
  assert.eq(cardState(c, T0), 'new');
});

test('SM-2: good answers grow 1d -> 6d -> ~15d', () => {
  let c = newCard({ front: 'Q', back: 'A' }, T0);
  c = schedule(c, 4, T0); assert.eq(c.interval, 1);
  c = schedule(c, 4, T0 + DAY); assert.eq(c.interval, 6);
  c = schedule(c, 4, T0 + 7 * DAY); assert.eq(c.interval, 15);
  assert.eq(c.history.length, 3);
});

test('SM-2: again resets reps, counts a lapse, relearns in 10 minutes', () => {
  let c = schedule(schedule(newCard({ front: 'Q', back: 'A' }, T0), 4, T0), 4, T0);
  c = schedule(c, 1, T0);
  assert.eq(c.reps, 0); assert.eq(c.lapses, 1); assert.eq(c.interval, 0);
  assert.eq(c.due, T0 + 10 * 60e3);
  assert.eq(cardState(c, T0), 'learning');
});

test('ease factor never drops below 1.3 and easy grows it', () => {
  let c = newCard({ front: 'Q', back: 'A' }, T0);
  for (let i = 0; i < 10; i++) c = schedule(c, 1, T0);
  assert.near(c.ef, 1.3, 1e-9);
  assert.ok(schedule(newCard({ front: 'Q', back: 'A' }), 5).ef > 2.5);
});

test('intervalLabel formats days, months, years', () => {
  const c = { ...newCard({ front: 'q', back: 'a' }), reps: 5, interval: 200, ef: 2.5, history: [{}] };
  assert.eq(intervalLabel(c, 1), '10m');
  assert.eq(intervalLabel(c, 4), '1.4y');
  assert.eq(intervalLabel({ ...c, interval: 30 }, 4), '3mo');
});

test('cloze rendering and validation', () => {
  const c = { type: 'cloze', front: 'The {{c::stroma}} hosts the Calvin cycle.', back: 'chloroplast' };
  assert.eq(clozeFront(c), 'The […] hosts the Calvin cycle.');
  assert.eq(clozeBack(c), 'The stroma hosts the Calvin cycle. — chloroplast');
  assert.ok(validCard(c));
  assert.ok(!validCard({ type: 'cloze', front: 'no deletion' }));
  assert.ok(!validCard({ type: 'qa', front: 'Q', back: '' }));
});

test('buildQueue: overdue first, then new up to the daily limit, skips suspended', () => {
  const due1 = { ...newCard({ front: 'a', back: 'a' }), reps: 2, interval: 3, due: T0 - 2 * DAY, history: [{}] };
  const due2 = { ...due1, id: 'd2', due: T0 - DAY };
  const later = { ...due1, id: 'l', due: T0 + DAY };
  const news = [1, 2, 3].map((i) => newCard({ front: 'n' + i, back: 'x' }, T0 + i));
  const susp = { ...due1, id: 's', suspended: true };
  const q = buildQueue([due2, later, ...news, due1, susp], T0, { newLimit: 2, newSeenToday: 1 });
  assert.deepEq(q.map((c) => c.front), ['a', 'a', 'n1']);
  assert.eq(q[0].due, T0 - 2 * DAY);
  assert.eq(buildQueue([due1, later, susp], T0, { cram: true }).length, 2);
});

test('forecast buckets reviews by day, overdue counts today', () => {
  const mk = (due) => ({ ...newCard({ front: 'x', back: 'y' }), reps: 1, interval: 1, due, history: [{}] });
  const f = forecast([mk(T0 - 5 * DAY), mk(T0 + 3600e3), mk(T0 + 2 * DAY), mk(T0 + 40 * DAY), newCard({ front: 'n', back: 'n' })], T0, 7);
  assert.deepEq(f, [2, 0, 1, 0, 0, 0, 0]);
});

test('reviewsPerDay, streak and retention from the review log', () => {
  const log = [{ t: T0, q: 4 }, { t: T0 - DAY, q: 1 }, { t: T0 - DAY + 60e3, q: 4 }, { t: T0 - 2 * DAY, q: 5 }, { t: T0 - 5 * DAY, q: 4 }];
  const days = reviewsPerDay(log, T0, 3);
  assert.deepEq(days.map((d) => d.count), [1, 2, 1]);
  assert.eq(streak(log, T0), 3);
  assert.eq(streak(log.slice(1), T0), 2, 'not reviewing yet today keeps yesterday’s streak');
  assert.near(retention(log, T0 - 10 * DAY), 0.8, 1e-9);
  assert.eq(retention([], 0), null);
});

test('searchCards supports text, tag: and is: filters', () => {
  const a = { ...newCard({ front: 'Mitochondria', back: 'ATP', tags: 'bio' }) };
  const b = { ...newCard({ front: 'Paris', back: 'France', tags: 'geo' }), reps: 3, interval: 30, due: T0 + DAY, lapses: 5, history: [{}] };
  const c = { ...newCard({ front: 'Rome', back: 'Italy', tags: 'geo' }), suspended: true };
  assert.deepEq(searchCards([a, b, c], 'tag:geo', T0).map((x) => x.front), ['Paris', 'Rome']);
  assert.deepEq(searchCards([a, b, c], 'is:new', T0).map((x) => x.front), ['Mitochondria']);
  assert.deepEq(searchCards([a, b, c], 'is:leech', T0).map((x) => x.front), ['Paris']);
  assert.deepEq(searchCards([a, b, c], 'is:mature tag:geo', T0).map((x) => x.front), ['Paris']);
  assert.deepEq(searchCards([a, b, c], 'atp', T0).map((x) => x.front), ['Mitochondria']);
});

test('parseTSV / toTSV round-trip with tags and cloze detection', () => {
  const cards = parseTSV('# comment\nWhat is 2+2?\t4\tmath easy\nThe {{c::sun}} is a star.\t\tspace\n\n');
  assert.eq(cards.length, 2);
  assert.deepEq(cards[0].tags, ['math', 'easy']);
  assert.eq(cards[1].type, 'cloze');
  const back = parseTSV(toTSV(cards.map((c) => newCard(c))));
  assert.eq(back[0].back, '4');
  assert.deepEq(back[1].tags, ['space']);
});
