const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Schuljahr
  getAllSchuljahre: () => ipcRenderer.invoke('db:getAllSchuljahre'),
  getSchuljahr: (id) => ipcRenderer.invoke('db:getSchuljahr', id),
  insertSchuljahr: (sj) => ipcRenderer.invoke('db:insertSchuljahr', sj),
  
  // Monat
  getMonateForSchuljahr: (sjId) => ipcRenderer.invoke('db:getMonateForSchuljahr', sjId),
  getMonat: (id) => ipcRenderer.invoke('db:getMonat', id),
  insertMonat: (m) => ipcRenderer.invoke('db:insertMonat', m),
  
  // Woche
  getWochenForSchuljahr: (sjId) => ipcRenderer.invoke('db:getWochenForSchuljahr', sjId),
  getWoche: (id) => ipcRenderer.invoke('db:getWoche', id),
  insertWoche: (w) => ipcRenderer.invoke('db:insertWoche', w),
  
  // Tag
  getTageForWoche: (wocheId) => ipcRenderer.invoke('db:getTageForWoche', wocheId),
  getTag: (id) => ipcRenderer.invoke('db:getTag', id),
  getTagByDate: (date) => ipcRenderer.invoke('db:getTagByDate', date),
  getTagsInRange: (start, end) => ipcRenderer.invoke('db:getTagsInRange', start, end),
  insertTag: (t) => ipcRenderer.invoke('db:insertTag', t),
  
  // JournalSeite
  getAllJournalSeiten: () => ipcRenderer.invoke('db:getAllJournalSeiten'),
  insertJournalSeite: (s) => ipcRenderer.invoke('db:insertJournalSeite', s),
  getOrAssignPageNumber: (bezugTyp, bezugId, titel) => ipcRenderer.invoke('db:getOrAssignPageNumber', bezugTyp, bezugId, titel),
  
  // Subject
  getAllSubjects: () => ipcRenderer.invoke('db:getAllSubjects'),
  insertSubject: (s) => ipcRenderer.invoke('db:insertSubject', s),
  deleteSubject: (name) => ipcRenderer.invoke('db:deleteSubject', name),
  
  // Wochenraster
  generateWochenraster: (schuljahr) => ipcRenderer.invoke('db:generateWochenraster', schuljahr),
  
  // Clear
  clearAllData: () => ipcRenderer.invoke('db:clearAllData'),

  // PDF Export
  exportPdf: (filePath, options) => ipcRenderer.invoke('db:exportPdf', filePath, options),
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:save', options),

  // Stundenplan
  getStundenplanSlots: (schuljahrId) => ipcRenderer.invoke('db:getStundenplanSlots', schuljahrId),
  insertStundenplanSlot: (slot) => ipcRenderer.invoke('db:insertStundenplanSlot', slot),
  deleteStundenplanSlot: (id) => ipcRenderer.invoke('db:deleteStundenplanSlot', id),

  // User Profile
  getUserProfile: () => ipcRenderer.invoke('db:getUserProfile'),
  insertUserProfile: (p) => ipcRenderer.invoke('db:insertUserProfile', p),

  // Habits
  getAllHabits: () => ipcRenderer.invoke('db:getAllHabits'),
  insertHabit: (h) => ipcRenderer.invoke('db:insertHabit', h),
  deleteHabit: (id) => ipcRenderer.invoke('db:deleteHabit', id),
  getHabitCompletions: (start, end) => ipcRenderer.invoke('db:getHabitCompletions', start, end),
  setHabitCompletion: (habitId, date, completed) => ipcRenderer.invoke('db:setHabitCompletion', habitId, date, completed),

  // Prefs
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setThemeMode: (mode) => ipcRenderer.invoke('prefs:setThemeMode', mode),
  setPdfSettings: (s) => ipcRenderer.invoke('prefs:setPdfSettings', s),

  // License
  validateLicense: (key) => ipcRenderer.invoke('license:validate', key),
  checkLicense: () => ipcRenderer.invoke('license:check'),
  saveLicense: (key) => ipcRenderer.invoke('license:save', key),
});
