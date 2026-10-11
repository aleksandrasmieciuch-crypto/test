// Arytmetyka dziesiętna na stałej skali (BigInt), bez błędów float.
// Wartość jest przechowywana jako liczba całkowita pomnożona przez 10^SCALE.
// Dane wejściowe mają maks. 2 miejsca po przecinku, więc mnożenia
// B · u/100 · r/100 mieszczą się w 12 miejscach bez utraty precyzji.

export const SCALE = 12;
const ONE = 10n ** BigInt(SCALE);
export const ZERO = 0n;
export const HUNDRED = 100n * ONE;

/**
 * Parsuje tekst liczby w formacie pl-PL lub z kropką ("100 000,50", "100000.5", "-5").
 * Zwraca { value, decimals } albo null, gdy tekst nie jest liczbą.
 */
export function parseDecimal(input) {
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

export function fromInt(n) {
  return BigInt(n) * ONE;
}

export function mul(a, b) {
  return roundDiv(a * b, ONE);
}

export function div(a, b) {
  if (b === 0n) throw new RangeError('Dzielenie przez zero');
  return roundDiv(a * ONE, b);
}

export function abs(a) {
  return a < 0n ? -a : a;
}

export function sum(values) {
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
export function toParts(a, dp) {
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
export function toNumber(a) {
  return Number(a) / Number(ONE);
}
