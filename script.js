// ===============================
// CONFIG / CONSTANTES
// ===============================

// Carrito en memoria
let cart = [];

// Tipo de cambio de referencia para mostrar el equivalente en ARS
// Cambiá este valor cuando quieras actualizarlo.
const USD_TO_ARS = 1500; // EJEMPLO: 1 USD = 1500 ARS

// Base de la API en Vercel
const API_BASE = "https://tradingsinfronteras-shop.vercel.app";


// ===============================
// HELPERS GENERALES
// ===============================

// Formatear precio desde centavos a string "USD xx.xx"
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


// ===============================
// MANEJO DE CARRITO
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
  renderCartPage(); // si estás en cart.html, se actualiza la vista
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

    const totalArsSpanEmpty = document.getElementById("cart-total-ars");
    if (totalArsSpanEmpty) {
      totalArsSpanEmpty.textContent = "0";
    }
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
        <p class="cart-item-qty">Cantidad: <span>${item.quantity}</span></p>
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

  const totalUsd = total / 100;
  totalSpan.textContent = totalUsd.toFixed(2);

  // Total aproximado en ARS
  const totalArsSpan = document.getElementById("cart-total-ars");
  if (totalArsSpan) {
    const totalArs = Math.round(totalUsd * USD_TO_ARS);
    totalArsSpan.textContent = totalArs.toLocaleString("es-AR");
  }
}


// ===============================
// RENDER DE PRODUCTOS (index.html)
// ===============================

async function renderProductsOnHome() {
  const container = document.getElementById("products-grid");
  if (!container) return; // si no estamos en index, no hace nada

  container.innerHTML = "<p>Cargando productos...</p>";

  try {
    const response = await fetch(`${API_BASE}/api/products`);
    const data = await response.json();

    if (!data || !Array.isArray(data.products)) {
      throw new Error("Respuesta inválida de /api/products");
    }

    const products = data.products;

    if (!products.length) {
      container.innerHTML = "<p>No hay productos disponibles.</p>";
      return;
    }

    container.innerHTML = ""; // limpiamos el "Cargando..."

    products.forEach((product) => {
      const card = document.createElement("article");
      card.className = "producto";

      card.innerHTML = `
        <h3>
          ${product.name}
        </h3>
        <p class="precio">${formatUsdFromCents(product.price_cents)}</p>
        <p class="producto-texto">
          ${product.short_description || ""}
        </p>
        <button
          class="btn-secondary"
          onclick="addToCart('${product.name.replace(
            /'/g,
            "\\'"
          )}', ${product.price_cents})">
          Agregar al carrito
        </button>
      `;

      container.appendChild(card);
    });
  } catch (err) {
    console.error("Error cargando productos:", err);
    container.innerHTML =
      "<p>Error al cargar los productos. Intentá nuevamente más tarde.</p>";
  }
}


// ===============================
// VALIDACIÓN FORMULARIO CARRITO
// ===============================

const buyerNameInput = document.getElementById("buyer-name");
const buyerEmailInput = document.getElementById("buyer-email");
const buyerWhatsappInput = document.getElementById("buyer-whatsapp");
const payButton = document.getElementById("pay-button");

function isValidEmail(email) {
  return /\S+@\S+\.\S+/.test(email);
}

function isValidWhatsapp(value) {
  return value.replace(/\D/g, "").length >= 8;
}

function updatePayButtonState() {
  if (!buyerNameInput || !buyerEmailInput || !buyerWhatsappInput || !payButton)
    return;

  const nameOk = buyerNameInput.value.trim().length > 2;
  const emailOk = isValidEmail(buyerEmailInput.value.trim());
  const whatsappOk = isValidWhatsapp(buyerWhatsappInput.value.trim());

  const allOk = nameOk && emailOk && whatsappOk;

  payButton.disabled = !allOk;
  payButton.classList.toggle("btn-pay--disabled", !allOk);
  payButton.classList.toggle("btn-pay--enabled", allOk);
}

if (buyerNameInput && buyerEmailInput && buyerWhatsappInput && payButton) {
  ["input", "blur"].forEach((evt) => {
    buyerNameInput.addEventListener(evt, updatePayButtonState);
    buyerEmailInput.addEventListener(evt, updatePayButtonState);
    buyerWhatsappInput.addEventListener(evt, updatePayButtonState);
  });

  // Estado inicial
  updatePayButtonState();
}


// ===============================
// STRIPE
// ===============================

async function payWithStripe() {
  // Asegurarnos de tener carrito actualizado
  loadCartFromStorage();

  if (!cart || cart.length === 0) {
    alert("Tu carrito está vacío.");
    return;
  }

  const buyerName = (buyerNameInput?.value || "").trim();
  const buyerEmail = (buyerEmailInput?.value || "").trim();
  const buyerWhatsApp = (buyerWhatsappInput?.value || "").trim();

  if (!buyerName || !buyerEmail || !buyerWhatsApp) {
    alert("Por favor completá todos los datos de contacto para continuar.");
    return;
  }

  try {
    const successUrl = window.location.origin + "/checkout-success-stripe.html";
    const cancelUrl = window.location.href;

    const payload = {
      items: cart.map((item) => ({
        name: item.name,
        price: item.price, // centavos
        quantity: item.quantity || 1,
      })),
      buyerName,
      buyerEmail,
      buyerWhatsApp,
      successUrl,
      cancelUrl,
    };

    const response = await fetch(`${API_BASE}/api/create-stripe-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log("Stripe response:", data);

    if (data?.url) {
      window.location.href = data.url;
    } else {
      console.error("Respuesta Stripe inesperada:", data);
      alert("No se pudo crear el pago con Stripe. Intenta nuevamente.");
    }
  } catch (e) {
    console.error(e);
    alert("Error al conectar con Stripe. Intenta nuevamente.");
  }
}


// ===============================
// INICIALIZACIÓN
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
  renderCartPage();       // si estamos en cart.html

  // Renderizar productos dinámicamente en index.html
  renderProductsOnHome(); // si estamos en index.html
});
