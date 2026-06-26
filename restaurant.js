/** Resuelto desde la URL (/:slug, /:slug/panel) o ?slug= en local. */
var RESTAURANTE_ID = null;
var RESTAURANTE_SLUG = null;
var RESTAURANTE = null;

const STATIC_PAGE_NAMES = new Set([
  'index.html',
  'home.html',
  'panel.html',
  'login.html',
  'styles.css',
  'panel.css',
  'config.js',
  'app.js',
  'home.js',
  'panel.js',
  'panel-menu.js',
  'panel-auth.js',
  'panel-summary.js',
  'panel-settings.js',
  'category-order.js',
  'login.js',
  'restaurant.js',
  'sessions.js',
  'pagar.html',
  'pagar.js',
  'admin.html',
  'admin.js',
  'admin.css',
]);

const PAGE_ROUTE_NAMES = new Set([
  'panel',
  'panel.html',
  'login',
  'login.html',
  'home',
  'home.html',
  'index.html',
  'admin',
  'admin.html',
]);

function isStaticAssetName(name) {
  return STATIC_PAGE_NAMES.has(String(name).toLowerCase());
}

function getSlugFromUrl() {
  const fromQuery = new URLSearchParams(window.location.search).get('slug');
  if (fromQuery?.trim()) return fromQuery.trim();

  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  const last = parts[parts.length - 1];
  const lastLower = last.toLowerCase();

  if (PAGE_ROUTE_NAMES.has(lastLower)) {
    if (parts.length >= 2) {
      const slug = parts[parts.length - 2];
      if (slug && !isStaticAssetName(slug)) return slug;
    }
    return null;
  }

  if (isStaticAssetName(lastLower)) return null;

  if (parts.length === 1) return parts[0];

  const slug = parts[0];
  if (slug && !isStaticAssetName(slug)) return slug;

  return null;
}

function setRestaurantGlobals({ id = RESTAURANTE_ID, slug = RESTAURANTE_SLUG, restaurant = RESTAURANTE } = {}) {
  RESTAURANTE_ID = id;
  RESTAURANTE_SLUG = slug;
  RESTAURANTE = restaurant;
  window.RESTAURANTE_ID = id;
  window.RESTAURANTE_SLUG = slug;
  window.RESTAURANTE = restaurant;
}

function showRestaurantError() {
  document.title = 'Restaurante no encontrado';
  document.body.innerHTML = `
    <style>
      .restaurant-error {
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        padding: 2rem;
        background: #0a0a0c;
        color: #f5f5f5;
        font-family: "DM Sans", system-ui, sans-serif;
        text-align: center;
      }
      .restaurant-error__title {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
      }
      .restaurant-error__text {
        margin: 0;
        color: #a1a1aa;
        max-width: 22rem;
      }
    </style>
    <main class="restaurant-error">
      <h1 class="restaurant-error__title">Restaurante no encontrado</h1>
      <p class="restaurant-error__text">Verifica el enlace del QR e intenta de nuevo.</p>
    </main>
  `;
}

function applyRestaurantBrandBlock({ logoEl, titleEl, subtitleEl, restaurant }) {
  if (!restaurant) return;

  const logoUrl = restaurant.logo_url?.trim();
  const name = restaurant.nombre?.trim();

  if (logoUrl && logoEl) {
    logoEl.onerror = () => {
      logoEl.hidden = true;
      logoEl.removeAttribute('src');
      if (titleEl) {
        titleEl.hidden = false;
        if (name) titleEl.textContent = name;
      }
    };
    logoEl.src = logoUrl;
    logoEl.alt = name || 'Restaurante';
    logoEl.hidden = false;
    if (titleEl) titleEl.hidden = true;
  } else {
    if (logoEl) {
      logoEl.hidden = true;
      logoEl.removeAttribute('src');
    }
    if (titleEl) {
      titleEl.hidden = false;
      if (name) titleEl.textContent = name;
    }
  }

  if (subtitleEl) {
    if (restaurant.ciudad?.trim()) {
      subtitleEl.textContent = restaurant.ciudad.trim();
    }
  }
}

function applyRestaurantTheme(restaurant) {
  const primary = restaurant?.color_primario?.trim() || '#FF6B00';
  const bg = restaurant?.color_fondo?.trim() || '#0a0a0c';

  document.documentElement.style.setProperty('--color-primary', primary);
  document.documentElement.style.setProperty('--color-bg', bg);
}

function normalizeCoverPosition(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,3})%?$/);
  if (match) {
    const num = Math.min(100, Math.max(0, parseInt(match[1], 10)));
    return `${num}%`;
  }
  return '50%';
}

function coverPositionToPercent(value) {
  return parseInt(normalizeCoverPosition(value), 10);
}

function applyRestaurantCover(restaurant) {
  const cover = document.getElementById('cartaCover');
  const img = document.getElementById('cartaCoverImg');
  const url = restaurant?.foto_portada?.trim();
  const position = normalizeCoverPosition(restaurant?.foto_portada_posicion);

  if (!cover || !img) return;

  if (url) {
    img.src = url;
    img.alt = restaurant?.nombre ? `Portada de ${restaurant.nombre}` : 'Portada del restaurante';
    img.style.objectPosition = `center ${position}`;
    cover.hidden = false;
  } else {
    img.removeAttribute('src');
    img.alt = '';
    img.style.objectPosition = '';
    cover.hidden = true;
  }
}

function applyRestaurantBranding(restaurant) {
  if (!restaurant?.nombre && !restaurant?.logo_url) return;

  applyRestaurantBrandBlock({
    logoEl: document.getElementById('restaurantBrandLogo'),
    titleEl: document.getElementById('restaurantBrandTitle'),
    subtitleEl: document.getElementById('restaurantBrandSubtitle'),
    restaurant,
  });

  applyRestaurantBrandBlock({
    logoEl: document.getElementById('panelBrandLogo'),
    titleEl: document.getElementById('panelBrandTitle'),
    subtitleEl: document.querySelector('.panel-header__subtitle'),
    restaurant,
  });

  const loginTitle = document.getElementById('panelLoginRestaurantName');
  if (loginTitle && restaurant.nombre) {
    loginTitle.textContent = restaurant.nombre;
  }

  if (document.title.includes('·')) {
    document.title = `${restaurant.nombre || 'Restaurante'} · ${document.title.split('·').slice(1).join('·').trim()}`;
  } else if (restaurant.nombre) {
    document.title = restaurant.nombre;
  }
}

function getAppBasePath() {
  return RESTAURANTE_SLUG ? `/${RESTAURANTE_SLUG}` : '/';
}

function buildAppUrl(hash = '') {
  const params = new URLSearchParams(window.location.search);
  const query = params.toString();
  const base = `${getAppBasePath()}${query ? `?${query}` : ''}`;
  return hash ? `${base}${hash}` : base;
}

function buildHomeUrl() {
  const params = new URLSearchParams(window.location.search);
  const query = params.toString();
  return `${getAppBasePath()}/home${query ? `?${query}` : ''}`;
}

async function initRestaurant() {
  const slug = getSlugFromUrl();
  if (!slug) {
    showRestaurantError();
    return null;
  }

  setRestaurantGlobals({ id: null, slug, restaurant: null });

  const { data, error } = await supabaseClient
    .from('restaurantes')
    .select('id, slug, nombre, ciudad, logo_url, foto_portada, foto_portada_posicion, color_primario, color_fondo, wompi_public_key')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.error('Error buscando restaurante:', error);
    showRestaurantError();
    return null;
  }

  if (!data) {
    showRestaurantError();
    return null;
  }

  setRestaurantGlobals({ id: data.id, slug: data.slug, restaurant: data });
  applyRestaurantTheme(data);
  applyRestaurantBranding(data);
  applyRestaurantCover(data);
  return data;
}

const initialSlug = getSlugFromUrl();
if (initialSlug) {
  setRestaurantGlobals({ id: null, slug: initialSlug, restaurant: null });
}

window.restaurantReady = initRestaurant();
