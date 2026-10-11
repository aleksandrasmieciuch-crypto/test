import pl from './pl.js';

const catalogs = { pl };
let messages = catalogs.pl;

export function setLocale(locale) {
  messages = catalogs[locale] ?? catalogs.pl;
}

/** Zwraca przetłumaczony tekst; `{param}` zastępowane wartościami z `params`. */
export function t(key, params = {}) {
  const template = messages[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => (name in params ? String(params[name]) : `{${name}}`));
}
