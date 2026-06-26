const ADMIN_SESSION_KEY = 'menuqr:adminSession';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';
const DEFAULT_MESAS_COUNT = 5;
const DEFAULT_METODO_PAGO = 'wompi';
const ADMIN_ASSETS_BUCKET = 'restaurantes';
const ALLOWED_PAYMENT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

let restaurants = [];
let slugManuallyEdited = false;
let busyIds = new Set();
let restaurantModalMode = 'create';
let pendingAdminQrPagoFile = null;
let pendingAdminQrPagoPreviewUrl = null;
let currentAdminQrPagoUrl = null;

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

  return {
    metodo_pago,
    wompi_public_key,
    link_pago,
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
      .select('id, nombre, slug, ciudad, email, pin_mesero, pin_admin, metodo_pago, wompi_public_key, link_pago, qr_pago_url')
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
  bindRestaurantModal();

  document.getElementById('newRestaurantBtn')?.addEventListener('click', openNewRestaurantModal);

  const restored = await restoreSession();
  if (!restored) showLogin();
}

document.addEventListener('DOMContentLoaded', init);
