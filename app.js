// Kalkulator ROI budżetu — cała logika w jednym skrypcie (bez modułów i narzędzi budowania).
'use strict';

(() => {
  // ===================== decimal.js =====================
  // Arytmetyka dziesiętna na stałej skali (BigInt), bez błędów float.
  // Wartość jest przechowywana jako liczba całkowita pomnożona przez 10^SCALE.
  // Dane wejściowe mają maks. 2 miejsca po przecinku, więc mnożenia
  // B · u/100 · r/100 mieszczą się w 12 miejscach bez utraty precyzji.

  const SCALE = 12;
  const ONE = 10n ** BigInt(SCALE);
  const ZERO = 0n;
  const HUNDRED = 100n * ONE;

  /**
   * Parsuje tekst liczby w formacie pl-PL lub z kropką ("100 000,50", "100000.5", "-5").
   * Zwraca { value, decimals } albo null, gdy tekst nie jest liczbą.
   */
  function parseDecimal(input) {
    if (typeof input !== 'string') return null;
    const normalized = input
      .trim()
      .replace(/[\s  ]/g, '')
      .replace(/−/g, '-')
      .replace(',', '.');
    const match = /^([+-])?(\d+)(?:\.(\d*))?$/.exec(normalized);
    if (!match) return null;
    const [, sign, intPart, fracPart = ''] = match;
    if (fracPart.length > SCALE) return null;
    const digits = BigInt(intPart + fracPart.padEnd(SCALE, '0'));
    return {
      value: sign === '-' ? -digits : digits,
      decimals: fracPart.replace(/0+$/, '').length,
    };
  }

  function fromInt(n) {
    return BigInt(n) * ONE;
  }

  function mul(a, b) {
    return roundDiv(a * b, ONE);
  }

  function div(a, b) {
    if (b === 0n) throw new RangeError('Dzielenie przez zero');
    return roundDiv(a * ONE, b);
  }

  function abs(a) {
    return a < 0n ? -a : a;
  }

  function sum(values) {
    return values.reduce((acc, v) => acc + v, 0n);
  }

  /** Dzielenie całkowite z zaokrągleniem „połówki od zera”. */
  function roundDiv(num, den) {
    const negative = (num < 0n) !== (den < 0n);
    const n = abs(num);
    const d = abs(den);
    let q = n / d;
    if ((n % d) * 2n >= d) q += 1n;
    return negative ? -q : q;
  }

  /**
   * Zaokrągla do `dp` miejsc i zwraca { negative, intPart, fracPart } jako stringi cyfr.
   * Używane wyłącznie do wyświetlania.
   */
  function toParts(a, dp) {
    const rounded = roundDiv(a, 10n ** BigInt(SCALE - dp));
    const negative = rounded < 0n;
    const digits = abs(rounded).toString().padStart(dp + 1, '0');
    return {
      negative: negative && rounded !== 0n,
      intPart: digits.slice(0, digits.length - dp),
      fracPart: dp > 0 ? digits.slice(digits.length - dp) : '',
    };
  }

  /** Konwersja do Number — tylko do skalowania wykresów, nigdy do obliczeń. */
  function toNumber(a) {
    return Number(a) / Number(ONE);
  }

  // ===================== calc.js =====================
  const LIMITS = {
    budgetMax: fromInt(1_000_000_000_000),
    maxDecimals: 2,
    shareMin: ZERO,
    shareMax: HUNDRED,
    roiMin: fromInt(-100),
    roiMax: fromInt(1000),
    nameMax: 50,
    categoriesMin: 1,
    categoriesMax: 30,
  };

  // Tolerancja sumy udziałów: |suma − 100| < 0,01 pp.
  const SHARE_TOLERANCE = div(fromInt(1), fromInt(100));

  function validateNumber(raw, { min, max, minExclusive, errors }) {
    if (raw == null || String(raw).trim() === '') return { error: errors.required };
    const parsed = parseDecimal(String(raw));
    if (!parsed) return { error: errors.invalid };
    if (parsed.decimals > LIMITS.maxDecimals) return { error: errors.decimals };
    if (minExclusive ? parsed.value <= min : parsed.value < min) return { error: errors.min };
    if (parsed.value > max) return { error: errors.max };
    return { value: parsed.value };
  }

  function validateBudget(raw) {
    return validateNumber(raw, {
      min: ZERO,
      minExclusive: true,
      max: LIMITS.budgetMax,
      errors: {
        required: 'budget.required',
        invalid: 'budget.invalid',
        decimals: 'budget.decimals',
        min: 'budget.min',
        max: 'budget.max',
      },
    });
  }

  function validateShare(raw) {
    return validateNumber(raw, {
      min: LIMITS.shareMin,
      max: LIMITS.shareMax,
      errors: {
        required: 'share.required',
        invalid: 'share.invalid',
        decimals: 'share.decimals',
        min: 'share.range',
        max: 'share.range',
      },
    });
  }

  function validateRoi(raw) {
    return validateNumber(raw, {
      min: LIMITS.roiMin,
      max: LIMITS.roiMax,
      errors: {
        required: 'roi.required',
        invalid: 'roi.invalid',
        decimals: 'roi.decimals',
        min: 'roi.min',
        max: 'roi.max',
      },
    });
  }

  function normalizeName(name) {
    return String(name ?? '').trim().toLocaleLowerCase('pl-PL');
  }

  function validateName(name, otherNames = []) {
    const trimmed = String(name ?? '').trim();
    if (trimmed === '') return { error: 'name.required' };
    if (trimmed.length > LIMITS.nameMax) return { error: 'name.max' };
    const key = normalizeName(trimmed);
    if (otherNames.some((n) => normalizeName(n) === key)) return { error: 'name.duplicate' };
    return { value: trimmed };
  }

  /**
   * Liczy cały plan. `plan` zawiera surowe teksty z formularza:
   * { budget: string, categories: [{ id, name, share, roi }] }.
   * Wiersze z błędnymi polami są pomijane w sumach (pokazujemy przy nich błąd).
   */
  function computePlan(plan) {
    const budgetResult = validateBudget(plan.budget);
    const budget = budgetResult.value ?? null;
    const errors = { budget: budgetResult.error ?? null, categories: {} };

    const rows = plan.categories.map((cat, index) => {
      const others = plan.categories.filter((_, i) => i !== index).map((c) => c.name);
      const name = validateName(cat.name, others);
      const share = validateShare(cat.share);
      const roi = validateRoi(cat.roi);
      const rowErrors = { name: name.error ?? null, share: share.error ?? null, roi: roi.error ?? null };
      errors.categories[cat.id] = rowErrors;

      const valid = share.value != null && roi.value != null;
      const amount = valid && budget != null ? mul(budget, div(share.value, HUNDRED)) : null;
      const profit = amount != null ? mul(amount, div(roi.value, HUNDRED)) : null;
      return {
        id: cat.id,
        name: name.value ?? String(cat.name ?? '').trim(),
        share: share.value ?? null,
        roi: roi.value ?? null,
        amount,
        profit,
        final: amount != null ? amount + profit : null,
      };
    });

    const shareSum = sum(rows.map((r) => r.share ?? ZERO));
    const totalAmount = sum(rows.map((r) => r.amount ?? ZERO));
    const totalProfit = sum(rows.map((r) => r.profit ?? ZERO));
    const remainingShare = HUNDRED - shareSum;
    const unallocated = budget != null ? mul(budget, div(remainingShare, HUNDRED)) : null;

    let status;
    if (rows.length === 0) status = 'empty';
    else if (abs(remainingShare) < SHARE_TOLERANCE) status = 'complete';
    else if (remainingShare > ZERO) status = 'incomplete';
    else status = 'over';

    const hasErrors =
      errors.budget != null ||
      Object.values(errors.categories).some((e) => e.name || e.share || e.roi);

    return {
      budget,
      rows,
      errors,
      hasErrors,
      status,
      isComplete: status === 'complete' && !hasErrors,
      totals: {
        share: shareSum,
        remainingShare,
        unallocated,
        amount: totalAmount,
        profit: totalProfit,
        final: totalAmount + totalProfit,
        roi: totalAmount !== ZERO ? mul(div(totalProfit, totalAmount), HUNDRED) : null,
      },
    };
  }

  /** Zwraca nowy udział kategorii po dopisaniu brakujących punktów procentowych. */
  function distributeRemainder(currentShare, remainingShare) {
    const share = validateShare(currentShare).value ?? ZERO;
    return share + remainingShare;
  }

  // ===================== format.js =====================
  const NBSP = ' ';
  const MINUS = '−';

  function group(intPart) {
    // pl-PL: spacja jako separator tysięcy (również dla liczb 4-cyfrowych, dla spójności kolumn).
    return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  }

  function render({ negative, intPart, fracPart }) {
    return (negative ? MINUS : '') + group(intPart) + (fracPart ? ',' + fracPart : '');
  }

  /** Kwota: 2 miejsca po przecinku, „,00” pomijane dla pełnych kwot. */
  function formatMoney(value, currency) {
    if (value == null) return '—';
    const parts = toParts(value, 2);
    if (parts.fracPart === '00') parts.fracPart = '';
    return render(parts) + NBSP + currency;
  }

  /** Procent: do 2 miejsc po przecinku, bez zbędnych zer. */
  function formatPercent(value) {
    if (value == null) return '—';
    const parts = toParts(value, 2);
    parts.fracPart = parts.fracPart.replace(/0+$/, '');
    return render(parts) + '%';
  }

  /** Tekst do pola edycji (bez separatorów tysięcy, z przecinkiem). */
  function formatInput(value) {
    const parts = toParts(value, 2);
    parts.fracPart = parts.fracPart.replace(/0+$/, '');
    return (parts.negative ? '-' : '') + parts.intPart + (parts.fracPart ? ',' + parts.fracPart : '');
  }

  // ===================== i18n =====================
  const catalogs = { pl: window.ROI_I18N_PL || {} };
  let messages = catalogs.pl;

  /** Zwraca przetłumaczony tekst; `{param}` zastępowane wartościami z `params`. */
  function t(key, params = {}) {
    const template = messages[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name) => (name in params ? String(params[name]) : `{${name}}`));
  }

  // ===================== storage.js =====================
  const KEY = 'roi-budget-plan:v1';

  /** Odczyt planu z localStorage; null, gdy brak lub storage niedostępny. */
  function loadPlan(storage = globalThis.localStorage) {
    try {
      const raw = storage?.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || !Array.isArray(data.categories)) return null;
      return {
        budget: String(data.budget ?? ''),
        currency: String(data.currency ?? 'PLN'),
        categories: data.categories
          .filter((c) => c && typeof c === 'object')
          .slice(0, 30)
          .map((c) => ({
            id: String(c.id ?? newId()),
            name: String(c.name ?? ''),
            share: String(c.share ?? ''),
            roi: String(c.roi ?? ''),
          })),
      };
    } catch {
      return null;
    }
  }

  /**
   * Zapis planu. `status` to „complete” tylko dla poprawnego planu z sumą 100%;
   * w pozostałych przypadkach plan zapisuje się jako szkic.
   */
  function savePlan(plan, status, storage = globalThis.localStorage) {
    try {
      storage?.setItem(
        KEY,
        JSON.stringify({ ...plan, status, savedAt: new Date().toISOString() }),
      );
      return true;
    } catch {
      return false;
    }
  }

  // ===================== analytics.js =====================
  // Zdarzenia analityczne bez kwot ani nazw kategorii — tylko typ zdarzenia i liczniki.
  // Domyślnie trafiają do window.dataLayer (jeśli narzędzie analityczne go udostępnia).

  const ALLOWED = new Set(['plan_created', 'plan_completed', 'category_added', 'export']);

  function track(event, props = {}) {
    if (!ALLOWED.has(event)) return;
    const safe = {};
    for (const [k, v] of Object.entries(props)) {
      if (typeof v === 'number' && Number.isInteger(v) && k.endsWith('_count')) safe[k] = v;
    }
    try {
      globalThis.dataLayer?.push({ event, ...safe });
    } catch {
      /* analityka nigdy nie blokuje aplikacji */
    }
  }

  // ===================== charts.js =====================
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  /**
   * Poziomy wykres słupkowy w HTML (czytelny na telefonie, bez skalowania tekstu).
   * items: [{ label, value: Number, display: string, tip: string, tone: 'pos'|'neg'|'muted' }]
   * domain: [min, max] — zakres osi; 0 zawsze jest linią bazową.
   */
  function renderBarChart(container, { items, domain, altKey }) {
    if (items.length === 0) {
      container.innerHTML = `<p class="chart-empty">${escapeHtml(t('chart.empty'))}</p>`;
      container.removeAttribute('aria-label');
      container.removeAttribute('role');
      return;
    }
    const [min, max] = domain;
    const span = max - min || 1;
    const zero = ((0 - min) / span) * 100;
    const hasNegative = min < 0;

    const rows = items
      .map((item) => {
        const pos = ((item.value - min) / span) * 100;
        const left = Math.min(zero, pos);
        const width = Math.abs(pos - zero);
        return `
        <div class="bar-row" data-tip="${escapeHtml(item.tip)}">
          <span class="bar-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
          <span class="bar-track">
            ${hasNegative ? `<span class="bar-zero" style="left:${zero}%"></span>` : ''}
            <span class="bar bar--${item.tone}${item.value < 0 ? ' bar--left' : ''}"
                  style="left:${left}%;width:${width}%"></span>
          </span>
          <span class="bar-value">${escapeHtml(item.display)}</span>
        </div>`;
      })
      .join('');

    container.innerHTML = rows;
    container.setAttribute('role', 'img');
    container.setAttribute(
      'aria-label',
      t(altKey, { items: items.map((i) => `${i.label}: ${i.display}`).join('; ') }),
    );
    // Wartości są widoczne przy słupkach; czytnik ekranu dostaje alternatywę tekstową całego wykresu.
    container.querySelectorAll('.bar-row').forEach((row) => row.setAttribute('aria-hidden', 'true'));
  }

  /** Jeden tooltip dla wszystkich wykresów (hover). */
  function attachTooltip(root, tooltip) {
    const show = (row) => {
      tooltip.textContent = row.dataset.tip;
      tooltip.hidden = false;
      const r = row.querySelector('.bar-track').getBoundingClientRect();
      const tw = tooltip.offsetWidth;
      const x = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 8);
      tooltip.style.left = `${x + window.scrollX}px`;
      tooltip.style.top = `${r.top + window.scrollY - tooltip.offsetHeight - 8}px`;
    };
    const hide = () => { tooltip.hidden = true; };
    root.addEventListener('pointerover', (e) => {
      const row = e.target.closest('.bar-row');
      if (row) show(row);
    });
    root.addEventListener('pointerout', (e) => {
      if (!e.relatedTarget?.closest?.('.bar-row')) hide();
    });
  }

  // ===================== app.js =====================
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
})();
