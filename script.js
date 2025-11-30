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
document.addEventListener("DOMContentLoaded", () => {
  loadCartFromStorage();
  updateCartBadge();
  renderCartPage();
  renderCheckoutPage();

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
});
