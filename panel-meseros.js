let panelMeseros = [];
let panelMeserosBound = false;

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
  try {
    panelMeseros = await fetchRestaurantMeseros();
    renderMeserosPanelList();
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

  panelMeserosBound = true;
}

function initMeserosPanel() {
  bindMeserosPanel();
}

document.addEventListener('DOMContentLoaded', initMeserosPanel);
