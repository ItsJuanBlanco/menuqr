const ADMIN_SESSION_KEY = 'menuqr:adminSession';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';
const DEFAULT_MESAS_COUNT = 5;

let restaurants = [];
let slugManuallyEdited = false;
let busyIds = new Set();

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

function openNewRestaurantModal() {
  const modal = document.getElementById('newRestaurantModal');
  const form = document.getElementById('newRestaurantForm');
  const errorEl = document.getElementById('newRestaurantError');

  slugManuallyEdited = false;
  form?.reset();
  if (errorEl) errorEl.hidden = true;
  updateSlugPreview('');
  modal?.removeAttribute('hidden');
  modal?.setAttribute('aria-hidden', 'false');
  document.getElementById('restaurantName')?.focus();
}

function closeNewRestaurantModal() {
  const modal = document.getElementById('newRestaurantModal');
  modal?.setAttribute('hidden', '');
  modal?.setAttribute('aria-hidden', 'true');
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

    if (btn.dataset.action === 'toggle-active') {
      toggleRestaurantActive(btn.dataset.id, btn.dataset.active === '1');
    }
  });
}

function bindNewRestaurantModal() {
  const modal = document.getElementById('newRestaurantModal');
  const form = document.getElementById('newRestaurantForm');
  const nameInput = document.getElementById('restaurantName');
  const slugInput = document.getElementById('restaurantSlug');
  const errorEl = document.getElementById('newRestaurantError');
  const submitBtn = document.getElementById('newRestaurantSubmit');

  modal?.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', closeNewRestaurantModal);
  });

  nameInput?.addEventListener('input', () => {
    if (slugManuallyEdited) return;
    const slug = slugifyName(nameInput.value);
    if (slugInput) slugInput.value = slug;
    updateSlugPreview(slug);
  });

  slugInput?.addEventListener('input', () => {
    slugManuallyEdited = true;
    updateSlugPreview(slugifyName(slugInput.value));
    if (slugInput.value !== slugifyName(slugInput.value)) {
      slugInput.value = slugifyName(slugInput.value);
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitBtn?.disabled) return;

    const nombre = nameInput?.value?.trim();
    const slug = slugifyName(slugInput?.value?.trim());
    const ciudad = document.getElementById('restaurantCity')?.value?.trim();
    const email = normalizeEmail(document.getElementById('restaurantEmail')?.value);
    const pin_mesero = document.getElementById('restaurantPinMesero')?.value?.trim();
    const pin_admin = document.getElementById('restaurantPinAdmin')?.value?.trim();

    if (!nombre || !slug || !ciudad || !email || !pin_mesero || !pin_admin) {
      if (errorEl) {
        errorEl.textContent = 'Completá todos los campos.';
        errorEl.hidden = false;
      }
      return;
    }

    if (pin_mesero.length < 4 || pin_admin.length < 4) {
      if (errorEl) {
        errorEl.textContent = 'Los PIN deben tener al menos 4 caracteres.';
        errorEl.hidden = false;
      }
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando…';
    if (errorEl) errorEl.hidden = true;

    try {
      const restaurant = await createRestaurant({
        nombre,
        slug,
        ciudad,
        email,
        pin_mesero,
        pin_admin,
      });
      restaurants.unshift(restaurant);
      renderRestaurants();
      closeNewRestaurantModal();
      showToast(`Restaurante «${nombre}» creado con 5 mesas`, 'success');
    } catch (error) {
      console.error(error);
      const message =
        error.code === '23505'
          ? 'Ese slug ya está en uso. Elegí otro.'
          : error.message || 'No se pudo crear el restaurante.';
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.hidden = false;
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Guardar restaurante';
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
  bindNewRestaurantModal();

  document.getElementById('newRestaurantBtn')?.addEventListener('click', openNewRestaurantModal);

  const restored = await restoreSession();
  if (!restored) showLogin();
}

document.addEventListener('DOMContentLoaded', init);
