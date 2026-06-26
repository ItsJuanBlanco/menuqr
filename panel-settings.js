const SETTINGS_ASSETS_BUCKET = 'restaurantes';
const ALLOWED_SETTINGS_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DEFAULT_COLOR_PRIMARY = '#FF6B00';
const DEFAULT_COLOR_BG = '#0a0a0c';
const DEFAULT_COVER_POSITION = '50%';
const DEFAULT_METODO_PAGO = 'wompi';

let settingsSaving = false;
let pendingLogoFile = null;
let pendingCoverFile = null;
let pendingQrPagoFile = null;
let pendingLogoPreviewUrl = null;
let pendingCoverPreviewUrl = null;
let pendingQrPagoPreviewUrl = null;
let currentLogoUrl = null;
let currentCoverUrl = null;
let currentQrPagoUrl = null;

function normalizeHexColor(value, fallback) {
  const raw = String(value || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw.toLowerCase();
  return fallback;
}

function normalizeCoverPosition(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,3})%?$/);
  if (match) {
    const num = Math.min(100, Math.max(0, parseInt(match[1], 10)));
    return `${num}%`;
  }
  return DEFAULT_COVER_POSITION;
}

function coverPositionToPercent(value) {
  return parseInt(normalizeCoverPosition(value), 10);
}

function applyCoverPositionPreview(percent) {
  const img = document.getElementById('settingsCoverPreviewImg');
  const valueLabel = document.getElementById('settingsCoverPositionValue');
  const slider = document.getElementById('settingsCoverPosition');
  const safePercent = Math.min(100, Math.max(0, Number(percent) || 50));

  if (slider) slider.value = String(safePercent);
  if (valueLabel) valueLabel.textContent = `${safePercent}%`;
  if (img?.src) img.style.objectPosition = `center ${safePercent}%`;
}

function updateLogoRemoveButton(hasImage) {
  const btn = document.getElementById('settingsLogoRemoveBtn');
  if (btn) btn.hidden = !hasImage;
}

function updateCoverExtraControls(hasImage, position = DEFAULT_COVER_POSITION) {
  const removeBtn = document.getElementById('settingsCoverRemoveBtn');
  const positionWrap = document.getElementById('settingsCoverPositionWrap');

  if (removeBtn) removeBtn.hidden = !hasImage;
  if (positionWrap) positionWrap.hidden = !hasImage;

  if (hasImage) applyCoverPositionPreview(coverPositionToPercent(position));
}

async function syncRestaurantSettings(data) {
  setRestaurantGlobals({ restaurant: data });
  applyRestaurantBranding(data);
  applyRestaurantTheme(data);
  applyRestaurantCover(data);
  populateSettingsForm(data);
}

async function updateRestaurantSettingsFields(fields, successMessage) {
  if (settingsSaving) return;

  settingsSaving = true;
  const saveBtn = document.getElementById('settingsSaveBtn');
  const errorEl = document.getElementById('settingsFormError');

  if (saveBtn) saveBtn.disabled = true;
  if (errorEl) errorEl.hidden = true;

  try {
    const { data, error } = await supabaseClient
      .from('restaurantes')
      .update(fields)
      .eq('id', RESTAURANTE_ID)
      .select(
        'id, slug, nombre, ciudad, logo_url, foto_portada, foto_portada_posicion, color_primario, color_fondo, wompi_public_key, metodo_pago, qr_pago_url, link_pago, google_review_url'
      )
      .single();

    if (error) throw error;

    await syncRestaurantSettings(data);
    pendingLogoFile = null;
    pendingCoverFile = null;
    pendingQrPagoFile = null;
    showToast(successMessage, 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudieron guardar los ajustes.', 'error');
  } finally {
    settingsSaving = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function removeRestaurantLogo() {
  if (!currentLogoUrl && !pendingLogoFile) return;
  if (!window.confirm('¿Quitar el logo del restaurante?')) return;

  await updateRestaurantSettingsFields({ logo_url: null }, 'Logo quitado');
}

async function removeRestaurantCover() {
  if (!currentCoverUrl && !pendingCoverFile) return;
  if (!window.confirm('¿Quitar la foto de portada?')) return;

  await updateRestaurantSettingsFields(
    { foto_portada: null, foto_portada_posicion: DEFAULT_COVER_POSITION },
    'Portada quitada'
  );
}

async function removeRestaurantQrPago() {
  if (!currentQrPagoUrl && !pendingQrPagoFile) return;
  if (!window.confirm('¿Quitar el QR de pago?')) return;

  await updateRestaurantSettingsFields({ qr_pago_url: null }, 'QR de pago quitado');
}

function normalizeMetodoPago(value) {
  return value === 'qr_propio' ? 'qr_propio' : DEFAULT_METODO_PAGO;
}

function getSelectedMetodoPago() {
  const selected = document.querySelector('input[name="settingsMetodoPago"]:checked');
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

function normalizeGoogleReviewUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) {
    throw new Error('El link de Google Reviews debe empezar con http:// o https://');
  }
  return raw;
}

function updatePaymentMethodSection(metodo) {
  const qrSection = document.getElementById('settingsQrPagoSection');
  if (qrSection) qrSection.hidden = metodo !== 'qr_propio';
}

function updateQrPagoRemoveButton(hasImage) {
  const btn = document.getElementById('settingsQrPagoRemoveBtn');
  if (btn) btn.hidden = !hasImage;
}

function revokePendingQrPagoPreview() {
  if (pendingQrPagoPreviewUrl) {
    URL.revokeObjectURL(pendingQrPagoPreviewUrl);
    pendingQrPagoPreviewUrl = null;
  }
}

function getSettingsAssetPath(filename) {
  return `${RESTAURANTE_ID}/${filename}`;
}

function getSettingsAssetPublicUrl(filename) {
  return `${SUPABASE_URL}/storage/v1/object/public/${SETTINGS_ASSETS_BUCKET}/${getSettingsAssetPath(filename)}`;
}

function revokePendingLogoPreview() {
  if (pendingLogoPreviewUrl) {
    URL.revokeObjectURL(pendingLogoPreviewUrl);
    pendingLogoPreviewUrl = null;
  }
}

function revokePendingCoverPreview() {
  if (pendingCoverPreviewUrl) {
    URL.revokeObjectURL(pendingCoverPreviewUrl);
    pendingCoverPreviewUrl = null;
  }
}

function validateSettingsImageFile(file) {
  if (!file) return null;
  if (!ALLOWED_SETTINGS_IMAGE_TYPES.has(file.type)) {
    throw new Error('Solo se permiten imágenes JPG, PNG o WEBP.');
  }
  return file;
}

function getImageExtension(file) {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

async function uploadSettingsAsset(filename, file) {
  const path = getSettingsAssetPath(filename);
  const contentType =
    file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';

  const { error } = await supabaseClient.storage.from(SETTINGS_ASSETS_BUCKET).upload(path, file, {
    upsert: true,
    contentType,
  });

  if (error) throw error;
  return getSettingsAssetPublicUrl(filename);
}

function updateSettingsImageUI({ previewId, imgId, hintId, btnId, src = '', hint = '', btnText = 'Elegir imagen' }) {
  const preview = document.getElementById(previewId);
  const img = document.getElementById(imgId);
  const hintEl = document.getElementById(hintId);
  const btnTextEl = document.getElementById(btnId);

  if (img) {
    if (src) {
      img.src = src;
    } else {
      img.removeAttribute('src');
    }
  }

  if (preview) preview.hidden = !src;
  if (hintEl) hintEl.textContent = hint;
  if (btnTextEl) btnTextEl.textContent = btnText;
}

function resetLogoField(url = '') {
  const input = document.getElementById('settingsLogoInput');
  pendingLogoFile = null;
  currentLogoUrl = url || null;
  revokePendingLogoPreview();
  if (input) input.value = '';

  if (url) {
    updateSettingsImageUI({
      previewId: 'settingsLogoPreview',
      imgId: 'settingsLogoPreviewImg',
      hintId: 'settingsLogoHint',
      btnId: 'settingsLogoBtnText',
      src: url,
      hint: 'Logo actual. Elegí otra imagen para reemplazarlo.',
      btnText: 'Cambiar logo',
    });
    updateLogoRemoveButton(true);
    return;
  }

  updateSettingsImageUI({
    previewId: 'settingsLogoPreview',
    imgId: 'settingsLogoPreviewImg',
    hintId: 'settingsLogoHint',
    btnId: 'settingsLogoBtnText',
    hint: 'JPG, PNG o WEBP',
    btnText: 'Subir logo',
  });
  updateLogoRemoveButton(false);
}

function resetQrPagoField(url = '') {
  const input = document.getElementById('settingsQrPagoInput');
  pendingQrPagoFile = null;
  currentQrPagoUrl = url || null;
  revokePendingQrPagoPreview();
  if (input) input.value = '';

  if (url) {
    updateSettingsImageUI({
      previewId: 'settingsQrPagoPreview',
      imgId: 'settingsQrPagoPreviewImg',
      hintId: 'settingsQrPagoHint',
      btnId: 'settingsQrPagoBtnText',
      src: url,
      hint: 'QR actual. Elegí otra imagen para reemplazarlo.',
      btnText: 'Cambiar QR',
    });
    updateQrPagoRemoveButton(true);
    return;
  }

  updateSettingsImageUI({
    previewId: 'settingsQrPagoPreview',
    imgId: 'settingsQrPagoPreviewImg',
    hintId: 'settingsQrPagoHint',
    btnId: 'settingsQrPagoBtnText',
    hint: 'JPG, PNG o WEBP',
    btnText: 'Subir QR',
  });
  updateQrPagoRemoveButton(false);
}

function resetCoverField(url = '', position = DEFAULT_COVER_POSITION) {
  const input = document.getElementById('settingsCoverInput');
  pendingCoverFile = null;
  currentCoverUrl = url || null;
  revokePendingCoverPreview();
  if (input) input.value = '';

  if (url) {
    updateSettingsImageUI({
      previewId: 'settingsCoverPreview',
      imgId: 'settingsCoverPreviewImg',
      hintId: 'settingsCoverHint',
      btnId: 'settingsCoverBtnText',
      src: url,
      hint: 'Portada actual. Elegí otra imagen para reemplazarla.',
      btnText: 'Cambiar portada',
    });
    updateCoverExtraControls(true, position);
    return;
  }

  updateSettingsImageUI({
    previewId: 'settingsCoverPreview',
    imgId: 'settingsCoverPreviewImg',
    hintId: 'settingsCoverHint',
    btnId: 'settingsCoverBtnText',
    hint: 'JPG, PNG o WEBP · banner en la carta',
    btnText: 'Subir portada',
  });
  updateCoverExtraControls(false);
}

function populateSettingsForm(restaurant) {
  const primaryInput = document.getElementById('settingsColorPrimary');
  const bgInput = document.getElementById('settingsColorBg');

  const primary = normalizeHexColor(restaurant?.color_primario, DEFAULT_COLOR_PRIMARY);
  const bg = normalizeHexColor(restaurant?.color_fondo, DEFAULT_COLOR_BG);

  if (primaryInput) primaryInput.value = primary;
  if (bgInput) bgInput.value = bg;

  resetLogoField(restaurant?.logo_url || '');
  resetCoverField(restaurant?.foto_portada || '', restaurant?.foto_portada_posicion || DEFAULT_COVER_POSITION);

  const metodo = normalizeMetodoPago(restaurant?.metodo_pago);
  document.querySelectorAll('input[name="settingsMetodoPago"]').forEach((input) => {
    input.checked = input.value === metodo;
  });
  updatePaymentMethodSection(metodo);
  resetQrPagoField(restaurant?.qr_pago_url || '');

  const linkInput = document.getElementById('settingsLinkPago');
  if (linkInput) linkInput.value = restaurant?.link_pago || '';

  const googleReviewInput = document.getElementById('settingsGoogleReviewUrl');
  if (googleReviewInput) googleReviewInput.value = restaurant?.google_review_url || '';
}

async function fetchRestaurantSettings() {
  const { data, error } = await supabaseClient
    .from('restaurantes')
    .select(
      'id, slug, nombre, ciudad, logo_url, foto_portada, foto_portada_posicion, color_primario, color_fondo, metodo_pago, qr_pago_url, link_pago, google_review_url'
    )
    .eq('id', RESTAURANTE_ID)
    .single();

  if (error) throw error;
  return data;
}

async function loadRestaurantSettings() {
  try {
    const data = await fetchRestaurantSettings();
    setRestaurantGlobals({ restaurant: { ...RESTAURANTE, ...data } });
    populateSettingsForm(data);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudieron cargar los ajustes.', 'error');
  }
}

async function saveRestaurantSettings(event) {
  event.preventDefault();
  if (settingsSaving) return;

  const primaryInput = document.getElementById('settingsColorPrimary');
  const bgInput = document.getElementById('settingsColorBg');
  const coverPositionInput = document.getElementById('settingsCoverPosition');
  const saveBtn = document.getElementById('settingsSaveBtn');
  const errorEl = document.getElementById('settingsFormError');

  const color_primario = normalizeHexColor(primaryInput?.value, DEFAULT_COLOR_PRIMARY);
  const color_fondo = normalizeHexColor(bgInput?.value, DEFAULT_COLOR_BG);
  const foto_portada_posicion = normalizeCoverPosition(coverPositionInput?.value);
  const metodo_pago = getSelectedMetodoPago();
  const linkInput = document.getElementById('settingsLinkPago');
  const googleReviewInput = document.getElementById('settingsGoogleReviewUrl');
  let link_pago = null;
  let google_review_url = null;

  try {
    link_pago = normalizeLinkPago(linkInput?.value);
    google_review_url = normalizeGoogleReviewUrl(googleReviewInput?.value);
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    } else {
      showToast(error.message, 'error');
    }
    return;
  }

  if (metodo_pago === 'qr_propio' && !link_pago && !currentQrPagoUrl && !pendingQrPagoFile) {
    if (errorEl) {
      errorEl.textContent = 'Agregá un link de pago o subí la imagen del QR.';
      errorEl.hidden = false;
    } else {
      showToast('Agregá un link de pago o subí la imagen del QR.', 'error');
    }
    return;
  }

  if (primaryInput) primaryInput.value = color_primario;
  if (bgInput) bgInput.value = color_fondo;
  applyCoverPositionPreview(coverPositionToPercent(foto_portada_posicion));

  settingsSaving = true;
  if (saveBtn) saveBtn.disabled = true;
  if (errorEl) errorEl.hidden = true;

  try {
    let logo_url = currentLogoUrl;
    let foto_portada = currentCoverUrl;
    let qr_pago_url = currentQrPagoUrl;

    if (pendingLogoFile) {
      logo_url = await uploadSettingsAsset(`logo.${getImageExtension(pendingLogoFile)}`, pendingLogoFile);
    }

    if (pendingCoverFile) {
      foto_portada = await uploadSettingsAsset(
        `portada.${getImageExtension(pendingCoverFile)}`,
        pendingCoverFile
      );
    }

    if (pendingQrPagoFile) {
      qr_pago_url = await uploadSettingsAsset(
        `qr-pago.${getImageExtension(pendingQrPagoFile)}`,
        pendingQrPagoFile
      );
    }

    const { data, error } = await supabaseClient
      .from('restaurantes')
      .update({
        color_primario,
        color_fondo,
        logo_url,
        foto_portada,
        foto_portada_posicion,
        metodo_pago,
        qr_pago_url,
        link_pago,
        google_review_url,
      })
      .eq('id', RESTAURANTE_ID)
      .select(
        'id, slug, nombre, ciudad, logo_url, foto_portada, foto_portada_posicion, color_primario, color_fondo, wompi_public_key, metodo_pago, qr_pago_url, link_pago, google_review_url'
      )
      .single();

    if (error) throw error;

    await syncRestaurantSettings(data);
    pendingLogoFile = null;
    pendingCoverFile = null;
    pendingQrPagoFile = null;

    showToast('Ajustes guardados', 'success');
  } catch (error) {
    console.error(error);
    if (errorEl) {
      errorEl.textContent = error.message || 'No se pudieron guardar los ajustes.';
      errorEl.hidden = false;
    } else {
      showToast(error.message || 'No se pudieron guardar los ajustes.', 'error');
    }
  } finally {
    settingsSaving = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

function bindSettingsImageField(inputId, { onFile, onReset }) {
  const input = document.getElementById(inputId);
  if (!input || input.dataset.bound) return;
  input.dataset.bound = 'true';

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) {
      onReset();
      return;
    }

    try {
      validateSettingsImageFile(file);
      onFile(file);
    } catch (error) {
      input.value = '';
      showToast(error.message, 'error');
      onReset();
    }
  });
}

function bindSettingsForm() {
  const form = document.getElementById('settingsForm');
  form?.addEventListener('submit', saveRestaurantSettings);

  bindSettingsImageField('settingsLogoInput', {
    onFile: (file) => {
      pendingLogoFile = file;
      revokePendingLogoPreview();
      pendingLogoPreviewUrl = URL.createObjectURL(file);
      updateSettingsImageUI({
        previewId: 'settingsLogoPreview',
        imgId: 'settingsLogoPreviewImg',
        hintId: 'settingsLogoHint',
        btnId: 'settingsLogoBtnText',
        src: pendingLogoPreviewUrl,
        hint: file.name,
        btnText: 'Cambiar logo',
      });
      updateLogoRemoveButton(true);
    },
    onReset: () => resetLogoField(currentLogoUrl || ''),
  });

  bindSettingsImageField('settingsCoverInput', {
    onFile: (file) => {
      pendingCoverFile = file;
      revokePendingCoverPreview();
      pendingCoverPreviewUrl = URL.createObjectURL(file);
      const position = document.getElementById('settingsCoverPosition')?.value || '50';
      updateSettingsImageUI({
        previewId: 'settingsCoverPreview',
        imgId: 'settingsCoverPreviewImg',
        hintId: 'settingsCoverHint',
        btnId: 'settingsCoverBtnText',
        src: pendingCoverPreviewUrl,
        hint: file.name,
        btnText: 'Cambiar portada',
      });
      updateCoverExtraControls(true, `${position}%`);
    },
    onReset: () =>
      resetCoverField(
        currentCoverUrl || '',
        document.getElementById('settingsCoverPosition')?.value
          ? `${document.getElementById('settingsCoverPosition').value}%`
          : DEFAULT_COVER_POSITION
      ),
  });

  bindSettingsImageField('settingsQrPagoInput', {
    onFile: (file) => {
      pendingQrPagoFile = file;
      revokePendingQrPagoPreview();
      pendingQrPagoPreviewUrl = URL.createObjectURL(file);
      updateSettingsImageUI({
        previewId: 'settingsQrPagoPreview',
        imgId: 'settingsQrPagoPreviewImg',
        hintId: 'settingsQrPagoHint',
        btnId: 'settingsQrPagoBtnText',
        src: pendingQrPagoPreviewUrl,
        hint: file.name,
        btnText: 'Cambiar QR',
      });
      updateQrPagoRemoveButton(true);
    },
    onReset: () => resetQrPagoField(currentQrPagoUrl || ''),
  });

  document.querySelectorAll('input[name="settingsMetodoPago"]').forEach((input) => {
    if (input.dataset.bound) return;
    input.dataset.bound = 'true';
    input.addEventListener('change', () => {
      updatePaymentMethodSection(getSelectedMetodoPago());
    });
  });

  document.getElementById('settingsLogoRemoveBtn')?.addEventListener('click', removeRestaurantLogo);
  document.getElementById('settingsCoverRemoveBtn')?.addEventListener('click', removeRestaurantCover);
  document.getElementById('settingsQrPagoRemoveBtn')?.addEventListener('click', removeRestaurantQrPago);

  document.getElementById('settingsCoverPosition')?.addEventListener('input', (event) => {
    applyCoverPositionPreview(event.target.value);
  });
}

function initSettingsPanel() {
  bindSettingsForm();
  if (RESTAURANTE) populateSettingsForm(RESTAURANTE);
}

document.addEventListener('DOMContentLoaded', initSettingsPanel);
