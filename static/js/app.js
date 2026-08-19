/* ─── Navigation ──────────────────────────────────────────────────────────── */
document.querySelectorAll('.nav-item, [data-section]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const target = link.dataset.section || link.getAttribute('href')?.replace('#', '');
    if (!target) return;
    navigateTo(target);
  });
});

function navigateTo(sectionId) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const section = document.getElementById(sectionId);
  if (section) section.classList.add('active');
  const navItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
  if (navItem) navItem.classList.add('active');
}

/* ─── Init ────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('date').valueAsDate = new Date();
  refreshAll();
  setupUpload();
  setupTemplateDownload();
});

function refreshAll() {
  loadSummary();
  loadExpenses();
}

/* ─── API Helper ──────────────────────────────────────────────────────────── */
async function apiFetch(method, endpoint, body = null) {
  const opts = { method, headers: {} };
  if (body && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body) {
    opts.body = body;
  }
  const res = await fetch(endpoint, opts);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data;
}

/* ─── Toast ───────────────────────────────────────────────────────────────── */
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 4000);
}

/* ─── Load Summary ────────────────────────────────────────────────────────── */
async function loadSummary() {
  try {
    const data = await apiFetch('GET', '/api/summary');

    // KPI values
    document.getElementById('total-amount').textContent =
      '$' + (data.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
    document.getElementById('record-count').textContent = (data.count || 0).toLocaleString();

    // Top category
    const cats = data.by_category || {};
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('top-category').textContent = top ? top[0] : '—';

    // Category bars
    renderCategoryBars(cats);
  } catch (e) {
    console.error('Summary error:', e);
  }
}

function renderCategoryBars(byCategory) {
  const container = document.getElementById('category-breakdown');
  const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    container.innerHTML = '<p style="color:var(--text-3);font-size:13px">No data yet.</p>';
    return;
  }
  const max = entries[0][1];
  container.innerHTML = entries.map(([cat, amt]) => `
    <div class="category-row">
      <span class="category-name" title="${cat}">${cat}</span>
      <div class="bar-wrap">
        <div class="bar-fill" style="width:${(amt / max * 100).toFixed(1)}%"></div>
      </div>
      <span class="category-amt">$${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
    </div>
  `).join('');
}

/* ─── Load Expenses ───────────────────────────────────────────────────────── */
async function loadExpenses() {
  const recentBody   = document.getElementById('recent-body');
  const expensesBody = document.getElementById('expenses-body');

  try {
    const data = await apiFetch('GET', '/api/expenses');
    const rows = (data.data || []).slice(1); // skip header

    if (!rows.length) {
      const empty = '<tr><td colspan="8" class="empty">No expenses recorded yet</td></tr>';
      recentBody.innerHTML   = `<tr><td colspan="6" class="empty">No expenses recorded yet</td></tr>`;
      expensesBody.innerHTML = empty;
      return;
    }

    // Recent table (latest 10, reversed)
    const recent = [...rows].reverse().slice(0, 10);
    recentBody.innerHTML = recent.map(r => `
      <tr>
        <td>${r[0] || ''}</td>
        <td><span class="tag">${r[1] || ''}</span></td>
        <td>${r[2] || ''}</td>
        <td class="amt">${r[4] || ''} ${parseFloat(r[3] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td>${r[6] || ''}</td>
        <td>${r[8] || ''}</td>
      </tr>
    `).join('');

    // All records (latest first)
    const all = [...rows].reverse();
    expensesBody.innerHTML = all.map(r => `
      <tr>
        <td>${r[0] || ''}</td>
        <td><span class="tag">${r[1] || ''}</span></td>
        <td>${r[2] || ''}</td>
        <td class="amt">${parseFloat(r[3] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td>${r[4] || 'USD'}</td>
        <td>${r[5] || ''}</td>
        <td>${r[6] || ''}</td>
        <td>${r[8] || ''}</td>
      </tr>
    `).join('');

  } catch (e) {
    const err = `<tr><td colspan="8" class="empty">Failed to load — ${e.message}</td></tr>`;
    recentBody.innerHTML   = `<tr><td colspan="6" class="empty">Failed to load</td></tr>`;
    expensesBody.innerHTML = err;
  }
}

/* ─── Add Expense Form ────────────────────────────────────────────────────── */
document.getElementById('expense-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Saving…`;

  try {
    await apiFetch('POST', '/api/expenses', {
      date:           document.getElementById('date').value,
      category:       document.getElementById('category').value,
      description:    document.getElementById('description').value,
      amount:         parseFloat(document.getElementById('amount').value),
      currency:       document.getElementById('currency').value,
      payment_method: document.getElementById('payment_method').value,
      vendor:         document.getElementById('vendor').value,
      receipt_url:    document.getElementById('receipt_url').value,
      submitted_by:   document.getElementById('submitted_by').value,
    });

    showToast('Expense saved to Google Sheets ✓', 'success');
    e.target.reset();
    document.getElementById('date').valueAsDate = new Date();
    refreshAll();
    // Switch to dashboard after save
    setTimeout(() => navigateTo('dashboard'), 800);

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Submit Expense`;
  }
});

/* ─── CSV Upload ──────────────────────────────────────────────────────────── */
function setupUpload() {
  const area   = document.getElementById('upload-area');
  const input  = document.getElementById('csv-file');
  const status = document.getElementById('upload-status');

  area.addEventListener('click', () => input.click());

  area.addEventListener('dragover', e => {
    e.preventDefault();
    area.classList.add('dragover');
  });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', e => {
    e.preventDefault();
    area.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  input.addEventListener('change', e => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  async function handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setStatus('error', 'Please upload a .csv file');
      return;
    }
    setStatus('loading', `Uploading "${file.name}"…`);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/expenses/bulk', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setStatus('success', `✓ ${data.message}`);
        showToast(data.message, 'success');
        refreshAll();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setStatus('error', err.message);
      showToast(err.message, 'error');
    }
  }

  function setStatus(type, msg) {
    status.className = `status-box ${type}`;
    status.textContent = msg;
  }
}

/* ─── Template Download ───────────────────────────────────────────────────── */
function setupTemplateDownload() {
  document.getElementById('download-template').addEventListener('click', () => {
    const csv = [
      'date,category,description,amount,currency,payment_method,vendor,receipt_url,submitted_by',
      '2024-08-12,Travel,Flight to Conference,1250.00,USD,Corporate Card,Delta Airlines,,John Doe',
      '2024-08-13,Office Supplies,Printer Ink Cartridges,89.50,USD,Corporate Card,Amazon,,Sara Smith',
      '2024-08-14,Meals & Entertainment,Team Lunch,220.00,USD,Cash,Local Restaurant,,Ahmed Ali',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'expense-template.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Template downloaded', 'success');
  });
}

/* ─── Spinner keyframe ────────────────────────────────────────────────────── */
const style = document.createElement('style');
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);
