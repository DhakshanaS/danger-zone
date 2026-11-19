/**
 * Simulated-day test for the Telegram alert engine.
 *
 * Loads apps-script/Code.gs + Telegram.gs into a Node VM with fake Apps Script services
 * (Sheet, Properties, UrlFetch → fake Telegram API), moves a fake clock through one day,
 * and checks that the right alerts fire at the right times.
 *
 *   node tools/test_telegram_sim.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.join(__dirname, '..', 'apps-script');

/* ---------- fake clock (IST) ---------- */
const RealDate = Date;
let NOW = 0;
class FDate extends RealDate {
  constructor(...a) { a.length ? super(...a) : super(NOW); }
  static now() { return NOW; }
}
const at = (h, m) => new FDate(new RealDate(`2026-11-04T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`).getTime());
const go = (h, m) => { NOW = at(h, m).getTime(); };

/* ---------- fake sheet: rows[0] is sheet row 2 ---------- */
const rows = [];
const cell = (r, c) => (rows[r - 2] || [])[c - 1];
const range = (r, c, nr = 1, nc = 1) => ({
  getValues: () => Array.from({length: nr}, (_, i) => Array.from({length: nc}, (_, j) => cell(r + i, c + j) ?? '')),
  getValue: () => cell(r, c) ?? '',
  setValues: v => v.forEach((row, i) => row.forEach((x, j) => { rows[r + i - 2] = rows[r + i - 2] || []; rows[r + i - 2][c + j - 1] = x; })),
  setValue: x => { rows[r - 2] = rows[r - 2] || []; rows[r - 2][c - 1] = x; },
  clearContent: () => { if (rows[r - 2]) rows[r - 2][c - 1] = ''; },
  setFormula: () => {}
});
const sheet = {getName: () => 'Tasks', getLastRow: () => rows.length + 1, getMaxRows: () => 500, getRange: range, insertRowAfter() {}};

/* ---------- fake Telegram ---------- */
let sent = [], updates = [];
const props = {};
const ctx = {
  Date: FDate, console, Math, JSON,
  SpreadsheetApp: {
    getActive: () => ({getSheetByName: () => sheet, getSpreadsheetTimeZone: () => 'Asia/Kolkata', getUrl: () => 'https://sheet'}),
    getUi: () => ({alert() {}})
  },
  Session: {getScriptTimeZone: () => 'Asia/Kolkata', getEffectiveUser: () => ({getEmail: () => 'me@example.com'})},
  PropertiesService: {getScriptProperties: () => ({
    getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; }
  })},
  LockService: {getScriptLock: () => ({tryLock: () => true, releaseLock() {}})},
  Utilities: {
    sleep() {},
    formatDate: (d, tz, f) => {                                   // IST formatting good enough for the test
      const s = new RealDate(d.getTime() + 5.5 * 3600e3);
      return f === 'H' ? String(s.getUTCHours()) : s.toISOString().slice(5, 16).replace('T', ' ');
    }
  },
  UrlFetchApp: {fetch: (url, o) => {
    const method = url.split('/').pop(), p = JSON.parse(o.payload);
    let result = true;
    if (method === 'getUpdates') { result = updates.filter(u => u.update_id >= (p.offset || 0)); updates = []; }
    if (method === 'sendMessage') { sent.push({text: p.text, buttons: !!p.reply_markup}); result = {message_id: 1}; }
    if (method === 'editMessageText') sent.push({text: 'EDIT: ' + p.text, buttons: !!p.reply_markup});
    return {getContentText: () => JSON.stringify({ok: true, result})};
  }},
  MailApp: {sendEmail() {}},
  ScriptApp: {getProjectTriggers: () => []}
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'Telegram.gs'), 'utf8'), ctx);

props.TG_TOKEN = '1:test'; props.TG_CHAT = '42';
rows.push(['Pay electricity bill', 'Critical', at(12, 0), 'To do']);   // row 2
rows.push(['Call mom', 'Medium', at(10, 30), 'Doing']);                // row 3 (already started)
rows.push(['Night task', 'High', at(23, 58), 'To do']);                // row 4 (falls in quiet hours)

let passed = 0;
function tick(label, check) {
  const before = sent.length;
  ctx.telegramTick();
  const out = sent.slice(before);
  try { check(out); passed++; console.log('✅', label.padEnd(44), out.length ? out.map(m => m.text.split('\n')[0].slice(0, 50)).join(' | ') : '(silent)'); }
  catch (e) { console.log('❌', label, '\n   got:', out.map(m => m.text.slice(0, 80))); throw e; }
}
const has = (out, s) => out.some(m => m.text.includes(s));

go(10, 0); ctx.primeSent_();
tick('10:00 nothing due soon', out => assert.strictEqual(out.length, 0));
go(10, 20);
tick('10:20 started task gets 1 calm ping', out => { assert.strictEqual(out.length, 1); assert(has(out, 'finish strong')); });
go(11, 0);
tick('11:00 → 1 hr warning (1 ping + buttons)', out => { assert.strictEqual(out.length, 1); assert(has(out, '1 HOUR LEFT')); assert(out[0].buttons); });
go(11, 1);
tick('11:01 → no duplicate', out => assert.strictEqual(out.length, 0));
go(11, 50);
tick('11:50 → 10 min warning (2 pings)', out => { assert.strictEqual(out.length, 2); assert(has(out, '10 MIN LEFT')); });
go(11, 55);
tick('11:55 → meltdown (3 pings)', out => { assert.strictEqual(out.length, 3); assert(has(out, 'MELTDOWN')); });
go(12, 0);
tick('12:00 → deadline passed (4 pings)', out => { assert.strictEqual(out.length, 4); assert(has(out, 'DEADLINE JUST PASSED')); });
go(12, 31);
tick('12:31 → overdue nag', out => { assert.strictEqual(out.length, 1); assert(has(out, 'still overdue')); });
go(12, 40);
tick('12:40 → no extra nag before 30 min', out => assert.strictEqual(out.length, 0));

updates = [
  {update_id: 5, callback_query: {id: 'c', data: 'go|2', message: {chat: {id: 42}, message_id: 9}}},
  {update_id: 6, message: {chat: {id: 42}, text: 'renew passport'}},
  {update_id: 7, message: {chat: {id: 999}, text: 'spam from a stranger'}}
];
go(12, 41);
tick('12:41 "on it" button + new task via message', out => { assert(has(out, 'EDIT: ▶')); assert(has(out, 'locked in')); });
assert.strictEqual(rows[0][3], 'Doing', '"on it" should set status to Doing');
assert(!rows.some(r => r[0] === 'spam from a stranger'), 'messages from other chats must be ignored');
assert.strictEqual(rows[3][0], 'renew passport');

updates = [
  {update_id: 8, callback_query: {id: 'd', data: 'dl|5|tom', message: {chat: {id: 42}, message_id: 10}}},
  {update_id: 9, callback_query: {id: 'e', data: 'dg|5|Critical', message: {chat: {id: 42}, message_id: 10}}}
];
go(12, 42);
tick('12:42 set deadline + danger via buttons', out => assert(out.filter(m => m.text.startsWith('EDIT')).length === 2));
assert.strictEqual(rows[3][1], 'Critical');
assert(rows[3][2] instanceof FDate && rows[3][2].getHours() === 10, 'deadline should be tomorrow 10:00');

go(13, 1);
tick('13:01 started task → nags stop', out => assert.strictEqual(out.length, 0));
go(23, 0);
tick('23:00 1 hr warning muted (quiet hours)', out => assert.strictEqual(out.length, 0));
go(23, 48);
tick('23:48 10 min warning still rings at night', out => { assert.strictEqual(out.length, 2); assert(has(out, '10 MIN LEFT')); });
updates = [{update_id: 10, message: {chat: {id: 42}, text: '/list'}}];
go(23, 49);
tick('/list command', out => assert(has(out, 'main quest')));

console.log(`\nall ${passed} checks passed ✔`);
