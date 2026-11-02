import { RECIPE_PRODUCTS as RAW_PRODUCTS } from './recipeCatalog';

export type RecipeProduct = {
  name: string;
  brand?: string;
  category?: string;
  usage: string;
  recommendation: string;
};

export type RecipeCategory = {
  category: string;
  products: RecipeProduct[];
};

const DEFAULT_USAGE = 'Según indicación médica.';
const DEFAULT_RECOMMENDATION = 'Según indicación médica.';

export const RECIPE_PRODUCTS: RecipeProduct[] = RAW_PRODUCTS.map((product) => ({
  ...product,
  usage: DEFAULT_USAGE,
  recommendation: DEFAULT_RECOMMENDATION,
}));

export const RECIPE_BRANDS: string[] = [...new Set(RECIPE_PRODUCTS.map((product) => product.brand).filter((brand): brand is string => Boolean(brand)))].sort((a, b) => a.localeCompare(b, 'es'));

export const RECIPE_CATEGORIES: string[] = [...new Set(RECIPE_PRODUCTS.map((product) => product.category).filter((category): category is string => Boolean(category)))].sort((a, b) => a.localeCompare(b, 'es'));

export const RECIPE_CATALOG: RecipeCategory[] = RECIPE_CATEGORIES.map((category) => ({
  category,
  products: RECIPE_PRODUCTS.filter((product) => product.category === category),
}));

const BY_NAME = new Map(RECIPE_PRODUCTS.map((product) => [product.name, product]));

export function foldRecipeQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

type SearchRow = RecipeProduct & {
  foldedName: string;
  foldedBrand: string;
  foldedHaystack: string;
  nameWords: string[];
};

const SEARCH_INDEX: SearchRow[] = RECIPE_PRODUCTS.map((product) => {
  const foldedName = foldRecipeQuery(product.name);
  const foldedBrand = foldRecipeQuery(product.brand ?? '');
  const foldedCategory = foldRecipeQuery(product.category ?? '');
  return {
    ...product,
    foldedName,
    foldedBrand,
    foldedHaystack: `${foldedName}${foldedBrand}${foldedCategory}`,
    nameWords: product.name.split(/[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/).map(foldRecipeQuery).filter(Boolean),
  };
});

function queryTokens(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map(foldRecipeQuery)
    .filter(Boolean);
}

function matchesQuery(row: SearchRow, tokens: string[]): boolean {
  if (!tokens.length) return true;
  return tokens.every((token) => row.foldedHaystack.includes(token));
}

function rankMatch(row: SearchRow, tokens: string[], compact: string): number {
  let score = 0;
  if (compact && row.foldedName.startsWith(compact)) score += 120;
  else if (compact && row.foldedName.includes(compact)) score += 50;
  if (row.foldedBrand && tokens.some((token) => row.foldedBrand === token || row.foldedBrand.startsWith(token))) score += 30;
  for (const token of tokens) {
    if (row.nameWords.some((word) => word === token)) score += 24;
    else if (row.nameWords.some((word) => word.startsWith(token))) score += 16;
    const at = row.foldedName.indexOf(token);
    if (at === 0) score += 12;
    else if (at > 0) score += Math.max(0, 8 - Math.min(at, 8));
  }
  score -= Math.min(row.foldedName.length, 80) * 0.04;
  return score;
}

export function productsInCategory(category = '', brand = ''): RecipeProduct[] {
  return RECIPE_PRODUCTS.filter((product) => {
    if (category && product.category !== category) return false;
    if (brand && product.brand !== brand) return false;
    return true;
  });
}

export function categoriesForBrand(brand = ''): string[] {
  if (!brand) return RECIPE_CATEGORIES;
  const present = new Set(
    RECIPE_PRODUCTS.filter((product) => product.brand === brand && product.category).map((product) => product.category as string),
  );
  return RECIPE_CATEGORIES.filter((category) => present.has(category));
}

export function searchRecipeProducts(query: string, brand = '', category = '', limit = 12): { items: RecipeProduct[]; total: number } {
  if (!query.trim() && !brand && !category) return { items: [], total: 0 };
  const tokens = queryTokens(query);
  const compact = foldRecipeQuery(query);
  const matched = SEARCH_INDEX.filter((row) => {
    if (brand && row.brand !== brand) return false;
    if (category && row.category !== category) return false;
    return matchesQuery(row, tokens);
  });
  matched.sort((a, b) => rankMatch(b, tokens, compact) - rankMatch(a, tokens, compact));
  return { items: matched.slice(0, limit), total: matched.length };
}

export function findRecipeProduct(name: string): RecipeProduct | undefined {
  return BY_NAME.get(name);
}
