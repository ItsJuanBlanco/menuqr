const MESERO_COMMISSIONS_SLUG = 'donde-juanito';

function isMeseroCommissionsEnabled() {
  return RESTAURANTE_SLUG === MESERO_COMMISSIONS_SLUG;
}

let panelMeseros = [];
let panelMeserosBound = false;
let meserosActiveSubPanel = 'equipo';

function getTodayDateInputValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getLocalDayRange(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function applyMeserosCommissionsVisibility() {
  const subTabs = document.getElementById('meserosSubTabs');
  const comisionesSection = document.getElementById('meserosPanelComisiones');
  const enabled = isMeseroCommissionsEnabled();

  if (subTabs) subTabs.hidden = !enabled;
  if (comisionesSection) comisionesSection.hidden = !enabled || meserosActiveSubPanel !== 'comisiones';

  if (!enabled && meserosActiveSubPanel === 'comisiones') {
    switchMeserosSubPanel('equipo');
  }
}

function switchMeserosSubPanel(panelId) {
  meserosActiveSubPanel = panelId;

  document.querySelectorAll('[data-meseros-panel]').forEach((btn) => {
    const active = btn.dataset.meserosPanel === panelId;
    btn.classList.toggle('meseros-panel__tab--active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  document.querySelectorAll('[data-meseros-section]').forEach((section) => {
    const active = section.dataset.meserosSection === panelId;
    section.hidden = !active;
  });

  if (panelId === 'comisiones') {
    void loadMeserosCommissions();
  }
}

async function fetchCommissionPedidosForDate(dateStr) {
  const { start, end } = getLocalDayRange(dateStr);

  const { data, error } = await supabaseClient
    .from('pedidos')
    .select(`
      id,
      mesero_nombre,
      created_at,
      pedido_items (
        id,
        cantidad,
        confirmado_por_mesero,
        producto_id,
        productos ( nombre, precio, precio_mesero )
      )
    `)
    .eq('restaurante_id', RESTAURANTE_ID)
    .gte('created_at', start)
    .lt('created_at', end)
    .not('mesero_nombre', 'is', null);

  if (error) throw error;
  return data || [];
}

function getMeseroCommissionPerUnit(precioCarta, precioMesero) {
  const carta = Number(precioCarta);
  const mesero = Number(precioMesero);
  if (!Number.isFinite(carta) || !Number.isFinite(mesero)) return 0;
  return Math.max(0, mesero - carta);
}

function buildMeserosCommissionReport(pedidos, activeMeseros) {
  const report = new Map();

  activeMeseros.forEach((mesero) => {
    report.set(mesero.nombre, {
      nombre: mesero.nombre,
      itemMap: new Map(),
      total: 0,
    });
  });

  pedidos.forEach((pedido) => {
    const meseroName = String(pedido.mesero_nombre || '').trim();
    if (!meseroName || !report.has(meseroName)) return;

    const meseroReport = report.get(meseroName);

    (pedido.pedido_items || []).forEach((item) => {
      if (item.confirmado_por_mesero !== true) return;

      const precioCarta = Number(item.productos?.precio);
      const precioMesero = Number(item.productos?.precio_mesero);
      const commissionPerUnit = getMeseroCommissionPerUnit(precioCarta, precioMesero);
      if (commissionPerUnit <= 0) return;

      const qty = Number(item.cantidad) || 0;
      if (qty <= 0) return;

      const productName = item.productos?.nombre || 'Producto';
      const key = item.producto_id || productName;
      const lineCommission = commissionPerUnit * qty;

      if (!meseroReport.itemMap.has(key)) {
        meseroReport.itemMap.set(key, { nombre: productName, qty: 0, commission: 0 });
      }

      const entry = meseroReport.itemMap.get(key);
      entry.qty += qty;
      entry.commission += lineCommission;
      meseroReport.total += lineCommission;
    });
  });

  return [...report.values()].map((row) => ({
    nombre: row.nombre,
    total: row.total,
    items: [...row.itemMap.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  }));
}

function renderMeserosCommissions(report, dateStr) {
  const container = document.getElementById('meserosCommissionResults');
  if (!container) return;

  const grandTotal = report.reduce((sum, row) => sum + row.total, 0);
  const formattedDate = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${dateStr}T12:00:00`));

  if (!report.length) {
    container.innerHTML = '<p class="meseros-commissions__empty">No hay meseros activos.</p>';
    return;
  }

  container.innerHTML = `
    <p class="meseros-commissions__day">${escapeHtml(formattedDate)}</p>
    ${report
      .map((mesero) => {
        const itemsHtml =
          mesero.items.length === 0
            ? '<li class="meseros-commissions__item meseros-commissions__item--empty">Sin ventas con comisión este día</li>'
            : mesero.items
                .map(
                  (item) => `
                    <li class="meseros-commissions__item">
                      <span class="meseros-commissions__item-name">${escapeHtml(item.nombre)}</span>
                      <span class="meseros-commissions__item-qty">×${item.qty}</span>
                      <span class="meseros-commissions__item-amount">${formatCOP(item.commission)}</span>
                    </li>
                  `
                )
                .join('');

        return `
          <article class="meseros-commissions__card">
            <header class="meseros-commissions__card-head">
              <h3 class="meseros-commissions__name">${escapeHtml(mesero.nombre)}</h3>
              <p class="meseros-commissions__total">${formatCOP(mesero.total)}</p>
            </header>
            <ul class="meseros-commissions__items">${itemsHtml}</ul>
          </article>
        `;
      })
      .join('')}
    <footer class="meseros-commissions__grand">
      <span class="meseros-commissions__grand-label">Total del día</span>
      <strong class="meseros-commissions__grand-amount">${formatCOP(grandTotal)}</strong>
    </footer>
  `;
}

async function loadMeserosCommissions() {
  if (!isMeseroCommissionsEnabled()) return;

  const dateInput = document.getElementById('meserosCommissionDate');
  const loading = document.getElementById('meserosCommissionLoading');
  const errorEl = document.getElementById('meserosCommissionError');
  const results = document.getElementById('meserosCommissionResults');

  const dateStr = dateInput?.value || getTodayDateInputValue();
  if (dateInput && !dateInput.value) dateInput.value = dateStr;

  if (loading) loading.hidden = false;
  if (errorEl) errorEl.hidden = true;
  if (results) results.innerHTML = '';

  try {
    const activeMeseros = await fetchActiveMeseros();
    const pedidos = await fetchCommissionPedidosForDate(dateStr);
    const report = buildMeserosCommissionReport(pedidos, activeMeseros);
    renderMeserosCommissions(report, dateStr);
  } catch (error) {
    console.error(error);
    if (errorEl) {
      errorEl.textContent = error.message || 'No se pudieron cargar las comisiones.';
      errorEl.hidden = false;
    }
  } finally {
    if (loading) loading.hidden = true;
  }
}

async function fetchRestaurantMeseros() {
  const { data, error } = await supabaseClient
    .from('meseros')
    .select('id, nombre, activo')
    .eq('restaurante_id', RESTAURANTE_ID)
    .order('nombre', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function fetchActiveMeseros() {
  const { data, error } = await supabaseClient
    .from('meseros')
    .select('id, nombre')
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('activo', true)
    .order('nombre', { ascending: true });

  if (error) throw error;
  return data || [];
}

function renderMeserosPanelList() {
  const list = document.getElementById('meserosList');
  const empty = document.getElementById('meserosEmpty');
  if (!list) return;

  if (!panelMeseros.length) {
    list.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;

  list.innerHTML = panelMeseros
    .map((mesero) => {
      const inactive = mesero.activo === false;
      return `
        <li class="settings-meseros__item${inactive ? ' settings-meseros__item--inactive' : ''}">
          <div class="settings-meseros__info">
            <span class="settings-meseros__name">${escapeHtml(mesero.nombre || 'Sin nombre')}</span>
            ${inactive ? '<span class="settings-meseros__badge">Inactivo</span>' : ''}
          </div>
          <div class="settings-meseros__actions">
            <button
              type="button"
              class="settings-meseros__btn"
              data-toggle-mesero="${mesero.id}"
              data-mesero-active="${inactive ? 'true' : 'false'}"
            >${inactive ? 'Activar' : 'Desactivar'}</button>
            <button type="button" class="settings-meseros__btn settings-meseros__btn--danger" data-delete-mesero="${mesero.id}">
              Eliminar
            </button>
          </div>
        </li>
      `;
    })
    .join('');
}

async function loadMeserosPanel() {
  applyMeserosCommissionsVisibility();

  try {
    panelMeseros = await fetchRestaurantMeseros();
    renderMeserosPanelList();

    if (meserosActiveSubPanel === 'comisiones' && isMeseroCommissionsEnabled()) {
      await loadMeserosCommissions();
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudieron cargar los meseros.', 'error');
  }
}

async function addPanelMesero(event) {
  event?.preventDefault?.();

  const input = document.getElementById('meserosNameInput');
  const nombre = input?.value?.trim();
  if (!nombre) {
    showToast('Ingresá el nombre del mesero.', 'error');
    return;
  }

  if (!RESTAURANTE_ID) {
    showToast('Restaurante no cargado. Recargá la página.', 'error');
    return;
  }

  const payload = {
    restaurante_id: RESTAURANTE_ID,
    nombre,
    activo: true,
  };

  console.log('[meseros] insert start', payload);

  try {
    const { data, error } = await supabaseClient.from('meseros').insert(payload).select('id, nombre, activo');

    console.log('[meseros] insert response', { data, error });

    if (error) throw error;

    if (input) input.value = '';
    await loadMeserosPanel();
    showToast('Mesero agregado', 'success');
  } catch (error) {
    console.error('[meseros] insert failed', error);
    showToast(error.message || 'No se pudo agregar el mesero.', 'error');
  }
}

async function togglePanelMesero(meseroId, makeActive) {
  try {
    const { error } = await supabaseClient
      .from('meseros')
      .update({ activo: makeActive })
      .eq('id', meseroId)
      .eq('restaurante_id', RESTAURANTE_ID);

    if (error) throw error;
    await loadMeserosPanel();
    showToast(makeActive ? 'Mesero activado' : 'Mesero desactivado', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo actualizar el mesero.', 'error');
  }
}

async function deletePanelMesero(meseroId) {
  const mesero = panelMeseros.find((entry) => entry.id === meseroId);
  const label = mesero?.nombre || 'este mesero';
  if (!window.confirm(`¿Eliminar a ${label}? Esta acción no se puede deshacer.`)) return;

  try {
    const { error } = await supabaseClient
      .from('meseros')
      .delete()
      .eq('id', meseroId)
      .eq('restaurante_id', RESTAURANTE_ID);

    if (error) throw error;
    await loadMeserosPanel();
    showToast('Mesero eliminado', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo eliminar el mesero.', 'error');
  }
}

function bindMeserosPanel() {
  if (panelMeserosBound) return;

  document.getElementById('meserosAddBtn')?.addEventListener('click', (event) => {
    void addPanelMesero(event);
  });

  document.getElementById('meserosNameInput')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void addPanelMesero(event);
  });

  document.getElementById('meserosList')?.addEventListener('click', (event) => {
    const toggleBtn = event.target.closest('[data-toggle-mesero]');
    if (toggleBtn) {
      void togglePanelMesero(toggleBtn.dataset.toggleMesero, toggleBtn.dataset.meseroActive === 'true');
      return;
    }

    const deleteBtn = event.target.closest('[data-delete-mesero]');
    if (deleteBtn) {
      void deletePanelMesero(deleteBtn.dataset.deleteMesero);
    }
  });

  document.querySelectorAll('[data-meseros-panel]').forEach((btn) => {
    btn.addEventListener('click', () => switchMeserosSubPanel(btn.dataset.meserosPanel));
  });

  document.getElementById('meserosCommissionDate')?.addEventListener('change', () => {
    void loadMeserosCommissions();
  });

  document.getElementById('meserosCommissionRefreshBtn')?.addEventListener('click', () => {
    void loadMeserosCommissions();
  });

  const commissionDate = document.getElementById('meserosCommissionDate');
  if (commissionDate && !commissionDate.value) {
    commissionDate.value = getTodayDateInputValue();
  }

  panelMeserosBound = true;
}

function initMeserosPanel() {
  bindMeserosPanel();
  applyMeserosCommissionsVisibility();
}

document.addEventListener('DOMContentLoaded', initMeserosPanel);
