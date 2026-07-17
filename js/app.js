/* ========================================================
   app.js – Israel Electricity Plan Comparator
   All processing is done locally in the browser.
   No personal data is sent to any server.
   ======================================================== */

'use strict';

// ── State ─────────────────────────────────────────────────
let parsedReadings = [];   // { date: Date, kwh: number }[]
let availableYears = [];
let availableMonths = [];  // "YYYY-MM" strings
let plans = [];

const LS_CSV_KEY  = 'electricityData_csv';
const LS_NAME_KEY = 'electricityData_name';

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  plans = typeof PLANS !== 'undefined' ? PLANS : [];
  // Show plan update date from plans.js
  const dateEl = document.getElementById('plansUpdatedDate');
  if (dateEl && typeof PLANS_LAST_UPDATED !== 'undefined') {
    dateEl.textContent = PLANS_LAST_UPDATED;
  }
  // Instructions start collapsed
  document.getElementById('instructionsBody').classList.add('collapsed');
  handlePeriodChange();
  // Restore last uploaded file from localStorage
  restoreSavedFile();
});

// ── Card toggle ────────────────────────────────────────────
function toggleCard(header) {
  const body = header.nextElementSibling;
  const isOpen = !body.classList.contains('collapsed');
  body.classList.toggle('collapsed', isOpen);
  header.classList.toggle('open', !isOpen);
}

// ── File upload handlers ───────────────────────────────────
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.add('drag-over');
}
function handleDragLeave(e) {
  document.getElementById('uploadZone').classList.remove('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
}
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

function processFile(file) {
  clearError();
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showError('הקובץ אינו בפורמט CSV. אנא בחרו קובץ CSV שהורדתם מאתר חברת החשמל.');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const rawCsv = e.target.result;
      parsedReadings = parseIecCsv(rawCsv);
      if (parsedReadings.length === 0) {
        showError('לא נמצאו נתוני צריכה בקובץ. אנא ודאו שהורדתם את הקובץ הנכון מאתר חברת החשמל.');
        return;
      }
      saveFileToStorage(file.name, rawCsv);
      onFileLoaded(file, parsedReadings);
    } catch (err) {
      showError('שגיאה בעיבוד הקובץ: ' + err.message);
      console.error(err);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

// ── LocalStorage save/restore ──────────────────────────────
function saveFileToStorage(name, csv) {
  try {
    localStorage.setItem(LS_NAME_KEY, name);
    localStorage.setItem(LS_CSV_KEY, csv);
    updateSavedFileBanner(name);
  } catch (e) {
    // Storage full or unavailable — silently skip
    console.warn('LocalStorage unavailable:', e);
  }
}

function restoreSavedFile() {
  try {
    const name = localStorage.getItem(LS_NAME_KEY);
    const csv  = localStorage.getItem(LS_CSV_KEY);
    if (name && csv) updateSavedFileBanner(name);
  } catch (e) { /* ignore */ }
}

function loadSavedFile() {
  try {
    const name = localStorage.getItem(LS_NAME_KEY);
    const csv  = localStorage.getItem(LS_CSV_KEY);
    if (!name || !csv) return;
    clearError();
    parsedReadings = parseIecCsv(csv);
    if (parsedReadings.length === 0) {
      showError('הקובץ השמור אינו תקין. אנא העלו קובץ חדש.');
      return;
    }
    onFileLoaded({ name }, parsedReadings);
  } catch (e) {
    showError('שגיאה בטעינת הקובץ השמור: ' + e.message);
  }
}

function deleteSavedFile() {
  try {
    localStorage.removeItem(LS_NAME_KEY);
    localStorage.removeItem(LS_CSV_KEY);
  } catch (e) { /* ignore */ }
  document.getElementById('savedFileNotice').style.display = 'none';
}

function updateSavedFileBanner(name) {
  const notice = document.getElementById('savedFileNotice');
  document.getElementById('savedFileName').textContent = name;
  notice.style.display = 'flex';
}

function onFileLoaded(file, readings) {
  // Show file info
  document.getElementById('fileInfo').classList.add('visible');
  document.getElementById('fileName').textContent = file.name;
  const dates = readings.map(r => r.date);
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  const totalKwh = readings.reduce((s, r) => s + r.kwh, 0);
  document.getElementById('fileMeta').textContent =
    `${readings.length.toLocaleString('he-IL')} קריאות • `
    + `${fmt(minDate)} עד ${fmt(maxDate)} • `
    + `סה"כ ${totalKwh.toFixed(1)} קוו"ש`;

  // Populate year/month selectors
  buildPeriodSelectors(readings);

  // Enable button
  document.getElementById('analyzeBtn').disabled = false;
}

// ── CSV Parser ─────────────────────────────────────────────
function parseIecCsv(raw) {
  // Normalize line endings and BOM
  raw = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n');
  const readings = [];

  // IEC CSV format:
  // Rows 1-12ish are header metadata.
  // Data rows look like: "64-*******","צריכה","26/05/2025","11:15",.007,0
  // We detect data rows by looking for the date pattern DD/MM/YYYY in column 3

  const DATE_PATTERN = /^\d{2}\/\d{2}\/\d{4}$/;

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (cols.length < 5) continue;

    // Column 2 (index 2) = date  DD/MM/YYYY
    const dateStr = cols[2]?.trim().replace(/^"|"$/g, '');
    const timeStr = cols[3]?.trim().replace(/^"|"$/g, '');
    const consumptionStr = cols[4]?.trim().replace(/^"|"$/g, '');

    if (!DATE_PATTERN.test(dateStr)) continue;

    // Only process consumption rows (not injection)
    const rowType = cols[1]?.trim().replace(/^"|"$/g, '');
    if (rowType !== 'צריכה') continue;

    // Parse date
    const [day, month, year] = dateStr.split('/').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    if (isNaN(day) || isNaN(hour)) continue;

    const date = new Date(year, month - 1, day, hour, minute, 0, 0);
    const kwh = parseFloat(consumptionStr);
    if (isNaN(kwh) || kwh < 0) continue;

    readings.push({ date, kwh });
  }

  return readings;
}

function parseCsvLine(line) {
  // Simple CSV parser that handles quoted fields
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ── Period selectors ───────────────────────────────────────
function buildPeriodSelectors(readings) {
  const yearSet = new Set();
  const monthSet = new Set();

  for (const r of readings) {
    yearSet.add(r.date.getFullYear());
    monthSet.add(`${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}`);
  }

  availableYears = [...yearSet].sort((a, b) => b - a);
  availableMonths = [...monthSet].sort((a, b) => b.localeCompare(a));

  const yearSel = document.getElementById('yearSelect');
  yearSel.innerHTML = availableYears.map(y => `<option value="${y}">${y}</option>`).join('');

  const monthSel = document.getElementById('monthSelect');
  const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  monthSel.innerHTML = availableMonths.map(m => {
    const [y, mo] = m.split('-');
    return `<option value="${m}">${MONTHS_HE[Number(mo) - 1]} ${y}</option>`;
  }).join('');
}

function handlePeriodChange() {
  const type = document.getElementById('periodType').value;
  document.getElementById('yearPicker').classList.toggle('visible', type === 'annual');
  document.getElementById('monthPicker').classList.toggle('visible', type === 'monthly');
}

// ── Analysis ───────────────────────────────────────────────
function runAnalysis() {
  if (parsedReadings.length === 0) {
    showError('אנא העלו תחילה קובץ נתונים.');
    return;
  }

  showLoading(true);

  // Defer to let the UI update
  setTimeout(() => {
    try {
      const tariff = parseFloat(document.getElementById('tariffRate').value) || 0.6352;
      const period = document.getElementById('periodType').value;
      const year = parseInt(document.getElementById('yearSelect').value);
      const month = document.getElementById('monthSelect').value;

      const filtered = filterReadings(parsedReadings, period, year, month);
      if (filtered.length === 0) {
        showError('לא נמצאו נתונים בתקופה הנבחרת.');
        showLoading(false);
        return;
      }

      const results = computeResults(filtered, tariff);
      renderResults(results, filtered, tariff, period, year, month);
    } catch (err) {
      showError('שגיאה בחישוב: ' + err.message);
      console.error(err);
    } finally {
      showLoading(false);
    }
  }, 50);
}

function filterReadings(readings, period, year, month) {
  if (period === 'all') return readings;
  if (period === 'annual') {
    return readings.filter(r => r.date.getFullYear() === year);
  }
  if (period === 'monthly') {
    const [y, m] = month.split('-').map(Number);
    return readings.filter(r => r.date.getFullYear() === y && r.date.getMonth() + 1 === m);
  }
  return readings;
}

function computeResults(readings, tariff) {
  return plans.map(plan => {
    const { cost, discountedKwh, totalKwh } = calcPlanCost(readings, plan, tariff);
    const baseCost = totalKwh * tariff;
    const saving = baseCost - cost;
    const savingPct = baseCost > 0 ? (saving / baseCost) * 100 : 0;
    return {
      plan,
      totalKwh,
      discountedKwh,
      baseCost,
      cost,
      saving,
      savingPct
    };
  });
}

function calcPlanCost(readings, plan, tariff) {
  const totalKwh = readings.reduce((s, r) => s + r.kwh, 0);

  if (plan.discountType === 'none') {
    return { cost: totalKwh * tariff, discountedKwh: 0, totalKwh };
  }

  if (plan.discountType === 'fixed') {
    const discount = plan.discountPercent / 100;
    return { cost: totalKwh * tariff * (1 - discount), discountedKwh: totalKwh, totalKwh };
  }

  if (plan.discountType === 'time_of_use') {
    // Discount applies only during specific hours on specific days.
    // Supports windows that cross midnight (e.g. 20:00-02:00) when discountHoursEnd <= discountHoursStart.
    let discountedKwh = 0;
    let normalKwh = 0;
    const { discountDays, discountHoursStart: hs, discountHoursEnd: he } = plan;
    const wraps = he <= hs;

    for (const r of readings) {
      const dow = r.date.getDay();   // 0=Sun, 1=Mon, ..., 6=Sat
      const hour = r.date.getHours();
      let inWindow;
      if (!wraps) {
        inWindow = discountDays.includes(dow) && hour >= hs && hour < he;
      } else {
        // Window starts on a discountDays day at hs and continues past midnight until he the next day
        const prevDow = (dow + 6) % 7;
        inWindow = (discountDays.includes(dow) && hour >= hs) || (discountDays.includes(prevDow) && hour < he);
      }
      if (inWindow) {
        discountedKwh += r.kwh;
      } else {
        normalKwh += r.kwh;
      }
    }

    const discount = plan.discountPercent / 100;
    const cost = (discountedKwh * tariff * (1 - discount)) + (normalKwh * tariff);
    return { cost, discountedKwh, totalKwh };
  }

  if (plan.discountType === 'time_of_use_night') {
    // Night discount: Sun-Thu 23:00-7:00
    // - hour >= 23 on Sun-Thu (days 0-4)
    // - hour < 7 on Mon-Fri (days 1-5), i.e. continuation of the previous night
    let discountedKwh = 0;
    let normalKwh = 0;

    for (const r of readings) {
      const dow = r.date.getDay();
      const hour = r.date.getHours();
      const isNightStart = (hour >= 23) && [0, 1, 2, 3, 4].includes(dow);
      const isNightEnd = (hour < 7) && [1, 2, 3, 4, 5].includes(dow);

      if (isNightStart || isNightEnd) {
        discountedKwh += r.kwh;
      } else {
        normalKwh += r.kwh;
      }
    }

    const discount = plan.discountPercent / 100;
    const cost = (discountedKwh * tariff * (1 - discount)) + (normalKwh * tariff);
    return { cost, discountedKwh, totalKwh };
  }

  if (plan.discountType === 'tiered_monthly_amount') {
    // Group readings by calendar month
    const monthMap = {};
    for (const r of readings) {
      const key = `${r.date.getFullYear()}-${r.date.getMonth()}`;
      if (!monthMap[key]) monthMap[key] = { kwh: 0, count: 0, year: r.date.getFullYear(), month: r.date.getMonth() };
      monthMap[key].kwh   += r.kwh;
      monthMap[key].count += 1;
    }
    let totalCost = 0;
    for (const { kwh: monthKwh, count, year, month } of Object.values(monthMap)) {
      // Extrapolate to a full month for tier selection (15-min slots expected in the month)
      const daysInMonth  = new Date(year, month + 1, 0).getDate();
      const expectedSlots = daysInMonth * 96;
      const coverage      = Math.min(count / expectedSlots, 1);
      const fullMonthAmount = (monthKwh * tariff) / coverage;

      // Tier is chosen on the extrapolated full-month amount
      const tier     = plan.tiers.find(t => t.maxMonthlyAmount === null || fullMonthAmount <= t.maxMonthlyAmount);
      const discount = (tier ? tier.discountPercent : plan.discountPercent) / 100;
      // Discount applied to actual (partial) consumption only
      totalCost += (monthKwh * tariff) * (1 - discount);
    }
    return { cost: totalCost, discountedKwh: totalKwh, totalKwh };
  }

  if (plan.discountType === 'accumulate') {
    // Pazgas yellow: 10% accumulation capped at 600₪/year
    // We compute full-year ratio from the dataset period
    const baseCostTotal = totalKwh * tariff;
    const accumulatedRaw = baseCostTotal * (plan.discountPercent / 100);

    // Pro-rate cap if period is less than a full year
    const readings_sorted = [...readings].sort((a, b) => a.date - b.date);
    const msInPeriod = readings_sorted[readings_sorted.length - 1].date - readings_sorted[0].date;
    const yearsInPeriod = msInPeriod / (365.25 * 24 * 3600 * 1000) || (1 / 12);
    const cap = (plan.maxYearlySavings || 600) * yearsInPeriod;
    const actualAccumulation = Math.min(accumulatedRaw, cap);

    return { cost: baseCostTotal - actualAccumulation, discountedKwh: totalKwh, totalKwh };
  }

  // Fallback
  return { cost: totalKwh * tariff, discountedKwh: 0, totalKwh };
}

// ── Render ─────────────────────────────────────────────────
function renderResults(results, readings, tariff, period, year, month) {
  const totalKwh = readings.reduce((s, r) => s + r.kwh, 0);
  const baseCost = totalKwh * tariff;

  // Sort: baseline first, rest by saving descending
  const sorted = [
    ...results.filter(r => r.plan.isBaseline),
    ...results.filter(r => !r.plan.isBaseline).sort((a, b) => b.saving - a.saving)
  ];

  const bestNonBaseline = sorted.find(r => !r.plan.isBaseline);
  const maxSaving = bestNonBaseline ? bestNonBaseline.saving : 0;

  // Summary cards
  document.getElementById('totalKwh').textContent = totalKwh.toFixed(1);
  document.getElementById('totalCostIec').textContent = fmtMoney(baseCost);
  document.getElementById('maxSavings').textContent = fmtMoney(maxSaving);

  // Best plan banner
  if (bestNonBaseline) {
    document.getElementById('bestPlanBanner').classList.add('visible');
    document.getElementById('bestPlanTitle').textContent =
      `${bestNonBaseline.plan.company} – ${bestNonBaseline.plan.planName}`;
    document.getElementById('bestPlanDesc').textContent =
      `החיסכון המשוער הגבוה ביותר עבור דפוס הצריכה שלכם ב${periodLabel(period, year, month)}`;
    document.getElementById('bestPlanSavings').textContent =
      `חיסכון: ${fmtMoney(bestNonBaseline.saving)}`;
  }

  // Subtitle
  const dates = readings.map(r => r.date);
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  document.getElementById('resultsSubtitle').textContent =
    `${periodLabel(period, year, month)} • ${readings.length.toLocaleString('he-IL')} קריאות • ${totalKwh.toFixed(1)} קוו"ש • ${durationLabel(minDate, maxDate)}`;

  // Table
  const tbody = document.getElementById('resultsTableBody');
  tbody.innerHTML = '';

  let rank = 0;
  for (const r of sorted) {
    if (!r.plan.isBaseline) rank++;

    const tr = document.createElement('tr');
    if (r.plan.isBaseline) tr.classList.add('baseline-row');
    if (rank === 1 && !r.plan.isBaseline) tr.classList.add('best-row');

    const rankCell = r.plan.isBaseline
      ? `<span class="rank-badge rank-other">—</span>`
      : `<span class="rank-badge rank-${rank <= 3 ? rank : 'other'}">${rank}</span>`;

    const conditionHtml = r.plan.condition
      ? `<div class="condition-badge">⚠️ ${r.plan.condition}</div>`
      : '';

    const savingHtml = r.plan.isBaseline
      ? `<span class="savings-zero">—</span>`
      : `<span class="savings-positive">+${fmtMoney(r.saving)}</span>`;

    const savingPctHtml = r.plan.isBaseline
      ? `<span class="savings-zero">—</span>`
      : `<span class="savings-positive">+${r.savingPct.toFixed(1)}%</span>`;

    const discountText = r.plan.isBaseline ? '—' : (r.plan.discountLabel || r.plan.discountPercent + '%');
    const notesText = esc(r.plan.notes || '');

    tr.innerHTML = `
      <td>${rankCell}</td>
      <td class="company-cell">
        <a href="${r.plan.link}" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:none;font-weight:700">
          ${esc(r.plan.company)}
        </a>
      </td>
      <td class="plan-cell">
        ${esc(r.plan.planName)}
        ${conditionHtml}
      </td>
      <td class="col-mobile-hide">${discountText}</td>
      <td class="col-mobile-hide">${fmtMoney(r.cost)} ₪</td>
      <td>${savingHtml}</td>
      <td>${savingPctHtml}</td>
      <td class="col-mobile-hide" style="font-size:0.8rem;color:var(--text-muted)">${notesText}</td>
    `;

    // Build expandable detail row for mobile
    const detailItems = [
      { label: 'הנחה', value: discountText },
      { label: 'עלות משוערת', value: `${fmtMoney(r.cost)} ₪` },
    ];
    if (notesText) detailItems.push({ label: 'הערות', value: notesText });

    const detailTr = document.createElement('tr');
    detailTr.className = 'detail-row';
    if (r.plan.isBaseline) detailTr.classList.add('baseline-row');
    detailTr.innerHTML = `
      <td colspan="8">
        <div class="detail-content">
          ${detailItems.map(item => `
            <div class="detail-item">
              <span class="detail-label">${item.label}</span>
              <span class="detail-value">${item.value}</span>
            </div>`).join('')}
        </div>
      </td>
    `;

    tr.addEventListener('click', () => tr.classList.toggle('row-expanded'));
    detailTr.addEventListener('click', () => tr.classList.remove('row-expanded'));

    tbody.appendChild(tr);
    tbody.appendChild(detailTr);
  }

  document.getElementById('results').classList.add('visible');
  document.getElementById('resultsTable').style.display = 'block';
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Helpers ────────────────────────────────────────────────
function periodLabel(period, year, month) {
  const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  if (period === 'all') return 'כל הנתונים';
  if (period === 'annual') return `שנת ${year}`;
  if (period === 'monthly') {
    const [y, m] = month.split('-');
    return `${MONTHS_HE[Number(m) - 1]} ${y}`;
  }
  return '';
}

function durationLabel(minDate, maxDate) {
  // Treat maxDate as inclusive: advance by 1 day so "Mar 1–Mar 31" = 1 full month
  const end = new Date(maxDate);
  end.setDate(end.getDate() + 1);

  let years  = end.getFullYear() - minDate.getFullYear();
  let months = end.getMonth()    - minDate.getMonth();
  let days   = end.getDate()     - minDate.getDate();

  if (days < 0) {
    months--;
    days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  const parts = [];
  if (years  === 1) parts.push('שנה אחת');
  else if (years  > 1) parts.push(`${years} שנים`);
  if (months === 1) parts.push('חודש אחד');
  else if (months > 1) parts.push(`${months} חודשים`);
  if (days   === 1) parts.push('יום אחד');
  else if (days   > 1) parts.push(`${days} ימים`);

  return parts.length ? parts.join(' ו-') : 'פחות מיום';
}

function fmt(date) {
  return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtMoney(val) {
  return val.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showError(msg) {
  const box = document.getElementById('uploadError');
  document.getElementById('uploadErrorText').textContent = msg;
  box.classList.add('visible');
}

function clearError() {
  document.getElementById('uploadError').classList.remove('visible');
}

function showLoading(on) {
  document.getElementById('loadingOverlay').classList.toggle('visible', on);
}
