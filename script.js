// --- Estado del carrito en localStorage ---
let cart = [];

// Cargar carrito desde storage
function loadCartFromStorage() {
  try {
    cart = JSON.parse(localStorage.getItem("tsfCart")) || [];
  } catch {
    cart = [];
  }
}

// Guardar carrito
function saveCartToStorage() {
  localStorage.setItem("tsfCart", JSON.stringify(cart));
}

// Actualizar badge del carrito
function updateCartBadge() {
  const btn = document.querySelector(".btn-cart");
  if (!btn) return;

  const total = cart.reduce((s, p) => s + p.qty, 0);
  btn.textContent = `Carrito (${total})`;
}

// Agregar producto al carrito
function addToCart(name, price) {
  const p = cart.find((i) => i.name === name);
  if (p) p.qty++;
  else cart.push({ name, price, qty: 1 });

  saveCartToStorage();
  updateCartBadge();
  alert(`Agregado al carrito: ${name}`);
}

// ----------------------
// Render Carrito (cart.html)
// ----------------------
function renderCartPage() {
  const tbody = document.getElementById("cart-items");
  const totalSpan = document.getElementById("cart-total");
  const cartWrapper = document.getElementById("cart-wrapper");
  const emptyMsg = document.getElementById("cart-empty");

  if (!tbody || !totalSpan) return;

  if (cart.length === 0) {
    cartWrapper.style.display = "none";
    emptyMsg.style.display = "block";
    totalSpan.textContent = "$0";
    return;
  }

  cartWrapper.style.display = "block";
  emptyMsg.style.display = "none";
  tbody.innerHTML = "";

  let total = 0;

  cart.forEach((item, index) => {
    const subtotal = item.qty * item.price;
    total += subtotal;

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${item.name}</td>
      <td class="th-center">${item.qty}</td>
      <td class="th-right">$${subtotal.toLocaleString("es-AR")}</td>
      <td><button class="btn-remove" onclick="removeFromCart(${index})">X</button></td>
    `;

    tbody.appendChild(row);
  });

  totalSpan.textContent = `$${total.toLocaleString("es-AR")}`;
}

// Quitar producto
function removeFromCart(index) {
  cart.splice(index, 1);
  saveCartToStorage();
  updateCartBadge();
  renderCartPage();
  renderCheckoutPage();
}

// ----------------------
// Render Checkout (checkout.html)
// ----------------------
function renderCheckoutPage() {
  const list = document.getElementById("checkout-items");
  const totalSpan = document.getElementById("checkout-total");

  if (!list || !totalSpan) return;

  if (cart.length === 0) {
    list.innerHTML = "<li>No hay productos en el pedido.</li>";
    totalSpan.textContent = "$0";
    return;
  }

  list.innerHTML = "";
  let total = 0;

  cart.forEach((item) => {
    const subtotal = item.qty * item.price;
    total += subtotal;

    const li = document.createElement("li");
    li.textContent = `${item.qty} × ${item.name} — $${subtotal.toLocaleString("es-AR")}`;
    list.appendChild(li);
  });

  totalSpan.textContent = `$${total.toLocaleString("es-AR")}`;
}

// ----------------------
// Inicio global
// ----------------------
// === Conversión de monedas ===
// Tasa aproximada: ajustala como quieras
const USD_RATE = 0.0010;  // 1 ARS = 0.0010 USD (ejemplo)
const USDT_RATE = USD_RATE;

// Obtener total del carrito en ARS
function getCartTotal() {
  return cart.reduce((sum, p) => sum + p.qty * p.price, 0);
}

// Renderizar montos en checkout
function renderPaymentAmounts() {
  const arsElem = document.getElementById("ars-amount");
  const usdElem = document.getElementById("usd-amount");
  const usdtElem = document.getElementById("usdt-amount");

  if (!arsElem || !usdElem || !usdtElem) return;

  const totalARS = getCartTotal();
  const totalUSD = (totalARS * USD_RATE).toFixed(2);
  const totalUSDT = (totalARS * USDT_RATE).toFixed(2);

  arsElem.textContent = `$${totalARS.toLocaleString("es-AR")}`;
  usdElem.textContent = `${totalUSD} USD`;
  usdtElem.textContent = `${totalUSDT} USDT`;
}

// === ACCIONES DE PAGO ===

// (1) Pagar con Stripe (USD)
function payWithStripe() {
  const totalARS = getCartTotal();
  const totalUSD = (totalARS * USD_RATE).toFixed(2);

  alert(`Redirigiendo a Stripe por ${totalUSD} USD (acá va tu link real)...`);

  // Ejemplo:
  // window.location.href = "https://checkout.stripe.com/pay/tu_link";
}

// (2) Pagar con USDT
function payWithUSDT() {
  const totalARS = getCartTotal();
  const totalUSDT = (totalARS * USDT_RATE).toFixed(2);

  alert(
    `Enviar ${totalUSDT} USDT (BEP20) a:\n\n0xTUWALLET...\n\n(*Después podés agregar un QR acá*)`
  );
}

// (3) Pagar con Mercado Pago (ARS)
function payWithMP() {
  const totalARS = getCartTotal();

  alert(`Redirigiendo a Mercado Pago por ${totalARS} ARS...`);

  // Ejemplo:
  // window.location.href = "https://mpago.la/tu_link";
}

document.addEventListener("DOMContentLoaded", () => {
  loadCartFromStorage();
  updateCartBadge();
  renderCartPage();
  renderCheckoutPage();
  renderPaymentAmounts();

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
});
