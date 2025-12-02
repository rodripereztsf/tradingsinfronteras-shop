// ===============================
// CARRITO EN LOCALSTORAGE
// ===============================

let cart = [];

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

  totalSpan.textContent = (total / 100).toFixed(2);
}

// ===============================
// STRIPE
// ===============================

// Cambiá esto por el dominio de tu backend en Vercel si fuera distinto
const API_BASE = "https://tradingsinfronteras-shop.vercel.app";

async function payWithStripe() {
  const cart = loadCartFromStorage(); // o como se llame tu función

  if (!cart || cart.length === 0) {
    alert("Tu carrito está vacío.");
    return;
  }

  try {
    const successUrl = window.location.origin + "/checkout-success-stripe.html";
    const cancelUrl = window.location.href;

    const response = await fetch(
      `${API_BASE}/api/create-stripe-checkout`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((item) => ({
            // mandamos TODO por las dudas
            name: item.name,
            price: item.price,
            qty: item.qty,          // 👈 importante
            quantity: item.qty,     // 👈 también lo mando con este nombre
          })),
          successUrl,
          cancelUrl,
        }),
      }
    );

    const data = await response.json();

    console.log("Stripe response:", data);

    if (data?.url) {
      window.location.href = data.url;
    } else {
      console.error("Respuesta Stripe inesperada:", data);
      alert("No se pudo crear el pago con Stripe.");
    }
  } catch (e) {
    console.error(e);
    alert("Error al conectar con Stripe.");
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
  renderCartPage();
});
