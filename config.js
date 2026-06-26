const SUPABASE_URL = 'https://fnkustudjcbczmmwhypq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gg5uweCqT8f6GbutQF_ePA_lhkC3GZJ';

/** Bucket público de assets de la plataforma (logo Listo, etc.) */
const ASSETS_BUCKET = 'assets';
const LISTO_LOGO_FILENAME = 'Listo_.png';
const LISTO_LOGO_URL = `${SUPABASE_URL}/storage/v1/object/public/${ASSETS_BUCKET}/${LISTO_LOGO_FILENAME}`;

/** Número de mesa por defecto (QR futuro: ?mesa=N) */
const DEFAULT_MESA_NUMERO = 1;

/** Cliente de Supabase (única instancia; el CDN ya expone el global `supabase` como librería) */
if (typeof supabase === 'undefined') {
  console.error('Supabase JS no está cargado. Incluí el CDN antes de config.js');
}

const supabaseClient =
  typeof supabase !== 'undefined'
    ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        realtime: {
          params: { eventsPerSecond: 10 },
        },
      })
    : null;

window.supabaseClient = supabaseClient;
window.LISTO_LOGO_URL = LISTO_LOGO_URL;

function initListoLogos() {
  if (!LISTO_LOGO_URL) return;

  document.querySelectorAll('[data-listo-logo]').forEach((img) => {
    img.src = LISTO_LOGO_URL;
    img.hidden = false;
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initListoLogos);
  } else {
    initListoLogos();
  }
}
