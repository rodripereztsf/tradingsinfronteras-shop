// ================================
// CONFIGURACIÓN GENERAL TSF SHOP
// ================================

// URL base del backend (Vercel) donde están los endpoints /api
// *** Asegurate que sea EXACTAMENTE el dominio de tu proyecto en Vercel ***
const API_BASE = "https://tradingsinfronteras-shop.vercel.app";

// Conversión ARS -> USD (ajustalo más adelante si querés)
const USD_RATE = 1 / 1000; // Ejemplo: 1 USD = 1000 ARS

// Conversión USD -> USDT (por ahora 1:1)
const USDT_RATE = 1;

// Dirección de tu wallet USDT (BEP20)
const USDT_WALLET = "ACA_PONES_TU_WALLET_BEP20_REAL";


// ==========================
// ESTADO DEL CARRITO
// ==========================

let cart = [];

function loadCartFromStorage() {
  try {
    cart = JSON.parse(localStorage.getItem("tsfCart")) || [];
  } catch {
    cart = [];
  }
}

function saveCartToStorage() {
  localStorage.setItem("tsfCart", JSON.stringify(cart));
}

function updateCartBadge() {
  const btn = document.querySelector(".btn-cart");
  if (!btn) return;

  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  btn.textContent = `Carrito (${totalItems})`;
}

function addToCart(name, price) {
  const numericPrice = Number(price) || 0;
  const existing = cart.find((item) => item.name === name);

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ name, price: numericPrice, qty: 1 });
  }

  saveCartToStorage();
  updateCartBadge();
  renderCartPage();
  renderCheckoutPage();
  renderPaymentAmounts();
  alert(`Se agregó al carrito: ${name}`);
}

function removeFromCart(index) {
  cart.splice(index, 1);
  saveCartToStorage();
  updateCartBadge();
  renderCartPage();
  renderCheckoutPage();
  renderPaymentAmounts();
}


// ==========================
// UTILIDADES
// ==========================

function getCartTotal() {
  return cart.reduce((sum, item) => sum + item.qty * item.price, 0);
}

function formatARS(value) {
  return `$${value.toLocaleString("es-AR")}`;
}


// ==========================
// RENDER: CARRITO (cart.html)
// ==========================

function renderCartPage() {
  const tbody = document.getElementById("cart-items");
  const totalSpan = document.getElementById("cart-total");
  const wrapper = document.getElementById("cart-wrapper");
  const emptyMsg = document.getElementById("cart-empty");

  // Si no estamos en cart.html, salimos
  if (!tbody || !totalSpan || !wrapper || !emptyMsg) return;

  if (cart.length === 0) {
    wrapper.style.display = "none";
    emptyMsg.style.display = "block";
    totalSpan.textContent = formatARS(0);
    return;
  }

  wrapper.style.display = "block";
  emptyMsg.style.display = "none";
  tbody.innerHTML = "";

  let total = 0;

  cart.forEach((item, index) => {
    const subtotal = item.price * item.qty;
    total += subtotal;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.name}</td>
      <td class="th-center">${item.qty}</td>
      <td class="th-right">${formatARS(subtotal)}</td>
      <td>
        <button class="btn-remove" onclick="removeFromCart(${index})">X</button>
      </td>
    `;

    tbody.appendChild(row);
  });

  totalSpan.textContent = formatARS(total);
}


// ==========================
// RENDER: CHECKOUT (checkout.html)
// ==========================

function renderCheckoutPage() {
  const list = document.getElementById("checkout-items");
  const totalSpan = document.getElementById("checkout-total");

  // Si no estamos en checkout.html, salimos
  if (!list || !totalSpan) return;

  if (cart.length === 0) {
    list.innerHTML = "<li>No hay productos en el pedido.</li>";
    totalSpan.textContent = formatARS(0);
    return;
  }

  list.innerHTML = "";
  let total = 0;

  cart.forEach((item) => {
    const subtotal = item.price * item.qty;
    total += subtotal;

    const li = document.createElement("li");
    li.textContent = `${item.qty} × ${item.name} — ${formatARS(subtotal)}`;
    list.appendChild(li);
  });

  totalSpan.textContent = formatARS(total);
}


// ==========================
// RENDER: MONTOS DE PAGO (ARS / USD / USDT)
// ==========================

function renderPaymentAmounts() {
  const arsElem = document.getElementById("ars-amount");
  const usdElem = document.getElementById("usd-amount");
  const usdtElem = document.getElementById("usdt-amount");

  // Si no estamos en checkout.html (o falta el bloque), salimos
  if (!arsElem || !usdElem || !usdtElem) return;

  const totalARS = getCartTotal();
  const totalUSD = (totalARS * USD_RATE).toFixed(2);
  const totalUSDT = (totalARS * USDT_RATE).toFixed(2);

  arsElem.textContent = formatARS(totalARS);
  usdElem.textContent = `${totalUSD} USD`;
  usdtElem.textContent = `${totalUSDT} USDT`;
}


// ==========================
// PAGOS
// ==========================

// (1) Stripe en USD – usa backend /api/create-stripe-checkout
async function payWithStripe() {

  try {
    const successUrl = window.location.origin + "/checkout-success-stripe.html";
    const cancelUrl = window.location.href;

    const response = await fetch(`${API_BASE}/api/create-stripe-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart,
        successUrl,
        cancelUrl,
      }),
    });

    const data = await response.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      alert("No se pudo crear el pago con Stripe.");
    }
  } catch (e) {
    console.error(e);
    alert("Error al conectar con Stripe.");
  }
}

// (2) Mercado Pago en ARS – usa backend /api/create-mp-preference
async function payWithMP() {

  try {
    const successUrl = window.location.origin + "/checkout-success-mp.html";
    const cancelUrl = window.location.href;

    const response = await fetch(`${API_BASE}/api/create-mp-preference`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart,
        successUrl,
        cancelUrl,
      }),
    });

    const data = await response.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      alert("No se pudo crear el pago con Mercado Pago.");
    }
  } catch (e) {
    console.error(e);
    alert("Error al conectar con Mercado Pago.");
  }
}

// (3) USDT (BEP20) – sin backend, pago manual cripto
function payWithUSDT() {
  const totalARS = getCartTotal();
  const totalUSDT = (totalARS * USDT_RATE).toFixed(2);

  alert(
    `Para completar el pago en USDT (BEP20):\n\n` +
      `1) Enviá ${totalUSDT} USDT a esta wallet:\n` +
      `${USDT_WALLET}\n\n` +
      `2) Enviá el comprobante por el canal que definas (mail / soporte / etc.).`
  );
}


// ==========================
// INICIALIZACIÓN GLOBAL
// ==========================

document.addEventListener("DOMContentLoaded", () => {
  loadCartFromStorage();
  updateCartBadge();
  renderCartPage();
  renderCheckoutPage();
  renderPaymentAmounts();

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
});
