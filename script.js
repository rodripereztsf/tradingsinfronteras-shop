// ===============================
// CARRITO EN LOCALSTORAGE
// ===============================

let cart = [];

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
  // 👉 devolvemos el carrito por si en algún lado lo querés usar
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
// RENDER DE PRODUCTOS (index.html)
// ===============================

async function renderProductsOnHome() {
  const container = document.getElementById("products-grid");
  if (!container) return; // si no estamos en index, no hace nada

  container.innerHTML = "<p>Cargando productos...</p>";

  try {
    const response = await fetch(
      "https://tradingsinfronteras-shop.vercel.app/api/products"
    );
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
      card.className = "producto"; // usa tu clase existente para mantener estilos

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
// --- Validación de datos de contacto en el carrito ---

const nameInput = document.getElementById("contact-name");
const emailInput = document.getElementById("contact-email");
const whatsappInput = document.getElementById("contact-whatsapp");
const payButton = document.getElementById("pay-button");

function isValidEmail(email) {
  // Validación simple, suficiente para este caso
  return /\S+@\S+\.\S+/.test(email);
}

function isValidWhatsapp(value) {
  // Chequeo muy básico: que tenga al menos 8 caracteres y un número
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

// Escuchamos cambios en todos los campos
if (nameInput && emailInput && whatsappInput) {
  ["input", "blur"].forEach((evt) => {
    nameInput.addEventListener(evt, updatePayButtonState);
    emailInput.addEventListener(evt, updatePayButtonState);
    whatsappInput.addEventListener(evt, updatePayButtonState);
  });

  // Estado inicial
  updatePayButtonState();
}

// ===============================
// STRIPE
// ===============================

// Cambiá esto por el dominio de tu backend en Vercel si fuera distinto
const API_BASE = "https://tradingsinfronteras-shop.vercel.app";
// Si en algún momento lo querés hacer relativo, podrías usar:
// const API_BASE = "";

async function payWithStripe() {
  // Nos aseguramos de tener el carrito actualizado desde localStorage
  loadCartFromStorage();

  if (!cart || cart.length === 0) {
    alert("Tu carrito está vacío.");
    return;
  }

  // Leer datos del formulario
  const nameInput = document.getElementById("buyer-name");
  const emailInput = document.getElementById("buyer-email");
  const waInput = document.getElementById("buyer-whatsapp");

  const buyerName = (nameInput?.value || "").trim();
  const buyerEmail = (emailInput?.value || "").trim();
  const buyerWhatsApp = (waInput?.value || "").trim();

  if (!buyerEmail || !buyerWhatsApp) {
    alert("Por favor completá al menos tu email y tu WhatsApp para continuar.");
    if (!buyerEmail && emailInput) emailInput.focus();
    else if (!buyerWhatsApp && waInput) waInput.focus();
    return;
  }

  try {
    const successUrl = window.location.origin + "/checkout-success-stripe.html";
    const cancelUrl = window.location.href;

    const payload = {
      items: cart.map((item) => ({
        name: item.name,
        price: item.price,                 // en centavos (tu formato actual)
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
  renderCartPage();       // si estamos en cart.html

  // Renderizar productos dinámicamente en index.html
  renderProductsOnHome(); // si estamos en index.html
});
