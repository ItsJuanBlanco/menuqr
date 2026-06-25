const PEDIDO_ESTADOS_ACTIVOS = ['pendiente', 'en_preparacion'];

let orders = [];
let updating = new Set();
let listClickBound = false;

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

function normalizeItemEstado(estado) {
  return estado || 'pendiente';
}

function isItemDelivered(item) {
  return item.confirmado_por_mesero === true;
}

function orderHasPendingItems(order) {
  return (order.pedido_items || []).some((item) => !isItemDelivered(item));
}

async function fetchOrders() {
  const { data, error } = await supabaseClient
    .from('pedidos')
    .select(`
      id,
      estado,
      total,
      created_at,
      mesas ( numero ),
      pedido_items (
        id,
        cantidad,
        estado,
        confirmado_por_mesero,
        productos ( nombre )
      )
    `)
    .in('estado', PEDIDO_ESTADOS_ACTIVOS)
    .order('created_at', { ascending: true });

  if (error) throw error;

  orders = (data || []).filter(orderHasPendingItems);
  renderOrders();
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

function renderOrders() {
  const list = document.getElementById('ordersList');
  const empty = document.getElementById('emptyState');
  const countEl = document.getElementById('orderCount');

  countEl.textContent = `${orders.length} pedido${orders.length !== 1 ? 's' : ''}`;
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
          <ul class="order-card__items">${itemsHtml}</ul>
        </article>
      `;
    })
    .join('');
}

function bindListActions() {
  if (listClickBound) return;

  const list = document.getElementById('ordersList');
  list.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn || btn.disabled) return;

    const { action, itemId, pedidoId } = btn.dataset;
    if (action === 'preparacion') {
      markItemEnPreparacion(itemId, pedidoId);
    } else if (action === 'entregado') {
      markItemEntregado(itemId, pedidoId);
    }
  });

  listClickBound = true;
}

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

  if (allDelivered) {
    nuevoEstado = 'confirmado';
  } else if (anyInPrep && order.estado === 'pendiente') {
    nuevoEstado = 'en_preparacion';
  }

  if (nuevoEstado === order.estado) return;

  const { error } = await supabaseClient
    .from('pedidos')
    .update({ estado: nuevoEstado })
    .eq('id', pedidoId);

  if (error) throw error;
  order.estado = nuevoEstado;
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
    await fetchOrders();
  } catch (error) {
    console.error('Error al marcar en preparación:', error);
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
    await fetchOrders();
  } catch (error) {
    console.error('Error al marcar entregado:', error);
    showToast(error.message || 'No se pudo marcar como entregado.', 'error');
    await fetchOrders();
  } finally {
    updating.delete(itemId);
  }
}

function subscribeToRealtime() {
  supabaseClient
    .channel('panel-pedidos')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => fetchOrders())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_items' }, () => fetchOrders())
    .subscribe();
}

async function init() {
  bindListActions();

  try {
    await fetchOrders();
    subscribeToRealtime();
  } catch (error) {
    console.error('Error inicializando panel:', error);
    showToast(error.message || 'Error conectando con Supabase.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
