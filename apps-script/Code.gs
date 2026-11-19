/**
 * ⚡ DANGER ZONE — ADHD To-Do Dashboard (Google Apps Script)
 * Paste this into Extensions → Apps Script → Code.gs
 * Sheet layout expected on tab "Tasks":
 *   A Task | B Danger | C Deadline | D Status | E Category | F Notes | G Hours Left | H Urgency | I Done On
 */

const SHEET_NAME = 'Tasks';
const COL = { task: 1, danger: 2, deadline: 3, status: 4, category: 5, notes: 6, doneOn: 9 };

/* ---------- Menu inside Google Sheets ---------- */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚡ Danger Zone')
    .addItem('🚀 Open dashboard', 'openDashboard')
    .addSeparator()
    .addItem('🛠 Set up / repair the Tasks sheet', 'setupSheet')
    .addItem('📧 Turn ON daily 8 AM email reminder', 'enableDailyEmail')
    .addItem('🔕 Turn OFF email reminders', 'disableDailyEmail')
    .addItem('📨 Send me the reminder email now', 'dailyDigest')
    .addSeparator()
    .addItem('🤖 Connect Telegram (24x7 alerts)', 'connectTelegram')
    .addItem('🔔 Send a test Telegram alert', 'testTelegram')
    .addItem('🔌 Disconnect Telegram', 'disconnectTelegram')
    .addToUi();
}

/* Auto-stamp "Done On" when you set Status = Done directly in the sheet */
function onEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() !== SHEET_NAME || e.range.getColumn() !== COL.status || e.range.getRow() < 2) return;
  const cell = sh.getRange(e.range.getRow(), COL.doneOn);
  if (e.value === 'Done') { if (!cell.getValue()) cell.setValue(new Date()); }
  else cell.clearContent();
}

function openDashboard() {
  const html = HtmlService.createHtmlOutputFromFile('Dashboard').setWidth(1400).setHeight(860);
  SpreadsheetApp.getUi().showModelessDialog(html, '⚡ Danger Zone');
}

/* ---------- Web app (phone / bookmark / full screen) ---------- */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Dashboard')
    .setTitle('⚡ Danger Zone')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- Data API used by the dashboard ---------- */
function sheet_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('No "Tasks" tab found. Use menu ⚡ Danger Zone → Set up.');
  return sh;
}

function getTasks() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, 9).getValues();
  const out = [];
  rows.forEach((r, i) => {
    if (!String(r[0]).trim()) return;
    out.push({
      row: i + 2,
      task: String(r[0]),
      danger: String(r[1] || 'Medium'),
      deadline: r[2] instanceof Date ? r[2].getTime() : null,
      status: String(r[3] || 'To do'),
      category: String(r[4] || ''),
      notes: String(r[5] || ''),
      doneOn: r[8] instanceof Date ? r[8].getTime() : null
    });
  });
  return out;
}

function addTask(t) {
  const sh = sheet_();
  const colA = sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), 1).getValues();
  let row = colA.findIndex(v => !String(v[0]).trim()) + 2;
  if (row < 2) { sh.insertRowAfter(sh.getMaxRows()); row = sh.getMaxRows(); }
  sh.getRange(row, 1, 1, 6).setValues([[
    t.task, t.danger || 'Medium', t.deadline ? new Date(t.deadline) : '', 'To do', t.category || '', t.notes || ''
  ]]);
  ensureFormulas_(sh, row);
  return getTasks();
}

function setStatus(row, status) {
  const sh = sheet_();
  sh.getRange(row, COL.status).setValue(status);
  const cell = sh.getRange(row, COL.doneOn);
  if (status === 'Done') cell.setValue(new Date()); else cell.clearContent();
  return getTasks();
}

function ensureFormulas_(sh, r) {
  sh.getRange(r, 7).setFormula(`=IF(OR(A${r}="",C${r}="",D${r}="Done"),"",ROUND((C${r}-NOW())*24,1))`);
  sh.getRange(r, 8).setFormula(`=IF(A${r}="","",IF(D${r}="Done","DONE",IF(C${r}="","NO DEADLINE",IF(C${r}<NOW(),"OVERDUE",IF(C${r}-NOW()<=1,"TODAY",IF(C${r}-NOW()<=3,"SOON",IF(C${r}-NOW()<=7,"THIS WEEK","LATER")))))))`);
}

/* ---------- One-click setup (works on a blank sheet too) ---------- */
function setupSheet() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(Session.getScriptTimeZone() || 'Asia/Kolkata');
  let sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME, 0);
  const headers = ['Task', 'Danger', 'Deadline', 'Status', 'Category', 'Notes', 'Hours Left', 'Urgency', 'Done On'];
  sh.getRange(1, 1, 1, 9).setValues([headers]).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#1e1b4b').setHorizontalAlignment('center');
  sh.getRange(1, 7, 1, 3).setBackground('#3b0764');
  sh.setFrozenRows(1);
  [320, 95, 150, 90, 110, 260, 90, 110, 150].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  const n = Math.max(sh.getMaxRows(), 500);
  if (sh.getMaxRows() < n) sh.insertRowsAfter(sh.getMaxRows(), n - sh.getMaxRows());

  const list = vals => SpreadsheetApp.newDataValidation().requireValueInList(vals, true).build();
  sh.getRange(2, 2, n - 1).setDataValidation(list(['Critical', 'High', 'Medium', 'Low']));
  sh.getRange(2, 4, n - 1).setDataValidation(list(['To do', 'Doing', 'Done']));
  sh.getRange(2, 3, n - 1).setNumberFormat('dd-mmm-yyyy hh:mm');
  sh.getRange(2, 9, n - 1).setNumberFormat('dd-mmm-yyyy hh:mm');

  const g = [], h = [];
  for (let r = 2; r <= n; r++) {
    g.push([`=IF(OR(A${r}="",C${r}="",D${r}="Done"),"",ROUND((C${r}-NOW())*24,1))`]);
    h.push([`=IF(A${r}="","",IF(D${r}="Done","DONE",IF(C${r}="","NO DEADLINE",IF(C${r}<NOW(),"OVERDUE",IF(C${r}-NOW()<=1,"TODAY",IF(C${r}-NOW()<=3,"SOON",IF(C${r}-NOW()<=7,"THIS WEEK","LATER")))))))`]);
  }
  sh.getRange(2, 7, n - 1).setFormulas(g);
  sh.getRange(2, 8, n - 1).setFormulas(h);

  const all = sh.getRange(2, 1, n - 1, 9), dCol = sh.getRange(2, 2, n - 1), uCol = sh.getRange(2, 8, n - 1);
  const rule = (range, f, bg, fg, extra) => {
    let b = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(f).setBackground(bg).setRanges([range]);
    if (fg) b = b.setFontColor(fg);
    if (extra) b = extra(b);
    return b.build();
  };
  sh.setConditionalFormatRules([
    rule(all, '=$D2="Done"', '#f3f4f6', '#9ca3af', b => b.setStrikethrough(true)),
    rule(all, '=$H2="OVERDUE"', '#fecaca', '#7f1d1d', b => b.setBold(true)),
    rule(all, '=$H2="TODAY"', '#fed7aa'),
    rule(dCol, '=$B2="Critical"', '#dc2626', '#ffffff'),
    rule(dCol, '=$B2="High"', '#f97316', '#ffffff'),
    rule(dCol, '=$B2="Medium"', '#facc15', '#422006'),
    rule(dCol, '=$B2="Low"', '#22c55e', '#ffffff'),
    rule(uCol, '=$H2="SOON"', '#fde68a'),
    rule(uCol, '=$H2="THIS WEEK"', '#dbeafe'),
    rule(uCol, '=$H2="LATER"', '#e0e7ff')
  ]);
  SpreadsheetApp.getUi().alert('✅ Tasks sheet is ready. Now use ⚡ Danger Zone → Open dashboard.');
}

/* ---------- Daily email reminder (the "external brain" nudge) ---------- */
function enableDailyEmail() {
  disableDailyEmail(true);
  ScriptApp.newTrigger('dailyDigest').timeBased().everyDays(1).atHour(8).create();
  SpreadsheetApp.getUi().alert('📧 Daily reminder ON — every morning around 8 AM you get your danger list.');
}

function disableDailyEmail(silent) {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'dailyDigest')
    .forEach(t => ScriptApp.deleteTrigger(t));
  if (silent !== true) SpreadsheetApp.getUi().alert('🔕 Email reminders OFF.');
}

function dailyDigest() {
  const now = Date.now(), H = 3600e3;
  const open = getTasks().filter(t => t.status !== 'Done');
  const W = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  const score = t => {
    const w = W[t.danger] || 2;
    if (!t.deadline) return w;
    const h = (t.deadline - now) / H;
    return h < 0 ? 100000 + w * 1000 - h : (w * 100) / Math.max(h, 0.25);
  };
  open.sort((a, b) => score(b) - score(a));
  const overdue = open.filter(t => t.deadline && t.deadline < now);
  const today = open.filter(t => t.deadline && t.deadline >= now && t.deadline - now <= 24 * H);
  const crit = open.filter(t => t.danger === 'Critical' && !overdue.includes(t) && !today.includes(t));
  try { if (typeof tgDigest_ === 'function') tgDigest_(); } catch (e) { console.error(e); }
  if (!open.length) return;

  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const fmt = d => d ? Utilities.formatDate(new Date(d), tz, 'EEE dd MMM, h:mm a') : 'no deadline';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const block = (title, color, arr) => arr.length ? `<h3 style="color:${color};margin:18px 0 6px">${title} (${arr.length})</h3>` +
    arr.map(t => `<div style="padding:8px 12px;border-left:4px solid ${color};background:#f9fafb;margin:4px 0">
      <b>${esc(t.task)}</b> <span style="color:#6b7280">· ${esc(t.danger)} · ${fmt(t.deadline)}</span></div>`).join('') : '';

  const top = open[0];
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px">
    <div style="background:#1e1b4b;color:#fff;padding:18px;border-radius:12px">
      <div style="font-size:12px;letter-spacing:2px;color:#a5b4fc">main quest today 🎯</div>
      <div style="font-size:22px;font-weight:bold;margin-top:6px">${esc(top.task)}</div>
      <div style="color:#c7d2fe;margin-top:4px">${esc(top.danger)} · ${fmt(top.deadline)}</div></div>
    ${block('😵 overdue (cooked)', '#ff3d7f', overdue)}${block('⏰ due in the next 24h', '#ff9f1c', today)}${block('💀 other critical af stuff', '#8b5cf6', crit)}
    <p style="margin-top:20px"><a href="${SpreadsheetApp.getActive().getUrl()}">open the sheet →</a></p></div>`;

  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: `⚡ ${overdue.length ? '😵 ' + overdue.length + ' overdue · ' : ''}main quest: ${top.task}`,
    htmlBody: html
  });
}
