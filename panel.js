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
let realtimeChannel = null;
let realtimeRefreshTimer = null;
let dataphoneModalState = null;
let paymentQrModalState = null;
let openMesaQrNumero = null;
let mesaQrAddOpen = false;

const PANEL_SERVICE_PERCENT = 10;

const VALID_PANEL_TABS = new Set(['pedidos', 'mesas', 'menu', 'qr']);
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
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${window.location.origin}/pagar`;
  }
  return 'https://menuqr-virid.vercel.app/pagar';
}

function buildPagarUrl(monto, sesionId, cargoServicio = 0) {
  const params = new URLSearchParams({
    monto: String(monto),
    sesion: sesionId,
  });
  if (cargoServicio > 0) params.set('servicio', String(cargoServicio));
  if (RESTAURANTE_SLUG) params.set('slug', RESTAURANTE_SLUG);
  return `${getPagarBaseUrl()}?${params.toString()}`;
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
  toast.textContent = message;
  toast.className = 'panel-toast panel-toast--visible' + (type ? ` panel-toast--${type}` : '');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('panel-toast--visible'), 2800);
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
  } else {
    el.textContent = `${orders.length} pedido${orders.length !== 1 ? 's' : ''}`;
  }
}

/* ── Tabs ── */
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

  if (panelId === 'pedidos') renderOrders();
  if (panelId === 'mesas') renderMesas();
  if (panelId === 'menu' && typeof fetchMenuProducts === 'function') fetchMenuProducts();
  if (panelId === 'qr') renderMesaQrs();
}

function buildMesaMenuUrl(mesaNumero) {
  const slug = encodeURIComponent(RESTAURANTE_SLUG || '');
  if (window.location.hostname === 'localhost') {
    return `http://localhost:8080/index.html?slug=${slug}&mesa=${mesaNumero}`;
  }
  return `https://menuqr-virid.vercel.app/${slug}?mesa=${mesaNumero}`;
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
  const item = document.querySelector(`[data-mesa-qr="${mesaNumero}"]`);
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

function toggleMesaQrAccordion(mesaNumero) {
  openMesaQrNumero = openMesaQrNumero === mesaNumero ? null : mesaNumero;
  renderMesaQrs();
}

function renderOpenMesaQrCode() {
  if (!openMesaQrNumero) return;
  const container = document.getElementById(`mesaQrCanvas-${openMesaQrNumero}`);
  createMesaQrCode(container, buildMesaMenuUrl(openMesaQrNumero));
}

async function addMesaFromQrTab(rawNumero) {
  const numero = parseInt(String(rawNumero).trim(), 10);
  if (!Number.isFinite(numero) || numero < 1) {
    throw new Error('Ingresá un número de mesa válido.');
  }

  if (mesas.some((mesa) => mesa.numero === numero)) {
    throw new Error(`Ya existe la Mesa ${numero}.`);
  }

  const { data, error } = await supabaseClient
    .from('mesas')
    .insert({
      restaurante_id: RESTAURANTE_ID,
      numero,
      estado: 'libre',
      mesero_requerido: false,
    })
    .select('id, numero, estado, mesero_requerido')
    .single();

  if (error) throw error;

  mesas.push(data);
  mesas.sort((a, b) => a.numero - b.numero);
  mesaQrAddOpen = false;
  openMesaQrNumero = data.numero;
  renderMesas();
  renderMesaQrs();
  showToast(`Mesa ${numero} creada`, 'success');
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
      return `
        <article class="mesa-qr-accordion__item${isOpen ? ' mesa-qr-accordion__item--open' : ''}" data-mesa-qr="${mesa.numero}">
          <button
            type="button"
            class="mesa-qr-accordion__trigger"
            data-toggle-qr="${mesa.numero}"
            aria-expanded="${isOpen}"
          >
            <span class="mesa-qr-accordion__arrow" aria-hidden="true">${isOpen ? '▼' : '▶'}</span>
            Mesa ${mesa.numero}
          </button>
          <div class="mesa-qr-accordion__panel"${isOpen ? '' : ' hidden'}>
            <div class="mesa-qr-accordion__canvas" id="mesaQrCanvas-${mesa.numero}"></div>
            <button type="button" class="mesa-qr-accordion__download" data-download-qr="${mesa.numero}">
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
        toggleMesaQrAccordion(Number(toggleBtn.dataset.toggleQr));
        return;
      }

      const downloadBtn = event.target.closest('[data-download-qr]');
      if (downloadBtn) {
        event.stopPropagation();
        downloadMesaQr(Number(downloadBtn.dataset.downloadQr));
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
  renderOrders();
  updateHeaderCount();
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
              <div class="item-row__info">
                <p class="item-row__name">${item.productos?.nombre || 'Producto'}</p>
                <p class="item-row__qty">× ${item.cantidad}</p>
              </div>
              <div class="item-row__actions">
                ${renderItemBadge(item)}
                ${renderItemButton(item, order.id)}
              </div>
            </li>
          `
        )
        .join('');

      return `
        <article class="order-card" data-pedido-id="${order.id}">
          <header class="order-card__head">
            <span class="order-card__mesa">${escapeHtml(mesaLabel)}</span>
            <div class="order-card__meta">
              <p class="order-card__time">${formatTime(order.created_at)}</p>
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
    >En preparación</button>`;
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
    pendiente: 'Pendiente',
    en_preparacion: 'En preparación',
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
async function fetchMesas() {
  const [{ data: mesasData, error: mesasError }, { data: itemsData, error: itemsError }] =
    await Promise.all([
      supabaseClient
        .from('mesas')
        .select('id, numero, estado, mesero_requerido')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('numero'),
      supabaseClient.rpc('get_mesa_items', { p_restaurante_id: RESTAURANTE_ID }),
    ]);

  if (mesasError) throw mesasError;
  if (itemsError) throw itemsError;

  mesas = mesasData || [];
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

  renderMesas();
  if (activePanel === 'qr') renderMesaQrs();
  updateHeaderCount();
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
  }, 250);
}

function renderMesas() {
  const list = document.getElementById('mesasList');

  if (mesas.length === 0) {
    list.innerHTML = '<p class="panel-empty__text">No hay mesas registradas.</p>';
    return;
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
                      <span class="mesa-card__payment-badge mesa-card__payment-badge--complete">✅ Pago completado</span>
                      <button type="button" class="mesa-card__payment-btn" data-action="confirmar-pago" data-sesion-id="${session.id}" data-mesa-id="${mesa.id}" data-mesa-num="${mesa.numero}">Confirmar</button>
                    </div>`;
                } else if (isPaying) {
                  paymentInfo = `<span class="mesa-card__payment-badge mesa-card__payment-badge--paying">💳 Pagando...</span>`;
                } else if (paidTotal > 0 && sessionTotal > 0) {
                  paymentInfo = `<p class="mesa-card__payment-progress">💳 ${formatCOP(paidTotal)} pagados de ${formatCOP(sessionTotal)}</p>`;
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

      return `
        <article class="mesa-card${mesa.mesero_requerido ? ' mesa-card--calling' : ''}">
          <header class="mesa-card__head">
            <span class="mesa-card__num">Mesa ${mesa.numero}</span>
            <span class="mesa-card__status mesa-card__status--${estado}">${formatMesaEstado(estado)}</span>
          </header>
          ${waiterAlert}
          <div class="mesa-card__body">${sessionsHtml}</div>
          <div class="mesa-card__total">
            <span class="mesa-card__total-label">Total acumulado</span>
            <strong class="mesa-card__total-amount">${formatCOP(total)}</strong>
          </div>
          <div class="mesa-card__actions">
            <button type="button" class="mesa-card__btn mesa-card__btn--new" data-action="nueva-orden" data-mesa-id="${mesa.id}" data-mesa-num="${mesa.numero}">Nueva orden</button>
            <button type="button" class="mesa-card__btn mesa-card__btn--view" data-action="ver-cuenta" data-mesa-id="${mesa.id}" data-mesa-num="${mesa.numero}" ${sessions.length === 0 ? 'disabled' : ''}>Ver cuenta</button>
            <button type="button" class="mesa-card__btn mesa-card__btn--close" data-action="cerrar-mesa" data-mesa-id="${mesa.id}" data-mesa-num="${mesa.numero}">Cerrar mesa</button>
          </div>
        </article>
      `;
    })
    .join('');
}

function bindMesasActions() {
  if (mesasClickBound) return;

  document.getElementById('mesasList').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn || btn.disabled) return;

    const { action, mesaId, mesaNum } = btn.dataset;

    if (action === 'ver-cuenta') openAccountModal(mesaId, mesaNum);
    else if (action === 'nueva-orden') openNewOrderModal(mesaId, mesaNum);
    else if (action === 'cerrar-mesa') closeMesa(mesaId, mesaNum);
    else if (action === 'atender-mesero') markWaiterAttended(mesaId);
    else if (action === 'confirmar-pago') {
      confirmSessionPayment(btn.dataset.sesionId, mesaId, mesaNum);
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

function openAccountModal(mesaId, mesaNum) {
  const sessions = mesaSessionBreakdown[mesaId] || [];
  const sessionItems = mesaSessionItems[mesaId] || {};
  const total = sessions.reduce((sum, session) => sum + session.total, 0);

  document.getElementById('modalTitle').textContent = `Cuenta · Mesa ${mesaNum}`;
  document.getElementById('modalTotal').textContent = formatCOP(total);

  const list = document.getElementById('modalInvoice');
  list.innerHTML =
    sessions.length === 0
      ? '<li class="modal__invoice-line"><span>Sin productos entregados</span></li>'
      : sessions
          .map((session) => {
            const items = sessionItems[session.sesionId] || [];
            const grouped = groupDeliveredItems(items);
            const heading = formatAccountSessionHeading(session);

            return `
              <li class="modal__invoice-group">
                <div class="modal__invoice-group-head modal__invoice-group-head--title">
                  <strong>${escapeHtml(heading)}</strong>
                </div>
                <ul class="modal__invoice-sublist">
                  ${grouped
                    .map(
                      (item) => `
                        <li class="modal__invoice-line modal__invoice-line--nested">
                          <span>x${item.qty} ${escapeHtml(item.name)}</span>
                          <span>— ${formatCOP(item.subtotal)}</span>
                        </li>
                      `
                    )
                    .join('')}
                </ul>
                <div class="modal__invoice-group-head modal__invoice-group-head--subtotal">
                  <span>Subtotal</span>
                  <span>— ${formatCOP(session.total)}</span>
                </div>
                <div class="modal__session-actions">
                  <button
                    type="button"
                    class="modal__session-btn modal__session-btn--dataphone"
                    data-action="cobrar-dataphone"
                    data-sesion-id="${session.id}"
                    data-session-label="${escapeHtml(heading)}"
                    data-session-total="${session.total}"
                    data-mesa-id="${mesaId}"
                    data-mesa-num="${mesaNum}"
                    ${session.total <= 0 ? 'disabled' : ''}
                  >Cobrar con datáfono</button>
                  <button
                    type="button"
                    class="modal__session-btn modal__session-btn--qr"
                    data-action="enviar-qr"
                    data-sesion-id="${session.id}"
                    data-session-label="${escapeHtml(heading)}"
                    data-session-total="${session.total}"
                    ${session.total <= 0 ? 'disabled' : ''}
                  >Enviar QR de pago</button>
                </div>
              </li>
            `;
          })
          .join('');

  const modal = document.getElementById('accountModal');
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

function closeAccountModal() {
  const modal = document.getElementById('accountModal');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
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
  }
}

function initModal() {
  document.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', closeAccountModal);
  });

  document.querySelectorAll('[data-close-dataphone]').forEach((el) => {
    el.addEventListener('click', closeDataphoneModal);
  });

  document.querySelectorAll('[data-close-payment-qr]').forEach((el) => {
    el.addEventListener('click', closePaymentQrModal);
  });

  document.getElementById('modalInvoice')?.addEventListener('click', handleAccountModalAction);

  document.getElementById('dataphoneConfirmBtn')?.addEventListener('click', async () => {
    if (!dataphoneModalState) return;

    const { sesionId, mesaId, mesaNum } = dataphoneModalState;
    const breakdown = getPanelPaymentBreakdown(
      dataphoneModalState.subtotal,
      dataphoneModalState.serviceChargeEnabled
    );
    const btn = document.getElementById('dataphoneConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Confirmando…';

    try {
      await confirmSessionPayment(sesionId, mesaId, mesaNum, 'Cobro confirmado', {
        cargoServicio: breakdown.cargoServicio,
      });
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
  const { cargoServicio = 0 } = options;

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

    showToast(successMessage, 'success');
    await refreshPanelData();
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

async function closeMesa(mesaId, mesaNum) {
  if (updating.has(`close-${mesaId}`)) return;

  const confirmed = window.confirm(
    `¿Cerrar la Mesa ${mesaNum}? Se archivarán los pedidos y la mesa quedará libre.`
  );
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

  const tables = ['pedidos', 'pedido_items', 'mesas', 'productos', 'sesiones', 'pagos_grupo'];
  realtimeChannel = supabaseClient.channel('panel-live-sync');

  tables.forEach((table) => {
    realtimeChannel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, scheduleRealtimeRefresh);
  });

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
  } catch (error) {
    console.error('Error inicializando panel:', error);
    showToast(error.message || 'Error conectando con Supabase.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
