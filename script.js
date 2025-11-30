// script.js

// --- Estado del carrito en localStorage ---
let cart = [];

function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem('tsfCart');
    cart = saved ? JSON.parse(saved) : [];
  } catch (e) {
    cart = [];
  }
}

function saveCartToStorage() {
  localStorage.setItem('tsfCart', JSON.stringify(cart));
}

// --- Badge del carrito en el header ---
function updateCartBadge() {
  const btn = document.querySelector('.btn-cart');
  if (!btn) return;

  const totalItems = cart.reduce((acc, item) => acc + item.qty, 0);
  btn.textContent = `Carrito (${totalItems})`;
}

// --- Agregar producto al carrito ---
function addToCart(name, price) {
  const numericPrice = Number(price) || 0;

  const existingIndex = cart.findIndex(item => item.name === name);
  if (existingIndex !== -1) {
    cart[existingIndex].qty += 1;
  } else {
    cart.push({ name, price: numericPrice, qty: 1 });
  }

  saveCartToStorage();
  updateCartBadge();
  alert(`Se agregó al carrito: ${name}`);
}

// --- Render de la página de carrito (cart.html) ---
function renderCartPage() {
  const tableBody = document.getElementById('cart-items');
  const cartWrapper = document.getElementById('cart-wrapper');
  const cartEmpty = document.getElementById('cart-empty');
  const totalSpan = document.getElementById('cart-total');

  // Si no estamos en cart.html, no hace nada
  if (!tableBody || !cartWrapper || !cartEmpty || !totalSpan) return;

  if (cart.length === 0) {
    cartWrapper.style.display = 'none';
    cartEmpty.style.display = 'block';
    totalSpan.textContent = '$0';
    return;
  }

  cartWrapper.style.display = 'block';
  cartEmpty.style.display = 'none';

  tableBody.innerHTML = '';
  let total = 0;

  cart.forEach((item, index) => {
    const subtotal = item.price * item.qty;
    total += subtotal;

    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = item.name;

    const tdQty = document.createElement('td');
    tdQty.className = 'th-center';
    tdQty.textContent = item.qty;

    const tdSubtotal = document.createElement('td');
    tdSubtotal.className = 'th-right';
    tdSubtotal.textContent = formatCurrency(subtotal);

    const tdRemove = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = 'X';
    btn.className = 'btn-remove';
    btn.onclick = () => removeFromCart(index);
    tdRemove.appendChild(btn);

    tr.appendChild(tdName);
    tr.appendChild(tdQty);
    tr.appendChild(tdSubtotal);
    tr.appendChild(tdRemove);

    tableBody.appendChild(tr);
  });

  totalSpan.textContent = formatCurrency(total);
}

// --- Quitar producto del carrito ---
function removeFromCart(index) {
  cart.splice(index, 1);
  saveCartToStorage();
  updateCartBadge();
  renderCartPage();
}

// --- Utilidad para formato moneda (ARS por defecto) ---
function formatCurrency(value) {
  return `$${value.toLocaleString('es-AR')}`;
}

// --- Inicialización global ---
document.addEventListener('DOMContentLoaded', () => {
  const yearSpan = document.getElementById('year');
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  loadCartFromStorage();
  updateCartBadge();
  renderCartPage();
});
