const ADMIN_SESSION_KEY = 'menuqr:adminSession';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';
const DEFAULT_MESAS_COUNT = 5;

let restaurants = [];
let slugManuallyEdited = false;
let busyIds = new Set();
let restaurantModalMode = 'create';

function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'panel-toast panel-toast--visible' + (type ? ` panel-toast--${type}` : '');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('panel-toast--visible'), 3200);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function slugifyName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(isoString));
}

function isAdminLoggedIn() {
  return localStorage.getItem(ADMIN_SESSION_KEY) === 'true';
}

function setAdminLoggedIn() {
  localStorage.setItem(ADMIN_SESSION_KEY, 'true');
}

function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

function showLogin() {
  document.getElementById('adminLogin')?.removeAttribute('hidden');
  document.getElementById('adminApp')?.setAttribute('hidden', '');
}

function showAdminApp(username) {
  document.getElementById('adminLogin')?.setAttribute('hidden', '');
  document.getElementById('adminApp')?.removeAttribute('hidden');
  const label = document.getElementById('adminUserLabel');
  if (label) label.textContent = username;
}

function setLoginError(message) {
  const errorEl = document.getElementById('adminLoginError');
  if (!errorEl) return;
  if (message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

function assertSupabaseClient() {
  if (typeof supabase === 'undefined') {
    throw new Error('No se cargó la librería de Supabase. Verificá el CDN en admin.html.');
  }
  if (!supabaseClient) {
    throw new Error('No se inicializó supabaseClient. Verificá que config.js cargue antes de admin.js.');
  }
  return supabaseClient;
}

function checkAdminCredentials(username, password) {
  return String(username || '').trim() === ADMIN_USER && password === ADMIN_PASS;
}

async function loginAdmin(username, password) {
  if (!checkAdminCredentials(username, password)) {
    setLoginError('Usuario o contraseña incorrectos.');
    return false;
  }

  setAdminLoggedIn();
  setLoginError('');
  showAdminApp(ADMIN_USER);
  await loadRestaurants();
  return true;
}

async function restoreSession() {
  if (!isAdminLoggedIn()) return false;

  showAdminApp(ADMIN_USER);
  try {
    await loadRestaurants();
    return true;
  } catch (error) {
    console.error(error);
    clearAdminSession();
    showLogin();
    setLoginError(error.message || 'No se pudo conectar con Supabase.');
    return false;
  }
}

async function loadRestaurants() {
  const loading = document.getElementById('adminLoading');
  const empty = document.getElementById('adminEmpty');
  const wrap = document.getElementById('adminTableWrap');

  loading.hidden = false;
  empty.hidden = true;
  wrap.hidden = true;

  try {
    const client = assertSupabaseClient();
    const { data, error } = await client
      .from('restaurantes')
      .select('id, nombre, slug, ciudad, email, activo, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    restaurants = data || [];
    renderRestaurants();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudieron cargar los restaurantes.', 'error');
  } finally {
    loading.hidden = true;
  }
}

function renderRestaurants() {
  const list = document.getElementById('adminRestaurantList');
  const empty = document.getElementById('adminEmpty');
  const wrap = document.getElementById('adminTableWrap');
  const countEl = document.getElementById('adminRestaurantCount');

  if (countEl) {
    countEl.textContent = `${restaurants.length} restaurante${restaurants.length !== 1 ? 's' : ''}`;
  }

  if (!list) return;

  if (restaurants.length === 0) {
    list.innerHTML = '';
    empty.hidden = false;
    wrap.hidden = true;
    return;
  }

  empty.hidden = true;
  wrap.hidden = false;

  list.innerHTML = restaurants
    .map((restaurant) => {
      const isActive = restaurant.activo !== false;
      const busy = busyIds.has(restaurant.id);

      return `
        <tr>
          <td>
            <div class="admin-table__name">${escapeHtml(restaurant.nombre || '—')}</div>
            <div class="admin-table__slug">${escapeHtml(restaurant.email || '')}</div>
          </td>
          <td><span class="admin-table__slug">/${escapeHtml(restaurant.slug || '')}</span></td>
          <td>${escapeHtml(restaurant.ciudad || '—')}</td>
          <td>
            <span class="admin-badge ${isActive ? 'admin-badge--active' : 'admin-badge--inactive'}">
              ${isActive ? 'Activo' : 'Inactivo'}
            </span>
          </td>
          <td>${formatDate(restaurant.created_at)}</td>
          <td>
            <div class="admin-actions">
              <button
                type="button"
                class="admin-action-btn admin-action-btn--edit"
                data-action="edit-restaurant"
                data-id="${restaurant.id}"
                ${busy ? 'disabled' : ''}
              >Editar</button>
              <button
                type="button"
                class="admin-action-btn admin-action-btn--primary"
                data-action="open-panel"
                data-slug="${escapeHtml(restaurant.slug)}"
                ${busy ? 'disabled' : ''}
              >Ver panel</button>
              <button
                type="button"
                class="admin-action-btn ${isActive ? 'admin-action-btn--danger' : ''}"
                data-action="toggle-active"
                data-id="${restaurant.id}"
                data-active="${isActive ? '1' : '0'}"
                ${busy ? 'disabled' : ''}
              >${isActive ? 'Desactivar' : 'Activar'}</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function buildRestaurantPanelUrl(slug) {
  return buildLoginUrl(slug);
}

function openRestaurantPanel(slug) {
  if (!slug) return;
  window.open(buildRestaurantPanelUrl(slug), '_blank', 'noopener,noreferrer');
}

async function toggleRestaurantActive(restaurantId, currentlyActive) {
  if (busyIds.has(restaurantId)) return;

  busyIds.add(restaurantId);
  renderRestaurants();

  try {
    const client = assertSupabaseClient();
    const { error } = await client
      .from('restaurantes')
      .update({ activo: !currentlyActive })
      .eq('id', restaurantId);

    if (error) throw error;

    const restaurant = restaurants.find((r) => r.id === restaurantId);
    if (restaurant) restaurant.activo = !currentlyActive;

    showToast(
      currentlyActive ? 'Restaurante desactivado' : 'Restaurante activado',
      'success'
    );
    renderRestaurants();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo actualizar el estado.', 'error');
  } finally {
    busyIds.delete(restaurantId);
    renderRestaurants();
  }
}

function setRestaurantFormError(message) {
  const errorEl = document.getElementById('restaurantFormError');
  if (!errorEl) return;
  if (message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

function readRestaurantFormValues() {
  return {
    nombre: document.getElementById('restaurantName')?.value?.trim(),
    slug: slugifyName(document.getElementById('restaurantSlug')?.value?.trim()),
    ciudad: document.getElementById('restaurantCity')?.value?.trim(),
    email: normalizeEmail(document.getElementById('restaurantEmail')?.value),
    pin_mesero: document.getElementById('restaurantPinMesero')?.value?.trim(),
    pin_admin: document.getElementById('restaurantPinAdmin')?.value?.trim(),
  };
}

function validateRestaurantFormValues(values) {
  if (!values.nombre || !values.ciudad || !values.email || !values.pin_mesero || !values.pin_admin) {
    return 'Completá todos los campos.';
  }

  if (restaurantModalMode === 'create' && !values.slug) {
    return 'Completá todos los campos.';
  }

  if (values.pin_mesero.length < 4 || values.pin_admin.length < 4) {
    return 'Los PIN deben tener al menos 4 caracteres.';
  }

  return '';
}

function openNewRestaurantModal() {
  restaurantModalMode = 'create';
  slugManuallyEdited = false;

  const form = document.getElementById('restaurantForm');
  form?.reset();
  document.getElementById('restaurantId').value = '';
  document.getElementById('restaurantModalTitle').textContent = 'Nuevo restaurante';
  document.getElementById('restaurantSubmitBtn').textContent = 'Guardar restaurante';
  document.getElementById('restaurantFormNote').textContent =
    'Se crearán automáticamente 5 mesas (Mesa 1–5).';

  const slugInput = document.getElementById('restaurantSlug');
  if (slugInput) {
    slugInput.disabled = false;
    slugInput.required = true;
  }

  setRestaurantFormError('');
  updateSlugPreview('');
  openRestaurantModal();
  document.getElementById('restaurantName')?.focus();
}

async function openEditRestaurantModal(restaurantId) {
  if (busyIds.has(restaurantId)) return;

  restaurantModalMode = 'edit';
  slugManuallyEdited = true;
  busyIds.add(restaurantId);
  renderRestaurants();

  try {
    const client = assertSupabaseClient();
    const { data, error } = await client
      .from('restaurantes')
      .select('id, nombre, slug, ciudad, email, pin_mesero, pin_admin')
      .eq('id', restaurantId)
      .single();

    if (error) throw error;
    if (!data) throw new Error('Restaurante no encontrado.');

    document.getElementById('restaurantId').value = data.id;
    document.getElementById('restaurantName').value = data.nombre || '';
    document.getElementById('restaurantSlug').value = data.slug || '';
    document.getElementById('restaurantCity').value = data.ciudad || '';
    document.getElementById('restaurantEmail').value = data.email || '';
    document.getElementById('restaurantPinMesero').value = data.pin_mesero || '';
    document.getElementById('restaurantPinAdmin').value = data.pin_admin || '';

    document.getElementById('restaurantModalTitle').textContent = `Editar · ${data.nombre || 'Restaurante'}`;
    document.getElementById('restaurantSubmitBtn').textContent = 'Guardar cambios';
    document.getElementById('restaurantFormNote').textContent =
      'El slug no se puede cambiar. Actualizá los PIN si el restaurante necesita nuevos accesos.';

    const slugInput = document.getElementById('restaurantSlug');
    if (slugInput) {
      slugInput.disabled = true;
      slugInput.required = false;
    }

    updateSlugPreview(data.slug || '');
    setRestaurantFormError('');
    openRestaurantModal();
    document.getElementById('restaurantPinMesero')?.focus();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo cargar el restaurante.', 'error');
  } finally {
    busyIds.delete(restaurantId);
    renderRestaurants();
  }
}

function openRestaurantModal() {
  const modal = document.getElementById('restaurantModal');
  modal?.removeAttribute('hidden');
  modal?.setAttribute('aria-hidden', 'false');
}

function closeRestaurantModal() {
  const modal = document.getElementById('restaurantModal');
  modal?.setAttribute('hidden', '');
  modal?.setAttribute('aria-hidden', 'true');
  restaurantModalMode = 'create';
  setRestaurantFormError('');
}

function updateSlugPreview(slug) {
  const preview = document.getElementById('slugPreview');
  if (preview) preview.textContent = slug || 'slug';
}

async function createRestaurant({ nombre, slug, ciudad, email, pin_mesero, pin_admin }) {
  const client = assertSupabaseClient();

  const { data: restaurant, error: restaurantError } = await client
    .from('restaurantes')
    .insert({
      nombre,
      slug,
      ciudad,
      email,
      pin_mesero,
      pin_admin,
      activo: true,
    })
    .select('id, nombre, slug, ciudad, email, activo, created_at')
    .single();

  if (restaurantError) throw restaurantError;

  const mesas = Array.from({ length: DEFAULT_MESAS_COUNT }, (_, index) => ({
    restaurante_id: restaurant.id,
    numero: index + 1,
    estado: 'libre',
    mesero_requerido: false,
  }));

  const { error: mesasError } = await client.from('mesas').insert(mesas);
  if (mesasError) {
    await client.from('restaurantes').delete().eq('id', restaurant.id);
    throw mesasError;
  }

  return restaurant;
}

async function updateRestaurant(restaurantId, { nombre, ciudad, email, pin_mesero, pin_admin }) {
  const client = assertSupabaseClient();

  const { data, error } = await client
    .from('restaurantes')
    .update({
      nombre,
      ciudad,
      email,
      pin_mesero,
      pin_admin,
    })
    .eq('id', restaurantId)
    .select('id, nombre, slug, ciudad, email, activo, created_at')
    .single();

  if (error) throw error;
  return data;
}

function bindRestaurantListActions() {
  const list = document.getElementById('adminRestaurantList');
  if (!list || list.dataset.bound) return;
  list.dataset.bound = 'true';

  list.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;

    if (btn.dataset.action === 'open-panel') {
      openRestaurantPanel(btn.dataset.slug);
      return;
    }

    if (btn.dataset.action === 'edit-restaurant') {
      openEditRestaurantModal(btn.dataset.id);
      return;
    }

    if (btn.dataset.action === 'toggle-active') {
      toggleRestaurantActive(btn.dataset.id, btn.dataset.active === '1');
    }
  });
}

function bindRestaurantModal() {
  const modal = document.getElementById('restaurantModal');
  const form = document.getElementById('restaurantForm');
  const nameInput = document.getElementById('restaurantName');
  const slugInput = document.getElementById('restaurantSlug');
  const submitBtn = document.getElementById('restaurantSubmitBtn');

  modal?.querySelectorAll('[data-close-restaurant-modal]').forEach((el) => {
    el.addEventListener('click', closeRestaurantModal);
  });

  nameInput?.addEventListener('input', () => {
    if (restaurantModalMode !== 'create' || slugManuallyEdited) return;
    const slug = slugifyName(nameInput.value);
    if (slugInput) slugInput.value = slug;
    updateSlugPreview(slug);
  });

  slugInput?.addEventListener('input', () => {
    if (restaurantModalMode !== 'create') return;
    slugManuallyEdited = true;
    updateSlugPreview(slugifyName(slugInput.value));
    if (slugInput.value !== slugifyName(slugInput.value)) {
      slugInput.value = slugifyName(slugInput.value);
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitBtn?.disabled) return;

    const values = readRestaurantFormValues();
    const validationError = validateRestaurantFormValues(values);

    if (validationError) {
      setRestaurantFormError(validationError);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando…';
    setRestaurantFormError('');

    try {
      if (restaurantModalMode === 'edit') {
        const restaurantId = document.getElementById('restaurantId')?.value;
        const updated = await updateRestaurant(restaurantId, values);
        const index = restaurants.findIndex((entry) => entry.id === restaurantId);
        if (index >= 0) restaurants[index] = { ...restaurants[index], ...updated };
        renderRestaurants();
        closeRestaurantModal();
        showToast(`Restaurante «${values.nombre}» actualizado`, 'success');
      } else {
        const restaurant = await createRestaurant(values);
        restaurants.unshift(restaurant);
        renderRestaurants();
        closeRestaurantModal();
        showToast(`Restaurante «${values.nombre}» creado con 5 mesas`, 'success');
      }
    } catch (error) {
      console.error(error);
      const message =
        error.code === '23505'
          ? 'Ese slug ya está en uso. Elegí otro.'
          : error.message || 'No se pudo guardar el restaurante.';
      setRestaurantFormError(message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent =
        restaurantModalMode === 'edit' ? 'Guardar cambios' : 'Guardar restaurante';
    }
  });
}

function bindLogin() {
  const form = document.getElementById('adminLoginForm');
  const btn = document.getElementById('adminLoginBtn');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = document.getElementById('adminUsername')?.value;
    const password = document.getElementById('adminPassword')?.value;
    btn.disabled = true;
    btn.textContent = 'Ingresando…';
    setLoginError('');

    try {
      await loginAdmin(username, password);
    } catch (error) {
      console.error(error);
      setLoginError(error.message || 'No se pudo cargar el panel.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    }
  });
}

function bindLogout() {
  document.getElementById('adminLogoutBtn')?.addEventListener('click', () => {
    clearAdminSession();
    restaurants = [];
    showLogin();
    showToast('Sesión cerrada', 'success');
  });
}

async function init() {
  bindLogin();
  bindLogout();
  bindRestaurantListActions();
  bindRestaurantModal();

  document.getElementById('newRestaurantBtn')?.addEventListener('click', openNewRestaurantModal);

  const restored = await restoreSession();
  if (!restored) showLogin();
}

document.addEventListener('DOMContentLoaded', init);
