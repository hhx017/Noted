const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const initSqlJs = require('sql.js');
const fs = require('fs');
const { validateLicenseKey } = require('./src/license.js');
const { buildPlanPdf } = require('./pdf-generator.js');

let mainWindow;
let db;
let dbPath;
let licensePath;
let prefsPath;

const DEFAULT_PDF_SETTINGS = {
  accentColor: '#E67E22',
  textColor: '#2C3E50',
  gridColor: '#DCDDE1',
  gridStyle: 'DOT',
  pdfTitle: 'BULLET JOURNAL',
  showCover: true,
  showKeyAndSubjects: true,
  showMonthlyLogs: true,
  showWeeklySpreads: true,
  showDailyLogs: true,
  showHabitAndIndex: true,
  showStundenplan: true
};

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Noted BuJo',
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

function saveDb() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function loadLicenseKey() {
  try {
    if (fs.existsSync(licensePath)) {
      return fs.readFileSync(licensePath, 'utf8').trim();
    }
  } catch (e) { /* ignore */ }
  return '';
}

function saveLicenseKey(key) {
  fs.writeFileSync(licensePath, key, 'utf8');
}

function loadPrefs() {
  try {
    if (fs.existsSync(prefsPath)) return JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
  } catch (e) { /* ignore */ }
  return {};
}

function savePrefs(p) {
  fs.writeFileSync(prefsPath, JSON.stringify(p, null, 2), 'utf8');
}

function isLicenseValid() {
  var key = loadLicenseKey();
  return validateLicenseKey(key);
}

async function initDatabase() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file)
  });
  const userDataPath = app.getPath('userData');
  dbPath = path.join(userDataPath, 'noted_bujo.db');
  licensePath = path.join(userDataPath, 'license.key');
  prefsPath = path.join(userDataPath, 'prefs.json');
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }
  const schema = [
    `CREATE TABLE IF NOT EXISTS schuljahre (id TEXT PRIMARY KEY, start TEXT NOT NULL, ende TEXT NOT NULL, ferien TEXT DEFAULT '[]', schulfreieTage TEXT DEFAULT '[]', klausuren TEXT DEFAULT '[]', abgabefristen TEXT DEFAULT '[]', angekuendigteLKs TEXT DEFAULT '[]')`,
    `CREATE TABLE IF NOT EXISTS monate (id TEXT PRIMARY KEY, schuljahrId TEXT NOT NULL, monat INTEGER NOT NULL, aktiviert INTEGER DEFAULT 1, ueberblick TEXT DEFAULT '', reflexion TEXT DEFAULT NULL)`,
    `CREATE TABLE IF NOT EXISTS wochen (id TEXT PRIMARY KEY, schuljahrId TEXT NOT NULL, kalenderwoche INTEGER NOT NULL, planungsTermin TEXT NOT NULL, inputPhasen TEXT DEFAULT '[]', selbsterarbeitungsPhasen TEXT DEFAULT '[]', modulThemen TEXT DEFAULT '[]', privateTermine TEXT DEFAULT NULL, reflexion TEXT DEFAULT NULL)`,
    `CREATE TABLE IF NOT EXISTS tage (id TEXT PRIMARY KEY, wocheId TEXT NOT NULL, datum TEXT NOT NULL, grosseAufgaben TEXT DEFAULT '[]', schnellAufgaben TEXT DEFAULT '[]')`,
    `CREATE TABLE IF NOT EXISTS journalSeiten (id TEXT PRIMARY KEY, seitenzahl INTEGER NOT NULL, bezugTyp TEXT NOT NULL, bezugId TEXT NOT NULL, titel TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS subjects (name TEXT PRIMARY KEY, colorHex TEXT NOT NULL, lehrer TEXT DEFAULT NULL, module TEXT DEFAULT '[]')`,
    `CREATE TABLE IF NOT EXISTS stundenplanSlots (id TEXT PRIMARY KEY, schuljahrId TEXT NOT NULL, wochentag INTEGER NOT NULL, stunde INTEGER NOT NULL, fach TEXT DEFAULT '', raum TEXT DEFAULT '', lehrer TEXT DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS userProfile (id TEXT PRIMARY KEY, name TEXT DEFAULT '', schule TEXT DEFAULT '', abschluss TEXT DEFAULT '', studiengang TEXT DEFAULT '', semester TEXT DEFAULT '', uni TEXT DEFAULT '', email TEXT DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS habits (id TEXT PRIMARY KEY, name TEXT NOT NULL, frequency TEXT DEFAULT 'daily', colorHex TEXT DEFAULT '#3498DB', isActive INTEGER DEFAULT 1, createdAt TEXT, startTime TEXT DEFAULT NULL, endTime TEXT DEFAULT NULL)`,
    `CREATE TABLE IF NOT EXISTS habitCompletions (habitId TEXT NOT NULL, date TEXT NOT NULL, completed INTEGER DEFAULT 0, PRIMARY KEY (habitId, date))`
  ];
  schema.forEach(s => db.run(s));
  saveDb();
}

function dbQuery(sql, params) {
  const stmt = db.prepare(sql);
  if (params && params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function dbRun(sql, params) {
  db.run(sql, params || []);
  saveDb();
}

function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateToStr(d) {
  if (typeof d === 'string') return d;
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function strToDate(s) {
  const p = s.split('-');
  return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
}

function isHoliday(dateStr, ferien, schulfreieTage) {
  if (schulfreieTage.includes(dateStr)) return true;
  for (const f of ferien) {
    if (dateStr >= f.start && dateStr <= f.ende) return true;
  }
  return false;
}

function parseSchuljahr(r) {
  return { id: r.id, start: r.start, ende: r.ende, ferien: JSON.parse(r.ferien || '[]'), schulfreieTage: JSON.parse(r.schulfreieTage || '[]'), klausuren: JSON.parse(r.klausuren || '[]'), abgabefristen: JSON.parse(r.abgabefristen || '[]'), angekuendigteLKs: JSON.parse(r.angekuendigteLKs || '[]') };
}
function parseMonat(r) {
  return { id: r.id, schuljahrId: r.schuljahrId, monat: r.monat, aktiviert: r.aktiviert === 1, ueberblick: r.ueberblick || '', reflexion: r.reflexion || null };
}
function parseWoche(r) {
  return { id: r.id, schuljahrId: r.schuljahrId, kalenderwoche: r.kalenderwoche, planungsTermin: JSON.parse(r.planungsTermin), inputPhasen: JSON.parse(r.inputPhasen || '[]'), selbsterarbeitungsPhasen: JSON.parse(r.selbsterarbeitungsPhasen || '[]'), modulThemen: JSON.parse(r.modulThemen || '[]'), privateTermine: r.privateTermine ? JSON.parse(r.privateTermine) : null, reflexion: r.reflexion || null };
}
function parseTag(r) {
  return { id: r.id, wocheId: r.wocheId, datum: r.datum, grosseAufgaben: JSON.parse(r.grosseAufgaben || '[]'), schnellAufgaben: JSON.parse(r.schnellAufgaben || '[]') };
}
function parseJournalSeite(r) {
  return { id: r.id, seitenzahl: r.seitenzahl, bezugTyp: r.bezugTyp, bezugId: r.bezugId, titel: r.titel };
}
function parseSubject(r) {
  return { name: r.name, colorHex: r.colorHex, lehrer: r.lehrer || null, module: JSON.parse(r.module || '[]') };
}
function parseSlot(r) {
  return { id: r.id, schuljahrId: r.schuljahrId, wochentag: r.wochentag, stunde: r.stunde, fach: r.fach || '', raum: r.raum || '', lehrer: r.lehrer || '' };
}
function parseProfile(r) {
  return { id: r.id, name: r.name || '', schule: r.schule || '', abschluss: r.abschluss || '', studiengang: r.studiengang || '', semester: r.semester || '', uni: r.uni || '', email: r.email || '' };
}
function parseHabit(r) {
  return { id: r.id, name: r.name, frequency: r.frequency || 'daily', colorHex: r.colorHex || '#3498DB', isActive: r.isActive === 1, createdAt: r.createdAt || null, startTime: r.startTime || null, endTime: r.endTime || null };
}
function parseCompletion(r) {
  return { habitId: r.habitId, date: r.date, completed: r.completed === 1 };
}

function generateWochenraster(schuljahr) {
  const startDate = strToDate(schuljahr.start);
  const endDate = strToDate(schuljahr.ende);
  const ferien = schuljahr.ferien || [];
  const schulfreieTage = schuljahr.schulfreieTage || [];
  let cm = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  while (cm <= endDate) {
    const mid = 'Monat_' + schuljahr.id + '_' + (cm.getMonth() + 1) + '_' + cm.getFullYear();
    const ex = dbQuery('SELECT id FROM monate WHERE id = ?', [mid]);
    if (ex.length === 0) dbRun('INSERT INTO monate (id, schuljahrId, monat, aktiviert, ueberblick, reflexion) VALUES (?, ?, ?, ?, ?, ?)', [mid, schuljahr.id, cm.getMonth() + 1, 1, '', null]);
    cm = new Date(cm.getFullYear(), cm.getMonth() + 1, 1);
  }
  let current = getWeekMonday(startDate);
  while (current <= endDate) {
    const kw = getISOWeekNumber(current);
    const wid = 'Woche_' + schuljahr.id + '_' + kw;
    let hasSchoolDay = false;
    for (let i = 0; i < 7; i++) {
      const d = new Date(current); d.setDate(d.getDate() + i);
      const ds = dateToStr(d);
      if (ds >= schuljahr.start && ds <= schuljahr.ende && !isHoliday(ds, ferien, schulfreieTage)) { hasSchoolDay = true; break; }
    }
    if (hasSchoolDay) {
      const ex = dbQuery('SELECT id FROM wochen WHERE id = ?', [wid]);
      if (ex.length === 0) dbRun('INSERT INTO wochen (id, schuljahrId, kalenderwoche, planungsTermin, inputPhasen, selbsterarbeitungsPhasen, modulThemen, privateTermine, reflexion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [wid, schuljahr.id, kw, JSON.stringify({ wochentag: 7, uhrzeit: '18:00' }), '[]', '[]', '[]', null, null]);
      for (let i = 0; i < 7; i++) {
        const d = new Date(current); d.setDate(d.getDate() + i);
        const ds = dateToStr(d);
        if (ds >= schuljahr.start && ds <= schuljahr.ende && !isHoliday(ds, ferien, schulfreieTage)) {
          const tid = 'tag_' + ds;
          const tex = dbQuery('SELECT id FROM tage WHERE id = ?', [tid]);
          if (tex.length === 0) dbRun('INSERT INTO tage (id, wocheId, datum, grosseAufgaben, schnellAufgaben) VALUES (?, ?, ?, ?, ?)', [tid, wid, ds, '[]', '[]']);
        }
      }
    }
    current.setDate(current.getDate() + 7);
  }
}

function registerIpcHandlers() {
  ipcMain.handle('db:getAllSchuljahre', () => dbQuery('SELECT * FROM schuljahre ORDER BY start').map(parseSchuljahr));
  ipcMain.handle('db:getSchuljahr', (_, id) => { const r = dbQuery('SELECT * FROM schuljahre WHERE id = ?', [id]); return r.length ? parseSchuljahr(r[0]) : null; });
  ipcMain.handle('db:insertSchuljahr', (_, sj) => { dbRun('INSERT OR REPLACE INTO schuljahre (id, start, ende, ferien, schulfreieTage, klausuren, abgabefristen, angekuendigteLKs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [sj.id, sj.start, sj.ende, JSON.stringify(sj.ferien || []), JSON.stringify(sj.schulfreieTage || []), JSON.stringify(sj.klausuren || []), JSON.stringify(sj.abgabefristen || []), JSON.stringify(sj.angekuendigteLKs || [])]); return true; });
  ipcMain.handle('db:getMonateForSchuljahr', (_, sjId) => dbQuery('SELECT * FROM monate WHERE schuljahrId = ? ORDER BY monat', [sjId]).map(parseMonat));
  ipcMain.handle('db:getMonat', (_, id) => { const r = dbQuery('SELECT * FROM monate WHERE id = ?', [id]); return r.length ? parseMonat(r[0]) : null; });
  ipcMain.handle('db:insertMonat', (_, m) => { dbRun('INSERT OR REPLACE INTO monate (id, schuljahrId, monat, aktiviert, ueberblick, reflexion) VALUES (?, ?, ?, ?, ?, ?)', [m.id, m.schuljahrId, m.monat, m.aktiviert ? 1 : 0, m.ueberblick || '', m.reflexion || null]); return true; });
  ipcMain.handle('db:getWochenForSchuljahr', (_, sjId) => dbQuery('SELECT * FROM wochen WHERE schuljahrId = ? ORDER BY kalenderwoche', [sjId]).map(parseWoche));
  ipcMain.handle('db:getWoche', (_, id) => { const r = dbQuery('SELECT * FROM wochen WHERE id = ?', [id]); return r.length ? parseWoche(r[0]) : null; });
  ipcMain.handle('db:insertWoche', (_, w) => { dbRun('INSERT OR REPLACE INTO wochen (id, schuljahrId, kalenderwoche, planungsTermin, inputPhasen, selbsterarbeitungsPhasen, modulThemen, privateTermine, reflexion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [w.id, w.schuljahrId, w.kalenderwoche, JSON.stringify(w.planungsTermin), JSON.stringify(w.inputPhasen || []), JSON.stringify(w.selbsterarbeitungsPhasen || []), JSON.stringify(w.modulThemen || []), w.privateTermine ? JSON.stringify(w.privateTermine) : null, w.reflexion || null]); return true; });
  ipcMain.handle('db:getTageForWoche', (_, wocheId) => dbQuery('SELECT * FROM tage WHERE wocheId = ? ORDER BY datum', [wocheId]).map(parseTag));
  ipcMain.handle('db:getTag', (_, id) => { const r = dbQuery('SELECT * FROM tage WHERE id = ?', [id]); return r.length ? parseTag(r[0]) : null; });
  ipcMain.handle('db:getTagByDate', (_, date) => { const r = dbQuery('SELECT * FROM tage WHERE id = ?', ['tag_' + date]); return r.length ? parseTag(r[0]) : null; });
  ipcMain.handle('db:getTagsInRange', (_, start, end) => dbQuery('SELECT * FROM tage WHERE datum >= ? AND datum <= ? ORDER BY datum', [start, end]).map(parseTag));
  ipcMain.handle('db:insertTag', (_, t) => { dbRun('INSERT OR REPLACE INTO tage (id, wocheId, datum, grosseAufgaben, schnellAufgaben) VALUES (?, ?, ?, ?, ?)', [t.id, t.wocheId, t.datum, JSON.stringify(t.grosseAufgaben || []), JSON.stringify(t.schnellAufgaben || [])]); return true; });
  ipcMain.handle('db:getAllJournalSeiten', () => dbQuery('SELECT * FROM journalSeiten ORDER BY seitenzahl').map(parseJournalSeite));
  ipcMain.handle('db:insertJournalSeite', (_, s) => { dbRun('INSERT OR REPLACE INTO journalSeiten (id, seitenzahl, bezugTyp, bezugId, titel) VALUES (?, ?, ?, ?, ?)', [s.id, s.seitenzahl, s.bezugTyp, s.bezugId, s.titel]); return true; });
  ipcMain.handle('db:getOrAssignPageNumber', (_, bezugTyp, bezugId, titel) => {
    const ex = dbQuery('SELECT * FROM journalSeiten WHERE bezugTyp = ? AND bezugId = ?', [bezugTyp, bezugId]);
    if (ex.length) return ex[0].seitenzahl;
    const mx = dbQuery('SELECT MAX(seitenzahl) as mx FROM journalSeiten');
    const next = (mx[0].mx || 0) + 1;
    const id = 'js_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    dbRun('INSERT INTO journalSeiten (id, seitenzahl, bezugTyp, bezugId, titel) VALUES (?, ?, ?, ?, ?)', [id, next, bezugTyp, bezugId, titel]);
    return next;
  });
  ipcMain.handle('db:getAllSubjects', () => dbQuery('SELECT * FROM subjects ORDER BY name').map(parseSubject));
  ipcMain.handle('db:insertSubject', (_, s) => { dbRun('INSERT OR REPLACE INTO subjects (name, colorHex, lehrer, module) VALUES (?, ?, ?, ?)', [s.name, s.colorHex, s.lehrer || null, JSON.stringify(s.module || [])]); return true; });
  ipcMain.handle('db:deleteSubject', (_, name) => { dbRun('DELETE FROM subjects WHERE name = ?', [name]); return true; });
  ipcMain.handle('db:getStundenplanSlots', (_, sjId) => dbQuery('SELECT * FROM stundenplanSlots WHERE schuljahrId = ? ORDER BY wochentag, stunde', [sjId]).map(parseSlot));
  ipcMain.handle('db:insertStundenplanSlot', (_, slot) => { dbRun('INSERT OR REPLACE INTO stundenplanSlots (id, schuljahrId, wochentag, stunde, fach, raum, lehrer) VALUES (?, ?, ?, ?, ?, ?, ?)', [slot.id, slot.schuljahrId, slot.wochentag, slot.stunde, slot.fach || '', slot.raum || '', slot.lehrer || '']); return true; });
  ipcMain.handle('db:deleteStundenplanSlot', (_, id) => { dbRun('DELETE FROM stundenplanSlots WHERE id = ?', [id]); return true; });
  ipcMain.handle('db:getUserProfile', () => { const r = dbQuery("SELECT * FROM userProfile WHERE id = 'current_user'"); return r.length ? parseProfile(r[0]) : null; });
  ipcMain.handle('db:insertUserProfile', (_, p) => {
    var ex = dbQuery("SELECT id FROM userProfile WHERE id = 'current_user'");
    if (ex.length) {
      dbRun('UPDATE userProfile SET name = ?, schule = ?, abschluss = ?, studiengang = ?, semester = ?, uni = ?, email = ? WHERE id = ?', [p.name || '', p.schule || '', p.abschluss || '', p.studiengang || '', p.semester || '', p.uni || '', p.email || '', 'current_user']);
    } else {
      dbRun('INSERT INTO userProfile (id, name, schule, abschluss, studiengang, semester, uni, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', ['current_user', p.name || '', p.schule || '', p.abschluss || '', p.studiengang || '', p.semester || '', p.uni || '', p.email || '']);
    }
    return true;
  });
  ipcMain.handle('db:getAllHabits', () => dbQuery('SELECT * FROM habits ORDER BY name').map(parseHabit));
  ipcMain.handle('db:insertHabit', (_, h) => { dbRun('INSERT OR REPLACE INTO habits (id, name, frequency, colorHex, isActive, createdAt, startTime, endTime) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [h.id, h.name, h.frequency || 'daily', h.colorHex || '#3498DB', h.isActive === false ? 0 : 1, h.createdAt || dateToStr(new Date()), h.startTime || null, h.endTime || null]); return true; });
  ipcMain.handle('db:deleteHabit', (_, id) => { dbRun('DELETE FROM habitCompletions WHERE habitId = ?', [id]); dbRun('DELETE FROM habits WHERE id = ?', [id]); return true; });
  ipcMain.handle('db:getHabitCompletions', (_, start, end) => dbQuery('SELECT * FROM habitCompletions WHERE date >= ? AND date <= ?', [start, end]).map(parseCompletion));
  ipcMain.handle('db:setHabitCompletion', (_, habitId, date, completed) => {
    if (completed) {
      dbRun('INSERT OR REPLACE INTO habitCompletions (habitId, date, completed) VALUES (?, ?, 1)', [habitId, date]);
    } else {
      dbRun('DELETE FROM habitCompletions WHERE habitId = ? AND date = ?', [habitId, date]);
    }
    return true;
  });
  ipcMain.handle('prefs:get', () => {
    var p = loadPrefs();
    return { themeMode: p.themeMode || 'SYSTEM', pdfSettings: Object.assign({}, DEFAULT_PDF_SETTINGS, p.pdfSettings || {}) };
  });
  ipcMain.handle('prefs:setThemeMode', (_, mode) => { var p = loadPrefs(); p.themeMode = mode; savePrefs(p); return true; });
  ipcMain.handle('prefs:setPdfSettings', (_, settings) => { var p = loadPrefs(); p.pdfSettings = Object.assign({}, DEFAULT_PDF_SETTINGS, settings || {}); savePrefs(p); return true; });
  ipcMain.handle('db:generateWochenraster', (_, sj) => { generateWochenraster(sj); return true; });
  ipcMain.handle('db:clearAllData', () => { db.run('DELETE FROM schuljahre'); db.run('DELETE FROM monate'); db.run('DELETE FROM wochen'); db.run('DELETE FROM tage'); db.run('DELETE FROM journalSeiten'); db.run('DELETE FROM subjects'); db.run('DELETE FROM stundenplanSlots'); db.run('DELETE FROM userProfile'); db.run('DELETE FROM habits'); db.run('DELETE FROM habitCompletions'); saveDb(); return true; });
  ipcMain.handle('license:validate', (_, key) => validateLicenseKey(key));
  ipcMain.handle('license:check', () => isLicenseValid());
  ipcMain.handle('license:save', (_, key) => { saveLicenseKey(key); return true; });
  ipcMain.handle('dialog:save', async (_, options) => await dialog.showSaveDialog(mainWindow, options));
  ipcMain.handle('db:exportPdf', async (_, filePath, options) => {
    if (!filePath) return false;
    try {
      const prefs = loadPrefs();
      const settings = Object.assign({}, DEFAULT_PDF_SETTINGS, prefs.pdfSettings || {}, (options && options.pdfSettings) || {});
      const testData = options && options.testData;
      var data;
      if (testData) {
        data = buildTestData();
      } else {
        const schuljahre = dbQuery('SELECT * FROM schuljahre ORDER BY start').map(parseSchuljahr);
        if (!schuljahre.length) return false;
        const latest = schuljahre.reduce(function(a, b) { return a.start > b.start ? a : b; });
        const profileRow = dbQuery("SELECT * FROM userProfile WHERE id = 'current_user'");
        const habits = dbQuery('SELECT * FROM habits WHERE isActive = 1 ORDER BY name').map(parseHabit);
        const completions = dbQuery('SELECT * FROM habitCompletions').map(parseCompletion);
        const wochenBySchuljahr = {};
        for (const sj of schuljahre) {
          const wochen = dbQuery('SELECT * FROM wochen WHERE schuljahrId = ? ORDER BY kalenderwoche', [sj.id]).map(parseWoche);
          wochenBySchuljahr[sj.id] = wochen.map(function(w) {
            return { woche: w, tage: dbQuery('SELECT * FROM tage WHERE wocheId = ? ORDER BY datum', [w.id]).map(parseTag) };
          });
        }
        const slotsBySchuljahr = {};
        for (const sj of schuljahre) {
          slotsBySchuljahr[sj.id] = dbQuery('SELECT * FROM stundenplanSlots WHERE schuljahrId = ? ORDER BY wochentag, stunde', [sj.id]).map(parseSlot);
        }
        data = {
          schuljahre: schuljahre,
          wochenBySchuljahr: wochenBySchuljahr,
          slotsBySchuljahr: slotsBySchuljahr,
          habits: habits,
          completions: completions,
          profile: profileRow.length ? parseProfile(profileRow[0]) : null
        };
      }
      const doc = buildPlanPdf(data, settings, testData);
      fs.writeFileSync(filePath, Buffer.from(doc.output('arraybuffer')));
      return true;
    } catch (err) { console.error('PDF error:', err); return false; }
  });
}

function buildTestData() {
  const sj = {
    id: '2026/27', start: '2026-08-17', ende: '2027-08-20',
    ferien: [
      { start: '2026-10-12', ende: '2026-10-23', bezeichnung: 'Herbstferien' },
      { start: '2026-12-23', ende: '2027-01-01', bezeichnung: 'Weihnachtsferien' },
      { start: '2027-02-08', ende: '2027-02-19', bezeichnung: 'Winterferien' },
      { start: '2027-03-29', ende: '2027-04-02', bezeichnung: 'Osterferien' },
      { start: '2027-07-12', ende: '2027-08-20', bezeichnung: 'Sommerferien' }
    ],
    schulfreieTage: ['2026-11-18', '2027-05-06', '2027-05-07', '2027-05-17'],
    klausuren: [
      { id: 't1', datum: '2026-09-02', fach: '', beschreibung: 'Kennenlernfahrt' },
      { id: 't2', datum: '2026-09-03', fach: '', beschreibung: 'Kennenlernfahrt' },
      { id: 't3', datum: '2026-09-04', fach: '', beschreibung: 'Kennenlernfahrt' },
      { id: 't4', datum: '2026-12-10', fach: '', beschreibung: 'Notenstopp Klasse 13' },
      { id: 't5', datum: '2026-12-16', fach: '', beschreibung: 'Zeugnisse Klasse 13/1' },
      { id: 't6', datum: '2027-01-14', fach: '', beschreibung: 'Hochschultag' },
      { id: 't7', datum: '2027-01-20', fach: '', beschreibung: 'Notenstopp Klasse 11' },
      { id: 't8', datum: '2027-01-20', fach: '', beschreibung: 'Notenstopp Klasse 12' },
      { id: 't9', datum: '2027-02-01', fach: 'Englisch', beschreibung: 'Vorabitur' },
      { id: 't10', datum: '2027-02-03', fach: 'Deutsch', beschreibung: 'Vorabitur' },
      { id: 't11', datum: '2027-02-05', fach: '', beschreibung: 'Halbjahreszeugnisse Klasse 11' },
      { id: 't12', datum: '2027-02-05', fach: '', beschreibung: 'Zeugnis Klasse 12/1' },
      { id: 't13', datum: '2027-02-22', fach: '2. LK', beschreibung: 'Vorabitur' },
      { id: 't14', datum: '2027-02-24', fach: 'Mathe', beschreibung: 'Vorabitur' },
      { id: 't15', datum: '2027-03-15', fach: 'Deutsch', beschreibung: 'Vergleichsarbeit' },
      { id: 't16', datum: '2027-03-17', fach: 'Englisch', beschreibung: 'Vergleichsarbeit' },
      { id: 't17', datum: '2027-03-19', fach: 'Mathe', beschreibung: 'Vergleichsarbeit' },
      { id: 't18', datum: '2027-03-22', fach: '', beschreibung: 'Notenstopp Klasse 13/2' },
      { id: 't19', datum: '2027-04-26', fach: '2. LK', beschreibung: 'schriftliches Abitur' },
      { id: 't20', datum: '2027-04-28', fach: 'Deutsch', beschreibung: 'schriftliches Abitur' },
      { id: 't21', datum: '2027-04-30', fach: 'Englisch', beschreibung: 'schriftliches Abitur' },
      { id: 't22', datum: '2027-07-07', fach: '', beschreibung: 'Abschlusszeugnis' },
      { id: 't23', datum: '2027-07-08', fach: '', beschreibung: 'Zeugnis Klasse 11' },
      { id: 't24', datum: '2027-07-09', fach: '', beschreibung: 'Zeugnis Klasse 12/2' }
    ],
    abgabefristen: [
      { id: 'a1', datum: '2026-08-21', fach: 'Deutsch', beschreibung: 'Abgabe Lyrik-Analyse' },
      { id: 'a2', datum: '2027-01-29', fach: '', beschreibung: 'Abgabe Facharbeit' },
      { id: 'a3', datum: '2027-05-11', fach: '', beschreibung: 'Anmeldestopp Belegarbeit' }
    ],
    angekuendigteLKs: []
  };
  const modulePool = [
    { id: 'm1', bezeichnung: 'Lyrik (bis Folie 8)', modul: 'Deutsch' },
    { id: 'm2', bezeichnung: 'Modul 1 Hola qué tal?', modul: 'Spanisch' },
    { id: 'm3', bezeichnung: 'Grafische Mittel', modul: 'Kunst' },
    { id: 'm4', bezeichnung: 'Zellbiologie', modul: 'Biologie' },
    { id: 'm5', bezeichnung: 'Stoffe und Stoffklassen', modul: 'Chemie' }
  ];
  const wochenBySchuljahr = {};
  wochenBySchuljahr[sj.id] = [];
  var ws = weekMondayOf(sj.start);
  var idx = 0;
  while (ws <= strToDate(sj.ende)) {
    const days = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(ws); d.setDate(d.getDate() + i);
      days.push(dateToStr(d));
    }
    const holiday = sj.ferien.find(function(f) { return days.every(function(ds) { return ds >= f.start && ds <= f.ende; }); });
    if (!holiday) {
      const tage = days.map(function(ds, di) {
        const d = strToDate(ds);
        const dow = d.getDay();
        const grosseAufgaben = [];
        const schnellAufgaben = [];
        if (idx === 0 && dow === 1) grosseAufgaben.push({ id: 'd1', status: 'OFFEN', inhalt: 'Lerncoaching', fach: '' });
        if (idx === 0 && dow === 2) grosseAufgaben.push({ id: 'd2', status: 'ERLEDIGT', inhalt: 'Schülerplaner kennenlernen', fach: '' });
        if (idx === 0 && dow === 4) grosseAufgaben.push({ id: 'd3', status: 'OFFEN', inhalt: 'Schülerplaner für die nächsten 2 Wochen vorbereiten', fach: '' });
        if (idx > 0 && (dow === 2 || dow === 3)) {
          grosseAufgaben.push({ id: 'dw1_' + ds, status: 'OFFEN', inhalt: 'Lyrik', fach: 'Deutsch' });
          grosseAufgaben.push({ id: 'dw2_' + ds, status: 'OFFEN', inhalt: 'Modul 1', fach: 'Spanisch' });
        }
        if (dow === 3 && idx > 0) schnellAufgaben.push({ id: 'sq1', status: 'OFFEN', inhalt: 'Coachinggespräch 12 Uhr', fach: '' });
        return { id: 'tag_' + ds, wocheId: 'sample_' + idx, datum: ds, grosseAufgaben: grosseAufgaben, schnellAufgaben: schnellAufgaben };
      });
      wochenBySchuljahr[sj.id].push({
        woche: {
          id: 'sample_' + idx, schuljahrId: sj.id, kalenderwoche: getISOWeekNumber(ws),
          planungsTermin: { wochentag: 7, uhrzeit: '18:00' },
          inputPhasen: [], selbsterarbeitungsPhasen: [],
          modulThemen: idx % 2 === 0 ? modulePool : modulePool.slice(0, 3),
          privateTermine: [], reflexion: null
        },
        tage: tage
      });
    }
    ws.setDate(ws.getDate() + 7);
    idx++;
  }
  const slots = [
    { id: 's1', schuljahrId: sj.id, wochentag: 1, stunde: 1, fach: 'Mathe', raum: 'B201', lehrer: 'Dr. Klein' },
    { id: 's2', schuljahrId: sj.id, wochentag: 1, stunde: 2, fach: 'Mathe', raum: 'B201', lehrer: 'Dr. Klein' },
    { id: 's3', schuljahrId: sj.id, wochentag: 2, stunde: 1, fach: 'Deutsch', raum: 'A102', lehrer: 'Frau Sommer' },
    { id: 's4', schuljahrId: sj.id, wochentag: 3, stunde: 3, fach: 'Englisch', raum: 'C305', lehrer: 'Mr. Brown' },
    { id: 's5', schuljahrId: sj.id, wochentag: 4, stunde: 2, fach: 'Biologie', raum: 'Lab 1', lehrer: 'Frau Grün' },
    { id: 's6', schuljahrId: sj.id, wochentag: 5, stunde: 4, fach: 'Sport', raum: 'Halle', lehrer: '' }
  ];
  const habitDefs = [['Sport', '#E74C3C'], ['Lesen', '#3498DB'], ['Früh aufstehen', '#2ECC71'], ['Wasser trinken', '#9B59B6']];
  const habits = habitDefs.map(function(hd, hi) { return { id: 'h' + hi, name: hd[0], colorHex: hd[1], isActive: true }; });
  const completions = [];
  var cur = new Date(2026, 7, 1);
  const last = new Date(2027, 7, 1);
  while (cur <= last) {
    const dim = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= dim; day++) {
      const ds = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      habitDefs.forEach(function(hd, hi) {
        if ((day + hi * 3) % 7 !== 5) completions.push({ habitId: 'h' + hi, date: ds, completed: true });
      });
    }
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return {
    schuljahre: [sj],
    wochenBySchuljahr: wochenBySchuljahr,
    slotsBySchuljahr: (function() { var m = {}; m[sj.id] = slots; return m; })(),
    habits: habits,
    completions: completions,
    profile: { id: 'current_user', name: 'Max Mustermann', schule: 'Berufliches Gymnasium Musterstadt', abschluss: 'Abitur (2027)', studiengang: '', semester: '', uni: '', email: 'max.mustermann@example.de' }
  };
}

function weekMondayOf(dateStr) {
  const d = typeof dateStr === 'string' ? strToDate(dateStr) : new Date(dateStr);
  return getWeekMonday(d);
}

app.whenReady().then(async () => {
  await initDatabase();
  registerIpcHandlers();
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (db) db.close();
  if (process.platform !== 'darwin') app.quit();
});

