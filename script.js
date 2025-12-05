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
      price: priceCents, // en centavos
      quantity: 1,
    });
  }

  saveCartToStorage();
  updateCartBadge();
  renderCartPage(); // si estamos en cart.html, se actualiza la vista
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
    const itemTotal = (item.price || 0) * (item.quantity || 1);
    total += itemTotal;

    const div = document.createElement("div");
    div.className = "cart-item";

    div.innerHTML = `
      <div class="cart-item-info">
        <h3 class="cart-item-name">${item.name}</h3>
        <p class="cart-item-qty">Cantidad: <span>${
          item.quantity
        }</span></p>
      </div>
      <div class="cart-item-meta">
        <p class="cart-item-price">USD ${(itemTotal / 100).toFixed(2)}</p>
        <button class="cart-item-remove" onclick="removeFromCart(${index})">
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
  // Si ya los cargamos, devolvemos cache
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

// ===============================
// RENDER: PRODUCTOS DESTACADOS
// ===============================

function renderFeaturedProducts(products) {
  const container = document.getElementById("products-grid");
  if (!container) return; // por si no estamos en index

  container.innerHTML = "<p>Cargando productos...</p>";

  // Solo los que estén marcados como destacados y activos
  const featured = products.filter(
    (p) => p.is_featured === true && p.is_active !== false
  );

  if (!featured.length) {
    container.innerHTML = "<p>No hay productos destacados cargados.</p>";
    return;
  }

  container.innerHTML = "";

  featured.forEach((product) => {
    const card = document.createElement("article");
    card.className = "producto";

    const imgHtml = product.image_url
      ? `<img src="${product.image_url}" alt="${product.name}" class="producto-img" />`
      : "";

    card.innerHTML = `
      ${imgHtml}
      <h3>${product.name}</h3>
      <p class="precio">${formatUsdFromCents(product.price_cents)}</p>
      <p class="producto-texto">${product.short_description || ""}</p>
      <button
        class="btn-secondary"
        onclick="addToCart('${product.name.replace(/'/g, "\\'")}', ${
      product.price_cents
    })">
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

  // Si no existe ningún contenedor, no hacemos nada (por si no estamos en index)
  const anyContainerExists = Object.values(containersMap).some(
    (id) => document.getElementById(id) !== null
  );
  if (!anyContainerExists) return;

  // Limpiamos todos los contenedores
  Object.values(containersMap).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });

  // Solo productos activos
  const activos = products.filter((p) => p.is_active !== false);

  activos.forEach((product) => {
    const type = product.type || "other";
    const containerId = containersMap[type] || containersMap.other;
    const container = document.getElementById(containerId);
    if (!container) return;

    const card = document.createElement("article");
    card.className = "producto";

    const imgHtml = product.image_url
      ? `<img src="${product.image_url}" alt="${product.name}" class="producto-img" />`
      : "";

    card.innerHTML = `
      ${imgHtml}
      <h3>${product.name}</h3>
      <p class="precio">${formatUsdFromCents(product.price_cents)}</p>
      <p class="producto-texto">${product.short_description || ""}</p>
      <button
        class="btn-secondary"
        onclick="addToCart('${product.name.replace(/'/g, "\\'")}', ${
      product.price_cents
    })">
        Agregar al carrito
      </button>
    `;

    container.appendChild(card);
  });

  // Si alguna categoría quedó vacía, mostramos "Próximamente..."
  Object.entries(containersMap).forEach(([_, id]) => {
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

    // Si existe la sección de destacados, la rellenamos
    if (document.getElementById("products-grid")) {
      renderFeaturedProducts(products);
    }

    // Si existe el catálogo por categoría, lo rellenamos
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
  // Nos aseguramos de tener el carrito actualizado desde localStorage
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

  try {
    const successUrl =
      window.location.origin + "/checkout-success-stripe.html";
    const cancelUrl = window.location.href;

    const payload = {
      items: cart.map((item) => ({
        name: item.name,
        price: item.price, // en centavos
        quantity: item.quantity || 1,
      })),
      buyerName,
      buyerEmail,
      buyerWhatsApp,
      successUrl,
      cancelUrl,
    };

    const response = await fetch(
      `${API_BASE}/api/create-stripe-checkout`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    if (data?.url) {
      window.location.href = data.url;
    } else {
      console.error("Respuesta Stripe inesperada:", data);
      alert("No se pudo crear el pago con Stripe. Intentá nuevamente.");
    }
  } catch (e) {
    console.error(e);
    alert("Error al conectar con Stripe. Intentá nuevamente.");
  }
}

// ===============================
// INICIALIZACIÓN GLOBAL
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  // Año en el footer
  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // Cargar carrito y reflejar estado
  loadCartFromStorage();
  updateCartBadge();
  renderCartPage(); // si estamos en cart.html

  // Renderizar productos dinámicamente (si estamos en index.html habrá contenedores)
  initProducts();
});
