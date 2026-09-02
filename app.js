// ─── CONSTANTS ───────────────────────────────────────────────────────────────
// dayStartHour: 20 = "baby day" (20:00→20:00), 0 = midnight-to-midnight
let dayStartHour = parseInt(localStorage.getItem('sleepclick_dayStart') || '20', 10);

// ─── STATE ───────────────────────────────────────────────────────────────────
let sleepLogs = JSON.parse(localStorage.getItem('sleepLogs')) || [];
let activeSleepStart = localStorage.getItem('activeSleepStart') || null;
let activeWakeUps = parseInt(localStorage.getItem('activeWakeUps') || '0', 10);
let timerInterval = null;
let confirmCallback = null;
let editingLogId = null;

// wakeup counts for each modal
let saveWakeUps = 0;
let manualWakeUps = 0;
let editWakeUps = 0;
let lastNotifUpdate = 0;

// selected tags for each modal
let saveTags = [];
let manualTags = [];
let editTags = [];

// notification preference (separate from browser permission)
let notifEnabled = localStorage.getItem('sleepclick_notif') !== 'off';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getBabyDay(datetime) {
  const d = new Date(datetime);
  if (dayStartHour > 0 && d.getHours() >= dayStartHour) {
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    return new Date(next.getFullYear(), next.getMonth(), next.getDate());
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function babyDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function timelineXFraction(datetime, babyDayDate) {
  const start = new Date(babyDayDate);
  if (dayStartHour > 0) start.setDate(start.getDate() - 1);
  start.setHours(dayStartHour, 0, 0, 0);
  const diffMs = new Date(datetime) - start;
  return Math.max(0, Math.min(1, diffMs / (24 * 3600000)));
}

// Generates axis tick labels for the 24h window starting at dayStartHour
function getAxisTimes(stepHours) {
  const times = [];
  for (let i = 0; i <= 24; i += stepHours) {
    const hour = (dayStartHour + i) % 24;
    times.push({ label: `${String(hour).padStart(2, '0')}h`, frac: i / 24 });
  }
  return times;
}

// Permanently split cross-boundary records in sleepLogs (idempotent).
function migrateLogSplits() {
  const before = sleepLogs.length;
  sleepLogs = sleepLogs.flatMap(log => splitSessionAtBoundaries(log));
  const added = sleepLogs.length - before;
  if (added > 0) {
    persistLogs();
    showToast(t('toast_hotfix')(added), 'info');
  }
}

function setDayMode(hour) {
  if (dayStartHour === hour) return;
  dayStartHour = hour;
  localStorage.setItem('sleepclick_dayStart', String(hour));
  migrateLogSplits();
  updateDayModeUI();
  renderTodayCard();
  if (statsPage.classList.contains('active')) renderStats();
}

function updateDayModeUI() {
  const babyBtn = document.getElementById('dayModeBaby');
  const midnightBtn = document.getElementById('dayModeMidnight');
  if (!babyBtn || !midnightBtn) return;
  babyBtn.classList.toggle('active', dayStartHour === 20);
  midnightBtn.classList.toggle('active', dayStartHour === 0);
  const subtitle = document.getElementById('weekChartSubtitle');
  if (subtitle) {
    const h = String(dayStartHour).padStart(2, '0');
    subtitle.textContent = t('chart_subtitle')(h);
  }
}

function isNightSession(log) {
  const h = new Date(log.startTime).getHours();
  return h >= 19 || h < 7;
}

function formatDuration(ms) {
  if (ms <= 0) return '0m';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatDurationClock(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const secs = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const mins = totalMin % 60;
  const hrs = Math.floor(totalMin / 60);
  if (hrs > 0) {
    return `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  }
  return `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}

function formatDate(date) {
  return date.toLocaleDateString(currentLang === 'sk' ? 'sk-SK' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(date) {
  return String(date.getHours()).padStart(2,'0') + ':' + String(date.getMinutes()).padStart(2,'0');
}

function toDatetimeLocal(date) {
  const p = n => String(n).padStart(2,'0');
  return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

// Split a session that crosses a day boundary into fragments, one per day window.
function splitSessionAtBoundaries(log) {
  const endMs = new Date(log.endTime).getTime();
  let cursor = new Date(log.startTime).getTime();
  const fragments = [];
  let part = 0;

  while (cursor < endMs) {
    const cursorDay = getBabyDay(cursor);
    // End of this day's window
    const windowEnd = new Date(cursorDay);
    if (dayStartHour === 0) windowEnd.setDate(windowEnd.getDate() + 1);
    windowEnd.setHours(dayStartHour, 0, 0, 0);
    const windowEndMs = windowEnd.getTime();

    const fragEndMs = Math.min(endMs, windowEndMs);
    if (fragEndMs > cursor) {
      fragments.push({
        ...log,
        id: part === 0 ? log.id : `${log.id}_p${part}`,
        startTime: new Date(cursor).toISOString(),
        endTime: new Date(fragEndMs).toISOString(),
      });
    }
    part++;
    cursor = windowEndMs;
  }
  return fragments.length ? fragments : [log];
}

function groupByBabyDay(logs) {
  const map = new Map();
  for (const log of logs) {
    for (const frag of splitSessionAtBoundaries(log)) {
      const day = getBabyDay(frag.startTime);
      const key = babyDayKey(day);
      if (!map.has(key)) map.set(key, { date: day, logs: [] });
      map.get(key).logs.push(frag);
    }
  }
  // Sort each group chronologically
  map.forEach(g => g.logs.sort((a, b) => new Date(a.startTime) - new Date(b.startTime)));
  return map;
}

function getDaySummary(dayLogs) {
  let nightMs = 0, napMs = 0, longestMs = 0, napCount = 0;
  const nightSessions = [];
  for (const log of dayLogs) {
    const dur = new Date(log.endTime) - new Date(log.startTime);
    if (dur > longestMs) longestMs = dur;
    if (isNightSession(log)) {
      nightMs += dur;
      nightSessions.push(log);
    } else {
      napMs += dur;
      napCount++;
    }
  }

  // Night fragmentation: sort chronologically and compute gaps
  nightSessions.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const nightFragments = nightSessions.length;
  let longestNightMs = 0;
  let totalNightGapMs = 0;
  let nightGapCount = 0;
  for (let i = 0; i < nightSessions.length; i++) {
    const dur = new Date(nightSessions[i].endTime) - new Date(nightSessions[i].startTime);
    if (dur > longestNightMs) longestNightMs = dur;
    if (i > 0) {
      const gap = new Date(nightSessions[i].startTime) - new Date(nightSessions[i - 1].endTime);
      if (gap >= 0) { totalNightGapMs += gap; nightGapCount++; }
    }
  }
  const avgNightGapMs = nightGapCount > 0 ? totalNightGapMs / nightGapCount : 0;

  return { nightMs, napMs, totalMs: nightMs + napMs, longestMs, napCount,
           nightFragments, longestNightMs, avgNightGapMs, nightGapCount };
}

// ─── DOM REFERENCES ──────────────────────────────────────────────────────────
const trackerPage     = document.getElementById('trackerPage');
const statsPage       = document.getElementById('statsPage');
const tabTracker      = document.getElementById('tabTracker');
const tabStats        = document.getElementById('tabStats');

const statusIndicator = document.getElementById('statusIndicator');
const statusText      = document.getElementById('statusText');
const liveTimer       = document.getElementById('liveTimer');
const timerLabel      = document.getElementById('timerLabel');
const startBtn        = document.getElementById('startBtn');
const stopBtn         = document.getElementById('stopBtn');
const wakeUpRow       = document.getElementById('wakeUpRow');
const wakeUpBtn       = document.getElementById('wakeUpBtn');
const wakeUpCountEl   = document.getElementById('wakeUpCount');
const manualEntryBtn  = document.getElementById('manualEntryBtn');

const todayTotalLabel  = document.getElementById('todayTotalLabel');
const miniTimeline     = document.getElementById('miniTimeline');
const todayNightVal    = document.getElementById('todayNightVal');
const todayNapsVal     = document.getElementById('todayNapsVal');
const todayLongestVal  = document.getElementById('todayLongestVal');
const todayNapCountVal = document.getElementById('todayNapCountVal');

const statNightSleep  = document.getElementById('statNightSleep');
const statNapTotal    = document.getElementById('statNapTotal');
const statDayTotal    = document.getElementById('statDayTotal');
const statLongest     = document.getElementById('statLongest');
const weekTimeline    = document.getElementById('weekTimeline');
const historyList     = document.getElementById('historyList');
const exportBtn       = document.getElementById('exportBtn');
const importBtn       = document.getElementById('importBtn');
const importFileInput = document.getElementById('importFileInput');
const mockDataBtn     = document.getElementById('mockDataBtn');

const saveModal       = document.getElementById('saveModal');
const summaryDuration = document.getElementById('summaryDuration');
const saveNoteInput   = document.getElementById('saveNoteInput');
const saveSleepBtn    = document.getElementById('saveSleepBtn');
const discardSleepBtn = document.getElementById('discardSleepBtn');
const saveWakeUpValEl = document.getElementById('saveWakeUpVal');

const manualModal     = document.getElementById('manualModal');
const manualStartInput = document.getElementById('manualStart');
const manualEndInput  = document.getElementById('manualEnd');
const manualNoteInput = document.getElementById('manualNote');
const manualWakeUpValEl = document.getElementById('manualWakeUpVal');
const saveManualBtn   = document.getElementById('saveManualBtn');
const cancelManualBtn = document.getElementById('cancelManualBtn');

const editModal       = document.getElementById('editModal');
const editStartInput  = document.getElementById('editStart');
const editEndInput    = document.getElementById('editEnd');
const editNoteInput   = document.getElementById('editNote');
const editWakeUpValEl = document.getElementById('editWakeUpVal');
const saveEditBtn     = document.getElementById('saveEditBtn');
const cancelEditBtn   = document.getElementById('cancelEditBtn');

const confirmModal    = document.getElementById('confirmModal');
const confirmTitleEl  = document.getElementById('confirmTitle');
const confirmMsgEl    = document.getElementById('confirmMessage');
const confirmOkBtn    = document.getElementById('confirmOkBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');

const toastContainer  = document.getElementById('toastContainer');
const themeToggleBtn  = document.getElementById('themeToggleBtn');
const sunIcon         = document.querySelector('.sun-icon');
const moonIcon        = document.querySelector('.moon-icon');
const pwaInstallBtn   = document.getElementById('pwaInstallBtn');

const dayDetailModal  = document.getElementById('dayDetailModal');

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initPwa();
  initTrackerState();
  initWatchSync();

  // Handle ?action=stop when app opens from notification button
  if (new URLSearchParams(location.search).get('action') === 'stop' && activeSleepStart) {
    history.replaceState(null, '', location.pathname);
    handleStopSleep();
  }

  applyI18n();
  updateLangUI();
  document.getElementById('langSK').addEventListener('click', () => setLang('sk'));
  document.getElementById('langEN').addEventListener('click', () => setLang('en'));

  updateNotifToggleUI();
  document.getElementById('notifToggleBtn').addEventListener('click', toggleNotif);

  updateDayModeUI();
  if (dayStartHour === 0) migrateLogSplits(); // fix any pre-existing cross-midnight records
  document.getElementById('dayModeBaby').addEventListener('click', () => setDayMode(20));
  document.getElementById('dayModeMidnight').addEventListener('click', () => setDayMode(0));

  tabTracker.addEventListener('click', () => switchTab('trackerPage'));
  tabStats.addEventListener('click', () => switchTab('statsPage'));

  startBtn.addEventListener('click', handleStartSleep);
  stopBtn.addEventListener('click', handleStopSleep);
  wakeUpBtn.addEventListener('click', handleWakeUp);
  manualEntryBtn.addEventListener('click', openManualModal);

  // Save modal
  initTagGrid('saveTagsGrid', 'save');
  initStepper('saveWakeUpMinus', 'saveWakeUpPlus', saveWakeUpValEl, () => saveWakeUps, v => { saveWakeUps = v; });
  saveSleepBtn.addEventListener('click', saveSleepRecord);
  discardSleepBtn.addEventListener('click', () =>
    showConfirm(t('confirm_discard_title'), t('confirm_discard_msg'), discardActiveSleep, t('confirm_discard_ok'))
  );

  // Manual modal
  initTagGrid('manualTagsGrid', 'manual');
  initStepper('manualWakeUpMinus', 'manualWakeUpPlus', manualWakeUpValEl, () => manualWakeUps, v => { manualWakeUps = v; });
  cancelManualBtn.addEventListener('click', () => manualModal.classList.add('hidden'));
  saveManualBtn.addEventListener('click', saveManualEntry);

  // Edit modal
  initTagGrid('editTagsGrid', 'edit');
  initStepper('editWakeUpMinus', 'editWakeUpPlus', editWakeUpValEl, () => editWakeUps, v => { editWakeUps = v; });
  cancelEditBtn.addEventListener('click', () => editModal.classList.add('hidden'));
  saveEditBtn.addEventListener('click', saveEditEntry);

  // Confirm modal
  confirmCancelBtn.addEventListener('click', () => confirmModal.classList.add('hidden'));
  confirmOkBtn.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    if (confirmCallback) { confirmCallback(); confirmCallback = null; }
  });

  // Week timeline — click row to open day detail
  weekTimeline.addEventListener('click', e => {
    const key = e.target.getAttribute('data-day-key');
    if (key) openDayDetail(key);
  });

  // Day detail modal close
  document.getElementById('dayDetailClose').addEventListener('click', () => dayDetailModal.classList.add('hidden'));
  dayDetailModal.addEventListener('click', e => { if (e.target === dayDetailModal) dayDetailModal.classList.add('hidden'); });

  themeToggleBtn.addEventListener('click', toggleTheme);
  exportBtn.addEventListener('click', exportData);
  importBtn.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', importData);
  mockDataBtn.addEventListener('click', loadMockData);
  document.getElementById('clearAllBtn').addEventListener('click', () => {
    showConfirm(t('confirm_clear_title'), t('confirm_clear_msg'), () => {
      sleepLogs = [];
      persistLogs();
      renderTodayCard();
      renderStats();
      showToast(t('toast_cleared'), 'info');
    }, t('confirm_clear_ok'));
  });
});

// ─── TAG GRIDS ───────────────────────────────────────────────────────────────
function initTagGrid(gridId, context) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.querySelectorAll('.tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const tag = btn.dataset.tag;
      let arr = getTagArray(context);
      if (btn.classList.contains('active')) {
        if (!arr.includes(tag)) arr.push(tag);
      } else {
        const idx = arr.indexOf(tag);
        if (idx > -1) arr.splice(idx, 1);
      }
    });
  });
}

function getTagArray(context) {
  if (context === 'save') return saveTags;
  if (context === 'manual') return manualTags;
  return editTags;
}

function resetTagGrid(gridId, context) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  if (context === 'save') saveTags = [];
  else if (context === 'manual') manualTags = [];
  else editTags = [];
  grid.querySelectorAll('.tag-btn').forEach(btn => btn.classList.remove('active'));
}

function setTagGrid(gridId, context, tags) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  if (context === 'save') saveTags = [...(tags || [])];
  else if (context === 'manual') manualTags = [...(tags || [])];
  else editTags = [...(tags || [])];
  grid.querySelectorAll('.tag-btn').forEach(btn => {
    btn.classList.toggle('active', (tags || []).includes(btn.dataset.tag));
  });
}

// ─── STEPPERS ────────────────────────────────────────────────────────────────
function initStepper(minusId, plusId, display, getter, setter) {
  document.getElementById(minusId).addEventListener('click', () => {
    const v = Math.max(0, getter() - 1);
    setter(v);
    display.textContent = v;
  });
  document.getElementById(plusId).addEventListener('click', () => {
    const v = getter() + 1;
    setter(v);
    display.textContent = v;
  });
}

function setStepperVal(display, setter, val) {
  const v = Math.max(0, val);
  setter(v);
  display.textContent = v;
}

// ─── TABS ────────────────────────────────────────────────────────────────────
function switchTab(pageId) {
  const isTracker = pageId === 'trackerPage';
  trackerPage.classList.toggle('active', isTracker);
  statsPage.classList.toggle('active', !isTracker);
  tabTracker.classList.toggle('active', isTracker);
  tabStats.classList.toggle('active', !isTracker);
  if (!isTracker) renderStats();
}

// ─── TRACKER STATE ────────────────────────────────────────────────────────────
function initTrackerState() {
  if (activeSleepStart) {
    statusIndicator.className = 'status-card sleeping';
    statusText.textContent = t('status_sleeping');
    startBtn.disabled = true;
    stopBtn.disabled = false;
    wakeUpRow.classList.remove('hidden');
    wakeUpCountEl.textContent = `${activeWakeUps}×`;
    timerLabel.textContent = t('timer_sleeping');
    startTimerInterval();
  } else {
    statusIndicator.className = 'status-card idle';
    statusText.textContent = t('status_awake');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    wakeUpRow.classList.add('hidden');
    timerLabel.textContent = t('timer_wake_window');
    startTimerInterval();
  }
  renderTodayCard();
}

function handleStartSleep() {
  activeSleepStart = new Date().toISOString();
  activeWakeUps = 0;
  localStorage.setItem('activeSleepStart', activeSleepStart);
  localStorage.setItem('activeWakeUps', '0');
  initTrackerState();
  showSleepNotification();
  showToast(t('toast_sleep_started'), 'success');
}

function handleStopSleep() {
  if (!activeSleepStart) return;
  const diffMs = new Date() - new Date(activeSleepStart);
  if (diffMs < 30000) {
    showToast(t('toast_too_short'), 'error');
    discardActiveSleep();
    return;
  }
  summaryDuration.textContent = formatDuration(diffMs);
  saveNoteInput.value = '';
  resetTagGrid('saveTagsGrid', 'save');
  setStepperVal(saveWakeUpValEl, v => { saveWakeUps = v; }, activeWakeUps);
  saveModal.classList.remove('hidden');
}

function handleWakeUp() {
  activeWakeUps++;
  localStorage.setItem('activeWakeUps', String(activeWakeUps));
  wakeUpCountEl.textContent = `${activeWakeUps}×`;
  showToast(t('toast_wakeup'), 'info');
}

function saveSleepRecord() {
  if (!activeSleepStart) return;
  const record = {
    id: 'sleep_' + Date.now(),
    startTime: activeSleepStart,
    endTime: new Date().toISOString(),
    wakeUps: saveWakeUps,
    tags: [...saveTags],
    note: saveNoteInput.value.trim()
  };
  sleepLogs.unshift(record);
  persistLogs();
  activeSleepStart = null;
  activeWakeUps = 0;
  localStorage.removeItem('activeSleepStart');
  localStorage.removeItem('activeWakeUps');
  saveModal.classList.add('hidden');
  closeSleepNotification();
  initTrackerState();
  showToast(t('toast_record_saved'), 'success');
}

function discardActiveSleep() {
  activeSleepStart = null;
  activeWakeUps = 0;
  localStorage.removeItem('activeSleepStart');
  localStorage.removeItem('activeWakeUps');
  saveModal.classList.add('hidden');
  closeSleepNotification();
  initTrackerState();
  showToast(t('toast_discarded'), 'info');
}

// ─── TIMER ENGINE ─────────────────────────────────────────────────────────────
function startTimerInterval() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 1000);
  tickTimer();
}

function tickTimer() {
  const now = new Date();
  if (activeSleepStart) {
    // Show sleep duration
    const diffMs = now - new Date(activeSleepStart);
    liveTimer.textContent = formatDurationClock(diffMs);
    timerLabel.textContent = t('timer_sleeping');
    // Update notification every 60s
    if (now.getTime() - lastNotifUpdate > 60000) {
      lastNotifUpdate = now.getTime();
      updateSleepNotification();
    }
  } else {
    // Show wake window since last sleep ended
    const lastLog = sleepLogs[0];
    if (lastLog && lastLog.endTime) {
      const wakeMs = now - new Date(lastLog.endTime);
      liveTimer.textContent = formatDurationClock(wakeMs);
      timerLabel.textContent = t('timer_wake_window');
    } else {
      liveTimer.textContent = '—';
      timerLabel.textContent = t('timer_wake_window');
    }
  }
}

// ─── TODAY CARD ───────────────────────────────────────────────────────────────
function renderTodayCard() {
  const todayBabyDay = getBabyDay(new Date());
  const todayKey = babyDayKey(todayBabyDay);
  const grouped = groupByBabyDay(sleepLogs);
  const todayGroup = grouped.get(todayKey);

  // Include active session in today display
  let todayLogs = todayGroup ? [...todayGroup.logs] : [];
  if (activeSleepStart) {
    const activeLog = {
      id: '__active__',
      startTime: activeSleepStart,
      endTime: new Date().toISOString(),
      wakeUps: activeWakeUps,
      tags: [],
      note: '',
      isActive: true
    };
    todayLogs = [...todayLogs, activeLog];
  }

  if (!todayLogs.length) {
    todayTotalLabel.textContent = '—';
    todayNightVal.textContent = '—';
    todayNapsVal.textContent = '—';
    todayLongestVal.textContent = '—';
    todayNapCountVal.textContent = '—';
    miniTimeline.innerHTML = `<div class="mini-tl-placeholder">${t('today_no_records')}</div>`;
    return;
  }

  const summary = getDaySummary(todayLogs);
  todayTotalLabel.textContent = formatDuration(summary.totalMs);
  todayNightVal.textContent = summary.nightMs > 0 ? formatDuration(summary.nightMs) : '—';
  todayNapsVal.textContent = summary.napMs > 0 ? formatDuration(summary.napMs) : '—';
  todayLongestVal.textContent = formatDuration(summary.longestMs);
  todayNapCountVal.textContent = summary.nightFragments > 0 ? `${summary.nightFragments}×` : '—';

  renderMiniTimeline(todayLogs, todayBabyDay);
}

function renderMiniTimeline(logs, babyDayDate) {
  const W = miniTimeline.clientWidth || 320;
  const H = 28;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg">`;

  // Background track
  svg += `<rect x="0" y="8" width="${W}" height="12" rx="6" fill="var(--bd-faint)"/>`;

  // Hour ticks at 00:00 and 12:00
  const midnight = timelineXFraction(
    (() => { const d = new Date(babyDayDate); d.setHours(0,0,0,0); return d; })(),
    babyDayDate
  );
  const noon = timelineXFraction(
    (() => { const d = new Date(babyDayDate); d.setHours(12,0,0,0); return d; })(),
    babyDayDate
  );
  svg += `<line x1="${midnight*W}" y1="6" x2="${midnight*W}" y2="22" stroke="var(--bd-default)" stroke-width="1"/>`;
  svg += `<line x1="${noon*W}" y1="6" x2="${noon*W}" y2="22" stroke="var(--bd-default)" stroke-width="1"/>`;

  for (const log of logs) {
    const x1 = timelineXFraction(log.startTime, babyDayDate) * W;
    const x2 = timelineXFraction(log.endTime, babyDayDate) * W;
    const w = Math.max(x2 - x1, 3);
    const color = log.isActive ? 'var(--ac-secondary)' : (isNightSession(log) ? 'var(--color-night)' : 'var(--color-nap)');
    const opacity = log.isActive ? '0.6' : '1';
    svg += `<rect x="${x1}" y="8" width="${w}" height="12" rx="3" fill="${color}" opacity="${opacity}"/>`;
  }

  svg += '</svg>';
  miniTimeline.innerHTML = svg;
}

// ─── MANUAL ENTRY ─────────────────────────────────────────────────────────────
function openManualModal() {
  const now = new Date();
  const defaultEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 0);
  const defaultStart = new Date(defaultEnd.getTime() - 7 * 3600000);
  manualStartInput.value = toDatetimeLocal(defaultStart);
  manualEndInput.value = toDatetimeLocal(defaultEnd);
  manualNoteInput.value = '';
  resetTagGrid('manualTagsGrid', 'manual');
  setStepperVal(manualWakeUpValEl, v => { manualWakeUps = v; }, 0);
  manualModal.classList.remove('hidden');
}

function saveManualEntry() {
  if (!manualStartInput.value || !manualEndInput.value) {
    showToast(t('toast_manual_fill'), 'error'); return;
  }
  const start = new Date(manualStartInput.value);
  const end   = new Date(manualEndInput.value);
  if (end <= start) { showToast(t('toast_manual_end_before_start'), 'error'); return; }
  if (end > new Date()) { showToast(t('toast_manual_future'), 'error'); return; }

  const record = {
    id: 'sleep_' + Date.now(),
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    wakeUps: manualWakeUps,
    tags: [...manualTags],
    note: manualNoteInput.value.trim()
  };
  sleepLogs.push(record);
  sleepLogs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  persistLogs();
  manualModal.classList.add('hidden');
  renderTodayCard();
  showToast(t('toast_manual_saved'), 'success');
}

// ─── EDIT RECORD ─────────────────────────────────────────────────────────────
function openEditRecord(id) {
  const log = sleepLogs.find(l => l.id === id);
  if (!log) return;
  editingLogId = id;
  editStartInput.value = toDatetimeLocal(new Date(log.startTime));
  editEndInput.value   = toDatetimeLocal(new Date(log.endTime));
  editNoteInput.value  = log.note || '';
  setTagGrid('editTagsGrid', 'edit', log.tags || []);
  setStepperVal(editWakeUpValEl, v => { editWakeUps = v; }, log.wakeUps || 0);
  editModal.classList.remove('hidden');
}

function saveEditEntry() {
  if (!editingLogId) return;
  const idx = sleepLogs.findIndex(l => l.id === editingLogId);
  if (idx === -1) return;
  const start = new Date(editStartInput.value);
  const end   = new Date(editEndInput.value);
  if (!editStartInput.value || !editEndInput.value || isNaN(start) || isNaN(end)) {
    showToast(t('toast_edit_check'), 'error'); return;
  }
  if (end <= start) {
    showToast(t('toast_edit_end_before_start'), 'error'); return;
  }
  sleepLogs[idx] = {
    ...sleepLogs[idx],
    startTime: start.toISOString(),
    endTime:   end.toISOString(),
    wakeUps:   editWakeUps,
    tags:      [...editTags],
    note:      editNoteInput.value.trim()
  };
  persistLogs();
  editModal.classList.add('hidden');
  editingLogId = null;
  renderTodayCard();
  if (statsPage.classList.contains('active')) renderStats();
  showToast(t('toast_edited'), 'success');
}

// ─── CONFIRM MODAL ────────────────────────────────────────────────────────────
function showConfirm(title, message, callback, okLabel = t('confirm_ok')) {
  confirmTitleEl.textContent = title;
  confirmMsgEl.textContent = message;
  confirmOkBtn.textContent = okLabel;
  confirmCallback = callback;
  confirmModal.classList.remove('hidden');
}

// ─── STATS PAGE ───────────────────────────────────────────────────────────────
function renderStats() {
  if (!sleepLogs.length) {
    statNightSleep.textContent = '—';
    statNapTotal.textContent = '—';
    statDayTotal.textContent = '—';
    statLongest.textContent = '—';
    weekTimeline.innerHTML = `<div class="chart-placeholder">${t('no_data_chart')}</div>`;
    historyList.innerHTML = `<div class="history-placeholder">${t('history_no_records')}</div>`;
    return;
  }

  // Summary from last baby day that has logs
  const grouped = groupByBabyDay(sleepLogs);
  const sortedKeys = [...grouped.keys()].sort().reverse();
  const lastKey = sortedKeys[0];
  const lastGroup = grouped.get(lastKey);
  const summary = getDaySummary(lastGroup.logs);
  statNightSleep.textContent = summary.nightMs > 0 ? formatDuration(summary.nightMs) : '—';
  statNapTotal.textContent = summary.napMs > 0 ? `${formatDuration(summary.napMs)} (${summary.napCount}×)` : '—';
  statDayTotal.textContent = formatDuration(summary.totalMs);
  statLongest.textContent = formatDuration(summary.longestMs);

  // Night fragmentation card
  const fragCard = document.getElementById('nightFragCard');
  if (fragCard) {
    document.getElementById('fragCount').textContent =
      summary.nightFragments > 0 ? `${summary.nightFragments}×` : '—';
    document.getElementById('fragLongest').textContent =
      summary.longestNightMs > 0 ? formatDuration(summary.longestNightMs) : '—';
    document.getElementById('fragAvgGap').textContent =
      summary.avgNightGapMs > 0 ? formatDuration(summary.avgNightGapMs) : '—';
    document.getElementById('fragNightTotal').textContent =
      summary.nightMs > 0 ? formatDuration(summary.nightMs) : '—';
  }

  renderWeekTimeline(grouped, sortedKeys);
  renderHistoryList(grouped, sortedKeys);
}

// ─── WEEK TIMELINE ────────────────────────────────────────────────────────────
function renderWeekTimeline(grouped, sortedKeys) {
  const days = sortedKeys.slice(0, 7).reverse(); // oldest first
  if (!days.length) {
    weekTimeline.innerHTML = `<div class="chart-placeholder">${t('no_data_chart')}</div>`;
    return;
  }

  const LABEL_W = 42;
  const ROW_H = 26;
  const GAP = 5;
  const containerW = weekTimeline.clientWidth || 320;
  const chartW = containerW - LABEL_W - 4;
  const totalH = days.length * (ROW_H + GAP) + 20; // +20 for time axis

  // time axis ticks every 6h across the 24h window
  const axisTimes = getAxisTimes(6);

  let svg = `<svg viewBox="0 0 ${containerW} ${totalH}" width="100%" xmlns="http://www.w3.org/2000/svg" style="display:block">`;

  // Axis labels at bottom
  const axisY = days.length * (ROW_H + GAP) + 14;
  axisTimes.forEach(({ label, frac }) => {
    const x = LABEL_W + frac * chartW;
    // Vertical gridline
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${axisY - 6}" stroke="var(--bd-faint)" stroke-width="1"/>`;
    svg += `<text x="${x}" y="${axisY}" text-anchor="middle" fill="var(--tx-muted)" font-size="8.5" font-family="var(--font)">${label}</text>`;
  });

  days.forEach((key, rowIdx) => {
    const group = grouped.get(key);
    const dayDate = group.date;
    const y = rowIdx * (ROW_H + GAP);

    // Row label (e.g. "Po 9.6")
    const labelStr = `${t('days_short')[dayDate.getDay()]} ${dayDate.getDate()}.${dayDate.getMonth()+1}`;
    svg += `<text x="${LABEL_W - 4}" y="${y + ROW_H/2 + 4}" text-anchor="end" fill="var(--tx-secondary)" font-size="9" font-family="var(--font)">${labelStr}</text>`;

    // Row background
    svg += `<rect x="${LABEL_W}" y="${y}" width="${chartW}" height="${ROW_H}" rx="4" fill="var(--bd-faint)"/>`;

    for (const log of group.logs) {
      const x1 = LABEL_W + timelineXFraction(log.startTime, dayDate) * chartW;
      const x2 = LABEL_W + timelineXFraction(log.endTime, dayDate) * chartW;
      const w = Math.max(x2 - x1, 2);
      const color = isNightSession(log) ? 'var(--color-night)' : 'var(--color-nap)';
      svg += `<rect x="${x1}" y="${y + 3}" width="${w}" height="${ROW_H - 6}" rx="3" fill="${color}">
        <title>${formatTime(new Date(log.startTime))} – ${formatTime(new Date(log.endTime))} (${formatDuration(new Date(log.endTime)-new Date(log.startTime))})</title>
      </rect>`;
    }

    // Expand arrow hint
    svg += `<text x="${containerW - 5}" y="${y + ROW_H/2 + 3.5}" text-anchor="end" fill="var(--tx-muted)" font-size="10" font-family="var(--font)">›</text>`;
    // Transparent hit area (on top) — triggers day detail
    svg += `<rect x="0" y="${y}" width="${containerW}" height="${ROW_H}" fill="transparent" class="day-row-hit" data-day-key="${key}" style="cursor:pointer"/>`;
  });

  svg += '</svg>';
  weekTimeline.innerHTML = svg;
}

// ─── HISTORY LIST ─────────────────────────────────────────────────────────────
const TAG_EMOJIS = { easy: '😴', crying: '😢', nursing: '🤱', pacifier: '🍬', stroller: '🚗', sick: '🤒' };
function getTagLabel(tag) {
  return `${TAG_EMOJIS[tag] || ''} ${t('tag_' + tag) || tag}`.trim();
}

function renderHistoryList(grouped, sortedKeys) {
  historyList.innerHTML = '';

  for (const key of sortedKeys) {
    const group = grouped.get(key);
    const dayDate = group.date;
    const dayNames = t('days_long');

    // Day header
    const header = document.createElement('div');
    header.className = 'history-day-header';
    const summary = getDaySummary(group.logs);
    header.innerHTML = `
      <span class="history-day-label">${dayNames[dayDate.getDay()]}, ${dayDate.getDate()}. ${dayDate.getMonth()+1}. ${dayDate.getFullYear()}</span>
      <span class="history-day-total">${formatDuration(summary.totalMs)}</span>
    `;
    historyList.appendChild(header);

    // Sessions with wake window separators
    const sorted = [...group.logs].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    const sortedAsc = [...sorted].reverse(); // for wake window lookup

    sorted.forEach((log, idx) => {
      // Wake window separator: time between this session's end and the next (chronologically later) session's start
      const ascIdx = sortedAsc.findIndex(l => l.id === log.id);
      if (ascIdx > 0) {
        const prevEnd = new Date(sortedAsc[ascIdx-1].endTime);
        const thisStart = new Date(log.startTime);
        const wakeMs = thisStart - prevEnd;
        if (wakeMs > 0) {
          const sep = document.createElement('div');
          sep.className = 'wake-window-sep';
          sep.innerHTML = `<span class="wake-window-icon">⏱</span> <span class="wake-window-label">${formatDuration(wakeMs)} ${t('history_awake')}</span>`;
          historyList.appendChild(sep);
        }
      }

      const start = new Date(log.startTime);
      const end   = new Date(log.endTime);
      const dur   = end - start;
      const night = isNightSession(log);

      const tagsHtml = (log.tags || []).map(tag => `<span class="tag-chip">${getTagLabel(tag)}</span>`).join('');
      const wakeUpsHtml = (log.wakeUps > 0) ? `<span class="history-wakeups">🔔 ${log.wakeUps}× ${t('history_wakeup_label')}</span>` : '';
      const noteHtml = log.note ? `<div class="history-note">${log.note}</div>` : '';

      const item = document.createElement('div');
      item.className = `history-item ${night ? 'night' : 'nap'}`;
      item.innerHTML = `
        <div class="history-row-top">
          <div class="history-type-badge ${night ? 'night' : 'nap'}">
            ${night ? t('history_night') : t('history_day')}
          </div>
          <div class="history-duration-badge">${formatDuration(dur)}</div>
        </div>
        <div class="history-time-range">${formatTime(start)} – ${formatTime(end)}</div>
        ${wakeUpsHtml}
        ${tagsHtml ? `<div class="history-tags-row">${tagsHtml}</div>` : ''}
        ${noteHtml}
        <div class="history-row-bottom">
          <div class="history-actions-row">
            <button class="history-edit-btn" data-id="${log.id}" title="${t('btn_edit')}">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="history-delete-btn" data-id="${log.id}" title="${t('btn_delete')}">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;

      item.querySelector('.history-edit-btn').addEventListener('click', e => {
        e.stopPropagation();
        openEditRecord(e.currentTarget.dataset.id);
      });
      item.querySelector('.history-delete-btn').addEventListener('click', e => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        showConfirm(t('confirm_delete_title'), t('confirm_delete_msg'), () => deleteLogRecord(id), t('confirm_delete_ok'));
      });

      historyList.appendChild(item);
    });
  }
}

// ─── DAY DETAIL MODAL ────────────────────────────────────────────────────────
function openDayDetail(key) {
  const grouped = groupByBabyDay(sleepLogs);
  const group = grouped.get(key);
  if (!group) return;

  const dayDate = group.date;
  const dayNames = t('days_long');
  document.getElementById('dayDetailTitle').textContent =
    `${dayNames[dayDate.getDay()]} ${dayDate.getDate()}. ${dayDate.getMonth()+1}. ${dayDate.getFullYear()}`;

  const sorted = [...group.logs].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const summary = getDaySummary(group.logs);

  // Show modal first so clientWidth is available
  dayDetailModal.classList.remove('hidden');

  const tlEl = document.getElementById('dayDetailTimeline');
  const W = tlEl.clientWidth || 320;
  const BLOCK_H = 64;
  const VH = BLOCK_H + 24;

  const axisTimes = getAxisTimes(2);

  let svg = `<svg viewBox="0 0 ${W} ${VH}" width="100%" xmlns="http://www.w3.org/2000/svg" style="display:block">`;
  svg += `<rect x="0" y="0" width="${W}" height="${BLOCK_H}" rx="8" fill="var(--bd-faint)"/>`;

  axisTimes.forEach(({ frac }) => {
    const x = frac * W;
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${BLOCK_H}" stroke="rgba(128,128,128,0.18)" stroke-width="0.8"/>`;
  });

  sorted.forEach(log => {
    const x1 = timelineXFraction(log.startTime, dayDate) * W;
    const x2 = timelineXFraction(log.endTime, dayDate) * W;
    const w = Math.max(x2 - x1, 3);
    const color = isNightSession(log) ? 'var(--color-night)' : 'var(--color-nap)';
    const dur = new Date(log.endTime) - new Date(log.startTime);
    const midX = x1 + w / 2;
    svg += `<rect x="${x1}" y="3" width="${w}" height="${BLOCK_H - 6}" rx="6" fill="${color}"/>`;
    if (w > 60) {
      svg += `<text x="${midX}" y="${BLOCK_H/2 - 5}" text-anchor="middle" fill="white" font-size="9.5" font-family="var(--font)" font-weight="700">${formatTime(new Date(log.startTime))}</text>`;
      svg += `<text x="${midX}" y="${BLOCK_H/2 + 10}" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="9" font-family="var(--font)">${formatDuration(dur)}</text>`;
    } else if (w > 30) {
      svg += `<text x="${midX}" y="${BLOCK_H/2 + 4}" text-anchor="middle" fill="white" font-size="8.5" font-family="var(--font)" font-weight="700">${formatDuration(dur)}</text>`;
    }
  });

  // Show wake window gaps between consecutive blocks
  for (let i = 1; i < sorted.length; i++) {
    const gapMs = new Date(sorted[i].startTime) - new Date(sorted[i-1].endTime);
    if (gapMs < 2 * 60000) continue; // skip gaps under 2 min
    const gx1 = timelineXFraction(sorted[i-1].endTime, dayDate) * W;
    const gx2 = timelineXFraction(sorted[i].startTime, dayDate) * W;
    const gw = gx2 - gx1;
    if (gw > 22) {
      svg += `<text x="${gx1 + gw/2}" y="${BLOCK_H/2 + 4}" text-anchor="middle" fill="var(--tx-muted)" font-size="7.5" font-family="var(--font)">${formatDuration(gapMs)}</text>`;
    }
  }

  const axisY = BLOCK_H + 16;
  axisTimes.forEach(({ label, frac }) => {
    const x = frac * W;
    svg += `<text x="${x}" y="${axisY}" text-anchor="middle" fill="var(--tx-muted)" font-size="8" font-family="var(--font)">${label}</text>`;
  });
  svg += '</svg>';
  tlEl.innerHTML = svg;

  // Stats bar
  const statsItems = [
    { label: t('today_night'), val: summary.nightMs ? formatDuration(summary.nightMs) : '—' },
    { label: t('dd_segments'), val: summary.nightFragments > 0 ? `${summary.nightFragments}×` : '—' },
    { label: t('today_day_sleeps'), val: summary.napMs ? formatDuration(summary.napMs) : '—' },
    { label: t('today_longest'), val: formatDuration(summary.longestMs) },
    { label: t('dd_total'), val: formatDuration(summary.totalMs) },
  ];
  document.getElementById('dayDetailStats').innerHTML = statsItems
    .map(s => `<div class="dd-stat"><span class="dd-stat-label">${s.label}</span><span class="dd-stat-val">${s.val}</span></div>`)
    .join('');

  // Session list with wake windows
  const listEl = document.getElementById('dayDetailList');
  listEl.innerHTML = '';
  sorted.forEach((log, idx) => {
    if (idx > 0) {
      const wakeMs = new Date(log.startTime) - new Date(sorted[idx-1].endTime);
      if (wakeMs > 0) {
        const sep = document.createElement('div');
        sep.className = 'wake-window-sep';
        sep.innerHTML = `<span class="wake-window-icon">⏱</span> <span class="wake-window-label">${formatDuration(wakeMs)} ${t('history_awake')}</span>`;
        listEl.appendChild(sep);
      }
    }
    const dur = new Date(log.endTime) - new Date(log.startTime);
    const night = isNightSession(log);
    const tagsHtml = (log.tags || []).map(tag => `<span class="tag-chip">${getTagLabel(tag)}</span>`).join('');
    const item = document.createElement('div');
    item.className = `history-item ${night ? 'night' : 'nap'}`;
    item.innerHTML = `
      <div class="history-row-top">
        <div class="history-type-badge ${night ? 'night' : 'nap'}">${night ? t('history_night') : t('history_day')}</div>
        <div class="history-duration-badge">${formatDuration(dur)}</div>
      </div>
      <div class="history-time-range">${formatTime(new Date(log.startTime))} – ${formatTime(new Date(log.endTime))}</div>
      ${tagsHtml ? `<div class="history-tags-row">${tagsHtml}</div>` : ''}
    `;
    listEl.appendChild(item);
  });
}

function deleteLogRecord(id) {
  sleepLogs = sleepLogs.filter(l => l.id !== id);
  persistLogs();
  renderTodayCard();
  if (statsPage.classList.contains('active')) renderStats();
  showToast(t('toast_deleted'), 'info');
}

// ─── PERSIST ──────────────────────────────────────────────────────────────────
function persistLogs() {
  localStorage.setItem('sleepLogs', JSON.stringify(sleepLogs));
}

// ─── WATCH SYNC ───────────────────────────────────────────────────────────────
// The backend only collects sessions pushed by the Garmin app; this pulls them
// in. Records keep a "watch_" id prefix so re-fetching never duplicates them
// and so their origin stays visible.
const WATCH_ID_PREFIX = 'watch_';

function setSyncStatus(message, type) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.textContent = message || '';
  el.className = 'sync-status' + (type ? ' ' + type : '');
}

async function pullWatchSessions({ silent = false } = {}) {
  const token = (localStorage.getItem('sleepclick_syncToken') || '').trim();
  if (!token) {
    if (!silent) setSyncStatus(t('sync_need_token'), 'error');
    return 0;
  }

  if (!silent) setSyncStatus(t('sync_running'), '');

  let payload;
  try {
    const res = await fetch('/api/sessions', {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store'
    });
    if (res.status === 401) {
      if (!silent) setSyncStatus(t('sync_bad_token'), 'error');
      return 0;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    payload = await res.json();
  } catch (_) {
    if (!silent) setSyncStatus(t('sync_failed'), 'error');
    return 0;
  }

  const incoming = Array.isArray(payload?.sessions) ? payload.sessions : [];
  const known = new Set(sleepLogs.map(l => l.id));
  let fresh = [];

  for (const s of incoming) {
    const id = WATCH_ID_PREFIX + s.id;
    if (known.has(id)) continue;
    const record = {
      id,
      startTime: new Date(s.start * 1000).toISOString(),
      endTime: new Date(s.end * 1000).toISOString(),
      wakeUps: Number(s.wakeUps) || 0,
      tags: [],
      note: ''
    };
    // A nap can straddle the baby-day boundary, so split it the same way
    // records created in the app are split.
    fresh = fresh.concat(splitSessionAtBoundaries(record));
    known.add(id);
  }

  if (fresh.length === 0) {
    if (!silent) setSyncStatus(t('sync_none'), '');
    return 0;
  }

  sleepLogs = sleepLogs.concat(fresh);
  sleepLogs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  persistLogs();

  renderTodayCard();
  if (statsPage.classList.contains('active')) renderStats();

  if (!silent) setSyncStatus(t('sync_added')(fresh.length), 'success');
  return fresh.length;
}

function initWatchSync() {
  const input = document.getElementById('syncTokenInput');
  const button = document.getElementById('syncNowBtn');
  if (!input || !button) return;

  input.value = localStorage.getItem('sleepclick_syncToken') || '';
  input.addEventListener('change', () => {
    localStorage.setItem('sleepclick_syncToken', input.value.trim());
  });

  button.addEventListener('click', () => {
    localStorage.setItem('sleepclick_syncToken', input.value.trim());
    pullWatchSessions();
  });

  // Quietly pick up anything the watch uploaded since the last visit.
  if (input.value) pullWatchSessions({ silent: true });
}

// ─── THEME ────────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('sleepclick_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  sunIcon.classList.toggle('hidden', saved === 'light');
  moonIcon.classList.toggle('hidden', saved === 'dark');
}

function toggleTheme() {
  const target = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', target);
  localStorage.setItem('sleepclick_theme', target);
  sunIcon.classList.toggle('hidden', target === 'light');
  moonIcon.classList.toggle('hidden', target === 'dark');
  showToast(target === 'light' ? t('toast_light') : t('toast_dark'), 'success');
  if (statsPage.classList.contains('active')) renderStats();
}

// ─── EXPORT / IMPORT ──────────────────────────────────────────────────────────
function exportData() {
  if (!sleepLogs.length) { showToast(t('toast_no_export'), 'error'); return; }
  const blob = new Blob([JSON.stringify(sleepLogs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `sleepclick_${new Date().toISOString().split('T')[0]}.json`
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(t('toast_exported'), 'success');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!Array.isArray(imported)) throw new Error(t('toast_import_invalid'));
      if (!imported.every(i => i.id && i.startTime && i.endTime))
        throw new Error(t('toast_import_bad_format'));
      showConfirm(
        t('confirm_import_title'),
        t('confirm_import_msg')(imported.length),
        () => {
          sleepLogs = imported;
          persistLogs();
          renderTodayCard();
          if (statsPage.classList.contains('active')) renderStats();
          showToast(t('toast_imported'), 'success');
        },
        t('confirm_import_ok')
      );
    } catch (err) {
      showToast(t('toast_import_error') + err.message, 'error');
    }
  };
  reader.readAsText(file);
  importFileInput.value = '';
}

// ─── PWA ──────────────────────────────────────────────────────────────────────
function initPwa() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => {}).catch(err => console.warn('SW failed:', err));

    // Listen for STOP_SLEEP message from SW (notification action button)
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'STOP_SLEEP' && activeSleepStart) handleStopSleep();
    });
  }
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    pwaInstallBtn.classList.remove('hidden');
  });
  pwaInstallBtn.addEventListener('click', () => {
    if (!deferredPrompt) return;
    pwaInstallBtn.classList.add('hidden');
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
  });
}

// ─── MOCK DATA ───────────────────────────────────────────────────────────────
function loadMockData() {
  showConfirm(t('confirm_mock_title'), t('confirm_mock_msg'), () => {
    const TAGS_POOL = ['easy', 'nursing', 'pacifier', 'crying', 'stroller'];
    const ri = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
    const pt = () => TAGS_POOL.filter(() => Math.random() < 0.28);

    function session(startMs, durMin, tags = []) {
      const s = new Date(startMs);
      const e = new Date(startMs + durMin * 60000);
      return { id: 'sleep_' + startMs + '_' + Math.random().toString(36).slice(2, 5),
               startTime: s.toISOString(), endTime: e.toISOString(), wakeUps: 0, tags, note: '' };
    }

    const logs = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);

    for (let d = 13; d >= 0; d--) {
      const base = today.getTime() - d * 86400000;
      const prev = base - 86400000;

      // Fragmented night: starts previous evening ~21:30-22:30
      const nightStartMin = ri(21 * 60 + 30, 22 * 60 + 30);
      const nightStart = new Date(prev);
      nightStart.setHours(Math.floor(nightStartMin / 60), nightStartMin % 60, 0, 0);
      let cursor = nightStart.getTime();

      // 3-5 short fragments of 20-100 min, gaps 10-50 min
      const shortFragCount = ri(3, 5);
      for (let f = 0; f < shortFragCount; f++) {
        const dur = ri(20, 100);
        logs.push(session(cursor, dur, Math.random() < 0.5 ? ['nursing'] : []));
        cursor += dur * 60000 + ri(10, 50) * 60000; // sleep + wake gap
      }
      // One longer final night fragment: 60-100 min
      const longDur = ri(60, 100);
      logs.push(session(cursor, longDur, []));
      cursor += longDur * 60000 + ri(45, 90) * 60000; // final wake window before naps

      // Daytime naps
      const n1Start = new Date(base);
      n1Start.setHours(ri(8, 9), ri(30, 59), 0, 0);
      logs.push(session(n1Start.getTime(), ri(45, 90), pt()));

      const n2Start = new Date(base);
      n2Start.setHours(ri(12, 13), ri(30, 59), 0, 0);
      logs.push(session(n2Start.getTime(), ri(60, 120), pt()));

      if (Math.random() < 0.55) {
        const n3Start = new Date(base);
        n3Start.setHours(ri(15, 16), ri(30, 59), 0, 0);
        logs.push(session(n3Start.getTime(), ri(20, 40), pt()));
      }
    }

    logs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    sleepLogs = logs;
    persistLogs();
    renderTodayCard();
    showToast(t('toast_mock')(logs.length), 'success');
    switchTab('statsPage');
  }, t('confirm_mock_ok'));
}

// ─── NOTIFICATION TOGGLE ─────────────────────────────────────────────────────
function updateNotifToggleUI() {
  const btn = document.getElementById('notifToggleBtn');
  if (!btn) return;
  const denied = 'Notification' in window && Notification.permission === 'denied';
  const active = notifEnabled && !denied;
  btn.querySelector('.notif-on-icon').classList.toggle('hidden', !active);
  btn.querySelector('.notif-off-icon').classList.toggle('hidden', active);
  btn.classList.toggle('notif-disabled', !active);
  btn.title = denied ? t('notif_tooltip_blocked') : active ? t('notif_tooltip_on') : t('notif_tooltip_off');
}

async function toggleNotif() {
  const denied = 'Notification' in window && Notification.permission === 'denied';
  if (denied) {
    showToast(t('toast_notif_blocked'), 'error');
    return;
  }
  if (!notifEnabled) {
    if ('Notification' in window && Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') { showToast(t('toast_notif_denied'), 'error'); return; }
    }
    notifEnabled = true;
    localStorage.setItem('sleepclick_notif', 'on');
    showToast(t('toast_notif_on'), 'success');
    if (activeSleepStart) showSleepNotification();
  } else {
    notifEnabled = false;
    localStorage.setItem('sleepclick_notif', 'off');
    closeSleepNotification();
    showToast(t('toast_notif_off'), 'info');
  }
  updateNotifToggleUI();
}

// ─── SLEEP NOTIFICATIONS ──────────────────────────────────────────────────────
async function showSleepNotification() {
  if (!notifEnabled) return;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;
  const start = new Date(activeSleepStart);
  lastNotifUpdate = Date.now();
  reg.showNotification(t('notif_title'), {
    body: t('notif_body_start')(formatTime(start)),
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'sleepclick-active',
    silent: true,
    requireInteraction: true,
    actions: [{ action: 'stop', title: t('notif_action_stop') }]
  });
}

async function updateSleepNotification() {
  if (!notifEnabled || !activeSleepStart || !('serviceWorker' in navigator)) return;
  if (Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;
  const start = new Date(activeSleepStart);
  const elapsed = formatDuration(Date.now() - start.getTime());
  reg.showNotification(t('notif_title'), {
    body: t('notif_body_elapsed')(elapsed, formatTime(start)),
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'sleepclick-active',
    silent: true,
    requireInteraction: true,
    actions: [{ action: 'stop', title: t('notif_action_stop') }]
  });
}

async function closeSleepNotification() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const list = await reg.getNotifications({ tag: 'sleepclick-active' });
    list.forEach(n => n.close());
  } catch (_) {}
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const icons = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    error:   `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
    info:    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
  };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${icons[type]||icons.info}<span>${message}</span><button class="toast-close">&times;</button>`;
  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
  toastContainer.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }
  }, 3500);
}
