const SESSION_STORAGE_PREFIX = 'menuqr:sesion';
const SPLIT_CODE_LENGTH = 6;
const SPLIT_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateSplitCode() {
  const bytes = new Uint8Array(SPLIT_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < SPLIT_CODE_LENGTH; i++) {
    code += SPLIT_CODE_CHARS[bytes[i] % SPLIT_CODE_CHARS.length];
  }
  return code;
}

function normalizeSplitCode(value) {
  return String(value || '').trim().toUpperCase();
}

function isValidSplitCode(value) {
  return new RegExp(`^[A-Z0-9]{${SPLIT_CODE_LENGTH}}$`).test(normalizeSplitCode(value));
}

async function ensureSessionSplitCode(sesionId) {
  const { data: current, error: readError } = await supabaseClient
    .from('sesiones')
    .select('codigo_split')
    .eq('id', sesionId)
    .maybeSingle();

  if (readError) throw readError;
  if (current?.codigo_split) return current.codigo_split;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateSplitCode();

    const { data: updated, error: updateError } = await supabaseClient
      .from('sesiones')
      .update({ codigo_split: code })
      .eq('id', sesionId)
      .is('codigo_split', null)
      .select('codigo_split')
      .maybeSingle();

    if (updateError) {
      if (updateError.code === '23505') continue;
      throw updateError;
    }

    if (updated?.codigo_split) return updated.codigo_split;

    const { data: refetch, error: refetchError } = await supabaseClient
      .from('sesiones')
      .select('codigo_split')
      .eq('id', sesionId)
      .maybeSingle();

    if (refetchError) throw refetchError;
    if (refetch?.codigo_split) return refetch.codigo_split;
  }

  throw new Error('No se pudo generar el código de división.');
}

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
  return crypto.randomUUID();
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

async function fetchStoredSessionFromDb(mesaId, stored) {
  if (stored.sessionToken) {
    const { data, error } = await supabaseClient
      .from('sesiones')
      .select('id, tipo, numero, session_token, activa')
      .eq('mesa_id', mesaId)
      .eq('session_token', stored.sessionToken)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  if (stored.sesionId) {
    const { data, error } = await supabaseClient
      .from('sesiones')
      .select('id, tipo, numero, session_token, activa')
      .eq('id', stored.sesionId)
      .eq('mesa_id', mesaId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  return null;
}

async function tryResumeStoredSession(mesaId) {
  const stored = loadStoredSession(mesaId);
  if (!stored?.sessionToken && !stored?.sesionId) return null;

  const session = await fetchStoredSessionFromDb(mesaId, stored);

  if (!session || session.activa !== true) {
    clearStoredSession(mesaId);
    return null;
  }

  return session;
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
    saveStoredSession(mesaId, {
      sesionId: existing.id,
      sessionToken: existing.session_token,
      tipo: existing.tipo,
    });
    return existing;
  }

  const sessionToken = generateSessionToken();
  const numero = await getNextSessionNumero(mesaId);

  const { data, error } = await supabaseClient
    .from('sesiones')
    .insert({
      mesa_id: mesaId,
      restaurante_id: RESTAURANTE_ID,
      session_token: sessionToken,
      tipo: 'grupal',
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

async function findActiveSessionByCode(mesaId, codeInput) {
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

  return data;
}

async function joinSessionBySplitCode(mesaId, splitCodeInput) {
  const code = normalizeSplitCode(splitCodeInput);
  if (!isValidSplitCode(code)) {
    throw new Error('Código de división inválido.');
  }

  const { data, error } = await supabaseClient
    .from('sesiones')
    .select('id, tipo, numero, session_token, activa, mesa_id, restaurante_id')
    .eq('codigo_split', code)
    .eq('restaurante_id', RESTAURANTE_ID)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('No encontramos esa cuenta.');
  if (data.activa !== true) throw new Error('Esta cuenta ya fue cerrada.');
  if (data.mesa_id !== mesaId) throw new Error('Esta cuenta no corresponde a esta mesa.');

  saveStoredSession(mesaId, {
    sesionId: data.id,
    sessionToken: data.session_token,
    tipo: data.tipo,
  });

  return data;
}

async function joinSessionByCode(mesaId, codeInput) {
  const data = await findActiveSessionByCode(mesaId, codeInput);

  saveStoredSession(mesaId, {
    sesionId: data.id,
    sessionToken: data.session_token,
    tipo: data.tipo,
  });

  return data;
}

async function switchSessionByCode(mesaId, currentSesionId, codeInput) {
  const destSession = await findActiveSessionByCode(mesaId, codeInput);

  if (destSession.id === currentSesionId) {
    throw new Error('Ya estás en esa cuenta.');
  }

  const { error } = await supabaseClient
    .from('pedidos')
    .update({ sesion_id: destSession.id })
    .eq('sesion_id', currentSesionId)
    .eq('mesa_id', mesaId)
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('archivado', false);

  if (error) throw error;

  let finalSession = destSession;

  if (destSession.tipo === 'individual') {
    const { data, error: tipoError } = await supabaseClient
      .from('sesiones')
      .update({ tipo: 'grupal' })
      .eq('id', destSession.id)
      .select('id, tipo, numero, session_token')
      .single();

    if (tipoError) throw tipoError;
    finalSession = data;
  }

  saveStoredSession(mesaId, {
    sesionId: finalSession.id,
    sessionToken: finalSession.session_token,
    tipo: finalSession.tipo,
  });

  return finalSession;
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

  if (RESTAURANTE) applyRestaurantBranding(RESTAURANTE);
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
    return { session: resumed, fromChoice: false };
  }

  const session = await waitForSessionChoice(mesaId);
  hideSessionGate();
  return { session, fromChoice: true };
}

function formatSessionLabel(session) {
  if (session.tipo === 'grupal') return 'Cuenta Grupal';
  return `Cuenta ${session.numero} (Personal)`;
}

function updateSessionBadge(session) {
  const badge = document.getElementById('sessionBadge');
  if (!badge || !session) return;

  const tipoLabel =
    session.tipo === 'grupal' ? 'Grupal' : session.tipo === 'individual' ? 'Propia' : 'Cuenta';
  badge.textContent = `${tipoLabel} · ${formatSessionCode(session.numero)}`;
  badge.hidden = false;
}
