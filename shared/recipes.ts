export type RecipeProduct = {
  name: string;
  usage: string;
  recommendation: string;
};

export type RecipeCategory = {
  category: string;
  products: RecipeProduct[];
};

/** Catálogo provisional. Se sustituye cuando la clínica entregue productos, categoría, uso y recomendación. */
export const RECIPE_CATALOG: RecipeCategory[] = [
  {
    category: 'Hidratación',
    products: [
      {
        name: 'Crema hidratante',
        usage: 'Mañana y noche, sobre la piel limpia.',
        recommendation: 'Aplicar una capa delgada. Ejemplo hasta recibir el catálogo de la clínica.',
      },
      {
        name: 'Sérum hidratante',
        usage: 'Por la noche, antes de la crema.',
        recommendation: 'Dos a tres gotas en rostro y cuello. Ejemplo hasta recibir el catálogo de la clínica.',
      },
    ],
  },
  {
    category: 'Limpieza',
    products: [
      {
        name: 'Agua micelar',
        usage: 'Mañana y noche, con algodón, sin enjuagar.',
        recommendation: 'Retirar el maquillaje antes del gel. Ejemplo hasta recibir el catálogo de la clínica.',
      },
      {
        name: 'Gel limpiador',
        usage: 'Noche, sobre piel húmeda. Masajear y enjuagar.',
        recommendation: 'Usar a diario. Suspender si hay irritación. Ejemplo hasta recibir el catálogo de la clínica.',
      },
    ],
  },
  {
    category: 'Protección solar',
    products: [
      {
        name: 'Protector solar facial',
        usage: 'Cada mañana, como último paso de la rutina. Reaplicar si hay sol directo.',
        recommendation: 'Una cucharadita para rostro y cuello. Ejemplo hasta recibir el catálogo de la clínica.',
      },
    ],
  },
];

export function productsInCategory(category: string): RecipeProduct[] {
  return RECIPE_CATALOG.find((entry) => entry.category === category)?.products ?? [];
}

export function findRecipeProduct(category: string, name: string): RecipeProduct | undefined {
  return productsInCategory(category).find((product) => product.name === name);
}
