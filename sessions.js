const SESSION_STORAGE_PREFIX = 'menuqr:sesion';

function getSessionStorageKey(mesaId) {
  return `${SESSION_STORAGE_PREFIX}:${RESTAURANTE_ID}:${mesaId}`;
}

function loadStoredSession(mesaId) {
  try {
    const raw = localStorage.getItem(getSessionStorageKey(mesaId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredSession(mesaId, data) {
  localStorage.setItem(getSessionStorageKey(mesaId), JSON.stringify(data));
}

function clearStoredSession(mesaId) {
  localStorage.removeItem(getSessionStorageKey(mesaId));
}

function formatSessionCode(numero) {
  return String(numero).padStart(4, '0');
}

function generateSessionToken() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function getNextSessionNumero(mesaId) {
  const { data, error } = await supabaseClient
    .from('sesiones')
    .select('numero')
    .eq('mesa_id', mesaId)
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.numero ?? 0) + 1;
}

async function fetchActiveSessionByToken(mesaId, sessionToken) {
  const { data, error } = await supabaseClient
    .from('sesiones')
    .select('id, tipo, numero, session_token, activa')
    .eq('mesa_id', mesaId)
    .eq('session_token', sessionToken)
    .eq('activa', true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function fetchActiveSessionById(mesaId, sesionId) {
  const { data, error } = await supabaseClient
    .from('sesiones')
    .select('id, tipo, numero, session_token, activa')
    .eq('id', sesionId)
    .eq('mesa_id', mesaId)
    .eq('activa', true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function tryResumeStoredSession(mesaId) {
  const stored = loadStoredSession(mesaId);
  if (!stored) return null;

  if (stored.sessionToken) {
    const session = await fetchActiveSessionByToken(mesaId, stored.sessionToken);
    if (session) return session;
  }

  if (stored.sesionId) {
    const session = await fetchActiveSessionById(mesaId, stored.sesionId);
    if (session) return session;
  }

  clearStoredSession(mesaId);
  return null;
}

async function createIndividualSession(mesaId) {
  const sessionToken = generateSessionToken();
  const numero = await getNextSessionNumero(mesaId);

  const { data, error } = await supabaseClient
    .from('sesiones')
    .insert({
      mesa_id: mesaId,
      restaurante_id: RESTAURANTE_ID,
      session_token: sessionToken,
      tipo: 'individual',
      numero,
      activa: true,
    })
    .select('id, tipo, numero, session_token')
    .single();

  if (error) throw error;

  saveStoredSession(mesaId, {
    sesionId: data.id,
    sessionToken: data.session_token,
    tipo: data.tipo,
  });

  return data;
}

async function joinOrCreateGroupSession(mesaId) {
  const { data: existing, error: findError } = await supabaseClient
    .from('sesiones')
    .select('id, tipo, numero, session_token')
    .eq('mesa_id', mesaId)
    .eq('tipo', 'grupal')
    .eq('activa', true)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    saveStoredSession(mesaId, { sesionId: existing.id, tipo: existing.tipo });
    return existing;
  }

  const numero = await getNextSessionNumero(mesaId);

  const { data, error } = await supabaseClient
    .from('sesiones')
    .insert({
      mesa_id: mesaId,
      restaurante_id: RESTAURANTE_ID,
      session_token: null,
      tipo: 'grupal',
      numero,
      activa: true,
    })
    .select('id, tipo, numero, session_token')
    .single();

  if (error) throw error;

  saveStoredSession(mesaId, { sesionId: data.id, tipo: data.tipo });
  return data;
}

async function joinSessionByCode(mesaId, codeInput) {
  const digits = String(codeInput).replace(/\D/g, '');
  if (digits.length === 0 || digits.length > 4) {
    throw new Error('Ingresá un código de 4 dígitos.');
  }

  const numero = parseInt(digits, 10);
  if (!Number.isFinite(numero) || numero < 1) {
    throw new Error('Ingresá un código válido.');
  }

  const { data, error } = await supabaseClient
    .from('sesiones')
    .select('id, tipo, numero, session_token')
    .eq('mesa_id', mesaId)
    .eq('numero', numero)
    .eq('activa', true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('No encontramos una cuenta con ese código en esta mesa.');

  saveStoredSession(mesaId, {
    sesionId: data.id,
    sessionToken: data.session_token || null,
    tipo: data.tipo,
  });

  return data;
}

function setSessionGateLoading(isLoading) {
  const loading = document.getElementById('sessionGateLoading');
  const options = document.getElementById('sessionGateOptions');
  if (loading) loading.hidden = !isLoading;
  if (options) options.hidden = isLoading;
}

function setSessionGateError(message) {
  const errorEl = document.getElementById('sessionGateError');
  if (!errorEl) return;
  if (message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

function setJoinPanelVisible(visible) {
  const joinPanel = document.getElementById('sessionJoinForm');
  const joinBtn = document.querySelector('[data-session-mode="join"]');
  if (joinPanel) joinPanel.hidden = !visible;
  joinBtn?.classList.toggle('session-gate__option--active', visible);
  document.querySelectorAll('[data-session-mode]:not([data-session-mode="join"])').forEach((btn) => {
    btn.classList.remove('session-gate__option--active');
  });
  if (visible) document.getElementById('sessionJoinCode')?.focus();
}

function hideSessionGate() {
  document.getElementById('sessionGate')?.setAttribute('hidden', '');
  document.getElementById('mainApp')?.removeAttribute('hidden');
}

function showSessionGate(mesaNumero) {
  const gate = document.getElementById('sessionGate');
  const app = document.getElementById('mainApp');
  const mesaEl = document.getElementById('sessionGateMesa');

  if (mesaEl) mesaEl.textContent = `Mesa ${mesaNumero}`;
  gate?.removeAttribute('hidden');
  app?.setAttribute('hidden', '');
}

function waitForSessionChoice(mesaId) {
  return new Promise((resolve, reject) => {
    const gate = document.getElementById('sessionGate');
    const joinInput = document.getElementById('sessionJoinCode');
    const joinSubmit = document.getElementById('sessionJoinSubmit');
    let busy = false;

    async function finish(action) {
      if (busy) return;
      busy = true;
      setSessionGateError('');
      setSessionGateLoading(true);

      try {
        let session;
        if (action.type === 'individual') {
          session = await createIndividualSession(mesaId);
        } else if (action.type === 'grupal') {
          session = await joinOrCreateGroupSession(mesaId);
        } else if (action.type === 'join') {
          session = await joinSessionByCode(mesaId, action.code);
        }
        cleanup();
        resolve(session);
      } catch (error) {
        console.error(error);
        setSessionGateLoading(false);
        setSessionGateError(error.message || 'No se pudo iniciar la sesión.');
        busy = false;
      }
    }

    function onOptionClick(event) {
      const btn = event.target.closest('[data-session-mode]');
      if (!btn || busy) return;

      const mode = btn.dataset.sessionMode;
      if (mode === 'join') {
        setJoinPanelVisible(true);
        setSessionGateError('');
        return;
      }

      setJoinPanelVisible(false);
      finish({ type: mode });
    }

    function onJoinSubmit(event) {
      event.preventDefault();
      if (busy) return;
      const code = joinInput?.value?.trim();
      if (!code) {
        setSessionGateError('Ingresá el código de 4 dígitos.');
        return;
      }
      finish({ type: 'join', code });
    }

    function cleanup() {
      gate?.removeEventListener('click', onOptionClick);
      joinSubmit?.removeEventListener('click', onJoinSubmit);
      document.getElementById('sessionJoinForm')?.removeEventListener('submit', onJoinSubmit);
    }

    gate?.addEventListener('click', onOptionClick);
    joinSubmit?.addEventListener('click', onJoinSubmit);
    document.getElementById('sessionJoinForm')?.addEventListener('submit', onJoinSubmit);

    setSessionGateLoading(false);
    setJoinPanelVisible(false);
    setSessionGateError('');
    if (joinInput) joinInput.value = '';
  });
}

async function startSessionFlow(mesaId, mesaNumero) {
  setSessionGateLoading(true);
  showSessionGate(mesaNumero);

  const resumed = await tryResumeStoredSession(mesaId);
  if (resumed) {
    hideSessionGate();
    return resumed;
  }

  const session = await waitForSessionChoice(mesaId);
  hideSessionGate();
  return session;
}

function updateSessionBadge(session) {
  const badge = document.getElementById('sessionBadge');
  if (!badge || !session) return;

  const tipoLabel =
    session.tipo === 'grupal' ? 'Grupal' : session.tipo === 'individual' ? 'Propia' : 'Cuenta';
  badge.textContent = `${tipoLabel} · ${formatSessionCode(session.numero)}`;
  badge.hidden = false;
}
