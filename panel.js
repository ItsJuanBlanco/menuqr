const PEDIDO_ESTADOS_ACTIVOS = ['pendiente', 'en_preparacion'];

let orders = [];
let mesas = [];
let mesaAccounts = {};
let activePanel = 'pedidos';
let updating = new Set();
let listClickBound = false;
let mesasClickBound = false;
let realtimeChannel = null;
let realtimeRefreshTimer = null;

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

function normalizeItemEstado(estado) {
  return estado || 'pendiente';
}

function isItemDelivered(item) {
  return item.confirmado_por_mesero === true;
}

function orderHasPendingItems(order) {
  return (order.pedido_items || []).some((item) => !isItemDelivered(item));
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
  } else {
    el.textContent = `${orders.length} pedido${orders.length !== 1 ? 's' : ''}`;
  }
}

/* ── Tabs ── */
function switchPanel(panelId) {
  activePanel = panelId;

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
      mesas ( numero ),
      pedido_items (
        id,
        cantidad,
        estado,
        confirmado_por_mesero,
        productos ( nombre )
      )
    `)
    .eq('archivado', false)
    .in('estado', PEDIDO_ESTADOS_ACTIVOS)
    .order('created_at', { ascending: true });

  if (error) throw error;

  orders = (data || []).filter(orderHasPendingItems);
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
      const mesaNum = order.mesas?.numero ?? '?';
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
            <span class="order-card__mesa">Mesa ${mesaNum}</span>
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
        .order('numero'),
      supabaseClient
        .from('pedido_items')
        .select(`
          cantidad,
          subtotal,
          precio_unitario,
          confirmado_por_mesero,
          producto_id,
          productos ( nombre ),
          pedidos!inner ( mesa_id, archivado )
        `)
        .eq('confirmado_por_mesero', true)
        .eq('pedidos.archivado', false),
    ]);

  if (mesasError) throw mesasError;
  if (itemsError) throw itemsError;

  mesas = mesasData || [];
  mesaAccounts = {};

  (itemsData || []).forEach((item) => {
    const mesaId = item.pedidos.mesa_id;
    if (!mesaAccounts[mesaId]) mesaAccounts[mesaId] = [];

    mesaAccounts[mesaId].push({
      productoId: item.producto_id,
      name: item.productos?.nombre || 'Producto',
      qty: item.cantidad,
      subtotal: Number(item.subtotal ?? item.precio_unitario * item.cantidad),
    });
  });

  renderMesas();
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
      const grouped = groupDeliveredItems(accountItems);
      const total = grouped.reduce((sum, g) => sum + g.subtotal, 0);
      const estado = mesa.estado || 'libre';
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
          <div class="mesa-card__total">
            <span class="mesa-card__total-label">Total acumulado</span>
            <strong class="mesa-card__total-amount">${formatCOP(total)}</strong>
          </div>
          <div class="mesa-card__actions">
            <button type="button" class="mesa-card__btn mesa-card__btn--view" data-action="ver-cuenta" data-mesa-id="${mesa.id}" data-mesa-num="${mesa.numero}" ${grouped.length === 0 ? 'disabled' : ''}>Ver cuenta</button>
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
    else if (action === 'cerrar-mesa') closeMesa(mesaId, mesaNum);
    else if (action === 'atender-mesero') markWaiterAttended(mesaId);
  });

  mesasClickBound = true;
}

function openAccountModal(mesaId, mesaNum) {
  const items = mesaAccounts[mesaId] || [];
  const grouped = groupDeliveredItems(items);
  const total = grouped.reduce((sum, g) => sum + g.subtotal, 0);

  document.getElementById('modalTitle').textContent = `Cuenta · Mesa ${mesaNum}`;
  document.getElementById('modalTotal').textContent = formatCOP(total);

  const list = document.getElementById('modalInvoice');
  list.innerHTML =
    grouped.length === 0
      ? '<li class="modal__invoice-line"><span>Sin productos entregados</span></li>'
      : grouped
          .map(
            (g) => `
              <li class="modal__invoice-line">
                <span>x${g.qty} ${escapeHtml(g.name)}</span>
                <span>— ${formatCOP(g.subtotal)}</span>
              </li>
            `
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
}

function initModal() {
  document.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', closeAccountModal);
  });
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
      .eq('archivado', false);

    if (pedidosError) throw pedidosError;

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

function subscribeToRealtime() {
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  const tables = ['pedidos', 'pedido_items', 'mesas'];
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
  initTabs();
  initModal();
  bindListActions();
  bindMesasActions();

  try {
    await Promise.all([fetchOrders(), fetchMesas()]);
    renderOrders();
    renderMesas();
    subscribeToRealtime();
  } catch (error) {
    console.error('Error inicializando panel:', error);
    showToast(error.message || 'Error conectando con Supabase.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
