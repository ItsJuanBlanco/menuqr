const PANEL_SESSION_KEY_PREFIX = 'menuqr:panelSession:';

function getPanelSessionKey(slug) {
  return `${PANEL_SESSION_KEY_PREFIX}${slug}`;
}

function savePanelSession(slug, role) {
  localStorage.setItem(getPanelSessionKey(slug), JSON.stringify({ slug, role }));
}

function getPanelSession(slug) {
  if (!slug) return null;

  try {
    const raw = localStorage.getItem(getPanelSessionKey(slug));
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (data.slug !== slug) return null;
    if (data.role !== 'mesero' && data.role !== 'admin') return null;

    return data;
  } catch {
    return null;
  }
}

function clearPanelSession(slug) {
  if (slug) localStorage.removeItem(getPanelSessionKey(slug));
}

function buildLoginUrl(slug) {
  const safeSlug = encodeURIComponent(slug);
  return `${LISTOAPP_BASE_URL}/${safeSlug}/login`;
}

function buildPanelUrl(slug) {
  const safeSlug = encodeURIComponent(slug);
  return `${LISTOAPP_BASE_URL}/${safeSlug}/panel`;
}

function getAllowedPanelTabs(role) {
  if (role === 'admin') {
    return new Set(['pedidos', 'mesas', 'historial', 'musica', 'menu', 'resumen', 'meseros', 'qr', 'ajustes']);
  }
  return new Set(['pedidos', 'mesas', 'historial', 'musica']);
}

function redirectToLogin(slug) {
  window.location.replace(buildLoginUrl(slug));
}

function applyPanelRoleAccess(role) {
  const isAdmin = role === 'admin';

  ['menu', 'resumen', 'meseros', 'qr', 'ajustes'].forEach((panelId) => {
    const btn = document.querySelector(`.panel-tabs__btn[data-panel="${panelId}"]`);
    if (btn) btn.hidden = !isAdmin;
  });

  const subtitle = document.querySelector('.panel-header__subtitle');
  if (subtitle) {
    subtitle.textContent = isAdmin ? 'Administrador' : 'Mesero · Cocina';
  }

  window.PANEL_ACCESS_ROLE = role;
  updatePanelSessionActions(role);
}

function updatePanelSessionActions(role) {
  const adminBtn = document.getElementById('panelAdminLoginBtn');
  if (adminBtn) adminBtn.hidden = role === 'admin';
}

function logoutPanel(slug) {
  clearPanelSession(slug);
  redirectToLogin(slug);
}

function setPanelAdminError(message) {
  const errorEl = document.getElementById('panelAdminError');
  if (!errorEl) return;

  if (message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

function openPanelAdminModal() {
  const modal = document.getElementById('panelAdminModal');
  const form = document.getElementById('panelAdminForm');
  const pinInput = document.getElementById('panelAdminPin');

  form?.reset();
  setPanelAdminError('');
  modal?.removeAttribute('hidden');
  modal?.setAttribute('aria-hidden', 'false');
  pinInput?.focus();
}

function closePanelAdminModal() {
  const modal = document.getElementById('panelAdminModal');
  modal?.setAttribute('hidden', '');
  modal?.setAttribute('aria-hidden', 'true');
  setPanelAdminError('');
}

async function verifyAdminPin(slug, pin) {
  const { data, error } = await supabaseClient
    .from('restaurantes')
    .select('pin_admin')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Restaurante no encontrado');

  return pin === data.pin_admin;
}

async function upgradePanelToAdmin(slug, pin) {
  const isValid = await verifyAdminPin(slug, pin);
  if (!isValid) throw new Error('PIN de administrador incorrecto');

  savePanelSession(slug, 'admin');
  applyPanelRoleAccess('admin');

  if (typeof restoreActivePanelTab === 'function') {
    restoreActivePanelTab();
  }
}

function bindPanelSessionActions(slug) {
  const logoutBtn = document.getElementById('panelLogoutBtn');
  const adminBtn = document.getElementById('panelAdminLoginBtn');
  const adminForm = document.getElementById('panelAdminForm');
  const submitBtn = document.getElementById('panelAdminSubmitBtn');
  const modal = document.getElementById('panelAdminModal');

  if (logoutBtn && !logoutBtn.dataset.bound) {
    logoutBtn.dataset.bound = 'true';
    logoutBtn.addEventListener('click', () => logoutPanel(slug));
  }

  if (adminBtn && !adminBtn.dataset.bound) {
    adminBtn.dataset.bound = 'true';
    adminBtn.addEventListener('click', openPanelAdminModal);
  }

  if (modal && !modal.dataset.bound) {
    modal.dataset.bound = 'true';
    modal.querySelectorAll('[data-close-panel-admin]').forEach((el) => {
      el.addEventListener('click', closePanelAdminModal);
    });
  }

  if (adminForm && !adminForm.dataset.bound) {
    adminForm.dataset.bound = 'true';
    adminForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (submitBtn?.disabled) return;

      const pin = document.getElementById('panelAdminPin')?.value?.trim();
      if (!pin) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Verificando…';
      setPanelAdminError('');

      try {
        await upgradePanelToAdmin(slug, pin);
        closePanelAdminModal();
        if (typeof showToast === 'function') {
          showToast('Acceso de administrador activado', 'success');
        }
      } catch (error) {
        console.error(error);
        setPanelAdminError(error.message || 'No se pudo verificar el PIN');
        document.getElementById('panelAdminPin')?.focus();
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Ingresar';
      }
    });
  }
}
