function setPanelLoginError(message) {
  const errorEl = document.getElementById('panelLoginError');
  if (!errorEl) return;

  if (message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

function applyLoginBranding(restaurant) {
  if (!restaurant?.nombre) return;

  const titleEl = document.getElementById('panelLoginRestaurantName');
  if (titleEl) titleEl.textContent = restaurant.nombre;

  document.title = `${restaurant.nombre} · Acceso al panel`;
}

async function verifyRestaurantPin(slug, pin) {
  const { data, error } = await supabaseClient
    .from('restaurantes')
    .select('pin_mesero, pin_admin')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Restaurante no encontrado');

  if (pin === data.pin_admin) return 'admin';
  if (pin === data.pin_mesero) return 'mesero';

  return null;
}

function bindPanelLoginForm(slug) {
  const form = document.getElementById('panelLoginForm');
  const btn = document.getElementById('panelLoginBtn');
  const pinInput = document.getElementById('panelLoginPin');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const pin = pinInput?.value?.trim();
    if (!pin) return;

    btn.disabled = true;
    btn.textContent = 'Verificando…';
    setPanelLoginError('');

    try {
      const role = await verifyRestaurantPin(slug, pin);

      if (!role) {
        setPanelLoginError('PIN incorrecto');
        pinInput?.focus();
        pinInput?.select();
        return;
      }

      savePanelSession(slug, role);
      window.location.replace(buildPanelUrl(slug));
    } catch (error) {
      console.error(error);
      setPanelLoginError(error.message || 'No se pudo verificar el PIN');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    }
  });
}

async function initLogin() {
  const slug = getSlugFromUrl();
  if (!slug) return;

  const existingSession = getPanelSession(slug);
  if (existingSession) {
    window.location.replace(buildPanelUrl(slug));
    return;
  }

  const restaurant = await window.restaurantReady;
  if (!restaurant) return;

  applyLoginBranding(restaurant);
  bindPanelLoginForm(slug);
  document.getElementById('panelLoginPin')?.focus();
}

document.addEventListener('DOMContentLoaded', initLogin);
