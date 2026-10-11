import { toParts } from './decimal.js';

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
export function formatMoney(value, currency) {
  if (value == null) return '—';
  const parts = toParts(value, 2);
  if (parts.fracPart === '00') parts.fracPart = '';
  return render(parts) + NBSP + currency;
}

/** Procent: do 2 miejsc po przecinku, bez zbędnych zer. */
export function formatPercent(value) {
  if (value == null) return '—';
  const parts = toParts(value, 2);
  parts.fracPart = parts.fracPart.replace(/0+$/, '');
  return render(parts) + '%';
}

/** Tekst do pola edycji (bez separatorów tysięcy, z przecinkiem). */
export function formatInput(value) {
  const parts = toParts(value, 2);
  parts.fracPart = parts.fracPart.replace(/0+$/, '');
  return (parts.negative ? '-' : '') + parts.intPart + (parts.fracPart ? ',' + parts.fracPart : '');
}
