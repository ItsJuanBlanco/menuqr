const RESTAURANT_FEATURE_DEFS = [
  {
    id: 'meseros',
    label: 'Gestión de meseros',
    description: 'Tab Meseros, equipo activo y asignación de mesero en mesas y pedidos.',
  },
  {
    id: 'musica',
    label: 'Pedido de canciones',
    description: 'Botón en la carta del cliente y cola de música en el panel.',
  },
  {
    id: 'comisiones',
    label: 'Sistema de comisiones',
    description: 'Precio mesero en el menú y reporte de comisiones por ventas.',
  },
];

const LEGACY_COMMISSIONS_SLUG = 'donde-juanito';

function parseRestaurantFeatures(restaurant) {
  const raw = restaurant?.features;
  const hasStoredFeatures = raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length > 0;

  if (hasStoredFeatures) {
    return {
      meseros: raw.meseros === true,
      musica: raw.musica === true,
      comisiones: raw.comisiones === true,
    };
  }

  const slug = String(restaurant?.slug || RESTAURANTE_SLUG || '').trim();

  return {
    meseros: false,
    musica: restaurant?.musica_habilitada === true,
    comisiones: slug === LEGACY_COMMISSIONS_SLUG,
  };
}

function hasRestaurantFeature(restaurant, featureId) {
  return parseRestaurantFeatures(restaurant)[featureId] === true;
}

function buildRestaurantFeaturesPayload(flags) {
  const features = {
    meseros: flags.meseros === true,
    musica: flags.musica === true,
    comisiones: flags.comisiones === true,
  };

  return {
    features,
    musica_habilitada: features.musica,
  };
}

function readRestaurantFeatureFlagsFromForm(container) {
  const flags = {};
  RESTAURANT_FEATURE_DEFS.forEach((def) => {
    const input = container.querySelector(`[data-feature="${def.id}"]`);
    flags[def.id] = input?.checked === true;
  });
  return flags;
}

function applyRestaurantFeaturesVisibility() {
  const restaurant = typeof RESTAURANTE !== 'undefined' ? RESTAURANTE : null;
  if (!restaurant) return;

  const flags = parseRestaurantFeatures(restaurant);
  const isPanelAdmin = window.PANEL_ACCESS_ROLE === 'admin';

  const tabMeseros = document.getElementById('tabMeseros');
  if (tabMeseros) tabMeseros.hidden = !flags.meseros || !isPanelAdmin;

  if (!flags.meseros && typeof activePanel !== 'undefined' && activePanel === 'meseros') {
    switchPanel('pedidos');
  }

  document.body.classList.toggle('restaurant-feature-meseros', flags.meseros);
  document.body.classList.toggle('restaurant-feature-comisiones', flags.comisiones);
  document.body.classList.toggle('restaurant-feature-musica', flags.musica);

  if (typeof applyMusicPanelVisibility === 'function') applyMusicPanelVisibility();
  if (typeof applyMeserosCommissionsVisibility === 'function') applyMeserosCommissionsVisibility();
  if (typeof updateProductMeseroPriceFieldVisibility === 'function') {
    updateProductMeseroPriceFieldVisibility();
  }
  if (typeof updateNewOrderMeseroFieldVisibility === 'function') {
    updateNewOrderMeseroFieldVisibility();
  }
  if (typeof renderMesas === 'function' && document.getElementById('mesasList')) {
    renderMesas();
  }
}

function updateNewOrderMeseroFieldVisibility() {
  const enabled = hasRestaurantFeature(RESTAURANTE, 'meseros');
  const select = document.getElementById('newOrderMeseroSelect');
  const text = document.getElementById('newOrderMeseroText');
  const label = select?.closest('.new-order-card__field') || text?.closest('.new-order-card__field');

  if (label) label.hidden = !enabled;
  if (!enabled) {
    if (select) {
      select.hidden = true;
      select.innerHTML = '';
    }
    if (text) {
      text.hidden = true;
      text.value = '';
    }
  }
}
