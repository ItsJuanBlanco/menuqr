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

function isLocalDevHost() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function buildLoginUrl(slug) {
  const safeSlug = encodeURIComponent(slug);
  if (isLocalDevHost()) {
    return `${window.location.origin}/login.html?slug=${safeSlug}`;
  }
  return `${window.location.origin}/${safeSlug}/login`;
}

function buildPanelUrl(slug) {
  const safeSlug = encodeURIComponent(slug);
  if (isLocalDevHost()) {
    return `${window.location.origin}/panel.html?slug=${safeSlug}`;
  }
  return `${window.location.origin}/${safeSlug}/panel`;
}

function getAllowedPanelTabs(role) {
  if (role === 'admin') return new Set(['pedidos', 'mesas', 'menu', 'qr']);
  return new Set(['pedidos', 'mesas']);
}

function redirectToLogin(slug) {
  window.location.replace(buildLoginUrl(slug));
}

function applyPanelRoleAccess(role) {
  const isAdmin = role === 'admin';

  ['menu', 'qr'].forEach((panelId) => {
    const btn = document.querySelector(`.panel-tabs__btn[data-panel="${panelId}"]`);
    if (btn) btn.hidden = !isAdmin;
  });

  const subtitle = document.querySelector('.panel-header__subtitle');
  if (subtitle) {
    subtitle.textContent = isAdmin ? 'Administrador' : 'Mesero · Cocina';
  }

  window.PANEL_ACCESS_ROLE = role;
}
