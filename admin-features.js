let expandedRestaurantId = null;
let featureSaveBusy = new Set();

function renderAdminFeaturePanel(restaurant) {
  const flags = parseRestaurantFeatures(restaurant);
  const busy = featureSaveBusy.has(restaurant.id);
  const activeDrawerTab = adminRestaurantDrawerTab[restaurant.id] || 'features';

  const toggles = RESTAURANT_FEATURE_DEFS.map(
    (def) => `
      <label class="admin-feature-toggle">
        <input
          type="checkbox"
          data-feature="${def.id}"
          data-restaurant-id="${restaurant.id}"
          ${flags[def.id] ? 'checked' : ''}
          ${busy ? 'disabled' : ''}
        >
        <span class="admin-feature-toggle__ui" aria-hidden="true"></span>
        <span class="admin-feature-toggle__copy">
          <strong class="admin-feature-toggle__label">${escapeHtml(def.label)}</strong>
          <span class="admin-feature-toggle__desc">${escapeHtml(def.description)}</span>
        </span>
      </label>
    `
  ).join('');

  const activeList = RESTAURANT_FEATURE_DEFS.filter((def) => flags[def.id])
    .map((def) => def.label)
    .join(' · ');

  const featuresPanel = `
    <div class="admin-restaurant-drawer__panel${activeDrawerTab === 'features' ? ' admin-restaurant-drawer__panel--active' : ''}" data-drawer-panel="features" role="tabpanel" ${activeDrawerTab === 'features' ? '' : 'hidden'}>
      <p class="admin-restaurant-drawer__hint">
        Activá o desactivá módulos para <strong>${escapeHtml(restaurant.nombre || 'este local')}</strong>.
        Los cambios aplican al panel y a la carta del cliente.
      </p>
      <div class="admin-feature-list">${toggles}</div>
      <p class="admin-restaurant-drawer__summary">
        Activas: ${activeList ? escapeHtml(activeList) : 'ninguna'}
      </p>
      <p class="admin-restaurant-drawer__status" id="adminFeatureStatus-${restaurant.id}" hidden role="status"></p>
    </div>
  `;

  const suscripcionPanel =
    typeof renderAdminSubscriptionPanel === 'function'
      ? `
    <div class="admin-restaurant-drawer__panel${activeDrawerTab === 'suscripcion' ? ' admin-restaurant-drawer__panel--active' : ''}" data-drawer-panel="suscripcion" role="tabpanel" ${activeDrawerTab === 'suscripcion' ? '' : 'hidden'}>
      ${renderAdminSubscriptionPanel(restaurant)}
    </div>
  `
      : '';

  const cartaIaPanel =
    typeof renderAdminMenuAiPanel === 'function'
      ? `
    <div class="admin-restaurant-drawer__panel${activeDrawerTab === 'carta-ia' ? ' admin-restaurant-drawer__panel--active' : ''}" data-drawer-panel="carta-ia" role="tabpanel" ${activeDrawerTab === 'carta-ia' ? '' : 'hidden'}>
      ${renderAdminMenuAiPanel(restaurant)}
    </div>
  `
      : '';

  return `
    <div class="admin-restaurant-drawer" data-restaurant-drawer="${restaurant.id}">
      <nav class="admin-restaurant-drawer__tabs" role="tablist" aria-label="Secciones del local">
        <button
          type="button"
          class="admin-restaurant-drawer__tab${activeDrawerTab === 'features' ? ' admin-restaurant-drawer__tab--active' : ''}"
          data-drawer-tab="features"
          data-restaurant-id="${restaurant.id}"
          role="tab"
          aria-selected="${activeDrawerTab === 'features' ? 'true' : 'false'}"
        >Features</button>
        <button
          type="button"
          class="admin-restaurant-drawer__tab${activeDrawerTab === 'suscripcion' ? ' admin-restaurant-drawer__tab--active' : ''}"
          data-drawer-tab="suscripcion"
          data-restaurant-id="${restaurant.id}"
          role="tab"
          aria-selected="${activeDrawerTab === 'suscripcion' ? 'true' : 'false'}"
        >Suscripción</button>
        <button
          type="button"
          class="admin-restaurant-drawer__tab${activeDrawerTab === 'carta-ia' ? ' admin-restaurant-drawer__tab--active' : ''}"
          data-drawer-tab="carta-ia"
          data-restaurant-id="${restaurant.id}"
          role="tab"
          aria-selected="${activeDrawerTab === 'carta-ia' ? 'true' : 'false'}"
        >📸 Carta IA</button>
      </nav>
      ${featuresPanel}
      ${suscripcionPanel}
      ${cartaIaPanel}
    </div>
  `;
}

function setAdminFeatureStatus(restaurantId, message, tone = '') {
  const el = document.getElementById(`adminFeatureStatus-${restaurantId}`);
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    el.className = 'admin-restaurant-drawer__status';
    return;
  }
  el.hidden = false;
  el.textContent = message;
  el.className = 'admin-restaurant-drawer__status' + (tone ? ` admin-restaurant-drawer__status--${tone}` : '');
}

async function saveRestaurantFeatures(restaurantId, flags) {
  if (featureSaveBusy.has(restaurantId)) return null;

  featureSaveBusy.add(restaurantId);
  setAdminFeatureStatus(restaurantId, 'Guardando…');

  try {
    const client = assertSupabaseClient();
    const payload = buildRestaurantFeaturesPayload(flags);
    const { data, error } = await client
      .from('restaurantes')
      .update(payload)
      .eq('id', restaurantId)
      .select('id, slug, features, musica_habilitada')
      .single();

    if (error) throw error;

    const index = restaurants.findIndex((entry) => entry.id === restaurantId);
    if (index >= 0) {
      restaurants[index] = { ...restaurants[index], ...data };
    }

    setAdminFeatureStatus(restaurantId, 'Features actualizadas', 'success');
    setTimeout(() => setAdminFeatureStatus(restaurantId, ''), 2200);
    return data;
  } catch (error) {
    console.error(error);
    setAdminFeatureStatus(restaurantId, error.message || 'No se pudieron guardar las features.', 'error');
    showToast(error.message || 'No se pudieron guardar las features.', 'error');
    return null;
  } finally {
    featureSaveBusy.delete(restaurantId);
    renderRestaurants();
  }
}

function toggleRestaurantDrawer(restaurantId) {
  expandedRestaurantId = expandedRestaurantId === restaurantId ? null : restaurantId;
  if (expandedRestaurantId === restaurantId && adminRestaurantDrawerTab[restaurantId] === 'carta-ia') {
    void openAdminMenuAiSection(restaurantId);
    return;
  }
  renderRestaurants();
}

function bindAdminFeatureToggles() {
  const list = document.getElementById('adminRestaurantList');
  if (!list || list.dataset.featuresBound) return;
  list.dataset.featuresBound = 'true';

  list.addEventListener('click', (event) => {
    const nameBtn = event.target.closest('[data-action="toggle-restaurant-drawer"]');
    if (nameBtn) {
      toggleRestaurantDrawer(nameBtn.dataset.id);
      return;
    }

    const featureInput = event.target.closest('[data-feature]');
    if (!featureInput || featureInput.disabled) return;

    const restaurantId = featureInput.dataset.restaurantId;
    const drawer = featureInput.closest('[data-restaurant-drawer]');
    if (!restaurantId || !drawer) return;

    const flags = readRestaurantFeatureFlagsFromForm(drawer);
    void saveRestaurantFeatures(restaurantId, flags);
  });
}

function initAdminFeatures() {
  bindAdminFeatureToggles();
}

document.addEventListener('DOMContentLoaded', initAdminFeatures);
