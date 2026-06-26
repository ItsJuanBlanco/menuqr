let dailySummaryLoaded = false;
let dailySummaryLoading = false;

function getColombiaDayBounds(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const y = get('year');
  const m = get('month');
  const d = get('day');

  const start = new Date(`${y}-${m}-${d}T00:00:00-05:00`);
  const end = new Date(`${y}-${m}-${d}T23:59:59.999-05:00`);

  return { start: start.toISOString(), end: end.toISOString(), label: `${d}/${m}/${y}` };
}

function getItemSubtotal(item) {
  return Number(item.subtotal ?? Number(item.precio_unitario) * Number(item.cantidad)) || 0;
}

function formatPercentChange(today, yesterday) {
  if (today === 0 && yesterday === 0) return 'Sin ventas ayer ni hoy';
  if (yesterday === 0) return '↑ 100% vs ayer';
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct > 0) return `↑ ${pct}% vs ayer`;
  if (pct < 0) return `↓ ${Math.abs(pct)}% vs ayer`;
  return 'Igual que ayer';
}

async function fetchConfirmedItemsForRange(start, end) {
  const { data, error } = await supabaseClient
    .from('pedido_items')
    .select(`
      id,
      cantidad,
      subtotal,
      precio_unitario,
      created_at,
      producto_id,
      productos ( nombre ),
      pedidos!inner ( restaurante_id, mesa_id, sesion_id )
    `)
    .eq('confirmado_por_mesero', true)
    .eq('pedidos.restaurante_id', RESTAURANTE_ID)
    .gte('created_at', start)
    .lte('created_at', end);

  if (error) throw error;
  return data || [];
}

function aggregateSalesMetrics(items) {
  const mesaIds = new Set();
  const productCounts = new Map();
  let total = 0;

  items.forEach((item) => {
    const subtotal = getItemSubtotal(item);
    total += subtotal;

    const mesaId = item.pedidos?.mesa_id;
    if (mesaId) mesaIds.add(mesaId);

    const productKey = item.producto_id || item.productos?.nombre || 'unknown';
    const productName = item.productos?.nombre || 'Producto';
    const existing = productCounts.get(productKey) || { name: productName, qty: 0 };
    existing.qty += Number(item.cantidad) || 0;
    productCounts.set(productKey, existing);
  });

  const mesasAtendidas = mesaIds.size;
  const ticketPromedio = mesasAtendidas > 0 ? Math.round(total / mesasAtendidas) : 0;

  const topProducts = [...productCounts.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  return { total, mesasAtendidas, ticketPromedio, topProducts };
}

async function fetchSessionsForRange(start, end) {
  const { data: opened, error: openedError } = await supabaseClient
    .from('sesiones')
    .select('id, activa, created_at, updated_at, cargo_servicio, propina')
    .eq('restaurante_id', RESTAURANTE_ID)
    .gte('created_at', start)
    .lte('created_at', end);

  if (openedError) throw openedError;

  const { data: closed, error: closedError } = await supabaseClient
    .from('sesiones')
    .select('id, activa, created_at, updated_at, cargo_servicio, propina')
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('activa', false)
    .gte('updated_at', start)
    .lte('updated_at', end);

  if (closedError) throw closedError;

  return { opened: opened || [], closed: closed || [] };
}

async function fetchPaymentBreakdown(closedSessionIds) {
  if (closedSessionIds.length === 0) {
    return { wompi: 0, efectivo: 0 };
  }

  const [{ data: pagos, error: pagosError }, { data: closedItems, error: itemsError }, { data: closedSessions, error: sessionsError }] =
    await Promise.all([
      supabaseClient
        .from('pagos_grupo')
        .select('sesion_id, monto, referencia_wompi')
        .in('sesion_id', closedSessionIds)
        .eq('estado', 'aprobado'),
      supabaseClient
        .from('pedido_items')
        .select(`
          subtotal,
          precio_unitario,
          cantidad,
          pedidos!inner ( sesion_id, restaurante_id )
        `)
        .eq('confirmado_por_mesero', true)
        .eq('pedidos.restaurante_id', RESTAURANTE_ID)
        .in('pedidos.sesion_id', closedSessionIds),
      supabaseClient
        .from('sesiones')
        .select('id, cargo_servicio, propina')
        .in('id', closedSessionIds),
    ]);

  if (pagosError) throw pagosError;
  if (itemsError) throw itemsError;
  if (sessionsError) throw sessionsError;

  const wompiBySession = new Map();
  (pagos || []).forEach((pago) => {
    if (!pago.referencia_wompi) return;
    wompiBySession.set(
      pago.sesion_id,
      (wompiBySession.get(pago.sesion_id) || 0) + Number(pago.monto)
    );
  });

  const itemsBySession = new Map();
  (closedItems || []).forEach((item) => {
    const sesionId = item.pedidos?.sesion_id;
    if (!sesionId) return;
    itemsBySession.set(sesionId, (itemsBySession.get(sesionId) || 0) + getItemSubtotal(item));
  });

  const sessionExtras = new Map(
    (closedSessions || []).map((session) => [
      session.id,
      (Number(session.cargo_servicio) || 0) + (Number(session.propina) || 0),
    ])
  );

  let wompi = 0;
  let efectivo = 0;

  closedSessionIds.forEach((sessionId) => {
    const wompiAmount = wompiBySession.get(sessionId) || 0;
    const itemsTotal = itemsBySession.get(sessionId) || 0;
    const sessionTotal = itemsTotal + (sessionExtras.get(sessionId) || 0);

    wompi += wompiAmount;

    if (wompiAmount <= 0) {
      efectivo += sessionTotal;
    } else if (sessionTotal > wompiAmount) {
      efectivo += sessionTotal - wompiAmount;
    }
  });

  return { wompi, efectivo };
}

async function loadDailySummaryData() {
  const today = getColombiaDayBounds();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = getColombiaDayBounds(yesterdayDate);

  const [todayItems, yesterdayItems, sessionsToday] = await Promise.all([
    fetchConfirmedItemsForRange(today.start, today.end),
    fetchConfirmedItemsForRange(yesterday.start, yesterday.end),
    fetchSessionsForRange(today.start, today.end),
  ]);

  const salesToday = aggregateSalesMetrics(todayItems);
  const salesYesterday = aggregateSalesMetrics(yesterdayItems);

  const closedSessionIds = sessionsToday.closed.map((s) => s.id);
  const payments = await fetchPaymentBreakdown(closedSessionIds);

  return {
    dateLabel: today.label,
    sales: {
      total: salesToday.total,
      comparison: formatPercentChange(salesToday.total, salesYesterday.total),
    },
    mesas: {
      atendidas: salesToday.mesasAtendidas,
      ticketPromedio: salesToday.ticketPromedio,
    },
    topProducts: salesToday.topProducts,
    payments,
    sessions: {
      abiertas: sessionsToday.opened.length,
      cerradas: sessionsToday.closed.length,
    },
  };
}

function renderDailySummary(data) {
  const content = document.getElementById('dailySummaryContent');
  if (!content) return;

  const topProductsHtml =
    data.topProducts.length === 0
      ? '<p class="daily-summary__empty">Sin productos vendidos hoy</p>'
      : `<ol class="daily-summary__ranking">
          ${data.topProducts
            .map(
              (product, index) => `
                <li class="daily-summary__ranking-item">
                  <span class="daily-summary__ranking-pos">${index + 1}</span>
                  <span class="daily-summary__ranking-name">${escapeHtml(product.name)}</span>
                  <span class="daily-summary__ranking-qty">${product.qty} u.</span>
                </li>
              `
            )
            .join('')}
        </ol>`;

  content.innerHTML = `
    <section class="daily-summary__section">
      <h3 class="daily-summary__section-title">Ventas del día</h3>
      <div class="daily-summary__cards daily-summary__cards--hero">
        <article class="daily-summary__card daily-summary__card--highlight">
          <span class="daily-summary__card-label">Total vendido</span>
          <strong class="daily-summary__card-value">${formatCOP(data.sales.total)}</strong>
          <span class="daily-summary__card-meta">${escapeHtml(data.sales.comparison)}</span>
        </article>
      </div>
    </section>

    <section class="daily-summary__section">
      <h3 class="daily-summary__section-title">Mesas</h3>
      <div class="daily-summary__cards">
        <article class="daily-summary__card">
          <span class="daily-summary__card-label">Mesas atendidas</span>
          <strong class="daily-summary__card-value">${data.mesas.atendidas}</strong>
        </article>
        <article class="daily-summary__card">
          <span class="daily-summary__card-label">Ticket promedio</span>
          <strong class="daily-summary__card-value">${formatCOP(data.mesas.ticketPromedio)}</strong>
        </article>
      </div>
    </section>

    <section class="daily-summary__section">
      <h3 class="daily-summary__section-title">Productos más pedidos</h3>
      <div class="daily-summary__panel">
        ${topProductsHtml}
      </div>
    </section>

    <section class="daily-summary__section">
      <h3 class="daily-summary__section-title">Métodos de pago</h3>
      <div class="daily-summary__cards">
        <article class="daily-summary__card">
          <span class="daily-summary__card-label">Wompi</span>
          <strong class="daily-summary__card-value">${formatCOP(data.payments.wompi)}</strong>
          <span class="daily-summary__card-meta">Confirmado por mesero</span>
        </article>
        <article class="daily-summary__card">
          <span class="daily-summary__card-label">Efectivo / datáfono</span>
          <strong class="daily-summary__card-value">${formatCOP(data.payments.efectivo)}</strong>
          <span class="daily-summary__card-meta">Confirmado por mesero</span>
        </article>
      </div>
    </section>

    <section class="daily-summary__section">
      <h3 class="daily-summary__section-title">Sesiones</h3>
      <div class="daily-summary__cards">
        <article class="daily-summary__card">
          <span class="daily-summary__card-label">Cuentas abiertas</span>
          <strong class="daily-summary__card-value">${data.sessions.abiertas}</strong>
        </article>
        <article class="daily-summary__card">
          <span class="daily-summary__card-label">Cuentas cerradas</span>
          <strong class="daily-summary__card-value">${data.sessions.cerradas}</strong>
        </article>
      </div>
    </section>
  `;
}

function setDailySummaryState({ loading = false, error = '', hasContent = false } = {}) {
  const loadingEl = document.getElementById('dailySummaryLoading');
  const errorEl = document.getElementById('dailySummaryError');
  const contentEl = document.getElementById('dailySummaryContent');

  if (loadingEl) loadingEl.hidden = !loading;
  if (errorEl) {
    errorEl.textContent = error;
    errorEl.hidden = !error;
  }
  if (contentEl) contentEl.hidden = !hasContent;
}

async function fetchDailySummary(force = false) {
  if (dailySummaryLoading) return;
  if (dailySummaryLoaded && !force) return;

  dailySummaryLoading = true;
  setDailySummaryState({ loading: true, error: '', hasContent: false });

  try {
    const data = await loadDailySummaryData();
    const dateEl = document.getElementById('dailySummaryDate');
    if (dateEl) dateEl.textContent = `Hoy · ${data.dateLabel} (hora Colombia)`;

    renderDailySummary(data);
    dailySummaryLoaded = true;
    setDailySummaryState({ loading: false, hasContent: true });
  } catch (error) {
    console.error(error);
    dailySummaryLoaded = false;
    setDailySummaryState({
      loading: false,
      error: error.message || 'No se pudo cargar el resumen del día.',
    });
  } finally {
    dailySummaryLoading = false;
  }
}

function bindDailySummary() {
  const refreshBtn = document.getElementById('dailySummaryRefresh');
  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = 'true';
    refreshBtn.addEventListener('click', () => fetchDailySummary(true));
  }
}

function initDailySummaryPanel() {
  bindDailySummary();
}

document.addEventListener('DOMContentLoaded', initDailySummaryPanel);
