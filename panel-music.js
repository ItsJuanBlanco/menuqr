let musicQueue = [];
let musicPollTimer = null;
let musicListBound = false;
let musicUpdating = new Set();

const MUSIC_POLL_MS = 5000;
const MUSIC_ESTADO_LABELS = {
  pendiente: 'Pendiente',
  sonando: 'Sonando',
  reproducida: 'Reproducida',
  rechazada: 'Rechazada',
};

function isMusicPanelEnabled() {
  return RESTAURANTE?.musica_habilitada === true;
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

function updateMusicTabBadgeFromQueue() {
  const pending = musicQueue.filter((entry) => entry.estado === 'pendiente').length;
  updatePanelTabBadge(
    'tabMusica',
    pending,
    `${pending} canción${pending !== 1 ? 'es' : ''} pendiente${pending !== 1 ? 's' : ''}`,
    pending > 0 ? 'pendiente' : ''
  );
}

function getMusicCreatedAt(entry) {
  return entry.created || entry.created_at;
}

function renderMusicQueue() {
  const list = document.getElementById('musicQueueList');
  const empty = document.getElementById('musicEmpty');
  if (!list) return;

  if (!musicQueue.length) {
    list.innerHTML = '';
    if (empty) empty.hidden = false;
    updateMusicTabBadgeFromQueue();
    return;
  }

  if (empty) empty.hidden = true;

  list.innerHTML = musicQueue
    .map((entry) => {
      const estado = entry.estado || 'pendiente';
      const isDone = estado === 'reproducida' || estado === 'rechazada';
      const artista = String(entry.artista || '').trim();
      const cancion = escapeHtml(entry.cancion || 'Sin título');
      const busy = musicUpdating.has(entry.id);

      let actions = '';
      if (!isDone) {
        const actionButtons = [];
        if (estado === 'pendiente') {
          actionButtons.push(
            `<button type="button" class="music-card__btn music-card__btn--primary" data-music-action="sonando" data-music-id="${entry.id}"${busy ? ' disabled' : ''}>Marcar sonando</button>`
          );
        }
        if (estado === 'sonando') {
          actionButtons.push(
            `<button type="button" class="music-card__btn music-card__btn--primary" data-music-action="reproducida" data-music-id="${entry.id}"${busy ? ' disabled' : ''}>Marcar reproducida</button>`
          );
        }
        if (estado !== 'rechazada' && estado !== 'reproducida') {
          actionButtons.push(
            `<button type="button" class="music-card__btn music-card__btn--ghost" data-music-action="rechazada" data-music-id="${entry.id}"${busy ? ' disabled' : ''}>Rechazar</button>`
          );
        }
        actions = `<div class="music-card__actions">${actionButtons.join('')}</div>`;
      }

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
    })
    .join('');

  updateMusicTabBadgeFromQueue();
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

function initMusicPanel() {
  bindMusicQueueActions();
}

document.addEventListener('DOMContentLoaded', initMusicPanel);
