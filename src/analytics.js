// Zdarzenia analityczne bez kwot ani nazw kategorii — tylko typ zdarzenia i liczniki.
// Domyślnie trafiają do window.dataLayer (jeśli narzędzie analityczne go udostępnia).

const ALLOWED = new Set(['plan_created', 'plan_completed', 'category_added', 'export']);

export function track(event, props = {}) {
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
