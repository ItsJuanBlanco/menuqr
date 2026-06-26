const PEDIDO_ESTADOS_ACTIVOS = ['pendiente', 'en_preparacion'];

let orders = [];
let mesas = [];
let mesaAccounts = {};
let mesaSessionBreakdown = {};
let mesaSessionItems = {};
let activePanel = 'pedidos';
let updating = new Set();
let listClickBound = false;
let mesasClickBound = false;
let expandedLibreMesas = new Set();
let realtimeChannel = null;
let realtimeRefreshTimer = null;
let dataphoneModalState = null;
let paymentQrModalState = null;
let accountModalState = null;
let openMesaQrNumero = null;
let mesaQrAddOpen = false;
let panelPollTimer = null;
let panelAlertsInitialized = false;
let panelAudioContext = null;
let panelSoundsEnabled = true;

const PANEL_POLL_INTERVAL_MS = 5000;
const PANEL_SOUNDS_STORAGE_KEY = 'panel_sonidos';
const PANEL_SERVICE_PERCENT = 10;

const VALID_PANEL_TABS = new Set(['pedidos', 'mesas', 'historial', 'menu', 'resumen', 'qr', 'ajustes']);
const ACTIVE_PANEL_TAB_KEY = 'activePanelTab';

function saveActivePanelTab(panelId) {
  if (VALID_PANEL_TABS.has(panelId)) {
    localStorage.setItem(ACTIVE_PANEL_TAB_KEY, panelId);
  }
}

function getStoredActivePanelTab() {
  const stored = localStorage.getItem(ACTIVE_PANEL_TAB_KEY);
  return VALID_PANEL_TABS.has(stored) ? stored : null;
}

function restoreActivePanelTab() {
  const stored = getStoredActivePanelTab();
  const allowed = getAllowedPanelTabs(window.PANEL_ACCESS_ROLE || 'mesero');
  const panelId = stored && allowed.has(stored) ? stored : 'pedidos';
  switchPanel(panelId);
}

function getPanelPaymentBreakdown(subtotal, serviceEnabled = true) {
  const cargoServicio = serviceEnabled
    ? Math.round(Number(subtotal) * (PANEL_SERVICE_PERCENT / 100))
    : 0;

  return {
    subtotal: Number(subtotal) || 0,
    cargoServicio,
    total: (Number(subtotal) || 0) + cargoServicio,
  };
}

async function saveSessionCargoServicio(sesionId, cargoServicio) {
  if (!sesionId || cargoServicio <= 0) return;

  const { data, error: readError } = await supabaseClient
    .from('sesiones')
    .select('cargo_servicio')
    .eq('id', sesionId)
    .maybeSingle();

  if (readError) throw readError;

  const { error } = await supabaseClient
    .from('sesiones')
    .update({
      cargo_servicio: (Number(data?.cargo_servicio) || 0) + cargoServicio,
    })
    .eq('id', sesionId);

  if (error) throw error;
}

function getPagarBaseUrl() {
  return `${LISTOAPP_BASE_URL}/pagar`;
}

function buildPagarUrl(monto, sesionId, cargoServicio = 0, parte = null) {
  const params = new URLSearchParams({
    monto: String(monto),
    sesion: sesionId,
  });
  if (cargoServicio > 0) params.set('servicio', String(cargoServicio));
  if (parte) params.set('parte', String(parte));
  if (RESTAURANTE_SLUG) params.set('slug', RESTAURANTE_SLUG);
  return `${getPagarBaseUrl()}?${params.toString()}`;
}

function getPanelSplitShare(subtotal, splitCount, serviceEnabled = true) {
  const breakdown = getPanelPaymentBreakdown(subtotal, serviceEnabled);
  const count = Math.max(2, Number(splitCount) || 2);

  return {
    count,
    breakdown,
    shareSubtotal: Math.ceil(breakdown.subtotal / count),
    shareServicio: Math.ceil(breakdown.cargoServicio / count),
    shareTotal: Math.ceil(breakdown.total / count),
  };
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

async function getSessionApprovedPaymentsCount(sesionId) {
  const { count, error } = await supabaseClient
    .from('pagos_grupo')
    .select('id', { count: 'exact', head: true })
    .eq('sesion_id', sesionId)
    .eq('estado', 'aprobado');

  if (error) throw error;
  return count || 0;
}

async function markSessionReadyForConfirmationIfPaid(sesionId, targetTotal) {
  const paidTotal = await getSessionApprovedPaymentsTotal(sesionId);
  if (paidTotal >= targetTotal) {
    const { error } = await supabaseClient
      .from('sesiones')
      .update({ pago_pendiente_confirmacion: true, pago_en_proceso: false })
      .eq('id', sesionId);

    if (error) throw error;
  }

  return paidTotal;
}

async function recordSplitPartPayment(sesionId, share, targetTotal) {
  const { error } = await supabaseClient.from('pagos_grupo').insert({
    sesion_id: sesionId,
    monto: share.shareTotal,
    estado: 'aprobado',
  });

  if (error) throw error;

  if (share.shareServicio > 0) {
    await saveSessionCargoServicio(sesionId, share.shareServicio);
  }

  return markSessionReadyForConfirmationIfPaid(sesionId, targetTotal);
}

function formatCOP(amount) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.className = 'panel-toast panel-toast--visible' + (type ? ` panel-toast--${type}` : '');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('panel-toast--visible'), 2800);
}

function showNewOrderToast(mesaNum) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  clearTimeout(showToast._timer);
  toast.className = 'panel-toast panel-toast--visible panel-toast--action';
  toast.innerHTML = `
    <span class="panel-toast__message">🔔 Nueva orden — Mesa ${escapeHtml(String(mesaNum))}</span>
    <button type="button" class="panel-toast__action">Ver pedidos</button>
  `;

  toast.querySelector('.panel-toast__action')?.addEventListener(
    'click',
    () => {
      toast.classList.remove('panel-toast--visible');
      switchPanel('pedidos');
    },
    { once: true }
  );

  showToast._timer = setTimeout(() => toast.classList.remove('panel-toast--visible'), 7000);
}

function showMesasPanelToast(messageHtml) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  clearTimeout(showToast._timer);
  toast.className = 'panel-toast panel-toast--visible panel-toast--action';
  toast.innerHTML = `
    <span class="panel-toast__message">${messageHtml}</span>
    <button type="button" class="panel-toast__action">Ver mesas</button>
  `;

  toast.querySelector('.panel-toast__action')?.addEventListener(
    'click',
    () => {
      toast.classList.remove('panel-toast--visible');
      switchPanel('mesas');
    },
    { once: true }
  );

  showToast._timer = setTimeout(() => toast.classList.remove('panel-toast--visible'), 7000);
}

function updatePanelTabBadge(tabId, count, ariaLabel = '', tone = '') {
  const tab = document.getElementById(tabId);
  if (!tab) return;

  let badge = tab.querySelector('.panel-tabs__badge');

  if (count <= 0) {
    badge?.remove();
    return;
  }

  if (!badge) {
    badge = document.createElement('span');
    tab.appendChild(badge);
  }

  badge.className = 'panel-tabs__badge' + (tone ? ` panel-tabs__badge--${tone}` : '');
  badge.textContent = count > 99 ? '99+' : String(count);
  if (ariaLabel) badge.setAttribute('aria-label', ariaLabel);
  else badge.removeAttribute('aria-label');
}

function updatePedidosTabBadge() {
  const count = orders.length;
  const tone = getOrdersBadgeState();
  updatePanelTabBadge(
    'tabPedidos',
    count,
    `${count} pedido${count !== 1 ? 's' : ''} pendiente${count !== 1 ? 's' : ''}`,
    tone || ''
  );
}

function countPendingPaymentSessions() {
  const sessionIds = new Set();

  Object.values(mesaSessionBreakdown).forEach((sessions) => {
    (sessions || []).forEach((session) => {
      if (session.pago_pendiente_confirmacion === true && session.id) {
        sessionIds.add(session.id);
      }
    });
  });

  return sessionIds.size;
}

function countWaiterRequiredMesas() {
  return mesas.filter((mesa) => mesa.mesero_requerido === true).length;
}

function getMesasTabBadgeCount() {
  return countPendingPaymentSessions() + countWaiterRequiredMesas();
}

function updateMesasTabBadge() {
  const pendingPayments = countPendingPaymentSessions();
  const waiterCalls = countWaiterRequiredMesas();
  const count = getMesasTabBadgeCount();

  const parts = [];
  if (pendingPayments > 0) {
    parts.push(`${pendingPayments} pago${pendingPayments !== 1 ? 's' : ''} por confirmar`);
  }
  if (waiterCalls > 0) {
    parts.push(`${waiterCalls} llamada${waiterCalls !== 1 ? 's' : ''} al mesero`);
  }

  updatePanelTabBadge('tabMesas', count, parts.join(', '));
}

function loadPanelSoundsPreference() {
  const stored = localStorage.getItem(PANEL_SOUNDS_STORAGE_KEY);
  panelSoundsEnabled = stored !== 'false';
}

function isPanelSoundsEnabled() {
  return panelSoundsEnabled;
}

function setPanelSoundsEnabled(enabled) {
  panelSoundsEnabled = enabled;
  localStorage.setItem(PANEL_SOUNDS_STORAGE_KEY, enabled ? 'true' : 'false');
  updatePanelSoundsToggleUI();
}

function updatePanelSoundsToggleUI() {
  const btn = document.getElementById('panelSoundsToggle');
  if (!btn) return;

  btn.textContent = panelSoundsEnabled ? '🔔' : '🔕';
  btn.setAttribute('aria-pressed', panelSoundsEnabled ? 'true' : 'false');
  btn.setAttribute(
    'aria-label',
    panelSoundsEnabled ? 'Sonidos activados' : 'Sonidos desactivados'
  );
  btn.title = panelSoundsEnabled ? 'Sonidos activados' : 'Sonidos desactivados';
  btn.classList.toggle('panel-header__sounds-btn--off', !panelSoundsEnabled);
}

function bindPanelSoundsToggle() {
  const btn = document.getElementById('panelSoundsToggle');
  if (!btn || btn.dataset.bound) return;

  btn.dataset.bound = 'true';
  btn.addEventListener('click', () => {
    if (!panelSoundsEnabled) {
      initAudioContext();
    }
    setPanelSoundsEnabled(!panelSoundsEnabled);
  });
}

function initAudioContext() {
  if (panelAudioContext) {
    if (panelAudioContext.state === 'suspended') {
      void panelAudioContext.resume();
    }
    return;
  }

  panelAudioContext = new (window.AudioContext || window.webkitAudioContext)();
}

function bindPanelAudioInit() {
  if (document.body.dataset.panelAudioInitBound) return;
  document.body.dataset.panelAudioInitBound = 'true';
  document.addEventListener('click', initAudioContext, { once: true });
}

function withPanelAudioContext(run) {
  if (!panelSoundsEnabled) return;

  const ctx = panelAudioContext;
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    void ctx.resume().then(run);
    return;
  }

  run();
}

function playNewOrderSound() {
  withPanelAudioContext(() => {
    const ctx = panelAudioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  });
}

function playWaiterCallSound() {
  withPanelAudioContext(() => {
    const ctx = panelAudioContext;
    [0, 0.2, 0.4].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(660, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.15);
    });
  });
}

function playPaymentStartSound() {
  withPanelAudioContext(() => {
    const ctx = panelAudioContext;
    [0, 0.25].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(i === 0 ? 800 : 600, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.2, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.2);
    });
  });
}

function playMesaOpeningSound() {
  withPanelAudioContext(() => {
    const ctx = panelAudioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(392, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(784, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.55);
  });
}

function countOccupiedMesas(mesaList = mesas) {
  return (mesaList || []).filter((mesa) => (mesa.estado || 'libre') === 'ocupada').length;
}

function stopPanelPolling() {
  if (panelPollTimer) {
    clearInterval(panelPollTimer);
    panelPollTimer = null;
  }
}

async function runPanelPoll() {
  try {
    if (activePanel === 'pedidos') {
      await fetchOrders();
      await fetchMesas({ skipRender: true });
    } else if (activePanel === 'mesas') {
      await Promise.all([fetchMesas(), fetchOrders()]);
    }
  } catch (error) {
    console.error(error);
  }
}

function startPanelPolling() {
  stopPanelPolling();
  panelPollTimer = setInterval(() => {
    void runPanelPoll();
  }, PANEL_POLL_INTERVAL_MS);
}

function handleNewOrdersDetected(previousCount, previousOrderIds) {
  if (orders.length <= previousCount) return;

  playNewOrderSound();
  updatePedidosTabBadge();

  if (activePanel !== 'mesas') return;

  const newOrders = orders.filter((order) => !previousOrderIds.has(order.id));
  if (newOrders.length === 0) return;

  const latestOrder = newOrders[newOrders.length - 1];
  const mesaNum = latestOrder.mesas?.numero ?? '?';
  showNewOrderToast(mesaNum);
}

function handleWaiterCallsDetected(previousWaiterMesaIds) {
  const newCalls = mesas.filter(
    (mesa) => mesa.mesero_requerido && !previousWaiterMesaIds.has(mesa.id)
  );

  if (newCalls.length === 0) return;

  playWaiterCallSound();

  if (activePanel !== 'mesas') {
    const latestCall = newCalls[newCalls.length - 1];
    showMesasPanelToast(`🔔 Llamada — Mesa ${escapeHtml(String(latestCall.numero))}`);
  }
}

function snapshotSessionPaymentFlags(breakdown = mesaSessionBreakdown) {
  const snapshot = new Map();

  Object.values(breakdown).forEach((sessions) => {
    sessions.forEach((session) => {
      snapshot.set(session.id, {
        pago_en_proceso: session.pago_en_proceso === true,
        pago_pendiente_confirmacion: session.pago_pendiente_confirmacion === true,
      });
    });
  });

  return snapshot;
}

function detectPaymentStartFromSnapshot(previousSnapshot, breakdown = mesaSessionBreakdown) {
  if (!panelAlertsInitialized) return;

  const started = [];

  Object.entries(breakdown).forEach(([mesaId, sessions]) => {
    const mesaNum = resolveMesaNumeroFromId(mesaId);

    (sessions || []).forEach((session) => {
      const previous = previousSnapshot.get(session.id);
      const isPayingNow =
        session.pago_en_proceso === true && session.pago_pendiente_confirmacion !== true;
      const wasPayingBefore =
        previous?.pago_en_proceso === true && previous?.pago_pendiente_confirmacion !== true;

      if (isPayingNow && !wasPayingBefore) {
        started.push({ mesaNum, sessionNum: session.numero });
      }
    });
  });

  if (started.length === 0) return;

  playPaymentStartSound();

  if (activePanel !== 'mesas') {
    const latest = started[started.length - 1];
    const code = formatSessionCode(latest.sessionNum);
    showMesasPanelToast(
      `💳 Pagando — Mesa ${escapeHtml(String(latest.mesaNum))} Cuenta #${escapeHtml(code)}`
    );
  }
}

function applySessionPaymentFlags(sesion) {
  if (!sesion?.mesa_id) return;

  const mesaId = sesion.mesa_id;
  if (!mesaSessionBreakdown[mesaId]) {
    mesaSessionBreakdown[mesaId] = [];
  }

  const sessions = mesaSessionBreakdown[mesaId];
  const existing = sessions.find((entry) => entry.id === sesion.id);

  if (existing) {
    existing.pago_en_proceso = sesion.pago_en_proceso === true;
    existing.pago_pendiente_confirmacion = sesion.pago_pendiente_confirmacion === true;
    return;
  }

  sessions.push({
    id: sesion.id,
    sesionId: sesion.id,
    label: formatSessionLineLabel(sesion),
    total: 0,
    numero: sesion.numero,
    tipo: sesion.tipo || 'individual',
    pago_pendiente_confirmacion: sesion.pago_pendiente_confirmacion === true,
    pago_en_proceso: sesion.pago_en_proceso === true,
    paidTotal: 0,
  });
}

function formatTime(isoString) {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoString));
}

function formatPedidoEstado(estado) {
  if (estado === 'en_preparacion') return 'En preparación';
  if (estado === 'pendiente') return 'Pendiente';
  return estado;
}

function formatMesaEstado(estado) {
  if (estado === 'ocupada') return 'Ocupada';
  if (estado === 'libre') return 'Libre';
  return estado || 'Libre';
}

function formatSessionCode(numero) {
  if (numero == null || numero === '') return null;
  return String(numero).padStart(4, '0');
}

function formatOrderMesaLabel(order) {
  const mesaNum = order.mesas?.numero ?? '?';
  const sessionNum = order.sesiones?.numero;

  if (sessionNum != null && sessionNum !== '') {
    return `Mesa ${mesaNum} · #${String(sessionNum).padStart(4, '0')}`;
  }

  return `Mesa ${mesaNum}`;
}

async function attachSessionDataToOrders(orderRows) {
  const rows = orderRows || [];
  const sesionIds = [...new Set(rows.map((order) => order.sesion_id).filter(Boolean))];

  if (sesionIds.length === 0) return rows;

  const { data: sesionesData, error: sesionesError } = await supabaseClient
    .from('sesiones')
    .select('id, numero, tipo')
    .eq('restaurante_id', RESTAURANTE_ID)
    .in('id', sesionIds);

  if (sesionesError) throw sesionesError;

  const sessionById = new Map((sesionesData || []).map((session) => [session.id, session]));

  return rows.map((order) => ({
    ...order,
    sesiones: order.sesion_id ? sessionById.get(order.sesion_id) || null : null,
  }));
}

function normalizeItemEstado(estado) {
  return estado || 'pendiente';
}

function isItemDelivered(item) {
  return item.confirmado_por_mesero === true;
}

function orderHasPendingItems(order) {
  return (order.pedido_items || []).some((item) => !isItemDelivered(item));
}

function getUndeliveredItemsState(items) {
  const undelivered = (items || []).filter((item) => !isItemDelivered(item));
  if (undelivered.length === 0) return null;

  let hasPendiente = false;
  let hasPreparacion = false;

  undelivered.forEach((item) => {
    const estado = normalizeItemEstado(item.estado);
    if (estado === 'pendiente') hasPendiente = true;
    else hasPreparacion = true;
  });

  if (hasPendiente && hasPreparacion) return 'mixto';
  if (hasPendiente) return 'pendiente';
  return 'preparacion';
}

function getOrderCardStateClass(order) {
  const state = getUndeliveredItemsState(order.pedido_items);
  if (!state) return '';
  if (state === 'preparacion') return 'order-card--en-preparacion';
  return `order-card--${state}`;
}

function getOrdersBadgeState() {
  const allItems = orders.flatMap((order) => order.pedido_items || []);
  return getUndeliveredItemsState(allItems);
}

function formatSessionLineLabel(session) {
  if (!session) return 'Cuenta';
  if (session.tipo === 'grupal') return 'Cuenta Grupal';
  const code = formatSessionCode(session.numero);
  return code ? `#${code}` : 'Cuenta';
}

function sortMesaSessions(sessions) {
  return [...sessions].sort((a, b) => {
    if (a.tipo === 'grupal' && b.tipo !== 'grupal') return 1;
    if (a.tipo !== 'grupal' && b.tipo === 'grupal') return -1;
    return (a.numero ?? 0) - (b.numero ?? 0);
  });
}

function buildMesaSessionBreakdown(items, sesionById, pagosBySesion = new Map()) {
  const totals = new Map();

  items.forEach((item) => {
    if (!item.sesionId) return;
    totals.set(item.sesionId, (totals.get(item.sesionId) || 0) + item.subtotal);
  });

  return sortMesaSessions(
    [...totals.entries()].map(([sesionId, total]) => {
      const meta = sesionById.get(sesionId);
      return {
        id: sesionId,
        sesionId,
        label: formatSessionLineLabel(meta),
        total,
        numero: meta?.numero ?? null,
        tipo: meta?.tipo ?? 'individual',
        pago_pendiente_confirmacion: meta?.pago_pendiente_confirmacion === true,
        pago_en_proceso: meta?.pago_en_proceso === true,
        paidTotal: pagosBySesion.get(sesionId) || 0,
      };
    })
  );
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

function updateHeaderCount() {
  const el = document.getElementById('headerCount');
  if (activePanel === 'mesas') {
    const waiterCalls = mesas.filter((m) => m.mesero_requerido).length;
    el.textContent = `${mesas.length} mesas${waiterCalls ? ` · ${waiterCalls} llamando` : ''}`;
  } else if (activePanel === 'menu') {
    const available = typeof menuProducts !== 'undefined'
      ? menuProducts.filter((p) => p.disponible !== false).length
      : 0;
    const total = typeof menuProducts !== 'undefined' ? menuProducts.length : 0;
    el.textContent = `${total} producto${total !== 1 ? 's' : ''} · ${available} disponible${available !== 1 ? 's' : ''}`;
  } else if (activePanel === 'qr') {
    el.textContent = `${mesas.length} QR${mesas.length !== 1 ? 's' : ''} de mesa`;
  } else if (activePanel === 'ajustes') {
    el.textContent = 'Ajustes del restaurante';
  } else if (activePanel === 'historial') {
    el.textContent = 'Historial de pagos';
  } else if (activePanel === 'resumen') {
    el.textContent = 'Resumen del día';
  } else {
    el.textContent = `${orders.length} pedido${orders.length !== 1 ? 's' : ''}`;
  }
}

/* ── Tabs ── */
async function refreshActivePanelData(panelId) {
  try {
    if (panelId === 'pedidos') {
      await fetchOrders();
    } else if (panelId === 'mesas') {
      await fetchMesas();
    } else if (panelId === 'menu' && typeof fetchMenuProducts === 'function') {
      await fetchMenuProducts();
    } else if (panelId === 'resumen' && typeof fetchDailySummary === 'function') {
      await fetchDailySummary(true);
    } else if (panelId === 'historial' && typeof fetchPaymentHistory === 'function') {
      await fetchPaymentHistory(true);
    } else if (panelId === 'qr') {
      await fetchMesas();
      renderMesaQrs();
    } else if (panelId === 'ajustes' && typeof loadRestaurantSettings === 'function') {
      await loadRestaurantSettings();
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudieron actualizar los datos del panel.', 'error');
  }
}

function switchPanel(panelId) {
  const allowed = getAllowedPanelTabs(window.PANEL_ACCESS_ROLE || 'mesero');
  if (!allowed.has(panelId)) panelId = 'pedidos';
  if (!VALID_PANEL_TABS.has(panelId)) return;

  activePanel = panelId;
  saveActivePanelTab(panelId);

  document.querySelectorAll('.panel-tabs__btn').forEach((btn) => {
    const isActive = btn.dataset.panel === panelId;
    btn.classList.toggle('panel-tabs__btn--active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });

  document.querySelectorAll('.panel-view').forEach((view) => {
    const isActive = view.id === `view${panelId.charAt(0).toUpperCase()}${panelId.slice(1)}`;
    view.classList.toggle('panel-view--active', isActive);
    view.hidden = !isActive;
  });

  updateHeaderCount();
  void refreshActivePanelData(panelId);
}

function buildMesaMenuUrl(mesaNumero) {
  const slug = RESTAURANTE_SLUG || '';
  const mesa = encodeURIComponent(String(mesaNumero));
  return `${LISTOAPP_BASE_URL}/${encodeURIComponent(slug)}?mesa=${mesa}`;
}

function normalizeMesaName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function mesaQrDomKey(numero) {
  return String(numero).replace(/\s+/g, '-');
}

function compareMesaNumeros(a, b) {
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}

function createMesaQrCode(container, url, size = 180) {
  if (!container || typeof QRCode === 'undefined') return false;
  container.innerHTML = '';
  new QRCode(container, {
    text: url,
    width: size,
    height: size,
    colorDark: '#18181b',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
  return true;
}

function getQrImageDataUrl(container) {
  if (!container) return null;
  const canvas = container.querySelector('canvas');
  if (canvas) return canvas.toDataURL('image/png');
  const img = container.querySelector('img');
  return img?.src || null;
}

function downloadMesaQr(mesaNumero) {
  const item = document.querySelector(`[data-mesa-qr="${CSS.escape(String(mesaNumero))}"]`);
  const canvasWrap = item?.querySelector('.mesa-qr-accordion__canvas');
  const dataUrl = getQrImageDataUrl(canvasWrap);

  if (!dataUrl) {
    showToast('No se pudo generar la imagen del QR.', 'error');
    return;
  }

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `mesa-${mesaNumero}-qr.png`;
  link.click();
}

function toggleMesaQrAccordion(mesaRef) {
  const target = mesas.find((mesa) => String(mesa.numero) === String(mesaRef));
  if (!target) return;

  openMesaQrNumero = openMesaQrNumero === target.numero ? null : target.numero;
  renderMesaQrs();
}

function renderOpenMesaQrCode() {
  if (openMesaQrNumero == null || openMesaQrNumero === '') return;
  const container = document.getElementById(`mesaQrCanvas-${mesaQrDomKey(openMesaQrNumero)}`);
  createMesaQrCode(container, buildMesaMenuUrl(openMesaQrNumero));
}

async function addMesaFromQrTab(rawName) {
  const nombre = normalizeMesaName(rawName);
  if (!nombre) {
    throw new Error('Ingresá un nombre para la mesa.');
  }

  if (nombre.length > 40) {
    throw new Error('El nombre no puede superar 40 caracteres.');
  }

  const exists = mesas.some(
    (mesa) => String(mesa.numero).toLowerCase() === nombre.toLowerCase()
  );
  if (exists) {
    throw new Error(`Ya existe la mesa «${nombre}».`);
  }

  const { data, error } = await supabaseClient
    .from('mesas')
    .insert({
      restaurante_id: RESTAURANTE_ID,
      numero: nombre,
      estado: 'libre',
      mesero_requerido: false,
    })
    .select('id, numero, estado, mesero_requerido')
    .single();

  if (error) throw error;

  mesas.push(data);
  mesas.sort((a, b) => compareMesaNumeros(a.numero, b.numero));
  mesaQrAddOpen = false;
  openMesaQrNumero = data.numero;
  renderMesas();
  renderMesaQrs();
  showToast(`Mesa «${nombre}» creada`, 'success');
  return data;
}

function printAllMesaQrs() {
  if (!mesas.length) {
    showToast('No hay mesas para imprimir.', 'error');
    return;
  }

  if (typeof QRCode === 'undefined') {
    showToast('No se pudo cargar el generador de QR.', 'error');
    return;
  }

  const printArea = document.getElementById('mesaQrPrintArea');
  const printGrid = document.getElementById('mesaQrPrintGrid');
  if (!printArea || !printGrid) return;

  printGrid.innerHTML = mesas
    .map(
      (mesa) => `
        <div class="mesa-qr-print__item">
          <div class="mesa-qr-print__canvas" data-print-qr="${mesa.numero}"></div>
          <p class="mesa-qr-print__label">Mesa ${mesa.numero}</p>
        </div>
      `
    )
    .join('');

  mesas.forEach((mesa) => {
    const container = printGrid.querySelector(`[data-print-qr="${mesa.numero}"]`);
    createMesaQrCode(container, buildMesaMenuUrl(mesa.numero), 220);
  });

  printArea.hidden = false;
  document.body.classList.add('mesa-qr-printing');

  const cleanup = () => {
    document.body.classList.remove('mesa-qr-printing');
    printArea.hidden = true;
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
  requestAnimationFrame(() => window.print());
}

function renderMesaQrs() {
  const list = document.getElementById('mesaQrList');
  const addBtn = document.getElementById('mesaQrAddBtn');
  const addForm = document.getElementById('mesaQrAddForm');
  if (!list) return;

  if (addBtn) addBtn.hidden = mesaQrAddOpen;
  if (addForm) addForm.hidden = !mesaQrAddOpen;

  if (typeof QRCode === 'undefined') {
    list.innerHTML = '<p class="panel-empty__text">No se pudo cargar QRCode.js.</p>';
    return;
  }

  if (!RESTAURANTE_SLUG) {
    list.innerHTML = '<p class="panel-empty__text">No se pudo identificar el restaurante.</p>';
    return;
  }

  if (!mesas.length) {
    list.innerHTML = '<p class="mesa-qr-list__empty">Todavía no hay mesas. Agregá la primera abajo.</p>';
    return;
  }

  if (openMesaQrNumero && !mesas.some((mesa) => mesa.numero === openMesaQrNumero)) {
    openMesaQrNumero = null;
  }

  list.innerHTML = mesas
    .map((mesa) => {
      const isOpen = openMesaQrNumero === mesa.numero;
      const domKey = mesaQrDomKey(mesa.numero);
      const mesaLabel = escapeHtml(String(mesa.numero));
      return `
        <article class="mesa-qr-accordion__item${isOpen ? ' mesa-qr-accordion__item--open' : ''}" data-mesa-qr="${mesaLabel}">
          <button
            type="button"
            class="mesa-qr-accordion__trigger"
            data-toggle-qr="${mesaLabel}"
            aria-expanded="${isOpen}"
          >
            <span class="mesa-qr-accordion__arrow" aria-hidden="true">${isOpen ? '▼' : '▶'}</span>
            Mesa ${mesaLabel}
          </button>
          <div class="mesa-qr-accordion__panel"${isOpen ? '' : ' hidden'}>
            <div class="mesa-qr-accordion__canvas" id="mesaQrCanvas-${domKey}"></div>
            <button type="button" class="mesa-qr-accordion__download" data-download-qr="${mesaLabel}">
              Descargar
            </button>
          </div>
        </article>
      `;
    })
    .join('');

  renderOpenMesaQrCode();
}

function setMesaQrAddFormOpen(open) {
  mesaQrAddOpen = open;
  const addBtn = document.getElementById('mesaQrAddBtn');
  const addForm = document.getElementById('mesaQrAddForm');
  const input = document.getElementById('mesaQrAddInput');

  if (addBtn) addBtn.hidden = open;
  if (addForm) addForm.hidden = !open;

  if (open) {
    if (input) {
      input.value = '';
      input.focus();
    }
  }
}

function initMesaQrSection() {
  const list = document.getElementById('mesaQrList');
  if (list && !list.dataset.bound) {
    list.dataset.bound = 'true';
    list.addEventListener('click', (event) => {
      const toggleBtn = event.target.closest('[data-toggle-qr]');
      if (toggleBtn) {
        toggleMesaQrAccordion(toggleBtn.dataset.toggleQr);
        return;
      }

      const downloadBtn = event.target.closest('[data-download-qr]');
      if (downloadBtn) {
        event.stopPropagation();
        downloadMesaQr(downloadBtn.dataset.downloadQr);
      }
    });
  }

  document.getElementById('printAllQrBtn')?.addEventListener('click', printAllMesaQrs);

  document.getElementById('mesaQrAddBtn')?.addEventListener('click', () => {
    setMesaQrAddFormOpen(true);
  });

  document.getElementById('mesaQrAddCancel')?.addEventListener('click', () => {
    setMesaQrAddFormOpen(false);
  });

  const addForm = document.getElementById('mesaQrAddForm');
  addForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('mesaQrAddInput');
    const submitBtn = document.getElementById('mesaQrAddSubmit');
    const numero = input?.value;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando…';

    try {
      await addMesaFromQrTab(numero);
      setMesaQrAddFormOpen(false);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'No se pudo crear la mesa.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirmar';
    }
  });
}

function initTabs() {
  document.querySelectorAll('.panel-tabs__btn').forEach((btn) => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
  });
}

/* ── Pedidos ── */
async function fetchOrders() {
  const previousCount = orders.length;
  const previousOrderIds = new Set(orders.map((order) => order.id));

  const { data, error } = await supabaseClient
    .from('pedidos')
    .select(`
      id,
      estado,
      total,
      created_at,
      archivado,
      sesion_id,
      mesas ( numero ),
      pedido_items (
        id,
        cantidad,
        estado,
        confirmado_por_mesero,
        productos ( nombre )
      )
    `)
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('archivado', false)
    .in('estado', PEDIDO_ESTADOS_ACTIVOS)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const rowsWithSessions = await attachSessionDataToOrders(data);
  orders = rowsWithSessions.filter(orderHasPendingItems);

  if (panelAlertsInitialized) {
    handleNewOrdersDetected(previousCount, previousOrderIds);
  }

  renderOrders();
  updateHeaderCount();
  updatePedidosTabBadge();
}

function renderOrders() {
  const list = document.getElementById('ordersList');
  const empty = document.getElementById('emptyState');

  empty.hidden = orders.length > 0;

  if (orders.length === 0) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = orders
    .map((order) => {
      const mesaLabel = formatOrderMesaLabel(order);
      const items = (order.pedido_items || []).slice().sort((a, b) => {
        const rank = (item) => {
          if (isItemDelivered(item)) return 3;
          const e = normalizeItemEstado(item.estado);
          return { pendiente: 0, en_preparacion: 1, listo: 2 }[e] ?? 0;
        };
        return rank(a) - rank(b);
      });

      const pendingCount = (order.pedido_items || []).filter(
        (item) => !isItemDelivered(item) && normalizeItemEstado(item.estado) === 'pendiente'
      ).length;

      const undeliveredCount = (order.pedido_items || []).filter((item) => !isItemDelivered(item)).length;

      const bulkButtons = [];

      if (pendingCount > 0) {
        bulkButtons.push(`<button
          type="button"
          class="order-card__bulk-btn order-card__bulk-btn--prep"
          data-action="todo-preparacion"
          data-pedido-id="${order.id}"
          ${updating.has(`bulk-prep-${order.id}`) ? 'disabled' : ''}
        >Todo en preparación</button>`);
      }

      if (undeliveredCount > 0 && pendingCount === 0) {
        bulkButtons.push(`<button
          type="button"
          class="order-card__bulk-btn order-card__bulk-btn--ready"
          data-action="todo-entregado"
          data-pedido-id="${order.id}"
          ${updating.has(`bulk-del-${order.id}`) ? 'disabled' : ''}
        >Todo entregado</button>`);
      }

      const bulkBtnHtml = bulkButtons.length
        ? `<div class="order-card__actions">${bulkButtons.join('')}</div>`
        : '';

      const itemsHtml = items
        .map(
          (item) => `
            <li class="item-row${isItemDelivered(item) ? ' item-row--done' : ''}">
              <span class="item-row__name">${escapeHtml(item.productos?.nombre || 'Producto')}</span>
              <span class="item-row__qty">×${item.cantidad}</span>
              <div class="item-row__actions">
                ${renderItemBadge(item)}
                ${renderItemButton(item, order.id)}
              </div>
            </li>
          `
        )
        .join('');

      const cardStateClass = getOrderCardStateClass(order);

      return `
        <article class="order-card ${cardStateClass}" data-pedido-id="${order.id}">
          <header class="order-card__head">
            <span class="order-card__mesa">${escapeHtml(mesaLabel)}</span>
            <div class="order-card__head-right">
              <span class="order-card__time">${formatTime(order.created_at)}</span>
              <span class="order-card__status order-card__status--${order.estado}">${formatPedidoEstado(order.estado)}</span>
            </div>
          </header>
          ${bulkBtnHtml}
          <ul class="order-card__items">${itemsHtml}</ul>
        </article>
      `;
    })
    .join('');
}

function renderItemButton(item, orderId) {
  if (isItemDelivered(item)) return '';

  const estado = normalizeItemEstado(item.estado);
  const isUpdating = updating.has(item.id);

  if (estado === 'pendiente') {
    return `<button
      type="button"
      class="item-row__btn item-row__btn--prep"
      data-action="preparacion"
      data-item-id="${item.id}"
      data-pedido-id="${orderId}"
      ${isUpdating ? 'disabled' : ''}
    >En prep.</button>`;
  }

  if (estado === 'en_preparacion') {
    return `<button
      type="button"
      class="item-row__btn item-row__btn--ready"
      data-action="entregado"
      data-item-id="${item.id}"
      data-pedido-id="${orderId}"
      ${isUpdating ? 'disabled' : ''}
    >Entregado</button>`;
  }

  return '';
}

function renderItemBadge(item) {
  if (isItemDelivered(item)) {
    return '<span class="item-row__badge item-row__badge--listo">Entregado</span>';
  }

  const estado = normalizeItemEstado(item.estado);
  const labels = {
    pendiente: 'Pend.',
    en_preparacion: 'En prep.',
    listo: 'Listo',
  };

  return `<span class="item-row__badge item-row__badge--${estado}">${labels[estado] || estado}</span>`;
}

function bindListActions() {
  if (listClickBound) return;

  document.getElementById('ordersList').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn || btn.disabled) return;

    const { action, itemId, pedidoId } = btn.dataset;
    if (action === 'preparacion') markItemEnPreparacion(itemId, pedidoId);
    else if (action === 'entregado') markItemEntregado(itemId, pedidoId);
    else if (action === 'todo-preparacion') markAllEnPreparacion(pedidoId);
    else if (action === 'todo-entregado') markAllEntregado(pedidoId);
  });

  listClickBound = true;
}

/* ── Mesas ── */
async function fetchAllRestaurantMesas() {
  const pageSize = 100;
  let from = 0;
  const allMesas = [];

  while (true) {
    const { data, error } = await supabaseClient
      .from('mesas')
      .select('id, numero, estado, mesero_requerido')
      .eq('restaurante_id', RESTAURANTE_ID)
      .order('numero', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = data || [];
    allMesas.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return allMesas.sort((a, b) => compareMesaNumeros(a.numero, b.numero));
}

async function fetchMesas(options = {}) {
  const { skipRender = false } = options;
  const previousOccupiedCount = countOccupiedMesas(mesas);
  const previousWaiterMesaIds = new Set(
    mesas.filter((mesa) => mesa.mesero_requerido).map((mesa) => mesa.id)
  );
  const previousPaymentSnapshot = snapshotSessionPaymentFlags();

  const [mesasData, itemsResult] = await Promise.all([
    fetchAllRestaurantMesas(),
    supabaseClient.rpc('get_mesa_items', { p_restaurante_id: RESTAURANTE_ID }),
  ]);

  const { data: itemsData, error: itemsError } = itemsResult;
  if (itemsError) throw itemsError;

  mesas = mesasData;
  mesaAccounts = {};
  mesaSessionBreakdown = {};
  mesaSessionItems = {};

  const sesionIdsFromItems = [...new Set((itemsData || []).map((item) => item.sesion_id).filter(Boolean))];
  let sesionById = new Map();
  let pagosBySesion = new Map();

  const mesaIds = mesas.map((mesa) => mesa.id);
  let activeSesiones = [];

  if (mesaIds.length > 0) {
    const { data: activeSesionesData, error: activeSesionesError } = await supabaseClient
      .from('sesiones')
      .select('id, numero, tipo, mesa_id, pago_pendiente_confirmacion, pago_en_proceso')
      .eq('restaurante_id', RESTAURANTE_ID)
      .eq('activa', true)
      .in('mesa_id', mesaIds);

    if (activeSesionesError) throw activeSesionesError;
    activeSesiones = activeSesionesData || [];
  }

  const allSesionIds = [
    ...new Set([...sesionIdsFromItems, ...activeSesiones.map((sesion) => sesion.id)]),
  ];

  if (allSesionIds.length > 0) {
    const [{ data: sesionesData, error: sesionesError }, { data: pagosData, error: pagosError }] =
      await Promise.all([
        supabaseClient
          .from('sesiones')
          .select('id, numero, tipo, pago_pendiente_confirmacion, pago_en_proceso')
          .in('id', allSesionIds),
        supabaseClient
          .from('pagos_grupo')
          .select('sesion_id, monto')
          .in('sesion_id', allSesionIds)
          .eq('estado', 'aprobado'),
      ]);

    if (sesionesError) throw sesionesError;
    if (pagosError) throw pagosError;

    sesionById = new Map((sesionesData || []).map((sesion) => [sesion.id, sesion]));

    (pagosData || []).forEach((pago) => {
      pagosBySesion.set(
        pago.sesion_id,
        (pagosBySesion.get(pago.sesion_id) || 0) + Number(pago.monto)
      );
    });

    activeSesiones.forEach((sesion) => {
      sesionById.set(sesion.id, { ...sesionById.get(sesion.id), ...sesion });
    });
  }

  (itemsData || []).forEach((item) => {
    const mesaId = item.mesa_id;
    if (!mesaId) return;
    if (!mesaAccounts[mesaId]) mesaAccounts[mesaId] = [];
    if (!mesaSessionItems[mesaId]) mesaSessionItems[mesaId] = {};

    const entry = {
      sesionId: item.sesion_id,
      productoId: item.producto_id,
      name: item.producto_nombre || 'Producto',
      qty: item.cantidad,
      subtotal: Number(item.subtotal ?? item.precio_unitario * item.cantidad),
    };

    mesaAccounts[mesaId].push(entry);

    if (item.sesion_id) {
      if (!mesaSessionItems[mesaId][item.sesion_id]) mesaSessionItems[mesaId][item.sesion_id] = [];
      mesaSessionItems[mesaId][item.sesion_id].push(entry);
    }
  });

  mesas.forEach((mesa) => {
    if (!mesaSessionItems[mesa.id]) mesaSessionItems[mesa.id] = {};

    const breakdown = buildMesaSessionBreakdown(mesaAccounts[mesa.id] || [], sesionById, pagosBySesion);
    const byId = new Map(breakdown.map((session) => [session.id, session]));

    activeSesiones
      .filter((sesion) => sesion.mesa_id === mesa.id)
      .forEach((sesion) => {
        const existing = byId.get(sesion.id);
        if (existing) {
          existing.pago_pendiente_confirmacion = sesion.pago_pendiente_confirmacion === true;
          existing.pago_en_proceso = sesion.pago_en_proceso === true;
          existing.paidTotal = pagosBySesion.get(sesion.id) || existing.paidTotal || 0;
          return;
        }

        byId.set(sesion.id, {
          id: sesion.id,
          sesionId: sesion.id,
          label: formatSessionLineLabel(sesion),
          total: 0,
          numero: sesion.numero,
          tipo: sesion.tipo || 'individual',
          pago_pendiente_confirmacion: sesion.pago_pendiente_confirmacion === true,
          pago_en_proceso: sesion.pago_en_proceso === true,
          paidTotal: pagosBySesion.get(sesion.id) || 0,
        });
      });

    mesaSessionBreakdown[mesa.id] = sortMesaSessions([...byId.values()]);
  });

  if (panelAlertsInitialized) {
    const newOccupiedCount = countOccupiedMesas(mesas);
    if (previousOccupiedCount === 0 && newOccupiedCount > 0) {
      playMesaOpeningSound();
    }

    handleWaiterCallsDetected(previousWaiterMesaIds);
    detectPaymentStartFromSnapshot(previousPaymentSnapshot);
  }

  if (!skipRender) {
    renderMesas();
    if (activePanel === 'qr') renderMesaQrs();
    updateHeaderCount();
  }

  updateMesasTabBadge();
}

async function refreshPanelData() {
  await Promise.all([fetchOrders(), fetchMesas()]);
}

function scheduleRealtimeRefresh() {
  clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = setTimeout(() => {
    refreshPanelData().catch((error) => {
      console.error('Error refrescando panel (realtime):', error);
    });

    if (menuSaving || menuReloading) return;

    if (typeof reloadMenuProducts === 'function') {
      reloadMenuProducts().catch((error) => {
        console.error('Error refrescando menú (realtime):', error);
      });
    }

    if (activePanel === 'resumen' && typeof fetchDailySummary === 'function') {
      fetchDailySummary(true).catch((error) => {
        console.error('Error refrescando resumen (realtime):', error);
      });
    }

    const splitPaymentModal = document.getElementById('splitPaymentModal');
    if (splitPaymentModal && !splitPaymentModal.hidden && splitPaymentState.sesionId) {
      refreshSplitPaymentModal().catch((error) => {
        console.error('Error refrescando dividir pago (realtime):', error);
      });
    }
  }, 250);
}

function resolveMesaNumeroFromId(mesaId) {
  const mesa = mesas.find((entry) => entry.id === mesaId);
  return mesa?.numero ?? '?';
}

function handleSesionWompiPaymentClosed(payload) {
  const oldRow = payload.old;
  const newRow = payload.new;

  if (!newRow) return false;

  const pendingNow = newRow.pago_pendiente_confirmacion === true;
  const pendingBefore = oldRow?.pago_pendiente_confirmacion === true;

  if (!pendingNow || pendingBefore) return false;

  const referencia = newRow.referencia_wompi;
  if (referencia && String(referencia).startsWith('qr-propio')) return false;

  const mesaNum = resolveMesaNumeroFromId(newRow.mesa_id);
  const code = formatSessionCode(newRow.numero);
  showToast(`✅ Pago recibido — Mesa ${mesaNum} Cuenta #${code}`, 'success');
  return true;
}

function onSesionesRealtimeUpdate(payload) {
  const next = payload?.new;
  const prev = payload?.old;

  if (
    panelAlertsInitialized &&
    next?.pago_en_proceso === true &&
    prev?.pago_en_proceso !== true &&
    next?.pago_pendiente_confirmacion !== true
  ) {
    playPaymentStartSound();
    applySessionPaymentFlags(next);
    if (activePanel === 'mesas') {
      renderMesas();
    }
  }

  handleSesionWompiPaymentClosed(payload);
  scheduleRealtimeRefresh();
}

function renderMesas() {
  const list = document.getElementById('mesasList');

  if (mesas.length === 0) {
    list.innerHTML = '<p class="panel-empty__text">No hay mesas registradas.</p>';
    return;
  }

  for (const mesaId of expandedLibreMesas) {
    const mesa = mesas.find((row) => row.id === mesaId);
    if (!mesa || (mesa.estado || 'libre') !== 'libre') {
      expandedLibreMesas.delete(mesaId);
    }
  }

  list.innerHTML = mesas
    .map((mesa) => {
      const accountItems = mesaAccounts[mesa.id] || [];
      const sessions = mesaSessionBreakdown[mesa.id] || [];
      const grouped = groupDeliveredItems(accountItems);
      const total = sessions.length
        ? sessions.reduce((sum, session) => sum + session.total, 0)
        : grouped.reduce((sum, g) => sum + g.subtotal, 0);
      const estado = mesa.estado || 'libre';
      const isLibre = estado === 'libre';
      const isExpanded = isLibre && expandedLibreMesas.has(mesa.id);
      const isMesaPaying = sessions.some(
        (session) => session.pago_en_proceso === true && session.pago_pendiente_confirmacion !== true
      );
      const sessionsHtml =
        sessions.length === 0
          ? '<p class="mesa-card__sessions-empty">Sin cuentas activas</p>'
          : `<ul class="mesa-card__session-lines">${sessions
              .map((session) => {
                const paidTotal = session.paidTotal || 0;
                const sessionTotal = session.total || 0;
                const isComplete = session.pago_pendiente_confirmacion === true;
                const isPaying = session.pago_en_proceso === true && !isComplete;

                let paymentInfo = '';
                if (isComplete) {
                  paymentInfo = `<div class="mesa-card__payment-alert">
                      <span class="mesa-card__payment-badge mesa-card__payment-badge--complete">✅ Pago recibido</span>
                      <button type="button" class="mesa-card__payment-btn" data-action="confirmar-pago" data-sesion-id="${session.id}" data-mesa-id="${mesa.id}" data-mesa-num="${mesa.numero}">Cerrar mesa</button>
                    </div>`;
                } else if (isPaying) {
                  paymentInfo = `<span class="mesa-card__payment-badge mesa-card__payment-badge--paying mesa-card__payment-badge--pulse">💳 Pagando...</span>`;
                } else if (
                  paidTotal > 0 &&
                  sessionTotal > 0 &&
                  paidTotal < sessionTotal
                ) {
                  paymentInfo = `<p class="mesa-card__payment-progress">💳 ${formatCOP(paidTotal)} / ${formatCOP(sessionTotal)} pagados</p>`;
                }

                return `
                  <li class="mesa-card__session-block${isComplete || isPaying ? ' mesa-card__session-block--payment' : ''}">
                    <div class="mesa-card__session-line">
                      <span class="mesa-card__session-label">${escapeHtml(session.label)}</span>
                      <span class="mesa-card__session-amount">${formatCOP(session.total)}</span>
                    </div>
                    ${paymentInfo}
                  </li>
                `;
              })
              .join('')}</ul>`;
      const waiterAlert = mesa.mesero_requerido
        ? `<div class="mesa-card__alert">
            <span class="mesa-card__alert-icon" aria-hidden="true">🔔</span>
            Mesero requerido
            <button type="button" class="mesa-card__alert-btn" data-action="atender-mesero" data-mesa-id="${mesa.id}">Atendido</button>
          </div>`
        : '';

      const cardClasses = [
        'mesa-card',
        mesa.mesero_requerido ? 'mesa-card--calling' : '',
        isLibre ? 'mesa-card--libre' : 'mesa-card--ocupada',
        isExpanded ? 'mesa-card--expanded' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const headToggleAttrs = isLibre
        ? ` data-action="toggle-libre-mesa" data-mesa-id="${mesa.id}" role="button" tabindex="0" aria-expanded="${isExpanded ? 'true' : 'false'}" aria-label="Mesa ${mesa.numero}, ${formatMesaEstado(estado)}"`
        : '';

      return `
        <article class="${cardClasses}" data-mesa-id="${mesa.id}">
          <header class="mesa-card__head"${headToggleAttrs}>
            <span class="mesa-card__num">Mesa ${mesa.numero}</span>
            <div class="mesa-card__head-badges">
              ${isMesaPaying ? '<span class="mesa-card__paying-badge mesa-card__paying-badge--pulse">💳 Pagando...</span>' : ''}
              <span class="mesa-card__status mesa-card__status--${estado}">${formatMesaEstado(estado)}</span>
            </div>
          </header>
          <div class="mesa-card__details">
            ${waiterAlert}
            <div class="mesa-card__body">${sessionsHtml}</div>
            <div class="mesa-card__total">
              <span class="mesa-card__total-label">Total acumulado</span>
              <strong class="mesa-card__total-amount">${formatCOP(total)}</strong>
            </div>
            <div class="mesa-card__actions">
              <button type="button" class="mesa-card__btn mesa-card__btn--new" data-action="nueva-orden" data-mesa-id="${mesa.id}" data-mesa-num="${mesa.numero}">Nueva orden</button>
              <button type="button" class="mesa-card__btn mesa-card__btn--view" data-action="ver-cuenta" data-mesa-id="${mesa.id}" data-mesa-num="${mesa.numero}" ${sessions.length === 0 ? 'disabled' : ''}>Ver cuenta</button>
              <button type="button" class="mesa-card__btn mesa-card__btn--split" data-action="dividir-pago-mesa" data-mesa-id="${mesa.id}" data-mesa-num="${mesa.numero}" ${getChargeableAccountSessions(mesa.id).length === 0 ? 'disabled' : ''}>Dividir pago</button>
              <button type="button" class="mesa-card__btn mesa-card__btn--close" data-action="cerrar-mesa" data-mesa-id="${mesa.id}" data-mesa-num="${mesa.numero}">Cerrar mesa</button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

function toggleLibreMesaExpanded(mesaId) {
  if (expandedLibreMesas.has(mesaId)) {
    expandedLibreMesas.delete(mesaId);
  } else {
    expandedLibreMesas.add(mesaId);
  }
  renderMesas();
}

function bindMesasActions() {
  if (mesasClickBound) return;

  document.getElementById('mesasList').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn || btn.disabled) return;

    const { action, mesaId, mesaNum } = btn.dataset;

    if (action === 'toggle-libre-mesa') {
      toggleLibreMesaExpanded(mesaId);
      return;
    }

    if (action === 'ver-cuenta') openAccountModal(mesaId, mesaNum);
    else if (action === 'dividir-pago-mesa') openSplitPaymentModal(mesaId, mesaNum);
    else if (action === 'nueva-orden') openNewOrderModal(mesaId, mesaNum);
    else if (action === 'cerrar-mesa') closeMesa(mesaId, mesaNum);
    else if (action === 'atender-mesero') markWaiterAttended(mesaId);
    else if (action === 'confirmar-pago') {
      confirmSessionPayment(btn.dataset.sesionId, mesaId, mesaNum, 'Mesa cerrada');
    }
  });

  mesasClickBound = true;
}

function formatAccountSessionHeading(session) {
  if (session.tipo === 'grupal') return 'Cuenta Grupal';
  if (session.numero != null && session.numero !== '') {
    return `#${String(session.numero).padStart(4, '0')}`;
  }
  return session.label || 'Cuenta';
}

function getChargeableAccountSessions(mesaId) {
  return (mesaSessionBreakdown[mesaId] || []).filter((session) => session.total > 0);
}

function getPedidoItemSubtotal(item) {
  return Number(item.subtotal ?? Number(item.precio_unitario) * Number(item.cantidad)) || 0;
}

function canSplitSession(session, items = []) {
  if (!session || session.total <= 0) return false;
  if (session.pago_pendiente_confirmacion || session.pago_en_proceso) return false;

  const grouped = groupDeliveredItems(items);
  const totalQty = grouped.reduce((sum, group) => sum + group.qty, 0);

  return grouped.length >= 2 || totalQty >= 2;
}

function getSplittableSessions(mesaId) {
  const sessions = mesaSessionBreakdown[mesaId] || [];
  const sessionItems = mesaSessionItems[mesaId] || {};

  return sessions.filter((session) => canSplitSession(session, sessionItems[session.sesionId] || []));
}

function renderAccountSessionCard(session, items, mesaId, mesaNum, showSessionActions) {
  const grouped = groupDeliveredItems(items);
  const heading = formatAccountSessionHeading(session);
  const hasTotal = session.total > 0;
  const splittable = canSplitSession(session, items);

  const itemsHtml =
    grouped.length === 0
      ? '<li class="modal__invoice-line modal__invoice-line--nested"><span>Sin productos entregados</span></li>'
      : grouped
          .map(
            (item) => `
              <li class="modal__invoice-line modal__invoice-line--nested">
                <span class="modal__item-qty">×${item.qty}</span>
                <span class="modal__item-name">${escapeHtml(item.name)}</span>
                <span class="modal__item-price">${formatCOP(item.subtotal)}</span>
              </li>
            `
          )
          .join('');

  const sessionActionsHtml = showSessionActions
    ? ''
    : `
      <div class="modal__account-pay-grid modal__account-pay-grid--session">
        <button
          type="button"
          class="modal__pay-btn modal__pay-btn--dataphone"
          data-action="cobrar-dataphone"
          data-sesion-id="${session.id}"
          data-session-label="${escapeHtml(heading)}"
          data-session-total="${session.total}"
          data-mesa-id="${mesaId}"
          data-mesa-num="${mesaNum}"
          ${hasTotal ? '' : 'disabled'}
        >Datáfono</button>
        <button
          type="button"
          class="modal__pay-btn modal__pay-btn--qr"
          data-action="enviar-qr"
          data-sesion-id="${session.id}"
          data-session-label="${escapeHtml(heading)}"
          data-session-total="${session.total}"
          ${hasTotal ? '' : 'disabled'}
        >QR</button>
      </div>
      <button
        type="button"
        class="modal__pay-btn modal__pay-btn--split modal__pay-btn--split-row"
        data-action="dividir-pago"
        data-sesion-id="${session.id}"
        data-session-label="${escapeHtml(heading)}"
        data-session-total="${session.total}"
        data-mesa-id="${mesaId}"
        data-mesa-num="${mesaNum}"
        ${hasTotal ? '' : 'disabled'}
      >Dividir pago</button>
    `;

  return `
    <li class="modal__invoice-group">
      <div class="modal__invoice-group-head modal__invoice-group-head--title">
        <div class="modal__invoice-group-title">
          <strong>${escapeHtml(heading)}</strong>
          ${
            splittable
              ? `<button
                  type="button"
                  class="modal__split-link"
                  data-action="separar-cuenta"
                  data-sesion-id="${session.id}"
                >Separar</button>`
              : ''
          }
        </div>
        <span class="modal__session-amount">${formatCOP(session.total)}</span>
      </div>
      <ul class="modal__invoice-sublist">${itemsHtml}</ul>
      ${sessionActionsHtml}
    </li>
  `;
}

function renderAccountModalFooter(sessions, mesaId, mesaNum, total) {
  const bulkActions = document.getElementById('modalBulkActions');
  const singleActions = document.getElementById('modalSingleActions');
  const countEl = document.getElementById('modalAccountCount');
  const showBulk = sessions.length >= 2 && total > 0;
  const singleSession = sessions.length === 1 ? sessions[0] : null;
  const showSingle = singleSession && singleSession.total > 0;

  if (bulkActions) bulkActions.hidden = !showBulk;
  if (countEl) {
    countEl.hidden = !showBulk;
    countEl.textContent = showBulk ? `${sessions.length} cuentas` : '';
  }

  if (singleActions) {
    if (showSingle) {
      const heading = formatAccountSessionHeading(singleSession);
      singleActions.hidden = false;
      singleActions.innerHTML = `
        <button
          type="button"
          class="modal__pay-btn modal__pay-btn--dataphone"
          data-action="cobrar-dataphone"
          data-sesion-id="${singleSession.id}"
          data-session-label="${escapeHtml(heading)}"
          data-session-total="${singleSession.total}"
          data-mesa-id="${mesaId}"
          data-mesa-num="${mesaNum}"
        >Cobrar con datáfono</button>
        <button
          type="button"
          class="modal__pay-btn modal__pay-btn--qr"
          data-action="enviar-qr"
          data-sesion-id="${singleSession.id}"
          data-session-label="${escapeHtml(heading)}"
          data-session-total="${singleSession.total}"
        >Enviar QR de pago</button>
        <button
          type="button"
          class="modal__pay-btn modal__pay-btn--split modal__pay-btn--split-row"
          data-action="dividir-pago"
          data-sesion-id="${singleSession.id}"
          data-session-label="${escapeHtml(heading)}"
          data-session-total="${singleSession.total}"
          data-mesa-id="${mesaId}"
          data-mesa-num="${mesaNum}"
        >Dividir pago</button>
      `;
    } else {
      singleActions.hidden = true;
      singleActions.innerHTML = '';
    }
  }
}

function openAccountModal(mesaId, mesaNum) {
  const sessions = mesaSessionBreakdown[mesaId] || [];
  const sessionItems = mesaSessionItems[mesaId] || {};
  const chargeableSessions = getChargeableAccountSessions(mesaId);
  const total = sessions.reduce((sum, session) => sum + session.total, 0);
  const showSessionActions = sessions.length === 1;

  accountModalState = {
    mesaId,
    mesaNum,
    allSessions: sessions,
    chargeableSessions,
    combinedTotal: chargeableSessions.reduce((sum, session) => sum + session.total, 0),
  };

  document.getElementById('modalTitle').textContent = `Cuenta · Mesa ${mesaNum}`;
  document.getElementById('modalTotal').textContent = formatCOP(total);

  renderAccountModalFooter(sessions, mesaId, mesaNum, total);

  const splitBtn = document.getElementById('modalSplitAccountBtn');
  if (splitBtn) {
    splitBtn.hidden = getSplittableSessions(mesaId).length === 0;
  }

  const list = document.getElementById('modalInvoice');
  list.innerHTML =
    sessions.length === 0
      ? '<li class="modal__invoice-empty">Sin productos entregados en esta mesa.</li>'
      : sessions
          .map((session) =>
            renderAccountSessionCard(
              session,
              sessionItems[session.sesionId] || [],
              mesaId,
              mesaNum,
              showSessionActions
            )
          )
          .join('');

  const modal = document.getElementById('accountModal');
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

function closeAccountModal() {
  const modal = document.getElementById('accountModal');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  accountModalState = null;
}

let splitAccountState = {
  mesaId: null,
  mesaNum: null,
  sesionId: null,
  items: [],
  selected: new Set(),
  submitting: false,
};

async function fetchDeliveredPedidoItems(mesaId, sesionId) {
  const { data, error } = await supabaseClient
    .from('pedido_items')
    .select(`
      id,
      cantidad,
      precio_unitario,
      subtotal,
      estado,
      confirmado_por_mesero,
      producto_id,
      pedido_id,
      productos ( nombre ),
      pedidos!inner ( id, mesa_id, sesion_id, estado, archivado, restaurante_id )
    `)
    .eq('pedidos.mesa_id', mesaId)
    .eq('pedidos.sesion_id', sesionId)
    .eq('pedidos.restaurante_id', RESTAURANTE_ID)
    .eq('pedidos.archivado', false)
    .eq('confirmado_por_mesero', true)
    .order('id', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function recalculatePedidoTotal(pedidoId) {
  const { data: items, error } = await supabaseClient
    .from('pedido_items')
    .select('subtotal, precio_unitario, cantidad')
    .eq('pedido_id', pedidoId);

  if (error) throw error;

  const total = (items || []).reduce((sum, item) => sum + getPedidoItemSubtotal(item), 0);
  const { error: updateError } = await supabaseClient.from('pedidos').update({ total }).eq('id', pedidoId);

  if (updateError) throw updateError;
}

async function movePedidoItemsToNewSession(mesaId, pedidoItemIds) {
  const newSession = await createPanelIndividualSession(mesaId);

  const { data: items, error } = await supabaseClient
    .from('pedido_items')
    .select('id, pedido_id, cantidad, precio_unitario, subtotal, estado, confirmado_por_mesero, producto_id')
    .in('id', pedidoItemIds);

  if (error) throw error;
  if (!items?.length) throw new Error('No hay productos seleccionados.');

  const byPedido = new Map();
  items.forEach((item) => {
    if (!byPedido.has(item.pedido_id)) byPedido.set(item.pedido_id, []);
    byPedido.get(item.pedido_id).push(item);
  });

  const pedidosToSync = new Set();

  for (const [pedidoId, movingItems] of byPedido.entries()) {
    const { data: pedidoItems, error: pedidoItemsError } = await supabaseClient
      .from('pedido_items')
      .select('id')
      .eq('pedido_id', pedidoId);

    if (pedidoItemsError) throw pedidoItemsError;

    if (pedidoItems.length === movingItems.length) {
      const { error: movePedidoError } = await supabaseClient
        .from('pedidos')
        .update({ sesion_id: newSession.id })
        .eq('id', pedidoId);

      if (movePedidoError) throw movePedidoError;
      pedidosToSync.add(pedidoId);
      continue;
    }

    const { data: sourcePedido, error: sourcePedidoError } = await supabaseClient
      .from('pedidos')
      .select('estado, mesa_id, restaurante_id, archivado')
      .eq('id', pedidoId)
      .single();

    if (sourcePedidoError) throw sourcePedidoError;

    const movedTotal = movingItems.reduce((sum, item) => sum + getPedidoItemSubtotal(item), 0);

    const { data: newPedido, error: newPedidoError } = await supabaseClient
      .from('pedidos')
      .insert({
        mesa_id: sourcePedido.mesa_id,
        sesion_id: newSession.id,
        restaurante_id: sourcePedido.restaurante_id,
        estado: sourcePedido.estado || 'pendiente',
        total: movedTotal,
        archivado: false,
      })
      .select('id')
      .single();

    if (newPedidoError) throw newPedidoError;

    const { error: updateItemsError } = await supabaseClient
      .from('pedido_items')
      .update({ pedido_id: newPedido.id })
      .in(
        'id',
        movingItems.map((item) => item.id)
      );

    if (updateItemsError) throw updateItemsError;

    await recalculatePedidoTotal(pedidoId);
    pedidosToSync.add(pedidoId);
    pedidosToSync.add(newPedido.id);
  }

  for (const pedidoId of pedidosToSync) {
    await syncPedidoEstado(pedidoId);
  }

  await supabaseClient.from('mesas').update({ estado: 'ocupada' }).eq('id', mesaId);

  return newSession;
}

function updateSplitAccountSummary() {
  const summaryEl = document.getElementById('splitAccountSummary');
  const confirmBtn = document.getElementById('splitAccountConfirmBtn');
  if (!summaryEl || !confirmBtn) return;

  const selectedItems = splitAccountState.items.filter((item) => splitAccountState.selected.has(item.id));
  const selectedTotal = selectedItems.reduce((sum, item) => sum + getPedidoItemSubtotal(item), 0);
  const totalItems = splitAccountState.items.length;

  summaryEl.textContent = `${selectedItems.length} producto${selectedItems.length !== 1 ? 's' : ''} · ${formatCOP(selectedTotal)}`;

  const validSelection =
    selectedItems.length > 0 && selectedItems.length < totalItems && !splitAccountState.submitting;

  confirmBtn.disabled = !validSelection;
}

function renderSplitAccountList() {
  const list = document.getElementById('splitAccountList');
  if (!list) return;

  if (splitAccountState.items.length === 0) {
    list.innerHTML = '<p class="split-account__empty">No hay productos entregados en esta cuenta.</p>';
    updateSplitAccountSummary();
    return;
  }

  list.innerHTML = splitAccountState.items
    .map((item) => {
      const name = item.productos?.nombre || 'Producto';
      const subtotal = getPedidoItemSubtotal(item);
      const checked = splitAccountState.selected.has(item.id) ? 'checked' : '';

      return `
        <label class="split-account__item">
          <input type="checkbox" value="${item.id}" ${checked}>
          <span>
            <span class="split-account__item-name">×${item.cantidad} ${escapeHtml(name)}</span>
            <span class="split-account__item-meta">Producto entregado</span>
          </span>
          <span class="split-account__item-price">${formatCOP(subtotal)}</span>
        </label>
      `;
    })
    .join('');

  list.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) splitAccountState.selected.add(input.value);
      else splitAccountState.selected.delete(input.value);
      updateSplitAccountSummary();
    });
  });

  updateSplitAccountSummary();
}

function populateSplitAccountSessionSelect(mesaId, preferredSesionId = null) {
  const field = document.getElementById('splitAccountSessionField');
  const select = document.getElementById('splitAccountSessionSelect');
  if (!field || !select) return;

  const splittable = getSplittableSessions(mesaId);
  field.hidden = splittable.length <= 1;

  select.innerHTML = splittable
    .map((session) => {
      const heading = formatAccountSessionHeading(session);
      return `<option value="${session.id}">${escapeHtml(heading)} · ${formatCOP(session.total)}</option>`;
    })
    .join('');

  const defaultSession =
    splittable.find((session) => session.id === preferredSesionId)?.id || splittable[0]?.id || null;

  if (defaultSession) select.value = defaultSession;
}

async function loadSplitAccountItems() {
  const list = document.getElementById('splitAccountList');
  if (list) list.innerHTML = '<p class="split-account__empty">Cargando productos…</p>';

  const sesionId =
    document.getElementById('splitAccountSessionSelect')?.value || splitAccountState.sesionId;

  if (!sesionId) {
    splitAccountState.items = [];
    splitAccountState.selected = new Set();
    renderSplitAccountList();
    return;
  }

  splitAccountState.sesionId = sesionId;
  splitAccountState.selected = new Set();

  try {
    splitAccountState.items = await fetchDeliveredPedidoItems(splitAccountState.mesaId, sesionId);
    renderSplitAccountList();
  } catch (error) {
    console.error(error);
    if (list) {
      list.innerHTML = `<p class="split-account__empty">${escapeHtml(error.message || 'No se pudieron cargar los productos.')}</p>`;
    }
    updateSplitAccountSummary();
  }
}

function closeSplitAccountModal() {
  const modal = document.getElementById('splitAccountModal');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  splitAccountState = {
    mesaId: null,
    mesaNum: null,
    sesionId: null,
    items: [],
    selected: new Set(),
    submitting: false,
  };
}

async function openSplitAccountModal(mesaId, mesaNum, preferredSesionId = null) {
  const splittable = getSplittableSessions(mesaId);
  if (splittable.length === 0) {
    showToast('No hay cuentas que se puedan separar en esta mesa.', 'error');
    return;
  }

  closeAccountModal();

  splitAccountState = {
    mesaId,
    mesaNum,
    sesionId: preferredSesionId || splittable[0].id,
    items: [],
    selected: new Set(),
    submitting: false,
  };

  document.getElementById('splitAccountTitle').textContent = `Separar cuenta · Mesa ${mesaNum}`;
  document.getElementById('splitAccountHint').textContent =
    'Elegí los productos para mover a una cuenta nueva. Debe quedar al menos uno en la cuenta original.';

  populateSplitAccountSessionSelect(mesaId, preferredSesionId);
  await loadSplitAccountItems();

  const modal = document.getElementById('splitAccountModal');
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

async function confirmSplitAccount() {
  if (splitAccountState.submitting) return;

  const selectedIds = [...splitAccountState.selected];
  if (selectedIds.length === 0) {
    showToast('Seleccioná productos para mover.', 'error');
    return;
  }

  if (selectedIds.length >= splitAccountState.items.length) {
    showToast('Dejá al menos un producto en la cuenta original.', 'error');
    return;
  }

  const confirmBtn = document.getElementById('splitAccountConfirmBtn');
  splitAccountState.submitting = true;
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Separando…';
  }

  try {
    const newSession = await movePedidoItemsToNewSession(splitAccountState.mesaId, selectedIds);
    closeSplitAccountModal();
    await refreshPanelData();
    showToast(`Cuenta separada · #${formatSessionCode(newSession.numero)}`, 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo separar la cuenta.', 'error');
  } finally {
    splitAccountState.submitting = false;
    if (confirmBtn) {
      confirmBtn.textContent = 'Mover a cuenta nueva';
      updateSplitAccountSummary();
    }
  }
}

let splitPaymentState = {
  mesaId: null,
  mesaNum: null,
  sesionId: null,
  sessionLabel: '',
  subtotal: 0,
  splitCount: 2,
  serviceEnabled: true,
  paidTotal: 0,
  paidParts: 0,
  submitting: false,
};

function getChargeableSessionsForPayment(mesaId) {
  return getChargeableAccountSessions(mesaId).filter(
    (session) => !session.pago_pendiente_confirmacion && !session.pago_en_proceso
  );
}

function populateSplitPaymentSessionSelect(mesaId, preferredSesionId = null) {
  const field = document.getElementById('splitPaymentSessionField');
  const select = document.getElementById('splitPaymentSessionSelect');
  if (!field || !select) return null;

  const sessions = getChargeableSessionsForPayment(mesaId);
  field.hidden = sessions.length <= 1;

  select.innerHTML = sessions
    .map((session) => {
      const heading = formatAccountSessionHeading(session);
      return `<option value="${session.id}">${escapeHtml(heading)} · ${formatCOP(session.total)}</option>`;
    })
    .join('');

  const defaultSession =
    sessions.find((session) => session.id === preferredSesionId) || sessions[0] || null;

  if (defaultSession) select.value = defaultSession.id;
  return defaultSession;
}

function getSelectedSplitPaymentSession() {
  const select = document.getElementById('splitPaymentSessionSelect');
  const sesionId = select?.value || splitPaymentState.sesionId;
  const session = getChargeableSessionsForPayment(splitPaymentState.mesaId).find(
    (entry) => entry.id === sesionId
  );

  return {
    sesionId,
    sessionLabel: session ? formatAccountSessionHeading(session) : splitPaymentState.sessionLabel,
    subtotal: Number(session?.total ?? splitPaymentState.subtotal) || 0,
  };
}

function renderSplitPaymentQr(share, partNumber) {
  const box = document.getElementById('splitPaymentQrBox');
  const canvas = document.getElementById('splitPaymentQrCanvas');
  if (!box || !canvas || typeof QRCode === 'undefined') return;

  if (share.shareTotal <= 0 || splitPaymentState.paidTotal >= share.breakdown.total) {
    box.hidden = true;
    canvas.innerHTML = '';
    return;
  }

  box.hidden = false;
  canvas.innerHTML = '';
  new QRCode(canvas, {
    text: buildPagarUrl(
      share.shareTotal,
      splitPaymentState.sesionId,
      share.shareServicio,
      partNumber
    ),
    width: 220,
    height: 220,
    colorDark: '#0f172a',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

async function refreshSplitPaymentModal() {
  if (!splitPaymentState.sesionId) return;

  const selected = getSelectedSplitPaymentSession();
  splitPaymentState.sesionId = selected.sesionId;
  splitPaymentState.sessionLabel = selected.sessionLabel;
  splitPaymentState.subtotal = selected.subtotal;

  const toggle = document.getElementById('splitPaymentServiceToggle');
  if (toggle) splitPaymentState.serviceEnabled = toggle.checked;

  splitPaymentState.paidTotal = await getSessionApprovedPaymentsTotal(splitPaymentState.sesionId);
  splitPaymentState.paidParts = await getSessionApprovedPaymentsCount(splitPaymentState.sesionId);

  const share = getPanelSplitShare(
    splitPaymentState.subtotal,
    splitPaymentState.splitCount,
    splitPaymentState.serviceEnabled
  );

  document.getElementById('splitPaymentSessionLabel').textContent = splitPaymentState.sessionLabel;
  document.getElementById('splitPaymentShareAmount').textContent = formatCOP(share.shareTotal);
  document.getElementById('splitPaymentTotalMeta').textContent =
    `Total cuenta: ${formatCOP(share.breakdown.total)} · ${share.count} personas`;

  const progressEl = document.getElementById('splitPaymentProgress');
  const hintEl = document.getElementById('splitPaymentHint');
  const dataphoneBtn = document.getElementById('splitPaymentDataphoneBtn');
  const qrBtn = document.getElementById('splitPaymentShowQrBtn');
  const minusBtn = document.getElementById('splitPaymentCountMinus');
  const plusBtn = document.getElementById('splitPaymentCountPlus');
  const countInput = document.getElementById('splitPaymentCountInput');

  if (countInput) countInput.value = String(splitPaymentState.splitCount);
  if (minusBtn) minusBtn.disabled = splitPaymentState.splitCount <= 2 || splitPaymentState.submitting;
  if (plusBtn) plusBtn.disabled = splitPaymentState.splitCount >= 20 || splitPaymentState.submitting;

  const isComplete = splitPaymentState.paidTotal >= share.breakdown.total;
  const nextPart = Math.min(splitPaymentState.paidParts + 1, share.count);

  if (progressEl) {
    if (splitPaymentState.paidTotal > 0 || isComplete) {
      progressEl.hidden = false;
      progressEl.textContent = isComplete
        ? `Cuenta cubierta · ${formatCOP(splitPaymentState.paidTotal)} de ${formatCOP(share.breakdown.total)}`
        : `Pagado: ${formatCOP(splitPaymentState.paidTotal)} de ${formatCOP(share.breakdown.total)} · ${splitPaymentState.paidParts}/${share.count} partes`;
    } else {
      progressEl.hidden = true;
      progressEl.textContent = '';
    }
  }

  if (hintEl) {
    hintEl.textContent = isComplete
      ? 'La cuenta ya está cubierta. Confirmá el pago desde la tarjeta de la mesa.'
      : `Mostrá ${formatCOP(share.shareTotal)} a la persona ${nextPart} antes de cobrar su parte.`;
  }

  if (dataphoneBtn) {
    dataphoneBtn.disabled = splitPaymentState.submitting || isComplete || share.shareTotal <= 0;
    dataphoneBtn.textContent = isComplete ? 'Cuenta cubierta' : `Cobrar parte ${nextPart}`;
  }

  if (qrBtn) {
    qrBtn.disabled = splitPaymentState.submitting || isComplete || share.shareTotal <= 0;
  }

  renderSplitPaymentQr(share, nextPart);
}

function closeSplitPaymentModal() {
  const modal = document.getElementById('splitPaymentModal');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  const canvas = document.getElementById('splitPaymentQrCanvas');
  if (canvas) canvas.innerHTML = '';
  splitPaymentState = {
    mesaId: null,
    mesaNum: null,
    sesionId: null,
    sessionLabel: '',
    subtotal: 0,
    splitCount: 2,
    serviceEnabled: true,
    paidTotal: 0,
    paidParts: 0,
    submitting: false,
  };
}

async function openSplitPaymentModal(mesaId, mesaNum, preferredSesionId = null, sessionMeta = null) {
  const sessions = getChargeableSessionsForPayment(mesaId);
  if (sessions.length === 0) {
    showToast('No hay cuentas con monto para dividir el pago.', 'error');
    return;
  }

  const defaultSession =
    sessions.find((session) => session.id === preferredSesionId) ||
    sessions.find((session) => session.id === sessionMeta?.sesionId) ||
    sessions[0];

  splitPaymentState = {
    mesaId,
    mesaNum,
    sesionId: defaultSession.id,
    sessionLabel: sessionMeta?.sessionLabel || formatAccountSessionHeading(defaultSession),
    subtotal: Number(sessionMeta?.sessionTotal ?? defaultSession.total) || 0,
    splitCount: 2,
    serviceEnabled: true,
    paidTotal: 0,
    paidParts: 0,
    submitting: false,
  };

  document.getElementById('splitPaymentTitle').textContent = `Dividir pago · Mesa ${mesaNum}`;
  populateSplitPaymentSessionSelect(mesaId, splitPaymentState.sesionId);

  const toggle = document.getElementById('splitPaymentServiceToggle');
  if (toggle) toggle.checked = true;

  await refreshSplitPaymentModal();

  const modal = document.getElementById('splitPaymentModal');
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

async function collectSplitPaymentPart() {
  if (splitPaymentState.submitting || !splitPaymentState.sesionId) return;

  const share = getPanelSplitShare(
    splitPaymentState.subtotal,
    splitPaymentState.splitCount,
    splitPaymentState.serviceEnabled
  );

  if (share.shareTotal <= 0) return;

  if (splitPaymentState.paidTotal >= share.breakdown.total) {
    showToast('La cuenta ya está cubierta.', 'success');
    await refreshSplitPaymentModal();
    return;
  }

  const btn = document.getElementById('splitPaymentDataphoneBtn');
  splitPaymentState.submitting = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Registrando…';
  }

  try {
    const paidTotal = await recordSplitPartPayment(
      splitPaymentState.sesionId,
      share,
      share.breakdown.total
    );

    await refreshPanelData();
    await refreshSplitPaymentModal();

    if (paidTotal >= share.breakdown.total) {
      showToast('Todas las partes cobradas. Confirmá el pago en la mesa.', 'success');
    } else {
      showToast(`Parte cobrada · ${formatCOP(share.shareTotal)}`, 'success');
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo registrar la parte.', 'error');
  } finally {
    splitPaymentState.submitting = false;
    await refreshSplitPaymentModal();
  }
}

function openDataphoneModalBulk() {
  if (!accountModalState || accountModalState.chargeableSessions.length === 0) return;

  const { mesaId, mesaNum, allSessions, combinedTotal } = accountModalState;

  dataphoneModalState = {
    bulk: true,
    sesionIds: allSessions.map((session) => session.id),
    mesaId,
    mesaNum,
    sessionLabel: `Todas las cuentas · Mesa ${mesaNum}`,
    subtotal: combinedTotal,
    serviceChargeEnabled: true,
  };

  document.getElementById('dataphoneLabel').textContent = dataphoneModalState.sessionLabel;
  const toggle = document.getElementById('dataphoneServiceToggle');
  if (toggle) toggle.checked = true;
  updateDataphoneModalUI();

  const modal = document.getElementById('dataphoneModal');
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

function openPaymentQrModalBulk() {
  if (!accountModalState || accountModalState.chargeableSessions.length === 0) return;

  const { mesaNum, chargeableSessions, combinedTotal } = accountModalState;
  const primarySession = chargeableSessions.reduce((largest, session) =>
    session.total > largest.total ? session : largest
  );

  openPaymentQrModal({
    sesionId: primarySession.id,
    sessionLabel: `Todas las cuentas · Mesa ${mesaNum}`,
    sessionTotal: combinedTotal,
  });
}

function openDataphoneModal({ sesionId, sessionLabel, sessionTotal, mesaId, mesaNum }) {
  dataphoneModalState = {
    sesionId,
    mesaId,
    mesaNum,
    sessionLabel,
    subtotal: Number(sessionTotal),
    serviceChargeEnabled: true,
  };

  document.getElementById('dataphoneLabel').textContent = sessionLabel;
  const toggle = document.getElementById('dataphoneServiceToggle');
  if (toggle) toggle.checked = true;
  updateDataphoneModalUI();

  const modal = document.getElementById('dataphoneModal');
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

function updateDataphoneModalUI() {
  if (!dataphoneModalState) return;

  const toggle = document.getElementById('dataphoneServiceToggle');
  if (toggle) dataphoneModalState.serviceChargeEnabled = toggle.checked;

  const breakdown = getPanelPaymentBreakdown(
    dataphoneModalState.subtotal,
    dataphoneModalState.serviceChargeEnabled
  );

  document.getElementById('dataphoneSubtotal').textContent = formatCOP(breakdown.subtotal);
  document.getElementById('dataphoneServiceAmount').textContent = formatCOP(breakdown.cargoServicio);
  document.getElementById('dataphoneAmount').textContent = formatCOP(breakdown.total);
}

function closeDataphoneModal() {
  const modal = document.getElementById('dataphoneModal');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  dataphoneModalState = null;
}

function renderPaymentQrModal() {
  if (!paymentQrModalState) return;

  const toggle = document.getElementById('paymentQrServiceToggle');
  if (toggle) paymentQrModalState.serviceChargeEnabled = toggle.checked;

  const breakdown = getPanelPaymentBreakdown(
    paymentQrModalState.subtotal,
    paymentQrModalState.serviceChargeEnabled
  );

  document.getElementById('paymentQrSubtotal').textContent = formatCOP(breakdown.subtotal);
  document.getElementById('paymentQrServiceAmount').textContent = formatCOP(breakdown.cargoServicio);
  document.getElementById('paymentQrTotal').textContent = formatCOP(breakdown.total);

  const canvas = document.getElementById('paymentQrCanvas');
  if (!canvas || typeof QRCode === 'undefined') return;

  canvas.innerHTML = '';
  new QRCode(canvas, {
    text: buildPagarUrl(breakdown.total, paymentQrModalState.sesionId, breakdown.cargoServicio),
    width: 240,
    height: 240,
    colorDark: '#0f172a',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

function openPaymentQrModal({ sesionId, sessionLabel, sessionTotal }) {
  const total = Number(sessionTotal);
  if (!sesionId || total <= 0) {
    showToast('No hay monto para generar el QR.', 'error');
    return;
  }

  if (typeof QRCode === 'undefined') {
    showToast('No se pudo cargar el generador de QR.', 'error');
    return;
  }

  paymentQrModalState = {
    sesionId,
    sessionLabel,
    subtotal: total,
    serviceChargeEnabled: true,
  };

  document.getElementById('paymentQrTitle').textContent = `QR · ${sessionLabel}`;
  const toggle = document.getElementById('paymentQrServiceToggle');
  if (toggle) toggle.checked = true;
  renderPaymentQrModal();

  const modal = document.getElementById('paymentQrModal');
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

function closePaymentQrModal() {
  const modal = document.getElementById('paymentQrModal');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  paymentQrModalState = null;
  const canvas = document.getElementById('paymentQrCanvas');
  if (canvas) canvas.innerHTML = '';
}

function handleAccountModalAction(event) {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;

  const { action, sesionId, sessionLabel, sessionTotal, mesaId, mesaNum } = btn.dataset;

  if (action === 'cobrar-dataphone') {
    openDataphoneModal({ sesionId, sessionLabel, sessionTotal, mesaId, mesaNum });
  } else if (action === 'enviar-qr') {
    openPaymentQrModal({ sesionId, sessionLabel, sessionTotal });
  } else if (action === 'cobrar-dataphone-todo') {
    openDataphoneModalBulk();
  } else if (action === 'enviar-qr-todo') {
    openPaymentQrModalBulk();
  } else if (action === 'separar-cuenta') {
    const sesionId = btn.dataset.sesionId || null;
    if (accountModalState) {
      openSplitAccountModal(accountModalState.mesaId, accountModalState.mesaNum, sesionId);
    }
  } else if (action === 'dividir-pago') {
    openSplitPaymentModal(mesaId, mesaNum, sesionId, {
      sesionId,
      sessionLabel,
      sessionTotal,
    });
  }
}

function initModal() {
  initCloseMesaModal();

  document.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', closeAccountModal);
  });

  document.querySelectorAll('[data-close-dataphone]').forEach((el) => {
    el.addEventListener('click', closeDataphoneModal);
  });

  document.querySelectorAll('[data-close-payment-qr]').forEach((el) => {
    el.addEventListener('click', closePaymentQrModal);
  });

  document.getElementById('accountModal')?.addEventListener('click', handleAccountModalAction);

  document.getElementById('splitAccountModal')?.querySelectorAll('[data-close-split-account]').forEach((el) => {
    el.addEventListener('click', closeSplitAccountModal);
  });

  document.getElementById('splitAccountSessionSelect')?.addEventListener('change', () => {
    loadSplitAccountItems();
  });

  document.getElementById('splitAccountConfirmBtn')?.addEventListener('click', confirmSplitAccount);

  document.getElementById('splitPaymentModal')?.querySelectorAll('[data-close-split-payment]').forEach((el) => {
    el.addEventListener('click', closeSplitPaymentModal);
  });

  document.getElementById('splitPaymentSessionSelect')?.addEventListener('change', () => {
    refreshSplitPaymentModal();
  });

  document.getElementById('splitPaymentServiceToggle')?.addEventListener('change', () => {
    refreshSplitPaymentModal();
  });

  document.getElementById('splitPaymentCountMinus')?.addEventListener('click', () => {
    if (splitPaymentState.splitCount <= 2) return;
    splitPaymentState.splitCount -= 1;
    refreshSplitPaymentModal();
  });

  document.getElementById('splitPaymentCountPlus')?.addEventListener('click', () => {
    if (splitPaymentState.splitCount >= 20) return;
    splitPaymentState.splitCount += 1;
    refreshSplitPaymentModal();
  });

  document.getElementById('splitPaymentDataphoneBtn')?.addEventListener('click', collectSplitPaymentPart);

  document.getElementById('splitPaymentShowQrBtn')?.addEventListener('click', () => {
    const box = document.getElementById('splitPaymentQrBox');
    if (box) {
      box.hidden = false;
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  document.getElementById('dataphoneConfirmBtn')?.addEventListener('click', async () => {
    if (!dataphoneModalState) return;

    const breakdown = getPanelPaymentBreakdown(
      dataphoneModalState.subtotal,
      dataphoneModalState.serviceChargeEnabled
    );
    const btn = document.getElementById('dataphoneConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Confirmando…';

    try {
      if (dataphoneModalState.bulk && dataphoneModalState.sesionIds?.length) {
        const { sesionIds, mesaId, mesaNum } = dataphoneModalState;

        for (let index = 0; index < sesionIds.length; index += 1) {
          const isLast = index === sesionIds.length - 1;
          await confirmSessionPayment(sesionIds[index], mesaId, mesaNum, isLast ? 'Cobro total confirmado' : '', {
            cargoServicio: index === 0 ? breakdown.cargoServicio : 0,
            skipToast: !isLast,
            skipRefresh: !isLast,
          });
        }
      } else {
        const { sesionId, mesaId, mesaNum } = dataphoneModalState;
        await confirmSessionPayment(sesionId, mesaId, mesaNum, 'Cobro confirmado', {
          cargoServicio: breakdown.cargoServicio,
        });
      }

      closeDataphoneModal();
      closeAccountModal();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Confirmar cobro';
    }
  });

  document.getElementById('dataphoneServiceToggle')?.addEventListener('change', updateDataphoneModalUI);
  document.getElementById('paymentQrServiceToggle')?.addEventListener('change', renderPaymentQrModal);
}

async function confirmSessionPayment(sesionId, mesaId, mesaNum, successMessage = 'Sesión cerrada', options = {}) {
  const { cargoServicio = 0, skipToast = false, skipRefresh = false } = options;

  if (updating.has(`pay-${sesionId}`)) return;

  updating.add(`pay-${sesionId}`);

  try {
    const { error: pedidosError } = await supabaseClient
      .from('pedidos')
      .update({ archivado: true })
      .eq('sesion_id', sesionId)
      .eq('restaurante_id', RESTAURANTE_ID)
      .eq('archivado', false);

    if (pedidosError) throw pedidosError;

    if (cargoServicio > 0) {
      await saveSessionCargoServicio(sesionId, cargoServicio);
    }

    const { error: sesionError } = await supabaseClient
      .from('sesiones')
      .update({ activa: false, pago_pendiente_confirmacion: false, pago_en_proceso: false })
      .eq('id', sesionId);

    if (sesionError) throw sesionError;

    const { data: activeSessions, error: activeError } = await supabaseClient
      .from('sesiones')
      .select('id')
      .eq('mesa_id', mesaId)
      .eq('restaurante_id', RESTAURANTE_ID)
      .eq('activa', true)
      .limit(1);

    if (activeError) throw activeError;

    if (!activeSessions?.length) {
      const { error: mesaError } = await supabaseClient
        .from('mesas')
        .update({ estado: 'libre', mesero_requerido: false })
        .eq('id', mesaId);

      if (mesaError) throw mesaError;
    }

    if (!skipToast && successMessage) showToast(successMessage, 'success');
    if (!skipRefresh) await refreshPanelData();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo confirmar el pago.', 'error');
  } finally {
    updating.delete(`pay-${sesionId}`);
  }
}

async function markWaiterAttended(mesaId) {
  if (updating.has(`waiter-${mesaId}`)) return;

  updating.add(`waiter-${mesaId}`);

  try {
    const { error } = await supabaseClient
      .from('mesas')
      .update({ mesero_requerido: false })
      .eq('id', mesaId);

    if (error) throw error;

    showToast('Llamada de mesero atendida', 'success');
    await fetchMesas();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo actualizar la mesa.', 'error');
  } finally {
    updating.delete(`waiter-${mesaId}`);
  }
}

let closeMesaModalResolver = null;

function openCloseMesaModal(mesaId, mesaNum) {
  return new Promise((resolve) => {
    closeMesaModalResolver = resolve;

    const titleEl = document.getElementById('closeMesaModalTitle');
    const modal = document.getElementById('closeMesaModal');

    if (titleEl) titleEl.textContent = `Cerrar Mesa ${mesaNum}`;
    if (!modal) {
      resolve(false);
      closeMesaModalResolver = null;
      return;
    }

    modal.dataset.mesaId = mesaId;
    modal.dataset.mesaNum = String(mesaNum);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
  });
}

function closeCloseMesaModal(confirmed) {
  const modal = document.getElementById('closeMesaModal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }

  if (closeMesaModalResolver) {
    closeMesaModalResolver(confirmed === true);
    closeMesaModalResolver = null;
  }
}

function initCloseMesaModal() {
  const modal = document.getElementById('closeMesaModal');
  if (!modal || modal.dataset.bound) return;
  modal.dataset.bound = 'true';

  modal.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-close-close-mesa]');
    if (!btn) return;
    closeCloseMesaModal(btn.dataset.closeCloseMesa === 'confirm');
  });

  document.getElementById('closeMesaConfirmBtn')?.addEventListener('click', () => {
    closeCloseMesaModal(true);
  });
}

async function closeMesa(mesaId, mesaNum) {
  if (updating.has(`close-${mesaId}`)) return;

  const confirmed = await openCloseMesaModal(mesaId, mesaNum);
  if (!confirmed) return;

  updating.add(`close-${mesaId}`);

  try {
    const { error: pedidosError } = await supabaseClient
      .from('pedidos')
      .update({ archivado: true })
      .eq('mesa_id', mesaId)
      .eq('restaurante_id', RESTAURANTE_ID)
      .eq('archivado', false);

    if (pedidosError) throw pedidosError;

    const { error: sesionesError } = await supabaseClient
      .from('sesiones')
      .update({ activa: false })
      .eq('mesa_id', mesaId)
      .eq('restaurante_id', RESTAURANTE_ID)
      .eq('activa', true);

    if (sesionesError) throw sesionesError;

    const { data: mesaUpdated, error: mesaError } = await supabaseClient
      .from('mesas')
      .update({ estado: 'libre', mesero_requerido: false })
      .eq('id', mesaId)
      .select('id, numero, estado')
      .single();

    if (mesaError) throw mesaError;
    if (!mesaUpdated) {
      throw new Error('No se pudo liberar la mesa. Revisa permisos RLS en Supabase.');
    }

    showToast(`Mesa ${mesaNum} cerrada y liberada`, 'success');
    await refreshPanelData();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo cerrar la mesa.', 'error');
  } finally {
    updating.delete(`close-${mesaId}`);
  }
}

/* ── Actualizaciones pedidos ── */
async function updatePedidoItem(itemId, payload) {
  const { data, error } = await supabaseClient
    .from('pedido_items')
    .update(payload)
    .eq('id', itemId)
    .select('id, estado, confirmado_por_mesero, pedido_id')
    .single();

  if (error) throw error;
  if (!data) throw new Error('No se pudo actualizar el item. Revisa permisos RLS en Supabase.');
  return data;
}

async function syncPedidoEstado(pedidoId) {
  const order = orders.find((o) => o.id === pedidoId);
  if (!order?.pedido_items?.length) return;

  const allDelivered = order.pedido_items.every(isItemDelivered);
  const anyInPrep = order.pedido_items.some(
    (item) => !isItemDelivered(item) && normalizeItemEstado(item.estado) === 'en_preparacion'
  );

  let nuevoEstado = order.estado;

  if (allDelivered) nuevoEstado = 'confirmado';
  else if (anyInPrep && order.estado === 'pendiente') nuevoEstado = 'en_preparacion';

  if (nuevoEstado === order.estado) return;

  const { error } = await supabaseClient
    .from('pedidos')
    .update({ estado: nuevoEstado })
    .eq('id', pedidoId);

  if (error) throw error;
  order.estado = nuevoEstado;
}

async function refreshAfterOrderChange() {
  await refreshPanelData();
}

async function markAllEnPreparacion(pedidoId) {
  const bulkKey = `bulk-prep-${pedidoId}`;
  if (updating.has(bulkKey)) return;

  const order = orders.find((o) => o.id === pedidoId);
  if (!order) return;

  const pendingIds = (order.pedido_items || [])
    .filter((item) => !isItemDelivered(item) && normalizeItemEstado(item.estado) === 'pendiente')
    .map((item) => item.id);

  if (pendingIds.length === 0) return;

  updating.add(bulkKey);
  renderOrders();

  try {
    const { data, error } = await supabaseClient
      .from('pedido_items')
      .update({ estado: 'en_preparacion' })
      .in('id', pendingIds)
      .select('id, estado, confirmado_por_mesero');

    if (error) throw error;
    if (!data?.length) throw new Error('No se pudo actualizar los items. Revisa permisos RLS.');

    data.forEach((updated) => {
      const item = order.pedido_items.find((i) => i.id === updated.id);
      if (item) item.estado = updated.estado;
    });

    await syncPedidoEstado(pedidoId);
    await refreshAfterOrderChange();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo actualizar el pedido.', 'error');
    await fetchOrders();
  } finally {
    updating.delete(bulkKey);
  }
}

async function markAllEntregado(pedidoId) {
  const bulkKey = `bulk-del-${pedidoId}`;
  if (updating.has(bulkKey)) return;

  const order = orders.find((o) => o.id === pedidoId);
  if (!order) return;

  const undeliveredIds = (order.pedido_items || [])
    .filter((item) => !isItemDelivered(item))
    .map((item) => item.id);

  if (undeliveredIds.length === 0) return;

  updating.add(bulkKey);
  renderOrders();

  try {
    const { data, error } = await supabaseClient
      .from('pedido_items')
      .update({ estado: 'listo', confirmado_por_mesero: true })
      .in('id', undeliveredIds)
      .select('id, estado, confirmado_por_mesero');

    if (error) throw error;
    if (!data?.length) throw new Error('No se pudo actualizar los items. Revisa permisos RLS.');

    data.forEach((updated) => {
      const item = order.pedido_items.find((i) => i.id === updated.id);
      if (item) {
        item.estado = updated.estado;
        item.confirmado_por_mesero = updated.confirmado_por_mesero;
      }
    });

    await syncPedidoEstado(pedidoId);
    await refreshAfterOrderChange();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo marcar como entregado.', 'error');
    await fetchOrders();
  } finally {
    updating.delete(bulkKey);
  }
}

async function markItemEnPreparacion(itemId, pedidoId) {
  if (updating.has(itemId)) return;

  updating.add(itemId);
  renderOrders();

  try {
    const updated = await updatePedidoItem(itemId, { estado: 'en_preparacion' });
    const order = orders.find((o) => o.id === pedidoId);
    const item = order?.pedido_items?.find((i) => i.id === itemId);
    if (item) {
      item.estado = updated.estado;
      item.confirmado_por_mesero = updated.confirmado_por_mesero;
    }

    await syncPedidoEstado(pedidoId);
    await refreshAfterOrderChange();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo actualizar el item.', 'error');
    await fetchOrders();
  } finally {
    updating.delete(itemId);
  }
}

async function markItemEntregado(itemId, pedidoId) {
  if (updating.has(itemId)) return;

  updating.add(itemId);
  renderOrders();

  try {
    const updated = await updatePedidoItem(itemId, {
      estado: 'listo',
      confirmado_por_mesero: true,
    });

    const order = orders.find((o) => o.id === pedidoId);
    const item = order?.pedido_items?.find((i) => i.id === itemId);
    if (item) {
      item.estado = updated.estado;
      item.confirmado_por_mesero = updated.confirmado_por_mesero;
    }

    await syncPedidoEstado(pedidoId);
    await refreshAfterOrderChange();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo marcar como entregado.', 'error');
    await fetchOrders();
  } finally {
    updating.delete(itemId);
  }
}

/* ── Nueva orden (mesero) ── */
let newOrderState = {
  mesaId: null,
  mesaNum: null,
  step: 'account',
  selectedSessionId: null,
  selectedSessionNumero: null,
  selectedSessionTipo: null,
  createNewSession: false,
  cart: {},
  products: [],
  categories: [],
  activeCategory: null,
  submitting: false,
};

let newOrderModalBound = false;

function formatNewOrderSessionOption(session) {
  if (session.tipo === 'grupal') return 'Cuenta Grupal';
  const code = formatSessionCode(session.numero);
  return code ? `#${code} (Personal)` : 'Cuenta (Personal)';
}

function showNewOrderAccountStep() {
  document.getElementById('newOrderAccountStep').hidden = false;
  document.getElementById('newOrderMenuStep').hidden = true;
}

function showNewOrderMenuStep() {
  document.getElementById('newOrderAccountStep').hidden = true;
  document.getElementById('newOrderMenuStep').hidden = false;
}

function renderNewOrderAccountStep() {
  const list = document.getElementById('newOrderAccountList');
  if (!list) return;

  const sessions = mesaSessionBreakdown[newOrderState.mesaId] || [];

  list.innerHTML = `
    ${sessions
      .map(
        (session) => `
          <li>
            <button
              type="button"
              class="new-order-card__account-btn"
              data-select-session="${session.id}"
              data-session-numero="${session.numero ?? ''}"
              data-session-tipo="${session.tipo || 'individual'}"
            >${escapeHtml(formatNewOrderSessionOption(session))}</button>
          </li>
        `
      )
      .join('')}
    <li>
      <button type="button" class="new-order-card__account-btn new-order-card__account-btn--new" data-select-session="new">
        Nueva cuenta
      </button>
    </li>
  `;
}

async function selectNewOrderAccount(option) {
  if (option === 'new') {
    newOrderState.createNewSession = true;
    newOrderState.selectedSessionId = null;
    newOrderState.selectedSessionNumero = null;
    newOrderState.selectedSessionTipo = null;
  } else {
    newOrderState.createNewSession = false;
    newOrderState.selectedSessionId = option.id;
    newOrderState.selectedSessionNumero = option.numero;
    newOrderState.selectedSessionTipo = option.tipo;
  }

  newOrderState.step = 'menu';
  newOrderState.cart = {};
  showNewOrderMenuStep();
  await loadNewOrderMenuContent();
}

async function loadNewOrderMenuContent() {
  document.getElementById('newOrderTabs').innerHTML = '';
  document.getElementById('newOrderProducts').innerHTML = '';
  document.getElementById('newOrderEmpty').hidden = false;
  document.getElementById('newOrderEmpty').textContent = 'Cargando carta…';
  renderNewOrderSummary();

  try {
    await loadNewOrderProducts();
    newOrderState.categories = buildNewOrderCategories(newOrderState.products);
    newOrderState.activeCategory = newOrderState.categories[0]?.id || null;
    renderNewOrderTabs();
    renderNewOrderProducts();
    renderNewOrderSummary();
  } catch (error) {
    console.error(error);
    document.getElementById('newOrderTabs').innerHTML = '';
    document.getElementById('newOrderProducts').innerHTML = '';
    document.getElementById('newOrderEmpty').hidden = false;
    document.getElementById('newOrderEmpty').textContent = 'No se pudo cargar la carta.';
    showToast(error.message || 'Error cargando productos.', 'error');
  }
}

async function getNextSessionNumeroForMesa(mesaId) {
  const { data, error } = await supabaseClient
    .from('sesiones')
    .select('numero')
    .eq('mesa_id', mesaId)
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.numero ?? 0) + 1;
}

async function createPanelIndividualSession(mesaId) {
  const { data, error } = await supabaseClient
    .from('sesiones')
    .insert({
      mesa_id: mesaId,
      restaurante_id: RESTAURANTE_ID,
      session_token: crypto.randomUUID(),
      tipo: 'individual',
      numero: await getNextSessionNumeroForMesa(mesaId),
      activa: true,
    })
    .select('id, numero, tipo')
    .single();

  if (error) throw error;
  return data;
}

async function loadNewOrderProducts() {
  const { data, error } = await supabaseClient
    .from('productos')
    .select('id, nombre, descripcion, precio, categoria')
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('disponible', true)
    .order('categoria', { ascending: true })
    .order('nombre', { ascending: true });

  if (error) throw error;
  newOrderState.products = data || [];
}

function groupNewOrderProducts(products) {
  const groups = new Map();

  products.forEach((product) => {
    const category = product.categoria?.trim() || 'Sin categoría';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(product);
  });

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'));
}

function buildNewOrderCategories(products) {
  const groups = groupNewOrderProducts(products);
  return groups.map(([name, items], index) => ({
    id: `cat-${index}`,
    name,
    items,
  }));
}

function getNewOrderActiveCategory() {
  return newOrderState.categories.find((c) => c.id === newOrderState.activeCategory) || null;
}

function setNewOrderActiveCategory(categoryId) {
  newOrderState.activeCategory = categoryId;
  renderNewOrderTabs();
  renderNewOrderProducts();
}

function getNewOrderCartEntries() {
  return Object.entries(newOrderState.cart)
    .map(([productId, entry]) => {
      const product = newOrderState.products.find((p) => p.id === productId);
      if (!product || entry.qty <= 0) return null;
      const unitPrice = Number(product.precio);
      return {
        productId,
        name: product.nombre,
        qty: entry.qty,
        unitPrice,
        subtotal: unitPrice * entry.qty,
      };
    })
    .filter(Boolean);
}

function getNewOrderCartTotal() {
  return getNewOrderCartEntries().reduce((sum, item) => sum + item.subtotal, 0);
}

function addToNewOrderCart(productId) {
  if (!newOrderState.cart[productId]) {
    newOrderState.cart[productId] = { qty: 0 };
  }
  newOrderState.cart[productId].qty += 1;
  renderNewOrderProducts();
  renderNewOrderSummary();
}

function removeFromNewOrderCart(productId) {
  if (!newOrderState.cart[productId]) return;
  newOrderState.cart[productId].qty -= 1;
  if (newOrderState.cart[productId].qty <= 0) {
    delete newOrderState.cart[productId];
  }
  renderNewOrderProducts();
  renderNewOrderSummary();
}

function renderNewOrderTabs() {
  const container = document.getElementById('newOrderTabs');
  if (!container) return;

  if (newOrderState.categories.length === 0) {
    container.innerHTML = '';
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = newOrderState.categories
    .map(
      (category) => `
        <button
          type="button"
          class="new-order-card__tab${category.id === newOrderState.activeCategory ? ' new-order-card__tab--active' : ''}"
          data-category-id="${category.id}"
          role="tab"
          aria-selected="${category.id === newOrderState.activeCategory}"
        >${escapeHtml(category.name)}</button>
      `
    )
    .join('');
}

function renderNewOrderProducts() {
  const list = document.getElementById('newOrderProducts');
  const empty = document.getElementById('newOrderEmpty');
  if (!list || !empty) return;

  if (newOrderState.products.length === 0) {
    list.innerHTML = '';
    empty.hidden = false;
    empty.textContent = 'No hay productos disponibles.';
    return;
  }

  const category = getNewOrderActiveCategory();
  const items = category?.items || [];

  if (items.length === 0) {
    list.innerHTML = '';
    empty.hidden = false;
    empty.textContent = 'No hay productos en esta categoría.';
    return;
  }

  empty.hidden = true;
  list.innerHTML = items
    .map((product) => {
      const qty = newOrderState.cart[product.id]?.qty || 0;
      return `
        <li class="item-row new-order-card__item">
          <div class="item-row__info">
            <p class="item-row__name">${escapeHtml(product.nombre)}</p>
            ${product.descripcion ? `<p class="item-row__qty">${escapeHtml(product.descripcion)}</p>` : ''}
            <p class="new-order-card__price">${formatCOP(Number(product.precio))}</p>
          </div>
          <div class="item-row__actions">
            <div class="new-order-card__qty">
              <button
                type="button"
                class="new-order-card__qty-btn"
                data-remove-product="${product.id}"
                aria-label="Quitar uno de ${escapeHtml(product.nombre)}"
                ${qty === 0 ? 'disabled' : ''}
              >−</button>
              <span class="new-order-card__qty-num">${qty}</span>
              <button
                type="button"
                class="new-order-card__qty-btn"
                data-add-product="${product.id}"
                aria-label="Agregar uno de ${escapeHtml(product.nombre)}"
              >+</button>
            </div>
          </div>
        </li>
      `;
    })
    .join('');
}

function renderNewOrderSummary() {
  const list = document.getElementById('newOrderSummary');
  const totalEl = document.getElementById('newOrderTotal');
  const confirmBtn = document.getElementById('newOrderConfirmBtn');
  const entries = getNewOrderCartEntries();

  if (!list || !totalEl || !confirmBtn) return;

  list.innerHTML =
    entries.length === 0
      ? '<li class="mesa-card__sessions-empty">Sin productos seleccionados</li>'
      : entries
          .map(
            (item) => `
              <li class="mesa-card__session-line">
                <span class="mesa-card__session-label">x${item.qty} ${escapeHtml(item.name)}</span>
                <span class="mesa-card__session-amount">${formatCOP(item.subtotal)}</span>
              </li>
            `
          )
          .join('');

  totalEl.textContent = formatCOP(getNewOrderCartTotal());
  confirmBtn.disabled = entries.length === 0 || newOrderState.submitting;
}

async function openNewOrderModal(mesaId, mesaNum) {
  newOrderState.mesaId = mesaId;
  newOrderState.mesaNum = mesaNum;
  newOrderState.step = 'account';
  newOrderState.selectedSessionId = null;
  newOrderState.selectedSessionNumero = null;
  newOrderState.selectedSessionTipo = null;
  newOrderState.createNewSession = false;
  newOrderState.cart = {};
  newOrderState.products = [];
  newOrderState.categories = [];
  newOrderState.activeCategory = null;
  newOrderState.submitting = false;

  document.getElementById('newOrderMesaNum').textContent = `Mesa ${mesaNum}`;

  const modal = document.getElementById('newOrderModal');
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');

  showNewOrderAccountStep();
  renderNewOrderAccountStep();
}

function closeNewOrderModal() {
  const modal = document.getElementById('newOrderModal');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  newOrderState.mesaId = null;
  newOrderState.mesaNum = null;
  newOrderState.step = 'account';
  newOrderState.selectedSessionId = null;
  newOrderState.selectedSessionNumero = null;
  newOrderState.selectedSessionTipo = null;
  newOrderState.createNewSession = false;
  newOrderState.cart = {};
  newOrderState.products = [];
  newOrderState.categories = [];
  newOrderState.activeCategory = null;
  newOrderState.submitting = false;
}

async function confirmNewOrder() {
  const entries = getNewOrderCartEntries();
  if (
    entries.length === 0 ||
    newOrderState.submitting ||
    !newOrderState.mesaId ||
    newOrderState.step !== 'menu'
  ) {
    return;
  }

  if (!newOrderState.createNewSession && !newOrderState.selectedSessionId) {
    showToast('Seleccioná una cuenta.', 'error');
    return;
  }

  const confirmBtn = document.getElementById('newOrderConfirmBtn');
  newOrderState.submitting = true;
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Enviando…';

  try {
    let session;

    if (newOrderState.createNewSession) {
      session = await createPanelIndividualSession(newOrderState.mesaId);
    } else {
      session = {
        id: newOrderState.selectedSessionId,
        numero: newOrderState.selectedSessionNumero,
        tipo: newOrderState.selectedSessionTipo,
      };
    }

    const total = getNewOrderCartTotal();

    const { data: pedido, error: pedidoError } = await supabaseClient
      .from('pedidos')
      .insert({
        mesa_id: newOrderState.mesaId,
        sesion_id: session.id,
        restaurante_id: RESTAURANTE_ID,
        estado: 'pendiente',
        total,
        archivado: false,
      })
      .select('id')
      .single();

    if (pedidoError) throw pedidoError;

    const items = entries.map((item) => ({
      pedido_id: pedido.id,
      producto_id: item.productId,
      cantidad: item.qty,
      precio_unitario: item.unitPrice,
      subtotal: item.subtotal,
      estado: 'pendiente',
      confirmado_por_mesero: false,
    }));

    const { error: itemsError } = await supabaseClient.from('pedido_items').insert(items);
    if (itemsError) throw itemsError;

    await supabaseClient
      .from('mesas')
      .update({ estado: 'ocupada' })
      .eq('id', newOrderState.mesaId);

    const sessionCode = String(session.numero).padStart(4, '0');
    const mesaNum = newOrderState.mesaNum;
    closeNewOrderModal();
    showToast(`Orden creada · Mesa ${mesaNum} · #${sessionCode}`, 'success');

    await refreshPanelData();
    switchPanel('pedidos');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo crear la orden.', 'error');
  } finally {
    newOrderState.submitting = false;
    if (confirmBtn) {
      confirmBtn.textContent = 'Confirmar orden';
      renderNewOrderSummary();
    }
  }
}

function initNewOrderModal() {
  if (newOrderModalBound) return;

  document.querySelectorAll('[data-close-new-order]').forEach((el) => {
    el.addEventListener('click', closeNewOrderModal);
  });

  document.getElementById('newOrderConfirmBtn')?.addEventListener('click', confirmNewOrder);

  document.getElementById('newOrderAccountList')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-select-session]');
    if (!btn) return;

    if (btn.dataset.selectSession === 'new') {
      selectNewOrderAccount('new');
      return;
    }

    selectNewOrderAccount({
      id: btn.dataset.selectSession,
      numero: btn.dataset.sessionNumero !== '' ? Number(btn.dataset.sessionNumero) : null,
      tipo: btn.dataset.sessionTipo || 'individual',
    });
  });

  document.getElementById('newOrderTabs')?.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-category-id]');
    if (!tab) return;
    setNewOrderActiveCategory(tab.dataset.categoryId);
  });

  document.getElementById('newOrderProducts')?.addEventListener('click', (event) => {
    const addBtn = event.target.closest('[data-add-product]');
    const removeBtn = event.target.closest('[data-remove-product]');
    if (addBtn) addToNewOrderCart(addBtn.dataset.addProduct);
    else if (removeBtn && !removeBtn.disabled) removeFromNewOrderCart(removeBtn.dataset.removeProduct);
  });

  newOrderModalBound = true;
}

function subscribeToRealtime() {
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  const tables = ['pedidos', 'pedido_items', 'mesas', 'productos', 'pagos_grupo'];
  realtimeChannel = supabaseClient.channel('panel-live-sync');
  const sesionesFilter = `restaurante_id=eq.${RESTAURANTE_ID}`;

  tables.forEach((table) => {
    realtimeChannel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, scheduleRealtimeRefresh);
  });

  realtimeChannel
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'sesiones', filter: sesionesFilter },
      onSesionesRealtimeUpdate
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'sesiones', filter: sesionesFilter },
      onSesionesRealtimeUpdate
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'sesiones', filter: sesionesFilter },
      onSesionesRealtimeUpdate
    );

  realtimeChannel.subscribe((status, err) => {
    const live = document.getElementById('liveIndicator');

    if (status === 'SUBSCRIBED') {
      live?.classList.remove('panel-header__live--off');
      console.info('Panel: Realtime conectado');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      live?.classList.add('panel-header__live--off');
      console.error('Panel: Realtime desconectado', status, err);
    }
  });
}

async function init() {
  const restaurant = await window.restaurantReady;
  if (!restaurant) return;

  const slug = RESTAURANTE_SLUG;
  const session = getPanelSession(slug);
  if (!session) {
    redirectToLogin(slug);
    return;
  }

  applyPanelRoleAccess(session.role);
  bindPanelSessionActions(slug);
  loadPanelSoundsPreference();
  updatePanelSoundsToggleUI();
  bindPanelSoundsToggle();
  bindPanelAudioInit();
  initTabs();
  initMesaQrSection();
  initModal();
  initNewOrderModal();
  bindListActions();
  bindMesasActions();

  try {
    await Promise.all([
      fetchOrders(),
      fetchMesas(),
      typeof fetchMenuProducts === 'function' ? fetchMenuProducts() : Promise.resolve(),
    ]);
    restoreActivePanelTab();
    subscribeToRealtime();
    panelAlertsInitialized = true;
    startPanelPolling();
  } catch (error) {
    console.error('Error inicializando panel:', error);
    showToast(error.message || 'Error conectando con Supabase.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
