const CRM_PIPELINE = [
  { key: 'prospecto', label: 'Prospecto' },
  { key: 'contactado', label: 'Contactado' },
  { key: 'negociando', label: 'Negociando' },
  { key: 'cliente_activo', label: 'Cliente Activo' },
  { key: 'cliente_inactivo', label: 'Cliente Inactivo' },
  { key: 'descartado', label: 'Descartado' },
];

const CRM_PRIORIDAD_LABELS = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
};

const CRM_BITACORA_LABELS = {
  llamada: 'Llamada',
  visita: 'Visita',
  whatsapp: 'WhatsApp',
  reunion: 'Reunión',
};

const CRM_LOCAL_SELECT =
  'id, nombre, direccion, nombre_contacto, telefono, whatsapp, plan, valor_mensual, estado, referido_por, link_google, anotaciones, creado_en, actualizado_en';

const CRM_ZONAS = [
  { key: 'laureles', label: 'Laureles', patterns: ['laureles', 'estadio'] },
  { key: 'envigado', label: 'Envigado', patterns: ['envigado'] },
  { key: 'poblado', label: 'El Poblado', patterns: ['el poblado', 'poblado'] },
  { key: 'belen', label: 'Belén', patterns: ['belen', 'belén'] },
  { key: 'itagui', label: 'Itagüí', patterns: ['itagui', 'itagüí'] },
  { key: 'sabaneta', label: 'Sabaneta', patterns: ['sabaneta'] },
  { key: 'estrella', label: 'La Estrella', patterns: ['la estrella', 'estrella'] },
  { key: 'bello', label: 'Bello', patterns: ['bello'] },
  { key: 'guayabal', label: 'Guayabal', patterns: ['guayabal'] },
  { key: 'suramericana', label: 'Suramericana', patterns: ['suramericana'] },
  { key: 'buenos-aires', label: 'Buenos Aires', patterns: ['buenos aires'] },
  { key: 'centro', label: 'Centro', patterns: ['la candelaria', 'centro', 'candelaria'] },
  { key: 'robledo', label: 'Robledo', patterns: ['robledo'] },
  { key: 'manrique', label: 'Manrique', patterns: ['manrique'] },
  { key: 'copacabana', label: 'Copacabana', patterns: ['copacabana'] },
];

function crmNormalizeLinkGoogle(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) {
    throw new Error('El link de Google debe empezar con http:// o https://');
  }
  return raw;
}

let crmLocales = [];
let crmUrgentFollowUps = [];
let crmLoaded = false;
let crmLoading = false;
let crmActiveLocalId = null;
let crmActiveTab = 'info';
let crmDragLocalId = null;
let crmActiveZona = 'all';
let crmQuickAddMode = false;

function crmAssertClient() {
  if (typeof assertSupabaseClient === 'function') return assertSupabaseClient();
  if (!supabaseClient) throw new Error('Supabase no inicializado.');
  return supabaseClient;
}

function crmEscape(text) {
  if (typeof escapeHtml === 'function') return escapeHtml(text);
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function crmFormatDateTime(isoString) {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(isoString));
}

function crmFormatMoney(value) {
  const amount = Number(value) || 0;
  if (typeof formatCOP === 'function') return formatCOP(amount);
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
}

function crmNormalizeEstado(estado) {
  const value = String(estado || 'prospecto').toLowerCase();
  return CRM_PIPELINE.some((col) => col.key === value) ? value : 'prospecto';
}

function crmNormalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function crmGetLocalZonaKey(local) {
  const direccion = crmNormalizeSearchText(local?.direccion);
  if (!direccion) return 'sin-zona';

  const matches = CRM_ZONAS.filter((zona) =>
    zona.patterns.some((pattern) => direccion.includes(crmNormalizeSearchText(pattern)))
  );

  if (!matches.length) return 'sin-zona';

  matches.sort(
    (a, b) =>
      Math.max(...b.patterns.map((pattern) => pattern.length)) -
      Math.max(...a.patterns.map((pattern) => pattern.length))
  );

  return matches[0].key;
}

function crmGetLocalZonaLabel(local) {
  const key = crmGetLocalZonaKey(local);
  if (key === 'sin-zona') return '';
  return CRM_ZONAS.find((zona) => zona.key === key)?.label || '';
}

function crmGetFilteredLocales() {
  if (crmActiveZona === 'all') return crmLocales;
  return crmLocales.filter((local) => crmGetLocalZonaKey(local) === crmActiveZona);
}

function renderCrmZonaTabs() {
  const nav = document.getElementById('crmZonaTabs');
  if (!nav) return;

  if (!crmLocales.length) {
    nav.hidden = true;
    nav.innerHTML = '';
    return;
  }

  const counts = { all: crmLocales.length, 'sin-zona': 0 };
  crmLocales.forEach((local) => {
    const key = crmGetLocalZonaKey(local);
    counts[key] = (counts[key] || 0) + 1;
  });

  const tabs = [{ key: 'all', label: 'Todos', count: counts.all }];

  CRM_ZONAS.forEach((zona) => {
    if (counts[zona.key]) {
      tabs.push({ key: zona.key, label: zona.label, count: counts[zona.key] });
    }
  });

  if (counts['sin-zona']) {
    tabs.push({ key: 'sin-zona', label: 'Sin zona', count: counts['sin-zona'] });
  }

  nav.hidden = tabs.length <= 2;
  nav.innerHTML = tabs
    .map(
      (tab) => `
        <button
          type="button"
          class="crm-zona-tabs__btn${crmActiveZona === tab.key ? ' crm-zona-tabs__btn--active' : ''}"
          data-crm-zona="${tab.key}"
          role="tab"
          aria-selected="${crmActiveZona === tab.key ? 'true' : 'false'}"
        >${crmEscape(tab.label)} (${tab.count})</button>
      `
    )
    .join('');
}

function setCrmQuickAddMode(enabled) {
  crmQuickAddMode = enabled;
  const hint = document.getElementById('crmQuickAddHint');
  const btn = document.getElementById('crmInfoSaveBtn');
  if (hint) hint.hidden = !enabled;
  if (btn) btn.textContent = enabled ? 'Guardar prospecto' : 'Guardar cambios';
}

function resetCrmInfoFormForNewProspect() {
  document.getElementById('crmNombre').value = '';
  document.getElementById('crmDireccion').value = '';
  document.getElementById('crmContacto').value = '';
  document.getElementById('crmTelefono').value = '';
  document.getElementById('crmWhatsapp').value = '';
  document.getElementById('crmPlan').value = '';
  document.getElementById('crmValorMensual').value = '';
  document.getElementById('crmEstado').value = 'prospecto';
  populateCrmReferidoSelect('');
  document.getElementById('crmLinkGoogle').value = '';
  document.getElementById('crmAnotaciones').value = '';
  document.getElementById('crmInfoError')?.setAttribute('hidden', '');
}

function clearCrmSecondaryPanels() {
  const requisitos = document.getElementById('crmRequisitosList');
  const bitacora = document.getElementById('crmBitacoraList');
  const followups = document.getElementById('crmFollowupsList');

  if (requisitos) requisitos.innerHTML = '<li class="crm-empty-inline">Sin requisitos pendientes.</li>';
  if (bitacora) bitacora.innerHTML = '<li class="crm-empty-inline">Sin notas registradas.</li>';
  if (followups) followups.innerHTML = '<li class="crm-empty-inline">Sin follow-ups programados.</li>';
}

function openNewProspectModal() {
  crmActiveLocalId = null;
  setCrmQuickAddMode(true);
  switchCrmModalTab('info');

  const modal = document.getElementById('crmLocalModal');
  const title = document.getElementById('crmLocalModalTitle');
  if (title) title.textContent = 'Nuevo prospecto';

  updateCrmReferralLine(null);
  resetCrmInfoFormForNewProspect();
  clearCrmSecondaryPanels();

  modal?.removeAttribute('hidden');
  modal?.setAttribute('aria-hidden', 'false');
  document.getElementById('crmNombre')?.focus();
}

function prepareCrmNextProspect() {
  crmActiveLocalId = null;
  setCrmQuickAddMode(true);
  document.getElementById('crmLocalModalTitle').textContent = 'Nuevo prospecto';
  updateCrmReferralLine(null);
  resetCrmInfoFormForNewProspect();
  clearCrmSecondaryPanels();
  document.getElementById('crmNombre')?.focus();
}

function crmGetLocalById(localId) {
  return crmLocales.find((local) => local.id === localId) || null;
}

function crmGetReferidorName(local) {
  if (!local?.referido_por) return '';
  const referidor = crmGetLocalById(local.referido_por);
  return referidor?.nombre || 'Local referidor';
}

function crmCountUrgentForLocal(localId) {
  return crmUrgentFollowUps.filter((row) => row.local_id === localId).length;
}

function setCrmError(message) {
  const el = document.getElementById('crmError');
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.hidden = false;
  } else {
    el.textContent = '';
    el.hidden = true;
  }
}

function setCrmLoading(loading) {
  crmLoading = loading;
  const el = document.getElementById('crmLoading');
  const kanban = document.getElementById('crmKanban');
  if (el) el.hidden = !loading;
  if (kanban && loading) kanban.hidden = true;
}

function populateCrmEstadoSelects() {
  const selects = [document.getElementById('crmEstado')];
  selects.forEach((select) => {
    if (!select) return;
    select.innerHTML = CRM_PIPELINE.map(
      (col) => `<option value="${col.key}">${crmEscape(col.label)}</option>`
    ).join('');
  });
}

function populateCrmReferidoSelect(selectedId = '') {
  const select = document.getElementById('crmReferidoPor');
  if (!select) return;

  const options = crmLocales
    .filter((local) => local.id !== crmActiveLocalId)
    .map(
      (local) =>
        `<option value="${local.id}"${local.id === selectedId ? ' selected' : ''}>${crmEscape(local.nombre || 'Sin nombre')}</option>`
    )
    .join('');

  select.innerHTML = `<option value="">— Ninguno —</option>${options}`;
}

function renderCrmUrgentSection() {
  const section = document.getElementById('crmUrgentSection');
  const list = document.getElementById('crmUrgentList');
  const countEl = document.getElementById('crmUrgentCount');
  if (!section || !list) return;

  if (crmUrgentFollowUps.length === 0) {
    section.hidden = true;
    list.innerHTML = '';
    if (countEl) countEl.textContent = '0';
    return;
  }

  section.hidden = false;
  if (countEl) countEl.textContent = String(crmUrgentFollowUps.length);

  list.innerHTML = crmUrgentFollowUps
    .map((row) => {
      const localName =
        row.local_nombre || crmGetLocalById(row.local_id)?.nombre || 'Local sin nombre';
      const fecha = row.fecha_hora || row.fecha_programada || row.creado_en;
      const nota = row.nota || row.descripcion || '';
      const isLate = row.atrasado === true || row.es_atrasado === true;

      return `
        <li class="crm-urgent__item${isLate ? ' crm-urgent__item--late' : ''}">
          <button type="button" class="crm-urgent__btn" data-open-local="${row.local_id}">
            <span class="crm-urgent__local">${crmEscape(localName)}</span>
            <span class="crm-urgent__meta">${crmEscape(crmFormatDateTime(fecha))}${nota ? ` · ${crmEscape(nota)}` : ''}</span>
          </button>
        </li>
      `;
    })
    .join('');
}

function renderCrmKanban() {
  const board = document.getElementById('crmKanban');
  if (!board) return;

  renderCrmZonaTabs();

  const visibleLocales = crmGetFilteredLocales();
  board.hidden = false;
  board.innerHTML = CRM_PIPELINE.map((column) => {
    const cards = visibleLocales.filter((local) => crmNormalizeEstado(local.estado) === column.key);

    return `
      <div class="crm-column" data-estado="${column.key}">
        <header class="crm-column__head">
          <h3 class="crm-column__title">${crmEscape(column.label)}</h3>
          <span class="crm-column__count">${cards.length}</span>
        </header>
        <div class="crm-column__drop" data-drop-estado="${column.key}">
          ${cards.map((local) => renderCrmCard(local)).join('')}
        </div>
      </div>
    `;
  }).join('');

  bindCrmKanbanDragDrop();
}

function renderCrmCard(local) {
  const urgentCount = crmCountUrgentForLocal(local.id);
  const whatsapp = local.whatsapp || local.telefono || '';
  const contacto = local.nombre_contacto || '—';
  const zona = crmGetLocalZonaLabel(local);

  return `
    <article
      class="crm-card"
      draggable="true"
      data-local-id="${local.id}"
      data-estado="${crmNormalizeEstado(local.estado)}"
    >
      <button type="button" class="crm-card__open" data-open-local="${local.id}">
        <div class="crm-card__top">
          <h4 class="crm-card__name">${crmEscape(local.nombre || 'Sin nombre')}</h4>
          ${urgentCount ? `<span class="crm-card__badge" title="Follow-ups urgentes">${urgentCount}</span>` : ''}
        </div>
        ${zona ? `<p class="crm-card__zone">${crmEscape(zona)}</p>` : ''}
        <p class="crm-card__contact">${crmEscape(contacto)}</p>
        ${whatsapp ? `<p class="crm-card__phone">${crmEscape(whatsapp)}</p>` : ''}
      </button>
    </article>
  `;
}

function bindCrmKanbanDragDrop() {
  document.querySelectorAll('.crm-card[draggable="true"]').forEach((card) => {
    if (card.dataset.dragBound) return;
    card.dataset.dragBound = 'true';

    card.addEventListener('dragstart', (event) => {
      crmDragLocalId = card.dataset.localId;
      card.classList.add('crm-card--dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', crmDragLocalId);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('crm-card--dragging');
      crmDragLocalId = null;
      document.querySelectorAll('.crm-column__drop--over').forEach((zone) => {
        zone.classList.remove('crm-column__drop--over');
      });
    });
  });

  document.querySelectorAll('[data-drop-estado]').forEach((zone) => {
    if (zone.dataset.dropBound) return;
    zone.dataset.dropBound = 'true';

    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      zone.classList.add('crm-column__drop--over');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('crm-column__drop--over');
    });

    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('crm-column__drop--over');
      const localId = event.dataTransfer.getData('text/plain') || crmDragLocalId;
      const newEstado = zone.dataset.dropEstado;
      if (!localId || !newEstado) return;
      void moveCrmLocalToEstado(localId, newEstado);
    });
  });
}

async function moveCrmLocalToEstado(localId, newEstado) {
  const local = crmGetLocalById(localId);
  if (!local || crmNormalizeEstado(local.estado) === newEstado) return;

  const previous = local.estado;
  local.estado = newEstado;
  renderCrmKanban();
  renderCrmUrgentSection();

  try {
    const client = crmAssertClient();
    const { error } = await client.from('locales').update({ estado: newEstado }).eq('id', localId);
    if (error) throw error;
    showToast('Estado actualizado', 'success');
  } catch (error) {
    console.error(error);
    local.estado = previous;
    renderCrmKanban();
    showToast(error.message || 'No se pudo mover la tarjeta.', 'error');
  }
}

async function fetchCrmLocales() {
  const client = crmAssertClient();
  const { data, error } = await client
    .from('locales')
    .select(CRM_LOCAL_SELECT)
    .order('nombre', { ascending: true });

  if (error) throw error;
  crmLocales = data || [];
}

async function fetchCrmUrgentFollowUps() {
  const client = crmAssertClient();
  const { data, error } = await client.from('follow_ups_urgentes').select('*');

  if (error) throw error;
  crmUrgentFollowUps = data || [];
}

async function loadCrmData(force = false) {
  if (crmLoading) return;
  if (crmLoaded && !force) {
    renderCrmUrgentSection();
    renderCrmKanban();
    return;
  }

  setCrmLoading(true);
  setCrmError('');

  try {
    await Promise.all([fetchCrmLocales(), fetchCrmUrgentFollowUps()]);
    populateCrmEstadoSelects();
    crmLoaded = true;
    renderCrmUrgentSection();
    renderCrmKanban();
  } catch (error) {
    console.error(error);
    setCrmError(error.message || 'No se pudo cargar el CRM.');
  } finally {
    setCrmLoading(false);
  }
}

function switchCrmModalTab(tabId) {
  crmActiveTab = tabId;

  document.querySelectorAll('[data-crm-tab]').forEach((btn) => {
    const active = btn.dataset.crmTab === tabId;
    btn.classList.toggle('crm-modal__tab--active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  document.querySelectorAll('[data-crm-panel]').forEach((panel) => {
    const active = panel.dataset.crmPanel === tabId;
    panel.classList.toggle('crm-modal__panel--active', active);
    panel.hidden = !active;
  });
}

function updateCrmReferralLine(local) {
  const line = document.getElementById('crmReferralLine');
  if (!line) return;

  if (!local?.referido_por) {
    line.hidden = true;
    line.innerHTML = '';
    return;
  }

  const referidor = crmGetLocalById(local.referido_por);
  const name = referidor?.nombre || 'otro local';
  line.hidden = false;
  line.innerHTML = `Referido por <button type="button" class="crm-modal__referral-link" data-open-local="${local.referido_por}">${crmEscape(name)}</button>`;
}

function fillCrmInfoForm(local) {
  document.getElementById('crmNombre').value = local.nombre || '';
  document.getElementById('crmDireccion').value = local.direccion || '';
  document.getElementById('crmContacto').value = local.nombre_contacto || '';
  document.getElementById('crmTelefono').value = local.telefono || '';
  document.getElementById('crmWhatsapp').value = local.whatsapp || '';
  document.getElementById('crmPlan').value = local.plan || '';
  document.getElementById('crmValorMensual').value = local.valor_mensual ?? '';
  document.getElementById('crmEstado').value = crmNormalizeEstado(local.estado);
  populateCrmReferidoSelect(local.referido_por || '');
  document.getElementById('crmLinkGoogle').value = local.link_google || '';
  document.getElementById('crmAnotaciones').value = local.anotaciones || '';
}

async function loadCrmRequisitos(localId) {
  const list = document.getElementById('crmRequisitosList');
  if (list) list.innerHTML = '<li class="crm-empty-inline">Cargando…</li>';

  const client = crmAssertClient();
  const { data, error } = await client
    .from('requisitos')
    .select('id, descripcion, completado_en, prioridad, creado_en')
    .eq('local_id', localId)
    .order('completado_en', { ascending: true, nullsFirst: true })
    .order('creado_en', { ascending: false });

  if (error) throw error;

  if (!list) return;

  if (!data?.length) {
    list.innerHTML = '<li class="crm-empty-inline">Sin requisitos pendientes.</li>';
    return;
  }

  list.innerHTML = data
    .map(
      (item) => `
        <li class="crm-checklist__item${item.completado_en ? ' crm-checklist__item--done' : ''}">
          <label class="crm-checklist__label">
            <input type="checkbox" data-toggle-requisito="${item.id}" ${item.completado_en ? 'checked' : ''}>
            <span>${crmEscape(item.descripcion || '—')}</span>
          </label>
          <span class="crm-checklist__prio crm-checklist__prio--${item.prioridad || 'media'}">${crmEscape(CRM_PRIORIDAD_LABELS[item.prioridad] || item.prioridad || 'Media')}</span>
        </li>
      `
    )
    .join('');
}

async function loadCrmBitacora(localId) {
  const list = document.getElementById('crmBitacoraList');
  if (list) list.innerHTML = '<li class="crm-empty-inline">Cargando…</li>';

  const client = crmAssertClient();
  const { data, error } = await client
    .from('bitacora')
    .select('id, tipo, nota, creado_en')
    .eq('local_id', localId)
    .order('creado_en', { ascending: false });

  if (error) throw error;

  if (!list) return;

  if (!data?.length) {
    list.innerHTML = '<li class="crm-empty-inline">Sin notas registradas.</li>';
    return;
  }

  list.innerHTML = data
    .map(
      (entry) => `
        <li class="crm-timeline__item">
          <div class="crm-timeline__meta">
            <span class="crm-timeline__type">${crmEscape(CRM_BITACORA_LABELS[entry.tipo] || entry.tipo || 'Nota')}</span>
            <time datetime="${crmEscape(entry.creado_en || '')}">${crmEscape(crmFormatDateTime(entry.creado_en))}</time>
          </div>
          <p class="crm-timeline__text">${crmEscape(entry.nota || '')}</p>
        </li>
      `
    )
    .join('');
}

async function loadCrmFollowUps(localId) {
  const list = document.getElementById('crmFollowupsList');
  if (list) list.innerHTML = '<li class="crm-empty-inline">Cargando…</li>';

  const client = crmAssertClient();
  const { data, error } = await client
    .from('follow_ups')
    .select('id, fecha_hora, nota, completado, creado_en')
    .eq('local_id', localId)
    .order('completado', { ascending: true })
    .order('fecha_hora', { ascending: true });

  if (error) throw error;

  if (!list) return;

  const pending = (data || []).filter((row) => !row.completado);
  const done = (data || []).filter((row) => row.completado);

  if (!pending.length && !done.length) {
    list.innerHTML = '<li class="crm-empty-inline">Sin follow-ups programados.</li>';
    return;
  }

  const renderRow = (row) => {
    const fecha = row.fecha_hora || row.creado_en;
    return `
      <li class="crm-followups__item${row.completado ? ' crm-followups__item--done' : ''}">
        <div class="crm-followups__body">
          <time class="crm-followups__time">${crmEscape(crmFormatDateTime(fecha))}</time>
          ${row.nota ? `<p class="crm-followups__note">${crmEscape(row.nota)}</p>` : ''}
        </div>
        <div class="crm-followups__actions">
          ${
            row.completado
              ? ''
              : `<button type="button" class="admin-action-btn admin-action-btn--primary" data-done-followup="${row.id}">Hecho</button>
                 <button type="button" class="admin-action-btn" data-reschedule-followup="${row.id}">Reprogramar</button>`
          }
        </div>
      </li>
    `;
  };

  list.innerHTML = [...pending, ...done].map(renderRow).join('');
}

async function openCrmLocalModal(localId, tabId = 'info') {
  const local = crmGetLocalById(localId);
  if (!local) return;

  crmActiveLocalId = localId;
  setCrmQuickAddMode(false);
  switchCrmModalTab(tabId);

  const modal = document.getElementById('crmLocalModal');
  const title = document.getElementById('crmLocalModalTitle');
  if (title) title.textContent = local.nombre || 'Local';
  updateCrmReferralLine(local);
  fillCrmInfoForm(local);

  modal?.removeAttribute('hidden');
  modal?.setAttribute('aria-hidden', 'false');

  try {
    await Promise.all([
      loadCrmRequisitos(localId),
      loadCrmBitacora(localId),
      loadCrmFollowUps(localId),
    ]);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo cargar el detalle.', 'error');
  }
}

function closeCrmLocalModal() {
  const modal = document.getElementById('crmLocalModal');
  modal?.setAttribute('hidden', '');
  modal?.setAttribute('aria-hidden', 'true');
  crmActiveLocalId = null;
  setCrmQuickAddMode(false);
  document.getElementById('crmInfoError')?.setAttribute('hidden', '');
}

async function saveCrmInfoForm(event) {
  event.preventDefault();

  const errorEl = document.getElementById('crmInfoError');
  const btn = document.getElementById('crmInfoSaveBtn');

  let linkGoogle = null;
  try {
    linkGoogle = crmNormalizeLinkGoogle(document.getElementById('crmLinkGoogle')?.value);
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    }
    return;
  }

  const payload = {
    nombre: document.getElementById('crmNombre')?.value?.trim() || 'Sin nombre',
    direccion: document.getElementById('crmDireccion')?.value?.trim() || null,
    nombre_contacto: document.getElementById('crmContacto')?.value?.trim() || null,
    telefono: document.getElementById('crmTelefono')?.value?.trim() || null,
    whatsapp: document.getElementById('crmWhatsapp')?.value?.trim() || null,
    plan: document.getElementById('crmPlan')?.value?.trim() || null,
    valor_mensual: Number(document.getElementById('crmValorMensual')?.value) || null,
    estado: crmNormalizeEstado(document.getElementById('crmEstado')?.value),
    referido_por: document.getElementById('crmReferidoPor')?.value || null,
    link_google: linkGoogle,
    anotaciones: document.getElementById('crmAnotaciones')?.value?.trim() || null,
  };

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Guardando…';
  }
  errorEl?.setAttribute('hidden', '');

  try {
    const client = crmAssertClient();
    let data;

    if (crmActiveLocalId) {
      const { data: updated, error } = await client
        .from('locales')
        .update(payload)
        .eq('id', crmActiveLocalId)
        .select(CRM_LOCAL_SELECT)
        .single();

      if (error) throw error;
      data = updated;
    } else {
      const { data: created, error } = await client
        .from('locales')
        .insert({ ...payload, estado: payload.estado || 'prospecto' })
        .select(CRM_LOCAL_SELECT)
        .single();

      if (error) throw error;
      data = created;
    }

    const index = crmLocales.findIndex((local) => local.id === data.id);
    if (index >= 0) crmLocales[index] = data;
    else crmLocales.unshift(data);

    renderCrmKanban();

    if (crmQuickAddMode) {
      showToast('Prospecto guardado', 'success');
      prepareCrmNextProspect();
      return;
    }

    crmActiveLocalId = data.id;
    document.getElementById('crmLocalModalTitle').textContent = data.nombre || 'Local';
    updateCrmReferralLine(data);
    populateCrmReferidoSelect(data.referido_por || '');
    fillCrmInfoForm(data);
    showToast('Local actualizado', 'success');
  } catch (error) {
    console.error(error);
    if (errorEl) {
      errorEl.textContent = error.message || 'No se pudo guardar.';
      errorEl.hidden = false;
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = crmQuickAddMode ? 'Guardar prospecto' : 'Guardar cambios';
    }
  }
}

async function addCrmRequisito(event) {
  event.preventDefault();
  if (!crmActiveLocalId) return;

  const input = document.getElementById('crmRequisitoInput');
  const prioridad = document.getElementById('crmRequisitoPrioridad')?.value || 'media';
  const descripcion = input?.value?.trim();
  if (!descripcion) return;

  try {
    const client = crmAssertClient();
    const { error } = await client.from('requisitos').insert({
      local_id: crmActiveLocalId,
      descripcion,
      prioridad,
    });
    if (error) throw error;
    input.value = '';
    await loadCrmRequisitos(crmActiveLocalId);
    showToast('Requisito agregado', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo agregar el requisito.', 'error');
  }
}

async function toggleCrmRequisito(requisitoId, checked) {
  try {
    const client = crmAssertClient();
    const { error } = await client
      .from('requisitos')
      .update({ completado_en: checked ? new Date().toISOString() : null })
      .eq('id', requisitoId);
    if (error) throw error;
    if (crmActiveLocalId) await loadCrmRequisitos(crmActiveLocalId);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo actualizar.', 'error');
  }
}

async function addCrmBitacoraEntry(event) {
  event.preventDefault();
  if (!crmActiveLocalId) return;

  const tipo = document.getElementById('crmBitacoraTipo')?.value || 'llamada';
  const nota = document.getElementById('crmBitacoraNota')?.value?.trim();
  if (!nota) return;

  try {
    const client = crmAssertClient();
    const { error } = await client.from('bitacora').insert({
      local_id: crmActiveLocalId,
      tipo,
      nota,
    });
    if (error) throw error;
    document.getElementById('crmBitacoraNota').value = '';
    await loadCrmBitacora(crmActiveLocalId);
    showToast('Nota registrada', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo registrar la nota.', 'error');
  }
}

async function addCrmFollowUp(event) {
  event.preventDefault();
  if (!crmActiveLocalId) return;

  const fechaRaw = document.getElementById('crmFollowupFecha')?.value;
  const nota = document.getElementById('crmFollowupNota')?.value?.trim() || null;
  if (!fechaRaw) return;

  const fecha_hora = new Date(fechaRaw).toISOString();

  try {
    const client = crmAssertClient();
    const { error } = await client.from('follow_ups').insert({
      local_id: crmActiveLocalId,
      fecha_hora,
      nota,
      completado: false,
    });
    if (error) throw error;

    document.getElementById('crmFollowupFecha').value = '';
    document.getElementById('crmFollowupNota').value = '';
    await Promise.all([loadCrmFollowUps(crmActiveLocalId), fetchCrmUrgentFollowUps()]);
    renderCrmUrgentSection();
    renderCrmKanban();
    showToast('Follow-up programado', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo programar el follow-up.', 'error');
  }
}

async function completeCrmFollowUp(followUpId) {
  try {
    const client = crmAssertClient();
    const { error } = await client.from('follow_ups').update({ completado: true }).eq('id', followUpId);
    if (error) throw error;
    if (crmActiveLocalId) await loadCrmFollowUps(crmActiveLocalId);
    await fetchCrmUrgentFollowUps();
    renderCrmUrgentSection();
    renderCrmKanban();
    showToast('Follow-up completado', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo marcar como hecho.', 'error');
  }
}

async function rescheduleCrmFollowUp(followUpId) {
  const value = window.prompt('Nueva fecha y hora (YYYY-MM-DDTHH:mm):');
  if (!value) return;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    showToast('Fecha inválida.', 'error');
    return;
  }

  try {
    const client = crmAssertClient();
    const { error } = await client
      .from('follow_ups')
      .update({ fecha_hora: parsed.toISOString(), completado: false })
      .eq('id', followUpId);
    if (error) throw error;
    if (crmActiveLocalId) await loadCrmFollowUps(crmActiveLocalId);
    await fetchCrmUrgentFollowUps();
    renderCrmUrgentSection();
    renderCrmKanban();
    showToast('Follow-up reprogramado', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo reprogramar.', 'error');
  }
}

function bindCrmPanelActions() {
  document.getElementById('crmNewLocalBtn')?.addEventListener('click', () => {
    openNewProspectModal();
  });

  document.getElementById('crmZonaTabs')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-crm-zona]');
    if (!btn) return;
    crmActiveZona = btn.dataset.crmZona || 'all';
    renderCrmKanban();
  });

  document.getElementById('crmUrgentList')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-open-local]');
    if (!btn) return;
    openCrmLocalModal(btn.dataset.openLocal, 'followups');
  });

  document.getElementById('crmKanban')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-open-local]');
    if (!btn) return;
    openCrmLocalModal(btn.dataset.openLocal);
  });
}

function bindCrmModalActions() {
  const modal = document.getElementById('crmLocalModal');
  modal?.querySelectorAll('[data-close-crm-modal]').forEach((el) => {
    el.addEventListener('click', closeCrmLocalModal);
  });

  document.querySelectorAll('[data-crm-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchCrmModalTab(btn.dataset.crmTab));
  });

  document.getElementById('crmInfoForm')?.addEventListener('submit', saveCrmInfoForm);
  document.getElementById('crmRequisitoForm')?.addEventListener('submit', addCrmRequisito);
  document.getElementById('crmBitacoraForm')?.addEventListener('submit', addCrmBitacoraEntry);
  document.getElementById('crmFollowupForm')?.addEventListener('submit', addCrmFollowUp);

  document.getElementById('crmReferralLine')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-open-local]');
    if (!btn) return;
    openCrmLocalModal(btn.dataset.openLocal);
  });

  document.getElementById('crmRequisitosList')?.addEventListener('change', (event) => {
    const input = event.target.closest('[data-toggle-requisito]');
    if (!input) return;
    void toggleCrmRequisito(input.dataset.toggleRequisito, input.checked);
  });

  document.getElementById('crmFollowupsList')?.addEventListener('click', (event) => {
    const doneBtn = event.target.closest('[data-done-followup]');
    if (doneBtn) {
      void completeCrmFollowUp(doneBtn.dataset.doneFollowup);
      return;
    }
    const rescheduleBtn = event.target.closest('[data-reschedule-followup]');
    if (rescheduleBtn) {
      void rescheduleCrmFollowUp(rescheduleBtn.dataset.rescheduleFollowup);
    }
  });
}

function initAdminCrm() {
  populateCrmEstadoSelects();
  bindCrmPanelActions();
  bindCrmModalActions();
}

document.addEventListener('DOMContentLoaded', initAdminCrm);
