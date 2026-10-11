import { t } from './i18n/index.js';

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

/**
 * Poziomy wykres słupkowy w HTML (czytelny na telefonie, bez skalowania tekstu).
 * items: [{ label, value: Number, display: string, tip: string, tone: 'pos'|'neg'|'muted' }]
 * domain: [min, max] — zakres osi; 0 zawsze jest linią bazową.
 */
export function renderBarChart(container, { items, domain, altKey }) {
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
export function attachTooltip(root, tooltip) {
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
