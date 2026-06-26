function showToast(message, type = '', duration = 3200) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast toast--visible' + (type ? ` toast--${type}` : '');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, duration);
}

async function loadMesa() {
  const params = new URLSearchParams(window.location.search);
  const mesaParam = params.get('mesa');
  const mesaRef = mesaParam?.trim()
    ? /^\d+$/.test(mesaParam.trim())
      ? parseInt(mesaParam.trim(), 10)
      : mesaParam.trim()
    : DEFAULT_MESA_NUMERO;

  document.getElementById('tableBadge').textContent = `Mesa ${mesaRef}`;

  const { data, error } = await supabaseClient
    .from('mesas')
    .select('id, numero')
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('numero', mesaRef)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`No se encontró la mesa ${mesaRef}.`);

  return data.id;
}

async function callWaiter(mesaId) {
  const { error } = await supabaseClient
    .from('mesas')
    .update({ mesero_requerido: true })
    .eq('id', mesaId)
    .eq('restaurante_id', RESTAURANTE_ID);

  if (error) throw error;
}

async function init() {
  const restaurant = await window.restaurantReady;
  if (!restaurant) return;

  document.getElementById('linkCarta').href = buildAppUrl();
  document.getElementById('linkCuenta').href = buildAppUrl('#cuenta');

  const btn = document.getElementById('homeCallWaiter');
  const status = document.getElementById('homeStatus');
  let mesaId = null;
  let cooldown = false;

  try {
    mesaId = await loadMesa();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Error conectando con Supabase.', 'error');
  }

  btn.addEventListener('click', async () => {
    if (cooldown || !mesaId) {
      if (!mesaId) showToast('No se pudo identificar la mesa.', 'error');
      return;
    }

    cooldown = true;
    btn.disabled = true;
    status.textContent = 'Enviando solicitud…';

    try {
      await callWaiter(mesaId);
      status.textContent = 'Un mesero está en camino a tu mesa.';
      showToast('Mesero notificado — llegará en unos momentos', 'success');
      btn.innerHTML = '<span class="home__btn-icon" aria-hidden="true">✓</span> Mesero avisado';
    } catch (error) {
      console.error(error);
      status.textContent = '';
      showToast(error.message || 'No se pudo llamar al mesero.', 'error');
      btn.disabled = false;
      cooldown = false;
      return;
    }

    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '<span class="home__btn-icon" aria-hidden="true">🛎️</span> Llamar Mesero';
      status.textContent = '';
      cooldown = false;
    }, 8000);
  });
}

document.addEventListener('DOMContentLoaded', init);
