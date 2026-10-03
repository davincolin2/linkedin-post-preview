#!/usr/bin/env node
/*
 * LinkedIn Post Engine: add + validate tool for @yosefdavinc
 *
 *   node tools/posts.js validate                  audit the whole posts array
 *   node tools/posts.js add drafts/<batch>.json   validate + schedule + insert a batch
 *   node tools/posts.js add <file> --dry          run every check but do not write
 *   node tools/posts.js fix-weekdays              recompute every "day" field from its date
 *
 * Draft file = JSON array of objects with these fields:
 *   title, pillar, topic, image, text, comment, strategy, sources (array of URLs or names)
 *   optional: video ({label, search}) or null
 * date / day / month / year / status / pillarLabel are filled automatically.
 *
 * Scheduling: each new post takes the next free calendar day after the latest
 * scheduled post, so two generators never collide and weekdays are always correct.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const ANCHOR = 'const posts = [';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_IDX = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, July: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Canonical taxonomy. New posts must use these exact keys.
const PILLARS = {
  news: '📰 AI News',
  'hot-take': '🔮 Hot Take',
  workflow: '🔧 Workflow',
  agent: '🤖 AI Agents',
  comparison: '⚔️ Comparison',
  toolkit: '📦 Toolkit',
  career: '💼 Career',
  reality: '🪞 Reality Check',
  future: '🚀 Future',
  framework: '🧩 Framework',
  'case-study': '📈 Case Study',
  story: '📖 Story',
  magic: '✨ Magic',
  lifehack: '🧠 Life Hack',
};
const TOPICS = ['national-ai', 'cybersecurity', 'geopolitics', 'career', 'tools', 'news', 'story', 'case-study', 'ugc-content'];

const LIMITS = { text: 3000, comment: 1250 }; // LinkedIn hard limits
const DASH_RE = /[\-\u2010\u2011\u2012\u2013\u2014\u2015]/g;

// The base year for the July 2026 to June 2027 window this archive covers.
function inferYear(monthName) {
  return MONTH_IDX[monthName] <= 5 ? 2027 : 2026;
}

function readIndex() {
  return fs.readFileSync(INDEX, 'utf8');
}

function loadPosts(html) {
  const m = html.match(/const posts = (\[[\s\S]*?\n\]);/);
  if (!m) throw new Error('posts array not found in index.html');
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

function postDate(p) {
  const [mn, dd] = String(p.month).split(' ');
  if (!(mn in MONTH_IDX)) return null;
  const year = p.year || inferYear(mn);
  return new Date(year, MONTH_IDX[mn], parseInt(dd || p.date, 10));
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\\n/g, '\n');
}

function checkPost(p, i, allPosts, errors, warnings, isNew) {
  const tag = `[${isNew ? 'NEW' : '#' + i}] ${String(p.title || '').slice(0, 50)}`;
  for (const f of ['title', 'pillar', 'image', 'text', 'comment', 'strategy']) {
    if (!p[f]) errors.push(`${tag}: missing field "${f}"`);
  }
  if (!isNew) return;

  if (!(p.pillar in PILLARS)) errors.push(`${tag}: pillar "${p.pillar}" not in ${Object.keys(PILLARS).join(', ')}`);
  if (!TOPICS.includes(p.topic)) errors.push(`${tag}: topic "${p.topic}" not in ${TOPICS.join(', ')}`);

  for (const f of ['title', 'text', 'comment', 'strategy']) {
    const plain = stripHtml(p[f]).replace(/https?:\/\/\S+/g, ''); // URLs may contain hyphens
    const d = plain.match(DASH_RE);
    if (d) errors.push(`${tag}: ${d.length} dash/hyphen char(s) in "${f}"`);
  }

  const textLen = stripHtml(p.text).length;
  const commentLen = stripHtml(p.comment).length;
  if (textLen > LIMITS.text) errors.push(`${tag}: text ${textLen} chars > LinkedIn limit ${LIMITS.text}`);
  if (commentLen > LIMITS.comment) errors.push(`${tag}: comment ${commentLen} chars > LinkedIn limit ${LIMITS.comment}`);
  if (!/class="hook"/.test(p.text)) errors.push(`${tag}: text has no <span class="hook">`);
  if (!/class="ht"/.test(p.text)) errors.push(`${tag}: text has no hashtag <span class="ht">`);

  if (!Array.isArray(p.sources) || p.sources.length === 0) {
    errors.push(`${tag}: no "sources". Every factual claim needs a source (news URL or outlet name)`);
  }

  if (!fs.existsSync(path.join(ROOT, p.image))) errors.push(`${tag}: image file not found: ${p.image}`);
  if (!/_wm\.(jpg|png)$/.test(p.image)) warnings.push(`${tag}: image name should end in _wm.jpg / _wm.png`);
  const reused = allPosts.filter((o) => o.image === p.image).length;
  if (reused > 0) errors.push(`${tag}: image ${p.image} already used by another post`);
  const titleDup = allPosts.some((o) => o.title === p.title);
  if (titleDup) errors.push(`${tag}: duplicate title`);
}

function validateAll(posts) {
  const errors = [];
  const warnings = [];
  posts.forEach((p, i) => checkPost(p, i, [], errors, warnings, false));

  const imgs = {};
  posts.forEach((p, i) => { if (p.image) (imgs[p.image] = imgs[p.image] || []).push(i); });
  Object.entries(imgs).filter(([, v]) => v.length > 1).forEach(([k, v]) => warnings.push(`duplicate image ${k} at ${v.join(',')}`));

  const missing = posts.filter((p) => p.image && !fs.existsSync(path.join(ROOT, p.image)));
  missing.forEach((p) => errors.push(`missing image file ${p.image}`));

  let wrongDay = 0;
  posts.forEach((p) => { const d = postDate(p); if (d && WEEKDAYS[d.getDay()] !== p.day) wrongDay++; });
  if (wrongDay) warnings.push(`${wrongDay} posts have a weekday that does not match their date (run fix-weekdays)`);

  const unknownPillar = posts.filter((p) => !(p.pillar in PILLARS)).map((p) => p.pillar);
  if (unknownPillar.length) warnings.push(`legacy pillars outside taxonomy: ${[...new Set(unknownPillar)].join(', ')}`);
  return { errors, warnings };
}

function latestDate(posts) {
  let max = null;
  posts.forEach((p) => { const d = postDate(p); if (d && (!max || d > max)) max = d; });
  return max;
}

function serialize(p) {
  const s = (v) => JSON.stringify(v).replace(/<\/script/gi, '<\\/script');
  const lines = [
    `    date: ${s(p.date)}, day: ${s(p.day)}, month: ${s(p.month)}, year: ${p.year}, pillar: ${s(p.pillar)}, pillarLabel: ${s(p.pillarLabel)}, status: ${s(p.status)}, topic: ${s(p.topic)},`,
    `    title: ${s(p.title)},`,
    `    image: ${s(p.image)},`,
    `    video: ${p.video ? s(p.video) : 'null'},`,
    `    sources: ${s(p.sources)},`,
    `    text: ${s(p.text)},`,
    `    comment: ${s(p.comment)},`,
    `    strategy: ${s(p.strategy)}`,
  ];
  return '  {\n' + lines.join('\n') + '\n  },';
}

function cmdValidate() {
  const posts = loadPosts(readIndex());
  const { errors, warnings } = validateAll(posts);
  console.log(`posts: ${posts.length}`);
  warnings.forEach((w) => console.log('WARN ', w));
  errors.forEach((e) => console.log('ERROR', e));
  console.log(errors.length ? `\nFAILED: ${errors.length} error(s)` : '\nOK: no blocking errors');
  process.exit(errors.length ? 1 : 0);
}

function cmdAdd(file, dry, start) {
  if (!file) throw new Error('usage: node tools/posts.js add <drafts.json> [--dry] [--start today|YYYY-MM-DD]');
  const drafts = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (!Array.isArray(drafts) || drafts.length === 0) throw new Error('draft file must be a non empty JSON array');

  const html = readIndex();
  const posts = loadPosts(html);
  const errors = [];
  const warnings = [];

  const seenImg = new Set();
  drafts.forEach((d, i) => {
    checkPost(d, i, posts, errors, warnings, true);
    if (seenImg.has(d.image)) errors.push(`[NEW] ${d.title}: image reused inside the same batch`);
    seenImg.add(d.image);
  });

  // Schedule: default = next free day after the latest scheduled post (evergreen content).
  // --start today|YYYY-MM-DD = consecutive days from that date (time sensitive news).
  let cursor;
  if (start) {
    const base = start === 'today' ? new Date() : new Date(start + 'T00:00:00');
    if (isNaN(base)) throw new Error('bad --start value, use today or YYYY-MM-DD');
    cursor = new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1);
  } else {
    cursor = latestDate(posts) || new Date();
  }
  const scheduled = drafts.map((d) => {
    cursor.setDate(cursor.getDate() + 1);
    const mn = MONTHS[cursor.getMonth()];
    const dd = String(cursor.getDate()).padStart(2, '0');
    const month = `${mn} ${dd}`;
    const clash = posts.filter((o) => o.month === month || o.month === `${mn} ${cursor.getDate()}`).length;
    if (clash) warnings.push(`${month} already has ${clash} post(s); this one will share the date`);
    return {
      date: String(cursor.getDate()),
      day: WEEKDAYS[cursor.getDay()],
      month: `${mn} ${dd}`,
      year: cursor.getFullYear(),
      pillar: d.pillar,
      pillarLabel: PILLARS[d.pillar] || d.pillar,
      status: 'buffer',
      topic: d.topic,
      title: d.title,
      image: d.image,
      video: d.video || null,
      sources: d.sources || [],
      text: d.text,
      comment: d.comment,
      strategy: d.strategy,
    };
  });

  warnings.forEach((w) => console.log('WARN ', w));
  errors.forEach((e) => console.log('ERROR', e));
  if (errors.length) {
    console.log(`\nREJECTED: ${errors.length} error(s). Nothing written.`);
    process.exit(1);
  }

  // Newest date goes on top of the feed.
  const block = scheduled.slice().reverse().map(serialize).join('\n');
  scheduled.forEach((p) => console.log(`scheduled ${p.day} ${p.month} ${p.year} | ${p.pillar}/${p.topic} | ${p.image}`));
  if (dry) { console.log('\nDRY RUN OK: nothing written.'); return; }

  const at = html.indexOf(ANCHOR);
  if (at < 0) throw new Error('anchor not found');
  const insertAt = at + ANCHOR.length;
  const out = html.slice(0, insertAt) + '\n' + block + html.slice(insertAt);
  fs.writeFileSync(INDEX, out, 'utf8');

  const after = loadPosts(readIndex());
  console.log(`\nINSERTED ${scheduled.length} posts. Total now ${after.length}.`);
}

function cmdFixWeekdays() {
  let html = readIndex();
  const posts = loadPosts(html);
  let fixed = 0;
  // Patch each object's day field in place by matching its exact month + date + title triple.
  posts.forEach((p) => {
    const d = postDate(p);
    if (!d) return;
    const correct = WEEKDAYS[d.getDay()];
    if (correct === p.day) return;
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(date:\\s*"${esc(String(p.date))}",\\s*day:\\s*")${esc(p.day)}("\\s*,\\s*month:\\s*"${esc(p.month)}")`);
    if (re.test(html)) { html = html.replace(re, `$1${correct}$2`); fixed++; }
  });
  fs.writeFileSync(INDEX, html, 'utf8');
  console.log(`fixed weekday on ${fixed} posts`);
}

const argv = process.argv.slice(2);
const cmd = argv[0];
const positional = argv.slice(1).filter((a, i, arr) => !a.startsWith('--') && arr[i - 1] !== '--start');
const startIdx = argv.indexOf('--start');
const startVal = startIdx > -1 ? argv[startIdx + 1] : null;
try {
  if (cmd === 'validate') cmdValidate();
  else if (cmd === 'add') cmdAdd(positional[0], argv.includes('--dry'), startVal);
  else if (cmd === 'fix-weekdays') cmdFixWeekdays();
  else console.log('commands: validate | add <drafts.json> [--dry] [--start today|YYYY-MM-DD] | fix-weekdays');
} catch (e) {
  console.error('FATAL', e.message);
  process.exit(1);
}
