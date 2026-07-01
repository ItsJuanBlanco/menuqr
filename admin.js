const ADMIN_SESSION_KEY = 'menuqr:adminSession';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';
const DEFAULT_MESAS_COUNT = 5;
const DEFAULT_METODO_PAGO = 'wompi';
const DEFAULT_VALOR_MENSUAL = 150000;
const SUSCRIPCION_ESTADOS = ['trial', 'activo', 'vencido', 'cancelado'];
const ADMIN_ASSETS_BUCKET = 'restaurantes';
const ALLOWED_PAYMENT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

let restaurants = [];
let slugManuallyEdited = false;
let busyIds = new Set();
let restaurantModalMode = 'create';
let pendingAdminQrPagoFile = null;
let pendingAdminQrPagoPreviewUrl = null;
let currentAdminQrPagoUrl = null;
let adminRestaurantDrawerTab = {};
let subscriptionBusy = new Set();

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

function formatDateShort(isoDate) {
  if (!isoDate) return '—';
  const [year, month, day] = String(isoDate).split('-');
  if (!year || !month || !day) return '—';
  return `${day}/${month}/${year}`;
}

function toISODateLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayISODateLocal() {
  return toISODateLocal(new Date());
}

function parseISODateLocal(isoDate) {
  const [year, month, day] = String(isoDate || '').split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function addDaysISO(isoDate, days) {
  const date = parseISODateLocal(isoDate);
  date.setDate(date.getDate() + days);
  return toISODateLocal(date);
}

function daysBetweenISO(fromIso, toIso) {
  const from = parseISODateLocal(fromIso);
  const to = parseISODateLocal(toIso);
  return Math.round((to - from) / 86400000);
}

function getRestaurantSuscripcionEstado(restaurant) {
  const estado = restaurant?.estado_suscripcion;
  return SUSCRIPCION_ESTADOS.includes(estado) ? estado : null;
}

function getSuscripcionBadgeMeta(estado) {
  const map = {
    none: { label: 'Sin suscripción', className: 'admin-suscripcion-badge--none' },
    trial: { label: 'Trial', className: 'admin-suscripcion-badge--trial' },
    activo: { label: 'Activo', className: 'admin-suscripcion-badge--activo' },
    vencido: { label: 'Vencido', className: 'admin-suscripcion-badge--vencido' },
    cancelado: { label: 'Cancelado', className: 'admin-suscripcion-badge--cancelado' },
  };
  return map[estado || 'none'] || map.none;
}

function renderSuscripcionBadge(estado) {
  const meta = getSuscripcionBadgeMeta(estado);
  return `<span class="admin-suscripcion-badge ${meta.className}">${escapeHtml(meta.label)}</span>`;
}

function formatSuscripcionMoney(value) {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : DEFAULT_VALOR_MENSUAL;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeAmount);
}

function getSuscripcionValorMensual(restaurant) {
  const value = Number(restaurant?.valor_mensual);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_VALOR_MENSUAL;
}

function getSuscripcionDiasLabel(restaurant) {
  const estado = getRestaurantSuscripcionEstado(restaurant);
  if (!estado) return '—';

  if (estado === 'trial') {
    if (!restaurant.proximo_cobro) return '—';
    const restantes = daysBetweenISO(todayISODateLocal(), restaurant.proximo_cobro);
    if (restantes < 0) return `${Math.abs(restantes)} día${Math.abs(restantes) !== 1 ? 's' : ''} vencido`;
    if (restantes === 0) return 'Vence hoy';
    return `${restantes} día${restantes !== 1 ? 's' : ''} restante${restantes !== 1 ? 's' : ''} de trial`;
  }

  if (restaurant.fecha_inicio_trial) {
    const dias = daysBetweenISO(restaurant.fecha_inicio_trial, todayISODateLocal()) + 1;
    return `${dias} día${dias !== 1 ? 's' : ''} como suscriptor`;
  }

  return '—';
}

function renderAdminSubscriptionPanel(restaurant) {
  const estado = getRestaurantSuscripcionEstado(restaurant);
  const busy = subscriptionBusy.has(restaurant.id);
  const valorMensual = getSuscripcionValorMensual(restaurant);
  const hasSuscripcion = Boolean(estado);

  const activateTrialBtn = `
    <button
      type="button"
      class="menu-toolbar__btn admin-suscripcion__activate"
      data-action="activate-trial"
      data-id="${restaurant.id}"
      ${busy ? 'disabled' : ''}
    >🚀 Activar trial</button>
  `;

  const detailsHtml = hasSuscripcion
    ? `
      <div class="admin-suscripcion__grid">
        <div class="admin-suscripcion__field">
          <span class="admin-suscripcion__label">Estado</span>
          ${renderSuscripcionBadge(estado)}
        </div>
        <div class="admin-suscripcion__field">
          <span class="admin-suscripcion__label">Inicio trial</span>
          <strong>${escapeHtml(formatDateShort(restaurant.fecha_inicio_trial))}</strong>
        </div>
        <div class="admin-suscripcion__field">
          <span class="admin-suscripcion__label">${estado === 'trial' ? 'Trial' : 'Suscripción'}</span>
          <strong>${escapeHtml(getSuscripcionDiasLabel(restaurant))}</strong>
        </div>
        <div class="admin-suscripcion__field">
          <span class="admin-suscripcion__label">Próximo cobro</span>
          <strong>${escapeHtml(formatDateShort(restaurant.proximo_cobro))}</strong>
        </div>
        <label class="admin-suscripcion__field admin-suscripcion__field--valor">
          <span class="admin-suscripcion__label">Valor mensual</span>
          <div class="admin-suscripcion__valor-row">
            <span class="admin-suscripcion__currency">$</span>
            <input
              type="number"
              class="admin-form__input admin-suscripcion__valor-input"
              data-action="update-valor-mensual"
              data-id="${restaurant.id}"
              value="${valorMensual}"
              min="1"
              step="1000"
              inputmode="numeric"
              ${busy ? 'disabled' : ''}
            >
            <span class="admin-suscripcion__currency-suffix">COP</span>
          </div>
        </label>
      </div>
      <div class="admin-suscripcion__actions">
        ${
          estado === 'trial' || estado === 'activo' || estado === 'vencido'
            ? `<button type="button" class="admin-action-btn admin-action-btn--primary" data-action="register-payment" data-id="${restaurant.id}" ${busy ? 'disabled' : ''}>Registrar pago</button>`
            : ''
        }
        ${
          estado === 'trial' || estado === 'activo'
            ? `<button type="button" class="admin-action-btn" data-action="mark-expired" data-id="${restaurant.id}" ${busy ? 'disabled' : ''}>Marcar como vencido</button>`
            : ''
        }
        ${
          estado !== 'cancelado'
            ? `<button type="button" class="admin-action-btn admin-action-btn--danger" data-action="cancel-subscription" data-id="${restaurant.id}" ${busy ? 'disabled' : ''}>Cancelar suscripción</button>`
            : ''
        }
        ${
          estado === 'cancelado' || estado === 'vencido'
            ? activateTrialBtn
            : ''
        }
      </div>
    `
    : `
      <p class="admin-suscripcion__empty">Este local aún no tiene suscripción activa.</p>
      ${activateTrialBtn}
    `;

  return `
    <div class="admin-suscripcion" data-restaurant-suscripcion="${restaurant.id}">
      <p class="admin-restaurant-drawer__hint">
        Gestioná el trial y los cobros mensuales de <strong>${escapeHtml(restaurant.nombre || 'este local')}</strong>.
      </p>
      ${detailsHtml}
      <p class="admin-restaurant-drawer__status" id="adminSuscripcionStatus-${restaurant.id}" hidden role="status"></p>
    </div>
  `;
}

function setAdminSuscripcionStatus(restaurantId, message, tone = '') {
  const el = document.getElementById(`adminSuscripcionStatus-${restaurantId}`);
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

function patchRestaurantSuscripcion(restaurantId, patch) {
  const index = restaurants.findIndex((entry) => entry.id === restaurantId);
  if (index >= 0) {
    restaurants[index] = { ...restaurants[index], ...patch };
  }
}

async function runSuscripcionAction(restaurantId, action) {
  if (subscriptionBusy.has(restaurantId)) return;

  subscriptionBusy.add(restaurantId);
  setAdminSuscripcionStatus(restaurantId, 'Guardando…');
  renderRestaurants();

  try {
    const client = assertSupabaseClient();
    const restaurant = restaurants.find((entry) => entry.id === restaurantId);
    if (!restaurant) throw new Error('Restaurante no encontrado.');

    if (action === 'activate-trial') {
      const today = todayISODateLocal();
      const proximoCobro = addDaysISO(today, 30);
      const { data, error } = await client
        .from('restaurantes')
        .update({
          fecha_inicio_trial: today,
          estado_suscripcion: 'trial',
          proximo_cobro: proximoCobro,
          valor_mensual: getSuscripcionValorMensual(restaurant),
        })
        .eq('id', restaurantId)
        .select(
          'id, nombre, slug, ciudad, email, activo, created_at, features, musica_habilitada, estado_suscripcion, fecha_inicio_trial, proximo_cobro, valor_mensual'
        )
        .single();

      if (error) throw error;
      patchRestaurantSuscripcion(restaurantId, data);
      adminRestaurantDrawerTab[restaurantId] = 'suscripcion';
      showToast(`Trial activado — vence el ${formatDateShort(proximoCobro)}`, 'success');
      setAdminSuscripcionStatus(restaurantId, 'Trial activado', 'success');
    }

    if (action === 'register-payment') {
      const monto = getSuscripcionValorMensual(restaurant);
      const today = todayISODateLocal();
      const baseDate = restaurant.proximo_cobro || today;
      const proximoCobro = addDaysISO(baseDate, 30);

      const { error: pagoError } = await client.from('pagos_suscripcion').insert({
        restaurante_id: restaurantId,
        fecha: today,
        monto,
      });
      if (pagoError) throw pagoError;

      const { data, error } = await client
        .from('restaurantes')
        .update({
          estado_suscripcion: 'activo',
          proximo_cobro: proximoCobro,
        })
        .eq('id', restaurantId)
        .select(
          'id, nombre, slug, ciudad, email, activo, created_at, features, musica_habilitada, estado_suscripcion, fecha_inicio_trial, proximo_cobro, valor_mensual'
        )
        .single();

      if (error) throw error;
      patchRestaurantSuscripcion(restaurantId, data);
      showToast(`Pago registrado · próximo cobro ${formatDateShort(proximoCobro)}`, 'success');
      setAdminSuscripcionStatus(restaurantId, 'Pago registrado', 'success');
    }

    if (action === 'mark-expired') {
      const { data, error } = await client
        .from('restaurantes')
        .update({ estado_suscripcion: 'vencido' })
        .eq('id', restaurantId)
        .select(
          'id, nombre, slug, ciudad, email, activo, created_at, features, musica_habilitada, estado_suscripcion, fecha_inicio_trial, proximo_cobro, valor_mensual'
        )
        .single();

      if (error) throw error;
      patchRestaurantSuscripcion(restaurantId, data);
      showToast('Suscripción marcada como vencida', 'success');
      setAdminSuscripcionStatus(restaurantId, 'Marcado como vencido', 'success');
    }

    if (action === 'cancel-subscription') {
      const { data, error } = await client
        .from('restaurantes')
        .update({ estado_suscripcion: 'cancelado' })
        .eq('id', restaurantId)
        .select(
          'id, nombre, slug, ciudad, email, activo, created_at, features, musica_habilitada, estado_suscripcion, fecha_inicio_trial, proximo_cobro, valor_mensual'
        )
        .single();

      if (error) throw error;
      patchRestaurantSuscripcion(restaurantId, data);
      showToast('Suscripción cancelada', 'success');
      setAdminSuscripcionStatus(restaurantId, 'Suscripción cancelada', 'success');
    }

    setTimeout(() => setAdminSuscripcionStatus(restaurantId, ''), 2200);
  } catch (error) {
    console.error(error);
    setAdminSuscripcionStatus(restaurantId, error.message || 'No se pudo actualizar la suscripción.', 'error');
    showToast(error.message || 'No se pudo actualizar la suscripción.', 'error');
  } finally {
    subscriptionBusy.delete(restaurantId);
    renderRestaurants();
  }
}

async function saveSuscripcionValorMensual(restaurantId, rawValue) {
  const amount = Math.round(Number(rawValue));
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast('Ingresá un valor mensual válido.', 'error');
    renderRestaurants();
    return;
  }

  if (subscriptionBusy.has(restaurantId)) return;

  subscriptionBusy.add(restaurantId);
  setAdminSuscripcionStatus(restaurantId, 'Guardando valor…');
  renderRestaurants();

  try {
    const client = assertSupabaseClient();
    const { data, error } = await client
      .from('restaurantes')
      .update({ valor_mensual: amount })
      .eq('id', restaurantId)
      .select(
        'id, nombre, slug, ciudad, email, activo, created_at, features, musica_habilitada, estado_suscripcion, fecha_inicio_trial, proximo_cobro, valor_mensual'
      )
      .single();

    if (error) throw error;
    patchRestaurantSuscripcion(restaurantId, data);
    setAdminSuscripcionStatus(restaurantId, 'Valor mensual actualizado', 'success');
    setTimeout(() => setAdminSuscripcionStatus(restaurantId, ''), 2200);
  } catch (error) {
    console.error(error);
    setAdminSuscripcionStatus(restaurantId, error.message || 'No se pudo guardar el valor.', 'error');
    showToast(error.message || 'No se pudo guardar el valor.', 'error');
  } finally {
    subscriptionBusy.delete(restaurantId);
    renderRestaurants();
  }
}

function bindAdminSubscriptionActions() {
  const list = document.getElementById('adminRestaurantList');
  if (!list || list.dataset.suscripcionBound) return;
  list.dataset.suscripcionBound = 'true';

  list.addEventListener('click', (event) => {
    const tabBtn = event.target.closest('[data-drawer-tab]');
    if (tabBtn) {
      const restaurantId = tabBtn.dataset.restaurantId;
      if (!restaurantId) return;
      adminRestaurantDrawerTab[restaurantId] = tabBtn.dataset.drawerTab || 'features';
      renderRestaurants();
      return;
    }

    const btn = event.target.closest('[data-action="activate-trial"], [data-action="register-payment"], [data-action="mark-expired"], [data-action="cancel-subscription"]');
    if (!btn || btn.disabled) return;
    void runSuscripcionAction(btn.dataset.id, btn.dataset.action);
  });

  list.addEventListener('change', (event) => {
    const input = event.target.closest('[data-action="update-valor-mensual"]');
    if (!input || input.disabled) return;
    void saveSuscripcionValorMensual(input.dataset.id, input.value);
  });
}

const adminMenuAiState = {};

function getAdminMenuAiState(restaurantId) {
  if (!adminMenuAiState[restaurantId]) {
    adminMenuAiState[restaurantId] = {
      file: null,
      previewUrl: null,
      products: [],
      hasProductPhotos: true,
      generating: false,
      inserting: false,
      error: '',
      status: '',
    };
  }
  return adminMenuAiState[restaurantId];
}

function revokeAdminMenuAiPreview(restaurantId) {
  const state = adminMenuAiState[restaurantId];
  if (state?.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
  }
}

function setAdminMenuAiStatus(restaurantId, message, tone = '') {
  const el = document.getElementById(`adminMenuAiStatus-${restaurantId}`);
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

function setAdminMenuAiError(restaurantId, message) {
  const state = getAdminMenuAiState(restaurantId);
  state.error = message || '';
  const el = document.getElementById(`adminMenuAiError-${restaurantId}`);
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.hidden = false;
  } else {
    el.textContent = '';
    el.hidden = true;
  }
}

function normalizeMenuAiProduct(raw, index, { includeImage = false } = {}) {
  const nombre = String(raw?.nombre || raw?.name || '').trim();
  const descripcion = String(raw?.descripcion || raw?.description || '').trim();
  const precio = Math.round(Number(raw?.precio ?? raw?.price));
  const categoria = String(raw?.categoria || raw?.category || 'Otros').trim() || 'Otros';

  if (!nombre) {
    throw new Error(`Producto ${index + 1}: falta el nombre.`);
  }

  if (!Number.isFinite(precio) || precio < 0) {
    throw new Error(`Producto «${nombre}»: precio inválido.`);
  }

  const product = { nombre, descripcion, precio, categoria };

  if (includeImage) {
    product.imagen = String(raw?.imagen || raw?.imagen_url || raw?.image || '').trim();
  }

  return product;
}

function renderAdminMenuAiProductsTable(restaurantId, products, hasProductPhotos = false) {
  if (!products.length) {
    return '<p class="admin-menu-ai__empty">Todavía no hay productos extraídos.</p>';
  }

  const imageHeader = hasProductPhotos ? '<th>Imagen (URL)</th>' : '';
  const rows = products
    .map((product, index) => {
      const imageCell = hasProductPhotos
        ? `<td>
            <input
              type="url"
              class="admin-form__input admin-menu-ai__cell-input"
              data-menu-ai-field="imagen"
              data-restaurant-id="${restaurantId}"
              data-product-index="${index}"
              value="${escapeHtml(product.imagen || '')}"
              placeholder="https://…"
            >
          </td>`
        : '';

      return `
        <tr>
          <td>
            <input
              type="text"
              class="admin-form__input admin-menu-ai__cell-input"
              data-menu-ai-field="nombre"
              data-restaurant-id="${restaurantId}"
              data-product-index="${index}"
              value="${escapeHtml(product.nombre)}"
            >
          </td>
          <td>
            <input
              type="text"
              class="admin-form__input admin-menu-ai__cell-input"
              data-menu-ai-field="descripcion"
              data-restaurant-id="${restaurantId}"
              data-product-index="${index}"
              value="${escapeHtml(product.descripcion)}"
            >
          </td>
          <td>
            <input
              type="number"
              class="admin-form__input admin-menu-ai__cell-input admin-menu-ai__cell-input--price"
              data-menu-ai-field="precio"
              data-restaurant-id="${restaurantId}"
              data-product-index="${index}"
              value="${Number(product.precio) || 0}"
              min="0"
              step="1"
              inputmode="numeric"
            >
          </td>
          <td>
            <input
              type="text"
              class="admin-form__input admin-menu-ai__cell-input"
              data-menu-ai-field="categoria"
              data-restaurant-id="${restaurantId}"
              data-product-index="${index}"
              value="${escapeHtml(product.categoria)}"
            >
          </td>
          ${imageCell}
        </tr>
      `;
    })
    .join('');

  return `
    <div class="admin-menu-ai__table-wrap">
      <table class="admin-menu-ai__table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Descripción</th>
            <th>Precio</th>
            <th>Categoría</th>
            ${imageHeader}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderAdminMenuAiPanel(restaurant) {
  const state = getAdminMenuAiState(restaurant.id);
  const busy = state.generating || state.inserting;
  const previewSrc = state.previewUrl || '';
  const hasProducts = state.products.length > 0;

  return `
    <div class="admin-menu-ai" data-restaurant-menu-ai="${restaurant.id}">
      <p class="admin-restaurant-drawer__hint">
        Subí una foto de la carta de <strong>${escapeHtml(restaurant.nombre || 'este restaurante')}</strong> y generá productos con IA antes de insertarlos.
      </p>

      <div class="admin-menu-ai__upload">
        <label class="admin-menu-ai__file-label">
          <input
            type="file"
            class="admin-menu-ai__file-input"
            id="adminMenuAiInput-${restaurant.id}"
            data-menu-ai-input
            data-restaurant-id="${restaurant.id}"
            accept="image/*"
            capture="environment"
            ${busy ? 'disabled' : ''}
          >
          <span class="menu-toolbar__btn admin-menu-ai__file-btn">Elegir foto de carta</span>
        </label>
        <div class="admin-menu-ai__preview" id="adminMenuAiPreview-${restaurant.id}" ${previewSrc ? '' : 'hidden'}>
          <img id="adminMenuAiPreviewImg-${restaurant.id}" src="${escapeHtml(previewSrc)}" alt="Vista previa de la carta">
        </div>
      </div>

      <label class="admin-feature-toggle admin-menu-ai__photos-toggle">
        <input
          type="checkbox"
          data-menu-ai-has-photos
          data-restaurant-id="${restaurant.id}"
          ${state.hasProductPhotos ? 'checked' : ''}
          ${busy ? 'disabled' : ''}
        >
        <span class="admin-feature-toggle__ui" aria-hidden="true"></span>
        <span class="admin-feature-toggle__copy">
          <strong class="admin-feature-toggle__label">¿Esta carta tiene fotos de los productos?</strong>
          <span class="admin-feature-toggle__desc">Desmarcá si la carta es solo texto. La IA no inventará imágenes y los productos se insertarán sin foto.</span>
        </span>
      </label>

      <div class="admin-menu-ai__actions">
        <button
          type="button"
          class="menu-toolbar__btn admin-menu-ai__generate"
          data-action="menu-ai-generate"
          data-restaurant-id="${restaurant.id}"
          ${!state.file || busy ? 'disabled' : ''}
        >${state.generating ? 'Generando…' : 'Generar productos con IA'}</button>
        ${
          hasProducts
            ? `<button
                type="button"
                class="dataphone-modal__confirm admin-menu-ai__confirm"
                data-action="menu-ai-confirm"
                data-restaurant-id="${restaurant.id}"
                ${busy ? 'disabled' : ''}
              >${state.inserting ? 'Insertando…' : 'Confirmar e insertar en carta'}</button>`
            : ''
        }
      </div>

      <p class="admin-menu-ai__error" id="adminMenuAiError-${restaurant.id}" ${state.error ? '' : 'hidden'} role="alert">${escapeHtml(state.error)}</p>
      <p class="admin-restaurant-drawer__status" id="adminMenuAiStatus-${restaurant.id}" ${state.status ? '' : 'hidden'} role="status">${escapeHtml(state.status)}</p>

      <div class="admin-menu-ai__results" id="adminMenuAiResults-${restaurant.id}">
        ${hasProducts ? `<p class="admin-menu-ai__results-count">${state.products.length} producto${state.products.length !== 1 ? 's' : ''} detectado${state.products.length !== 1 ? 's' : ''}</p>` : ''}
        ${renderAdminMenuAiProductsTable(restaurant.id, state.products, state.hasProductPhotos)}
      </div>
    </div>
  `;
}

function readAdminMenuAiFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
}

async function callParseMenuImageFunction(imageBase64, mediaType, hasProductPhotos = true) {
  const supabaseUrl = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '';
  const anonKey = typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '';

  if (!supabaseUrl || !anonKey) {
    throw new Error('SUPABASE_URL o SUPABASE_ANON_KEY no están disponibles.');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/parse-menu-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify({
      image_base64: imageBase64,
      media_type: mediaType,
      has_product_photos: hasProductPhotos,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || 'No se pudo analizar la carta con IA.');
  }

  if (!Array.isArray(payload)) {
    throw new Error('La función no devolvió un array de productos.');
  }

  return payload;
}

async function generateAdminMenuAiProducts(restaurantId) {
  const state = getAdminMenuAiState(restaurantId);
  if (state.generating || !state.file) return;

  state.generating = true;
  state.error = '';
  state.status = 'Analizando carta con IA…';
  renderRestaurants();

  try {
    const imageBase64 = await readAdminMenuAiFileAsBase64(state.file);
    const mediaType = state.file.type || 'image/jpeg';
    const rawProducts = await callParseMenuImageFunction(imageBase64, mediaType, state.hasProductPhotos);

    if (!rawProducts.length) {
      throw new Error('No se detectaron productos en la imagen.');
    }

    state.products = rawProducts.map((product, index) =>
      normalizeMenuAiProduct(product, index, { includeImage: state.hasProductPhotos })
    );
    state.status = `${state.products.length} productos listos para revisar.`;
    showToast(`${state.products.length} productos detectados`, 'success');
  } catch (error) {
    console.error(error);
    state.products = [];
    state.status = '';
    setAdminMenuAiError(restaurantId, error.message || 'No se pudieron generar los productos.');
    showToast(error.message || 'No se pudieron generar los productos.', 'error');
  } finally {
    state.generating = false;
    renderRestaurants();
  }
}

async function confirmAdminMenuAiProducts(restaurantId) {
  const state = getAdminMenuAiState(restaurantId);
  if (state.inserting || !state.products.length) return;

  state.inserting = true;
  state.error = '';
  state.status = 'Insertando productos en la carta…';
  renderRestaurants();

  try {
    const products = state.products.map((product, index) =>
      normalizeMenuAiProduct(product, index, { includeImage: state.hasProductPhotos })
    );
    const rows = products.map((product) => ({
      restaurante_id: restaurantId,
      nombre: product.nombre,
      descripcion: product.descripcion || '',
      precio: product.precio,
      categoria: product.categoria,
      disponible: true,
      imagen_url: state.hasProductPhotos ? product.imagen || null : null,
    }));

    const client = assertSupabaseClient();
    const { error } = await client.from('productos').insert(rows);
    if (error) throw error;

    revokeAdminMenuAiPreview(restaurantId);
    adminMenuAiState[restaurantId] = {
      file: null,
      previewUrl: null,
      products: [],
      hasProductPhotos: true,
      generating: false,
      inserting: false,
      error: '',
      status: '',
    };

    showToast(`${rows.length} producto${rows.length !== 1 ? 's' : ''} insertados en la carta`, 'success');
  } catch (error) {
    console.error(error);
    state.status = '';
    setAdminMenuAiError(restaurantId, error.message || 'No se pudieron insertar los productos.');
    showToast(error.message || 'No se pudieron insertar los productos.', 'error');
  } finally {
    state.inserting = false;
    renderRestaurants();
  }
}

function handleAdminMenuAiFileChange(restaurantId, fileInput) {
  const state = getAdminMenuAiState(restaurantId);
  const file = fileInput.files?.[0];

  revokeAdminMenuAiPreview(restaurantId);
  state.file = null;
  state.products = [];
  state.error = '';
  state.status = '';

  if (!file) {
    renderRestaurants();
    return;
  }

  if (!file.type.startsWith('image/')) {
    fileInput.value = '';
    setAdminMenuAiError(restaurantId, 'Seleccioná un archivo de imagen válido.');
    renderRestaurants();
    return;
  }

  state.file = file;
  state.previewUrl = URL.createObjectURL(file);
  renderRestaurants();
}

function handleAdminMenuAiProductFieldChange(restaurantId, index, field, value) {
  const state = getAdminMenuAiState(restaurantId);
  const product = state.products[index];
  if (!product) return;

  if (field === 'precio') {
    product.precio = Math.round(Number(value) || 0);
    return;
  }

  product[field] = String(value || '').trim();
}

function bindAdminMenuAiActions() {
  const list = document.getElementById('adminRestaurantList');
  if (!list || list.dataset.menuAiBound) return;
  list.dataset.menuAiBound = 'true';

  list.addEventListener('change', (event) => {
    const fileInput = event.target.closest('[data-menu-ai-input]');
    if (fileInput) {
      handleAdminMenuAiFileChange(fileInput.dataset.restaurantId, fileInput);
      return;
    }

    const photosToggle = event.target.closest('[data-menu-ai-has-photos]');
    if (photosToggle) {
      const restaurantId = photosToggle.dataset.restaurantId;
      const aiState = getAdminMenuAiState(restaurantId);
      aiState.hasProductPhotos = photosToggle.checked;
      if (!aiState.hasProductPhotos) {
        aiState.products = aiState.products.map(({ imagen, ...product }) => product);
      }
      renderRestaurants();
      return;
    }

    const fieldInput = event.target.closest('[data-menu-ai-field]');
    if (!fieldInput) return;

    handleAdminMenuAiProductFieldChange(
      fieldInput.dataset.restaurantId,
      Number(fieldInput.dataset.productIndex),
      fieldInput.dataset.menuAiField,
      fieldInput.value
    );
  });

  list.addEventListener('input', (event) => {
    const fieldInput = event.target.closest('[data-menu-ai-field]');
    if (!fieldInput) return;

    handleAdminMenuAiProductFieldChange(
      fieldInput.dataset.restaurantId,
      Number(fieldInput.dataset.productIndex),
      fieldInput.dataset.menuAiField,
      fieldInput.value
    );
  });

  list.addEventListener('click', (event) => {
    const generateBtn = event.target.closest('[data-action="menu-ai-generate"]');
    if (generateBtn && !generateBtn.disabled) {
      void generateAdminMenuAiProducts(generateBtn.dataset.restaurantId);
      return;
    }

    const confirmBtn = event.target.closest('[data-action="menu-ai-confirm"]');
    if (confirmBtn && !confirmBtn.disabled) {
      void confirmAdminMenuAiProducts(confirmBtn.dataset.restaurantId);
    }
  });
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
      .select(
        'id, nombre, slug, ciudad, email, activo, created_at, features, musica_habilitada, estado_suscripcion, fecha_inicio_trial, proximo_cobro, valor_mensual'
      )
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
    .flatMap((restaurant) => {
      const isActive = restaurant.activo !== false;
      const busy = busyIds.has(restaurant.id);
      const expanded = expandedRestaurantId === restaurant.id;
      const flags = parseRestaurantFeatures(restaurant);
      const activeFeatures = RESTAURANT_FEATURE_DEFS.filter((def) => flags[def.id])
        .map((def) => def.label)
        .join(' · ');

      const suscripcionEstado = getRestaurantSuscripcionEstado(restaurant);
      const suscripcionBadge = renderSuscripcionBadge(suscripcionEstado);

      return [
        `
        <tr class="admin-restaurant-row${expanded ? ' admin-restaurant-row--expanded' : ''}">
          <td>
            <button
              type="button"
              class="admin-restaurant-name"
              data-action="toggle-restaurant-drawer"
              data-id="${restaurant.id}"
              aria-expanded="${expanded ? 'true' : 'false'}"
            >
              <span class="admin-restaurant-name__chevron" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
              <span class="admin-restaurant-name__text">${escapeHtml(restaurant.nombre || '—')}</span>
              ${suscripcionBadge}
            </button>
            <div class="admin-table__slug">${escapeHtml(restaurant.email || '')}</div>
            ${activeFeatures ? `<div class="admin-restaurant-features">${escapeHtml(activeFeatures)}</div>` : ''}
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
        <tr class="admin-restaurant-detail${expanded ? ' admin-restaurant-detail--open' : ''}" ${expanded ? '' : 'hidden'}>
          <td colspan="6">${renderAdminFeaturePanel(restaurant)}</td>
        </tr>
        `,
      ];
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

function normalizeMetodoPago(value) {
  return value === 'qr_propio' ? 'qr_propio' : DEFAULT_METODO_PAGO;
}

function getAdminSelectedMetodoPago() {
  const selected = document.querySelector('input[name="adminMetodoPago"]:checked');
  return normalizeMetodoPago(selected?.value);
}

function normalizeLinkPago(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) {
    throw new Error('El link de pago debe empezar con http:// o https://');
  }
  return raw;
}

function normalizeLinkBancolombia(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || /^\d+$/.test(raw)) return raw;
  throw new Error('El link de Bancolombia debe empezar con http:// o https://, o ser un número de cuenta.');
}

function updateAdminPaymentFieldsVisibility(metodo) {
  const wompiFields = document.getElementById('adminWompiFields');
  const qrFields = document.getElementById('adminQrPropioFields');
  const linkOptional = document.getElementById('adminLinkPagoOptional');
  const linkHint = document.getElementById('adminLinkPagoHint');

  if (wompiFields) wompiFields.hidden = metodo !== 'wompi';
  if (qrFields) qrFields.hidden = metodo !== 'qr_propio';
  if (linkOptional) linkOptional.hidden = metodo !== 'wompi';
  if (linkHint) {
    linkHint.textContent =
      metodo === 'qr_propio'
        ? 'Link de Nequi, Daviplata o Bancolombia'
        : 'Nequi, Daviplata o Bancolombia (opcional)';
  }
}

function revokePendingAdminQrPagoPreview() {
  if (pendingAdminQrPagoPreviewUrl) {
    URL.revokeObjectURL(pendingAdminQrPagoPreviewUrl);
    pendingAdminQrPagoPreviewUrl = null;
  }
}

function updateAdminQrPagoRemoveButton(hasImage) {
  const btn = document.getElementById('adminQrPagoRemoveBtn');
  if (btn) btn.hidden = !hasImage;
}

function updateAdminQrPagoImageUI({ src = '', hint = '', btnText = 'Subir QR' }) {
  const preview = document.getElementById('adminQrPagoPreview');
  const img = document.getElementById('adminQrPagoPreviewImg');
  const hintEl = document.getElementById('adminQrPagoHint');
  const btnTextEl = document.getElementById('adminQrPagoBtnText');

  if (img) {
    if (src) img.src = src;
    else img.removeAttribute('src');
  }
  if (preview) preview.hidden = !src;
  if (hintEl) hintEl.textContent = hint;
  if (btnTextEl) btnTextEl.textContent = btnText;
}

function resetAdminQrPagoField(url = '') {
  const input = document.getElementById('adminQrPagoInput');
  pendingAdminQrPagoFile = null;
  currentAdminQrPagoUrl = url || null;
  revokePendingAdminQrPagoPreview();
  if (input) input.value = '';

  if (url) {
    updateAdminQrPagoImageUI({
      src: url,
      hint: 'QR actual. Elegí otra imagen para reemplazarlo.',
      btnText: 'Cambiar QR',
    });
    updateAdminQrPagoRemoveButton(true);
    return;
  }

  updateAdminQrPagoImageUI({ hint: 'JPG, PNG o WEBP', btnText: 'Subir QR' });
  updateAdminQrPagoRemoveButton(false);
}

function resetAdminPaymentForm() {
  document.querySelectorAll('input[name="adminMetodoPago"]').forEach((input) => {
    input.checked = input.value === DEFAULT_METODO_PAGO;
  });
  document.getElementById('adminWompiPublicKey').value = '';
  document.getElementById('adminLinkPago').value = '';
  document.getElementById('adminLinkBancolombia').value = '';
  updateAdminPaymentFieldsVisibility(DEFAULT_METODO_PAGO);
  resetAdminQrPagoField('');
}

function populateAdminPaymentForm(restaurant = {}) {
  const metodo = normalizeMetodoPago(restaurant.metodo_pago);
  document.querySelectorAll('input[name="adminMetodoPago"]').forEach((input) => {
    input.checked = input.value === metodo;
  });
  document.getElementById('adminWompiPublicKey').value = restaurant.wompi_public_key || '';
  document.getElementById('adminLinkPago').value = restaurant.link_pago || '';
  document.getElementById('adminLinkBancolombia').value = restaurant.link_bancolombia || '';
  updateAdminPaymentFieldsVisibility(metodo);
  resetAdminQrPagoField(restaurant.qr_pago_url || '');
}

function validateAdminPaymentImageFile(file) {
  if (!file) return null;
  if (!ALLOWED_PAYMENT_IMAGE_TYPES.has(file.type)) {
    throw new Error('Solo se permiten imágenes JPG, PNG o WEBP.');
  }
  return file;
}

function getPaymentImageExtension(file) {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

function getAdminAssetPath(restaurantId, filename) {
  return `${restaurantId}/${filename}`;
}

function getAdminAssetPublicUrl(restaurantId, filename) {
  return `${SUPABASE_URL}/storage/v1/object/public/${ADMIN_ASSETS_BUCKET}/${getAdminAssetPath(restaurantId, filename)}`;
}

async function uploadAdminQrPagoAsset(restaurantId, file) {
  const filename = `qr-pago.${getPaymentImageExtension(file)}`;
  const path = getAdminAssetPath(restaurantId, filename);
  const contentType =
    file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';

  const client = assertSupabaseClient();
  const { error } = await client.storage.from(ADMIN_ASSETS_BUCKET).upload(path, file, {
    upsert: true,
    contentType,
  });

  if (error) throw error;
  return getAdminAssetPublicUrl(restaurantId, filename);
}

function readAdminPaymentFormValues() {
  const metodo_pago = getAdminSelectedMetodoPago();
  const wompi_public_key = document.getElementById('adminWompiPublicKey')?.value?.trim() || null;
  const link_pago = normalizeLinkPago(document.getElementById('adminLinkPago')?.value);
  const link_bancolombia = normalizeLinkBancolombia(document.getElementById('adminLinkBancolombia')?.value);

  return {
    metodo_pago,
    wompi_public_key,
    link_pago,
    link_bancolombia,
    qr_pago_url: currentAdminQrPagoUrl,
  };
}

function validateAdminPaymentFormValues(values) {
  if (values.metodo_pago === 'qr_propio' && !values.link_pago && !values.qr_pago_url && !pendingAdminQrPagoFile) {
    return 'Con QR propio, agregá un link de pago o subí la imagen del QR.';
  }

  return '';
}

async function removeAdminQrPagoImage() {
  if (!currentAdminQrPagoUrl && !pendingAdminQrPagoFile) return;
  if (!window.confirm('¿Quitar el QR de pago?')) return;

  const restaurantId = document.getElementById('restaurantId')?.value;
  if (restaurantModalMode === 'edit' && restaurantId) {
    const client = assertSupabaseClient();
    const { error } = await client.from('restaurantes').update({ qr_pago_url: null }).eq('id', restaurantId);
    if (error) {
      showToast(error.message || 'No se pudo quitar el QR.', 'error');
      return;
    }
  }

  resetAdminQrPagoField('');
  showToast('QR quitado', 'success');
}

function readRestaurantFormValues() {
  const mesasInput = document.getElementById('restaurantMesasCount');
  const mesas_count = Math.max(1, Math.floor(Number(mesasInput?.value) || DEFAULT_MESAS_COUNT));

  return {
    nombre: document.getElementById('restaurantName')?.value?.trim(),
    slug: slugifyName(document.getElementById('restaurantSlug')?.value?.trim()),
    ciudad: document.getElementById('restaurantCity')?.value?.trim(),
    email: normalizeEmail(document.getElementById('restaurantEmail')?.value),
    pin_mesero: document.getElementById('restaurantPinMesero')?.value?.trim(),
    pin_admin: document.getElementById('restaurantPinAdmin')?.value?.trim(),
    mesas_count,
  };
}

function getMaxNumericMesaNumero(mesas) {
  return (mesas || []).reduce((max, mesa) => {
    const parsed = parseInt(String(mesa.numero), 10);
    return Number.isFinite(parsed) && parsed > max ? parsed : max;
  }, 0);
}

async function fetchRestaurantMesas(restaurantId) {
  const client = assertSupabaseClient();
  const { data, error } = await client
    .from('mesas')
    .select('id, numero')
    .eq('restaurante_id', restaurantId);

  if (error) throw error;
  return data || [];
}

async function syncRestaurantMesasCount(restaurantId, targetCount) {
  const existing = await fetchRestaurantMesas(restaurantId);
  const currentCount = existing.length;
  const target = Math.max(1, Math.floor(Number(targetCount) || 0));

  if (target <= currentCount) {
    return { created: 0, total: currentCount };
  }

  const maxNum = getMaxNumericMesaNumero(existing);
  const toCreate = target - currentCount;
  const newMesas = Array.from({ length: toCreate }, (_, index) => ({
    restaurante_id: restaurantId,
    numero: maxNum + index + 1,
    estado: 'libre',
    mesero_requerido: false,
  }));

  const client = assertSupabaseClient();
  const { error } = await client.from('mesas').insert(newMesas);
  if (error) throw error;

  return { created: toCreate, total: target };
}

function updateRestaurantFormNote(mesasCount = DEFAULT_MESAS_COUNT) {
  const note = document.getElementById('restaurantFormNote');
  if (!note) return;

  const count = Math.max(1, Math.floor(Number(mesasCount) || DEFAULT_MESAS_COUNT));

  if (restaurantModalMode === 'edit') {
    note.textContent = `Actualmente hay ${count} mesa${count !== 1 ? 's' : ''}. Si aumentás el número, se crearán mesas adicionales numeradas en secuencia. El slug no se puede cambiar.`;
    return;
  }

  note.textContent = `Se crearán automáticamente ${count} mesa${count !== 1 ? 's' : ''} (Mesa 1–${count}).`;
}

function setRestaurantMesasFieldVisible(visible) {
  const field = document.getElementById('restaurantMesasField');
  const input = document.getElementById('restaurantMesasCount');

  if (field) field.hidden = !visible;
  if (input) {
    input.required = visible;
    if (visible && (!input.value || Number(input.value) < 1)) {
      input.value = String(DEFAULT_MESAS_COUNT);
    }
  }
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

  if (!values.mesas_count || values.mesas_count < 1) {
    return 'Indicá cuántas mesas tiene el restaurante (mínimo 1).';
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
  setRestaurantMesasFieldVisible(true);
  document.getElementById('restaurantMesasCount').value = String(DEFAULT_MESAS_COUNT);
  updateRestaurantFormNote(DEFAULT_MESAS_COUNT);

  const slugInput = document.getElementById('restaurantSlug');
  if (slugInput) {
    slugInput.disabled = false;
    slugInput.required = true;
  }

  setRestaurantFormError('');
  updateSlugPreview('');
  resetAdminPaymentForm();
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
      .select('id, nombre, slug, ciudad, email, pin_mesero, pin_admin, metodo_pago, wompi_public_key, link_pago, link_bancolombia, qr_pago_url, features, musica_habilitada')
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
    populateAdminPaymentForm(data);

    const mesas = await fetchRestaurantMesas(restaurantId);
    setRestaurantMesasFieldVisible(true);
    document.getElementById('restaurantMesasCount').value = String(mesas.length);
    updateRestaurantFormNote(mesas.length);

    document.getElementById('restaurantModalTitle').textContent = `Editar · ${data.nombre || 'Restaurante'}`;
    document.getElementById('restaurantSubmitBtn').textContent = 'Guardar cambios';

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
  resetAdminPaymentForm();
}

function updateSlugPreview(slug) {
  const preview = document.getElementById('slugPreview');
  if (preview) preview.textContent = slug || 'slug';
}

async function saveRestaurantPaymentSettings(restaurantId) {
  const payment = readAdminPaymentFormValues();
  let qr_pago_url = payment.qr_pago_url;

  if (pendingAdminQrPagoFile) {
    qr_pago_url = await uploadAdminQrPagoAsset(restaurantId, pendingAdminQrPagoFile);
  }

  const client = assertSupabaseClient();
  const { error } = await client
    .from('restaurantes')
    .update({
      metodo_pago: payment.metodo_pago,
      wompi_public_key: payment.wompi_public_key,
      link_pago: payment.link_pago,
      link_bancolombia: payment.link_bancolombia,
      qr_pago_url,
    })
    .eq('id', restaurantId);

  if (error) throw error;

  pendingAdminQrPagoFile = null;
  revokePendingAdminQrPagoPreview();
  currentAdminQrPagoUrl = qr_pago_url;
}

async function createRestaurant({ nombre, slug, ciudad, email, pin_mesero, pin_admin, mesas_count }) {
  const client = assertSupabaseClient();
  let payment;

  try {
    payment = readAdminPaymentFormValues();
  } catch (error) {
    throw error;
  }

  const mesasCount = Math.max(1, Math.floor(Number(mesas_count) || DEFAULT_MESAS_COUNT));

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
      metodo_pago: payment.metodo_pago,
      wompi_public_key: payment.wompi_public_key,
      link_pago: payment.link_pago,
      link_bancolombia: payment.link_bancolombia,
      features: {},
    })
    .select('id, nombre, slug, ciudad, email, activo, created_at')
    .single();

  if (restaurantError) throw restaurantError;

  if (pendingAdminQrPagoFile) {
    await saveRestaurantPaymentSettings(restaurant.id);
  }

  const mesas = Array.from({ length: mesasCount }, (_, index) => ({
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

  return { restaurant, mesasCount };
}

async function updateRestaurant(restaurantId, { nombre, ciudad, email, pin_mesero, pin_admin, mesas_count }) {
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

  await saveRestaurantPaymentSettings(restaurantId);
  const mesaSync = await syncRestaurantMesasCount(restaurantId, mesas_count);
  return { ...data, mesaSync };
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

  document.querySelectorAll('input[name="adminMetodoPago"]').forEach((input) => {
    if (input.dataset.bound) return;
    input.dataset.bound = 'true';
    input.addEventListener('change', () => {
      updateAdminPaymentFieldsVisibility(getAdminSelectedMetodoPago());
    });
  });

  const qrInput = document.getElementById('adminQrPagoInput');
  if (qrInput && !qrInput.dataset.bound) {
    qrInput.dataset.bound = 'true';
    qrInput.addEventListener('change', () => {
      const file = qrInput.files?.[0];
      if (!file) {
        resetAdminQrPagoField(currentAdminQrPagoUrl || '');
        return;
      }

      try {
        validateAdminPaymentImageFile(file);
        pendingAdminQrPagoFile = file;
        revokePendingAdminQrPagoPreview();
        pendingAdminQrPagoPreviewUrl = URL.createObjectURL(file);
        updateAdminQrPagoImageUI({
          src: pendingAdminQrPagoPreviewUrl,
          hint: file.name,
          btnText: 'Cambiar QR',
        });
        updateAdminQrPagoRemoveButton(true);
      } catch (error) {
        qrInput.value = '';
        showToast(error.message, 'error');
        resetAdminQrPagoField(currentAdminQrPagoUrl || '');
      }
    });
  }

  document.getElementById('adminQrPagoRemoveBtn')?.addEventListener('click', removeAdminQrPagoImage);

  const mesasInput = document.getElementById('restaurantMesasCount');
  mesasInput?.addEventListener('input', () => {
    updateRestaurantFormNote(mesasInput.value);
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

    let paymentValues;
    try {
      paymentValues = readAdminPaymentFormValues();
    } catch (error) {
      setRestaurantFormError(error.message);
      return;
    }

    const paymentError = validateAdminPaymentFormValues(paymentValues);
    if (paymentError) {
      setRestaurantFormError(paymentError);
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
        const mesaMsg =
          updated.mesaSync?.created > 0
            ? ` · ${updated.mesaSync.created} mesa${updated.mesaSync.created !== 1 ? 's' : ''} nueva${updated.mesaSync.created !== 1 ? 's' : ''}`
            : '';
        showToast(`Restaurante «${values.nombre}» actualizado${mesaMsg}`, 'success');
      } else {
        const { restaurant, mesasCount } = await createRestaurant(values);
        restaurants.unshift(restaurant);
        renderRestaurants();
        closeRestaurantModal();
        showToast(`Restaurante «${values.nombre}» creado con ${mesasCount} mesas`, 'success');
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
  bindAdminSubscriptionActions();
  bindAdminMenuAiActions();
  bindRestaurantModal();
  bindAdminTabs();

  document.getElementById('newRestaurantBtn')?.addEventListener('click', openNewRestaurantModal);

  const restored = await restoreSession();
  if (!restored) showLogin();
}

function switchAdminTab(tabId) {
  const activeTab = ['restaurants', 'crm', 'gastos'].includes(tabId) ? tabId : 'restaurants';

  const panels = {
    restaurants: document.getElementById('adminRestaurantsPanel'),
    crm: document.getElementById('adminCrmPanel'),
    gastos: document.getElementById('adminGastosPanel'),
  };

  const tabs = {
    restaurants: document.getElementById('adminTabRestaurants'),
    crm: document.getElementById('adminTabCrm'),
    gastos: document.getElementById('adminTabGastos'),
  };

  Object.entries(panels).forEach(([key, panel]) => {
    const isActive = key === activeTab;
    panel?.toggleAttribute('hidden', !isActive);
    tabs[key]?.classList.toggle('admin-tabs__btn--active', isActive);
    tabs[key]?.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  if (activeTab === 'crm' && typeof loadCrmData === 'function') {
    void loadCrmData();
  }

  if (activeTab === 'gastos' && typeof loadGastosData === 'function') {
    void loadGastosData(true);
  }
}

function bindAdminTabs() {
  document.querySelectorAll('[data-admin-tab]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', () => switchAdminTab(btn.dataset.adminTab));
  });
}

document.addEventListener('DOMContentLoaded', init);
