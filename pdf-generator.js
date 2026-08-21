/**
 * Noted Bujo - PDF Generator (port of Android PdfGenerator.kt)
 * Landscape A4 plan: Cover, TOC, Stundenplan, Schuljahresablaufplan,
 * Wochenplan, Habit-Tracker. Runs in the Electron main process.
 */

const { jsPDF } = require('jspdf');

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 28;
const CW = PAGE_W - 2 * MARGIN;
const LH = 1.17; // line height factor approximating StaticLayout

const COLOR_PRUEFUNG = '#E74C3C';
const COLOR_ABGABE = '#3498DB';
const COLOR_TERMIN = '#2ECC71';
const COLOR_TODO = '#9B59B6';
const COLOR_FERIEN = '#95A5A6';
const LIGHTGRAY = [204, 204, 204];

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const DAY_NAMES_FULL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// ---------- helpers ----------

function hexToRgb(hex) {
  try {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  } catch (e) { return [0, 0, 0]; }
}

function strToDate(s) {
  var p = s.split('-');
  return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
}

function dateToStr(d) {
  if (typeof d === 'string') return d;
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function fmtDMY(d) {
  return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
}

function weekStartOf(date) {
  var d = new Date(date);
  var day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function schoolYearWeeks(startStr, endStr) {
  var weeks = [];
  var ws = weekStartOf(strToDate(startStr));
  var end = strToDate(endStr);
  while (ws <= end) {
    var we = new Date(ws); we.setDate(we.getDate() + 4);
    weeks.push([new Date(ws), we]);
    ws.setDate(ws.getDate() + 7);
  }
  return weeks;
}

function ferienCoveringWeek(ferien, days) {
  for (var i = 0; i < ferien.length; i++) {
    var f = ferien[i];
    var all = true;
    for (var j = 0; j < days.length; j++) {
      if (days[j] < strToDate(f.start) || days[j] > strToDate(f.ende)) { all = false; break; }
    }
    if (all) return f;
  }
  return null;
}

function isFreiTag(schuljahr, date) {
  if ((schuljahr.schulfreieTage || []).indexOf(dateToStr(date)) !== -1) return true;
  var ds = dateToStr(date);
  return (schuljahr.ferien || []).some(function(f) { return ds >= f.start && ds <= f.ende; });
}

function aufgabeText(a) {
  return (!a.fach) ? a.inhalt : a.fach + ': ' + a.inhalt;
}

function terminText(t) {
  return (!t.fach) ? t.beschreibung : t.fach + ': ' + t.beschreibung;
}

function moduleText(thema) {
  return (!thema.modul) ? thema.bezeichnung : thema.modul + ': ' + thema.bezeichnung;
}

function weekLabel(ws, we) {
  return String(ws.getDate()).padStart(2, '0') + '.' + String(ws.getMonth() + 1).padStart(2, '0') + '. – ' + fmtDMY(we);
}

function monthLabel(year, monthIdx) {
  return MONTH_NAMES[monthIdx] + ' ' + year;
}

// ---------- low-level drawing ----------

function setFont(doc, family, style, size) {
  doc.setFont(family || 'helvetica', style || 'normal');
  doc.setFontSize(size || 9);
}

function textColor(doc, color, alpha) {
  var rgb = hexToRgb(color);
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  if (alpha != null && alpha < 1) doc.setGState(new doc.GState({ opacity: alpha }));
  else doc.setGState(new doc.GState({ opacity: 1 }));
}

function fillOpacity(doc, color, opacity) {
  var rgb = hexToRgb(color);
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  if (opacity != null && opacity < 1) doc.setGState(new doc.GState({ opacity: opacity }));
  else doc.setGState(new doc.GState({ opacity: 1 }));
}

function strokeColor(doc, color) {
  var rgb = hexToRgb(color);
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

/** Draws wrapped text with yTop as TOP of block. Returns consumed height. */
function drawWrapped(doc, text, x, yTop, width, o) {
  o = o || {};
  text = text == null ? '' : String(text);
  if (!text.length) return 0;
  setFont(doc, o.family, o.style, o.size);
  textColor(doc, o.color || '#000000', o.alpha);
  var lines = doc.splitTextToSize(text, Math.max(width, 1));
  var size = o.size || 9;
  var lh = size * LH;
  for (var i = 0; i < lines.length; i++) {
    doc.text(lines[i], x, yTop + i * lh + size * 0.8);
  }
  doc.setGState(new doc.GState({ opacity: 1 }));
  return lines.length * lh;
}

function measureWrapped(doc, text, width, o) {
  o = o || {};
  text = text == null ? '' : String(text);
  if (!text.length) return 0;
  setFont(doc, o.family, o.style, o.size);
  return doc.splitTextToSize(text, Math.max(width, 1)).length * (o.size || 9) * LH;
}

// ---------- Pager ----------

function Pager(doc, settings) {
  this.doc = doc;
  this.settings = settings;
  this.pageNum = 0;
  this.y = MARGIN;
}

Pager.prototype.drawFooter = function() {
  var d = this.doc;
  setFont(d, 'helvetica', 'italic', 9);
  textColor(d, this.settings.textColor, 0.59);
  d.text('Noted Bujo', MARGIN, PAGE_H - 12);
  var ps = '- ' + this.pageNum + ' -';
  var w = d.getTextWidth(ps);
  d.text(ps, (PAGE_W - w) / 2, PAGE_H - 12);
  d.setGState(new d.GState({ opacity: 1 }));
};

Pager.prototype.startNew = function() {
  if (this.pageNum > 0) {
    this.drawFooter();
    this.doc.addPage();
  }
  this.pageNum++;
  this.y = MARGIN;
};

Pager.prototype.finishAll = function() {
  if (this.pageNum > 0) this.drawFooter();
};

Pager.prototype.need = function(h) {
  return this.y + h > PAGE_H - MARGIN - 14;
};

// ---------- shared section pieces ----------

function drawSectionHeading(pager, settings, title, subtitle) {
  pager.y += drawWrapped(pager.doc, title, MARGIN, pager.y, CW, { family: 'times', style: 'bold', size: 20, color: settings.textColor });
  pager.y += 2;
  pager.y += drawWrapped(pager.doc, subtitle, MARGIN, pager.y, CW, { family: 'helvetica', style: 'italic', size: 11, color: settings.textColor, alpha: 0.78 });
  pager.y += 6;
}

function drawLegend(pager, items, settings) {
  var d = pager.doc;
  var lx = MARGIN;
  var ly = pager.y + 8;
  pager.y += 14;
  setFont(d, 'helvetica', 'normal', 9);
  items.forEach(function(item) {
    var tw = d.getTextWidth(item.label);
    var w = 13 + tw;
    if (lx + w > MARGIN + CW) { lx = MARGIN; ly += 13; pager.y += 13; }
    if (item.checkbox === null || item.checkbox === undefined) {
      fillOpacity(d, item.color, 1);
      d.rect(lx, ly - 7, 7, 7, 'F');
      d.setGState(new d.GState({ opacity: 1 }));
    } else {
      fillOpacity(d, item.color, 1);
      strokeColor(d, item.color);
      d.setLineWidth(0.8);
      d.rect(lx, ly - 7, 7, 7, 'S');
      if (item.checkbox) {
        d.setLineWidth(1.2);
        d.line(lx + 1.5, ly - 3.5, lx + 3, ly - 1.5);
        d.line(lx + 3, ly - 1.5, lx + 5.8, ly - 6);
      }
    }
    setFont(d, 'helvetica', 'normal', 9);
    textColor(d, settings.textColor);
    d.text(item.label, lx + 11, ly);
    lx += w + 16;
  });
  pager.y += 6;
  d.setGState(new d.GState({ opacity: 1 }));
}

function drawTableHeader(pager, labels, widths, settings) {
  var d = pager.doc;
  var h = 16;
  fillOpacity(d, settings.accentColor, 25 / 255);
  d.rect(MARGIN, pager.y, CW, h, 'F');
  d.setGState(new d.GState({ opacity: 1 }));
  setFont(d, 'helvetica', 'bold', 9);
  textColor(d, settings.textColor);
  var x = MARGIN;
  labels.forEach(function(label, i) {
    var tw = d.getTextWidth(label);
    d.text(label, x + (widths[i] - tw) / 2, pager.y + 11);
    x += widths[i];
  });
  d.setDrawColor(LIGHTGRAY[0], LIGHTGRAY[1], LIGHTGRAY[2]);
  d.setLineWidth(0.5);
  var vx = MARGIN;
  widths.slice(0, -1).forEach(function(w) {
    vx += w;
    d.line(vx, pager.y, vx, pager.y + h);
  });
  pager.y += h;
  d.line(MARGIN, pager.y, MARGIN + CW, pager.y);
}

function drawHolidayRow(pager, name, range, rowH, settings) {
  var d = pager.doc;
  fillOpacity(d, COLOR_FERIEN, 60 / 255);
  d.rect(MARGIN, pager.y, CW, rowH, 'F');
  d.setGState(new d.GState({ opacity: 1 }));
  var text = !range ? name : name + ' ' + range;
  setFont(d, 'helvetica', 'bold', 9);
  textColor(d, settings.textColor);
  var tw = d.getTextWidth(text);
  d.text(text, MARGIN + (CW - tw) / 2, pager.y + 12);
  pager.y += rowH;
  d.setDrawColor(LIGHTGRAY[0], LIGHTGRAY[1], LIGHTGRAY[2]);
  d.setLineWidth(0.5);
  d.line(MARGIN, pager.y, MARGIN + CW, pager.y);
}

function segmentStyle(kind, settings) {
  switch (kind) {
    case 'LERNEN': return { color: settings.accentColor };
    case 'PRUEFUNG': return { color: COLOR_PRUEFUNG };
    case 'ABGABE': return { color: COLOR_ABGABE };
    case 'TERMIN': return { color: COLOR_TERMIN };
    default: return { color: settings.textColor };
  }
}

function drawCellSegments(pager, segments, x, yTop, width, settings) {
  var sy = yTop;
  segments.forEach(function(seg) {
    var st = segmentStyle(seg.kind, settings);
    sy += drawWrapped(pager.doc, seg.text, x, sy, width, { family: 'helvetica', style: 'normal', size: 8, color: st.color }) + 1;
  });
  return sy - yTop;
}

// jsPDF measurement needs a doc; we use a module-level scratch doc.
var _scratchDoc = null;
function null_doc() {
  if (!_scratchDoc) _scratchDoc = new jsPDF({ unit: 'pt', format: 'a4' });
  return _scratchDoc;
}

// ---------- data building ----------

function buildAblaufRows(schuljahr, wochenEntries, settings) {
  var tageByDate = {};
  (wochenEntries || []).forEach(function(entry) {
    entry.tage.forEach(function(t) { tageByDate[t.datum] = t; });
  });
  var pruefungen = (schuljahr.klausuren || []).concat(schuljahr.angekuendigteLKs || []);

  return schoolYearWeeks(schuljahr.start, schuljahr.ende).map(function(pair) {
    var ws = pair[0], we = pair[1];
    var days = [];
    for (var i = 0; i < 5; i++) { var d = new Date(ws); d.setDate(d.getDate() + i); days.push(d); }
    var holiday = ferienCoveringWeek(schuljahr.ferien || [], days);
    if (holiday) {
      return {
        label: weekLabel(ws, we),
        holidayName: holiday.bezeichnung,
        holidayRange: (dateToStr(holiday.start) !== dateToStr(days[0]) || dateToStr(holiday.ende) !== dateToStr(days[4]))
          ? '(' + fmtDMY(strToDate(holiday.start)) + ' – ' + fmtDMY(strToDate(holiday.ende)) + ')' : null
      };
    }
    return {
      label: weekLabel(ws, we),
      days: days.map(function(d) {
        var ds = dateToStr(d);
        var tag = tageByDate[ds];
        var segs = [];
        if (tag) (tag.grosseAufgaben || []).forEach(function(a) {
          segs.push({ text: '• ' + aufgabeText(a), kind: 'LERNEN' });
        });
        pruefungen.forEach(function(t) {
          if (t.datum === ds) segs.push({ text: 'X ' + terminText(t), kind: 'PRUEFUNG' });
        });
        (schuljahr.abgabefristen || []).forEach(function(t) {
          if (t.datum === ds) segs.push({ text: '» ' + terminText(t), kind: 'ABGABE' });
        });
        return { segments: segs, frei: isFreiTag(schuljahr, d) };
      })
    };
  });
}

function buildWochenRows(schuljahr, wochenEntries, settings) {
  var sorted = (wochenEntries || []).slice().sort(function(a, b) { return a.woche.kalenderwoche - b.woche.kalenderwoche; });
  var usedIds = {};
  var pruefungen = (schuljahr.klausuren || []).concat(schuljahr.angekuendigteLKs || []);

  return schoolYearWeeks(schuljahr.start, schuljahr.ende).map(function(pair) {
    var ws = pair[0], we = pair[1];
    var days = [];
    for (var i = 0; i < 5; i++) { var d = new Date(ws); d.setDate(d.getDate() + i); days.push(d); }
    var holiday = ferienCoveringWeek(schuljahr.ferien || [], days);
    if (holiday) {
      return {
        label: weekLabel(ws, we),
        holidayName: holiday.bezeichnung,
        holidayRange: (dateToStr(holiday.start) !== dateToStr(days[0]) || dateToStr(holiday.ende) !== dateToStr(days[4]))
          ? '(' + fmtDMY(strToDate(holiday.start)) + ' – ' + fmtDMY(strToDate(holiday.ende)) + ')' : null
      };
    }
    var wocheEntry = null;
    for (var k = 0; k < sorted.length; k++) {
      var e = sorted[k];
      if (usedIds[e.woche.id]) continue;
      var any = e.tage.some(function(t) { var td = strToDate(t.datum); return td >= ws && td <= we; });
      if (any) { wocheEntry = e; usedIds[e.woche.id] = true; break; }
    }
    var tage = wocheEntry ? wocheEntry.tage : [];
    var woche = wocheEntry ? wocheEntry.woche : null;
    return {
      label: weekLabel(ws, we),
      days: days.map(function(d) {
        var ds = dateToStr(d);
        var tag = tage.find(function(t) { return t.datum === ds; });
        var segs = [];
        if (tag) (tag.grosseAufgaben || []).forEach(function(a) {
          segs.push({ text: '• ' + aufgabeText(a), kind: 'LERNEN' });
        });
        if (woche && woche.privateTermine) woche.privateTermine.forEach(function(t) {
          if (t.datum === ds) segs.push({ text: '@ ' + terminText(t), kind: 'TERMIN' });
        });
        pruefungen.forEach(function(t) {
          if (t.datum === ds) segs.push({ text: 'X ' + terminText(t), kind: 'PRUEFUNG' });
        });
        (schuljahr.abgabefristen || []).forEach(function(t) {
          if (t.datum === ds) segs.push({ text: '» ' + terminText(t), kind: 'ABGABE' });
        });
        return { segments: segs, frei: isFreiTag(schuljahr, d) };
      }),
      module: (woche && woche.modulThemen) || [],
      todos: tage.flatMap(function(t) { return t.schnellAufgaben || []; }).map(aufgabeText)
    };
  });
}

function buildHabitMonths(schuljahr, habits, completions) {
  var active = (habits || []);
  if (!active.length) return [];
  var months = [];
  var cur = new Date(strToDate(schuljahr.start).getFullYear(), strToDate(schuljahr.start).getMonth(), 1);
  var last = new Date(strToDate(schuljahr.ende).getFullYear(), strToDate(schuljahr.ende).getMonth(), 1);
  while (cur <= last) {
    var year = cur.getFullYear(), month = cur.getMonth();
    var dim = new Date(year, month + 1, 0).getDate();
    var prefix = year + '-' + String(month + 1).padStart(2, '0') + '-';
    var rows = active.map(function(h) {
      var completedDays = {};
      completions.forEach(function(c) {
        if (c.habitId === h.id && c.completed && c.date.indexOf(prefix) === 0) {
          completedDays[parseInt(c.date.slice(8), 10)] = true;
        }
      });
      return { name: h.name, color: h.colorHex || '#9B59B6', completedDays: completedDays };
    });
    months.push({ label: monthLabel(year, month), year: year, month: month, daysInMonth: dim, rows: rows });
    cur = new Date(year, month + 1, 1);
  }
  return months;
}

// ---------- sections ----------

function drawAblaufSection(pager, settings, rows, subtitle) {
  var dateCol = 95;
  var dayCol = (CW - dateCol) / 5;
  var widths = [dateCol, dayCol, dayCol, dayCol, dayCol, dayCol];
  var labels = ['Datum / Woche'].concat(DAY_NAMES_FULL);
  var pad = 3;
  var minRowH = 18;

  pager.startNew();
  drawSectionHeading(pager, settings, 'Schuljahresablaufplan', subtitle);
  drawLegend(pager, [
    { label: 'Aufgaben / Lernen', color: settings.accentColor },
    { label: 'Klausuren / Prüfungen', color: COLOR_PRUEFUNG },
    { label: 'Abgaben / Fristen', color: COLOR_ABGABE },
    { label: 'Ferien / unterrichtsfrei', color: COLOR_FERIEN }
  ], settings);
  drawTableHeader(pager, labels, widths, settings);

  rows.forEach(function(row) {
    if (row.holidayName != null) {
      if (pager.need(minRowH)) {
        pager.startNew();
        drawTableHeader(pager, labels, widths, settings);
      }
      drawHolidayRow(pager, row.holidayName, row.holidayRange, minRowH, settings);
      return;
    }
    var cellWs = dayCol - 2 * pad;
    var heights = row.days.map(function(day) {
      var h = 0;
      day.segments.forEach(function(seg) {
        h += measureWrapped(null_doc(), seg.text, cellWs, { family: 'helvetica', style: 'normal', size: 8 }) + 1;
      });
      return h;
    });
    var maxH = Math.max.apply(null, heights.concat([0]));
    var rowH = Math.max(maxH + 2 * pad, minRowH);

    if (pager.need(rowH)) {
      pager.startNew();
      drawTableHeader(pager, labels, widths, settings);
    }

    var top = pager.y;
    var d = pager.doc;
    row.days.forEach(function(day, i) {
      var cx = MARGIN + dateCol + i * dayCol;
      if (day.frei) {
        fillOpacity(d, COLOR_FERIEN, 25 / 255);
        d.rect(cx, top, dayCol, rowH, 'F');
        d.setGState(new d.GState({ opacity: 1 }));
      }
      drawCellSegments(pager, day.segments, cx + pad, top + pad, cellWs, settings);
    });
    drawWrapped(pager.doc, row.label, MARGIN + pad, top + pad, dateCol - 2 * pad, { family: 'helvetica', style: 'bold', size: 9, color: settings.textColor });

    pager.y = top + rowH;
    d.setDrawColor(LIGHTGRAY[0], LIGHTGRAY[1], LIGHTGRAY[2]);
    d.setLineWidth(0.5);
    d.line(MARGIN, pager.y, MARGIN + CW, pager.y);
    var vx = MARGIN;
    widths.slice(0, -1).forEach(function(w) {
      vx += w;
      d.line(vx, top, vx, top + rowH);
    });
  });
}

function drawWochenSection(pager, settings, rows, subtitle) {
  var dateCol = 85;
  var moduleCol = 125;
  var todoCol = 82;
  var dayCol = (CW - dateCol - moduleCol - todoCol) / 5;
  var widths = [dateCol, dayCol, dayCol, dayCol, dayCol, dayCol, moduleCol, todoCol];
  var labels = ['Datum / Woche'].concat(DAY_NAMES_FULL).concat(['Zu bearbeitende Module', 'Sonstige To-dos']);
  var pad = 3;
  var minRowH = 18;

  pager.startNew();
  drawSectionHeading(pager, settings, 'Wochenplan', subtitle);
  drawLegend(pager, [
    { label: 'Modulbearbeitung / Übungen / Lernen', color: settings.accentColor },
    { label: 'Termine', color: COLOR_TERMIN },
    { label: 'Leistungsnachweise / Abgaben', color: COLOR_PRUEFUNG },
    { label: 'Sonstige To-dos', color: COLOR_TODO },
    { label: 'In Bearbeitung', color: settings.textColor, checkbox: false },
    { label: 'Abgeschlossen', color: settings.textColor, checkbox: true }
  ], settings);
  drawTableHeader(pager, labels, widths, settings);

  var d = pager.doc;
  rows.forEach(function(row) {
    if (row.holidayName != null) {
      if (pager.need(minRowH)) {
        pager.startNew();
        drawTableHeader(pager, labels, widths, settings);
      }
      drawHolidayRow(pager, row.holidayName, row.holidayRange, minRowH, settings);
      return;
    }

    var cellWs = dayCol - 2 * pad;
    var moduleWs = moduleCol - 14;
    var todoWs = todoCol - 2 * pad;
    var moduleHeights = 0;
    row.module.forEach(function(thema) {
      moduleHeights += measureWrapped(null_doc(), moduleText(thema), moduleWs, { family: 'helvetica', style: 'normal', size: 8 }) + 3;
    });
    var todoHeight = 0;
    row.todos.forEach(function(todo) {
      todoHeight += measureWrapped(null_doc(), '• ' + todo, todoWs, { family: 'helvetica', style: 'normal', size: 8 }) + 1;
    });
    var dayHeights = row.days.map(function(day) {
      var h = 0;
      day.segments.forEach(function(seg) {
        h += measureWrapped(null_doc(), seg.text, cellWs, { family: 'helvetica', style: 'normal', size: 8 }) + 1;
      });
      return h;
    });
    var maxH = Math.max.apply(null, dayHeights.concat([moduleHeights, todoHeight, 0]));
    var rowH = Math.max(maxH + 2 * pad, minRowH);

    if (pager.need(rowH)) {
      pager.startNew();
      drawTableHeader(pager, labels, widths, settings);
    }

    var top = pager.y;
    row.days.forEach(function(day, i) {
      var cx = MARGIN + dateCol + i * dayCol;
      if (day.frei) {
        fillOpacity(d, COLOR_FERIEN, 25 / 255);
        d.rect(cx, top, dayCol, rowH, 'F');
        d.setGState(new d.GState({ opacity: 1 }));
      }
      drawCellSegments(pager, day.segments, cx + pad, top + pad, cellWs, settings);
    });
    drawWrapped(pager.doc, row.label, MARGIN + pad, top + pad, dateCol - 2 * pad, { family: 'helvetica', style: 'bold', size: 9, color: settings.textColor });

    var moduleX = MARGIN + dateCol + 5 * dayCol;
    var my = top + pad;
    row.module.forEach(function(thema) {
      strokeColor(d, settings.textColor);
      d.setLineWidth(0.8);
      d.rect(moduleX + 3, my + 1.5, 5, 5, 'S');
      my += drawWrapped(pager.doc, moduleText(thema), moduleX + 12, my, moduleWs, { family: 'helvetica', style: 'normal', size: 8, color: COLOR_TODO }) + 3;
    });

    var todoX = moduleX + moduleCol;
    var ty = top + pad;
    row.todos.forEach(function(todo) {
      ty += drawWrapped(pager.doc, '• ' + todo, todoX + pad, ty, todoWs, { family: 'helvetica', style: 'normal', size: 8, color: COLOR_TODO }) + 1;
    });

    pager.y = top + rowH;
    d.setDrawColor(LIGHTGRAY[0], LIGHTGRAY[1], LIGHTGRAY[2]);
    d.setLineWidth(0.5);
    d.line(MARGIN, pager.y, MARGIN + CW, pager.y);
    var vx = MARGIN;
    widths.slice(0, -1).forEach(function(w) {
      vx += w;
      d.line(vx, top, vx, top + rowH);
    });
  });
}

function drawHabitSection(pager, settings, months, subtitle) {
  pager.startNew();
  drawSectionHeading(pager, settings, 'Habit-Tracker', subtitle);
  if (!months.length) {
    pager.y += drawWrapped(pager.doc, 'Keine aktiven Habits angelegt.', MARGIN, pager.y, CW, { family: 'helvetica', style: 'italic', size: 11, color: settings.textColor, alpha: 0.78 });
    return;
  }
  drawLegend(pager, [{ label: 'erledigt', color: settings.accentColor }], settings);
  var nameCol = 120;
  var rowH = 14;
  var d = pager.doc;

  months.forEach(function(m) {
    var cellW = (CW - nameCol) / m.daysInMonth;
    var blockH = 40 + m.rows.length * rowH;
    if (pager.need(blockH)) pager.startNew();

    pager.y += drawWrapped(pager.doc, m.label, MARGIN, pager.y, CW, { family: 'helvetica', style: 'bold', size: 9, color: settings.textColor }) + 4;
    for (var dayN = 1; dayN <= m.daysInMonth; dayN++) {
      var cxw = MARGIN + nameCol + (dayN - 1) * cellW;
      var dow = new Date(m.year, m.month, dayN).getDay();
      var weekday = DAY_SHORT[(dow + 6) % 7];
      setFont(d, 'helvetica', 'normal', 9);
      textColor(d, settings.textColor);
      var tw = d.getTextWidth(weekday);
      d.text(weekday, cxw + (cellW - tw) / 2, pager.y + 8);
    }
    pager.y += 12;

    m.rows.forEach(function(r) {
      var top = pager.y;
      drawWrapped(pager.doc, r.name, MARGIN, top, nameCol - 6, { family: 'helvetica', style: 'bold', size: 9, color: settings.textColor });
      for (var dayN = 1; dayN <= m.daysInMonth; dayN++) {
        var cx = MARGIN + nameCol + (dayN - 1) * cellW;
        var done = !!r.completedDays[dayN];
        d.setLineWidth(0.6);
        if (done) {
          fillOpacity(d, r.color, 1);
          d.rect(cx, top, cellW - 1, rowH - 3, 'F');
          d.setGState(new d.GState({ opacity: 1 }));
        } else {
          strokeColor(d, settings.gridColor);
          d.rect(cx, top, cellW - 1, rowH - 3, 'S');
        }
      }
      pager.y += rowH;
    });
    pager.y += 10;
  });
}

function drawStundenplanSection(pager, settings, slots, subtitle) {
  var hourCol = 26;
  var dayCol = (CW - hourCol) / 5;
  var rowH = 46;
  var labels = [''].concat(DAY_NAMES_FULL);
  var widths = [hourCol, dayCol, dayCol, dayCol, dayCol, dayCol];
  var d = pager.doc;

  pager.startNew();
  drawSectionHeading(pager, settings, 'Stundenplan', subtitle);
  drawTableHeader(pager, labels, widths, settings);

  var gridRgb = hexToRgb(settings.gridColor);
  for (var stunde = 1; stunde <= 8; stunde++) {
    if (pager.need(rowH)) {
      pager.startNew();
      drawTableHeader(pager, labels, widths, settings);
    }
    fillOpacity(d, settings.accentColor, 15 / 255);
    d.rect(MARGIN, pager.y, hourCol, rowH, 'F');
    d.setGState(new d.GState({ opacity: 1 }));
    setFont(d, 'helvetica', 'bold', 9);
    textColor(d, settings.textColor);
    var hw = d.getTextWidth(stunde + '.');
    d.text(stunde + '.', MARGIN + (hourCol - hw) / 2, pager.y + rowH / 2 + 4);

    for (var wochentag = 1; wochentag <= 5; wochentag++) {
      var x = MARGIN + hourCol + (wochentag - 1) * dayCol;
      var slot = (slots || []).find(function(s) { return s.wochentag === wochentag && s.stunde === stunde; });
      if (slot && slot.fach) {
        fillOpacity(d, settings.accentColor, 22 / 255);
        d.rect(x + 1, pager.y + 1, dayCol - 2, rowH - 2, 'F');
        d.setGState(new d.GState({ opacity: 1 }));
        var textW = dayCol - 8;
        var ty = pager.y + 13;
        ty += drawWrapped(pager.doc, slot.fach, x + 4, ty, textW, { family: 'helvetica', style: 'bold', size: 9, color: settings.textColor }) + 1;
        var subInfo = [slot.raum, slot.lehrer].filter(function(s) { return s && s.length; }).join(' · ');
        if (subInfo) {
          drawWrapped(pager.doc, subInfo, x + 4, ty, textW, { family: 'helvetica', style: 'normal', size: 9, color: settings.textColor });
        }
      }
    }
    pager.y += rowH;
    d.setDrawColor(gridRgb[0], gridRgb[1], gridRgb[2]);
    d.setLineWidth(0.8);
    d.line(MARGIN, pager.y, MARGIN + CW, pager.y);
  }
}

function profileRowsOf(p) {
  var rows = [];
  if (!p) return rows;
  if (p.name) rows.push(['NAME', p.name]);
  if (p.schule) rows.push(['SCHULE', p.schule]);
  if (p.abschluss) rows.push(['ABSCHLUSS', p.abschluss]);
  if (p.studiengang) rows.push(['STUDIUM', (p.studiengang + (p.semester ? ' (' + p.semester + ')' : '')).trim()]);
  if (p.uni) rows.push(['UNI', p.uni]);
  if (p.email) rows.push(['E-MAIL', p.email]);
  return rows;
}

function drawCoverPage(pager, settings, heading, range, profileRows) {
  pager.startNew();
  var d = pager.doc;

  var y = MARGIN + 70;
  strokeColor(d, settings.accentColor);
  d.setLineWidth(2);
  d.line(MARGIN, y, MARGIN + CW, y);
  y += 24;

  setFont(d, 'times', 'bold', 14);
  textColor(d, settings.accentColor);
  d.text((settings.pdfTitle || 'BULLET JOURNAL').toUpperCase(), MARGIN, y + 11);
  y += 20;

  setFont(d, 'times', 'bold', 36);
  textColor(d, settings.textColor);
  d.text(heading, MARGIN, y + 34);
  y += 46;

  setFont(d, 'helvetica', 'italic', 14);
  textColor(d, settings.textColor, 0.78);
  d.text(range, MARGIN, y + 12);
  y += 40;
  d.setGState(new d.GState({ opacity: 1 }));

  if (profileRows.length) {
    var rowH = 20;
    var cardH = profileRows.length * rowH + 24;
    fillOpacity(d, settings.accentColor, 20 / 255);
    d.rect(MARGIN, y, CW, cardH, 'F');
    d.setGState(new d.GState({ opacity: 1 }));
    fillOpacity(d, settings.accentColor, 1);
    d.rect(MARGIN, y, 4, cardH, 'F');
    d.setGState(new d.GState({ opacity: 1 }));
    var py = y + 12;
    profileRows.forEach(function(row) {
      setFont(d, 'helvetica', 'bold', 9);
      textColor(d, settings.textColor, 0.78);
      d.text(row[0], MARGIN + 16, py + 9);
      setFont(d, 'helvetica', 'normal', 12);
      textColor(d, settings.textColor);
      d.text(row[1], MARGIN + 130, py + 9);
      py += rowH;
    });
    d.setGState(new d.GState({ opacity: 1 }));
  }
}

function drawTocPage(pager, settings, entries) {
  pager.startNew();
  var d = pager.doc;
  var y = MARGIN + 20;
  y += drawWrapped(pager.doc, 'Inhaltsverzeichnis', MARGIN, y, CW, { family: 'times', style: 'bold', size: 22, color: settings.textColor });
  y += 24;
  entries.forEach(function(e) {
    setFont(d, 'helvetica', 'normal', 12);
    textColor(d, settings.textColor);
    d.text(e.title, MARGIN, y + 10);
    var pStr = String(e.pageNumber);
    var pw = d.getTextWidth(pStr);
    d.text(pStr, MARGIN + CW - pw, y + 10);
    var tw = d.getTextWidth(e.title);
    d.setLineWidth(0.6);
    strokeColor(d, settings.textColor);
    d.setGState(new d.GState({ opacity: 0.39 }));
    d.setLineDashPattern([2, 3], 0);
    d.line(MARGIN + tw + 8, y + 7, MARGIN + CW - pw - 8, y + 7);
    d.setLineDashPattern([], 0);
    d.setGState(new d.GState({ opacity: 1 }));
    y += 22;
  });
}

// ---------- orchestration ----------

function renderAllSections(pager, data, settings, tocEntries) {
  var schuljahre = data.schuljahre.slice().sort(function(a, b) { return a.start < b.start ? -1 : 1; });
  var latest = schuljahre[schuljahre.length - 1];

  if (settings.showStundenplan === undefined || settings.showStundenplan) {
    var stundenStart = pager.pageNum + 1;
    drawStundenplanSection(pager, settings, data.slotsBySchuljahr[latest.id] || [], subtitleFor(latest));
    tocEntries.push({ title: 'Stundenplan – ' + latest.id, pageNumber: stundenStart });
  }
  if (settings.showAblaufplan === undefined || settings.showAblaufplan) {
    schuljahre.forEach(function(sj) {
      var entries = data.wochenBySchuljahr[sj.id] || [];
      var ablaufStart = pager.pageNum + 1;
      drawAblaufSection(pager, settings, buildAblaufRows(sj, entries, settings), subtitleFor(sj));
      tocEntries.push({ title: 'Schuljahresablaufplan – ' + sj.id, pageNumber: ablaufStart });
    });
  }
  if (settings.showWochenplan === undefined || settings.showWochenplan) {
    schuljahre.forEach(function(sj) {
      var entries = data.wochenBySchuljahr[sj.id] || [];
      var wochenStart = pager.pageNum + 1;
      drawWochenSection(pager, settings, buildWochenRows(sj, entries, settings), subtitleFor(sj));
      tocEntries.push({ title: 'Wochenplan – ' + sj.id, pageNumber: wochenStart });
    });
  }
  if (settings.showHabitTracker === undefined || settings.showHabitTracker) {
    schuljahre.forEach(function(sj) {
      var entries = data.wochenBySchuljahr[sj.id] || [];
      var habitStart = pager.pageNum + 1;
      drawHabitSection(pager, settings, buildHabitMonths(sj, data.habits || [], data.completions || []), subtitleFor(sj));
      tocEntries.push({ title: 'Habit-Tracker – ' + sj.id, pageNumber: habitStart });
    });
  }
}

function subtitleFor(sj) {
  return 'Schuljahr ' + sj.id + '  ·  ' + fmtDMY(strToDate(sj.start)) + ' – ' + fmtDMY(strToDate(sj.ende));
}

function drawCoverAndToc(pager, data, settings, tocEntries) {
  var schuljahre = data.schuljahre.slice().sort(function(a, b) { return a.start < b.start ? -1 : 1; });
  var latest = schuljahre[schuljahre.length - 1];
  if (settings.showCoverPage === undefined || settings.showCoverPage) {
    drawCoverPage(pager, settings, 'Schuljahresplanung ' + latest.id,
      fmtDMY(strToDate(latest.start)) + ' – ' + fmtDMY(strToDate(latest.ende)),
      profileRowsOf(data.profile));
  }
  if (settings.showTableOfContents === undefined || settings.showTableOfContents) {
    drawTocPage(pager, settings, tocEntries);
  }
}

/**
 * Builds the complete plan PDF. Returns the jsPDF document.
 */
function buildPlanPdf(data, settings, testData) {
  var schuljahre = data.schuljahre.slice().sort(function(a, b) { return a.start < b.start ? -1 : 1; });
  var latest = schuljahre[schuljahre.length - 1];

  // Pass 1: dummy document to compute page numbers for the TOC.
  var tmpDoc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  var tmpPager = new Pager(tmpDoc, settings);
  var tocEntries = [{ title: 'Deckblatt', pageNumber: 1 }, { title: 'Inhaltsverzeichnis', pageNumber: 2 }];
  drawCoverAndToc(tmpPager, data, settings, tocEntries);
  renderAllSections(tmpPager, data, settings, tocEntries);
  tmpPager.finishAll();

  // Pass 2: real document.
  var doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setProperties({
    title: (settings.pdfTitle || 'BULLET JOURNAL') + ' – Schuljahresplanung',
    creator: 'Noted Bujo'
  });
  var pager = new Pager(doc, settings);
  drawCoverAndToc(pager, data, settings, tocEntries);
  renderAllSections(pager, data, settings, []);
  pager.finishAll();

  return doc;
}

module.exports = { buildPlanPdf };
