// ===============================
// CONFIGURACIÓN GENERAL
// ===============================

// URL base de tu backend en Vercel (ajustá si cambias el dominio)
const API_BASE = "https://tradingsinfronteras-shop.vercel.app";

// Clave CART en localStorage
const CART_KEY = "tsf_cart";

// Estado del carrito en memoria
let cart = [];

// ===============================
// UTILIDADES DE CARRITO
// ===============================

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    cart = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(cart)) cart = [];
  } catch (e) {
    console.error("Error cargando carrito:", e);
    cart = [];
  }
}

function saveCartToStorage() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch (e) {
    console.error("Error guardando carrito:", e);
  }
}

function getCartCount() {
  return cart.reduce((sum, item) => sum + item.qty, 0);
}

function getCartTotal() {
  // precios en CENTAVOS (19990 => 199.90)
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

// ===============================
// INTERFAZ: BOTÓN "CARRITO (N)"
// ===============================

function updateCartBadge() {
  const btn = document.querySelector(".btn-cart");
  if (!btn) return;

  const count = getCartCount();
  btn.textContent = `Carrito (${count})`;
}

// ===============================
// AÑADIR AL CARRITO (desde index.html)
// ===============================

function addToCart(name, price) {
  // price viene en centavos (ej: 19990)
  loadCartFromStorage();

  const existing = cart.find(
    (item) => item.name === name && item.price === price
  );

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ name, price, qty: 1 });
  }

  saveCartToStorage();
  updateCartBadge();

  alert("Producto agregado al carrito.");
}

// ===============================
// PINTAR CARRITO EN cart.html
// ===============================

function renderCartPage() {
  const listEl = document.getElementById("cart-items");
  const totalEl = document.getElementById("cart-total");

  // Si estos elementos no existen, no estamos en cart.html
  if (!listEl || !totalEl) return;

  loadCartFromStorage();
  listEl.innerHTML = "";

  if (cart.length === 0) {
    listEl.innerHTML =
      "<p class='cart-empty'>Tu carrito está vacío. Volvé a la tienda para agregar productos.</p>";
    totalEl.textContent = "0.00";
    return;
  }

  cart.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "cart-item-card";
    row.innerHTML = `
      <div class="cart-item-info">
        <h3>${item.name}</h3>
        <p>Cantidad: ${item.qty}</p>
      </div>
      <div class="cart-item-price">
        <span>USD ${(item.price / 100).toFixed(2)}</span>
        <button class="link-remove" data-index="${index}">✕ Eliminar</button>
      </div>
    `;
    listEl.appendChild(row);
  });

  totalEl.textContent = (getCartTotal() / 100).toFixed(2);

  // Manejo de eliminar (delegación de eventos)
  listEl.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest("[data-index]");
      if (!btn) return;

      const idx = Number(btn.dataset.index);
      if (Number.isNaN(idx)) return;

      cart.splice(idx, 1);
      saveCartToStorage();
      renderCartPage();
      updateCartBadge();
    },
    { once: true }
  );
}

// ===============================
// PAGOS
// ===============================

// (1) Stripe: pago con tarjeta
async function payWithStripe() {
  loadCartFromStorage();

  if (!cart.length) {
    alert("Tu carrito está vacío.");
    return;
  }

  try {
    const successUrl =
      window.location.origin + "/checkout-success-stripe.html";
    const cancelUrl = window.location.href;

    const response = await fetch(
      `${API_BASE}/api/create-stripe-checkout`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart,
          successUrl,
          cancelUrl,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.url) {
      console.error("Stripe error:", data);
      alert("No se pudo crear el pago con Stripe.");
      return;
    }

    // Redirige al Checkout Hosted de Stripe
    window.location.href = data.url;
  } catch (e) {
    console.error(e);
    alert("Error al conectar con Stripe.");
  }
}

// (2) USDT BEP20: por ahora aviso manual
function payWithUSDT() {
  alert(
    "Para pagar con USDT (BEP20) escribime por WhatsApp o Discord y te paso la wallet. " +
      "Próximamente se automatiza este método."
  );
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

  loadCartFromStorage();
  updateCartBadge();
  renderCartPage();
});

// Exponer funciones a window para usar en los onclick de HTML
window.addToCart = addToCart;
window.payWithStripe = payWithStripe;
window.payWithUSDT = payWithUSDT;
