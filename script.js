// ===============================
// CARRITO EN LOCALSTORAGE
// ===============================

let cart = [];
let allProducts = [];

// Formatear precio desde centavos
function formatUsdFromCents(cents) {
  const n = Number(cents || 0) / 100;
  return `USD ${n.toFixed(2)}`;
}

// Cargar carrito desde localStorage
function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem("tsf_cart");
    const parsed = raw ? JSON.parse(raw) : [];
    cart = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Error cargando carrito desde localStorage:", e);
    cart = [];
  }
  return cart;
}

// Guardar carrito en localStorage
function saveCartToStorage() {
  try {
    localStorage.setItem("tsf_cart", JSON.stringify(cart));
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
      price: priceCents,
      quantity: 1,
    });
  }

  saveCartToStorage();
  updateCartBadge();
  renderCartPage();
}

// Eliminar producto
function removeFromCart(index) {
  if (!Array.isArray(cart)) return;
  if (index < 0 || index >= cart.length) return;

  cart.splice(index, 1);
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

  if (!itemsContainer || !totalSpan) return;

  itemsContainer.innerHTML = "";

  if (!cart || cart.length === 0) {
    itemsContainer.innerHTML = `<p class="cart-empty">Tu carrito está vacío.</p>`;
    totalSpan.textContent = "0.00";
    return;
  }

  let total = 0;

  cart.forEach((item, index) => {
    const itemTotal = item.price * (item.quantity || 1);
    total += itemTotal;

    const div = document.createElement("div");
    div.className = "cart-item";

    div.innerHTML = `
      <div class="cart-item-info">
        <h3 class="cart-item-name">${item.name}</h3>
        <p class="cart-item-qty">Cantidad: <span>${item.quantity}</span></p>
      </div>
      <div class="cart-item-meta">
        <p class="cart-item-price">USD ${(itemTotal / 100).toFixed(2)}</p>
        <button class="cart-item-remove" onclick="removeFromCart(${index})">✕ Eliminar</button>
      </div>
    `;

    itemsContainer.appendChild(div);
  });

  totalSpan.textContent = (total / 100).toFixed(2);
}

// ===============================
// FETCH DE PRODUCTOS
// ===============================

async function fetchAllProducts() {
  if (allProducts.length) return allProducts;

  const url = "https://tradingsinfronteras-shop.vercel.app/api/products";

  const res = await fetch(url);
  const data = await res.json();

  if (!data || !Array.isArray(data.products)) {
    throw new Error("Respuesta inválida de /api/products");
  }

  allProducts = data.products;
  return allProducts;
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
    container.innerHTML = "<p>No hay productos destacados.</p>";
    return;
  }

  container.innerHTML = "";

  featured.forEach((product) => {
    const card = document.createElement("article");
    card.className = "producto";

    card.innerHTML = `
      <h3>${product.name}</h3>
      <p class="precio">${formatUsdFromCents(product.price_cents)}</p>
      <p class="producto-texto">${product.short_description || ""}</p>
      <button class="btn-secondary"
        onclick="addToCart('${product.name.replace(/'/g, "\\'")}', ${product.price_cents})">
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
  const containers = {
    course: "grid-courses",
    indicator: "grid-indicators",
    bot: "grid-bots",
    physical: "grid-physical",
    other: "grid-other",
  };

  const exists = Object.values(containers).some((id) => document.getElementById(id));
  if (!exists) return;

  Object.values(containers).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });

  const activos = products.filter((p) => p.is_active !== false);

  activos.forEach((product) => {
    const container = document.getElementById(containers[product.type] || containers.other);
    if (!container) return;

    const card = document.createElement("article");
    card.className = "producto";

    card.innerHTML = `
      <h3>${product.name}</h3>
      <p class="precio">${formatUsdFromCents(product.price_cents)}</p>
      <p class="producto-texto">${product.short_description || ""}</p>
      <button class="btn-secondary"
        onclick="addToCart('${product.name.replace(/'/g, "\\'")}', ${product.price_cents})">
        Agregar al carrito
      </button>
    `;

    container.appendChild(card);
  });

  Object.entries(containers).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el && el.children.length === 0) {
      const p = document.createElement("p");
      p.className = "cat-empty";
      p.textContent = "Próximamente...";
      el.appendChild(p);
    }
  });
}

// Inicializa todo el sistema de productos
async function initProducts() {
  try {
    const products = await fetchAllProducts();
    renderFeaturedProducts(products);
    renderProductsByCategory(products);
  } catch (e) {
    console.error("Error cargando productos:", e);
    const c = document.getElementById("products-grid");
    if (c) c.innerHTML = "<p>Error al cargar productos.</p>";
  }
}

// ===============================
// VALIDACIÓN DATOS DE CONTACTO
// ===============================

const nameInput = document.getElementById("buyer-name");
const emailInput = document.getElementById("buyer-email");
const whatsappInput = document.getElementById("buyer-whatsapp");
const payButton = document.getElementById("pay-button");

function isValidEmail(email) {
  return /\S+@\S+\.\S+/.test(email);
}

function isValidWhatsapp(v) {
  return v.replace(/\D/g, "").length >= 8;
}

function updatePayButtonState() {
  if (!nameInput || !emailInput || !whatsappInput || !payButton) return;

  const ok =
    nameInput.value.trim().length > 2 &&
    isValidEmail(emailInput.value.trim()) &&
    isValidWhatsapp(whatsappInput.value.trim());

  payButton.disabled = !ok;
  payButton.classList.toggle("btn-pay--disabled", !ok);
  payButton.classList.toggle("btn-pay--enabled", ok);
}

if (nameInput && emailInput && whatsappInput) {
  ["input", "blur"].forEach((evt) => {
    nameInput.addEventListener(evt, updatePayButtonState);
    emailInput.addEventListener(evt, updatePayButtonState);
    whatsappInput.addEventListener(evt, updatePayButtonState);
  });

  updatePayButtonState();
}

// ===============================
// STRIPE
// ===============================

const API_BASE = "https://tradingsinfronteras-shop.vercel.app";

async function payWithStripe() {
  loadCartFromStorage();

  if (!cart.length) {
    alert("Tu carrito está vacío.");
    return;
  }

  const buyerName = nameInput?.value.trim();
  const buyerEmail = emailInput?.value.trim();
  const buyerWhatsApp = whatsappInput?.value.trim();

  if (!buyerName || !buyerEmail || !buyerWhatsApp) {
    alert("Completá nombre, email y WhatsApp para continuar.");
    return;
  }

  try {
    const payload = {
      items: cart.map((i) => ({
        name: i.name,
        price: i.price,
        quantity: i.quantity || 1,
      })),
      buyerName,
      buyerEmail,
      buyerWhatsApp,
      successUrl: window.location.origin + "/checkout-success-stripe.html",
      cancelUrl: window.location.href,
    };

    const res = await fetch(`${API_BASE}/api/create-stripe-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (data?.url) window.location.href = data.url;
    else {
      console.error(data);
      alert("No se pudo crear el pago.");
    }
  } catch (e) {
    console.error(e);
    alert("Error al conectar con Stripe.");
  }
}

// ===============================
// SCROLL DESDE COLECCIONES
// ===============================

function initCollectionScrollLinks() {
  const links = document.querySelectorAll("[data-coleccion-target]");

  links.forEach((el) => {
    el.style.cursor = "pointer";

    el.addEventListener("click", () => {
      const target = el.getAttribute("data-coleccion-target");
      const section = document.getElementById(target);

      if (section) {
        section.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  });
}

// ===============================
// INICIALIZACIÓN GLOBAL
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  loadCartFromStorage();
  updateCartBadge();
  renderCartPage();

  initProducts();
  initCollectionScrollLinks();
});
