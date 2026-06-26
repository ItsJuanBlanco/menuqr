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
  return estado || '—';
}

function normalizePaymentHistoryRow(row) {
  const sesion = row.sesiones;
  const mesa = sesion?.mesas;

  return {
    id: row.id,
    created_at: row.created_at,
    monto: Number(row.monto) || 0,
    referencia_wompi: row.referencia_wompi || '',
    estado: row.estado || '',
    sesion_numero: sesion?.numero,
    mesa_numero: mesa?.numero,
  };
}

async function fetchPaymentHistoryRows(bounds) {
  const { data, error } = await supabaseClient
    .from('pagos_grupo')
    .select(`
      id,
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
  return (data || []).map(normalizePaymentHistoryRow);
}

function sumApprovedPayments(rows) {
  return rows.reduce((sum, row) => {
    if (row.estado !== 'aprobado') return sum;
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
  const estadoClass = row.estado ? ` payment-history__status--${row.estado}` : '';

  return `
    <li class="payment-history__row">
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
        <span class="payment-history__ref">Ref. Wompi: ${referencia}</span>
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
