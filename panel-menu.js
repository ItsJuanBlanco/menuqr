let menuProducts = [];
let menuSaving = false;
let menuReloading = false;

function groupProductsByCategory(products) {
  const groups = new Map();

  products.forEach((product) => {
    const category = product.categoria?.trim() || 'Sin categoría';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(product);
  });

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([category, items]) => ({
      category,
      items: items.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    }));
}

async function reloadMenuProducts() {
  menuReloading = true;

  try {
    const { data, error } = await supabaseClient
      .from('productos')
      .select('id, nombre, descripcion, precio, categoria, disponible, imagen_url, restaurante_id')
      .eq('restaurante_id', RESTAURANTE_ID)
      .order('categoria', { ascending: true })
      .order('nombre', { ascending: true });

    if (error) throw error;

    menuProducts = structuredClone(data || []);
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
    const section = document.createElement('section');
    section.className = 'menu-section';
    section.innerHTML = `
      <h3 class="menu-section__title">${escapeHtml(category)}</h3>
      <ul class="menu-section__list">
        ${items.map((product) => renderMenuProductRow(product)).join('')}
      </ul>
    `;
    fragment.appendChild(section);
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

function openProductModal(product = null) {
  const modal = document.getElementById('productModal');
  const title = document.getElementById('productModalTitle');
  const form = document.getElementById('productForm');

  form.reset();
  document.getElementById('productId').value = product?.id || '';
  document.getElementById('productNombre').value = product?.nombre || '';
  document.getElementById('productDescripcion').value = product?.descripcion || '';
  document.getElementById('productPrecio').value = product?.precio ?? '';
  document.getElementById('productCategoria').value = product?.categoria || '';
  document.getElementById('productDisponible').checked = product ? product.disponible !== false : true;

  title.textContent = product ? 'Editar producto' : 'Agregar producto';
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('productNombre').focus();
}

function closeProductModal() {
  const modal = document.getElementById('productModal');
  if (!modal) return;
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

  return {
    nombre: document.getElementById('productNombre').value.trim(),
    descripcion: document.getElementById('productDescripcion').value.trim() || null,
    precio,
    categoria: document.getElementById('productCategoria').value.trim(),
    disponible: document.getElementById('productDisponible').checked,
  };
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

  menuSaving = true;
  document.getElementById('productSaveBtn').disabled = true;

  try {
    if (id) {
      const { error } = await supabaseClient
        .from('productos')
        .update({
          nombre: payload.nombre,
          descripcion: payload.descripcion,
          precio: payload.precio,
          categoria: payload.categoria,
          disponible: payload.disponible,
        })
        .eq('id', id);

      if (error) throw error;
      await refreshMenuAfterChange('Producto actualizado');
    } else {
      const { error } = await supabaseClient.from('productos').insert({
        ...payload,
        restaurante_id: RESTAURANTE_ID,
      });
      if (error) throw error;
      await refreshMenuAfterChange('Producto agregado');
    }
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

function bindMenuActions() {
  document.getElementById('addProductBtn')?.addEventListener('click', () => openProductModal());

  document.getElementById('productForm')?.addEventListener('submit', saveProduct);

  document.querySelectorAll('[data-close-product-modal]').forEach((el) => {
    el.addEventListener('click', closeProductModal);
  });

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
  bindMenuActions();
}

document.addEventListener('DOMContentLoaded', initMenuPanel);
