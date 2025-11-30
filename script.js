// script.js

let cartCount = 0;

function updateCartBadge() {
  const btn = document.querySelector('.btn-cart');
  if (btn) btn.textContent = `Carrito (${cartCount})`;
}

function addToCart(productName) {
  cartCount++;
  updateCartBadge();
  console.log(`Agregado al carrito: ${productName}`);
}

document.addEventListener('DOMContentLoaded', () => {
  const yearSpan = document.getElementById('year');
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();
  updateCartBadge();
});
