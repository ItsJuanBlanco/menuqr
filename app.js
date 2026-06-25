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
  confirmedItems: [],
  sendingOrder: false,
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

function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast toast--visible' + (type ? ` toast--${type}` : '');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, 3200);
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
    .order('nombre');

  if (error) throw error;
  if (!data || data.length === 0) return false;

  applyProductsFromDb(data);
  return true;
}

async function seedProductsIfEmpty() {
  const { count, error: countError } = await supabaseClient
    .from('productos')
    .select('*', { count: 'exact', head: true });

  if (countError) throw countError;
  if (count > 0) return false;

  const categoryById = Object.fromEntries(MENU.categories.map((c) => [c.id, c.name]));

  const rows = MENU.products.map((p) => ({
    nombre: p.name,
    descripcion: p.description,
    precio: p.price,
    categoria: categoryById[p.category] || p.category,
    imagen_url: p.image,
  }));

  const { error: insertError } = await supabaseClient.from('productos').insert(rows);
  if (insertError) throw insertError;

  return true;
}

async function loadConfirmedItems() {
  if (!state.mesaId) return;

  const { data, error } = await supabaseClient
    .from('pedido_items')
    .select(`
      id,
      cantidad,
      precio_unitario,
      subtotal,
      confirmado_por_mesero,
      productos ( nombre ),
      pedidos!inner ( mesa_id )
    `)
    .eq('confirmado_por_mesero', true)
    .eq('pedidos.mesa_id', state.mesaId);

  if (error) {
    console.error('Error cargando cuenta confirmada:', error);
    return;
  }

  state.confirmedItems = (data || []).map((item) => ({
    id: item.id,
    name: item.productos?.nombre || 'Producto',
    qty: item.cantidad,
    unitPrice: Number(item.precio_unitario),
    subtotal: Number(item.subtotal ?? item.precio_unitario * item.cantidad),
  }));

  renderAccount();
}

function subscribeToRealtime() {
  if (!state.mesaId) return;

  supabaseClient
    .channel(`mesa-${state.mesaId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pedidos', filter: `mesa_id=eq.${state.mesaId}` },
      () => loadConfirmedItems()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pedido_items' },
      () => loadConfirmedItems()
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
function renderProducts() {
  const container = document.getElementById('products');
  const filtered = MENU.products.filter((p) => p.category === state.activeCategory);

  container.innerHTML = filtered
    .map((product) => {
      const qty = state.cart[product.id] || 0;
      const addSection =
        qty === 0
          ? `<button type="button" class="product-card__add" data-add="${product.id}">+ Agregar</button>`
          : `<div class="product-card__qty">
              <button type="button" class="product-card__qty-btn" data-minus="${product.id}" aria-label="Quitar uno">−</button>
              <span class="product-card__qty-num">${qty}</span>
              <button type="button" class="product-card__qty-btn" data-plus="${product.id}" aria-label="Agregar uno">+</button>
            </div>`;

      return `
        <article class="product-card">
          <div class="product-card__image-wrap">
            <img class="product-card__image" src="${product.image}" alt="${product.name}" loading="lazy" width="96" height="96">
          </div>
          <div class="product-card__body">
            <h3 class="product-card__name">${product.name}</h3>
            <p class="product-card__desc">${product.description}</p>
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
  state.cart[productId] = (state.cart[productId] || 0) + 1;
  renderProducts();
  updateCartBar();
}

function removeFromCart(productId) {
  if (!state.cart[productId]) return;
  state.cart[productId]--;
  if (state.cart[productId] <= 0) delete state.cart[productId];
  renderProducts();
  updateCartBar();
}

function getCartTotals() {
  let count = 0;
  let total = 0;
  for (const [id, qty] of Object.entries(state.cart)) {
    const product = getProduct(id);
    if (product) {
      count += qty;
      total += product.price * qty;
    }
  }
  return { count, total };
}

function updateCartBar() {
  const bar = document.getElementById('cartBar');
  const { count, total } = getCartTotals();

  if (count === 0) {
    bar.hidden = true;
    return;
  }

  bar.hidden = false;
  document.getElementById('cartCount').textContent = `${count} item${count !== 1 ? 's' : ''}`;
  document.getElementById('cartTotal').textContent = formatCOP(total);
}

async function sendOrder() {
  const { count, total } = getCartTotals();
  if (count === 0 || state.sendingOrder) return;

  if (!state.mesaId) {
    showToast('No se pudo identificar la mesa. Recarga la página.', 'error');
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

  try {
    const { data: pedido, error: pedidoError } = await supabaseClient
      .from('pedidos')
      .insert({
        mesa_id: state.mesaId,
        estado: 'pendiente',
        total,
      })
      .select('id')
      .single();

    if (pedidoError) throw pedidoError;

    const items = Object.entries(cartSnapshot).map(([productId, qty]) => {
      const product = getProduct(productId);
      return {
        pedido_id: pedido.id,
        producto_id: productId,
        cantidad: qty,
        precio_unitario: product.price,
        subtotal: product.price * qty,
        estado: 'pendiente',
        confirmado_por_mesero: false,
      };
    });

    const { error: itemsError } = await supabaseClient.from('pedido_items').insert(items);
    if (itemsError) throw itemsError;

    showToast(
      `Pedido enviado (${count} item${count !== 1 ? 's' : ''}). El mesero lo confirmará pronto.`,
      'success'
    );

    state.cart = {};
    renderProducts();
    updateCartBar();
  } catch (error) {
    console.error('Error al enviar pedido:', error);
    showToast(error.message || 'No se pudo enviar el pedido. Intenta de nuevo.', 'error');
  } finally {
    state.sendingOrder = false;
    btn.disabled = false;
    btn.textContent = 'Enviar pedido';
  }
}

/* ── Mi cuenta ── */
function renderAccount() {
  const list = document.getElementById('confirmedList');
  const empty = document.getElementById('accountEmpty');
  const totalEl = document.getElementById('accountTotal');
  const badge = document.getElementById('accountBadge');

  const items = state.confirmedItems;
  let grandTotal = 0;
  let itemCount = 0;

  items.forEach((item) => {
    grandTotal += item.subtotal;
    itemCount += item.qty;
  });

  if (items.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    totalEl.hidden = true;
    badge.hidden = true;
    return;
  }

  empty.style.display = 'none';
  totalEl.hidden = false;
  badge.hidden = false;
  badge.textContent = itemCount;
  document.getElementById('totalAmount').textContent = formatCOP(grandTotal);

  list.innerHTML = items
    .map(
      (item) => `
        <li class="account__item">
          <div class="account__item-info">
            <span class="account__item-name">${item.name}</span>
            <span class="account__item-qty">${item.qty} × ${formatCOP(item.unitPrice)}</span>
          </div>
          <span class="account__item-price">${formatCOP(item.subtotal)}</span>
        </li>
      `
    )
    .join('');
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
function initWaiterButton() {
  const btn = document.getElementById('callWaiterBtn');
  const status = document.getElementById('waiterStatus');
  let cooldown = false;

  btn.addEventListener('click', () => {
    if (cooldown) return;

    cooldown = true;
    btn.classList.add('waiter__btn--sent');
    btn.innerHTML = '<span class="waiter__btn-icon" aria-hidden="true">✓</span> Notificación enviada';
    status.textContent = 'Un mesero está en camino a tu mesa.';

    showToast('Mesero notificado — llegará en unos momentos', 'success');

    setTimeout(() => {
      btn.classList.remove('waiter__btn--sent');
      btn.innerHTML = '<span class="waiter__btn-icon" aria-hidden="true">🔔</span> Llamar mesero';
      status.textContent = '';
      cooldown = false;
    }, 8000);
  });
}

/* ── Init ── */
async function init() {
  renderCategories();
  renderProducts();
  updateCartBar();
  initWaiterButton();

  document.querySelectorAll('.bottom-nav__item').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('sendOrderBtn').addEventListener('click', sendOrder);

  try {
    await loadMesa();
    const seeded = await seedProductsIfEmpty();
    const loadedFromDb = await loadMenuFromSupabase();

    if (loadedFromDb) {
      renderCategories();
      renderProducts();
      if (seeded) showToast('Productos sincronizados con Supabase.', 'success');
    } else {
      showToast('No se pudo cargar el menú desde Supabase.', 'error');
    }

    await loadConfirmedItems();
    subscribeToRealtime();
    renderAccount();
  } catch (error) {
    console.error('Error inicializando Supabase:', error);
    showToast(error.message || 'Error conectando con Supabase.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
