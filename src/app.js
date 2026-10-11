import { LIMITS, computePlan, distributeRemainder } from './calc.js';
import { ZERO, toNumber } from './decimal.js';
import { formatInput, formatMoney, formatPercent } from './format.js';
import { t } from './i18n/index.js';
import { loadPlan, savePlan } from './storage.js';
import { track } from './analytics.js';
import { attachTooltip, escapeHtml, renderBarChart } from './charts.js';

const UNDO_MS = 5000;
const $ = (id) => document.getElementById(id);

const state = loadPlan() ?? { budget: '', currency: 'PLN', categories: [] };
let wasComplete = null;
let pendingUndo = null;

function applyStaticTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.title = t('app.title');
}

function announce(text) {
  const el = $('announcer');
  el.textContent = '';
  // Odstęp gwarantuje, że czytnik ekranu ogłosi nawet powtórzony komunikat.
  setTimeout(() => { el.textContent = text; }, 50);
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `c${Date.now()}${Math.random().toString(16).slice(2)}`;
}

function uniqueDefaultName() {
  const names = new Set(state.categories.map((c) => c.name.trim().toLocaleLowerCase('pl-PL')));
  let n = state.categories.length + 1;
  while (names.has(t('categories.defaultName', { n }).toLocaleLowerCase('pl-PL'))) n += 1;
  return t('categories.defaultName', { n });
}

// ---------- Wiersze kategorii ----------

function inputCell(cat, field, labelKey, extra = '') {
  const id = `${field}-${cat.id}`;
  return `
    <td class="cell cell--${field}">
      <label class="cell-label" for="${id}">${escapeHtml(t(labelKey))}</label>
      <input id="${id}" data-field="${field}" type="text" value="${escapeHtml(cat[field])}"
             autocomplete="off" aria-describedby="${id}-error" ${extra}>
      <p class="field-error" id="${id}-error"></p>
    </td>`;
}

function outputCell(field, labelKey) {
  return `
    <td class="cell cell--out num" data-out="${field}">
      <span class="cell-label" aria-hidden="true">${escapeHtml(t(labelKey))}</span>
      <span class="out-value">—</span>
    </td>`;
}

function renderRows() {
  const body = $('categories-body');
  body.innerHTML = state.categories
    .map((cat) => `
      <tr data-id="${escapeHtml(cat.id)}">
        ${inputCell(cat, 'name', 'col.name')}
        ${inputCell(cat, 'share', 'col.share', 'inputmode="decimal"')}
        ${inputCell(cat, 'roi', 'col.roi', 'inputmode="decimal"')}
        ${outputCell('amount', 'col.amount')}
        ${outputCell('profit', 'col.profit')}
        ${outputCell('final', 'col.final')}
        <td class="cell cell--actions">
          <button type="button" class="btn btn--icon" data-action="delete"
                  aria-label="${escapeHtml(t('row.delete', { name: cat.name || '' }))}">
            <span aria-hidden="true">✕</span><span class="delete-text">${escapeHtml(t('row.deleteShort'))}</span>
          </button>
        </td>
      </tr>`)
    .join('');
}

function focusField(id, field) {
  const input = document.getElementById(`${field}-${id}`);
  if (input) {
    input.focus();
    input.select();
  }
}

function addCategory() {
  if (state.categories.length >= LIMITS.categoriesMax) return;
  if (state.categories.length === 0) track('plan_created');
  const cat = { id: newId(), name: uniqueDefaultName(), share: '0', roi: '0' };
  state.categories.push(cat);
  track('category_added', { category_count: state.categories.length });
  renderRows();
  update();
  focusField(cat.id, 'name');
}

function deleteCategory(id) {
  const index = state.categories.findIndex((c) => c.id === id);
  if (index === -1) return;
  const [removed] = state.categories.splice(index, 1);
  renderRows();
  update();

  const next = state.categories[Math.min(index, state.categories.length - 1)];
  if (next) document.querySelector(`tr[data-id="${CSS.escape(next.id)}"] [data-action="delete"]`)?.focus();
  else $('add-category').focus();

  showUndoToast(removed, index);
}

function showUndoToast(cat, index) {
  clearTimeout(pendingUndo?.timer);
  const label = cat.name.trim() || '—';
  pendingUndo = {
    cat,
    index,
    timer: setTimeout(hideToast, UNDO_MS),
  };
  $('toast-text').textContent = t('toast.deleted', { name: label });
  $('toast').hidden = false;
  announce(`${t('toast.deleted', { name: label })} ${t('toast.undo')}?`);
}

function hideToast() {
  clearTimeout(pendingUndo?.timer);
  pendingUndo = null;
  $('toast').hidden = true;
}

function undoDelete() {
  if (!pendingUndo) return;
  const { cat, index } = pendingUndo;
  hideToast();
  if (state.categories.length >= LIMITS.categoriesMax) return;
  state.categories.splice(Math.min(index, state.categories.length), 0, cat);
  renderRows();
  update();
  focusField(cat.id, 'name');
  announce(t('toast.restored', { name: cat.name.trim() || '—' }));
}

// ---------- Przeliczenie i widok ----------

function setFieldError(input, errorEl, key) {
  const message = key ? t(key) : '';
  if (errorEl.textContent !== message) errorEl.textContent = message;
  if (key) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function update() {
  const result = computePlan(state);
  const { totals, status } = result;
  const cur = state.currency;

  // Błędy pól
  setFieldError($('budget'), $('budget-error'), state.budget.trim() === '' && status === 'empty' ? null : result.errors.budget);
  for (const row of result.rows) {
    const errs = result.errors.categories[row.id];
    for (const field of ['name', 'share', 'roi']) {
      const input = document.getElementById(`${field}-${row.id}`);
      if (input) setFieldError(input, document.getElementById(`${field}-${row.id}-error`), errs[field]);
    }
    const tr = document.querySelector(`tr[data-id="${CSS.escape(row.id)}"]`);
    if (!tr) continue;
    tr.querySelector('[data-out="amount"] .out-value').textContent = formatMoney(row.amount, cur);
    const profitCell = tr.querySelector('[data-out="profit"] .out-value');
    profitCell.textContent = formatMoney(row.profit, cur);
    profitCell.classList.toggle('is-negative', row.profit != null && row.profit < ZERO);
    tr.querySelector('[data-out="final"] .out-value').textContent = formatMoney(row.final, cur);
    tr.querySelector('[data-action="delete"]').setAttribute('aria-label', t('row.delete', { name: row.name }));
  }

  // Pasek postępu i status
  const block = $('progress-block');
  block.dataset.status = status;
  const allocated = totals.share;
  const remaining = totals.remainingShare > ZERO ? totals.remainingShare : ZERO;
  $('progress-label').textContent = t('progress.label', {
    allocated: formatPercent(allocated),
    remaining: formatPercent(remaining),
  });
  const pct = Math.max(0, Math.min(100, toNumber(allocated)));
  $('progress-fill').style.width = `${pct}%`;
  const bar = $('progress');
  bar.setAttribute('aria-valuenow', String(Math.round(toNumber(allocated) * 100) / 100));
  bar.setAttribute('aria-valuetext', $('progress-label').textContent);
  $('status-badge').textContent = t(`status.badge.${status}`);

  let message;
  if (status === 'empty') message = t('status.empty');
  else if (status === 'complete') message = t('status.complete');
  else if (status === 'incomplete')
    message = t('status.incomplete', { amount: formatMoney(totals.unallocated, cur), percent: formatPercent(totals.remainingShare) });
  else
    message = t('status.over', { amount: formatMoney(totals.unallocated == null ? null : -totals.unallocated, cur), percent: formatPercent(-totals.remainingShare) });
  if (result.hasErrors && status !== 'empty') message += ` ${t('status.errors')}`;
  const statusEl = $('status-message');
  if (statusEl.textContent !== message) statusEl.textContent = message;

  updateRemainder(result);

  // Licznik i limity
  const count = state.categories.length;
  $('category-count').textContent = `${count} / ${LIMITS.categoriesMax}`;
  $('empty-state').hidden = count > 0;
  $('categories-table').hidden = count === 0;
  const addBtn = $('add-category');
  addBtn.disabled = count >= LIMITS.categoriesMax;
  $('categories-hint').textContent =
    count >= LIMITS.categoriesMax ? t('categories.limit', { max: LIMITS.categoriesMax }) : t('categories.hint');
  $('categories-hint').hidden = count === 0;

  updateSummary(result);
  updateCharts(result);

  // Zapis: jako „complete” tylko poprawny plan z sumą 100%, inaczej szkic.
  savePlan(state, result.isComplete ? 'complete' : 'draft');
  if (wasComplete === false && result.isComplete) track('plan_completed', { category_count: count });
  wasComplete = result.isComplete;
}

function updateRemainder(result) {
  const wrap = $('remainder');
  const show = result.status === 'incomplete' && result.rows.length > 0;
  wrap.hidden = !show;
  if (!show) return;
  const select = $('remainder-target');
  const previous = select.value;
  select.innerHTML = result.rows
    .map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name || '—')}</option>`)
    .join('');
  if (result.rows.some((r) => r.id === previous)) select.value = previous;
  $('remainder-btn').disabled = result.rows.length === 0;
}

function distributeRest() {
  const result = computePlan(state);
  if (result.status !== 'incomplete') return;
  const id = $('remainder-target').value;
  const cat = state.categories.find((c) => c.id === id);
  if (!cat) return;
  cat.share = formatInput(distributeRemainder(cat.share, result.totals.remainingShare));
  const input = document.getElementById(`share-${id}`);
  if (input) input.value = cat.share;
  update();
  announce(t('remainder.done', { percent: formatPercent(result.totals.remainingShare), name: cat.name.trim() }));
}

function updateSummary(result) {
  const { totals, status } = result;
  const cur = state.currency;
  const hasData = status !== 'empty' && result.budget != null;
  $('summary').dataset.status = result.isComplete ? 'complete' : status;
  $('sum-amount').textContent = hasData ? formatMoney(totals.amount, cur) : '—';
  $('sum-profit').textContent = hasData ? formatMoney(totals.profit, cur) : '—';
  $('sum-profit').classList.toggle('is-negative', hasData && totals.profit < ZERO);
  $('sum-roi').textContent = hasData ? formatPercent(totals.roi) : '—';
  $('sum-final').textContent = hasData ? formatMoney(totals.final, cur) : '—';
  let note = '';
  if (status === 'incomplete') note = t('summary.draft', { percent: formatPercent(totals.share) });
  else if (status === 'over') note = t('summary.over');
  $('summary-note').textContent = note;
}

function updateCharts(result) {
  const cur = state.currency;
  const valid = result.rows.filter((r) => r.share != null);

  const shareItems = valid.map((r) => ({
    label: r.name || '—',
    value: toNumber(r.share),
    display: formatPercent(r.share),
    tip: `${r.name || '—'}: ${formatPercent(r.share)} · ${formatMoney(r.amount, cur)}`,
    tone: 'pos',
  }));
  if (valid.length > 0 && result.totals.remainingShare > ZERO) {
    shareItems.push({
      label: t('chart.unallocated'),
      value: toNumber(result.totals.remainingShare),
      display: formatPercent(result.totals.remainingShare),
      tip: `${t('chart.unallocated')}: ${formatPercent(result.totals.remainingShare)} · ${formatMoney(result.totals.unallocated, cur)}`,
      tone: 'muted',
    });
  }
  renderBarChart($('chart-share'), { items: shareItems, domain: [0, 100], altKey: 'chart.share.alt' });

  const profitRows = result.rows.filter((r) => r.profit != null);
  const values = profitRows.map((r) => toNumber(r.profit));
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  renderBarChart($('chart-profit'), {
    items: profitRows.map((r, i) => ({
      label: r.name || '—',
      value: values[i],
      display: formatMoney(r.profit, cur),
      tip: `${r.name || '—'}: ${formatMoney(r.profit, cur)} (ROI ${formatPercent(r.roi)})`,
      tone: values[i] < 0 ? 'neg' : 'pos',
    })),
    domain: min === max ? [0, 1] : [min, max],
    altKey: 'chart.profit.alt',
  });
}

// ---------- Zdarzenia ----------

function bindEvents() {
  const budget = $('budget');
  budget.value = state.budget;
  budget.addEventListener('input', () => {
    state.budget = budget.value;
    update();
  });

  const currency = $('currency');
  currency.value = state.currency;
  if (currency.value !== state.currency) state.currency = currency.value = 'PLN';
  currency.addEventListener('change', () => {
    state.currency = currency.value;
    update();
  });

  const body = $('categories-body');
  body.addEventListener('input', (e) => {
    const input = e.target.closest('input[data-field]');
    if (!input) return;
    const id = input.closest('tr').dataset.id;
    const cat = state.categories.find((c) => c.id === id);
    if (!cat) return;
    cat[input.dataset.field] = input.value;
    update();
  });

  body.addEventListener('keydown', (e) => {
    const input = e.target.closest('input[data-field]');
    if (!input || e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const tr = input.closest('tr');
    const index = state.categories.findIndex((c) => c.id === tr.dataset.id);
    if (index === state.categories.length - 1) addCategory();
    else focusField(state.categories[index + 1].id, input.dataset.field);
  });

  body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="delete"]');
    if (btn) deleteCategory(btn.closest('tr').dataset.id);
  });

  $('add-category').addEventListener('click', addCategory);
  $('remainder-btn').addEventListener('click', distributeRest);
  $('toast-undo').addEventListener('click', undoDelete);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pendingUndo) hideToast();
  });

  attachTooltip(document.querySelector('.col-output'), $('tooltip'));
}

applyStaticTranslations();
bindEvents();
renderRows();
update();
