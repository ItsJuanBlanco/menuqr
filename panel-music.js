let musicQueue = [];
let musicPollTimer = null;
let musicListBound = false;
let musicSubTabsBound = false;
let musicUpdating = new Set();
let musicActiveSubPanel = 'cola';

const MUSIC_POLL_MS = 5000;
const MUSIC_HISTORY_ESTADOS = new Set(['sonando', 'rechazada', 'reproducida']);
const MUSIC_ESTADO_LABELS = {
  pendiente: 'Nuevo',
  sonando: 'En cola',
  reproducida: 'En cola',
  rechazada: 'Rechazada',
};

const MUSIC_PANEL_HINTS = {
  cola: 'Del más antiguo al más reciente. La primera es la próxima.',
  historia: 'Canciones que ya pasaste a cola o rechazaste, de la más reciente a la más antigua.',
};

function isMusicPanelEnabled() {
  return hasRestaurantFeature(RESTAURANTE, 'musica');
}

function getMusicEstadoLabel(estado) {
  return MUSIC_ESTADO_LABELS[estado] || estado || '—';
}

function formatMusicTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function getMusicMesaLabel(entry) {
  const mesa = entry.mesas;
  if (!mesa) return entry.mesa_id ? `Mesa ${entry.mesa_id}` : '—';

  const custom = String(mesa.nombre_personalizado || '').trim();
  if (custom) return `${custom} (M${mesa.numero})`;
  return `Mesa ${mesa.numero}`;
}

function getMusicCreatedAt(entry) {
  return entry.created || entry.created_at;
}

function compareMusicQueueEntries(a, b) {
  const timeA = new Date(getMusicCreatedAt(a) || 0).getTime();
  const timeB = new Date(getMusicCreatedAt(b) || 0).getTime();
  if (timeA !== timeB) return timeA - timeB;
  return String(a.id).localeCompare(String(b.id));
}

function compareMusicHistoryEntries(a, b) {
  return compareMusicQueueEntries(b, a);
}

function sortMusicQueue(entries = []) {
  return [...entries].sort(compareMusicQueueEntries);
}

function sortMusicHistory(entries = []) {
  return [...entries].sort(compareMusicHistoryEntries);
}

function getPendingMusicEntries() {
  return sortMusicQueue(musicQueue.filter((entry) => (entry.estado || 'pendiente') === 'pendiente'));
}

function getHistoryMusicEntries() {
  return sortMusicHistory(musicQueue.filter((entry) => MUSIC_HISTORY_ESTADOS.has(entry.estado || '')));
}

function updateMusicTabBadgeFromQueue() {
  const pending = getPendingMusicEntries().length;
  updatePanelTabBadge(
    'tabMusica',
    pending,
    `${pending} canción${pending !== 1 ? 'es' : ''} pendiente${pending !== 1 ? 's' : ''}`,
    pending > 0 ? 'pendiente' : ''
  );
}

function buildMusicCardActions(entry, busy) {
  if ((entry.estado || 'pendiente') !== 'pendiente') return '';

  const disabled = busy ? ' disabled' : '';

  return `
    <div class="music-card__actions">
      <button type="button" class="music-card__btn music-card__btn--queue" data-music-action="sonando" data-music-id="${entry.id}"${disabled}>
        En cola
      </button>
      <button type="button" class="music-card__btn music-card__btn--reject" data-music-action="rechazada" data-music-id="${entry.id}"${disabled}>
        Rechazar
      </button>
    </div>
  `;
}

function buildMusicCardMarkup(entry, { showActions = false } = {}) {
  const estado = entry.estado || 'pendiente';
  const artista = String(entry.artista || '').trim();
  const cancion = escapeHtml(entry.cancion || 'Sin título');
  const busy = musicUpdating.has(entry.id);
  const actions = showActions ? buildMusicCardActions(entry, busy) : '';
  const artistHtml = artista
    ? escapeHtml(artista)
    : '<span class="music-card__artist-muted">Artista no indicado</span>';

  return `
    <article class="music-card music-card--${estado}" data-music-id="${entry.id}">
      <div class="music-card__head">
        <div>
          <h3 class="music-card__title">${cancion}</h3>
          <p class="music-card__artist">${artistHtml}</p>
        </div>
        <span class="music-card__status">${escapeHtml(getMusicEstadoLabel(estado))}</span>
      </div>
      <div class="music-card__meta">
        <span>${escapeHtml(getMusicMesaLabel(entry))}</span>
        <span>${formatMusicTime(getMusicCreatedAt(entry))}</span>
      </div>
      ${actions}
    </article>
  `;
}

function renderMusicList(listId, emptyId, entries, { showActions = false } = {}) {
  const list = document.getElementById(listId);
  const empty = document.getElementById(emptyId);
  if (!list) return;

  if (!entries.length) {
    list.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;
  list.innerHTML = entries.map((entry) => buildMusicCardMarkup(entry, { showActions })).join('');
}

function renderMusicQueue() {
  renderMusicList('musicQueueList', 'musicEmpty', getPendingMusicEntries(), { showActions: true });
  renderMusicList('musicHistoryList', 'musicHistoryEmpty', getHistoryMusicEntries(), { showActions: false });
  updateMusicTabBadgeFromQueue();
}

function switchMusicSubPanel(panelId) {
  musicActiveSubPanel = panelId;

  document.querySelectorAll('[data-music-panel]').forEach((btn) => {
    const active = btn.dataset.musicPanel === panelId;
    btn.classList.toggle('music-panel__tab--active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  document.querySelectorAll('[data-music-section]').forEach((section) => {
    const active = section.dataset.musicSection === panelId;
    section.hidden = !active;
  });

  const hint = document.getElementById('musicPanelHint');
  if (hint) hint.textContent = MUSIC_PANEL_HINTS[panelId] || MUSIC_PANEL_HINTS.cola;
}

async function loadMusicQueue() {
  if (!isMusicPanelEnabled() || !RESTAURANTE_ID) return;

  const { data, error } = await supabaseClient
    .from('canciones_pedidas')
    .select(`
      id,
      cancion,
      artista,
      estado,
      created,
      mesa_id,
      sesion_id,
      mesas ( numero, nombre_personalizado )
    `)
    .eq('restaurante_id', RESTAURANTE_ID)
    .order('created', { ascending: true })
    .limit(100);

  if (error) throw error;

  musicQueue = data || [];
  renderMusicQueue();
}

async function updateMusicRequestEstado(id, estado) {
  if (!id || musicUpdating.has(id)) return;

  musicUpdating.add(id);
  renderMusicQueue();

  try {
    const { error } = await supabaseClient
      .from('canciones_pedidas')
      .update({ estado })
      .eq('id', id)
      .eq('restaurante_id', RESTAURANTE_ID);

    if (error) throw error;
    await loadMusicQueue();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No se pudo actualizar la canción.', 'error');
  } finally {
    musicUpdating.delete(id);
    renderMusicQueue();
  }
}

function stopMusicPolling() {
  if (musicPollTimer) {
    clearInterval(musicPollTimer);
    musicPollTimer = null;
  }
}

function startMusicPolling() {
  stopMusicPolling();
  if (!isMusicPanelEnabled()) return;

  void loadMusicQueue().catch((error) => console.error(error));
  musicPollTimer = setInterval(() => {
    void loadMusicQueue().catch((error) => console.error(error));
  }, MUSIC_POLL_MS);
}

function applyMusicPanelVisibility() {
  const enabled = isMusicPanelEnabled();
  const tab = document.getElementById('tabMusica');

  if (tab) tab.hidden = !enabled;

  if (!enabled) {
    stopMusicPolling();
    musicQueue = [];
    renderMusicQueue();
    updatePanelTabBadge('tabMusica', 0);

    if (typeof activePanel !== 'undefined' && activePanel === 'musica') {
      switchPanel('pedidos');
    }
    return;
  }

  switchMusicSubPanel(musicActiveSubPanel);
  startMusicPolling();
}

function bindMusicQueueActions() {
  const list = document.getElementById('musicQueueList');
  if (!list || musicListBound) return;
  musicListBound = true;

  list.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-music-action]');
    if (!btn || btn.disabled) return;

    const id = btn.dataset.musicId;
    const action = btn.dataset.musicAction;
    if (!id || !action) return;

    void updateMusicRequestEstado(id, action);
  });
}

function bindMusicSubTabs() {
  const tabs = document.querySelector('.music-panel__tabs');
  if (!tabs || musicSubTabsBound) return;
  musicSubTabsBound = true;

  tabs.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-music-panel]');
    if (!btn) return;
    switchMusicSubPanel(btn.dataset.musicPanel);
  });
}

function initMusicPanel() {
  bindMusicQueueActions();
  bindMusicSubTabs();
  switchMusicSubPanel('cola');
}

document.addEventListener('DOMContentLoaded', initMusicPanel);
