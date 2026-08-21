// ========== State ==========
let currentScreen = 'dashboard';
let screenHistory = [];
let currentSchuljahr = null;
let currentMonatId = null;
let currentWocheId = null;
let currentTagId = null;
let currentSubjectName = null;
let selectedThemaId = null;
let confirmCallback = null;
let allSubjects = [];
let currentWeekTage = [];
let themeMode = 'system';
let pdfSettings = null;
let habitWeekOffset = 0;
let pendingSlot = null;
let pendingHabitColor = '#3498DB';
let searchTimer = null;

const MONTH_NAMES = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const DAY_LETTERS = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
const SUBJECT_COLORS = ['#E74C3C', '#3498DB', '#2ECC71', '#F1C40F', '#9B59B6', '#E67E22', '#1ABC9C', '#34495E', '#7F8C8D', '#D35400', '#C0392B', '#27AE60'];

// ========== Navigation ==========
function navigate(screen, params) {
  params = params || {};
  if (currentScreen !== screen) {
    screenHistory.push(currentScreen);
  }
  currentScreen = screen;
  showScreen(screen, params);
}

function goBack() {
  if (screenHistory.length > 0) {
    currentScreen = screenHistory.pop();
    showScreen(currentScreen, {});
  }
}

function showScreen(screen, params) {
  params = params || {};
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.add('hidden'); });
  document.getElementById('screen-' + screen).classList.remove('hidden');

  var hasBottomNav = ['dashboard', 'index', 'jahresplan', 'stundenplan', 'habits'].indexOf(screen) !== -1;
  document.getElementById('bottomNav').classList.toggle('hidden', !hasBottomNav);
  document.getElementById('btnBack').classList.toggle('hidden', hasBottomNav);
  document.getElementById('btnSettings').classList.toggle('hidden', !hasBottomNav);
  document.getElementById('fab').classList.toggle('hidden', !hasBottomNav || screen === 'license');
  document.getElementById('topBar').classList.toggle('hidden', screen === 'license');

  var navMap = { dashboard: 0, index: 1, jahresplan: 2, stundenplan: 3, habits: 4 };
  var navItems = document.querySelectorAll('.bottombar-item');
  navItems.forEach(function(n) { n.classList.remove('active'); });
  if (navMap[screen] !== undefined && navItems[navMap[screen]]) navItems[navMap[screen]].classList.add('active');

  switch (screen) {
    case 'dashboard': loadDashboard(); break;
    case 'index': loadIndex(); break;
    case 'jahresplan': loadJahresPlan(); break;
    case 'monatsplan': loadMonatsPlan(params.monatId); break;
    case 'wochenplan': loadWochenPlan(params.wocheId); break;
    case 'tagesplan': loadTagesPlan(params.tagId); break;
    case 'subjects': loadSubjectManager(); break;
    case 'subject-detail': loadSubjectDetail(params.subjectName); break;
    case 'stundenplan': loadStundenPlan(); break;
    case 'habits': loadHabitsScreen(); break;
    case 'settings': loadSettings(); break;
  }
}

// ========== Theme ==========
function applyTheme(mode) {
  themeMode = mode;
  var effective = mode;
  if (mode === 'system') {
    effective = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  if (effective === 'light') {
    document.body.setAttribute('data-theme', 'light');
  } else {
    document.body.removeAttribute('data-theme');
  }
}

function applyThemeChoice(mode) {
  applyTheme(mode);
  window.api.setThemeMode(mode);
  updateThemeButtons();
}

function updateThemeButtons() {
  ['light', 'dark', 'system'].forEach(function(m) {
    var btn = document.getElementById('themeBtn-' + m);
    if (btn) btn.classList.toggle('selected', themeMode === m);
  });
}

window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function() {
  if (themeMode === 'system') applyTheme('system');
});

// ========== Helpers ==========
function dateToStr(d) {
  if (typeof d === 'string') return d;
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function getToday() { return dateToStr(new Date()); }

function getFachColor(fach) {
  if (!fach) return 'rgba(255,255,255,0.06)';
  var sub = allSubjects.find(function(s) { return s.name.toLowerCase() === fach.toLowerCase(); });
  if (sub) {
    var r = parseInt(sub.colorHex.slice(1, 3), 16);
    var g = parseInt(sub.colorHex.slice(3, 5), 16);
    var b = parseInt(sub.colorHex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',0.2)';
  }
  var idx = Math.abs(fach.split('').reduce(function(a, c) { return a + c.charCodeAt(0); }, 0)) % 6;
  var colors = ['#E74C3C', '#3498DB', '#2ECC71', '#F1C40F', '#9B59B6', '#E67E22'];
  var r2 = parseInt(colors[idx].slice(1, 3), 16);
  var g2 = parseInt(colors[idx].slice(3, 5), 16);
  var b2 = parseInt(colors[idx].slice(5, 7), 16);
  return 'rgba(' + r2 + ',' + g2 + ',' + b2 + ',0.2)';
}

function getISOWeekNumber(date) {
  var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function showDialog(id) {
  document.getElementById('dialogOverlay').classList.remove('hidden');
  document.getElementById(id).classList.remove('hidden');
}

function closeDialog() {
  document.getElementById('dialogOverlay').classList.add('hidden');
  document.querySelectorAll('.md3-dialog').forEach(function(d) { d.classList.add('hidden'); });
}

function esc(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function icon(name, cls) {
  cls = cls || '';
  return '<span class="material-icons-outlined ' + cls + '">' + name + '</span>';
}

// ========== Dashboard ==========
async function loadDashboard() {
  document.getElementById('dashboardDate').textContent = 'Heute: ' + getToday();
  document.getElementById('dashboardLoading').classList.remove('hidden');
  document.getElementById('dashboardContent').classList.add('hidden');
  document.getElementById('dashboardEmpty').classList.add('hidden');
  document.getElementById('searchResultsCard').classList.add('hidden');
  document.getElementById('dashboardMain').classList.remove('hidden');

  var schuljahre = await window.api.getAllSchuljahre();
  if (schuljahre.length === 0) {
    await initializeFirstTime();
  }

  allSubjects = await window.api.getAllSubjects();
  var tag = await window.api.getTagByDate(getToday());

  document.getElementById('dashboardLoading').classList.add('hidden');

  if (!tag) {
    document.getElementById('dashboardEmpty').classList.remove('hidden');
  } else {
    document.getElementById('dashboardContent').classList.remove('hidden');
    var tasksDiv = document.getElementById('dashboardTasks');
    if (tag.grosseAufgaben.length === 0) {
      tasksDiv.innerHTML = '<p class="muted body-small">Noch keine Aufgaben geplant.</p>';
    } else {
      tasksDiv.innerHTML = tag.grosseAufgaben.map(function(a) {
        return '<div class="task-item" style="background:' + getFachColor(a.fach) + '">' +
          '<input type="checkbox" ' + (a.status === 'ERLEDIGT' ? 'checked' : '') + ' disabled>' +
          '<span class="task-text ' + (a.status === 'ERLEDIGT' ? 'done' : '') + '">' + bujoSymbol(a.status) + ' ' + esc(a.inhalt) + '</span>' +
          '</div>';
      }).join('');
    }
  }

  loadUpcomingTermine();
  loadDashboardHabits();
}

function bujoSymbol(status) {
  switch (status) {
    case 'ERLEDIGT': return '●';
    case 'MIGRIERT': return '▶';
    case 'VERWORFEN': return '◆';
    default: return '○';
  }
}

async function loadUpcomingTermine() {
  var div = document.getElementById('dashboardTermine');
  var termine = [];
  var schuljahre = await window.api.getAllSchuljahre();
  var today = getToday();

  for (var i = 0; i < schuljahre.length; i++) {
    var sj = schuljahre[i];
    (sj.klausuren || []).forEach(function(t) { termine.push({ datum: t.datum, text: terminText(t), art: 'Klausur', color: '#E74C3C' }); });
    (sj.abgabefristen || []).forEach(function(t) { termine.push({ datum: t.datum, text: terminText(t), art: 'Abgabe', color: '#3498DB' }); });
    (sj.angekuendigteLKs || []).forEach(function(t) { termine.push({ datum: t.datum, text: terminText(t), art: 'LK', color: '#E74C3C' }); });
    var wochen = await window.api.getWochenForSchuljahr(sj.id);
    wochen.forEach(function(w) {
      (w.privateTermine || []).forEach(function(t) { termine.push({ datum: t.datum, text: t.beschreibung, art: 'Privat', color: '#2ECC71' }); });
    });
  }

  termine = termine.filter(function(t) { return t.datum >= today; })
    .sort(function(a, b) { return a.datum.localeCompare(b.datum); })
    .slice(0, 5);

  if (termine.length === 0) {
    div.innerHTML = '<p class="muted body-small">Keine kommenden Termine.</p>';
    return;
  }
  div.innerHTML = termine.map(function(t) {
    return '<div class="simple-item"><span class="color-dot" style="background:' + t.color + '"></span>' +
      '<div class="simple-item-text"><div class="simple-item-title">' + esc(t.text) + '</div>' +
      '<div class="simple-item-sub">' + t.art + ' · ' + fmtDMY(t.datum) + '</div></div>' +
      '<button class="item-delete-btn" title="Bearbeiten" onclick="navigate(\'jahresplan\')">' + icon('chevron_right') + '</button></div>';
  }).join('');
}

async function loadDashboardHabits() {
  var div = document.getElementById('dashboardHabits');
  var habits = await window.api.getAllHabits();
  var today = getToday();
  var completions = await window.api.getHabitCompletions(today, today);

  if (habits.length === 0) {
    div.innerHTML = '<p class="muted body-small">Keine Habits angelegt. <a href="#" onclick="event.preventDefault();navigate(\'habits\')" style="color:var(--md3-primary)">Jetzt anlegen</a></p>';
    return;
  }

  div.innerHTML = habits.map(function(h) {
    var done = completions.some(function(c) { return c.habitId === h.id && c.completed; });
    return '<div class="simple-item"><span class="color-dot" style="background:' + h.colorHex + '"></span>' +
      '<div class="simple-item-text"><div class="simple-item-title">' + esc(h.name) + '</div>' +
      (h.startTime ? '<div class="simple-item-sub">' + h.startTime + (h.endTime ? ' – ' + h.endTime : '') + '</div>' : '') +
      '</div>' +
      '<input type="checkbox" style="width:20px;height:20px;accent-color:' + h.colorHex + ';cursor:pointer" ' + (done ? 'checked' : '') +
      ' onchange="toggleHabitToday(\'' + h.id + '\', this.checked)"></div>';
  }).join('');
}

async function toggleHabitToday(habitId, completed) {
  await window.api.setHabitCompletion(habitId, getToday(), completed);
}

function fmtDMY(dateStr) {
  var p = dateStr.split('-');
  return p[2] + '.' + p[1] + '.' + p[0];
}

function terminText(t) {
  return (!t.fach) ? t.beschreibung : t.fach + ': ' + t.beschreibung;
}

// ---------- Dashboard Suche ----------
document.addEventListener('DOMContentLoaded', function() {
  var input = document.getElementById('dashboardSearch');
  if (input) {
    input.addEventListener('input', function() {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function() { performDashboardSearch(input.value.trim()); }, 250);
    });
  }
});

async function performDashboardSearch(q) {
  var resultsCard = document.getElementById('searchResultsCard');
  var mainDiv = document.getElementById('dashboardMain');

  if (!q || q.length < 2) {
    resultsCard.classList.add('hidden');
    mainDiv.classList.remove('hidden');
    return;
  }

  var lower = q.toLowerCase();
  var aufgaben = [], themen = [];
  var termine = [];
  var schuljahre = await window.api.getAllSchuljahre();

  for (var i = 0; i < schuljahre.length; i++) {
    var sj = schuljahre[i];
    var tags = await window.api.getTagsInRange(sj.start, sj.ende);
    tags.forEach(function(tag) {
      tag.grosseAufgaben.concat(tag.schnellAufgaben).forEach(function(a) {
        if (a.inhalt && a.inhalt.toLowerCase().indexOf(lower) !== -1 && a.status !== 'VERWORFEN') {
          aufgaben.push({ datum: tag.datum, inhalt: a.inhalt, fach: a.fach, status: a.status });
        }
      });
    });
    (sj.klausuren || []).concat(sj.abgabefristen || [], sj.angekuendigteLKs || []).forEach(function(t) {
      if (t.beschreibung && t.beschreibung.toLowerCase().indexOf(lower) !== -1) {
        termine.push({ datum: t.datum, text: terminText(t), art: 'Termin', color: '#E74C3C' });
      }
    });
    var wochen = await window.api.getWochenForSchuljahr(sj.id);
    wochen.forEach(function(w) {
      (w.privateTermine || []).forEach(function(t) {
        if (t.beschreibung && t.beschreibung.toLowerCase().indexOf(lower) !== -1) {
          termine.push({ datum: t.datum, text: t.beschreibung, art: 'Privat', color: '#2ECC71' });
        }
      });
      (w.modulThemen || []).forEach(function(th) {
        if (th.bezeichnung && th.bezeichnung.toLowerCase().indexOf(lower) !== -1) {
          themen.push({ bezeichnung: th.bezeichnung, modul: th.modul, wocheId: w.id });
        }
      });
    });
  }

  function renderGroup(title, items, renderer) {
    if (!items.length) return '';
    return '<div class="search-result-group"><div class="search-result-group-title">' + title + '</div>' +
      items.slice(0, 10).map(renderer).join('') + '</div>';
  }

  var html = '';
  html += renderGroup('Aufgaben (' + aufgaben.length + ')', aufgaben, function(a) {
    return '<div class="search-result-item" onclick="navigateToTagByDate(\'' + a.datum + '\')">' +
      bujoSymbol(a.status) + ' ' + esc(a.inhalt) + ' <span class="muted">· ' + a.datum + '</span></div>';
  });
  html += renderGroup('Termine (' + termine.length + ')', termine, function(t) {
    return '<div class="search-result-item" onclick="navigate(\'jahresplan\')">' + esc(t.text) + ' <span class="muted">· ' + t.datum + '</span></div>';
  });
  html += renderGroup('Themen (' + themen.length + ')', themen, function(th) {
    return '<div class="search-result-item" onclick="navigate(\'wochenplan\', {wocheId: \'' + th.wocheId + '\'})">' +
      esc(th.bezeichnung) + ' <span class="muted">· ' + esc(th.modul || '') + '</span></div>';
  });

  mainDiv.classList.add('hidden');
  resultsCard.classList.remove('hidden');
  document.getElementById('searchResults').innerHTML =
    html || '<div class="empty-state">' + icon('search_off', 'empty-icon') + '<span class="muted">Keine Treffer fuer "' + esc(q) + '".</span></div>';
}

async function navigateToTagByDate(datum) {
  navigate('tagesplan', { tagId: 'tag_' + datum });
}

async function initializeFirstTime() {
  var now = new Date();
  var start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var ende = new Date(start.getFullYear() + 1, 6, 31);
  var id = start.getFullYear() + '_' + ende.getFullYear();

  var schuljahr = {
    id: id, start: dateToStr(start), ende: dateToStr(ende),
    ferien: [], schulfreieTage: [], klausuren: [], abgabefristen: [], angekuendigteLKs: []
  };

  await window.api.insertSchuljahr(schuljahr);
  await window.api.generateWochenraster(schuljahr);

  await window.api.insertSubject({ name: 'Mathe', colorHex: '#3498DB', lehrer: null, module: [] });
  await window.api.insertSubject({ name: 'Informatik', colorHex: '#2ECC71', lehrer: null, module: [] });
  await window.api.insertSubject({ name: 'Deutsch', colorHex: '#E74C3C', lehrer: null, module: [] });
}

function navigateToTodayTag() {
  navigate('tagesplan', { tagId: 'tag_' + getToday() });
}

// ========== Index ==========
async function loadIndex() {
  var seiten = await window.api.getAllJournalSeiten();
  var list = document.getElementById('indexList');

  if (seiten.length === 0) {
    list.innerHTML = '<div class="empty-state">' + icon('menu_book', 'empty-icon') + '<span class="muted">Noch keine Seiten im Inhaltsverzeichnis.</span></div>';
    return;
  }

  list.innerHTML = seiten.map(function(s, i) {
    var divider = i < seiten.length - 1 ? '<div class="index-divider"></div>' : '';
    return '<div class="index-item" onclick="navigateFromIndex(\'' + s.bezugTyp + '\', \'' + esc(s.bezugId) + '\')">' +
      '<span class="index-page">' + String(s.seitenzahl).padStart(3, '0') + '</span>' +
      '<span class="index-title">' + esc(s.titel) + '</span>' +
      icon('chevron_right', 'subject-arrow') +
      '</div>' + divider;
  }).join('');
}

function navigateFromIndex(bezugTyp, bezugId) {
  switch (bezugTyp) {
    case 'JAHR': navigate('jahresplan'); break;
    case 'MONAT': navigate('monatsplan', { monatId: bezugId }); break;
    case 'WOCHE': navigate('wochenplan', { wocheId: bezugId }); break;
    case 'TAG': navigate('tagesplan', { tagId: bezugId }); break;
  }
}

// ========== JahresPlan ==========
async function loadJahresPlan() {
  var schuljahre = await window.api.getAllSchuljahre();
  allSubjects = await window.api.getAllSubjects();

  if (schuljahre.length === 0) {
    document.getElementById('jahresplanSetup').classList.remove('hidden');
    document.getElementById('jahresplanContent').classList.add('hidden');
    return;
  }

  document.getElementById('jahresplanSetup').classList.add('hidden');
  document.getElementById('jahresplanContent').classList.remove('hidden');

  var sj = schuljahre[schuljahre.length - 1];
  currentSchuljahr = sj;

  document.getElementById('jahresplanTitle').textContent = 'Jahresplan ' + sj.id;
  document.getElementById('jahresplanDateRange').textContent = sj.start + ' bis ' + sj.ende;

  var pageNum = await window.api.getOrAssignPageNumber('JAHR', sj.id, 'Jahresplan ' + sj.id);
  document.getElementById('jahresplanPage').textContent = 'S. ' + pageNum;

  // Months
  var monate = await window.api.getMonateForSchuljahr(sj.id);
  monate.sort(function(a, b) { return a.monat - b.monat; });
  var monateDiv = document.getElementById('jahresplanMonate');
  monateDiv.innerHTML = monate.map(function(m) {
    return '<div class="input-row" style="margin-bottom:4px">' +
      '<label class="md3-switch">' +
      '<input type="checkbox" ' + (m.aktiviert ? 'checked' : '') + ' onchange="toggleMonat(\'' + m.id + '\')">' +
      '<span class="md3-switch-track"><span class="md3-switch-thumb"></span></span>' +
      '</label>' +
      '<button class="' + (m.aktiviert ? 'btn-filled' : 'btn-outlined') + '" style="flex:1" onclick="navigate(\'monatsplan\', {monatId: \'' + m.id + '\'})" ' + (!m.aktiviert ? 'disabled' : '') + '>' +
      MONTH_NAMES[m.monat] + ' ' + m.id.split('_').pop() +
      '</button></div>';
  }).join('');

  // Weeks
  var wochen = await window.api.getWochenForSchuljahr(sj.id);
  var currentKW = getISOWeekNumber(new Date());
  var currentWocheIdStr = 'Woche_' + sj.id + '_' + currentKW;
  wochen.sort(function(a, b) {
    if (a.id === currentWocheIdStr) return -1;
    if (b.id === currentWocheIdStr) return 1;
    return a.kalenderwoche - b.kalenderwoche;
  });
  var wochenDiv = document.getElementById('jahresplanWochen');
  wochenDiv.innerHTML = wochen.map(function(w) {
    var isCurrent = w.id === currentWocheIdStr;
    return '<button class="week-btn ' + (isCurrent ? 'current' : '') + '" onclick="navigate(\'wochenplan\', {wocheId: \'' + w.id + '\'})">' +
      'KW ' + w.kalenderwoche +
      (isCurrent ? ' ' + icon('star', 'star') : '') +
      '</button>';
  }).join('');

  // Termine
  var termineDiv = document.getElementById('jahresplanTermine');
  var termineHtml = '';
  if (sj.klausuren.length > 0) {
    termineHtml += '<h4 class="section-label">Klausuren</h4>';
    termineHtml += sj.klausuren.map(function(t) {
      return terminRowHtml(t, 'klausur');
    }).join('');
  }
  if (sj.abgabefristen.length > 0) {
    termineHtml += '<h4 class="section-label">Abgabefristen</h4>';
    termineHtml += sj.abgabefristen.map(function(t) {
      return terminRowHtml(t, 'abgabe');
    }).join('');
  }
  if (sj.angekuendigteLKs.length > 0) {
    termineHtml += '<h4 class="section-label">Angekuendigte LKs</h4>';
    termineHtml += sj.angekuendigteLKs.map(function(t) {
      return terminRowHtml(t, 'lk');
    }).join('');
  }
  if (!termineHtml) termineHtml = '<p class="muted body-small">Keine Eintraege</p>';
  termineDiv.innerHTML = termineHtml;

  // Ferien
  var ferienDiv = document.getElementById('jahresplanFerien');
  if ((sj.ferien || []).length === 0) {
    ferienDiv.innerHTML = '<p class="muted body-small" style="margin-bottom:8px">Keine Ferien eingetragen.</p>';
  } else {
    ferienDiv.innerHTML = sj.ferien.slice().sort(function(a, b) { return a.start.localeCompare(b.start); }).map(function(f) {
      return '<div class="simple-item">' +
        '<span class="material-icons-outlined" style="color:#95A5A6">beach_access</span>' +
        '<div class="simple-item-text"><div class="simple-item-title">' + esc(f.bezeichnung || 'Ferien') + '</div>' +
        '<div class="simple-item-sub">' + f.start + ' – ' + f.ende + '</div></div>' +
        '<button class="item-delete-btn" onclick="deleteFerien(\'' + f.start + '\')">' + icon('delete') + '</button></div>';
    }).join('');
  }

  // Schulfreie Tage
  var freiDiv = document.getElementById('jahresplanFreieTage');
  if ((sj.schulfreieTage || []).length === 0) {
    freiDiv.innerHTML = '<p class="muted body-small" style="margin-bottom:8px">Keine schulfreien Tage.</p>';
  } else {
    freiDiv.innerHTML = sj.schulfreieTage.slice().sort().map(function(ds) {
      return '<div class="simple-item">' +
        '<span class="material-icons-outlined" style="color:#95A5A6">event_busy</span>' +
        '<div class="simple-item-text"><div class="simple-item-title">' + fmtDMY(ds) + '</div></div>' +
        '<button class="item-delete-btn" onclick="deleteFreierTag(\'' + ds + '\')">' + icon('delete') + '</button></div>';
    }).join('');
  }
}

function terminRowHtml(t, art) {
  var color = art === 'abgabe' ? '#3498DB' : '#E74C3C';
  var listKey = art === 'klausur' ? 'klausuren' : (art === 'abgabe' ? 'abgabefristen' : 'angekuendigteLKs');
  return '<div class="simple-item"><span class="color-dot" style="background:' + color + '"></span>' +
    '<div class="simple-item-text"><div class="simple-item-title">' + esc(t.beschreibung) + '</div>' +
    '<div class="simple-item-sub">' + t.datum + (t.fach ? ' · ' + esc(t.fach) : '') + '</div></div>' +
    '<button class="item-delete-btn" onclick="deleteTermin(\'' + listKey + '\', \'' + t.id + '\')">' + icon('delete') + '</button></div>';
}

// ---------- Jahresplan CRUD: Ferien / freie Tage / Termine ----------
function showAddFerienDialog() {
  document.getElementById('ferienName').value = '';
  document.getElementById('ferienStart').value = currentSchuljahr ? currentSchuljahr.start : getToday();
  document.getElementById('ferienEnd').value = currentSchuljahr ? currentSchuljahr.start : getToday();
  showDialog('ferienDialog');
}

async function confirmAddFerien() {
  var name = document.getElementById('ferienName').value.trim();
  var start = document.getElementById('ferienStart').value;
  var ende = document.getElementById('ferienEnd').value;
  if (!name || !start || !ende || !currentSchuljahr) return;

  var sj = await window.api.getSchuljahr(currentSchuljahr.id);
  sj.ferien = (sj.ferien || []).concat([{ start: start, ende: ende, bezeichnung: name }]);
  await window.api.insertSchuljahr(sj);
  closeDialog();
  loadJahresPlan();
}

async function deleteFerien(start) {
  if (!currentSchuljahr) return;
  var sj = await window.api.getSchuljahr(currentSchuljahr.id);
  sj.ferien = (sj.ferien || []).filter(function(f) { return f.start !== start; });
  await window.api.insertSchuljahr(sj);
  loadJahresPlan();
}

function showAddFreierTagDialog() {
  document.getElementById('freierTagDate').value = getToday();
  showDialog('freierTagDialog');
}

async function confirmAddFreierTag() {
  var ds = document.getElementById('freierTagDate').value;
  if (!ds || !currentSchuljahr) return;

  var sj = await window.api.getSchuljahr(currentSchuljahr.id);
  if ((sj.schulfreieTage || []).indexOf(ds) === -1) {
    sj.schulfreieTage = (sj.schulfreieTage || []).concat([ds]);
    await window.api.insertSchuljahr(sj);
  }
  closeDialog();
  loadJahresPlan();
}

async function deleteFreierTag(ds) {
  if (!currentSchuljahr) return;
  var sj = await window.api.getSchuljahr(currentSchuljahr.id);
  sj.schulfreieTage = (sj.schulfreieTage || []).filter(function(d) { return d !== ds; });
  await window.api.insertSchuljahr(sj);
  loadJahresPlan();
}

function showAddTerminDialog() {
  document.getElementById('terminDesc').value = '';
  document.getElementById('terminFach').value = '';
  document.getElementById('terminType').value = 'klausur';
  document.getElementById('terminDate').value = getToday();
  showDialog('terminDialog');
}

async function confirmAddTermin() {
  var desc = document.getElementById('terminDesc').value.trim();
  var fach = document.getElementById('terminFach').value.trim();
  var type = document.getElementById('terminType').value;
  var datum = document.getElementById('terminDate').value;
  if (!desc || !datum || !currentSchuljahr) return;

  var sj = await window.api.getSchuljahr(currentSchuljahr.id);
  var entry = { id: crypto.randomUUID(), datum: datum, fach: fach || '', beschreibung: desc };
  if (type === 'abgabe') sj.abgabefristen = (sj.abgabefristen || []).concat([entry]);
  else sj.klausuren = (sj.klausuren || []).concat([entry]);
  await window.api.insertSchuljahr(sj);
  closeDialog();
  loadJahresPlan();
}

async function deleteTermin(listKey, id) {
  if (!currentSchuljahr) return;
  var sj = await window.api.getSchuljahr(currentSchuljahr.id);
  sj[listKey] = (sj[listKey] || []).filter(function(t) { return t.id !== id; });
  await window.api.insertSchuljahr(sj);
  loadJahresPlan();
}

async function setupSchuljahr() {
  var startYear = parseInt(document.getElementById('sjStartYear').value);
  var endYear = parseInt(document.getElementById('sjEndYear').value);
  var start = new Date(startYear, 7, 1);
  var ende = new Date(endYear, 6, 31);
  var id = startYear + '_' + endYear;

  var schuljahr = {
    id: id, start: dateToStr(start), ende: dateToStr(ende),
    ferien: [], schulfreieTage: [], klausuren: [], abgabefristen: [], angekuendigteLKs: []
  };

  await window.api.insertSchuljahr(schuljahr);
  await window.api.generateWochenraster(schuljahr);
  loadJahresPlan();
}

async function toggleMonat(monatId) {
  var monat = await window.api.getMonat(monatId);
  if (monat) {
    monat.aktiviert = !monat.aktiviert;
    await window.api.insertMonat(monat);
    loadJahresPlan();
  }
}

// ========== MonatsPlan ==========
async function loadMonatsPlan(monatId) {
  if (monatId) currentMonatId = monatId;
  if (!currentMonatId) return;

  document.getElementById('monatsplanLoading').classList.remove('hidden');
  document.getElementById('monatsplanContent').classList.add('hidden');

  var monat = await window.api.getMonat(currentMonatId);
  if (!monat) {
    document.getElementById('monatsplanLoading').innerHTML = '<p class="muted">Monatsplan nicht gefunden.</p>';
    return;
  }

  var parts = currentMonatId.split('_');
  var year = parseInt(parts[parts.length - 1]);
  document.getElementById('monatsplanTitle').textContent = MONTH_NAMES[monat.monat] + ' ' + year;

  var pageNum = await window.api.getOrAssignPageNumber('MONAT', currentMonatId, 'Monatsplan ' + currentMonatId);
  document.getElementById('monatsplanPage').textContent = 'S. ' + pageNum;

  var startDate = year + '-' + String(monat.monat).padStart(2, '0') + '-01';
  var lastDay = new Date(year, monat.monat, 0).getDate();
  var endDate = year + '-' + String(monat.monat).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
  var tags = await window.api.getTagsInRange(startDate, endDate);

  renderCalendarGrid(year, monat.monat, tags);

  document.getElementById('monatUeberblick').value = monat.ueberblick || '';
  document.getElementById('monatReflexion').value = monat.reflexion || '';

  document.getElementById('monatsplanLoading').classList.add('hidden');
  document.getElementById('monatsplanContent').classList.remove('hidden');
}

function renderCalendarGrid(year, month, tags) {
  var grid = document.getElementById('calendarGrid');
  var firstDay = new Date(year, month - 1, 1);
  var daysInMonth = new Date(year, month, 0).getDate();
  var startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  var html = '<div class="calendar-header">';
  DAY_LETTERS.forEach(function(d) { html += '<div>' + d + '</div>'; });
  html += '</div><div class="calendar-row">';

  for (var i = 0; i < startDow; i++) {
    html += '<div class="calendar-cell empty"></div>';
  }

  for (var day = 1; day <= daysInMonth; day++) {
    var dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    var tag = tags.find(function(t) { return t.datum === dateStr; });
    var totalTasks = tag ? tag.grosseAufgaben.length + tag.schnellAufgaben.length : 0;
    var cellClass = 'calendar-cell';
    if (totalTasks >= 3) cellClass += ' has-tasks';
    else if (totalTasks > 0) cellClass += ' has-tasks-light';

    var onclick = tag ? 'onclick="navigate(\'tagesplan\', {tagId: \'' + tag.id + '\'})"' : '';

    html += '<div class="' + cellClass + '" ' + onclick + '><span>' + day + '</span>';
    if (totalTasks > 0) {
      html += '<div class="calendar-dots">';
      for (var d = 0; d < Math.min(totalTasks, 3); d++) html += '<div class="calendar-dot"></div>';
      html += '</div>';
    }
    html += '</div>';

    if ((startDow + day) % 7 === 0 && day < daysInMonth) {
      html += '</div><div class="calendar-row">';
    }
  }

  var remainingCells = (startDow + daysInMonth) % 7;
  if (remainingCells > 0) {
    for (var r = remainingCells; r < 7; r++) html += '<div class="calendar-cell empty"></div>';
  }
  html += '</div>';
  grid.innerHTML = html;
}

async function saveMonatData() {
  var monat = await window.api.getMonat(currentMonatId);
  if (monat) {
    monat.ueberblick = document.getElementById('monatUeberblick').value;
    monat.reflexion = document.getElementById('monatReflexion').value;
    await window.api.insertMonat(monat);
  }
}

// ========== WochenPlan ==========
async function loadWochenPlan(wocheId) {
  if (wocheId) currentWocheId = wocheId;
  if (!currentWocheId) return;

  document.getElementById('wochenplanLoading').classList.remove('hidden');
  document.getElementById('wochenplanContent').classList.add('hidden');
  document.getElementById('wochenplanEmpty').classList.add('hidden');
  selectedThemaId = null;

  allSubjects = await window.api.getAllSubjects();
  var woche = await window.api.getWoche(currentWocheId);

  if (!woche) {
    document.getElementById('wochenplanLoading').classList.add('hidden');
    document.getElementById('wochenplanEmpty').classList.remove('hidden');
    return;
  }

  var tage = await window.api.getTageForWoche(currentWocheId);
  currentWeekTage = tage;

  document.getElementById('wochenplanTitle').textContent = 'Wochenplan KW ' + woche.kalenderwoche;

  var pageNum = await window.api.getOrAssignPageNumber('WOCHE', currentWocheId, 'Woche ' + currentWocheId);
  document.getElementById('wochenplanPage').textContent = 'S. ' + pageNum;

  var pt = woche.planungsTermin;
  var ptDay = DAY_NAMES[pt.wochentag - 1] || 'Sonntag';
  document.getElementById('wochenplanPlanungstermin').textContent = 'Planung: ' + ptDay + ' um ' + pt.uhrzeit;

  // Input phases
  var inputDiv = document.getElementById('wochenplanInputPhasen');
  if (woche.inputPhasen.length === 0) {
    inputDiv.innerHTML = '<p class="muted body-small">Keine Phasen eingetragen.</p>';
  } else {
    inputDiv.innerHTML = woche.inputPhasen.map(function(p) {
      return '<div class="phase-item" style="background:' + getFachColor(p.fach) + '">' +
        '<div class="phase-name">' + esc(p.bezeichnung) + '</div>' +
        '<div class="phase-fach">' + esc(p.fach) + '</div></div>';
    }).join('');
  }

  // Self-study phases
  var selbstDiv = document.getElementById('wochenplanSelbstPhasen');
  if (woche.selbsterarbeitungsPhasen.length === 0) {
    selbstDiv.innerHTML = '<p class="muted body-small">Keine Phasen eingetragen.</p>';
  } else {
    selbstDiv.innerHTML = woche.selbsterarbeitungsPhasen.map(function(p) {
      return '<div class="phase-item" style="background:' + getFachColor(p.fach) + '">' +
        '<div class="phase-name">' + esc(p.bezeichnung) + '</div>' +
        '<div class="phase-fach">' + esc(p.fach) + '</div></div>';
    }).join('');
  }

  renderThemen(woche);
  renderTage(tage);
  renderPrivateTermine(woche);

  document.getElementById('wochenReflexion').value = woche.reflexion || '';

  document.getElementById('wochenplanLoading').classList.add('hidden');
  document.getElementById('wochenplanContent').classList.remove('hidden');
}

function renderThemen(woche) {
  var div = document.getElementById('wochenplanThemen');
  if (woche.modulThemen.length === 0) {
    div.innerHTML = '<p class="muted body-small">Noch keine Themen.</p>';
    return;
  }
  div.innerHTML = woche.modulThemen.map(function(t) {
    var isSelected = selectedThemaId === t.id;
    var assignedTag = t.zugewiesenerTag ? currentWeekTage.find(function(tg) { return tg.id === t.zugewiesenerTag; }) : null;
    return '<div class="thema-item ' + (isSelected ? 'selected' : '') + '" onclick="selectThema(\'' + t.id + '\')">' +
      '<div class="thema-info"><div class="thema-name">' + esc(t.bezeichnung) + '</div>' +
      '<div class="thema-modul">' + esc(t.modul) + '</div></div>' +
      '<span class="thema-tag">' + (assignedTag ? assignedTag.datum : 'Nicht zugewiesen') + '</span>' +
      '<button class="thema-delete" onclick="event.stopPropagation(); deleteThema(\'' + t.id + '\')">' + icon('close') + '</button></div>';
  }).join('');
}

function renderTage(tage) {
  var div = document.getElementById('wochenplanTage');
  div.innerHTML = tage.sort(function(a, b) { return a.datum.localeCompare(b.datum); }).map(function(t) {
    var date = new Date(t.datum + 'T00:00:00');
    var dayName = DAY_NAMES[(date.getDay() + 6) % 7];
    var isAssignMode = selectedThemaId !== null;
    return '<button class="day-btn ' + (isAssignMode ? 'assign-mode' : '') + '" onclick="dayClick(\'' + t.id + '\')">' +
      '<span class="material-icons-outlined">' + (isAssignMode ? 'arrow_forward' : 'calendar_today') + '</span>' +
      dayName + ': ' + t.datum +
      (isAssignMode ? ' <small>(Hierher verschieben)</small>' : '') + '</button>';
  }).join('');
}

function selectThema(themaId) {
  selectedThemaId = selectedThemaId === themaId ? null : themaId;
  loadWochenPlan();
}

async function dayClick(tagId) {
  if (selectedThemaId) {
    await updateThemaTag(selectedThemaId, tagId);
    selectedThemaId = null;
    loadWochenPlan();
  } else {
    navigate('tagesplan', { tagId: tagId });
  }
}

async function updateThemaTag(themaId, tagId) {
  var woche = await window.api.getWoche(currentWocheId);
  if (!woche) return;
  woche.modulThemen = woche.modulThemen.map(function(t) {
    return t.id === themaId ? Object.assign({}, t, { zugewiesenerTag: tagId }) : t;
  });
  await window.api.insertWoche(woche);
}

function showAddThemaDialog() {
  showDialog('addThemaDialog');
  var select = document.getElementById('themaSubject');
  select.innerHTML = allSubjects.map(function(s) {
    return '<option value="' + esc(s.name) + '">' + esc(s.name) + '</option>';
  }).join('');
  updateThemaModuleDropdown();
}

function updateThemaModuleDropdown() {
  var subjectName = document.getElementById('themaSubject').value;
  var subject = allSubjects.find(function(s) { return s.name === subjectName; });
  var moduleSelect = document.getElementById('themaModule');
  if (subject && subject.module.length > 0) {
    moduleSelect.innerHTML = subject.module.map(function(m) {
      return '<option value="' + esc(m) + '">' + esc(m) + '</option>';
    }).join('');
  } else {
    moduleSelect.innerHTML = '<option value="">Kein Modul</option>';
  }
}

async function confirmAddThema() {
  var name = document.getElementById('themaName').value.trim();
  var modul = document.getElementById('themaModule').value || '';
  if (!name) return;

  var woche = await window.api.getWoche(currentWocheId);
  if (!woche) return;

  woche.modulThemen.push({ id: crypto.randomUUID(), bezeichnung: name, modul: modul });
  await window.api.insertWoche(woche);
  closeDialog();
  loadWochenPlan();
}

async function deleteThema(themaId) {
  var woche = await window.api.getWoche(currentWocheId);
  if (!woche) return;
  woche.modulThemen = woche.modulThemen.filter(function(t) { return t.id !== themaId; });
  await window.api.insertWoche(woche);
  loadWochenPlan();
}

async function saveWochenReflexion() {
  var woche = await window.api.getWoche(currentWocheId);
  if (!woche) return;
  woche.reflexion = document.getElementById('wochenReflexion').value;
  await window.api.insertWoche(woche);
}

function renderPrivateTermine(woche) {
  var div = document.getElementById('wochenplanPrivateTermine');
  var list = woche.privateTermine || [];
  if (list.length === 0) {
    div.innerHTML = '<p class="muted body-small" style="margin-bottom:8px">Keine privaten Termine.</p>';
    return;
  }
  div.innerHTML = list.slice().sort(function(a, b) { return a.datum.localeCompare(b.datum); }).map(function(t) {
    return '<div class="simple-item">' +
      '<span class="color-dot" style="background:#2ECC71"></span>' +
      '<div class="simple-item-text"><div class="simple-item-title">' + esc(t.beschreibung) + '</div>' +
      '<div class="simple-item-sub">' + t.datum + '</div></div>' +
      '<button class="item-delete-btn" onclick="deletePrivaterTermin(\'' + t.id + '\')">' + icon('delete') + '</button></div>';
  }).join('');
}

function showAddPrivaterTerminDialog() {
  document.getElementById('privTerminDesc').value = '';
  document.getElementById('privTerminDate').value = getToday();
  showDialog('privaterTerminDialog');
}

async function confirmAddPrivaterTermin() {
  var desc = document.getElementById('privTerminDesc').value.trim();
  var datum = document.getElementById('privTerminDate').value;
  if (!desc || !datum || !currentWocheId) return;

  var woche = await window.api.getWoche(currentWocheId);
  if (!woche) return;
  woche.privateTermine = (woche.privateTermine || []).concat([
    { id: crypto.randomUUID(), datum: datum, beschreibung: desc, ort: '' }
  ]);
  await window.api.insertWoche(woche);
  closeDialog();
  loadWochenPlan();
}

async function deletePrivaterTermin(id) {
  var woche = await window.api.getWoche(currentWocheId);
  if (!woche) return;
  woche.privateTermine = (woche.privateTermine || []).filter(function(t) { return t.id !== id; });
  await window.api.insertWoche(woche);
  loadWochenPlan();
}

async function migrateTasks() {
  var woche = await window.api.getWoche(currentWocheId);
  if (!woche) return;

  var tage = await window.api.getTageForWoche(currentWocheId);
  var unfinishedTasks = tage.flatMap(function(t) { return t.grosseAufgaben.concat(t.schnellAufgaben); })
    .filter(function(a) { return a.status === 'OFFEN'; });

  if (unfinishedTasks.length === 0) return;

  for (var i = 0; i < tage.length; i++) {
    var tag = tage[i];
    tag.grosseAufgaben = tag.grosseAufgaben.map(function(a) { return a.status === 'OFFEN' ? Object.assign({}, a, { status: 'MIGRIERT' }) : a; });
    tag.schnellAufgaben = tag.schnellAufgaben.map(function(a) { return a.status === 'OFFEN' ? Object.assign({}, a, { status: 'MIGRIERT' }) : a; });
    await window.api.insertTag(tag);
  }

  var allWochen = await window.api.getWochenForSchuljahr(woche.schuljahrId);
  var nextWoche = allWochen
    .filter(function(w) { return w.kalenderwoche > woche.kalenderwoche; })
    .sort(function(a, b) { return a.kalenderwoche - b.kalenderwoche; })[0];

  if (nextWoche) {
    var newThemen = unfinishedTasks.map(function(a) {
      return { id: 'migrated_' + crypto.randomUUID(), bezeichnung: a.inhalt, modul: 'Migration' };
    });
    nextWoche.modulThemen = nextWoche.modulThemen.concat(newThemen);
    await window.api.insertWoche(nextWoche);
  }

  loadWochenPlan();
}

async function createDummyWeekData() {
  var now = new Date();
  var kw = getISOWeekNumber(now);
  var monday = new Date(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  var schuljahre = await window.api.getAllSchuljahre();
  var sjId = schuljahre.length > 0 ? schuljahre[schuljahre.length - 1].id : '2026_2027';
  var wocheId = 'Woche_' + sjId + '_' + kw;

  var dummyWoche = {
    id: wocheId, schuljahrId: sjId, kalenderwoche: kw,
    planungsTermin: { wochentag: 7, uhrzeit: '18:00' },
    inputPhasen: [{ id: '1', bezeichnung: 'Vorlesung Mathe', fach: 'Mathe' }],
    selbsterarbeitungsPhasen: [{ id: '2', bezeichnung: 'Uebungsblatt Mathe', fach: 'Mathe' }],
    modulThemen: [
      { id: 't1', bezeichnung: 'Integration', modul: 'Mathe' },
      { id: 't2', bezeichnung: 'Derivate', modul: 'Mathe' }
    ],
    privateTermine: null, reflexion: null
  };
  await window.api.insertWoche(dummyWoche);

  for (var i = 0; i < 7; i++) {
    var date = new Date(monday);
    date.setDate(date.getDate() + i);
    var ds = dateToStr(date);
    await window.api.insertTag({ id: 'tag_' + ds, wocheId: wocheId, datum: ds, grosseAufgaben: [], schnellAufgaben: [] });
  }

  loadWochenPlan();
}

// ========== TagesPlan ==========
async function loadTagesPlan(tagId) {
  if (tagId) currentTagId = tagId;
  if (!currentTagId) return;

  document.getElementById('tagesplanLoading').classList.remove('hidden');
  document.getElementById('tagesplanContent').classList.add('hidden');

  allSubjects = await window.api.getAllSubjects();
  var tag = await window.api.getTag(currentTagId);

  if (!tag) {
    document.getElementById('tagesplanLoading').innerHTML = '<p class="muted">Tagesplan nicht gefunden.</p>';
    return;
  }

  document.getElementById('tagesplanTitle').textContent = 'Tagesplan ' + tag.datum;

  var pageNum = await window.api.getOrAssignPageNumber('TAG', currentTagId, 'Tagesplan ' + currentTagId);
  document.getElementById('tagesplanPage').textContent = 'S. ' + pageNum;

  renderBigTasks(tag);
  renderQuickTasks(tag);

  document.getElementById('tagesplanLoading').classList.add('hidden');
  document.getElementById('tagesplanContent').classList.remove('hidden');
}

function renderBigTasks(tag) {
  var div = document.getElementById('tagesplanBigTasks');
  div.innerHTML = tag.grosseAufgaben.map(function(a) {
    return '<div class="task-item" style="background:' + getFachColor(a.fach) + '">' +
      '<input type="checkbox" ' + (a.status === 'ERLEDIGT' ? 'checked' : '') + ' onchange="toggleTask(\'' + a.id + '\', true, this.checked)">' +
      '<span class="task-text ' + (a.status === 'ERLEDIGT' ? 'done' : '') + '">' + bujoSymbol(a.status) + ' ' + esc(a.inhalt) + '</span>' +
      '<button class="task-delete" onclick="cycleTaskStatus(\'' + a.id + '\', true)" title="Status wechseln">' + icon('sync') + '</button>' +
      '<button class="task-delete" onclick="deleteTask(\'' + a.id + '\', true)">' + icon('close') + '</button></div>';
  }).join('');
}

function renderQuickTasks(tag) {
  var div = document.getElementById('tagesplanQuickTasks');
  div.innerHTML = tag.schnellAufgaben.map(function(a) {
    return '<div class="task-item" style="background:' + getFachColor(a.fach) + '">' +
      '<input type="checkbox" ' + (a.status === 'ERLEDIGT' ? 'checked' : '') + ' onchange="toggleTask(\'' + a.id + '\', false, this.checked)">' +
      '<span class="task-text ' + (a.status === 'ERLEDIGT' ? 'done' : '') + '">' + bujoSymbol(a.status) + ' ' + esc(a.inhalt) + '</span>' +
      '<button class="task-delete" onclick="cycleTaskStatus(\'' + a.id + '\', false)" title="Status wechseln">' + icon('sync') + '</button>' +
      '<button class="task-delete" onclick="deleteTask(\'' + a.id + '\', false)">' + icon('close') + '</button></div>';
  }).join('');
}

async function cycleTaskStatus(aufgabeId, isBig) {
  var tag = await window.api.getTag(currentTagId);
  if (!tag) return;

  var list = isBig ? tag.grosseAufgaben : tag.schnellAufgaben;
  var order = ['OFFEN', 'ERLEDIGT', 'MIGRIERT', 'VERWORFEN'];
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === aufgabeId) {
      var idx = order.indexOf(list[i].status);
      if (idx === -1) idx = 0;
      list[i].status = order[(idx + 1) % order.length];
    }
  }
  await window.api.insertTag(tag);
  if (isBig) renderBigTasks(tag);
  else renderQuickTasks(tag);
}

async function addBigTask() {
  var input = document.getElementById('newBigTask');
  var text = input.value.trim();
  if (!text) return;

  var tag = await window.api.getTag(currentTagId);
  if (!tag) return;

  tag.grosseAufgaben.push({ id: crypto.randomUUID(), typ: 'TASK', status: 'OFFEN', inhalt: text, fach: null });

  if (tag.grosseAufgaben.length > 2) {
    showDialog('warningDialog');
  }

  await window.api.insertTag(tag);
  input.value = '';
  renderBigTasks(tag);
}

async function addQuickTask() {
  var input = document.getElementById('newQuickTask');
  var text = input.value.trim();
  if (!text) return;

  var tag = await window.api.getTag(currentTagId);
  if (!tag) return;

  tag.schnellAufgaben.push({ id: crypto.randomUUID(), typ: 'TASK', status: 'OFFEN', inhalt: text, fach: null });
  await window.api.insertTag(tag);
  input.value = '';
  renderQuickTasks(tag);
}

async function toggleTask(aufgabeId, isBig, checked) {
  var tag = await window.api.getTag(currentTagId);
  if (!tag) return;

  var list = isBig ? tag.grosseAufgaben : tag.schnellAufgaben;
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === aufgabeId) {
      list[i].status = checked ? 'ERLEDIGT' : 'OFFEN';
    }
  }
  await window.api.insertTag(tag);
  if (isBig) renderBigTasks(tag);
  else renderQuickTasks(tag);
}

async function deleteTask(aufgabeId, isBig) {
  var tag = await window.api.getTag(currentTagId);
  if (!tag) return;

  if (isBig) tag.grosseAufgaben = tag.grosseAufgaben.filter(function(a) { return a.id !== aufgabeId; });
  else tag.schnellAufgaben = tag.schnellAufgaben.filter(function(a) { return a.id !== aufgabeId; });

  await window.api.insertTag(tag);
  if (isBig) renderBigTasks(tag);
  else renderQuickTasks(tag);
}

// ========== StundenPlan ==========
async function loadStundenPlan() {
  allSubjects = await window.api.getAllSubjects();
  var schuljahre = await window.api.getAllSchuljahre();
  var sj = schuljahre.length > 0 ? schuljahre[schuljahre.length - 1] : null;
  document.getElementById('stundenplanSchuljahr').textContent = sj ? sj.id : '';
  if (!sj) return;

  var slots = await window.api.getStundenplanSlots(sj.id);
  var body = document.getElementById('stundenplanBody');
  var html = '';

  for (var stunde = 1; stunde <= 8; stunde++) {
    html += '<tr>';
    html += '<td class="sp-hour-cell">' + stunde + '.</td>';
    for (var wt = 1; wt <= 5; wt++) {
      var slot = slots.find(function(s) { return s.wochentag === wt && s.stunde === stunde; });
      if (slot && slot.fach) {
        html += '<td class="sp-slot-filled" onclick="openSlotDialog(' + wt + ',' + stunde + ')">' +
          '<div class="sp-slot-fach">' + esc(slot.fach) + '</div>' +
          '<div class="sp-slot-info">' + esc([slot.raum, slot.lehrer].filter(Boolean).join(' · ')) + '</div></td>';
      } else {
        html += '<td onclick="openSlotDialog(' + wt + ',' + stunde + ')"></td>';
      }
    }
    html += '</tr>';
  }
  body.innerHTML = html;
}

async function openSlotDialog(wochentag, stunde) {
  var schuljahre = await window.api.getAllSchuljahre();
  if (!schuljahre.length) return;
  pendingSlot = { schuljahrId: schuljahre[schuljahre.length - 1].id, wochentag: wochentag, stunde: stunde };

  document.getElementById('slotInfo').textContent =
    DAY_NAMES[wochentag - 1] + ', ' + stunde + '. Stunde';

  var chips = document.getElementById('slotFachChips');
  chips.innerHTML = allSubjects.map(function(s) {
    return '<button type="button" class="chip" data-fach="' + esc(s.name) + '" onclick="selectSlotChip(this)">' + esc(s.name) + '</button>';
  }).join('');
  document.getElementById('slotFachCustom').value = '';
  document.getElementById('slotRaum').value = '';
  document.getElementById('slotLehrer').value = '';

  var slots = await window.api.getStundenplanSlots(pendingSlot.schuljahrId);
  var existing = slots.find(function(s) { return s.wochentag === wochentag && s.stunde === stunde; });
  if (existing) {
    document.getElementById('slotRaum').value = existing.raum || '';
    document.getElementById('slotLehrer').value = existing.lehrer || '';
    var chip = chips.querySelector('[data-fach="' + existing.fach.replace(/"/g, '\\"') + '"]');
    if (chip) { selectSlotChip(chip); } else { document.getElementById('slotFachCustom').value = existing.fach || ''; }
  }

  showDialog('slotDialog');
}

function selectSlotChip(el) {
  el.parentElement.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('selected'); });
  el.classList.add('selected');
}

function getSelectedSlotFach() {
  var custom = document.getElementById('slotFachCustom').value.trim();
  if (custom) return custom;
  var sel = document.querySelector('#slotFachChips .chip.selected');
  return sel ? sel.dataset.fach : '';
}

async function confirmSlot() {
  if (!pendingSlot) return;
  var fach = getSelectedSlotFach();
  if (!fach) { closeDialog(); loadStundenPlan(); return; }

  await window.api.insertStundenplanSlot({
    id: 'slot_' + pendingSlot.schuljahrId + '_' + pendingSlot.wochentag + '_' + pendingSlot.stunde,
    schuljahrId: pendingSlot.schuljahrId,
    wochentag: pendingSlot.wochentag,
    stunde: pendingSlot.stunde,
    fach: fach,
    raum: document.getElementById('slotRaum').value.trim(),
    lehrer: document.getElementById('slotLehrer').value.trim()
  });

  closeDialog();
  loadStundenPlan();
}

async function deleteSlot() {
  if (!pendingSlot) return;
  await window.api.deleteStundenplanSlot(
    'slot_' + pendingSlot.schuljahrId + '_' + pendingSlot.wochentag + '_' + pendingSlot.stunde
  );
  closeDialog();
  loadStundenPlan();
}

// ========== HabitTracker ==========
function weekMonday(offsetWeeks) {
  var d = new Date();
  d.setDate(d.getDate() + offsetWeeks * 7);
  var day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

async function loadHabitsScreen() {
  var monday = weekMonday(habitWeekOffset);
  var sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  document.getElementById('habitWeekLabel').textContent =
    fmtDMY(dateToStr(monday)) + ' – ' + fmtDMY(dateToStr(sunday));

  var habits = await window.api.getAllHabits();
  var completions = await window.api.getHabitCompletions(dateToStr(monday), dateToStr(sunday));
  var div = document.getElementById('habitList');

  if (habits.length === 0) {
    div.innerHTML = '<div class="empty-state">' + icon('repeat', 'empty-icon') +
      '<span class="muted">Noch keine Habits angelegt.</span></div>';
    return;
  }

  div.innerHTML = habits.map(function(h) {
    var daysHtml = '';
    for (var i = 0; i < 7; i++) {
      var d = new Date(monday);
      d.setDate(d.getDate() + i);
      var ds = dateToStr(d);
      var done = completions.some(function(c) { return c.habitId === h.id && c.date === ds && c.completed; });
      var dowShort = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i];
      var isToday = ds === getToday();
      daysHtml += '<div class="habit-day-box' + (done ? ' done' : '') + '" style="' +
        (done ? 'background:' + h.colorHex + ';border-color:' + h.colorHex + ';color:#fff' : 'color:' + (isToday ? h.colorHex : '')) +
        '" onclick="toggleHabitDay(\'' + h.id + '\', \'' + ds + '\', ' + !done + ')">' +
        '<span class="dow">' + dowShort + '</span><span class="dom">' + d.getDate() + '</span></div>';
    }
    return '<div class="habit-item">' +
      '<div class="habit-name-area"><div class="habit-name"><span class="color-dot" style="background:' + h.colorHex + '"></span>' +
      esc(h.name) + '</div>' +
      (h.startTime ? '<div class="habit-time">' + h.startTime + (h.endTime ? ' – ' + h.endTime : '') + '</div>' : '') +
      '</div>' +
      '<div class="habit-week">' + daysHtml + '</div>' +
      '<button class="item-delete-btn" onclick="deleteHabit(\'' + h.id + '\')">' + icon('delete') + '</button></div>';
  }).join('');
}

function habitWeekShift(delta) {
  habitWeekOffset += delta;
  loadHabitsScreen();
}

async function toggleHabitDay(habitId, ds, completed) {
  await window.api.setHabitCompletion(habitId, ds, completed);
  loadHabitsScreen();
}

async function deleteHabit(id) {
  await window.api.deleteHabit(id);
  loadHabitsScreen();
}

function showAddHabitDialog() {
  document.getElementById('habitName').value = '';
  document.getElementById('habitStartTime').value = '';
  document.getElementById('habitEndTime').value = '';
  pendingHabitColor = '#3498DB';
  var picker = document.getElementById('habitColorPicker');
  picker.innerHTML = SUBJECT_COLORS.map(function(c) {
    return '<div class="color-option ' + (c === pendingHabitColor ? 'selected' : '') + '" style="background:' + c + '"' +
      ' data-color="' + c + '" onclick="selectHabitColor(this, \'' + c + '\')"></div>';
  }).join('');
  showDialog('habitDialog');
}

function selectHabitColor(el, color) {
  pendingHabitColor = color;
  el.parentElement.querySelectorAll('.color-option').forEach(function(o) { o.classList.remove('selected'); });
  el.classList.add('selected');
}

async function confirmAddHabit() {
  var name = document.getElementById('habitName').value.trim();
  if (!name) return;

  await window.api.insertHabit({
    name: name,
    frequency: 'daily',
    colorHex: pendingHabitColor,
    startTime: document.getElementById('habitStartTime').value || null,
    endTime: document.getElementById('habitEndTime').value || null
  });
  closeDialog();
  if (currentScreen === 'habits') loadHabitsScreen();
  else loadDashboardHabits();
}

// ========== Subject Manager ==========
async function loadSubjectManager() {
  allSubjects = await window.api.getAllSubjects();
  var list = document.getElementById('subjectList');

  if (allSubjects.length === 0) {
    list.innerHTML = '<div class="empty-state">' + icon('school', 'empty-icon') + '<span class="muted">Keine Faecher vorhanden. Lege eins an!</span></div>';
    return;
  }

  list.innerHTML = allSubjects.map(function(s) {
    return '<div class="subject-item" onclick="navigate(\'subject-detail\', {subjectName: \'' + esc(s.name) + '\'})">' +
      '<div class="color-swatch" style="background:' + s.colorHex + '"></div>' +
      '<div class="subject-info"><div class="subject-name">' + esc(s.name) + '</div>' +
      (s.lehrer ? '<div class="subject-teacher">Lehrer: ' + esc(s.lehrer) + '</div>' : '') +
      '</div>' + icon('chevron_right', 'subject-arrow') + '</div>';
  }).join('');
}

function showAddSubjectDialog() {
  document.getElementById('addSubjectName').value = '';
  var picker = document.getElementById('colorPicker');
  picker.innerHTML = SUBJECT_COLORS.map(function(c) {
    return '<div class="color-option ' + (c === '#3498DB' ? 'selected' : '') + '" ' +
      'style="background:' + c + '" data-color="' + c + '" onclick="selectColor(this, \'' + c + '\')"></div>';
  }).join('');
  showDialog('addSubjectDialog');
}

function selectColor(el, color) {
  document.querySelectorAll('.color-option').forEach(function(o) { o.classList.remove('selected'); });
  el.classList.add('selected');
}

async function confirmAddSubject() {
  var name = document.getElementById('addSubjectName').value.trim();
  var selectedEl = document.querySelector('.color-option.selected');
  var color = selectedEl ? selectedEl.dataset.color : '#3498DB';
  if (!name) return;

  await window.api.insertSubject({ name: name, colorHex: color, lehrer: null, module: [] });
  closeDialog();
  loadSubjectManager();
}

// ========== Subject Detail ==========
async function loadSubjectDetail(subjectName) {
  if (subjectName) currentSubjectName = subjectName;
  if (!currentSubjectName) return;

  allSubjects = await window.api.getAllSubjects();
  var subject = allSubjects.find(function(s) { return s.name === currentSubjectName; });
  if (!subject) return;

  document.getElementById('subjectDetailTitle').textContent = subject.name;
  document.getElementById('subjectTeacher').value = subject.lehrer || '';
  document.getElementById('subjectColorCircle').style.background = subject.colorHex;

  renderModules(subject);
}

function renderModules(subject) {
  var list = document.getElementById('subjectModuleList');
  list.innerHTML = (subject.module || []).map(function(m) {
    return '<div class="module-item"><span>' + esc(m) + '</span>' +
      '<button class="module-delete" onclick="deleteModule(\'' + esc(m) + '\')">' + icon('close') + '</button></div>';
  }).join('');
}

async function saveSubjectTeacher() {
  var subject = allSubjects.find(function(s) { return s.name === currentSubjectName; });
  if (!subject) return;
  subject.lehrer = document.getElementById('subjectTeacher').value;
  await window.api.insertSubject(subject);
}

async function addModule() {
  var input = document.getElementById('newModuleText');
  var text = input.value.trim();
  if (!text) return;

  var subject = allSubjects.find(function(s) { return s.name === currentSubjectName; });
  if (!subject) return;
  subject.module = (subject.module || []).concat([text]);
  await window.api.insertSubject(subject);
  input.value = '';
  renderModules(subject);
}

async function deleteModule(moduleName) {
  var subject = allSubjects.find(function(s) { return s.name === currentSubjectName; });
  if (!subject) return;
  subject.module = (subject.module || []).filter(function(m) { return m !== moduleName; });
  await window.api.insertSubject(subject);
  renderModules(subject);
}

// ========== Quick Add ==========
function showQuickAddDialog() {
  document.getElementById('quickAddText').value = '';
  document.getElementById('quickAddFach').value = '';
  document.getElementById('quickAddBig').checked = false;
  showDialog('quickAddDialog');
}

async function confirmQuickAdd() {
  var text = document.getElementById('quickAddText').value.trim();
  var fach = document.getElementById('quickAddFach').value.trim() || null;
  var isBig = document.getElementById('quickAddBig').checked;
  if (!text) return;

  var tagId = 'tag_' + getToday();
  var tag = await window.api.getTag(tagId);
  if (!tag) { closeDialog(); return; }

  var newAufgabe = { id: crypto.randomUUID(), typ: 'TASK', status: 'OFFEN', inhalt: text, fach: fach };
  if (isBig) tag.grosseAufgaben.push(newAufgabe);
  else tag.schnellAufgaben.push(newAufgabe);

  await window.api.insertTag(tag);
  closeDialog();
}

// ========== Settings ==========
async function loadSettings() {
  var prefs = await window.api.getPrefs();
  pdfSettings = (prefs && prefs.pdfSettings) || null;
  applyTheme((prefs && prefs.themeMode) || 'system');
  updateThemeButtons();
  fillPdfSettingsForm();

  var profile = await window.api.getUserProfile();
  profile = profile || {};
  document.getElementById('profileName').value = profile.name || '';
  document.getElementById('profileSchule').value = profile.schule || '';
  document.getElementById('profileAbschluss').value = profile.abschluss || '';
  document.getElementById('profileStudiengang').value = profile.studiengang || '';
  document.getElementById('profileSemester').value = profile.semester || '';
  document.getElementById('profileUni').value = profile.uni || '';
  document.getElementById('profileEmail').value = profile.email || '';
}

async function saveProfile() {
  await window.api.insertUserProfile({
    name: document.getElementById('profileName').value.trim(),
    schule: document.getElementById('profileSchule').value.trim(),
    abschluss: document.getElementById('profileAbschluss').value.trim(),
    studiengang: document.getElementById('profileStudiengang').value.trim(),
    semester: document.getElementById('profileSemester').value.trim(),
    uni: document.getElementById('profileUni').value.trim(),
    email: document.getElementById('profileEmail').value.trim()
  });
}

function readPdfSettingsForm() {
  return {
    pdfTitle: document.getElementById('pdfTitle').value.trim() || 'BULLET JOURNAL',
    accentColor: document.getElementById('pdfAccentColor').value,
    textColor: document.getElementById('pdfTextColor').value,
    gridColor: document.getElementById('pdfGridColor').value,
    gridStyle: document.getElementById('pdfGridStyle').value,
    showCoverPage: document.getElementById('pdfShowCover').checked,
    showTableOfContents: document.getElementById('pdfShowToc').checked,
    showAblaufplan: document.getElementById('pdfShowAblauf').checked,
    showWochenplan: document.getElementById('pdfShowWochen').checked,
    showHabitTracker: document.getElementById('pdfShowHabits').checked,
    showStundenplan: document.getElementById('pdfShowStundenplan').checked
  };
}

function fillPdfSettingsForm() {
  var s = pdfSettings || {};
  document.getElementById('pdfTitle').value = s.pdfTitle !== undefined ? s.pdfTitle : 'BULLET JOURNAL';
  document.getElementById('pdfAccentColor').value = s.accentColor || '#E67E22';
  document.getElementById('pdfTextColor').value = s.textColor || '#2C3E50';
  document.getElementById('pdfGridColor').value = s.gridColor || '#DCDDE1';
  document.getElementById('pdfGridStyle').value = s.gridStyle || 'DOT';
  document.getElementById('pdfShowCover').checked = s.showCoverPage !== false;
  document.getElementById('pdfShowToc').checked = s.showTableOfContents !== false;
  document.getElementById('pdfShowAblauf').checked = s.showAblaufplan !== false;
  document.getElementById('pdfShowWochen').checked = s.showWochenplan !== false;
  document.getElementById('pdfShowHabits').checked = s.showHabitTracker !== false;
  document.getElementById('pdfShowStundenplan').checked = s.showStundenplan !== false;
}

async function savePdfSettings() {
  pdfSettings = readPdfSettingsForm();
  await window.api.setPdfSettings(pdfSettings);
}

async function exportPdf() {
  await savePdfSettings();

  var result = await window.api.showSaveDialog({
    title: 'BuJo Plan als PDF speichern',
    defaultPath: 'Bujo_Plan_Export.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (!result.canceled && result.filePath) {
    await window.api.exportPdf(result.filePath);
  }
}

async function previewPdf() {
  await savePdfSettings();

  var result = await window.api.showSaveDialog({
    title: 'PDF-Vorschau mit Beispieldaten speichern',
    defaultPath: 'Bujo_Plan_Vorschau.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (!result.canceled && result.filePath) {
    await window.api.exportPdf(result.filePath, { testData: true });
  }
}

function showClearDataDialog() {
  document.getElementById('confirmTitle').textContent = 'Daten loeschen?';
  document.getElementById('confirmMessage').textContent = 'Dies wird alle deine Aufgaben, Plaene und Faecher unwiderruflich entfernen.';
  confirmCallback = async function() {
    await window.api.clearAllData();
    navigate('dashboard');
  };
  showDialog('confirmDialog');
}

async function confirmAction() {
  if (confirmCallback) {
    await confirmCallback();
    confirmCallback = null;
  }
  closeDialog();
}

// ========== License ==========
async function submitLicenseKey() {
  var input = document.getElementById('licenseKeyInput');
  var key = input.value.trim().toUpperCase();
  var errorDiv = document.getElementById('licenseError');
  var successDiv = document.getElementById('licenseSuccess');

  errorDiv.classList.add('hidden');
  successDiv.classList.add('hidden');

  if (!key) {
    errorDiv.textContent = 'Bitte gib einen Lizenzschlüssel ein.';
    errorDiv.classList.remove('hidden');
    return;
  }

  var isValid = await window.api.validateLicense(key);
  if (!isValid) {
    errorDiv.textContent = 'Ungültiger Lizenzschlüssel. Bitte überprüfe deine Eingabe.';
    errorDiv.classList.remove('hidden');
    return;
  }

  await window.api.saveLicense(key);
  successDiv.classList.remove('hidden');
  setTimeout(function() { navigate('dashboard'); }, 1200);
}

// ========== Init ==========
document.addEventListener('DOMContentLoaded', async function() {
  try {
    var prefs = await window.api.getPrefs();
    applyTheme((prefs && prefs.themeMode) || 'system');
  } catch (e) {
    applyTheme('system');
  }

  var licensed = await window.api.checkLicense();
  if (licensed) {
    navigate('dashboard', {});
  } else {
    showScreen('license', {});
  }
});
