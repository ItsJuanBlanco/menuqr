let menuProducts = [];
let categoryOrderRows = [];
let openCategoryName = null;
let draggingCategoryEl = null;
let menuSaving = false;
let menuReloading = false;
let menuOrderSaving = false;
const NEW_CATEGORY_VALUE = '__new__';
const PRODUCT_IMAGE_BUCKET = 'productos';
const ALLOWED_PRODUCT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

let pendingProductImageFile = null;
let pendingProductImagePreviewUrl = null;
let currentProductImageUrl = null;

function isMeseroPriceEnabled() {
  return hasRestaurantFeature(RESTAURANTE, 'comisiones');
}

function updateProductMeseroPriceFieldVisibility() {
  const field = document.getElementById('productPrecioMeseroField');
  if (field) field.hidden = !isMeseroPriceEnabled();
}

function parseOptionalPrecioInput(value) {
  const cleaned = String(value ?? '').trim();
  if (!cleaned) return null;
  const precio = parseInt(cleaned.replace(/\./g, '').replace(/,/g, ''), 10);
  return Number.isFinite(precio) && precio >= 0 ? precio : NaN;
}

function groupProductsByCategory(products) {
  const groups = new Map();

  products.forEach((product) => {
    const category = product.categoria?.trim() || 'Sin categoría';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(product);
  });

  const sortedEntries = sortCategoryNames([...groups.keys()], categoryOrderRows);

  return sortedEntries.map((category) => ({
    category,
    items: groups
      .get(category)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  }));
}

async function loadCategoryOrderRows() {
  try {
    categoryOrderRows = await fetchCategoryOrder(supabaseClient, RESTAURANTE_ID);
  } catch (error) {
    console.warn('No se pudo cargar categorias_orden:', error);
    categoryOrderRows = [];
  }
}

async function persistCategoryOrderFromDom() {
  const container = document.getElementById('menuList');
  if (!container || menuOrderSaving) return;

  const categoryNames = [...container.querySelectorAll('.menu-accordion__item')].map(
    (item) => item.dataset.category
  );

  if (!categoryNames.length) return;

  menuOrderSaving = true;

  try {
    await saveCategoryOrder(supabaseClient, RESTAURANTE_ID, categoryNames);
    categoryOrderRows = categoryNames.map((categoria, orden) => ({ categoria, orden }));
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo guardar el orden de categorías.', 'error');
    await reloadMenuProducts();
  } finally {
    menuOrderSaving = false;
  }
}

function setOpenCategory(categoryName) {
  openCategoryName = categoryName;

  document.querySelectorAll('.menu-accordion__item').forEach((item) => {
    const isOpen = item.dataset.category === categoryName;
    item.classList.toggle('menu-accordion__item--open', isOpen);

    const body = item.querySelector('.menu-accordion__body');
    const arrow = item.querySelector('.menu-accordion__arrow');
    const toggle = item.querySelector('[data-accordion-toggle]');

    if (body) body.hidden = !isOpen;
    if (arrow) arrow.textContent = isOpen ? '▼' : '▶';
    if (toggle) toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
}

async function reloadMenuProducts() {
  menuReloading = true;

  try {
    await loadCategoryOrderRows();

    const { data, error } = await supabaseClient
      .from('productos')
      .select('id, nombre, descripcion, precio, precio_mesero, categoria, disponible, imagen_url, restaurante_id')
      .eq('restaurante_id', RESTAURANTE_ID)
      .order('nombre', { ascending: true });

    if (error) throw error;

    menuProducts = structuredClone(data || []);

    if (
      openCategoryName &&
      !menuProducts.some((product) => (product.categoria?.trim() || 'Sin categoría') === openCategoryName)
    ) {
      openCategoryName = null;
    }

    renderMenuList();

    if (typeof updateHeaderCount === 'function') updateHeaderCount();
  } finally {
    menuReloading = false;
  }
}

/** Alias usado por panel.js (realtime, tabs, init) */
async function fetchMenuProducts() {
  await reloadMenuProducts();
}

function renderMenuList() {
  const container = document.getElementById('menuList');
  if (!container) return;

  container.textContent = '';

  if (menuProducts.length === 0) {
    container.innerHTML =
      '<p class="panel-empty__text">No hay productos. Agrega el primero con el botón de arriba.</p>';
    return;
  }

  const groups = groupProductsByCategory(menuProducts);
  const fragment = document.createDocumentFragment();

  groups.forEach(({ category, items }) => {
    const isOpen = openCategoryName === category;
    const item = document.createElement('div');
    item.className = `menu-accordion__item${isOpen ? ' menu-accordion__item--open' : ''}`;
    item.dataset.category = category;
    item.draggable = true;
    item.setAttribute('role', 'listitem');

    item.innerHTML = `
      <div class="menu-accordion__row">
        <span class="menu-accordion__drag" aria-hidden="true" title="Arrastrar para reordenar">⠿</span>
        <button
          type="button"
          class="menu-accordion__header"
          data-accordion-toggle
          aria-expanded="${isOpen ? 'true' : 'false'}"
        >
          <span class="menu-accordion__arrow" aria-hidden="true">${isOpen ? '▼' : '▶'}</span>
          <span class="menu-accordion__label">${escapeHtml(category)}</span>
          <span class="menu-accordion__count">(${items.length})</span>
        </button>
      </div>
      <div class="menu-accordion__body"${isOpen ? '' : ' hidden'}>
        <ul class="menu-section__list">
          ${items.map((product) => renderMenuProductRow(product)).join('')}
        </ul>
      </div>
    `;

    fragment.appendChild(item);
  });

  container.appendChild(fragment);
}

function renderMenuProductRow(product) {
  const available = product.disponible !== false;

  return `
    <li class="menu-product${available ? '' : ' menu-product--off'}" data-product-id="${product.id}">
      <div class="menu-product__info">
        <p class="menu-product__name">${escapeHtml(product.nombre)}</p>
        <p class="menu-product__desc">${escapeHtml(product.descripcion || 'Sin descripción')}</p>
        <p class="menu-product__price">${formatCOP(Number(product.precio))}</p>
      </div>
      <div class="menu-product__actions">
        <span class="menu-product__badge${available ? ' menu-product__badge--on' : ' menu-product__badge--off'}">
          ${available ? 'Disponible' : 'No disponible'}
        </span>
        <button type="button" class="menu-product__btn" data-menu-action="toggle" data-product-id="${product.id}">
          ${available ? 'Desactivar' : 'Activar'}
        </button>
        <button type="button" class="menu-product__btn menu-product__btn--edit" data-menu-action="edit" data-product-id="${product.id}">Editar</button>
        <button type="button" class="menu-product__btn menu-product__btn--delete" data-menu-action="delete" data-product-id="${product.id}">Eliminar</button>
      </div>
    </li>
  `;
}

async function refreshMenuAfterChange(successMessage) {
  closeProductModal();
  await reloadMenuProducts();
  if (successMessage) showToast(successMessage, 'success');
}

function getProductCategories() {
  const categories = new Set();
  menuProducts.forEach((product) => {
    const category = product.categoria?.trim();
    if (category) categories.add(category);
  });
  return sortCategoryNames([...categories], categoryOrderRows);
}

function populateProductCategorySelect(selectedCategory = '') {
  const select = document.getElementById('productCategoriaSelect');
  const customField = document.getElementById('productCategoriaCustomField');
  const customInput = document.getElementById('productCategoriaCustom');
  if (!select) return;

  const categories = getProductCategories();
  const categoryOptions = categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join('');

  select.innerHTML = `
    <option value="" disabled>Elegí una categoría</option>
    ${categoryOptions}
    <option value="${NEW_CATEGORY_VALUE}">+ Añadir otra categoría</option>
  `;

  const normalized = selectedCategory?.trim() || '';

  if (normalized && categories.includes(normalized)) {
    select.value = normalized;
    if (customField) customField.hidden = true;
    if (customInput) {
      customInput.value = '';
      customInput.required = false;
    }
    return;
  }

  if (normalized) {
    select.value = NEW_CATEGORY_VALUE;
    if (customField) customField.hidden = false;
    if (customInput) {
      customInput.value = normalized;
      customInput.required = true;
    }
    return;
  }

  select.value = categories.length ? categories[0] : NEW_CATEGORY_VALUE;
  if (select.value === NEW_CATEGORY_VALUE) {
    if (customField) customField.hidden = false;
    if (customInput) {
      customInput.value = '';
      customInput.required = true;
    }
  } else {
    if (customField) customField.hidden = true;
    if (customInput) {
      customInput.value = '';
      customInput.required = false;
    }
  }
}

function getProductCategoryValue() {
  const select = document.getElementById('productCategoriaSelect');
  if (select?.value === NEW_CATEGORY_VALUE) {
    return document.getElementById('productCategoriaCustom')?.value.trim() || '';
  }
  return select?.value?.trim() || '';
}

function bindProductCategorySelect() {
  const select = document.getElementById('productCategoriaSelect');
  if (!select || select.dataset.bound) return;
  select.dataset.bound = 'true';

  select.addEventListener('change', () => {
    const customField = document.getElementById('productCategoriaCustomField');
    const customInput = document.getElementById('productCategoriaCustom');
    const isNew = select.value === NEW_CATEGORY_VALUE;

    if (customField) customField.hidden = !isNew;
    if (customInput) {
      customInput.required = isNew;
      if (!isNew) customInput.value = '';
      else customInput.focus();
    }
  });
}

function getProductImageStoragePath(productId) {
  return `${RESTAURANTE_ID}/${productId}.jpg`;
}

function getProductImagePublicUrl(productId) {
  return `${SUPABASE_URL}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${getProductImageStoragePath(productId)}`;
}

function revokePendingProductImagePreview() {
  if (pendingProductImagePreviewUrl) {
    URL.revokeObjectURL(pendingProductImagePreviewUrl);
    pendingProductImagePreviewUrl = null;
  }
}

function updateProductImageUI({ src = '', hint = '', btnText = 'Elegir imagen', showClear = false } = {}) {
  const preview = document.getElementById('productImagePreview');
  const img = document.getElementById('productImagePreviewImg');
  const hintEl = document.getElementById('productImageHint');
  const btnTextEl = document.getElementById('productImageBtnText');
  const clearBtn = document.getElementById('productImageClearBtn');

  if (img) {
    if (src) {
      img.onerror = () => {
        img.onerror = null;
        updateProductImageUI({
          hint: 'No se pudo cargar la imagen. Subí una nueva.',
          btnText: 'Elegir imagen',
          showClear: false,
        });
      };
      img.src = src;
      img.alt = 'Vista previa del producto';
    } else {
      img.onerror = null;
      img.removeAttribute('src');
      img.alt = '';
    }
  }

  if (preview) preview.hidden = !src;
  if (hintEl) hintEl.textContent = hint;
  if (btnTextEl) btnTextEl.textContent = btnText;
  if (clearBtn) clearBtn.hidden = !showClear;
}

function resetProductImageField(existingUrl = '') {
  const fileInput = document.getElementById('productImagen');
  pendingProductImageFile = null;
  currentProductImageUrl = existingUrl || null;
  revokePendingProductImagePreview();
  if (fileInput) fileInput.value = '';

  if (existingUrl) {
    updateProductImageUI({
      src: existingUrl,
      hint: 'Imagen actual. Elegí otra para reemplazarla.',
      btnText: 'Cambiar imagen',
      showClear: false,
    });
    return;
  }

  updateProductImageUI({
    hint: 'JPG, PNG o WEBP · opcional',
    btnText: 'Elegir imagen',
    showClear: false,
  });
}

function validateProductImageFile(file) {
  if (!file) return null;
  if (!ALLOWED_PRODUCT_IMAGE_TYPES.has(file.type)) {
    throw new Error('Solo se permiten imágenes JPG, PNG o WEBP.');
  }
  return file;
}

async function uploadProductImage(productId, file) {
  const path = getProductImageStoragePath(productId);
  const contentType =
    file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';

  const { error } = await supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, {
    upsert: true,
    contentType,
  });

  if (error) throw error;
  return getProductImagePublicUrl(productId);
}

function bindProductImageField() {
  const fileInput = document.getElementById('productImagen');
  const clearBtn = document.getElementById('productImageClearBtn');
  if (!fileInput || fileInput.dataset.bound) return;
  fileInput.dataset.bound = 'true';

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) {
      resetProductImageField(currentProductImageUrl || '');
      return;
    }

    try {
      validateProductImageFile(file);
    } catch (error) {
      fileInput.value = '';
      showToast(error.message, 'error');
      resetProductImageField(currentProductImageUrl || '');
      return;
    }

    pendingProductImageFile = file;
    revokePendingProductImagePreview();
    pendingProductImagePreviewUrl = URL.createObjectURL(file);
    updateProductImageUI({
      src: pendingProductImagePreviewUrl,
      hint: file.name,
      btnText: 'Cambiar imagen',
      showClear: true,
    });
  });

  clearBtn?.addEventListener('click', () => {
    resetProductImageField(currentProductImageUrl || '');
  });
}

function openProductModal(product = null) {
  const modal = document.getElementById('productModal');
  const title = document.getElementById('productModalTitle');
  const form = document.getElementById('productForm');

  form.reset();
  document.getElementById('productId').value = product?.id || '';
  document.getElementById('productNombre').value = product?.nombre || '';
  document.getElementById('productDescripcion').value = product?.descripcion || '';
  document.getElementById('productPrecio').value = product?.precio ?? '';
  const precioMeseroInput = document.getElementById('productPrecioMesero');
  if (precioMeseroInput) {
    precioMeseroInput.value =
      product?.precio_mesero != null && product?.precio_mesero !== '' ? product.precio_mesero : '';
  }
  updateProductMeseroPriceFieldVisibility();
  populateProductCategorySelect(product?.categoria || '');
  document.getElementById('productDisponible').checked = product ? product.disponible !== false : true;
  resetProductImageField(product?.imagen_url || '');

  title.textContent = product ? 'Editar producto' : 'Agregar producto';
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('productNombre').focus();
}

function closeProductModal() {
  const modal = document.getElementById('productModal');
  if (!modal) return;
  revokePendingProductImagePreview();
  pendingProductImageFile = null;
  currentProductImageUrl = null;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
}

function parsePrecioInput(value) {
  const cleaned = String(value).trim().replace(/\./g, '').replace(/,/g, '');
  const precio = parseInt(cleaned, 10);
  return Number.isFinite(precio) && precio >= 0 ? precio : NaN;
}

function readProductFormPayload() {
  const precio = parsePrecioInput(document.getElementById('productPrecio').value);
  const payload = {
    nombre: document.getElementById('productNombre').value.trim(),
    descripcion: document.getElementById('productDescripcion').value.trim() || null,
    precio,
    categoria: getProductCategoryValue(),
    disponible: document.getElementById('productDisponible').checked,
  };

  if (isMeseroPriceEnabled()) {
    const precioMesero = parseOptionalPrecioInput(document.getElementById('productPrecioMesero')?.value);
    if (Number.isNaN(precioMesero)) {
      payload.precio_mesero = '__invalid__';
    } else {
      payload.precio_mesero = precioMesero;
    }
  }

  return payload;
}

async function saveProduct(event) {
  event.preventDefault();
  if (menuSaving) return;

  const id = document.getElementById('productId').value;
  const payload = readProductFormPayload();

  if (!payload.nombre || !payload.categoria || Number.isNaN(payload.precio)) {
    showToast('Completa nombre, categoría y precio.', 'error');
    return;
  }

  if (payload.precio_mesero === '__invalid__') {
    showToast('El precio mesero debe ser un número válido.', 'error');
    return;
  }

  menuSaving = true;
  document.getElementById('productSaveBtn').disabled = true;

  try {
    let productId = id;
    const imageFile = pendingProductImageFile;
    const savePayload = {
      nombre: payload.nombre,
      descripcion: payload.descripcion,
      precio: payload.precio,
      categoria: payload.categoria,
      disponible: payload.disponible,
    };

    if (isMeseroPriceEnabled()) {
      savePayload.precio_mesero = payload.precio_mesero;
    }

    if (id) {
      const { error } = await supabaseClient.from('productos').update(savePayload).eq('id', id);

      if (error) throw error;
    } else {
      const { data, error } = await supabaseClient
        .from('productos')
        .insert({
          ...savePayload,
          restaurante_id: RESTAURANTE_ID,
        })
        .select('id')
        .single();

      if (error) throw error;
      productId = data.id;
    }

    if (imageFile) {
      const imagen_url = await uploadProductImage(productId, imageFile);
      const { error: imageError } = await supabaseClient
        .from('productos')
        .update({ imagen_url })
        .eq('id', productId);

      if (imageError) throw imageError;
    }

    await refreshMenuAfterChange(id ? 'Producto actualizado' : 'Producto agregado');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo guardar el producto.', 'error');
  } finally {
    menuSaving = false;
    document.getElementById('productSaveBtn').disabled = false;
  }
}

async function toggleProductAvailability(productId) {
  const product = menuProducts.find((p) => p.id === productId);
  if (!product || menuSaving) return;

  const newValue = product.disponible === false;
  menuSaving = true;

  try {
    const { error } = await supabaseClient
      .from('productos')
      .update({ disponible: newValue })
      .eq('id', productId);

    if (error) throw error;
    await reloadMenuProducts();
    showToast(newValue ? 'Producto activado' : 'Producto desactivado', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo cambiar la disponibilidad.', 'error');
  } finally {
    menuSaving = false;
  }
}

async function deleteProduct(productId) {
  const product = menuProducts.find((p) => p.id === productId);
  if (!product || menuSaving) return;

  const confirmed = window.confirm(`¿Eliminar "${product.nombre}"? Esta acción no se puede deshacer.`);
  if (!confirmed) return;

  menuSaving = true;

  try {
    const { error } = await supabaseClient.from('productos').delete().eq('id', productId);
    if (error) throw error;
    await reloadMenuProducts();
    showToast('Producto eliminado', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo eliminar. Puede estar en pedidos activos.', 'error');
  } finally {
    menuSaving = false;
  }
}

function bindMenuAccordion() {
  const list = document.getElementById('menuList');
  if (!list || list.dataset.accordionBound) return;
  list.dataset.accordionBound = 'true';

  list.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-accordion-toggle]');
    if (!toggle) return;

    const item = toggle.closest('.menu-accordion__item');
    const category = item?.dataset.category;
    if (!category) return;

    setOpenCategory(openCategoryName === category ? null : category);
  });

  list.addEventListener('dragstart', (event) => {
    const item = event.target.closest('.menu-accordion__item');
    if (!item) return;

    draggingCategoryEl = item;
    item.classList.add('menu-accordion__item--dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.dataset.category || '');
  });

  list.addEventListener('dragover', (event) => {
    if (!draggingCategoryEl) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const target = event.target.closest('.menu-accordion__item');
    if (!target || target === draggingCategoryEl) return;

    const rect = target.getBoundingClientRect();
    const insertBefore = event.clientY < rect.top + rect.height / 2;

    if (insertBefore) {
      list.insertBefore(draggingCategoryEl, target);
    } else {
      list.insertBefore(draggingCategoryEl, target.nextSibling);
    }
  });

  list.addEventListener('drop', (event) => {
    event.preventDefault();
  });

  list.addEventListener('dragend', () => {
    if (!draggingCategoryEl) return;

    draggingCategoryEl.classList.remove('menu-accordion__item--dragging');
    draggingCategoryEl = null;
    persistCategoryOrderFromDom();
  });
}

function bindMenuActions() {
  document.getElementById('addProductBtn')?.addEventListener('click', () => openProductModal());

  document.getElementById('productForm')?.addEventListener('submit', saveProduct);

  document.querySelectorAll('[data-close-product-modal]').forEach((el) => {
    el.addEventListener('click', closeProductModal);
  });

  bindMenuAccordion();

  document.getElementById('menuList')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-menu-action]');
    if (!btn) return;

    const { menuAction, productId } = btn.dataset;
    if (menuAction === 'edit') {
      const product = menuProducts.find((p) => p.id === productId);
      if (product) openProductModal(product);
    } else if (menuAction === 'toggle') {
      toggleProductAvailability(productId);
    } else if (menuAction === 'delete') {
      deleteProduct(productId);
    }
  });
}

function initMenuPanel() {
  bindProductCategorySelect();
  bindProductImageField();
  bindMenuActions();
  updateProductMeseroPriceFieldVisibility();
}

document.addEventListener('DOMContentLoaded', initMenuPanel);
