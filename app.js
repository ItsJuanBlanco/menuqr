/* ── Datos locales (fallback si productos aún no están en Supabase) ── */
const MENU = {
  categories: [
    { id: 'entradas', name: 'Entradas' },
    { id: 'parrilla', name: 'De la Parrilla' },
    { id: 'hamburguesas', name: 'Hamburguesas' },
    { id: 'cocteles', name: 'Cócteles' },
    { id: 'cervezas', name: 'Cervezas Artesanales' },
  ],
  products: [
    {
      id: 'patacon-bbq',
      category: 'entradas',
      name: 'Patacón con Costilla BBQ',
      description: 'Patacón crujiente, costilla desmechada en salsa BBQ casera, queso costeño y hogao.',
      price: 28000,
      image: 'https://images.unsplash.com/photo-1594041880634-8425489a7963?w=400&h=400&fit=crop',
    },
    {
      id: 'arepa-hogao',
      category: 'entradas',
      name: 'Arepa con Hogao y Chorizo',
      description: 'Arepa de maíz asada, hogao tradicional y chorizo santandereano a la parrilla.',
      price: 18000,
      image: 'https://images.unsplash.com/photo-1618040996337-56904a022a34?w=400&h=400&fit=crop',
    },
    {
      id: 'ceviche-coco',
      category: 'entradas',
      name: 'Ceviche de Coco',
      description: 'Pescado blanco en leche de coco, ají amarillo, cilantro y chips de plátano.',
      price: 32000,
      image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=400&fit=crop',
    },
    {
      id: 'costillas-brasa',
      category: 'parrilla',
      name: 'Costillas a la Brasa',
      description: 'Costillas de cerdo marinadas 12 horas, glaseadas con miel y mostaza. Acompañamiento a elección.',
      price: 45000,
      image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop',
    },
    {
      id: 'lomo-pimienta',
      category: 'parrilla',
      name: 'Lomo en Salsa de Pimienta',
      description: 'Medallón de lomo 250g, salsa de pimienta verde, papas rústicas y vegetales asados.',
      price: 52000,
      image: 'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=400&h=400&fit=crop',
    },
    {
      id: 'trucha-almendras',
      category: 'parrilla',
      name: 'Trucha con Almendras',
      description: 'Filete de trucha fresca, mantequilla de almendras tostadas, arroz con coco.',
      price: 38000,
      image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&h=400&fit=crop',
    },
    {
      id: 'burger-brasa',
      category: 'hamburguesas',
      name: 'La Brasa Burger',
      description: 'Doble carne 180g, queso doble crema, cebolla caramelizada, tocino ahumado y salsa de la casa.',
      price: 35000,
      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop',
    },
    {
      id: 'burger-paisa',
      category: 'hamburguesas',
      name: 'Burger Paisa',
      description: 'Carne angus, chicharrón, aguacate, huevo frito y arepa mini. Pura tradición antioqueña.',
      price: 38000,
      image: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&h=400&fit=crop',
    },
    {
      id: 'mojito-maracuya',
      category: 'cocteles',
      name: 'Mojito de Maracuyá',
      description: 'Ron blanco, maracuyá fresco, hierbabuena, limón y soda. Refrescante y tropical.',
      price: 22000,
      image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&h=400&fit=crop',
    },
    {
      id: 'old-fashioned',
      category: 'cocteles',
      name: 'Old Fashioned',
      description: 'Bourbon, bitter de naranja, azúcar morena y twist de cáscara. Clásico con estilo.',
      price: 28000,
      image: 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=400&h=400&fit=crop',
    },
    {
      id: 'michelada',
      category: 'cocteles',
      name: 'Michelada de la Casa',
      description: 'Cerveza artesanal, limón, sal de tajín, salsa inglesa y un toque de picante.',
      price: 16000,
      image: 'https://images.unsplash.com/photo-1608270586622-248804c7d068?w=400&h=400&fit=crop',
    },
    {
      id: 'cerveza-ipa',
      category: 'cervezas',
      name: 'IPA Medellín',
      description: 'Cerveza artesanal local, notas cítricas y amargor balanceado. 330ml.',
      price: 12000,
      image: 'https://images.unsplash.com/photo-1608270586622-248804c7d068?w=400&h=400&fit=crop',
    },
    {
      id: 'cerveza-rubia',
      category: 'cervezas',
      name: 'Rubia del Valle',
      description: 'Lager suave y refrescante, elaborada en el Aburrá. 330ml.',
      price: 10000,
      image: 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=400&h=400&fit=crop',
    },
  ],
};

const CATEGORY_SLUGS = Object.fromEntries(MENU.categories.map((c) => [c.name.toLowerCase(), c.id]));

/* ── Estado ── */
const state = {
  activeCategory: MENU.categories[0].id,
  cart: {},
  activeTab: 'carta',
  mesaId: null,
  mesaNumero: DEFAULT_MESA_NUMERO,
  sesionId: null,
  sessionToken: null,
  sessionTipo: null,
  sessionNumero: null,
  accountItems: [],
  sendingOrder: false,
  waiterCooldown: false,
};

/* ── Utilidades ── */
function formatCOP(amount) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getProduct(id) {
  return MENU.products.find((p) => p.id === id);
}

function slugifyCategory(name) {
  if (!name) return 'otros';
  const slug = CATEGORY_SLUGS[name.toLowerCase()];
  if (slug) return slug;
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function showToast(message, type = '', duration = 3200) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  clearTimeout(showToast._timer);

  toast.textContent = message;
  toast.className = 'toast' + (type ? ` toast--${type}` : '');

  requestAnimationFrame(() => {
    toast.classList.add('toast--visible');
  });

  showToast._timer = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, duration);
}

function hideToast() {
  const toast = document.getElementById('toast');
  if (!toast) return;
  clearTimeout(showToast._timer);
  toast.classList.remove('toast--visible');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatItemEstado(estado) {
  const labels = {
    pendiente: 'Pendiente',
    en_preparacion: 'En preparación',
    listo: 'Listo',
  };
  return labels[estado] || labels.pendiente;
}

function getCartEntry(productId) {
  return state.cart[productId] || null;
}

function getCartQty(productId) {
  return state.cart[productId]?.qty || 0;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/* ── Supabase: mesa y menú ── */
async function loadMesa() {
  const params = new URLSearchParams(window.location.search);
  const mesaParam = params.get('mesa');
  state.mesaNumero = mesaParam ? Number(mesaParam) : DEFAULT_MESA_NUMERO;

  document.getElementById('tableBadge').textContent = `Mesa ${state.mesaNumero}`;

  const { data, error } = await supabaseClient
    .from('mesas')
    .select('id, numero')
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('numero', state.mesaNumero)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error(`No se encontró la mesa ${state.mesaNumero} en Supabase.`);
  }

  state.mesaId = data.id;
}

function applyProductsFromDb(rows) {
  const categoriesMap = new Map();

  MENU.products = rows.map((row) => {
    const categoryName = row.categoria || 'Otros';
    const categoryId = slugifyCategory(categoryName);

    if (!categoriesMap.has(categoryId)) {
      categoriesMap.set(categoryId, { id: categoryId, name: categoryName });
    }

    return {
      id: row.id,
      category: categoryId,
      name: row.nombre,
      description: row.descripcion || '',
      price: Number(row.precio),
      image: row.imagen_url || MENU.products[0]?.image,
    };
  });

  MENU.categories = [...categoriesMap.values()];
  if (MENU.categories.length === 0) {
    MENU.categories = [{ id: 'otros', name: 'Otros' }];
  }

  if (!MENU.categories.some((c) => c.id === state.activeCategory)) {
    state.activeCategory = MENU.categories[0].id;
  }
}

async function loadMenuFromSupabase() {
  const { data, error } = await supabaseClient
    .from('productos')
    .select('id, nombre, descripcion, precio, categoria, imagen_url')
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('disponible', true)
    .order('nombre');

  if (error) throw error;
  if (!data || data.length === 0) return false;

  applyProductsFromDb(data);
  return true;
}

async function seedProductsIfEmpty() {
  const { count, error: countError } = await supabaseClient
    .from('productos')
    .select('*', { count: 'exact', head: true })
    .eq('restaurante_id', RESTAURANTE_ID);

  if (countError) throw countError;
  if (count > 0) return false;

  const categoryById = Object.fromEntries(MENU.categories.map((c) => [c.id, c.name]));

  const rows = MENU.products.map((p) => ({
    nombre: p.name,
    descripcion: p.description,
    precio: p.price,
    categoria: categoryById[p.category] || p.category,
    imagen_url: p.image,
    disponible: true,
    restaurante_id: RESTAURANTE_ID,
  }));

  const { error: insertError } = await supabaseClient.from('productos').insert(rows);
  if (insertError) throw insertError;

  return true;
}

async function loadAccountItems() {
  if (!state.mesaId || !state.sesionId) return;

  const { data, error } = await supabaseClient
    .from('pedido_items')
    .select(`
      id,
      producto_id,
      cantidad,
      precio_unitario,
      subtotal,
      estado,
      notas,
      confirmado_por_mesero,
      productos ( nombre ),
      pedidos!inner ( mesa_id, sesion_id, created_at, archivado )
    `)
    .eq('pedidos.mesa_id', state.mesaId)
    .eq('pedidos.sesion_id', state.sesionId)
    .eq('pedidos.restaurante_id', RESTAURANTE_ID)
    .eq('pedidos.archivado', false);

  if (error) {
    console.error('Error cargando cuenta:', error);
    return;
  }

  state.accountItems = (data || [])
    .map((item) => ({
      id: item.id,
      productoId: item.producto_id,
      name: item.productos?.nombre || 'Producto',
      qty: item.cantidad,
      unitPrice: Number(item.precio_unitario),
      subtotal: Number(item.subtotal ?? item.precio_unitario * item.cantidad),
      estado: item.estado || 'pendiente',
      notas: item.notas || '',
      confirmado: item.confirmado_por_mesero === true,
      createdAt: item.pedidos?.created_at || '',
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  renderAccount();
}

function groupDeliveredItems(items) {
  const groups = new Map();

  items.forEach((item) => {
    const key = item.productoId || item.name;
    if (!groups.has(key)) {
      groups.set(key, { name: item.name, qty: 0, subtotal: 0 });
    }
    const group = groups.get(key);
    group.qty += item.qty;
    group.subtotal += item.subtotal;
  });

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function isInProgress(item) {
  if (item.confirmado) return false;
  const estado = item.estado || 'pendiente';
  return estado === 'pendiente' || estado === 'en_preparacion';
}

async function callWaiter() {
  if (!state.mesaId) {
    showToast('No se pudo identificar la mesa. Recarga la página.', 'error');
    return false;
  }

  if (state.waiterCooldown) return false;

  const { error } = await supabaseClient
    .from('mesas')
    .update({ mesero_requerido: true })
    .eq('id', state.mesaId)
    .eq('restaurante_id', RESTAURANTE_ID);

  if (error) {
    showToast(error.message || 'No se pudo llamar al mesero.', 'error');
    return false;
  }

  state.waiterCooldown = true;
  showToast('Mesero notificado — llegará en unos momentos', 'success');

  setTimeout(() => {
    state.waiterCooldown = false;
  }, 8000);

  return true;
}

function subscribeToRealtime() {
  if (!state.mesaId) return;

  supabaseClient
    .channel(`mesa-${state.mesaId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pedidos', filter: `mesa_id=eq.${state.mesaId}` },
      () => loadAccountItems()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pedido_items' },
      () => loadAccountItems()
    )
    .subscribe();
}

/* ── Render: categorías ── */
function renderCategories() {
  const container = document.getElementById('categories');
  container.innerHTML = MENU.categories
    .map(
      (cat) => `
        <button
          type="button"
          class="category-chip${cat.id === state.activeCategory ? ' category-chip--active' : ''}"
          data-category="${cat.id}"
          role="tab"
          aria-selected="${cat.id === state.activeCategory}"
        >${cat.name}</button>
      `
    )
    .join('');

  container.querySelectorAll('.category-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.activeCategory = chip.dataset.category;
      renderCategories();
      renderProducts();
    });
  });
}

/* ── Render: productos ── */
let productsInputBound = false;

function bindProductsInput() {
  if (productsInputBound) return;

  document.getElementById('products').addEventListener('input', (event) => {
    const input = event.target.closest('[data-notas]');
    if (!input) return;

    const productId = input.dataset.notas;
    if (state.cart[productId]) {
      state.cart[productId].notas = input.value;
    }
  });

  productsInputBound = true;
}

function renderProducts() {
  const container = document.getElementById('products');
  const filtered = MENU.products.filter((p) => p.category === state.activeCategory);

  container.innerHTML = filtered
    .map((product) => {
      const qty = getCartQty(product.id);
      const cartEntry = getCartEntry(product.id);
      const addSection =
        qty === 0
          ? `<button type="button" class="product-card__add" data-add="${product.id}">+ Agregar</button>`
          : `<div class="product-card__qty">
              <button type="button" class="product-card__qty-btn" data-minus="${product.id}" aria-label="Quitar uno">−</button>
              <span class="product-card__qty-num">${qty}</span>
              <button type="button" class="product-card__qty-btn" data-plus="${product.id}" aria-label="Agregar uno">+</button>
            </div>`;

      const notesSection =
        qty > 0
          ? `<label class="product-card__notes">
              <span class="product-card__notes-label">Especificaciones (opcional)</span>
              <input
                type="text"
                class="product-card__notes-input"
                data-notas="${product.id}"
                value="${escapeHtml(cartEntry?.notas || '')}"
                placeholder="Ej: sin cebolla, término medio…"
              >
            </label>`
          : '';

      return `
        <article class="product-card">
          <div class="product-card__image-wrap">
            <img class="product-card__image" src="${product.image}" alt="${product.name}" loading="lazy" width="96" height="96">
          </div>
          <div class="product-card__body">
            <h3 class="product-card__name">${product.name}</h3>
            <p class="product-card__desc">${product.description}</p>
            ${notesSection}
            <div class="product-card__footer">
              <span class="product-card__price">${formatCOP(product.price)}</span>
              ${addSection}
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  container.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => addToCart(btn.dataset.add));
  });
  container.querySelectorAll('[data-plus]').forEach((btn) => {
    btn.addEventListener('click', () => addToCart(btn.dataset.plus));
  });
  container.querySelectorAll('[data-minus]').forEach((btn) => {
    btn.addEventListener('click', () => removeFromCart(btn.dataset.minus));
  });
}

/* ── Carrito ── */
function addToCart(productId) {
  if (!state.cart[productId]) {
    state.cart[productId] = { qty: 0, notas: '' };
  }
  state.cart[productId].qty += 1;
  renderProducts();
  updateCartBar();
}

function removeFromCart(productId) {
  if (!state.cart[productId]) return;
  state.cart[productId].qty -= 1;
  if (state.cart[productId].qty <= 0) delete state.cart[productId];
  renderProducts();
  updateCartBar();
}

function getCartTotals() {
  let count = 0;
  let total = 0;
  for (const [id, entry] of Object.entries(state.cart)) {
    const product = getProduct(id);
    if (product && entry.qty > 0) {
      count += entry.qty;
      total += product.price * entry.qty;
    }
  }
  return { count, total };
}

function updateCartBar() {
  const { count, total } = getCartTotals();
  const summary = document.getElementById('cartSummary');
  const sendBtn = document.getElementById('sendOrderBtn');

  summary.textContent = `${count} item${count !== 1 ? 's' : ''} - ${formatCOP(total)}`;
  sendBtn.disabled = count === 0;
}

async function sendOrder() {
  const { count, total } = getCartTotals();
  if (count === 0 || state.sendingOrder) return;

  if (!state.mesaId || !state.sesionId) {
    showToast('No se pudo identificar la mesa o la sesión. Recarga la página.', 'error');
    return;
  }

  const invalidProduct = Object.keys(state.cart).find((id) => !isUuid(id));
  if (invalidProduct) {
    showToast('Los productos deben cargarse desde Supabase antes de enviar pedidos.', 'error');
    return;
  }

  const btn = document.getElementById('sendOrderBtn');
  state.sendingOrder = true;
  btn.disabled = true;
  btn.textContent = 'Enviando…';

  const cartSnapshot = { ...state.cart };
  const successMsg = `Pedido enviado (${count} item${count !== 1 ? 's' : ''}). El mesero lo confirmará pronto.`;

  showToast(successMsg, 'success', 15000);

  try {
    const { data: pedido, error: pedidoError } = await supabaseClient
      .from('pedidos')
      .insert({
        mesa_id: state.mesaId,
        sesion_id: state.sesionId,
        restaurante_id: RESTAURANTE_ID,
        estado: 'pendiente',
        total,
        archivado: false,
      })
      .select('id')
      .single();

    if (pedidoError) throw pedidoError;

    const items = Object.entries(cartSnapshot).map(([productId, entry]) => {
      const product = getProduct(productId);
      const notas = entry.notas?.trim();
      return {
        pedido_id: pedido.id,
        producto_id: productId,
        cantidad: entry.qty,
        precio_unitario: product.price,
        subtotal: product.price * entry.qty,
        estado: 'pendiente',
        confirmado_por_mesero: false,
        notas: notas || null,
      };
    });

    const { error: itemsError } = await supabaseClient.from('pedido_items').insert(items);
    if (itemsError) throw itemsError;

    await supabaseClient
      .from('mesas')
      .update({ estado: 'ocupada' })
      .eq('id', state.mesaId);

    state.cart = {};
    renderProducts();
    updateCartBar();
    await loadAccountItems();
  } catch (error) {
    console.error('Error al enviar pedido:', error);
    hideToast();
    showToast(error.message || 'No se pudo enviar el pedido. Intenta de nuevo.', 'error');
  } finally {
    state.sendingOrder = false;
    btn.textContent = 'Enviar pedido';
    updateCartBar();
  }
}

/* ── Mi cuenta ── */
function renderAccount() {
  const empty = document.getElementById('accountEmpty');
  const inProgressSection = document.getElementById('inProgressSection');
  const inProgressList = document.getElementById('inProgressList');
  const inProgressEmpty = document.getElementById('inProgressEmpty');
  const deliveredSection = document.getElementById('deliveredSection');
  const deliveredList = document.getElementById('deliveredList');
  const totalEl = document.getElementById('accountTotal');
  const badge = document.getElementById('accountBadge');

  const items = state.accountItems;
  const inProgress = items.filter(isInProgress);
  const delivered = items.filter((item) => item.confirmado);
  const groupedDelivered = groupDeliveredItems(delivered);
  const deliveredTotal = groupedDelivered.reduce((sum, g) => sum + g.subtotal, 0);
  const inProgressCount = inProgress.reduce((sum, item) => sum + item.qty, 0);

  if (items.length === 0) {
    empty.style.display = 'block';
    inProgressSection.hidden = true;
    deliveredSection.hidden = true;
    badge.hidden = true;
    return;
  }

  empty.style.display = 'none';

  inProgressSection.hidden = false;
  inProgressEmpty.hidden = inProgress.length > 0;
  inProgressList.innerHTML = inProgress
    .map((item) => {
      const estado = item.estado || 'pendiente';
      const notasHtml = item.notas
        ? `<span class="account__item-notas">${escapeHtml(item.notas)}</span>`
        : '';

      return `
        <li class="account__item">
          <div class="account__item-info">
            <span class="account__item-name">${escapeHtml(item.name)}</span>
            <span class="account__item-qty">× ${item.qty}</span>
            ${notasHtml}
            <span class="account__item-status account__item-status--${estado}">${formatItemEstado(estado)}</span>
          </div>
        </li>
      `;
    })
    .join('');

  if (groupedDelivered.length > 0) {
    deliveredSection.hidden = false;
    deliveredList.innerHTML = groupedDelivered
      .map(
        (group) => `
          <li class="account__invoice-line">
            <span>x${group.qty} ${escapeHtml(group.name)}</span>
            <span>— ${formatCOP(group.subtotal)}</span>
          </li>
        `
      )
      .join('');
    document.getElementById('totalAmount').textContent = formatCOP(deliveredTotal);
    totalEl.hidden = false;
  } else {
    deliveredSection.hidden = true;
  }

  badge.hidden = inProgressCount === 0;
  badge.textContent = inProgressCount;
}

/* ── Tabs ── */
function switchTab(tabId) {
  state.activeTab = tabId;

  document.querySelectorAll('.bottom-nav__item').forEach((btn) => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('bottom-nav__item--active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });

  document.querySelectorAll('.panel').forEach((panel) => {
    const panelId = panel.id.replace('panel-', '');
    const isActive = panelId === tabId;
    panel.classList.toggle('panel--active', isActive);
    panel.hidden = !isActive;
  });

  if (tabId === 'cuenta') renderAccount();
}

/* ── Llamar mesero ── */
function initWaiterButtons() {
  const tabBtn = document.getElementById('callWaiterBtn');
  const fabBtn = document.getElementById('callWaiterFab');
  const status = document.getElementById('waiterStatus');

  async function handleCall(button) {
    const sent = await callWaiter();
    if (!sent) return;

    if (button) {
      const isFab = button.classList.contains('call-waiter-fab');
      const originalHtml = isFab
        ? '<span aria-hidden="true">🛎️</span> Llamar mesero'
        : '<span class="waiter__btn-icon" aria-hidden="true">🔔</span> Llamar mesero';

      button.classList.add('waiter__btn--sent');
      button.innerHTML = isFab
        ? '<span aria-hidden="true">✓</span> Mesero avisado'
        : '<span class="waiter__btn-icon" aria-hidden="true">✓</span> Notificación enviada';

      setTimeout(() => {
        button.classList.remove('waiter__btn--sent');
        button.innerHTML = originalHtml;
      }, 8000);
    }

    if (status) status.textContent = 'Un mesero está en camino a tu mesa.';
    setTimeout(() => {
      if (status) status.textContent = '';
    }, 8000);
  }

  tabBtn.addEventListener('click', () => handleCall(tabBtn));
  fabBtn.addEventListener('click', () => handleCall(fabBtn));
}

function handleInitialRoute() {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'cuenta' || hash === 'mesero' || hash === 'carta') {
    switchTab(hash);
  }
}

function applySession(session) {
  state.sesionId = session.id;
  state.sessionToken = session.session_token || null;
  state.sessionTipo = session.tipo;
  state.sessionNumero = session.numero;
  updateSessionBadge(session);
}

/* ── Init ── */
async function init() {
  const restaurant = await window.restaurantReady;
  if (!restaurant) return;

  try {
    await loadMesa();

    const session = await startSessionFlow(state.mesaId, state.mesaNumero);
    if (!session) return;

    applySession(session);

    bindProductsInput();
    renderCategories();
    renderProducts();
    updateCartBar();
    initWaiterButtons();
    handleInitialRoute();

    document.querySelectorAll('.bottom-nav__item').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('sendOrderBtn').addEventListener('click', sendOrder);

    const seeded = await seedProductsIfEmpty();
    const loadedFromDb = await loadMenuFromSupabase();

    if (loadedFromDb) {
      renderCategories();
      renderProducts();
      if (seeded) showToast('Productos sincronizados con Supabase.', 'success');
    } else {
      showToast('No se pudo cargar el menú desde Supabase.', 'error');
    }

    await loadAccountItems();
    subscribeToRealtime();
  } catch (error) {
    console.error('Error inicializando Supabase:', error);
    showToast(error.message || 'Error conectando con Supabase.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
