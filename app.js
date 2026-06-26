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
  paymentPendingConfirmation: false,
  paymentSubmitting: false,
  splitCount: 2,
  groupPayments: [],
  lastSplitQrUrl: '',
  sessionSplitCode: null,
  splitJoinAmount: null,
  serviceChargeEnabled: true,
  serviceChargePercent: 10,
  tipPercent: null,
  tipCustomMode: false,
  tipCustomAmount: 0,
};

const PAYMENT_PENDING_MESSAGE = 'Pago recibido ✓ El mesero lo confirmará en un momento';

let paymentSuccessReviewTimer = null;
let paymentSuccessShown = false;
let mesaRealtimeChannel = null;
let sessionPolling = null;

const SESSION_POLL_INTERVAL_MS = 3000;

function stopSessionPolling() {
  if (sessionPolling) {
    clearInterval(sessionPolling);
    sessionPolling = null;
  }
}

function startSessionPolling() {
  stopSessionPolling();

  if (!state.sesionId || paymentSuccessShown) return;

  void checkSessionStatus();
  sessionPolling = setInterval(checkSessionStatus, SESSION_POLL_INTERVAL_MS);
}

function getGoogleReviewUrl() {
  const url = RESTAURANTE?.google_review_url;
  return url && String(url).trim() ? String(url).trim() : null;
}

function bindPaymentSuccessStars() {
  const stars = document.getElementById('paymentSuccessStars');
  if (!stars || stars.dataset.bound) return;

  stars.dataset.bound = 'true';
  stars.addEventListener('click', (event) => {
    const star = event.target.closest('[data-star]');
    if (!star) return;

    const reviewUrl = getGoogleReviewUrl();
    if (reviewUrl) {
      window.open(reviewUrl, '_blank', 'noopener,noreferrer');
    }
  });
}

function clearClientSessionState() {
  const mesaId = state.mesaId;
  if (mesaId) clearStoredSession(mesaId);

  state.sesionId = null;
  state.sessionToken = null;
  state.sessionTipo = null;
  state.sessionNumero = null;
  state.paymentPendingConfirmation = false;
  state.accountItems = [];
  state.groupPayments = [];
  state.lastSplitQrUrl = '';

  const badge = document.getElementById('sessionBadge');
  if (badge) badge.hidden = true;
}

function renderPaymentSuccessUi(totalPaid) {
  const screen = document.getElementById('paymentSuccessScreen');
  const amountEl = document.getElementById('paymentSuccessAmount');
  const subtitle = document.getElementById('paymentSuccessSubtitle');
  const review = document.getElementById('paymentSuccessReview');

  if (paymentSuccessReviewTimer) {
    clearTimeout(paymentSuccessReviewTimer);
    paymentSuccessReviewTimer = null;
  }

  if (amountEl) amountEl.textContent = formatCOP(totalPaid);
  if (subtitle) {
    subtitle.hidden = false;
    subtitle.textContent = 'Gracias por tu visita.';
  }
  if (review) review.hidden = true;

  if (screen) {
    screen.hidden = false;
    screen.setAttribute('aria-hidden', 'false');
  }

  document.getElementById('mainApp')?.setAttribute('hidden', '');
  bindPaymentSuccessStars();

  paymentSuccessReviewTimer = setTimeout(() => {
    if (subtitle) subtitle.hidden = true;
    if (review) review.hidden = false;
    paymentSuccessReviewTimer = null;
  }, 2000);
}

async function showPaymentSuccess(totalPaid, sesionId = null) {
  if (paymentSuccessShown) return;

  paymentSuccessShown = true;
  stopSessionPolling();

  const sessionId = sesionId || state.sesionId;
  clearClientSessionState();
  renderPaymentSuccessUi(totalPaid);

  if (!sessionId) return;

  try {
    const refinedTotal = await resolveSessionPaidTotal(sessionId);
    if (refinedTotal > 0 && refinedTotal !== totalPaid) {
      const amountEl = document.getElementById('paymentSuccessAmount');
      if (amountEl) amountEl.textContent = formatCOP(refinedTotal);
    }
  } catch (error) {
    console.error(error);
  }
}

async function fetchSessionDisplayTotal(sesionId) {
  let sesion = null;

  const { data, error: sesionError } = await supabaseClient
    .from('sesiones')
    .select('total, cargo_servicio, propina')
    .eq('id', sesionId)
    .maybeSingle();

  if (sesionError) {
    const { data: fallback, error: fallbackError } = await supabaseClient
      .from('sesiones')
      .select('cargo_servicio, propina')
      .eq('id', sesionId)
      .maybeSingle();

    if (fallbackError) throw fallbackError;
    sesion = fallback;
  } else {
    sesion = data;
  }

  const sessionTotal = Number(sesion?.total);
  if (Number.isFinite(sessionTotal) && sessionTotal > 0) {
    return sessionTotal;
  }

  const { data: items, error: itemsError } = await supabaseClient
    .from('pedido_items')
    .select(`
      subtotal,
      precio_unitario,
      cantidad,
      pedidos!inner ( sesion_id, archivado, restaurante_id )
    `)
    .eq('pedidos.sesion_id', sesionId)
    .eq('pedidos.restaurante_id', RESTAURANTE_ID)
    .eq('pedidos.archivado', false)
    .eq('confirmado_por_mesero', true);

  if (itemsError) throw itemsError;

  const itemsSubtotal = (items || []).reduce(
    (sum, item) => sum + Number(item.subtotal ?? item.precio_unitario * item.cantidad),
    0
  );

  const cargoServicio = Number(sesion?.cargo_servicio) || 0;
  const propina = Number(sesion?.propina) || 0;

  return itemsSubtotal + cargoServicio + propina;
}

async function checkSessionStatus() {
  if (!state.sesionId || paymentSuccessShown) return;

  try {
    const { data, error } = await supabaseClient
      .from('sesiones')
      .select('pago_pendiente_confirmacion')
      .eq('id', state.sesionId)
      .maybeSingle();

    if (error) throw error;

    if (data?.pago_pendiente_confirmacion === true) {
      const sesionId = state.sesionId;
      let totalPaid = getPaymentBreakdown().total || getAccountDeliveredTotal();

      try {
        const fetchedTotal = await fetchSessionDisplayTotal(sesionId);
        if (fetchedTotal > 0) totalPaid = fetchedTotal;
      } catch (fetchError) {
        console.error(fetchError);
      }

      await showPaymentSuccess(totalPaid, sesionId);
    }
  } catch (error) {
    console.error(error);
  }
}

async function resolveSessionPaidTotal(sesionId) {
  const breakdown = getPaymentBreakdown();
  if (breakdown.total > 0) return breakdown.total;

  try {
    const sessionTotal = await fetchSessionDisplayTotal(sesionId);
    if (sessionTotal > 0) return sessionTotal;
  } catch (error) {
    console.error(error);
  }

  try {
    const approvedTotal = await getSessionApprovedPaymentsTotal(sesionId);
    if (approvedTotal > 0) return approvedTotal;
  } catch (error) {
    console.error(error);
  }

  return getAccountDeliveredTotal();
}

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

const VALID_TABS = new Set(['carta', 'cuenta', 'mesero']);
const ACTIVE_TAB_KEY = 'activeTab';
const ACCOUNT_CODE_HINT_SEEN_PREFIX = 'menuqr:accountCodeHintSeen';
const ACCOUNT_CODE_HINT_DURATION_MS = 5000;

let accountCodeHintTimer = null;
let accountCodeHintHideTimer = null;

function saveActiveTab(tabId) {
  if (VALID_TABS.has(tabId)) {
    localStorage.setItem(ACTIVE_TAB_KEY, tabId);
  }
}

function getStoredActiveTab() {
  const stored = localStorage.getItem(ACTIVE_TAB_KEY);
  return VALID_TABS.has(stored) ? stored : null;
}

const TOAST_DISMISS_MS = 5000;

function showToast(message, type = '', duration = TOAST_DISMISS_MS) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  clearTimeout(showToast._timer);

  toast.textContent = message;
  toast.className = 'toast toast--visible' + (type ? ` toast--${type}` : '');

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

function parseMesaParam(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return DEFAULT_MESA_NUMERO;
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  return trimmed;
}

/* ── Supabase: mesa y menú ── */
async function loadMesa() {
  const params = new URLSearchParams(window.location.search);
  state.mesaNumero = parseMesaParam(params.get('mesa'));

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

function applyProductsFromDb(rows, orderRows = []) {
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

  MENU.categories = sortCategoryObjects([...categoriesMap.values()], orderRows);
  if (MENU.categories.length === 0) {
    MENU.categories = [{ id: 'otros', name: 'Otros' }];
  }

  if (!MENU.categories.some((c) => c.id === state.activeCategory)) {
    state.activeCategory = MENU.categories[0].id;
  }
}

async function loadMenuFromSupabase() {
  const [orderRows, productsResult] = await Promise.all([
    fetchCategoryOrder(supabaseClient, RESTAURANTE_ID).catch((error) => {
      console.warn('No se pudo cargar el orden de categorías:', error);
      return [];
    }),
    supabaseClient
      .from('productos')
      .select('id, nombre, descripcion, precio, categoria, imagen_url')
      .eq('restaurante_id', RESTAURANTE_ID)
      .eq('disponible', true)
      .order('nombre'),
  ]);

  const { data, error } = productsResult;
  if (error) throw error;
  if (!data || data.length === 0) return false;

  applyProductsFromDb(data, orderRows);
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

  await loadSessionPaymentStatus();
  await loadGroupPayments();
  renderAccount();
}

async function loadSessionPaymentStatus() {
  if (!state.sesionId) {
    state.paymentPendingConfirmation = false;
    return;
  }

  const { data, error } = await supabaseClient
    .from('sesiones')
    .select('pago_pendiente_confirmacion, activa')
    .eq('id', state.sesionId)
    .maybeSingle();

  if (error) {
    console.error('Error cargando estado de pago:', error);
    return;
  }

  state.paymentPendingConfirmation = data?.pago_pendiente_confirmacion === true;

  if (data && data.activa === false) {
    state.paymentPendingConfirmation = false;
  }
}

function getAccountDeliveredTotal() {
  const delivered = state.accountItems.filter((item) => item.confirmado);
  return groupDeliveredItems(delivered).reduce((sum, group) => sum + group.subtotal, 0);
}

const MAX_TIP_PERCENT = 100;

function getMaxCustomTipAmount(subtotal = getAccountDeliveredTotal()) {
  return Math.round(subtotal * (MAX_TIP_PERCENT / 100));
}

function clampCustomTipAmount(amount, subtotal = getAccountDeliveredTotal()) {
  return Math.min(Math.max(0, Math.round(Number(amount) || 0)), getMaxCustomTipAmount(subtotal));
}

function getActiveServicePercent() {
  if (!state.serviceChargeEnabled || state.tipCustomMode) return null;
  return state.tipPercent ?? state.serviceChargePercent;
}

function getActiveTipPercent() {
  if (state.tipCustomMode) return null;
  if (state.tipPercent) return state.tipPercent;
  if (state.serviceChargeEnabled) return state.serviceChargePercent;
  return null;
}

function getPaymentBreakdown(subtotal = getAccountDeliveredTotal()) {
  let cargoServicio = 0;
  let propina = 0;
  let propinaLabel = null;
  let serviceLabel = null;

  if (state.serviceChargeEnabled) {
    if (state.tipCustomMode && state.tipCustomAmount > 0) {
      propina = clampCustomTipAmount(state.tipCustomAmount, subtotal);
      serviceLabel = 'Propina';
      propinaLabel = 'Otra';
    } else {
      const percent = getActiveServicePercent() ?? state.serviceChargePercent;
      cargoServicio = Math.round(subtotal * (percent / 100));
      serviceLabel = `Servicio (${percent}%)`;
    }
  } else if (state.tipCustomMode && state.tipCustomAmount > 0) {
    propina = clampCustomTipAmount(state.tipCustomAmount, subtotal);
    propinaLabel = 'Otra';
  } else if (state.tipPercent) {
    propina = Math.round(subtotal * (state.tipPercent / 100));
    propinaLabel = `${state.tipPercent}%`;
  }

  return {
    subtotal,
    cargoServicio,
    propina,
    propinaLabel,
    serviceLabel,
    total: subtotal + cargoServicio + propina,
  };
}

function getPerPersonPaymentAmount(subtotal = getAccountDeliveredTotal()) {
  const breakdown = getPaymentBreakdown(subtotal);
  const count = state.splitCount;

  if (!count || count < 1) {
    return { subtotal: 0, cargoServicio: 0, propina: 0, total: 0 };
  }

  return {
    subtotal: Math.ceil(breakdown.subtotal / count),
    cargoServicio: Math.ceil(breakdown.cargoServicio / count),
    propina: Math.ceil(breakdown.propina / count),
    total: Math.ceil(breakdown.total / count),
  };
}

function getSplitShareAmount(total, count) {
  if (!count || count < 1) return 0;
  return Math.ceil(total / count);
}

function getGroupPaidTotal() {
  return state.groupPayments
    .filter((payment) => payment.estado === 'aprobado')
    .reduce((sum, payment) => sum + Number(payment.monto), 0);
}

async function loadGroupPayments() {
  if (!state.sesionId) {
    state.groupPayments = [];
    return;
  }

  const { data, error } = await supabaseClient
    .from('pagos_grupo')
    .select('id, monto, referencia_wompi, estado, created_at')
    .eq('sesion_id', state.sesionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error cargando pagos de grupo:', error);
    state.groupPayments = [];
    return;
  }

  state.groupPayments = data || [];
}

function buildMenuBaseUrl() {
  const slug = encodeURIComponent(RESTAURANTE_SLUG || '');
  const mesa = encodeURIComponent(String(state.mesaNumero));
  return `${LISTOAPP_BASE_URL}/${slug}?mesa=${mesa}`;
}

function cleanupLegacySplitUi() {
  ['splitQrIndicator', 'splitQrPrev', 'splitQrNext', 'generateQrBtn', 'splitQrViewer'].forEach((id) => {
    document.getElementById(id)?.remove();
  });
  document.querySelectorAll('.account__split-qr-nav').forEach((el) => el.remove());
}

function buildSplitPaymentUrl(monto, splitCode) {
  const params = new URLSearchParams({
    split: splitCode,
    monto: String(monto),
  });
  return `${buildMenuBaseUrl()}&${params.toString()}`;
}

function clearSplitJoinParamsFromUrl() {
  const url = new URL(window.location.href);
  let changed = false;

  ['split', 'monto', 'unirse', 'sesion'].forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  });

  if (changed) {
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }
}

async function tryJoinFromSplitQrParams() {
  const params = new URLSearchParams(window.location.search);
  const splitCode = params.get('split')?.trim();
  const montoRaw = params.get('monto');

  if (!splitCode || montoRaw == null) return null;

  const monto = Number(montoRaw);
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error('El monto del enlace no es válido.');
  }

  const session = await joinSessionBySplitCode(state.mesaId, splitCode);
  state.splitJoinAmount = Math.round(monto);
  clearSplitJoinParamsFromUrl();
  return session;
}

function clearSplitQrCanvas() {
  const canvas = document.getElementById('splitQrCanvas');
  if (canvas) canvas.innerHTML = '';
  state.lastSplitQrUrl = '';
}

function usesRestaurantQrPayment() {
  return RESTAURANTE?.metodo_pago === 'qr_propio';
}

function getRestaurantPaymentLink() {
  return RESTAURANTE?.link_pago?.trim() || '';
}

function getRestaurantPaymentQrUrl() {
  return RESTAURANTE?.qr_pago_url?.trim() || '';
}

function canUseRestaurantQrPayment() {
  return usesRestaurantQrPayment() && (getRestaurantPaymentLink() || getRestaurantPaymentQrUrl());
}

function openRestaurantPaymentLink() {
  const link = getRestaurantPaymentLink();
  if (!link) {
    showToast('El restaurante no configuró su link de pago.', 'error');
    return;
  }

  window.open(link, '_blank', 'noopener,noreferrer');
}

function updateRestaurantQrPayModalUi() {
  const link = getRestaurantPaymentLink();
  const qrUrl = getRestaurantPaymentQrUrl();
  const linkBtn = document.getElementById('restaurantQrPayLinkBtn');
  const divider = document.getElementById('restaurantQrPayDivider');
  const qrWrap = document.getElementById('restaurantQrPayQrWrap');
  const imgEl = document.getElementById('restaurantQrPayImage');
  const hintEl = document.getElementById('restaurantQrPayHint');

  if (linkBtn) linkBtn.hidden = !link;
  if (divider) divider.hidden = !(link && qrUrl);
  if (qrWrap) qrWrap.hidden = !qrUrl;
  if (imgEl) {
    if (qrUrl) imgEl.src = qrUrl;
    else imgEl.removeAttribute('src');
  }

  if (hintEl) {
    if (link && qrUrl) {
      hintEl.textContent = 'Abrí el link o escaneá el QR y transferí el monto indicado.';
    } else if (link) {
      hintEl.textContent = 'Abrí el link y transferí el monto indicado.';
    } else {
      hintEl.textContent = 'Escaneá el QR y transferí el monto indicado.';
    }
  }
}

let restaurantQrPayState = { amount: 0, extras: {} };

function openRestaurantQrPayModal(amount, extras = {}, hint = '') {
  if (!canUseRestaurantQrPayment()) {
    showToast('El restaurante no configuró métodos de pago propios.', 'error');
    return;
  }

  restaurantQrPayState = { amount, extras };
  const amountEl = document.getElementById('restaurantQrPayAmount');
  const modal = document.getElementById('restaurantQrPayModal');

  if (amountEl) amountEl.textContent = formatCOP(amount);
  updateRestaurantQrPayModalUi();

  const hintEl = document.getElementById('restaurantQrPayHint');
  if (hint && hintEl) hintEl.textContent = hint;

  if (modal) {
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
  }
}

function closeRestaurantQrPayModal() {
  const modal = document.getElementById('restaurantQrPayModal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }
}

async function confirmRestaurantQrPayment() {
  const { amount, extras } = restaurantQrPayState;
  if (!amount || state.paymentSubmitting) return;

  closeRestaurantQrPayModal();
  await handleApprovedWompiPayment(amount, `qr-propio-${Date.now()}`, {
    ...extras,
    manualConfirmation: true,
  });
}

function startPaymentFlow(amount, options = {}) {
  if (usesRestaurantQrPayment()) {
    if (!canUseRestaurantQrPayment()) {
      showToast('El restaurante no configuró métodos de pago propios.', 'error');
      return;
    }

    openRestaurantQrPayModal(amount, options, options.hint);
    return;
  }

  openWompiCheckout(amount, options);
}

function updatePaymentExtrasUI(deliveredTotal) {
  const section = document.getElementById('paymentExtrasSection');
  const tipCustomField = document.getElementById('tipCustomField');
  const tipCustomInput = document.getElementById('tipCustomInput');
  const serviceRemoveConfirm = document.getElementById('serviceRemoveConfirm');

  if (!section) return;

  const showExtras =
    deliveredTotal > 0 && !state.paymentPendingConfirmation && !state.splitJoinAmount;
  section.hidden = !showExtras;

  const accountTotal = document.getElementById('accountTotal');
  if (accountTotal) accountTotal.hidden = showExtras || deliveredTotal <= 0;

  if (!showExtras) {
    if (serviceRemoveConfirm) serviceRemoveConfirm.hidden = true;
    return;
  }

  if (state.tipCustomMode && state.tipCustomAmount > 0) {
    state.tipCustomAmount = clampCustomTipAmount(state.tipCustomAmount, deliveredTotal);
  }

  const breakdown = getPaymentBreakdown(deliveredTotal);

  document.querySelectorAll('[data-tip-percent]').forEach((btn) => {
    const percent = Number(btn.dataset.tipPercent);
    btn.classList.toggle(
      'account__tip-btn--active',
      !state.tipCustomMode && getActiveTipPercent() === percent
    );
  });

  const customBtn = document.querySelector('[data-tip-action="custom"]');
  if (customBtn) {
    customBtn.classList.toggle(
      'account__tip-btn--active',
      state.tipCustomMode || (state.tipCustomAmount > 0 && !state.tipPercent)
    );
  }

  if (tipCustomField) tipCustomField.hidden = !state.tipCustomMode;
  if (tipCustomInput) {
    tipCustomInput.max = getMaxCustomTipAmount(deliveredTotal);
    if (document.activeElement !== tipCustomInput) {
      tipCustomInput.value = state.tipCustomAmount > 0 ? String(state.tipCustomAmount) : '';
    }
  }

  document.getElementById('summarySubtotal').textContent = formatCOP(breakdown.subtotal);

  const serviceRow = document.getElementById('summaryServiceRow');
  const optionalLink = document.getElementById('serviceOptionalLink');
  const serviceAmount = breakdown.cargoServicio + (state.serviceChargeEnabled ? breakdown.propina : 0);
  const showServiceRow = state.serviceChargeEnabled && serviceAmount > 0;

  if (serviceRow) serviceRow.hidden = !showServiceRow;
  if (showServiceRow) {
    document.getElementById('summaryServiceLabel').textContent =
      breakdown.serviceLabel || `Servicio (${state.serviceChargePercent}%)`;
    document.getElementById('summaryServiceAmount').textContent = formatCOP(serviceAmount);
  }
  if (optionalLink) optionalLink.hidden = !state.serviceChargeEnabled;
  if (serviceRemoveConfirm && !state.serviceChargeEnabled) serviceRemoveConfirm.hidden = true;

  const tipRow = document.getElementById('summaryTipRow');
  const showTipRow = !state.serviceChargeEnabled && breakdown.propina > 0;
  if (tipRow) tipRow.hidden = !showTipRow;
  if (showTipRow) {
    const tipLabel = breakdown.propinaLabel === 'Otra'
      ? 'Propina'
      : `Propina (${breakdown.propinaLabel})`;
    document.getElementById('summaryTipLabel').textContent = tipLabel;
    document.getElementById('summaryTipAmount').textContent = formatCOP(breakdown.propina);
  }

  document.getElementById('summaryTotal').textContent = formatCOP(breakdown.total);
}

function hideServiceRemoveConfirm() {
  const confirm = document.getElementById('serviceRemoveConfirm');
  if (confirm) confirm.hidden = true;
}

function refreshPaymentUi() {
  const deliveredTotal = getAccountDeliveredTotal();
  updatePaymentExtrasUI(deliveredTotal);
  updateSplitBillUI(deliveredTotal);
  updateSplitJoinUI();
}

function updateSplitJoinUI() {
  const section = document.getElementById('splitJoinSection');
  const amountEl = document.getElementById('splitJoinAmount');
  const btn = document.getElementById('splitJoinPayBtn');
  const amount = state.splitJoinAmount;

  if (!section) return;

  const show = amount > 0 && !state.paymentPendingConfirmation;
  section.hidden = !show;

  if (!show) return;

  if (amountEl) amountEl.textContent = `Tu parte: ${formatCOP(amount)}`;
  if (btn) {
    btn.textContent = usesRestaurantQrPayment()
      ? `Pagar ${formatCOP(amount)}`
      : `Pagar ${formatCOP(amount)} con Wompi`;
    btn.disabled = state.paymentSubmitting;
  }
}

function hideRestaurantSplitPaymentExtras() {
  const amountEl = document.getElementById('splitRestaurantQrAmount');
  const linkBtn = document.getElementById('splitPaymentLinkBtn');
  const divider = document.getElementById('splitPaymentDivider');
  const canvas = document.getElementById('splitQrCanvas');

  if (amountEl) {
    amountEl.textContent = '';
    amountEl.hidden = true;
  }
  if (linkBtn) linkBtn.hidden = true;
  if (divider) divider.hidden = true;
  if (canvas) canvas.hidden = false;
}

function renderRestaurantSplitQr(shareAmount) {
  const canvas = document.getElementById('splitQrCanvas');
  const box = document.getElementById('splitQrBox');
  const hint = box?.querySelector('.account__split-qr-hint');
  const amountEl = document.getElementById('splitRestaurantQrAmount');
  const linkBtn = document.getElementById('splitPaymentLinkBtn');
  const divider = document.getElementById('splitPaymentDivider');
  const link = getRestaurantPaymentLink();
  const qrUrl = getRestaurantPaymentQrUrl();

  if (!canvas || !box || !state.sesionId || shareAmount <= 0) {
    if (box) box.hidden = true;
    clearSplitQrCanvas();
    hideRestaurantSplitPaymentExtras();
    return;
  }

  const cacheKey = `qr-propio-${shareAmount}-${link}-${qrUrl}`;

  box.hidden = false;
  if (cacheKey === state.lastSplitQrUrl && canvas.childNodes.length > 0) return;

  state.lastSplitQrUrl = cacheKey;

  if (amountEl) {
    amountEl.textContent = formatCOP(shareAmount);
    amountEl.hidden = false;
  }
  if (linkBtn) linkBtn.hidden = !link;
  if (divider) divider.hidden = !(link && qrUrl);

  canvas.innerHTML = '';
  if (qrUrl) {
    canvas.hidden = false;
    const img = document.createElement('img');
    img.className = 'account__split-restaurant-qr-img';
    img.src = qrUrl;
    img.alt = 'QR de pago Nequi/Daviplata';
    canvas.appendChild(img);
  } else {
    canvas.hidden = true;
  }

  if (hint) {
    if (link && qrUrl) {
      hint.textContent = 'Abrí el link o escaneá el QR para transferir tu parte';
    } else if (link) {
      hint.textContent = 'Abrí el link para transferir tu parte';
    } else {
      hint.textContent = 'Transferí tu parte escaneando este QR';
    }
  }
}

function renderSplitPaymentQr(shareAmount) {
  if (usesRestaurantQrPayment()) {
    renderRestaurantSplitQr(shareAmount);
    return;
  }

  void renderSplitQr(shareAmount);
}

async function renderSplitQr(shareAmount) {
  const canvas = document.getElementById('splitQrCanvas');
  const box = document.getElementById('splitQrBox');
  const hint = box?.querySelector('.account__split-qr-hint');

  hideRestaurantSplitPaymentExtras();

  if (!canvas || !box || !state.sesionId || shareAmount <= 0) {
    if (box) box.hidden = true;
    clearSplitQrCanvas();
    return;
  }

  box.hidden = false;

  let splitCode = state.sessionSplitCode;
  if (!splitCode) {
    try {
      splitCode = await ensureSessionSplitCode(state.sesionId);
      state.sessionSplitCode = splitCode;
    } catch (error) {
      console.error(error);
      canvas.innerHTML = '';
      canvas.textContent = 'No se pudo generar el código QR.';
      state.lastSplitQrUrl = '';
      return;
    }
  }

  const url = buildSplitPaymentUrl(shareAmount, splitCode);

  if (url === state.lastSplitQrUrl && canvas.childNodes.length > 0) return;

  state.lastSplitQrUrl = url;
  canvas.innerHTML = '';

  if (typeof QRCode === 'undefined') {
    canvas.textContent = 'No se pudo cargar el generador de QR.';
    return;
  }

  new QRCode(canvas, {
    text: url,
    width: 220,
    height: 220,
    colorDark: '#0a0a0c',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });

  if (hint) {
    hint.textContent = 'Cada persona escanea este QR y paga su parte';
  }
}

function updateSplitBillUI(deliveredTotal) {
  const splitSection = document.getElementById('splitBillSection');
  const splitShareEl = document.getElementById('splitShareAmount');
  const splitProgressEl = document.getElementById('splitPaymentProgress');
  const splitInput = document.getElementById('splitCountInput');
  const minusBtn = document.getElementById('splitCountMinus');
  const plusBtn = document.getElementById('splitCountPlus');
  const splitPayBtn = document.getElementById('splitPayBtn');

  if (!splitSection) return;

  const showSplit =
    state.sessionTipo === 'grupal' &&
    deliveredTotal > 0 &&
    !state.paymentPendingConfirmation &&
    !state.splitJoinAmount;
  splitSection.hidden = !showSplit;

  if (!showSplit) {
    const box = document.getElementById('splitQrBox');
    if (box) box.hidden = true;
    clearSplitQrCanvas();
    return;
  }

  if (splitInput) splitInput.value = String(state.splitCount);
  if (minusBtn) minusBtn.disabled = state.splitCount <= 2 || state.paymentSubmitting;
  if (plusBtn) plusBtn.disabled = state.splitCount >= 20 || state.paymentSubmitting;

  const shareAmount = getPerPersonPaymentAmount(deliveredTotal).total;
  if (splitShareEl) {
    splitShareEl.textContent = `Cada uno paga: ${formatCOP(shareAmount)}`;
  }

  const paidTotal = getGroupPaidTotal();
  const breakdown = getPaymentBreakdown(deliveredTotal);
  if (splitProgressEl) {
    if (paidTotal > 0) {
      splitProgressEl.hidden = false;
      splitProgressEl.textContent = `Pagado: ${formatCOP(paidTotal)} de ${formatCOP(breakdown.total)}`;
    } else {
      splitProgressEl.hidden = true;
      splitProgressEl.textContent = '';
    }
  }

  if (paidTotal >= breakdown.total) {
    const box = document.getElementById('splitQrBox');
    if (box) box.hidden = true;
    clearSplitQrCanvas();
    return;
  }

  renderSplitPaymentQr(shareAmount);

  if (splitPayBtn) {
    splitPayBtn.disabled = state.paymentSubmitting || shareAmount <= 0;
  }
}

const WOMPI_PUBLIC_KEY = 'pub_test_sLvY32q8txNx6ygl0BrYaNo5w1aUkfMT';
const WOMPI_SIGNATURE_URL = `${SUPABASE_URL}/functions/v1/wompi-signature`;

function getWompiPublicKey() {
  return RESTAURANTE?.wompi_public_key || WOMPI_PUBLIC_KEY;
}

function buildWompiPaymentReference() {
  return `listo-${state.sesionId}-${Date.now()}`;
}

const WOMPI_PENDING_STORAGE_KEY = 'listo_wompi_pending_payment';

function buildWompiRedirectUrl() {
  const params = new URLSearchParams(window.location.search);
  ['id', 'status', 'reference'].forEach((key) => params.delete(key));
  const slug = RESTAURANTE_SLUG || '';
  const query = params.toString();
  const path = slug ? `/${encodeURIComponent(slug)}` : '';
  const hash = window.location.hash || '';
  return `${LISTOAPP_BASE_URL}${path}${query ? `?${query}` : ''}${hash}`;
}

function getWompiRedirectParams() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const status = params.get('status');
  const reference = params.get('reference');

  if (!id || !status || !reference) return null;

  return { id, status, reference };
}

function clearWompiRedirectParamsFromUrl() {
  const url = new URL(window.location.href);
  let changed = false;

  ['id', 'status', 'reference'].forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  });

  if (changed) {
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }
}

function saveWompiPendingPayment({ amount, reference, cargoServicio = 0, propina = 0 }) {
  if (!state.sesionId) return;

  sessionStorage.setItem(
    WOMPI_PENDING_STORAGE_KEY,
    JSON.stringify({
      sesionId: state.sesionId,
      amount,
      reference,
      cargoServicio,
      propina,
    })
  );
}

function loadWompiPendingPayment(reference) {
  try {
    const raw = sessionStorage.getItem(WOMPI_PENDING_STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (data.reference !== reference) return null;

    return data;
  } catch {
    return null;
  }
}

function clearWompiPendingPayment() {
  sessionStorage.removeItem(WOMPI_PENDING_STORAGE_KEY);
}

function extractSesionIdFromWompiReference(reference) {
  const match = String(reference || '').match(/^listo-(.+)-(\d+)$/);
  return match ? match[1] : null;
}

async function fetchWompiSignature(amountInCents, reference) {
  const response = await fetch(WOMPI_SIGNATURE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ amount: amountInCents, reference }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'No se pudo obtener la firma de Wompi.');
  }

  if (!data.signature || !data.publicKey) {
    throw new Error('Respuesta inválida del servidor de pagos.');
  }

  return data;
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
  if (!state.mesaId || !supabaseClient) return;

  if (mesaRealtimeChannel) {
    supabaseClient.removeChannel(mesaRealtimeChannel);
    mesaRealtimeChannel = null;
  }

  mesaRealtimeChannel = supabaseClient.channel(`mesa-${state.mesaId}`);

  mesaRealtimeChannel
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pedidos', filter: `mesa_id=eq.${state.mesaId}` },
      () => loadAccountItems()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pedido_items' },
      () => loadAccountItems()
    );

  if (state.sesionId) {
    mesaRealtimeChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pagos_grupo', filter: `sesion_id=eq.${state.sesionId}` },
      () => {
        loadGroupPayments().then(() => renderAccount());
      }
    );
  }

  mesaRealtimeChannel.subscribe();
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

function updateCartBarVisibility() {
  const cartBar = document.getElementById('cartBar');
  if (!cartBar) return;

  const { count } = getCartTotals();
  const visible = state.activeTab === 'carta' && count > 0;

  cartBar.classList.toggle('cart-bar--visible', visible);
  cartBar.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function updateCartBar() {
  const { count, total } = getCartTotals();
  const summary = document.getElementById('cartSummary');
  const sendBtn = document.getElementById('sendOrderBtn');

  summary.textContent = `${count} item${count !== 1 ? 's' : ''} - ${formatCOP(total)}`;
  sendBtn.disabled = count === 0;
  updateCartBarVisibility();
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

  showToast(successMsg, 'success');

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
function getAccountCodeHintStorageKey() {
  return `${ACCOUNT_CODE_HINT_SEEN_PREFIX}:${RESTAURANTE_ID}:${state.mesaId || 'mesa'}`;
}

function hasSeenAccountCodeHint() {
  try {
    return sessionStorage.getItem(getAccountCodeHintStorageKey()) === '1';
  } catch {
    return false;
  }
}

function markAccountCodeHintSeen() {
  try {
    sessionStorage.setItem(getAccountCodeHintStorageKey(), '1');
  } catch {
    /* ignore */
  }
}

function hideAccountCodeHint() {
  const el = document.getElementById('accountCodeHint');
  if (!el) return;

  el.classList.remove('account__code-hint--visible');
  clearTimeout(accountCodeHintTimer);
  clearTimeout(accountCodeHintHideTimer);
  accountCodeHintTimer = null;

  accountCodeHintHideTimer = setTimeout(() => {
    el.hidden = true;
    accountCodeHintHideTimer = null;
  }, 350);
}

function maybeShowAccountCodeHint() {
  const el = document.getElementById('accountCodeHint');
  if (!el || state.sessionNumero == null || state.sessionNumero === '') return;
  if (hasSeenAccountCodeHint()) return;
  if (accountCodeHintTimer || el.classList.contains('account__code-hint--visible')) return;

  const code = `#${formatSessionCode(state.sessionNumero)}`;
  el.textContent = `Tu código es ${code} — compartilo para unir cuentas`;
  el.hidden = false;

  requestAnimationFrame(() => {
    el.classList.add('account__code-hint--visible');
  });

  accountCodeHintTimer = setTimeout(() => {
    accountCodeHintTimer = null;
    markAccountCodeHintSeen();
    hideAccountCodeHint();
  }, ACCOUNT_CODE_HINT_DURATION_MS);
}

function showAccountCodeHintOnTabEnter() {
  if (hasSeenAccountCodeHint()) {
    const el = document.getElementById('accountCodeHint');
    if (el) el.hidden = true;
    return;
  }

  maybeShowAccountCodeHint();
}

function renderAccount() {
  const empty = document.getElementById('accountEmpty');
  const inProgressSection = document.getElementById('inProgressSection');
  const inProgressList = document.getElementById('inProgressList');
  const inProgressEmpty = document.getElementById('inProgressEmpty');
  const deliveredSection = document.getElementById('deliveredSection');
  const deliveredList = document.getElementById('deliveredList');
  const totalEl = document.getElementById('accountTotal');
  const badge = document.getElementById('accountBadge');
  const wompiPayBtn = document.getElementById('wompiPayBtn');
  const paymentWaiting = document.getElementById('accountPaymentWaiting');
  const isGrupal = state.sessionTipo === 'grupal';

  const items = state.accountItems;
  const inProgress = items.filter(isInProgress);
  const delivered = items.filter((item) => item.confirmado);
  const groupedDelivered = groupDeliveredItems(delivered);
  const deliveredTotal = getAccountDeliveredTotal();
  const inProgressCount = inProgress.reduce((sum, item) => sum + item.qty, 0);

  if (items.length === 0) {
    empty.style.display = state.splitJoinAmount ? 'none' : 'block';
    inProgressSection.hidden = true;
    deliveredSection.hidden = true;
    badge.hidden = true;
    if (wompiPayBtn) wompiPayBtn.hidden = true;
    if (paymentWaiting) paymentWaiting.hidden = !state.paymentPendingConfirmation;
    updatePaymentExtrasUI(0);
    updateSplitBillUI(0);
    updateSplitJoinUI();
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

    const showPayButton = deliveredTotal > 0 && !state.paymentPendingConfirmation && !isGrupal;
    if (wompiPayBtn) {
      wompiPayBtn.hidden = !showPayButton;
      if (showPayButton) {
        wompiPayBtn.textContent = usesRestaurantQrPayment() ? 'Pagar' : 'Pagar con Wompi';
      }
    }
    if (paymentWaiting) paymentWaiting.hidden = !state.paymentPendingConfirmation;
    updatePaymentExtrasUI(deliveredTotal);
    updateSplitBillUI(deliveredTotal);
    updateSplitJoinUI();
  } else {
    deliveredSection.hidden = true;
    if (wompiPayBtn) wompiPayBtn.hidden = true;
    if (paymentWaiting) paymentWaiting.hidden = !state.paymentPendingConfirmation;
    updatePaymentExtrasUI(0);
    updateSplitBillUI(0);
    updateSplitJoinUI();
  }

  badge.hidden = inProgressCount === 0;
  badge.textContent = inProgressCount;
}

function getSessionSwitchSuccessMessage(session) {
  const label =
    session.tipo === 'grupal'
      ? 'Cuenta Grupal'
      : `Cuenta ${formatSessionCode(session.numero)} (Personal)`;
  return `Cambio exitoso — ahora estás en ${label}. Tus pedidos activos fueron transferidos.`;
}

async function clearPaymentInProgress() {
  if (!state.sesionId) return;

  const { error } = await supabaseClient
    .from('sesiones')
    .update({ pago_en_proceso: false })
    .eq('id', state.sesionId);

  if (error) console.error('Error limpiando pago en proceso:', error);
}

async function markPaymentInProgress() {
  if (!state.sesionId) return false;

  const { error } = await supabaseClient
    .from('sesiones')
    .update({ pago_en_proceso: true })
    .eq('id', state.sesionId);

  if (error) {
    console.error(error);
    showToast(error.message || 'No se pudo iniciar el pago.', 'error');
    return false;
  }

  return true;
}

async function getSessionApprovedPaymentsTotal(sesionId) {
  const { data, error } = await supabaseClient
    .from('pagos_grupo')
    .select('monto')
    .eq('sesion_id', sesionId)
    .eq('estado', 'aprobado');

  if (error) throw error;

  return (data || []).reduce((sum, row) => sum + Number(row.monto), 0);
}

async function saveSessionPaymentExtras(cargoServicio, propina) {
  if (!state.sesionId) return;

  const { data, error: readError } = await supabaseClient
    .from('sesiones')
    .select('cargo_servicio, propina')
    .eq('id', state.sesionId)
    .maybeSingle();

  if (readError) throw readError;

  const { error } = await supabaseClient
    .from('sesiones')
    .update({
      cargo_servicio: (Number(data?.cargo_servicio) || 0) + cargoServicio,
      propina: (Number(data?.propina) || 0) + propina,
    })
    .eq('id', state.sesionId);

  if (error) throw error;
}

async function handleApprovedWompiPayment(monto, referenciaWompi, extras = {}) {
  if (!state.sesionId || state.paymentSubmitting) return;

  state.paymentSubmitting = true;

  const cargoServicio = Number(extras.cargoServicio) || 0;
  const propina = Number(extras.propina) || 0;

  try {
    const { error: insertError } = await supabaseClient.from('pagos_grupo').insert({
      sesion_id: state.sesionId,
      monto,
      referencia_wompi: referenciaWompi,
      estado: 'aprobado',
    });

    if (insertError) throw insertError;

    await saveSessionPaymentExtras(cargoServicio, propina);

    const breakdown = getPaymentBreakdown();
    const paidTotal = await getSessionApprovedPaymentsTotal(state.sesionId);

    await loadGroupPayments();

    state.splitJoinAmount = null;

    if (breakdown.total > 0 && paidTotal >= breakdown.total) {
      await markPaymentPendingConfirmation(
        extras.manualConfirmation ? PAYMENT_PENDING_MESSAGE : null,
        {
          skipSubmittingGuard: true,
          referenciaWompi: referenciaWompi,
          skipToast: !extras.manualConfirmation,
        }
      );

      if (!extras.manualConfirmation) {
        void checkSessionStatus();
      }
    } else {
      await clearPaymentInProgress();
      showToast('Tu parte fue registrada.', 'success', 4000);
      renderAccount();
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo registrar tu pago.', 'error');
    await clearPaymentInProgress();
  } finally {
    state.paymentSubmitting = false;
    if (state.sesionId) renderAccount();
  }
}

async function markPaymentPendingConfirmation(successMessage, options = {}) {
  const { skipSubmittingGuard = false, referenciaWompi = null, skipToast = false } = options;

  if (!state.sesionId) return;
  if (!skipSubmittingGuard && state.paymentSubmitting) return;

  if (!skipSubmittingGuard) state.paymentSubmitting = true;

  try {
    const updatePayload = {
      pago_pendiente_confirmacion: true,
      pago_en_proceso: false,
    };

    if (referenciaWompi) {
      updatePayload.referencia_wompi = referenciaWompi;
    }

    const { error } = await supabaseClient
      .from('sesiones')
      .update(updatePayload)
      .eq('id', state.sesionId);

    if (error) throw error;

    state.paymentPendingConfirmation = true;
    state.splitJoinAmount = null;
    renderAccount();
    if (!skipToast) {
      showToast(successMessage || PAYMENT_PENDING_MESSAGE, 'success', 5000);
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo registrar el pago.', 'error');
  } finally {
    if (!skipSubmittingGuard) state.paymentSubmitting = false;
  }
}

async function handleWompiRedirectReturn() {
  const wompiParams = getWompiRedirectParams();
  if (!wompiParams) return false;

  clearWompiRedirectParamsFromUrl();

  const { id, status, reference } = wompiParams;
  const normalizedStatus = String(status).toUpperCase();

  if (normalizedStatus !== 'APPROVED') {
    clearWompiPendingPayment();
    await clearPaymentInProgress();
    showToast('El pago no se completó. Podés intentar de nuevo.', 'error');
    return true;
  }

  if (!state.sesionId) {
    clearWompiPendingPayment();
    showToast('No se pudo vincular el pago con tu sesión.', 'error');
    return true;
  }

  const sesionFromRef = extractSesionIdFromWompiReference(reference);
  if (sesionFromRef && sesionFromRef !== state.sesionId) {
    clearWompiPendingPayment();
    showToast('El pago no corresponde a tu sesión actual.', 'error');
    return true;
  }

  const referenciaWompi = id || reference;

  await markPaymentPendingConfirmation(null, {
    referenciaWompi,
    skipToast: true,
  });

  clearWompiPendingPayment();
  void checkSessionStatus();
  switchTab('cuenta');
  return true;
}

async function openWompiCheckout(amount, options = {}) {
  if (typeof WidgetCheckout === 'undefined') {
    showToast('No se pudo cargar Wompi. Recarga la página.', 'error');
    return;
  }

  if (!state.sesionId) {
    showToast('No se pudo identificar tu sesión.', 'error');
    return;
  }

  if (amount <= 0) return;

  const started = await markPaymentInProgress();
  if (!started) return;

  const reference = options.reference || buildWompiPaymentReference();
  const amountInCents = Math.round(amount * 100);

  saveWompiPendingPayment({
    amount,
    reference,
    cargoServicio: options.cargoServicio || 0,
    propina: options.propina || 0,
  });

  try {
    const { signature, publicKey } = await fetchWompiSignature(amountInCents, reference);

    const checkout = new WidgetCheckout({
      currency: 'COP',
      amountInCents,
      reference,
      publicKey,
      signature: { integrity: signature },
      redirectUrl: buildWompiRedirectUrl(),
    });

    checkout.open((result) => {
      const transaction = result?.transaction;
      if (transaction?.status === 'APPROVED') {
        clearWompiPendingPayment();
        const referencia = transaction.id || transaction.reference || reference;
        handleApprovedWompiPayment(amount, referencia, {
          cargoServicio: options.cargoServicio || 0,
          propina: options.propina || 0,
        });
      } else {
        clearWompiPendingPayment();
        clearPaymentInProgress();
      }
    });
  } catch (error) {
    console.error(error);
    clearWompiPendingPayment();
    await clearPaymentInProgress();
    showToast(error.message || 'No se pudo iniciar el pago con Wompi.', 'error');
  }
}

function initPaymentExtras() {
  const optionalLink = document.getElementById('serviceOptionalLink');
  const serviceRemoveConfirm = document.getElementById('serviceRemoveConfirm');

  if (optionalLink && !optionalLink.dataset.bound) {
    optionalLink.dataset.bound = 'true';
    optionalLink.addEventListener('click', () => {
      if (!state.serviceChargeEnabled || !serviceRemoveConfirm) return;
      serviceRemoveConfirm.hidden = false;
    });
  }

  if (serviceRemoveConfirm && !serviceRemoveConfirm.dataset.bound) {
    serviceRemoveConfirm.dataset.bound = 'true';
    serviceRemoveConfirm.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action]');
      if (!btn) return;

      if (btn.dataset.action === 'confirm-remove-service') {
        state.serviceChargeEnabled = false;
        state.lastSplitQrUrl = '';
        hideServiceRemoveConfirm();
        refreshPaymentUi();
        return;
      }

      if (btn.dataset.action === 'cancel-remove-service') {
        hideServiceRemoveConfirm();
      }
    });
  }

  const tipOptions = document.getElementById('tipPercentOptions');
  if (tipOptions && !tipOptions.dataset.bound) {
    tipOptions.dataset.bound = 'true';
    tipOptions.addEventListener('click', (event) => {
      const percentBtn = event.target.closest('[data-tip-percent]');
      const customBtn = event.target.closest('[data-tip-action="custom"]');

      if (percentBtn) {
        const percent = Number(percentBtn.dataset.tipPercent);
        const activePercent = getActiveTipPercent();

        if (activePercent === percent && !state.tipCustomMode) {
          state.tipPercent = null;
          state.tipCustomMode = false;
          state.tipCustomAmount = 0;
        } else {
          state.tipPercent = percent;
          state.tipCustomMode = false;
          state.tipCustomAmount = 0;
        }
      } else if (customBtn) {
        if (state.tipCustomMode) {
          state.tipCustomMode = false;
          state.tipCustomAmount = 0;
        } else {
          state.tipCustomMode = true;
          state.tipPercent = null;
        }
      } else {
        return;
      }

      state.lastSplitQrUrl = '';
      refreshPaymentUi();
    });
  }

  const tipCustomInput = document.getElementById('tipCustomInput');
  if (tipCustomInput && !tipCustomInput.dataset.bound) {
    tipCustomInput.dataset.bound = 'true';
    tipCustomInput.addEventListener('input', () => {
      state.tipCustomMode = true;
      state.tipPercent = null;
      const subtotal = getAccountDeliveredTotal();
      state.tipCustomAmount = clampCustomTipAmount(tipCustomInput.value, subtotal);
      if (Number(tipCustomInput.value) !== state.tipCustomAmount) {
        tipCustomInput.value = state.tipCustomAmount > 0 ? String(state.tipCustomAmount) : '';
      }
      state.lastSplitQrUrl = '';
      refreshPaymentUi();
    });
  }
}

function initWompiPayment() {
  document.getElementById('wompiPayBtn')?.addEventListener('click', () => {
    const breakdown = getPaymentBreakdown();
    startPaymentFlow(breakdown.total, {
      cargoServicio: breakdown.cargoServicio,
      propina: breakdown.propina,
    });
  });

  document.getElementById('splitJoinPayBtn')?.addEventListener('click', () => {
    const amount = state.splitJoinAmount;
    if (!amount || state.paymentSubmitting || state.paymentPendingConfirmation) return;

    startPaymentFlow(amount, {
      hint: 'Pagá tu parte de la cuenta.',
    });
  });

  document.getElementById('restaurantQrPayLinkBtn')?.addEventListener('click', openRestaurantPaymentLink);
  document.getElementById('splitPaymentLinkBtn')?.addEventListener('click', openRestaurantPaymentLink);

  document.querySelectorAll('[data-close-restaurant-qr-pay]').forEach((el) => {
    if (el.dataset.bound) return;
    el.dataset.bound = 'true';
    el.addEventListener('click', closeRestaurantQrPayModal);
  });

  document.getElementById('restaurantQrPayConfirmBtn')?.addEventListener('click', confirmRestaurantQrPayment);
}

function initSplitBill() {
  cleanupLegacySplitUi();

  const minusBtn = document.getElementById('splitCountMinus');
  const plusBtn = document.getElementById('splitCountPlus');

  if (minusBtn && !minusBtn.dataset.bound) {
    minusBtn.dataset.bound = 'true';
    minusBtn.addEventListener('click', () => {
      if (state.splitCount <= 2) return;
      state.splitCount -= 1;
      state.lastSplitQrUrl = '';
      refreshPaymentUi();
    });
  }

  if (plusBtn && !plusBtn.dataset.bound) {
    plusBtn.dataset.bound = 'true';
    plusBtn.addEventListener('click', () => {
      if (state.splitCount >= 20) return;
      state.splitCount += 1;
      state.lastSplitQrUrl = '';
      refreshPaymentUi();
    });
  }

  const splitPayBtn = document.getElementById('splitPayBtn');
  if (splitPayBtn && !splitPayBtn.dataset.bound) {
    splitPayBtn.dataset.bound = 'true';
    splitPayBtn.addEventListener('click', () => {
      const breakdown = getPaymentBreakdown();
      const share = getPerPersonPaymentAmount();
      const paidTotal = getGroupPaidTotal();

      if (paidTotal >= breakdown.total) {
        showToast('La cuenta ya está cubierta.', 'success');
        return;
      }

      startPaymentFlow(share.total, {
        cargoServicio: share.cargoServicio,
        propina: share.propina,
        hint: 'Transferí tu parte con el monto indicado.',
      });
    });
  }
}

function initAccountSwitch() {
  const form = document.getElementById('accountSwitchForm');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!state.mesaId || !state.sesionId) {
      showToast('No se pudo identificar tu sesión. Recarga la página.', 'error');
      return;
    }

    const codeInput = document.getElementById('accountSwitchCode');
    const btn = document.getElementById('accountSwitchBtn');
    const code = codeInput?.value?.trim();

    if (!code) {
      showToast('Ingresá el código de 4 dígitos.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Cambiando…';

    try {
      const session = await switchSessionByCode(state.mesaId, state.sesionId, code);
      applySession(session);
      if (codeInput) codeInput.value = '';
      await loadAccountItems();
      showToast(getSessionSwitchSuccessMessage(session), 'success', 5000);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'No se pudo cambiar de cuenta.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Confirmar cambio';
    }
  });
}

/* ── Tabs ── */
function switchTab(tabId) {
  if (!VALID_TABS.has(tabId)) return;

  state.activeTab = tabId;
  saveActiveTab(tabId);

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

  if (tabId === 'cuenta') {
    renderAccount();
    showAccountCodeHintOnTabEnter();
  }

  updateCartBarVisibility();
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
  const tabFromHash = VALID_TABS.has(hash) ? hash : null;
  switchTab(tabFromHash || getStoredActiveTab() || 'carta');
}

function applySession(session) {
  state.sesionId = session.id;
  state.sessionToken = session.session_token || null;
  state.sessionTipo = session.tipo;
  state.sessionNumero = session.numero;
  state.splitCount = 2;
  state.sessionSplitCode = null;
  paymentSuccessShown = false;
  clearSplitQrCanvas();
  updateSessionBadge(session);
  subscribeToRealtime();
  startSessionPolling();
}

/* ── Init ── */
async function init() {
  const restaurant = await window.restaurantReady;
  if (!restaurant) return;

  try {
    await loadMesa();

    let session = null;
    try {
      session = await tryJoinFromSplitQrParams();
    } catch (joinError) {
      console.error(joinError);
      showToast(joinError.message || 'No se pudo unir a la cuenta.', 'error');
    }

    if (!session) {
      session = await startSessionFlow(state.mesaId, state.mesaNumero);
    }
    if (!session) return;

    applySession(session);

    bindProductsInput();
    renderCategories();
    renderProducts();
    updateCartBar();
    updateCartBarVisibility();
    initWaiterButtons();
    initAccountSwitch();
    initPaymentExtras();
    initWompiPayment();
    initSplitBill();
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
    await handleWompiRedirectReturn();

    if (state.splitJoinAmount) {
      switchTab('cuenta');
      updateSplitJoinUI();
    }
  } catch (error) {
    console.error('Error inicializando Supabase:', error);
    showToast(error.message || 'Error conectando con Supabase.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
