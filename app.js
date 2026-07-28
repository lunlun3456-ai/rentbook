/* ---------- storage: everything lives in the Google Sheet ----------
   The ONLY thing kept on this device is the Apps Script URL itself —
   the app needs to know which sheet to talk to before it can load
   anything from it. Tenants, receipts, and settings are never written
   to localStorage; they live in memory only, mirrored to the sheet. */
let scriptUrl = localStorage.getItem('rb_script_url') || '';

let tenants = [];
let receipts = [];
let settings = { reminderDays: 3, defaultCountryCode: '', landlordName: '', receiptCounter: 0, pwHash: '' };

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function normalizeSettings(raw) {
  raw = raw || {};
  return {
    reminderDays: parseInt(raw.reminderDays, 10) || 3,
    defaultCountryCode: raw.defaultCountryCode || '',
    landlordName: raw.landlordName || '',
    receiptCounter: parseInt(raw.receiptCounter, 10) || 0,
    pwHash: raw.pwHash || ''
  };
}

async function fetchAllFromSheet() {
  const res = await fetch(scriptUrl, { method: 'GET' });
  if (!res.ok) throw new Error('bad response');
  const data = await res.json();
  tenants = data.tenants || [];
  receipts = data.receipts || [];
  settings = normalizeSettings(data.settings || {});
}

async function pushAllToSheet() {
  const res = await fetch(scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ tenants, receipts, settings })
  });
  if (!res.ok) throw new Error('bad response');
}

function setSyncLabel(text, ok) {
  const pill = document.getElementById('syncPill');
  const label = document.getElementById('syncLabel');
  if (label) label.textContent = text;
  if (pill) pill.classList.toggle('on', !!ok);
}

// Saves the current in-memory state back to the sheet. Since nothing is
// stored locally, a failed save means the change only exists until the
// tab is closed — so this surfaces failures clearly rather than failing silently.
async function persist() {
  setSyncLabel('Saving…', false);
  try {
    await pushAllToSheet();
    setSyncLabel('Synced with sheet', true);
    return true;
  } catch (err) {
    setSyncLabel('Save failed — check connection', false);
    alert('Could not save to your Google Sheet. Check your internet connection and try again — nothing is stored on this device, so please stay on this page until it shows "Synced with sheet".');
    return false;
  }
}

/* ---------- tab navigation ---------- */
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  if (btn.dataset.tab === 'history') renderHistory();
  if (btn.dataset.tab === 'statement') populateStatementTenants();
});

/* ---------- due-date logic ---------- */
function dueInfo(tenant) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = Math.min(Math.max(parseInt(tenant.dueDay || 1, 10), 1), 28);
  let due = new Date(today.getFullYear(), today.getMonth(), dueDay);
  const diffDays = Math.round((due - today) / 86400000);
  let effectiveDiff = diffDays;
  if (diffDays < -20) {
    const nextDue = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
    effectiveDiff = Math.round((nextDue - today) / 86400000);
    due = nextDue;
  }
  const reminderWindow = parseInt(settings.reminderDays, 10) || 3;
  let status = 'ok';
  if (effectiveDiff < 0) status = 'late';
  else if (effectiveDiff <= reminderWindow) status = 'soon';
  return { daysUntil: effectiveDiff, status, dueDate: due };
}

function statusLabel(info) {
  if (info.status === 'late') return `${Math.abs(info.daysUntil)}d overdue`;
  if (info.daysUntil === 0) return 'due today';
  return `due in ${info.daysUntil}d`;
}

function lastPaymentStatus(tenant) {
  const tReceipts = receipts.filter(r => r.tenantId === tenant.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!tReceipts.length) return null;
  const r = tReceipts[0];
  const paidDate = new Date(r.date);
  const dueDay = Math.min(Math.max(parseInt(tenant.dueDay || 1, 10), 1), 28);
  const dueForThatMonth = new Date(paidDate.getFullYear(), paidDate.getMonth(), dueDay);
  const diff = Math.round((paidDate - dueForThatMonth) / 86400000);
  return { diff, date: paidDate };
}

function countdownHtml(tenant) {
  const info = dueInfo(tenant);
  const last = lastPaymentStatus(tenant);
  let html = `<div>Next payment: <span class="big">${statusLabel(info)}</span> — ${fmtDate(info.dueDate)}</div>`;
  if (last) {
    const cls = last.diff < 0 ? 'paid-early' : (last.diff > 0 ? 'paid-late' : '');
    const txt = last.diff < 0 ? `paid ${Math.abs(last.diff)} day(s) early`
      : (last.diff > 0 ? `paid ${last.diff} day(s) late` : 'paid on time');
    html += `<div class="${cls}">This month: ${txt} (${fmtDate(last.date)})</div>`;
  }
  return html;
}

/* ---------- WhatsApp helpers ---------- */
function openWhatsApp(phone, text) {
  const cleanPhone = (phone || '').replace(/[^\d]/g, '');
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

function fmtMoney(tenant, amount) {
  const n = Number(amount || 0);
  const formatted = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${tenant.currency || ''} ${formatted}`.trim();
}
function fmtDate(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  return dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtPeriod(yyyyMm) {
  if (!yyyyMm) return '';
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m) return yyyyMm;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
function wrapText(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxWidth && last.length > 1) {
      last = last.slice(0, -1);
    }
    if (words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = last + '…';
  }
  return lines;
}

function receiptDueCalc(tenant, dateStr, period) {
  const dueDay = Math.min(Math.max(parseInt(tenant.dueDay || 1, 10), 1), 28);
  const paidDate = new Date(dateStr);
  const dueForThisPayment = new Date(paidDate.getFullYear(), paidDate.getMonth(), dueDay);
  const lateDays = Math.round((paidDate - dueForThisPayment) / 86400000);

  let baseYear = paidDate.getFullYear(), baseMonth = paidDate.getMonth();
  if (period) {
    const [py, pm] = period.split('-').map(Number);
    if (py && pm) { baseYear = py; baseMonth = pm - 1; }
  }
  const nextDue = new Date(baseYear, baseMonth + 1, dueDay);
  return { lateDays, nextDue };
}

function drawReceiptCanvas(tenant, amount, dateStr, period, note, receiptNo) {
  const W = 720, H = 1060;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fffdf8';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#1f4d43';
  ctx.fillRect(0, 0, W, 130);
  ctx.fillStyle = '#f6f1e6';
  ctx.font = '700 26px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'left';
  ctx.fillText(tenant.ownerName || settings.landlordName || 'Rent Receipt', 40, 58);
  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = '#cfe3dc';
  ctx.fillText('OFFICIAL RENT RECEIPT', 40, 84);

  ctx.textAlign = 'right';
  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = '#f6f1e6';
  ctx.fillText(`Receipt No. ${receiptNo}`, W - 40, 58);
  ctx.fillText(fmtDate(new Date()), W - 40, 78);
  ctx.textAlign = 'left';

  let y = 190;
  function label(text) {
    ctx.fillStyle = '#6b6455';
    ctx.font = '12px Arial, sans-serif';
    ctx.fillText(text.toUpperCase(), 40, y);
  }
  function row(labelText, value, big) {
    label(labelText);
    ctx.fillStyle = '#26221b';
    ctx.font = big ? '700 30px Georgia, "Times New Roman", serif' : '600 18px Arial, sans-serif';
    ctx.fillText(String(value), 40, y + (big ? 34 : 24));
    y += big ? 70 : 54;
  }

  const tenantLine = tenant.nickname ? `${tenant.name}  (${tenant.nickname})` : tenant.name;
  row('Tenant', tenantLine);

  if (tenant.unit) {
    label('Unit / address');
    ctx.fillStyle = '#26221b';
    ctx.font = '600 16px Arial, sans-serif';
    const lines = wrapText(ctx, tenant.unit, W - 80, 4);
    lines.forEach((ln, i) => ctx.fillText(ln, 40, y + 22 + i * 22));
    y += 22 + lines.length * 22 + 14;
  }

  row('Amount received', fmtMoney(tenant, amount), true);
  row('Date paid', fmtDate(dateStr));
  if (period) row('For period', fmtPeriod(period));
  if (note) row('Note', note);

  const { lateDays, nextDue } = receiptDueCalc(tenant, dateStr, period);
  if (lateDays > 0) {
    label('Days overdue');
    ctx.fillStyle = '#a83232';
    ctx.font = '700 18px Arial, sans-serif';
    ctx.fillText(`${lateDays} day${lateDays === 1 ? '' : 's'} overdue`, 40, y + 24);
    y += 54;
  }
  row('Next payment due', fmtDate(nextDue));

  ctx.strokeStyle = '#d8cdb4';
  ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(40, y + 6); ctx.lineTo(W - 40, y + 6); ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#6b6455';
  ctx.font = 'italic 15px Georgia, "Times New Roman", serif';
  ctx.fillText('Thank you for your payment.', 40, y + 40);

  ctx.font = '12px Arial, sans-serif';
  ctx.fillStyle = '#6b6455';
  const noticeLines = wrapText(ctx, 'Tenants must pay utility bills on time to avoid service disruptions, late fees, and legal penalties.', W - 80, 3);
  noticeLines.forEach((ln, i) => ctx.fillText(ln, 40, y + 70 + i * 18));

  const noteY = H - 60;
  ctx.font = '12px Arial, sans-serif';
  ctx.fillStyle = '#8a8271';
  ctx.fillText('This receipt is computer generated. No signature required.', 40, noteY);

  return canvas;
}

function buildReminderText(tenant, info) {
  const when = info.status === 'late'
    ? `is now ${Math.abs(info.daysUntil)} day(s) overdue`
    : (info.daysUntil === 0 ? `is due today` : `is due in ${info.daysUntil} day(s)`);
  return [
    `Hi ${tenant.name}, this is a friendly reminder that your rent of ${fmtMoney(tenant, tenant.rent)} ${when} (${fmtDate(info.dueDate)}).`,
    `Please let me know once it's paid so I can send your receipt. Thank you!`
  ].join('\n\n');
}

function renderHome() {
  const list = document.getElementById('reminderList');
  const emptyNote = document.getElementById('reminderEmpty');
  list.innerHTML = '';

  const due = tenants
    .map(t => ({ t, info: dueInfo(t) }))
    .filter(x => x.info.status !== 'ok')
    .sort((a, b) => a.info.daysUntil - b.info.daysUntil);

  document.getElementById('reminderCount').textContent = due.length ? `${due.length} to follow up` : '';
  emptyNote.hidden = due.length > 0;

  due.forEach(({ t, info }) => {
    const el = document.createElement('div');
    el.className = 'card-item';
    el.innerHTML = `
      <div class="row-top">
        <span class="name">${escapeHtml(t.name)}</span>
        <span class="status-chip status-${info.status === 'late' ? 'late' : 'soon'}">${statusLabel(info)}</span>
      </div>
      <div class="sub">${fmtMoney(t, t.rent)} · due ${fmtDate(info.dueDate)}</div>
      <div class="card-actions">
        <button class="btn btn-small" data-action="remind" data-id="${t.id}">Send reminder via WhatsApp</button>
      </div>`;
    list.appendChild(el);
  });

  const sel = document.getElementById('receiptTenant');
  const prevVal = sel.value;
  sel.innerHTML = tenants.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  if (prevVal) sel.value = prevVal;
  updateReceiptPreview();
}

document.getElementById('reminderList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="remind"]');
  if (!btn) return;
  const t = tenants.find(x => x.id === btn.dataset.id);
  if (!t) return;
  openWhatsApp(t.phone, buildReminderText(t, dueInfo(t)));
});

const receiptFields = ['receiptAmount', 'receiptDate', 'receiptPeriod', 'receiptNote'];
receiptFields.forEach(id => document.getElementById(id).addEventListener('input', updateReceiptPreview));

document.getElementById('receiptTenant').addEventListener('change', () => {
  const t = currentReceiptTenant();
  if (t) {
    document.getElementById('receiptAmount').value = t.rent || '';
    document.getElementById('receiptPeriod').value = defaultPeriodFor(t);
  }
  updateReceiptPreview();
});

function currentReceiptTenant() {
  const id = document.getElementById('receiptTenant').value;
  return tenants.find(t => t.id === id);
}

let lastReceiptDataUrl = null;

function defaultPeriodFor(tenant) {
  const info = dueInfo(tenant);
  const d = info.dueDate;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function updateReceiptPreview() {
  const t = currentReceiptTenant();
  const img = document.getElementById('receiptImg');
  const countdownBox = document.getElementById('receiptCountdown');
  if (!t) { img.removeAttribute('src'); lastReceiptDataUrl = null; countdownBox.innerHTML = ''; return; }

  countdownBox.innerHTML = countdownHtml(t);

  const periodField = document.getElementById('receiptPeriod');
  if (!periodField.value) periodField.value = defaultPeriodFor(t);

  const amount = document.getElementById('receiptAmount').value || t.rent;
  const date = document.getElementById('receiptDate').value || todayISO();
  const period = periodField.value;
  const note = document.getElementById('receiptNote').value;
  const nextNo = String((settings.receiptCounter || 0) + 1).padStart(4, '0');
  const canvas = drawReceiptCanvas(t, amount, date, period, note, nextNo);
  lastReceiptDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  img.src = lastReceiptDataUrl;
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
document.getElementById('receiptDate').value = todayISO();

async function recordReceiptAndAdvanceCounter(t, amount, date, period, note) {
  receipts.unshift({
    id: uid(), tenantId: t.id, tenantName: t.name, amount: Number(amount) || 0,
    date, period, note, sentAt: new Date().toISOString()
  });
  settings.receiptCounter = (settings.receiptCounter || 0) + 1;
  await persist();
  renderHistory();
}

document.getElementById('sendReceiptBtn').addEventListener('click', async () => {
  const t = currentReceiptTenant();
  if (!t) { alert('Add a tenant first.'); return; }
  if (!lastReceiptDataUrl) { alert('Generate the receipt image first.'); return; }
  const amount = document.getElementById('receiptAmount').value || t.rent;
  const date = document.getElementById('receiptDate').value || todayISO();
  const period = document.getElementById('receiptPeriod').value;
  const note = document.getElementById('receiptNote').value;

  await recordReceiptAndAdvanceCounter(t, amount, date, period, note);

  const text = `Hi ${t.name}, here's your rent receipt for ${fmtMoney(t, amount)} (${fmtDate(date)}). Attaching the receipt image now.`;
  openWhatsApp(t.phone, text);
  updateReceiptPreview();
});

document.getElementById('downloadReceiptBtn').addEventListener('click', () => {
  if (!lastReceiptDataUrl) { alert('Pick a tenant first.'); return; }
  const t = currentReceiptTenant();
  const a = document.createElement('a');
  a.href = lastReceiptDataUrl;
  a.download = `receipt-${(t && t.name || 'tenant').replace(/\s+/g, '_')}-${todayISO()}.jpg`;
  a.click();
});

document.getElementById('copyReceiptBtn').addEventListener('click', async () => {
  if (!lastReceiptDataUrl) { alert('Pick a tenant first.'); return; }
  try {
    const res = await fetch(lastReceiptDataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    alert('Receipt image copied — paste it (Ctrl/Cmd+V) straight into WhatsApp Web.');
  } catch (err) {
    alert("Couldn't copy the image on this browser. Use Download instead and attach it manually.");
  }
});

function renderTenants() {
  const list = document.getElementById('tenantList');
  const emptyNote = document.getElementById('tenantEmpty');
  list.innerHTML = '';
  emptyNote.hidden = tenants.length > 0;

  tenants.forEach(t => {
    const info = dueInfo(t);
    const el = document.createElement('div');
    el.className = 'card-item';
    const nameLine = t.nickname ? `${escapeHtml(t.name)} <span class="muted">(${escapeHtml(t.nickname)})</span>` : escapeHtml(t.name);
    let leaseLine = '';
    if (t.leaseStart || t.leaseEnd) {
      const parts = [];
      if (t.leaseStart) parts.push(`from ${fmtDate(t.leaseStart)}`);
      if (t.leaseEnd) parts.push(`to ${fmtDate(t.leaseEnd)}`);
      if (t.renewalYears) parts.push(`renews every ${t.renewalYears}y`);
      leaseLine = `<div class="sub">Lease: ${parts.join(' · ')}</div>`;
    }
    el.innerHTML = `
      <div class="row-top">
        <span class="name">${nameLine}</span>
        <span class="status-chip status-${info.status === 'ok' ? 'ok' : (info.status === 'late' ? 'late' : 'soon')}">${statusLabel(info)}</span>
      </div>
      <div class="sub">${fmtMoney(t, t.rent)} / month · due day ${t.dueDay}${t.unit ? ' · ' + escapeHtml(t.unit) : ''}</div>
      <div class="sub">Owner on receipt: ${escapeHtml(t.ownerName || settings.landlordName || '—')}</div>
      <div class="sub">WhatsApp: +${escapeHtml(t.phone)}</div>
      ${leaseLine}
      <div class="countdown-box">${countdownHtml(t)}</div>
      <div class="card-actions">
        <button class="btn btn-small" data-action="edit" data-id="${t.id}">Edit</button>
        <button class="btn btn-small btn-danger" data-action="delete" data-id="${t.id}">Delete</button>
      </div>`;
    list.appendChild(el);
  });
}

document.getElementById('tenantList').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('button[data-action="edit"]');
  const delBtn = e.target.closest('button[data-action="delete"]');
  if (editBtn) openTenantModal(tenants.find(t => t.id === editBtn.dataset.id));
  if (delBtn) {
    if (confirm('Delete this tenant? This will not delete their past receipt history. This change is saved to your Google Sheet immediately.')) {
      tenants = tenants.filter(t => t.id !== delBtn.dataset.id);
      await persist();
      renderTenants(); renderHome();
    }
  }
});

document.getElementById('addTenantBtn').addEventListener('click', () => openTenantModal(null));

let editingTenantId = null;
function openTenantModal(tenant) {
  editingTenantId = tenant ? tenant.id : null;
  document.getElementById('tenantModalTitle').textContent = tenant ? 'Edit tenant' : 'Add tenant';
  document.getElementById('tName').value = tenant ? tenant.name : '';
  document.getElementById('tNickname').value = tenant ? (tenant.nickname || '') : '';
  document.getElementById('tPhone').value = tenant ? tenant.phone : (settings.defaultCountryCode || '');
  document.getElementById('tRent').value = tenant ? tenant.rent : '';
  document.getElementById('tCurrency').value = tenant ? tenant.currency : 'RM';
  document.getElementById('tDueDay').value = tenant ? tenant.dueDay : '';
  document.getElementById('tUnit').value = tenant ? (tenant.unit || '') : '';
  document.getElementById('tOwnerName').value = tenant ? (tenant.ownerName || '') : (settings.landlordName || '');
  document.getElementById('tLeaseStart').value = tenant ? (tenant.leaseStart || '') : '';
  document.getElementById('tLeaseEnd').value = tenant ? (tenant.leaseEnd || '') : '';
  document.getElementById('tRenewalYears').value = tenant ? (tenant.renewalYears || '') : '';
  document.getElementById('tenantModalBackdrop').hidden = false;
}
document.getElementById('cancelTenantBtn').addEventListener('click', () => {
  document.getElementById('tenantModalBackdrop').hidden = true;
});
document.getElementById('saveTenantBtn').addEventListener('click', async () => {
  const name = document.getElementById('tName').value.trim();
  const nickname = document.getElementById('tNickname').value.trim();
  const phone = document.getElementById('tPhone').value.trim();
  const rent = parseFloat(document.getElementById('tRent').value) || 0;
  const currency = document.getElementById('tCurrency').value.trim() || 'RM';
  const dueDay = parseInt(document.getElementById('tDueDay').value, 10) || 1;
  const unit = document.getElementById('tUnit').value.trim();
  const ownerName = document.getElementById('tOwnerName').value.trim();
  const leaseStart = document.getElementById('tLeaseStart').value;
  const leaseEnd = document.getElementById('tLeaseEnd').value;
  const renewalYears = parseFloat(document.getElementById('tRenewalYears').value) || 0;

  if (!name || !phone) { alert('Name and WhatsApp number are required.'); return; }

  const fields = { name, nickname, phone, rent, currency, dueDay, unit, ownerName, leaseStart, leaseEnd, renewalYears };
  if (editingTenantId) {
    const t = tenants.find(x => x.id === editingTenantId);
    Object.assign(t, fields);
  } else {
    tenants.push({ id: uid(), ...fields });
  }
  const ok = await persist();
  if (!ok) return;
  document.getElementById('tenantModalBackdrop').hidden = true;
  renderTenants(); renderHome();
});

function renderSummary() {
  const card = document.getElementById('summaryCard');
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let allTime = 0, thisMonth = 0, thisMonthCount = 0;
  receipts.forEach(r => {
    const amt = Number(r.amount) || 0;
    allTime += amt;
    const paidDate = new Date(r.date);
    const paidKey = `${paidDate.getFullYear()}-${String(paidDate.getMonth() + 1).padStart(2, '0')}`;
    if (paidKey === thisMonthKey) { thisMonth += amt; thisMonthCount++; }
  });

  const outstanding = tenants
    .filter(t => dueInfo(t).status !== 'ok')
    .reduce((sum, t) => sum + (Number(t.rent) || 0), 0);

  const money = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  card.innerHTML = `
    <div class="stat"><span class="val">${money(thisMonth)}</span><span class="lbl">Collected this month (${thisMonthCount})</span></div>
    <div class="stat"><span class="val">${money(allTime)}</span><span class="lbl">Collected all-time (${receipts.length})</span></div>
    <div class="stat"><span class="val">${money(outstanding)}</span><span class="lbl">Outstanding right now</span></div>
    <div class="stat"><span class="val">${tenants.length}</span><span class="lbl">Active tenants</span></div>
  `;
}

function renderHistory() {
  renderSummary();
  const list = document.getElementById('historyList');
  const emptyNote = document.getElementById('historyEmpty');
  list.innerHTML = '';
  emptyNote.hidden = receipts.length > 0;
  document.getElementById('historyCount').textContent = receipts.length ? `${receipts.length} sent` : '';

  receipts.forEach(r => {
    const el = document.createElement('div');
    el.className = 'card-item';
    el.innerHTML = `
      <div class="row-top">
        <span class="name">${escapeHtml(r.tenantName)}</span>
        <span class="amount">${escapeHtml(Number(r.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</span>
      </div>
      <div class="sub">Paid ${fmtDate(r.date)}${r.period ? ' · ' + escapeHtml(fmtPeriod(r.period)) : ''}</div>
      ${r.note ? `<div class="sub">${escapeHtml(r.note)}</div>` : ''}`;
    list.appendChild(el);
  });
}

function populateStatementTenants() {
  const sel = document.getElementById('statementTenant');
  const prev = sel.value;
  sel.innerHTML = tenants.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  if (prev) sel.value = prev;
}

function generateStatement() {
  const tenantId = document.getElementById('statementTenant').value;
  const t = tenants.find(x => x.id === tenantId);
  const from = document.getElementById('statementFrom').value;
  const to = document.getElementById('statementTo').value;
  const area = document.getElementById('statementPrintArea');

  if (!t) { area.innerHTML = '<p class="empty-note">Add a tenant first.</p>'; return; }
  if (!from || !to) { area.innerHTML = '<p class="empty-note">Pick both a from-month and a to-month.</p>'; return; }

  const rows = receipts
    .filter(r => r.tenantId === t.id && r.period && r.period >= from && r.period <= to)
    .sort((a, b) => a.period.localeCompare(b.period));

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const money = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rowsHtml = rows.length
    ? rows.map(r => `
        <tr>
          <td>${escapeHtml(fmtPeriod(r.period))}</td>
          <td>${fmtDate(r.date)}</td>
          <td class="num">${money(Number(r.amount) || 0)}</td>
          <td>${escapeHtml(r.note || '')}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" style="color:var(--ink-soft)">No receipts recorded in this range.</td></tr>`;

  area.innerHTML = `
    <div class="statement-header">
      <div>
        <h2>${escapeHtml(t.ownerName || settings.landlordName || 'Rent Book')}</h2>
        <div class="sub">Tenant statement</div>
      </div>
      <div class="sub">${fmtDate(new Date())}</div>
    </div>
    <div class="statement-meta">
      <div><strong>Tenant:</strong> ${escapeHtml(t.name)}${t.nickname ? ' (' + escapeHtml(t.nickname) + ')' : ''}</div>
      ${t.unit ? `<div><strong>Unit / address:</strong> ${escapeHtml(t.unit)}</div>` : ''}
      <div><strong>Statement period:</strong> ${escapeHtml(fmtPeriod(from))} – ${escapeHtml(fmtPeriod(to))}</div>
    </div>
    <table class="statement-table">
      <thead><tr><th>Period</th><th>Date paid</th><th class="num">Amount</th><th>Note</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="statement-total">
      <span>Total collected</span>
      <span class="val">${t.currency || ''} ${money(total)}</span>
    </div>
  `;
}

document.getElementById('generateStatementBtn').addEventListener('click', generateStatement);
document.getElementById('printStatementBtn').addEventListener('click', () => {
  generateStatement();
  window.print();
});

function fillSettingsForm() {
  document.getElementById('scriptUrl').value = scriptUrl || '';
  document.getElementById('reminderDays').value = settings.reminderDays || 3;
  document.getElementById('defaultCountryCode').value = settings.defaultCountryCode || '';
  document.getElementById('landlordName').value = settings.landlordName || '';
}

document.getElementById('saveLandlordBtn').addEventListener('click', async () => {
  settings.landlordName = document.getElementById('landlordName').value.trim();
  const ok = await persist();
  if (ok) { updateReceiptPreview(); alert('Saved.'); }
});

document.getElementById('changePasswordBtn').addEventListener('click', async () => {
  const status = document.getElementById('passwordStatus');
  const current = document.getElementById('currentPassword').value;
  const next = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;

  if (settings.pwHash) {
    const currentHash = await sha256(current);
    if (currentHash !== settings.pwHash) { status.textContent = 'Current password is incorrect.'; return; }
  }
  if (!next || next.length < 4) { status.textContent = 'New password must be at least 4 characters.'; return; }
  if (next !== confirm) { status.textContent = "New password and confirmation don't match."; return; }

  settings.pwHash = await sha256(next);
  const ok = await persist();
  if (!ok) { status.textContent = 'Could not save the new password — try again.'; return; }
  document.getElementById('currentPassword').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmPassword').value = '';
  status.textContent = 'Password updated.';
});

document.getElementById('saveUrlBtn').addEventListener('click', async () => {
  const url = document.getElementById('scriptUrl').value.trim();
  const status = document.getElementById('syncStatus');
  if (!url) { status.textContent = 'Paste your Apps Script Web App URL first.'; return; }
  status.textContent = 'Connecting…';
  scriptUrl = url;
  localStorage.setItem('rb_script_url', scriptUrl);
  try {
    await fetchAllFromSheet();
    setSyncLabel('Synced with sheet', true);
    status.textContent = 'Connected and loaded data from this sheet.';
    renderTenants(); renderHome(); renderHistory();
  } catch (err) {
    setSyncLabel('Not connected', false);
    status.textContent = 'Could not reach that sheet. Check the URL and that the script is deployed for "Anyone".';
  }
});

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  settings.reminderDays = parseInt(document.getElementById('reminderDays').value, 10) || 3;
  settings.defaultCountryCode = document.getElementById('defaultCountryCode').value.trim();
  const ok = await persist();
  if (ok) { renderHome(); renderTenants(); alert('Settings saved.'); }
});

document.getElementById('pushBtn').addEventListener('click', async () => {
  const status = document.getElementById('syncStatus');
  status.textContent = 'Syncing…';
  const ok = await persist();
  status.textContent = ok ? 'Synced to the sheet.' : 'Could not reach the sheet.';
});

document.getElementById('pullBtn').addEventListener('click', async () => {
  const status = document.getElementById('syncStatus');
  if (!scriptUrl) { status.textContent = 'Connect a sheet first.'; return; }
  status.textContent = 'Refreshing…';
  try {
    await fetchAllFromSheet();
    setSyncLabel('Synced with sheet', true);
    renderTenants(); renderHome(); renderHistory();
    status.textContent = 'Refreshed from the sheet.';
  } catch (err) {
    status.textContent = 'Could not reach the sheet. Check your connection.';
  }
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ tenants, receipts, settings }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rent-book-backup-${todayISO()}.json`;
  a.click();
});

document.getElementById('wipeBtn').addEventListener('click', async () => {
  if (confirm('This permanently erases all tenants and receipt history in your connected Google Sheet — not just on this device. This cannot be undone. Continue?')) {
    tenants = []; receipts = [];
    const ok = await persist();
    if (ok) { renderTenants(); renderHome(); renderHistory(); }
  }
});

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function initApp() {
  fillSettingsForm();
  setSyncLabel('Synced with sheet', true);
  renderTenants();
  renderHome();
  renderHistory();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

function unlockApp() {
  document.getElementById('lockScreen').hidden = true;
  document.getElementById('appRoot').classList.add('unlocked');
  initApp();
}

function setupLockScreen() {
  document.getElementById('lockScreen').hidden = false;
  const title = document.getElementById('lockTitle');
  const hint = document.getElementById('lockHint');
  const pwField = document.getElementById('lockPassword');
  const confirmField = document.getElementById('lockPasswordConfirm');
  const errorEl = document.getElementById('lockError');
  const submitBtn = document.getElementById('lockSubmitBtn');
  const isSetup = !settings.pwHash;

  if (isSetup) {
    title.textContent = 'Set a password';
    hint.textContent = 'Choose a password to protect this page. It will be saved (as a hash) in your connected sheet, so it applies on any device that connects to it.';
    confirmField.hidden = false;
    submitBtn.textContent = 'Set password';
  } else {
    title.textContent = 'Enter password';
    hint.textContent = 'This sheet is protected. Enter your password to continue.';
    confirmField.hidden = true;
    submitBtn.textContent = 'Unlock';
  }
  errorEl.hidden = true;
  pwField.value = ''; confirmField.value = '';

  async function attempt() {
    errorEl.hidden = true;
    if (isSetup) {
      const p1 = pwField.value, p2 = confirmField.value;
      if (!p1 || p1.length < 4) { errorEl.textContent = 'Password must be at least 4 characters.'; errorEl.hidden = false; return; }
      if (p1 !== p2) { errorEl.textContent = "Passwords don't match."; errorEl.hidden = false; return; }
      settings.pwHash = await sha256(p1);
      const ok = await persist();
      if (!ok) { errorEl.textContent = 'Could not save to the sheet — check your connection and try again.'; errorEl.hidden = false; return; }
      unlockApp();
    } else {
      const hash = await sha256(pwField.value);
      if (hash === settings.pwHash) {
        unlockApp();
      } else {
        errorEl.textContent = 'Incorrect password.'; errorEl.hidden = false;
        pwField.value = '';
      }
    }
  }

  submitBtn.onclick = attempt;
  [pwField, confirmField].forEach(f => f.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); }));
  pwField.focus();
}

function showConnectScreen(errorMsg) {
  document.getElementById('lockScreen').hidden = true;
  const cs = document.getElementById('connectScreen');
  cs.hidden = false;
  document.getElementById('connectUrl').value = scriptUrl || '';
  const err = document.getElementById('connectError');
  if (errorMsg) { err.textContent = errorMsg; err.hidden = false; } else { err.hidden = true; }
  document.getElementById('connectUrl').focus();
}

async function tryConnectAndProceed() {
  try {
    await fetchAllFromSheet();
    document.getElementById('connectScreen').hidden = true;
    setupLockScreen();
  } catch (err) {
    showConnectScreen('Could not load your sheet. Check the URL, that the script is deployed for "Anyone", and your internet connection.');
  }
}

document.getElementById('connectSubmitBtn').addEventListener('click', async () => {
  const url = document.getElementById('connectUrl').value.trim();
  const err = document.getElementById('connectError');
  if (!url) { err.textContent = 'Paste your Apps Script Web App URL.'; err.hidden = false; return; }
  scriptUrl = url;
  localStorage.setItem('rb_script_url', scriptUrl);
  err.hidden = true;
  document.getElementById('connectSubmitBtn').textContent = 'Connecting…';
  await tryConnectAndProceed();
  document.getElementById('connectSubmitBtn').textContent = 'Connect';
});
document.getElementById('connectUrl').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('connectSubmitBtn').click();
});

async function boot() {
  if (!scriptUrl) {
    showConnectScreen();
    return;
  }
  document.getElementById('connectScreen').hidden = true;
  await tryConnectAndProceed();
}

boot();
