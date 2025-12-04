// api/create-stripe-checkout.js

const Stripe = require("stripe");

// ─────────────────────────────────────────────
//  Helper CORS
// ─────────────────────────────────────────────
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async (req, res) => {
  setCors(res);

  // Preflight CORS
  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  try {
    // 🔑 Aseguramos que exista la clave secreta de Stripe
    const stripeSecret =
      process.env.STRIPE_SECRET_KEY ||
      process.env.STRIPE_SECRET_TEST ||
      process.env.STRIPE_SECRET;

    if (!stripeSecret) {
      throw new Error(
        "No se encontró STRIPE_SECRET_KEY en las variables de entorno de Vercel."
      );
    }

    const stripe = new Stripe(stripeSecret, {
      apiVersion: "2022-11-15",
    });

    // Vercel ya parsea JSON (porque mandamos application/json)
    const {
      items = [],
      buyerName = "",
      buyerEmail = "",
      buyerWhatsApp = "",
      successUrl,
      cancelUrl,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("No hay items para cobrar.");
    }

    // Construimos line_items para Stripe
    const line_items = items.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: item.name || "Producto TSF",
        },
        // item.price llega en CENTAVOS desde el front
        unit_amount: Number(item.price || 0),
      },
      quantity: Number(item.quantity || 1),
    }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      customer_email: buyerEmail || undefined,
      metadata: {
        buyerName,
        buyerWhatsApp,
        cart: JSON.stringify(items),
      },
      success_url:
        successUrl ||
        "https://tradingsinfronteras-shop.vercel.app/checkout-success-stripe.html",
      cancel_url:
        cancelUrl ||
        "https://tradingsinfronteras-shop.vercel.app/cart.html",
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ url: session.url }));
  } catch (err) {
    console.error("Error creando sesión de Stripe:", err);

    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        error: "Error al crear la sesión de pago con Stripe.",
        message: err.message, // 👈 MUY IMPORTANTE PARA VER EL MOTIVO REAL
      })
    );
  }
};
