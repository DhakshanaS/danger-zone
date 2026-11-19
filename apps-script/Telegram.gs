/**
 * ⚡ DANGER ZONE — Telegram alerts (runs 24x7 on Google's servers)
 * Paste into Apps Script as a new script file named "Telegram".
 * Connect from the sheet menu: ⚡ Danger Zone → 🤖 Connect Telegram.
 *
 * What it does every minute:
 *  • Reads your Tasks sheet and pings you as deadlines approach:
 *      3 hrs → 1 hr → 10 min (2 pings) → 5 min "meltdown" (3 pings) → deadline passed (4 pings)
 *  • Overdue High/Critical tasks get a nudge every 30 min until you start, finish or snooze them.
 *  • Every alert has buttons: ▶ on it · ✅ done · 😴 30 min. Starting a task stops its alerts (same as panic mode).
 *  • Any message you send the bot becomes a task. Tap buttons to set the deadline + danger.
 *  • Quiet hours 11 PM – 7 AM: only deadlines within 10 min (or just passed) can wake you.
 *
 * The bot token is stored in Script Properties (private to you), never in the sheet.
 */

const TG_QUIET_START = 23, TG_QUIET_END = 7;   // quiet hours (24h clock, your time zone)
const TG_NAG_EVERY_MIN = 30;
const TG_W = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const TG_ICON = { Critical: '💀', High: '🔥', Medium: '😐', Low: '🌱' };
const TG_LABEL = { Critical: 'critical af', High: 'high key', Medium: 'mid', Low: 'low key' };
const TG_PRAISE = ['u ate that. no crumbs. 💅', 'that\'s a W. stack another?', 'main character energy fr',
  'future u is screaming thank u', '+1000 aura ✨', 'boss fight cleared 🎮', 'brain RAM freed up 🧠'];
// id, minutes before deadline, number of pings, skip if you've already started it
const TG_LEVELS = [
  ['3h', 180, 1, true], ['1h', 60, 1, true], ['10m', 10, 2, false], ['5m', 5, 3, true], ['due', 0, 4, false]
];

/* ---------------- plumbing ---------------- */
function tgProps_() { return PropertiesService.getScriptProperties(); }
function tgToken_() { return tgProps_().getProperty('TG_TOKEN'); }
function tgChat_() { return tgProps_().getProperty('TG_CHAT'); }
function tgLinked_() { return !!(tgToken_() && tgChat_()); }
function tgEsc_(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function tgJson_(key) { try { return JSON.parse(tgProps_().getProperty(key) || '{}'); } catch (e) { return {}; } }

function tgApi_(method, payload) {
  const token = tgToken_();
  if (!token) throw new Error('Telegram is not connected');
  const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload || {}), muteHttpExceptions: true
  });
  const j = JSON.parse(res.getContentText());
  if (!j.ok) throw new Error('Telegram: ' + j.description);
  return j.result;
}
function tgSend_(text, buttons, silent) {
  const p = { chat_id: tgChat_(), text: text, parse_mode: 'HTML', disable_web_page_preview: true, disable_notification: !!silent };
  if (buttons) p.reply_markup = { inline_keyboard: buttons };
  return tgApi_('sendMessage', p);
}
function tgEdit_(msg, text, buttons) {
  const p = { chat_id: msg.chat.id, message_id: msg.message_id, text: text, parse_mode: 'HTML' };
  if (buttons) p.reply_markup = { inline_keyboard: buttons };
  try { tgApi_('editMessageText', p); } catch (e) { /* "message is not modified" etc. */ }
}

function tgTz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone() || Session.getScriptTimeZone(); }
function tgWhen_(ts) { return ts ? Utilities.formatDate(new Date(ts), tgTz_(), 'EEE d MMM, h:mm a') : 'no deadline'; }
function tgLeft_(ms) {
  const late = ms < 0; let m = Math.round(Math.abs(ms) / 60000);
  if (m === 0) return 'time\'s up';
  const d = Math.floor(m / 1440); m %= 1440; const h = Math.floor(m / 60); m %= 60;
  const s = (d ? d + 'd ' : '') + (h ? h + 'h ' : '') + m + 'm';
  return late ? s + ' late' : s + ' left';
}
function tgHourNow_() { return +Utilities.formatDate(new Date(), tgTz_(), 'H'); }
function tgQuietHours_() { const h = tgHourNow_(); return TG_QUIET_START > TG_QUIET_END ? (h >= TG_QUIET_START || h < TG_QUIET_END) : (h >= TG_QUIET_START && h < TG_QUIET_END); }
function tgScore_(t, now) {
  const w = TG_W[t.danger] || 2;
  if (!t.deadline) return w * 0.5;
  const h = (t.deadline - now) / 3600e3;
  return h < 0 ? 100000 + w * 1000 - h : (w * 100) / Math.max(h, 0.25);
}
function tgAlertButtons_(row) {
  return [[{ text: '▶ on it', callback_data: 'go|' + row }, { text: '✅ done', callback_data: 'ok|' + row }],
          [{ text: '😴 snooze 30 min', callback_data: 'zz|' + row }]];
}
function tgAddButtons_(row) {
  // callback format: kind|row|arg
  const b = (text, kind, arg) => ({ text: text, callback_data: kind + '|' + row + '|' + arg });
  return [
    [b('in 1 hr', 'dl', '1h'), b('today 6pm', 'dl', '18'), b('tonight 9pm', 'dl', '21')],
    [b('tmrw 10am', 'dl', 'tom'), b('in 3 days', 'dl', '3d'), b('no deadline', 'dl', 'none')],
    [b('💀', 'dg', 'Critical'), b('🔥', 'dg', 'High'), b('😐', 'dg', 'Medium'), b('🌱', 'dg', 'Low')]
  ];
}

/* ---------------- menu actions ---------------- */
function connectTelegram() {
  const ui = SpreadsheetApp.getUi(), p = tgProps_();
  const r = ui.prompt('🤖 Connect Telegram', 'Paste your bot token from @BotFather (looks like 123456789:AAH...):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const token = r.getResponseText().trim();
  if (!/^\d+:[\w-]{30,}$/.test(token)) return ui.alert('That doesn\'t look like a bot token. It should look like 123456789:AAH...');
  p.setProperty('TG_TOKEN', token);
  ['TG_CHAT', 'TG_OFFSET', 'TG_SENT', 'TG_SNZ', 'TG_QUIET'].forEach(k => p.deleteProperty(k));
  let me;
  try { me = tgApi_('getMe'); tgApi_('deleteWebhook', {}); }
  catch (e) { p.deleteProperty('TG_TOKEN'); return ui.alert('Telegram rejected that token: ' + e.message); }

  const go = ui.alert('Almost there',
    'On your phone, open Telegram, search for @' + me.username + ', tap START (or send /start).\n\nThen click OK here.', ui.ButtonSet.OK_CANCEL);
  if (go !== ui.Button.OK) return;
  const ups = tgApi_('getUpdates', { timeout: 0 });
  const msgs = ups.map(u => u.message).filter(m => m && m.chat && m.chat.type === 'private');
  if (!msgs.length) return ui.alert('No message reached the bot yet. Send /start to @' + me.username + ', then run Connect Telegram again.');
  p.setProperty('TG_CHAT', String(msgs[msgs.length - 1].chat.id));
  p.setProperty('TG_OFFSET', String(ups[ups.length - 1].update_id + 1));

  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'telegramTick').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('telegramTick').timeBased().everyMinutes(1).create();
  primeSent_();
  tgSend_('🔒 <b>linked. danger zone will ping u here 24x7.</b>\n\n' + TG_HELP);
  ui.alert('✅ Telegram linked. Check your phone.');
}

function disconnectTelegram() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'telegramTick').forEach(t => ScriptApp.deleteTrigger(t));
  const p = tgProps_();
  try { if (tgLinked_()) tgSend_('🔌 disconnected. no more pings from the sheet.'); } catch (e) {}
  ['TG_TOKEN', 'TG_CHAT', 'TG_OFFSET', 'TG_SENT', 'TG_SNZ', 'TG_QUIET'].forEach(k => p.deleteProperty(k));
  SpreadsheetApp.getUi().alert('🔌 Telegram disconnected.');
}

function testTelegram() {
  if (!tgLinked_()) return SpreadsheetApp.getUi().alert('Connect Telegram first.');
  tgSend_('🚨🚨 <b>TEST ALERT</b>\nthis is what a 5-min meltdown ping looks like. 3 buzzes incoming…');
  for (let i = 0; i < 2; i++) { Utilities.sleep(1500); tgSend_(i ? '🔔🔔🔔' : '🚨 still ringing'); }
  SpreadsheetApp.getUi().alert('Sent 3 test pings. If your phone stayed quiet, check the notification settings in SETUP (Telegram section).');
}

/* Don't fire old thresholds for deadlines that were already close/past when you linked. */
function primeSent_() {
  const now = Date.now(), sent = {};
  getTasks().filter(t => t.status !== 'Done' && t.deadline).forEach(t => {
    const base = t.row + '|' + t.deadline, left = (t.deadline - now) / 60000;
    TG_LEVELS.forEach(([id, mins]) => { if (left <= mins) sent[base + '|' + id] = 1; });
    if (left < 0) sent[base + '|nag'] = Math.floor(-left / TG_NAG_EVERY_MIN);
  });
  tgProps_().setProperty('TG_SENT', JSON.stringify(sent));
}

/* ---------------- the every-minute heartbeat ---------------- */
function telegramTick() {
  if (!tgLinked_()) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    try { tgPoll_(); } catch (e) { console.error('poll', e); }
    tgAlerts_();
  } finally { lock.releaseLock(); }
}

function tgAlerts_() {
  const p = tgProps_(), now = Date.now();
  const sent = tgJson_('TG_SENT'), snz = tgJson_('TG_SNZ');
  const quietAll = now < +(p.getProperty('TG_QUIET') || 0);
  const night = tgQuietHours_();
  const tasks = getTasks().filter(t => t.status !== 'Done' && t.deadline);
  const keep = {}, live = new Set();

  tasks.forEach(t => {
    const base = t.row + '|' + t.deadline; live.add(base);
    const left = (t.deadline - now) / 60000, doing = t.status === 'Doing';
    const snoozed = now < (snz[t.row] || 0);

    // deadline thresholds: fire the tightest one crossed that hasn't fired yet
    const crossed = TG_LEVELS.filter(([, mins]) => left <= mins);
    const fresh = crossed.filter(([id]) => !sent[base + '|' + id]);
    crossed.forEach(([id]) => { sent[base + '|' + id] = 1; });
    if (fresh.length && !quietAll && !snoozed) {
      const [id, mins, pings, skipIfDoing] = fresh[fresh.length - 1];
      const urgentEnough = mins <= 10;
      const tooLate = id === 'due' && left < -15;   // sheet was closed / just linked: let the nag handle it
      if (!(doing && skipIfDoing) && !tooLate && (!night || urgentEnough)) tgRing_(t, id, doing ? 1 : pings, left);
    }

    // overdue nags for High/Critical
    if (left < -TG_NAG_EVERY_MIN && (TG_W[t.danger] || 0) >= 3) {
      const idx = Math.floor(-left / TG_NAG_EVERY_MIN), k = base + '|nag';
      if ((sent[k] || 0) < idx) {
        sent[k] = idx;
        if (!doing && !snoozed && !quietAll && !night) tgRing_(t, 'nag', 1, left);
      }
    }
  });

  Object.keys(sent).forEach(k => { const b = k.split('|').slice(0, 2).join('|'); if (live.has(b)) keep[k] = sent[k]; });
  p.setProperty('TG_SENT', JSON.stringify(keep));
  Object.keys(snz).forEach(r => { if (snz[r] < now) delete snz[r]; });
  p.setProperty('TG_SNZ', JSON.stringify(snz));
}

function tgRing_(t, id, pings, leftMin) {
  const name = '<b>' + tgEsc_(t.task) + '</b>';
  const meta = (TG_ICON[t.danger] || '') + ' ' + (TG_LABEL[t.danger] || t.danger) + ' · due ' + tgWhen_(t.deadline);
  const doing = t.status === 'Doing';
  const head = {
    '3h': '😬 <b>3 hrs left</b> — tense mode',
    '1h': '😰 <b>1 HOUR LEFT</b> — panic mode',
    '10m': doing ? '⏳ <b>10 min left</b> — u\'re on it, finish strong' : '🚨 <b>10 MIN LEFT</b>',
    '5m': '🚨🚨 <b>5 MIN. MELTDOWN.</b>\ndon\'t think. just do the first tiny step.',
    'due': doing ? '💀 <b>deadline just passed</b> — wrap it up or tell someone it\'ll be late' : '💀💀 <b>DEADLINE JUST PASSED</b>',
    'nag': '👀 <b>still overdue</b> (' + tgLeft_(leftMin * 60000) + ')… just saying'
  }[id];
  tgSend_(head + '\n\n' + name + '\n' + meta, tgAlertButtons_(t.row));
  const echoes = ['🚨 ' + tgEsc_(t.task), '🔔🔔🔔', '🚨🚨🚨 ' + tgLeft_(leftMin * 60000)];
  for (let i = 1; i < pings; i++) { Utilities.sleep(1500); tgSend_(echoes[(i - 1) % echoes.length]); }
}

/* ---------------- incoming: messages + button taps ---------------- */
const TG_HELP =
  '• send me <b>any message</b> → it becomes a task\n' +
  '• /list → what\'s on fire rn\n' +
  '• /quiet → no pings for 1 hr\n' +
  '• /loud → pings back on\n' +
  '• /help → this';

function tgPoll_() {
  const p = tgProps_();
  const ups = tgApi_('getUpdates', { offset: +(p.getProperty('TG_OFFSET') || 0), timeout: 0, allowed_updates: ['message', 'callback_query'] });
  ups.forEach(u => {
    p.setProperty('TG_OFFSET', String(u.update_id + 1));
    try {
      if (u.callback_query) tgCallback_(u.callback_query);
      else if (u.message) tgMessage_(u.message);
    } catch (e) { console.error('update', e); }
  });
}

function tgMessage_(m) {
  if (!m.chat || String(m.chat.id) !== tgChat_() || !m.text) return;   // ignore anyone who isn't you
  const t = m.text.trim(), cmd = t.split(/[\s@]/)[0].toLowerCase();
  if (cmd === '/start' || cmd === '/help') return tgSend_(TG_HELP);
  if (cmd === '/list') return tgSend_(tgList_());
  if (cmd === '/quiet') { tgProps_().setProperty('TG_QUIET', String(Date.now() + 3600e3)); return tgSend_('🫧 quiet for 1 hr. /loud to undo.'); }
  if (cmd === '/loud') { tgProps_().deleteProperty('TG_QUIET'); return tgSend_('🔊 pings back on.'); }
  if (t.startsWith('/')) return tgSend_('unknown command.\n\n' + TG_HELP);
  const row = tgAddRow_(t.slice(0, 200));
  tgSend_(tgAddText_(row), tgAddButtons_(row));
}

function tgAddRow_(task) {
  const sh = sheet_();
  const colA = sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), 1).getValues();
  let row = colA.findIndex(v => !String(v[0]).trim()) + 2;
  if (row < 2) { sh.insertRowAfter(sh.getMaxRows()); row = sh.getMaxRows(); }
  sh.getRange(row, 1, 1, 4).setValues([[task, 'Medium', '', 'To do']]);
  ensureFormulas_(sh, row);
  return row;
}
function tgAddText_(row) {
  const sh = sheet_(), v = sh.getRange(row, 1, 1, 3).getValues()[0];
  const dl = v[2] instanceof Date ? v[2].getTime() : null;
  return '🔒 <b>locked in:</b> ' + tgEsc_(v[0]) + '\n' + (TG_ICON[v[1]] || '') + ' ' + (TG_LABEL[v[1]] || v[1]) + ' · ' + tgWhen_(dl) +
    '\n\ntap to set the deadline + danger 👇';
}

function tgQuickDate_(q) {
  const d = new Date();
  if (q === 'none') return null;
  if (q === '1h') return new Date(d.getTime() + 3600e3);
  if (q === '18' || q === '21') { d.setHours(+q, 0, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); return d; }
  if (q === 'tom') { d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; }
  if (q === '3d') { d.setDate(d.getDate() + 3); d.setHours(18, 0, 0, 0); return d; }
  return null;
}

function tgCallback_(q) {
  const ans = txt => { try { tgApi_('answerCallbackQuery', { callback_query_id: q.id, text: txt || '' }); } catch (e) {} };
  if (!q.message || String(q.message.chat.id) !== tgChat_()) return ans();
  const parts = String(q.data || '').split('|'), kind = parts[0], row = +parts[1], arg = parts[2];
  const sh = sheet_();
  if (!(row >= 2 && row <= sh.getLastRow()) || !String(sh.getRange(row, 1).getValue()).trim()) {
    ans('task not found'); return tgEdit_(q.message, '🫥 that task isn\'t in the sheet anymore.');
  }
  const task = tgEsc_(sh.getRange(row, 1).getValue());

  if (kind === 'dl') { const d = tgQuickDate_(arg); sh.getRange(row, COL.deadline).setValue(d || ''); ans('deadline set'); return tgEdit_(q.message, tgAddText_(row), tgAddButtons_(row)); }
  if (kind === 'dg') { sh.getRange(row, COL.danger).setValue(arg); ans(arg); return tgEdit_(q.message, tgAddText_(row), tgAddButtons_(row)); }
  if (kind === 'go') { setStatus(row, 'Doing'); ans('panic off. go go go'); return tgEdit_(q.message, '▶ <b>on it:</b> ' + task + '\npanic off. just the first tiny step. no cap.', [[{ text: '✅ done', callback_data: 'ok|' + row }]]); }
  if (kind === 'ok') { setStatus(row, 'Done'); const pr = TG_PRAISE[Math.floor(Math.random() * TG_PRAISE.length)]; ans('W secured ✅'); return tgEdit_(q.message, '✅ <b>W secured:</b> <s>' + task + '</s>\n' + pr); }
  if (kind === 'zz') {
    const snz = tgJson_('TG_SNZ'); snz[row] = Date.now() + 30 * 60e3; tgProps_().setProperty('TG_SNZ', JSON.stringify(snz));
    ans('snoozed 30 min'); return tgEdit_(q.message, '😴 <b>snoozed 30 min:</b> ' + task + '\nbreathe. then start it or finish it.', tgAlertButtons_(row));
  }
  ans();
}

function tgList_() {
  const now = Date.now();
  const open = getTasks().filter(t => t.status !== 'Done').sort((a, b) => tgScore_(b, now) - tgScore_(a, now));
  if (!open.length) return '😌 <b>nothing open.</b> go touch grass 🌱';
  const line = t => {
    const left = t.deadline ? tgLeft_(t.deadline - now) : 'no deadline';
    const hot = t.deadline && t.deadline < now ? '😵' : t.deadline && t.deadline - now < 864e5 ? '⏰' : '•';
    return hot + ' ' + (TG_ICON[t.danger] || '') + ' ' + tgEsc_(t.task) + ' — <i>' + left + '</i>' + (t.status === 'Doing' ? ' ▶' : '');
  };
  return '🎯 <b>main quest:</b> ' + tgEsc_(open[0].task) + '\n\n' + open.slice(0, 10).map(line).join('\n') +
    (open.length > 10 ? '\n…and ' + (open.length - 10) + ' more' : '');
}

/* Called from the 8 AM digest in Code.gs */
function tgDigest_() { if (tgLinked_()) tgSend_('☀️ <b>morning check-in</b>\n\n' + tgList_()); }
