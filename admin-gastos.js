const GASTOS_CATEGORIAS = ['Herramientas', 'Marketing', 'Transporte', 'Otros'];

const GASTOS_CATEGORIA_CLASS = {
  Herramientas: 'gastos-badge--tools',
  Marketing: 'gastos-badge--marketing',
  Transporte: 'gastos-badge--transport',
  Otros: 'gastos-badge--other',
};

let gastosItems = [];
let gastosMrc = 0;
let gastosSelectedMonth = '';
let gastosLoaded = false;
let gastosLoading = false;
let gastosSubmitting = false;

function gastosAssertClient() {
  if (typeof assertSupabaseClient === 'function') return assertSupabaseClient();
  if (!supabaseClient) throw new Error('Supabase no inicializado.');
  return supabaseClient;
}

function gastosEscape(text) {
  if (typeof escapeHtml === 'function') return escapeHtml(text);
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function gastosFormatMoney(value) {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function gastosFormatDate(dateValue) {
  if (!dateValue) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateValue}T12:00:00`));
}

function gastosFormatMonthLabel(monthValue) {
  if (!monthValue) return '';
  const [year, month] = monthValue.split('-').map(Number);
  if (!year || !month) return monthValue;
  return new Intl.DateTimeFormat('es-CO', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}

function gastosGetCurrentMonthValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function gastosGetMonthBounds(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  const start = `${monthValue}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${monthValue}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function gastosSetLoading(isLoading) {
  gastosLoading = isLoading;
  const loadingEl = document.getElementById('gastosLoading');
  if (loadingEl) loadingEl.hidden = !isLoading;
}

function gastosSetFormError(message) {
  const errorEl = document.getElementById('gastosFormError');
  if (!errorEl) return;
  if (message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

function gastosSetListError(message) {
  const errorEl = document.getElementById('gastosListError');
  if (!errorEl) return;
  if (message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

function gastosSumByCategory(items) {
  return items.reduce((totals, item) => {
    const key = item.categoria || 'Otros';
    totals[key] = (totals[key] || 0) + Number(item.monto);
    return totals;
  }, {});
}

function gastosGetTopCategory(totalsByCategory) {
  let top = { categoria: '—', total: 0 };
  Object.entries(totalsByCategory).forEach(([categoria, total]) => {
    if (total > top.total) top = { categoria, total };
  });
  return top;
}

async function fetchGastosMrc() {
  const client = gastosAssertClient();
  const { data, error } = await client
    .from('locales')
    .select('valor_mensual')
    .eq('estado', 'cliente_activo');

  if (error) throw error;

  gastosMrc = (data || []).reduce((sum, row) => sum + (Number(row.valor_mensual) || 0), 0);
}

async function fetchGastosForMonth(monthValue) {
  const client = gastosAssertClient();
  const { start, end } = gastosGetMonthBounds(monthValue);

  const { data, error } = await client
    .from('gastos_plataforma')
    .select('id, concepto, monto, categoria, fecha, notas, creado_en')
    .gte('fecha', start)
    .lte('fecha', end)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false });

  if (error) throw error;
  gastosItems = data || [];
}

function renderGastosSummary() {
  const totalGastos = gastosItems.reduce((sum, item) => sum + (Number(item.monto) || 0), 0);
  const totalsByCategory = gastosSumByCategory(gastosItems);
  const topCategory = gastosGetTopCategory(totalsByCategory);
  const utilidad = gastosMrc - totalGastos;

  const monthLabel = gastosFormatMonthLabel(gastosSelectedMonth);
  const monthHint = document.getElementById('gastosMonthHint');
  if (monthHint) monthHint.textContent = monthLabel ? `Resumen de ${monthLabel}` : 'Resumen del mes';

  const totalEl = document.getElementById('gastosSummaryTotal');
  const categoryEl = document.getElementById('gastosSummaryTopCategory');
  const categoryMetaEl = document.getElementById('gastosSummaryTopCategoryMeta');
  const mrcEl = document.getElementById('gastosSummaryMrc');
  const utilidadEl = document.getElementById('gastosSummaryUtilidad');

  if (totalEl) totalEl.textContent = gastosFormatMoney(totalGastos);
  if (categoryEl) {
    categoryEl.textContent =
      topCategory.total > 0 ? gastosFormatMoney(topCategory.total) : gastosFormatMoney(0);
  }
  if (categoryMetaEl) {
    categoryMetaEl.textContent =
      topCategory.total > 0 ? `Categoría: ${topCategory.categoria}` : 'Sin gastos registrados';
  }
  if (mrcEl) mrcEl.textContent = gastosFormatMoney(gastosMrc);
  if (utilidadEl) {
    utilidadEl.textContent = gastosFormatMoney(utilidad);
    utilidadEl.classList.toggle('gastos-summary-card__value--negative', utilidad < 0);
    utilidadEl.classList.toggle('gastos-summary-card__value--positive', utilidad >= 0);
  }
}

function renderGastosList() {
  const listEl = document.getElementById('gastosList');
  const emptyEl = document.getElementById('gastosEmpty');
  if (!listEl || !emptyEl) return;

  if (gastosItems.length === 0) {
    listEl.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;
  listEl.innerHTML = gastosItems
    .map((item) => {
      const badgeClass = GASTOS_CATEGORIA_CLASS[item.categoria] || GASTOS_CATEGORIA_CLASS.Otros;
      const notesHtml = item.notas
        ? `<p class="gastos-item__notes">${gastosEscape(item.notas)}</p>`
        : '';

      return `
        <li class="gastos-item">
          <div class="gastos-item__main">
            <div class="gastos-item__head">
              <time class="gastos-item__date" datetime="${gastosEscape(item.fecha)}">${gastosEscape(gastosFormatDate(item.fecha))}</time>
              <span class="gastos-badge ${badgeClass}">${gastosEscape(item.categoria)}</span>
            </div>
            <p class="gastos-item__concept">${gastosEscape(item.concepto)}</p>
            ${notesHtml}
          </div>
          <strong class="gastos-item__amount">${gastosEscape(gastosFormatMoney(item.monto))}</strong>
        </li>
      `;
    })
    .join('');
}

function renderGastosPanel() {
  renderGastosSummary();
  renderGastosList();
}

function resetGastosForm() {
  const conceptInput = document.getElementById('gastosConcepto');
  const amountInput = document.getElementById('gastosMonto');
  const categoryInput = document.getElementById('gastosCategoria');
  const dateInput = document.getElementById('gastosFecha');
  const notesInput = document.getElementById('gastosNotas');

  if (conceptInput) conceptInput.value = '';
  if (amountInput) amountInput.value = '';
  if (categoryInput) categoryInput.value = GASTOS_CATEGORIAS[0];
  if (dateInput) {
    const today = new Date();
    dateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }
  if (notesInput) notesInput.value = '';
  gastosSetFormError('');
}

async function loadGastosData(force = false) {
  if (gastosLoading) return;

  const monthInput = document.getElementById('gastosMonthFilter');
  if (monthInput && !gastosSelectedMonth) {
    gastosSelectedMonth = monthInput.value || gastosGetCurrentMonthValue();
    monthInput.value = gastosSelectedMonth;
  }

  if (gastosLoaded && !force) {
    renderGastosPanel();
    return;
  }

  gastosSetLoading(true);
  gastosSetListError('');

  try {
    await Promise.all([fetchGastosForMonth(gastosSelectedMonth), fetchGastosMrc()]);
    gastosLoaded = true;
    renderGastosPanel();
  } catch (error) {
    console.error(error);
    gastosSetListError(error.message || 'No se pudieron cargar los gastos.');
  } finally {
    gastosSetLoading(false);
  }
}

async function reloadGastosMonth(monthValue) {
  gastosSelectedMonth = monthValue;
  gastosSetLoading(true);
  gastosSetListError('');

  try {
    await Promise.all([fetchGastosForMonth(gastosSelectedMonth), fetchGastosMrc()]);
    renderGastosPanel();
  } catch (error) {
    console.error(error);
    gastosSetListError(error.message || 'No se pudieron cargar los gastos.');
  } finally {
    gastosSetLoading(false);
  }
}

async function submitGasto(event) {
  event.preventDefault();
  if (gastosSubmitting) return;

  const concepto = String(document.getElementById('gastosConcepto')?.value || '').trim();
  const monto = Number(document.getElementById('gastosMonto')?.value);
  const categoria = document.getElementById('gastosCategoria')?.value || GASTOS_CATEGORIAS[0];
  const fecha = document.getElementById('gastosFecha')?.value;
  const notas = String(document.getElementById('gastosNotas')?.value || '').trim();
  const submitBtn = document.getElementById('gastosSubmitBtn');

  if (!concepto) {
    gastosSetFormError('Ingresá un concepto.');
    return;
  }

  if (!Number.isFinite(monto) || monto <= 0) {
    gastosSetFormError('Ingresá un monto válido mayor a 0.');
    return;
  }

  if (!fecha) {
    gastosSetFormError('Seleccioná una fecha.');
    return;
  }

  gastosSetFormError('');
  gastosSubmitting = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registrando…';
  }

  try {
    const client = gastosAssertClient();
    const payload = {
      concepto,
      monto: Math.round(monto),
      categoria,
      fecha,
      notas: notas || null,
    };

    const { data, error } = await client
      .from('gastos_plataforma')
      .insert(payload)
      .select('id, concepto, monto, categoria, fecha, notas, creado_en')
      .single();

    if (error) throw error;

    const expenseMonth = fecha.slice(0, 7);
    if (expenseMonth === gastosSelectedMonth) {
      gastosItems = [data, ...gastosItems];
      renderGastosPanel();
    } else {
      gastosSelectedMonth = expenseMonth;
      const monthInput = document.getElementById('gastosMonthFilter');
      if (monthInput) monthInput.value = expenseMonth;
      await reloadGastosMonth(expenseMonth);
    }

    resetGastosForm();
    showToast('Gasto registrado', 'success');
  } catch (error) {
    console.error(error);
    gastosSetFormError(error.message || 'No se pudo registrar el gasto.');
  } finally {
    gastosSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Registrar gasto';
    }
  }
}

function bindGastosPanel() {
  const form = document.getElementById('gastosForm');
  if (form && !form.dataset.bound) {
    form.dataset.bound = 'true';
    form.addEventListener('submit', submitGasto);
  }

  const monthInput = document.getElementById('gastosMonthFilter');
  if (monthInput && !monthInput.dataset.bound) {
    monthInput.dataset.bound = 'true';
    monthInput.value = gastosGetCurrentMonthValue();
    gastosSelectedMonth = monthInput.value;
    monthInput.addEventListener('change', () => {
      void reloadGastosMonth(monthInput.value || gastosGetCurrentMonthValue());
    });
  }

  const dateInput = document.getElementById('gastosFecha');
  if (dateInput && !dateInput.value) {
    const today = new Date();
    dateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }
}

function initGastosPanel() {
  bindGastosPanel();
}

document.addEventListener('DOMContentLoaded', initGastosPanel);
