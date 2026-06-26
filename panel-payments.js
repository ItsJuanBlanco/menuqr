let paymentHistoryLoadedForDate = '';
let paymentHistoryLoading = false;

function getColombiaTodayInputValue(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getColombiaDayBoundsFromInput(dateValue) {
  const value = dateValue || getColombiaTodayInputValue();
  const [y, m, d] = value.split('-');
  const start = new Date(`${value}T00:00:00-05:00`);
  const end = new Date(`${value}T23:59:59.999-05:00`);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: `${d}/${m}/${y}`,
    inputValue: value,
  };
}

function formatPaymentDateTime(isoString) {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(isoString));
}

function formatPagoEstado(estado) {
  if (estado === 'aprobado') return 'Aprobado';
  if (estado === 'pendiente') return 'Pendiente';
  if (estado === 'rechazado') return 'Rechazado';
  if (estado === 'confirmado') return 'Confirmado';
  return estado || '—';
}

function getPaymentItemSubtotal(item) {
  if (typeof getItemSubtotal === 'function') return getItemSubtotal(item);
  return Number(item.subtotal ?? Number(item.precio_unitario) * Number(item.cantidad)) || 0;
}

function normalizeWompiPaymentRow(row) {
  const sesion = row.sesiones;
  const mesa = sesion?.mesas;

  return {
    id: `wompi-${row.id}`,
    kind: 'wompi',
    metodo: 'Wompi',
    tipoLabel: '💳 Pago Wompi',
    created_at: row.created_at,
    monto: Number(row.monto) || 0,
    referencia_wompi: row.referencia_wompi || '',
    estado: row.estado || '',
    sesion_numero: sesion?.numero,
    mesa_numero: mesa?.numero,
    countsTowardTotal: row.estado === 'aprobado',
  };
}

function normalizeMeseroPaymentRow(session, monto) {
  return {
    id: `mesero-${session.id}`,
    kind: 'mesero',
    metodo: 'Mesero',
    tipoLabel: '✅ Confirmado por mesero',
    created_at: session.updated_at,
    monto,
    referencia_wompi: '',
    estado: 'confirmado',
    sesion_numero: session.numero,
    mesa_numero: session.mesas?.numero,
    countsTowardTotal: true,
  };
}

async function fetchWompiPaymentHistoryRows(bounds) {
  const { data, error } = await supabaseClient
    .from('pagos_grupo')
    .select(`
      id,
      sesion_id,
      monto,
      referencia_wompi,
      estado,
      created_at,
      sesiones!inner (
        numero,
        restaurante_id,
        mesas ( numero )
      )
    `)
    .eq('sesiones.restaurante_id', RESTAURANTE_ID)
    .gte('created_at', bounds.start)
    .lte('created_at', bounds.end)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeWompiPaymentRow);
}

async function fetchMeseroManualPaymentHistoryRows(bounds) {
  const { data: sessions, error: sessionsError } = await supabaseClient
    .from('sesiones')
    .select(`
      id,
      numero,
      updated_at,
      cargo_servicio,
      propina,
      mesas ( numero )
    `)
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('activa', false)
    .eq('pago_pendiente_confirmacion', false)
    .eq('pago_en_proceso', false)
    .gte('updated_at', bounds.start)
    .lte('updated_at', bounds.end);

  if (sessionsError) throw sessionsError;

  const closedSessions = sessions || [];
  if (closedSessions.length === 0) return [];

  const sessionIds = closedSessions.map((session) => session.id);

  const [{ data: pagosGrupo, error: pagosError }, { data: items, error: itemsError }] = await Promise.all([
    supabaseClient.from('pagos_grupo').select('sesion_id').in('sesion_id', sessionIds),
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
      .in('pedidos.sesion_id', sessionIds),
  ]);

  if (pagosError) throw pagosError;
  if (itemsError) throw itemsError;

  const sessionsWithPagosGrupo = new Set((pagosGrupo || []).map((pago) => pago.sesion_id));
  const manualSessions = closedSessions.filter((session) => !sessionsWithPagosGrupo.has(session.id));

  if (manualSessions.length === 0) return [];

  const itemsBySession = new Map();
  (items || []).forEach((item) => {
    const sesionId = item.pedidos?.sesion_id;
    if (!sesionId) return;
    itemsBySession.set(sesionId, (itemsBySession.get(sesionId) || 0) + getPaymentItemSubtotal(item));
  });

  return manualSessions
    .map((session) => {
      const itemsTotal = itemsBySession.get(session.id) || 0;
      const extras = (Number(session.cargo_servicio) || 0) + (Number(session.propina) || 0);
      const monto = itemsTotal + extras;
      return normalizeMeseroPaymentRow(session, monto);
    })
    .filter((row) => row.monto > 0);
}

async function fetchPaymentHistoryRows(bounds) {
  const [wompiRows, meseroRows] = await Promise.all([
    fetchWompiPaymentHistoryRows(bounds),
    fetchMeseroManualPaymentHistoryRows(bounds),
  ]);

  return [...wompiRows, ...meseroRows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function sumApprovedPayments(rows) {
  return rows.reduce((sum, row) => {
    if (!row.countsTowardTotal) return sum;
    return sum + row.monto;
  }, 0);
}

function renderPaymentHistoryRow(row) {
  const sessionCode =
    row.sesion_numero != null && row.sesion_numero !== ''
      ? `#${formatSessionCode(row.sesion_numero)}`
      : '—';
  const mesaLabel =
    row.mesa_numero != null && row.mesa_numero !== '' ? `Mesa ${escapeHtml(row.mesa_numero)}` : 'Mesa —';
  const referencia = row.referencia_wompi ? escapeHtml(row.referencia_wompi) : '—';
  const isMesero = row.kind === 'mesero';
  const rowKindClass = isMesero ? ' payment-history__row--mesero' : ' payment-history__row--wompi';
  const methodClass = isMesero ? ' payment-history__method--mesero' : ' payment-history__method--wompi';
  const estadoClass = row.estado ? ` payment-history__status--${row.estado}` : '';
  const detailText = isMesero
    ? 'Cierre confirmado en panel'
    : `Ref. Wompi: ${referencia}`;

  return `
    <li class="payment-history__row${rowKindClass}">
      <div class="payment-history__row-header">
        <span class="payment-history__type">${escapeHtml(row.tipoLabel)}</span>
        <span class="payment-history__method${methodClass}">${escapeHtml(row.metodo)}</span>
      </div>
      <div class="payment-history__row-top">
        <time class="payment-history__datetime" datetime="${escapeHtml(row.created_at || '')}">
          ${escapeHtml(formatPaymentDateTime(row.created_at))}
        </time>
        <span class="payment-history__amount">${formatCOP(row.monto)}</span>
      </div>
      <div class="payment-history__row-meta">
        <span>${mesaLabel}</span>
        <span class="payment-history__dot" aria-hidden="true">·</span>
        <span>Cuenta ${sessionCode}</span>
      </div>
      <div class="payment-history__row-detail">
        <span class="payment-history__ref">${detailText}</span>
        <span class="payment-history__status${estadoClass}">${escapeHtml(formatPagoEstado(row.estado))}</span>
      </div>
    </li>
  `;
}

function setPaymentHistoryState({
  loading = false,
  error = '',
  empty = false,
  hasList = false,
  hasFooter = false,
} = {}) {
  const loadingEl = document.getElementById('paymentHistoryLoading');
  const errorEl = document.getElementById('paymentHistoryError');
  const emptyEl = document.getElementById('paymentHistoryEmpty');
  const listEl = document.getElementById('paymentHistoryList');
  const footerEl = document.getElementById('paymentHistoryFooter');

  if (loadingEl) loadingEl.hidden = !loading;
  if (errorEl) {
    errorEl.textContent = error;
    errorEl.hidden = !error;
  }
  if (emptyEl) emptyEl.hidden = !empty;
  if (listEl) listEl.hidden = !hasList;
  if (footerEl) footerEl.hidden = !hasFooter;
}

function renderPaymentHistory(rows, bounds) {
  const listEl = document.getElementById('paymentHistoryList');
  const totalEl = document.getElementById('paymentHistoryTotal');
  const totalLabelEl = document.getElementById('paymentHistoryTotalLabel');
  const hintEl = document.getElementById('paymentHistoryDateHint');
  const isToday = bounds.inputValue === getColombiaTodayInputValue();

  if (hintEl) {
    hintEl.textContent = isToday
      ? `Pagos de hoy · ${bounds.label} (hora Colombia)`
      : `Pagos del ${bounds.label} (hora Colombia)`;
  }

  if (totalLabelEl) {
    totalLabelEl.textContent = isToday ? 'Total cobrado hoy:' : `Total cobrado el ${bounds.label}:`;
  }

  if (totalEl) {
    totalEl.textContent = formatCOP(sumApprovedPayments(rows));
  }

  if (listEl) {
    listEl.innerHTML = rows.map(renderPaymentHistoryRow).join('');
  }
}

async function fetchPaymentHistory(force = false) {
  const dateInput = document.getElementById('paymentHistoryDate');
  const selectedDate = dateInput?.value || getColombiaTodayInputValue();

  if (dateInput && !dateInput.value) {
    dateInput.value = selectedDate;
  }

  if (paymentHistoryLoading) return;
  if (!force && paymentHistoryLoadedForDate === selectedDate) return;

  paymentHistoryLoading = true;
  setPaymentHistoryState({ loading: true, error: '', empty: false, hasList: false, hasFooter: false });

  try {
    const bounds = getColombiaDayBoundsFromInput(selectedDate);
    const rows = await fetchPaymentHistoryRows(bounds);

    if (rows.length === 0) {
      const totalEl = document.getElementById('paymentHistoryTotal');
      const totalLabelEl = document.getElementById('paymentHistoryTotalLabel');
      const hintEl = document.getElementById('paymentHistoryDateHint');
      const isToday = bounds.inputValue === getColombiaTodayInputValue();

      if (hintEl) {
        hintEl.textContent = isToday
          ? `Pagos de hoy · ${bounds.label} (hora Colombia)`
          : `Pagos del ${bounds.label} (hora Colombia)`;
      }
      if (totalLabelEl) {
        totalLabelEl.textContent = isToday ? 'Total cobrado hoy:' : `Total cobrado el ${bounds.label}:`;
      }
      if (totalEl) totalEl.textContent = formatCOP(0);

      paymentHistoryLoadedForDate = selectedDate;
      setPaymentHistoryState({ loading: false, empty: true, hasList: false, hasFooter: true });
      return;
    }

    renderPaymentHistory(rows, bounds);
    paymentHistoryLoadedForDate = selectedDate;
    setPaymentHistoryState({ loading: false, empty: false, hasList: true, hasFooter: true });
  } catch (error) {
    console.error(error);
    paymentHistoryLoadedForDate = '';
    setPaymentHistoryState({
      loading: false,
      error: error.message || 'No se pudo cargar el historial de pagos.',
    });
  } finally {
    paymentHistoryLoading = false;
  }
}

function bindPaymentHistory() {
  const dateInput = document.getElementById('paymentHistoryDate');

  if (dateInput && !dateInput.dataset.bound) {
    dateInput.dataset.bound = 'true';
    dateInput.value = getColombiaTodayInputValue();
    dateInput.addEventListener('change', () => {
      paymentHistoryLoadedForDate = '';
      fetchPaymentHistory(true);
    });
  }
}

function initPaymentHistoryPanel() {
  bindPaymentHistory();
}

document.addEventListener('DOMContentLoaded', initPaymentHistoryPanel);
