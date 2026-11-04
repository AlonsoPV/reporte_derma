const KEY = 'dermaops-recipe-product-prefs';
const MAX_ENTRIES = 400;

export type RecipeProductPref = {
  usage: string;
  recommendation: string;
  updatedAt: number;
};

type PrefStore = Record<string, RecipeProductPref>;

function readStore(): PrefStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PrefStore;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeStore(store: PrefStore) {
  const entries = Object.entries(store)
    .filter(([, value]) => value?.usage?.trim() && value?.recommendation?.trim())
    .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
    .slice(0, MAX_ENTRIES);
  localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
}

export function getRecipeProductPref(productName: string): RecipeProductPref | null {
  const key = productName.trim();
  if (!key) return null;
  const entry = readStore()[key];
  if (!entry?.usage?.trim() || !entry?.recommendation?.trim()) return null;
  return entry;
}

export function saveRecipeProductPref(productName: string, usage: string, recommendation: string) {
  const key = productName.trim();
  const nextUsage = usage.trim();
  const nextRecommendation = recommendation.trim();
  if (!key || !nextUsage || !nextRecommendation) return;
  const store = readStore();
  store[key] = {
    usage: nextUsage,
    recommendation: nextRecommendation,
    updatedAt: Date.now(),
  };
  writeStore(store);
}
