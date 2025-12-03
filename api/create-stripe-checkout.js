// api/create-stripe-checkout.js

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// CORS abierto para pruebas (después podemos limitar a tu dominio)
const setCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

module.exports = async (req, res) => {
  setCors(res);

  // Preflight
  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  // Solo POST
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  try {
    // En Vercel a veces req.body llega como string
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const { items, successUrl, cancelUrl } = body;

    if (!Array.isArray(items) || items.length === 0) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Cart is empty" }));
    }

    // IMPORTANTE: este RATE debe matchear con lo que usás en el front
    // Si en la tienda manejás 4990 = 49.90 USD, entonces:
    // USD_RATE = 1 / 100
    const USD_RATE = 1 / 100;

    const line_items = items.map((item, index) => {
      const name = item.name || `Producto ${index + 1}`;
      const priceNumber = Number(item.price) || 0; // lo mandamos en centavos "internos"

      const quantity = Number(item.quantity ?? item.qty ?? 1) || 1;

      return {
        price_data: {
          currency: "usd",
          product_data: { name },
          // Convertimos de tu "centavo interno" al centavo real de Stripe:
          // 4990 * (1/100) * 100 = 4990 → 49.90 USD
          unit_amount: Math.round(priceNumber * USD_RATE),
        },
        quantity,
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ url: session.url }));
  } catch (err) {
    console.error("Stripe error:", err);

    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        error: "Error creating Stripe checkout",
        message: err?.message,
      })
    );
  }
};
