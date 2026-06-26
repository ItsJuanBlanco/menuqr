function sortCategoryNames(names, orderRows = []) {
  const orderMap = new Map(orderRows.map((row) => [row.categoria, row.orden]));

  return [...names].sort((a, b) => {
    const orderA = orderMap.has(a) ? orderMap.get(a) : Number.MAX_SAFE_INTEGER;
    const orderB = orderMap.has(b) ? orderMap.get(b) : Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b, 'es');
  });
}

function sortCategoryObjects(categories, orderRows = []) {
  const orderMap = new Map(orderRows.map((row) => [row.categoria, row.orden]));

  return [...categories].sort((a, b) => {
    const orderA = orderMap.has(a.name) ? orderMap.get(a.name) : Number.MAX_SAFE_INTEGER;
    const orderB = orderMap.has(b.name) ? orderMap.get(b.name) : Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name, 'es');
  });
}

async function fetchCategoryOrder(client, restauranteId) {
  if (!client || !restauranteId) return [];

  const { data, error } = await client
    .from('categorias_orden')
    .select('id, categoria, orden')
    .eq('restaurante_id', restauranteId)
    .order('orden', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function saveCategoryOrder(client, restauranteId, categoryNames) {
  if (!client || !restauranteId) return;

  const { error: deleteError } = await client
    .from('categorias_orden')
    .delete()
    .eq('restaurante_id', restauranteId);

  if (deleteError) throw deleteError;

  if (!categoryNames.length) return;

  const rows = categoryNames.map((categoria, index) => ({
    restaurante_id: restauranteId,
    categoria,
    orden: index,
  }));

  const { error: insertError } = await client.from('categorias_orden').insert(rows);
  if (insertError) throw insertError;
}
