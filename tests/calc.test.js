import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePlan, distributeRemainder, validateBudget, validateName, validateRoi, validateShare } from '../src/calc.js';
import { fromInt, parseDecimal } from '../src/decimal.js';
import { formatMoney, formatPercent, formatInput } from '../src/format.js';

const plan = (budget, cats) => ({
  budget,
  categories: cats.map(([name, share, roi], i) => ({ id: String(i), name, share, roi })),
});

test('przykład z PRD: budżet 100 000 PLN → zysk 16 500, ROI 16,5%', () => {
  const r = computePlan(plan('100 000', [['SEO', '40', '25'], ['Ads', '35', '15'], ['Eventy', '25', '5']]));
  assert.equal(r.status, 'complete');
  assert.equal(r.isComplete, true);
  assert.equal(formatMoney(r.rows[0].amount, 'PLN'), '40 000 PLN');
  assert.equal(formatMoney(r.rows[1].profit, 'PLN'), '5 250 PLN');
  assert.equal(formatMoney(r.rows[2].final, 'PLN'), '26 250 PLN');
  assert.equal(formatMoney(r.totals.amount, 'PLN'), '100 000 PLN');
  assert.equal(formatMoney(r.totals.profit, 'PLN'), '16 500 PLN');
  assert.equal(formatMoney(r.totals.final, 'PLN'), '116 500 PLN');
  assert.equal(formatPercent(r.totals.roi), '16,5%');
});

test('obliczenia dziesiętne bez błędów float (0,1 + 0,2)', () => {
  const r = computePlan(plan('0,3', [['A', '33,33', '0,1'], ['B', '66,67', '0,2']]));
  // 0,3·0,3333 = 0,09999; 0,3·0,6667 = 0,20001 → suma dokładnie 0,3
  assert.equal(r.totals.amount, fromInt(3) / 10n);
  assert.equal(r.status, 'complete');
});

test('statusy: niekompletny, przekroczony, pusty', () => {
  const inc = computePlan(plan('1000', [['A', '60', '10']]));
  assert.equal(inc.status, 'incomplete');
  assert.equal(formatMoney(inc.totals.unallocated, 'PLN'), '400 PLN');
  assert.equal(formatPercent(inc.totals.remainingShare), '40%');

  const over = computePlan(plan('1000', [['A', '60', '10'], ['B', '50', '10']]));
  assert.equal(over.status, 'over');
  assert.equal(over.isComplete, false);
  assert.equal(formatMoney(-over.totals.unallocated, 'PLN'), '100 PLN');

  assert.equal(computePlan(plan('1000', [])).status, 'empty');
});

test('ujemny ROI i ROI −100%', () => {
  const r = computePlan(plan('1000', [['A', '50', '-100'], ['B', '50', '-20']]));
  assert.equal(formatMoney(r.rows[0].final, 'PLN'), '0 PLN');
  assert.equal(formatMoney(r.totals.profit, 'PLN'), '−600 PLN');
  assert.equal(formatPercent(r.totals.roi), '−60%');
});

test('błędne pola nie wchodzą do sum i blokują stan kompletny', () => {
  const r = computePlan(plan('1000', [['A', '50', '-150'], ['A', '50', '10']]));
  assert.equal(r.errors.categories['0'].roi, 'roi.min');
  assert.equal(r.errors.categories['1'].name, 'name.duplicate');
  assert.equal(r.rows[0].amount, null);
  assert.equal(r.status, 'complete');
  assert.equal(r.isComplete, false);
});

test('walidacja budżetu', () => {
  assert.equal(validateBudget('').error, 'budget.required');
  assert.equal(validateBudget('abc').error, 'budget.invalid');
  assert.equal(validateBudget('0').error, 'budget.min');
  assert.equal(validateBudget('-5').error, 'budget.min');
  assert.equal(validateBudget('10,123').error, 'budget.decimals');
  assert.equal(validateBudget('1000000000000,01').error, 'budget.max');
  assert.equal(validateBudget('1 000 000 000 000').error, undefined);
  assert.equal(validateBudget('1 234,5').value, parseDecimal('1234.5').value);
});

test('walidacja udziału, ROI i nazwy', () => {
  assert.equal(validateShare('100,01').error, 'share.range');
  assert.equal(validateShare('-1').error, 'share.range');
  assert.equal(validateShare('12,345').error, 'share.decimals');
  assert.equal(validateShare('0').error, undefined);
  assert.equal(validateRoi('-100').error, undefined);
  assert.equal(validateRoi('-100,01').error, 'roi.min');
  assert.equal(validateRoi('1000,01').error, 'roi.max');
  assert.equal(validateRoi('−50').error, undefined);
  assert.equal(validateName('   ').error, 'name.required');
  assert.equal(validateName('x'.repeat(51)).error, 'name.max');
  assert.equal(validateName(' seo ', ['SEO']).error, 'name.duplicate');
  assert.equal(validateName('SEO', ['Ads']).value, 'SEO');
});

test('rozdziel resztę dopisuje brakujące punkty procentowe', () => {
  const r = computePlan(plan('1000', [['A', '33,33', '0'], ['B', '33,33', '0']]));
  assert.equal(formatInput(distributeRemainder('33,33', r.totals.remainingShare)), '66,67');
});

test('formatowanie pl-PL', () => {
  assert.equal(formatMoney(parseDecimal('1234567.891').value, 'EUR'), '1 234 567,89 EUR');
  assert.equal(formatMoney(parseDecimal('0.005').value, 'PLN'), '0,01 PLN');
  assert.equal(formatPercent(parseDecimal('12.50').value), '12,5%');
});
