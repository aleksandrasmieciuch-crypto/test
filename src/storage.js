const KEY = 'roi-budget-plan:v1';

/** Odczyt planu z localStorage; null, gdy brak lub storage niedostępny. */
export function loadPlan(storage = globalThis.localStorage) {
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
          id: String(c.id ?? crypto.randomUUID()),
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
export function savePlan(plan, status, storage = globalThis.localStorage) {
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
