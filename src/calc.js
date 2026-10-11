import { HUNDRED, ZERO, abs, div, fromInt, mul, parseDecimal, sum } from './decimal.js';

export const LIMITS = {
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

export function validateBudget(raw) {
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

export function validateShare(raw) {
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

export function validateRoi(raw) {
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

export function normalizeName(name) {
  return String(name ?? '').trim().toLocaleLowerCase('pl-PL');
}

export function validateName(name, otherNames = []) {
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
export function computePlan(plan) {
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
export function distributeRemainder(currentShare, remainingShare) {
  const share = validateShare(currentShare).value ?? ZERO;
  return share + remainingShare;
}
