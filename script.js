// ===============================
// TSF: Persistir seller_ref (URL + localStorage)
// ===============================
(function tsfPersistSellerRef() {
  const SITE_ORIGIN = "https://tradingsinfronteras.shop"; // dominio oficial
  const u = new URL(window.location.href);

  // 1) Si viene ref en URL, lo guardamos
  const incoming = (u.searchParams.get("ref") || "").trim().toLowerCase();
  if (incoming) localStorage.setItem("tsf_seller_ref", incoming);

  // 2) Si NO viene ref, pero hay uno guardado, lo reinyectamos en la URL sin recargar
  const stored = (localStorage.getItem("tsf_seller_ref") || "").trim().toLowerCase();
  if (!incoming && stored) {
    u.searchParams.set("ref", stored);
    history.replaceState(null, "", u.pathname + "?" + u.searchParams.toString() + (u.hash || ""));
  }

  // 3) Cuando navegás con hash (#colecciones), aseguramos que ref quede en URL
  window.addEventListener("hashchange", () => {
    const uu = new URL(window.location.href);
    const s = (localStorage.getItem("tsf_seller_ref") || "").trim().toLowerCase();
    if (s && !uu.searchParams.get("ref")) {
      uu.searchParams.set("ref", s);
      history.replaceState(null, "", uu.pathname + "?" + uu.searchParams.toString() + (uu.hash || ""));
    }
  });

  // 4) Parchear links internos para arrastrar ref (cart.html, index.html, etc.)
  function patchLinks() {
    const ref = (localStorage.getItem("tsf_seller_ref") || "").trim().toLowerCase();
    if (!ref) return;

    document.querySelectorAll("a[href]").forEach(a => {
      const href = a.getAttribute("href");
      if (!href) return;

      // ignorar externos y mailto/tel
      if (href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      // Convertimos a URL relativa al sitio
      const target = new URL(href, SITE_ORIGIN + u.pathname);

      // solo si apunta a nuestro sitio (rutas relativas)
      target.searchParams.set("ref", ref);

      // Mantener #hash si existía
      a.setAttribute("href", target.pathname + "?" + target.searchParams.toString() + (target.hash || ""));
    });
  }

  // correr al cargar
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", patchLinks);
  } else {
    patchLinks();
  }
})();

// ===============================
// TSF: Carrito por vendedor (namespace)
// ===============================
function tsfGetActiveSellerRef() {
  const u = new URL(window.location.href);
  return (u.searchParams.get("ref") || localStorage.getItem("tsf_seller_ref") || "sin_ref")
    .trim()
    .toLowerCase();
}

function tsfCartKey() {
  return `tsf_cart:${tsfGetActiveSellerRef()}`;
}

// Helpers para leer/escribir carrito
function tsfLoadCart() {
  try {
    const raw = localStorage.getItem(tsfCartKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function tsfSaveCart(items) {
  localStorage.setItem(tsfCartKey(), JSON.stringify(Array.isArray(items) ? items : []));
}

// Opcional: si hoy tenías un carrito global (ej "tsf_cart"), migrarlo una vez al carrito del seller actual
(function tsfMigrateLegacyCart() {
  const legacyKeys = ["tsf_cart", "tsf_cart_items"]; // ajustá si tenés otros nombres
  for (const k of legacyKeys) {
    const raw = localStorage.getItem(k);
    if (!raw) continue;

    // Si ya existe carrito por seller, no pisamos
    if (!localStorage.getItem(tsfCartKey())) {
      localStorage.setItem(tsfCartKey(), raw);
    }
    localStorage.removeItem(k);
  }
})();

// ===============================
// CARRITO EN LOCALSTORAGE
// ===============================

let cart = [];
let allProducts = [];

// ===============================
// TOAST (mensaje flotante)
// ===============================

function ensureToast() {
  let toast = document.getElementById("tsf-toast");
  if (toast) return toast;

  toast = document.createElement("div");
  toast.id = "tsf-toast";
  toast.style.cssText = `
    position: fixed;
    left: 50%;
    top: 46%;
    transform: translate(-50%, -50%);
    background: rgba(0,0,0,.88);
    color: #fff;
    border: 1px solid rgba(0,207,255,.35);
    padding: 12px 16px;
    border-radius: 14px;
    font-size: 14px;
    z-index: 9999;
    opacity: 0;
    pointer-events: none;
    transition: opacity .2s ease;
    max-width: 92vw;
    text-align: center;
    box-shadow: 0 16px 50px rgba(0,0,0,.65);
  `;

  document.body.appendChild(toast);
  return toast;
}

let toastTimer = null;
function showToast(message) {
  const toast = ensureToast();
  toast.textContent = message;
  toast.style.opacity = "1";

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity = "0";
  }, 1400);
}

// ===============================
// HELPERS
// ===============================

// Formatear precio desde centavos
function formatUsdFromCents(cents) {
  const n = Number(cents || 0) / 100;
  return `USD ${n.toFixed(2)}`;
}

// ===============================
// TSF: SELLER REF (persistente)
// ===============================
function getActiveSellerRef() {
  try {
    const u = new URL(window.location.href);
    const incoming = (u.searchParams.get("ref") || "").trim().toLowerCase();
    if (incoming) {
      localStorage.setItem("tsf_seller_ref", incoming);
      return incoming;
    }
  } catch {}

  const stored = (localStorage.getItem("tsf_seller_ref") || "").trim().toLowerCase();
  return stored || "sin_ref";
}

// Mantener ref en la URL (para que no “se pierda” al navegar)
(function keepRefInUrl() {
  const ref = getActiveSellerRef();
  if (!ref || ref === "sin_ref") return;

  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.get("ref")) {
      u.searchParams.set("ref", ref);
      history.replaceState(null, "", u.pathname + "?" + u.searchParams.toString() + (u.hash || ""));
    }

    window.addEventListener("hashchange", () => {
      const uu = new URL(window.location.href);
      if (!uu.searchParams.get("ref")) {
        uu.searchParams.set("ref", ref);
        history.replaceState(null, "", uu.pathname + "?" + uu.searchParams.toString() + (uu.hash || ""));
      }
    });
  } catch {}
})();

// ===============================
// TSF: CART KEY por vendedor
// ===============================
function getCartStorageKey() {
  const ref = getActiveSellerRef();
  return `tsf_cart:${ref}`;
}

// Migrar carrito viejo (tsf_cart) al carrito del seller actual (una sola vez)
(function migrateLegacyCartOnce() {
  const legacy = localStorage.getItem("tsf_cart");
  if (!legacy) return;

  const newKey = getCartStorageKey();
  if (!localStorage.getItem(newKey)) {
    localStorage.setItem(newKey, legacy);
  }
  localStorage.removeItem("tsf_cart");
})();

// Cargar carrito desde localStorage (por vendedor)
function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(getCartStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    cart = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Error cargando carrito desde localStorage:", e);
    cart = [];
  }
  return cart;
}

// Guardar carrito en localStorage (por vendedor)
function saveCartToStorage() {
  try {
    localStorage.setItem(getCartStorageKey(), JSON.stringify(cart));
  } catch (e) {
    console.error("Error guardando carrito en localStorage:", e);
  }
}

// Actualizar texto del botón "Carrito (n)"
function updateCartBadge() {
  const btn = document.querySelector(".btn-cart");
  if (!btn) return;

  const count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  btn.textContent = `Carrito (${count})`;
}

// ===============================
// CARRITO: ADD / REMOVE / QTY
// ===============================

// Agregar producto al carrito
function addToCart(name, priceCents) {
  if (!cart) cart = [];

  const existing = cart.find(
    (item) => item.name === name && item.price === priceCents
  );

  if (existing) {
    existing.quantity = (existing.quantity || 1) + 1;
  } else {
    cart.push({
      name,
      price: priceCents, // en centavos
      quantity: 1,
    });
  }

  saveCartToStorage();
  updateCartBadge();
  renderCartPage(); // si estás en cart.html
  showToast("✅ Producto agregado al carrito");
}

// Eliminar producto por índice
function removeFromCart(index) {
  if (!Array.isArray(cart)) return;
  if (index < 0 || index >= cart.length) return;

  cart.splice(index, 1);
  saveCartToStorage();
  updateCartBadge();
  renderCartPage();
}

// Cambiar cantidad (+ / -)
function changeQty(index, delta) {
  if (!Array.isArray(cart)) return;
  if (index < 0 || index >= cart.length) return;

  const item = cart[index];
  const current = Number(item.quantity || 1);
  const next = current + Number(delta || 0);

  if (next <= 0) {
    cart.splice(index, 1);
  } else {
    item.quantity = next;
  }

  saveCartToStorage();
  updateCartBadge();
  renderCartPage();
}

// ===============================
// RENDER DEL CARRITO (cart.html)
// ===============================

function renderCartPage() {
  const itemsContainer = document.getElementById("cart-items");
  const totalSpan = document.getElementById("cart-total");

  // Si no estamos en cart.html, no hace nada
  if (!itemsContainer || !totalSpan) return;

  itemsContainer.innerHTML = "";

  if (!cart || cart.length === 0) {
    itemsContainer.innerHTML =
      '<p class="cart-empty">Tu carrito está vacío.</p>';
    totalSpan.textContent = "0.00";
    return;
  }

  let total = 0;

  cart.forEach((item, index) => {
    const qty = Number(item.quantity || 1);
    const itemTotal = (Number(item.price || 0) * qty) || 0;
    total += itemTotal;

    const div = document.createElement("div");
    div.className = "cart-item";

    div.innerHTML = `
      <div class="cart-item-info">
        <h3 class="cart-item-name">${item.name}</h3>

        <div class="qty-controls">
          <span class="qty-label">Cantidad</span>
          <button class="qty-btn" type="button" aria-label="Disminuir cantidad" onclick="changeQty(${index}, -1)">−</button>
          <span class="qty-value">${qty}</span>
          <button class="qty-btn" type="button" aria-label="Aumentar cantidad" onclick="changeQty(${index}, 1)">+</button>
        </div>
      </div>

      <div class="cart-item-meta">
        <p class="cart-item-price">USD ${(itemTotal / 100).toFixed(2)}</p>
        <button class="cart-item-remove" type="button" onclick="removeFromCart(${index})">
          ✕ Eliminar
        </button>
      </div>
    `;

    itemsContainer.appendChild(div);
  });

  totalSpan.textContent = (total / 100).toFixed(2);
}

// ===============================
// FETCH GENERAL DE PRODUCTOS
// ===============================

async function fetchAllProducts() {
  // si ya los cargamos, devolvemos cache
  if (allProducts && allProducts.length) return allProducts;

  const url = "https://tradingsinfronteras-shop.vercel.app/api/products";

  const res = await fetch(url);
  const data = await res.json();

  if (!data || !Array.isArray(data.products)) {
    throw new Error("Respuesta inválida de /api/products");
  }

  allProducts = data.products;
  return allProducts;
}

// Helper para obtener URL de imagen desde distintos campos posibles
function getProductImageUrl(product) {
  return (
    product.image_url ||
    product.img ||
    product.image ||
    product.thumbnail_url ||
    null
  );
}

// ===============================
// REFERRAL (VENDEDOR) - captura ?ref= y lo persiste
// ===============================

function getSellerRefFromUrl() {
  try {
    const url = new URL(window.location.href);
    return (url.searchParams.get("ref") || "").trim();
  } catch {
    return "";
  }
}

function getSellerRef() {
  const fromStore = (localStorage.getItem("tsf_seller_ref") || "").trim();
  if (fromStore) return fromStore;

  const fromUrl = getSellerRefFromUrl();
  if (fromUrl) {
    localStorage.setItem("tsf_seller_ref", fromUrl);
    return fromUrl;
  }

  return "";
}

function clearSellerRef() {
  localStorage.removeItem("tsf_seller_ref");
  // ✅ Captura temprana del ref apenas carga el JS
(function bootstrapReferral() {
  try {
    const url = new URL(window.location.href);
    const ref = (url.searchParams.get("ref") || "").trim();
    if (ref) localStorage.setItem("tsf_seller_ref", ref);
  } catch {}
})();

}

// ===============================
// RENDER: PRODUCTOS DESTACADOS
// ===============================

function renderFeaturedProducts(products) {
  const container = document.getElementById("products-grid");
  if (!container) return;

  container.innerHTML = "<p>Cargando productos...</p>";

  const featured = products.filter(
    (p) => p.is_featured !== false && p.is_active !== false
  );

  if (!featured.length) {
    container.innerHTML = "<p>No hay productos destacados cargados.</p>";
    return;
  }

  container.innerHTML = "";

  featured.forEach((product) => {
    const card = document.createElement("article");
    card.className = "producto";

    const safeName = String(product.name || "").replace(/'/g, "\\'");
    const price = formatUsdFromCents(product.price_cents);
    const imgUrl = getProductImageUrl(product);

    card.innerHTML = `
      ${
        imgUrl
          ? `<img src="${imgUrl}" alt="${product.name}" class="producto-img" loading="lazy" onerror="this.style.display='none';" />`
          : ""
      }
      <h3>${product.name}</h3>
      <p class="precio">${price}</p>
      <p class="producto-texto">${product.short_description || ""}</p>
      <button class="btn-secondary" onclick="addToCart('${safeName}', ${product.price_cents})">
        Agregar al carrito
      </button>
    `;

    container.appendChild(card);
  });
}

// ===============================
// RENDER: CATÁLOGO POR CATEGORÍAS
// ===============================

function renderProductsByCategory(products) {
  const containersMap = {
    course: "grid-courses",
    indicator: "grid-indicators",
    bot: "grid-bots",
    physical: "grid-physical",
    other: "grid-other",
  };

  // Si no existe ninguno de estos contenedores, no hacemos nada
  const anyContainerExists = Object.values(containersMap).some(
    (id) => document.getElementById(id) !== null
  );
  if (!anyContainerExists) return;

  // Limpiamos todos los contenedores
  Object.values(containersMap).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });

  const activos = products.filter((p) => p.is_active !== false);

  activos.forEach((product) => {
    const containerId = containersMap[product.type] || containersMap.other;
    const container = document.getElementById(containerId);
    if (!container) return;

    const card = document.createElement("article");
    card.className = "producto";

    const safeName = String(product.name || "").replace(/'/g, "\\'");
    const price = formatUsdFromCents(product.price_cents);
    const imgUrl = getProductImageUrl(product);

    card.innerHTML = `
      ${
        imgUrl
          ? `<img src="${imgUrl}" alt="${product.name}" class="producto-img" loading="lazy" onerror="this.style.display='none';" />`
          : ""
      }
      <h3>${product.name}</h3>
      <p class="precio">${price}</p>
      <p class="producto-texto">${product.short_description || ""}</p>
      <button class="btn-secondary" onclick="addToCart('${safeName}', ${product.price_cents})">
        Agregar al carrito
      </button>
    `;

    container.appendChild(card);
  });

  // Si alguna categoría quedó vacía
  Object.entries(containersMap).forEach(([key, id]) => {
    const container = document.getElementById(id);
    if (!container) return;

    if (!container.children.length) {
      const p = document.createElement("p");
      p.className = "cat-empty";
      p.textContent = "Próximamente...";
      container.appendChild(p);
    }
  });
}

// Inicializador de todo el catálogo
async function initProducts() {
  try {
    const products = await fetchAllProducts();
    renderFeaturedProducts(products);
    renderProductsByCategory(products);
  } catch (err) {
    console.error("Error general cargando productos:", err);
    const featuredContainer = document.getElementById("products-grid");
    if (featuredContainer) {
      featuredContainer.innerHTML =
        "<p>Error al cargar los productos. Intentá nuevamente más tarde.</p>";
    }
  }
}

// ===============================
// VALIDACIÓN DATOS DE CONTACTO (cart.html)
// ===============================

const nameInput = document.getElementById("buyer-name");
const emailInput = document.getElementById("buyer-email");
const whatsappInput = document.getElementById("buyer-whatsapp");
const payButton = document.getElementById("pay-button");

function isValidEmail(email) {
  return /\S+@\S+\.\S+/.test(email);
}

function isValidWhatsapp(value) {
  return value.replace(/\D/g, "").length >= 8;
}

function updatePayButtonState() {
  if (!nameInput || !emailInput || !whatsappInput || !payButton) return;

  const nameOk = nameInput.value.trim().length > 2;
  const emailOk = isValidEmail(emailInput.value.trim());
  const whatsappOk = isValidWhatsapp(whatsappInput.value.trim());

  const allOk = nameOk && emailOk && whatsappOk;

  payButton.disabled = !allOk;
  payButton.classList.toggle("btn-pay--disabled", !allOk);
  payButton.classList.toggle("btn-pay--enabled", allOk);
}

// ===============================
// STRIPE
// ===============================

const API_BASE = "https://tradingsinfronteras-shop.vercel.app";

function setPayButtonLoading(isLoading, labelText) {
  const btn = document.getElementById("pay-button");
  if (!btn) return;

  // Si tenés un span interno, lo cambia; si no, cambia texto del botón
  const label = btn.querySelector(".btn-label");
  if (label && labelText) label.textContent = labelText;
  if (!label && labelText) btn.textContent = labelText;

  btn.classList.toggle("is-loading", !!isLoading);
  btn.disabled = !!isLoading;
}

// helper: fetch con debug de error aunque no sea JSON
async function fetchJsonDebug(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();

  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    console.error("API error:", res.status, data);
    const msg =
      data?.message ||
      data?.error ||
      `Error en servidor (${res.status}). Mirá consola.`;
    throw new Error(msg);
  }

  return data;
}

// currency: "usd" o "ars"
async function payWithStripe(currency = "usd") {
  loadCartFromStorage();

  if (!cart || cart.length === 0) {
    alert("Tu carrito está vacío.");
    return;
  }

  const buyerName = (nameInput?.value || "").trim();
  const buyerEmail = (emailInput?.value || "").trim();
  const buyerWhatsApp = (whatsappInput?.value || "").trim();

  if (!buyerName || !buyerEmail || !buyerWhatsApp) {
    alert("Completá nombre, email y WhatsApp para continuar.");
    return;
  }

  // Referral ID (vendedor)
  const referralId = getSellerRef();
  console.log("🧾 Referral ID detectado:", referralId || "DIRECTO");

  setPayButtonLoading(true, "Redirigiendo…");

  try {
 const payload = {
  customer: {
    name: buyerName,
    email: buyerEmail,
    whatsapp: buyerWhatsApp,
  },
  seller_ref: referralId, // ✅ ACÁ (ROOT)
  cart: cart.map((item) => ({
    name: item.name,
    price: Number(item.price),
    qty: Number(item.quantity || 1),
  })),
  currency: String(currency).trim().toLowerCase(),
};


    const data = await fetchJsonDebug(`${API_BASE}/api/create-stripe-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (data?.url) {
      window.location.href = data.url;
      return;
    }

    console.error("Respuesta Stripe inesperada:", data);
    alert("Respuesta Stripe inesperada. Mirá consola.");
    setPayButtonLoading(false, "PAGAR (ARS o USD)");
  } catch (e) {
    console.error("payWithStripe error:", e);
    alert(e?.message || "Error al conectar con Stripe. Intentá nuevamente.");
    setPayButtonLoading(false, "PAGAR (ARS o USD)");
  }
}

// Conectar botones (si existen)
document.addEventListener("click", (e) => {
  const t = e.target;
  if (!t) return;

  if (t.id === "pay-usd") payWithStripe("usd");
  if (t.id === "pay-ars") payWithStripe("ars");
  if (t.id === "pay-button") payWithStripe("usd");
});

// Fix: si el usuario vuelve “atrás” desde Stripe
window.addEventListener("pageshow", () => {
  setPayButtonLoading(false, "PAGAR (ARS o USD)");
});

// ===============================
// SPLASH (solo existe si estás en index)
// ===============================

function runSplash() {
  const splash = document.getElementById("tsf-splash");
  const app = document.getElementById("tsf-app");
  if (!splash || !app) return;

  // Blur SOLO al contenido, no al splash
  app.classList.add("tsf-blur");

  // Fail-safe: pase lo que pase, el splash se va en 5s
  const HARD_TIMEOUT = setTimeout(() => {
    try {
      splash.style.opacity = "0";
      app.classList.remove("tsf-blur");
      app.classList.remove("tsf-blur-off");
      setTimeout(() => splash.remove(), 450);
    } catch {}
  }, 5000);

  const DURATION = 2300;

  setTimeout(() => {
    splash.style.opacity = "0";
    app.classList.add("tsf-blur-off");
    app.classList.remove("tsf-blur");

    setTimeout(() => {
      clearTimeout(HARD_TIMEOUT);
      splash.remove();
      app.classList.remove("tsf-blur-off");
    }, 450);
  }, DURATION);
}

// ===============================
// INICIALIZACIÓN
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  // Splash (si existe en la página)
  runSplash();

  // Año en footer
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Carrito
  loadCartFromStorage();
  updateCartBadge();
  renderCartPage();

  // Validación inputs (solo si existen)
  if (nameInput && emailInput && whatsappInput) {
    ["input", "blur"].forEach((evt) => {
      nameInput.addEventListener(evt, updatePayButtonState);
      emailInput.addEventListener(evt, updatePayButtonState);
      whatsappInput.addEventListener(evt, updatePayButtonState);
    });
    updatePayButtonState();
  }

  // Productos (solo si hay secciones)
  initProducts();
  getSellerRef();
});
