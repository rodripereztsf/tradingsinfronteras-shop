// api/create-stripe-checkout.js

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// CORS abierto (después, si querés, lo limitamos al dominio de la tienda)
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

    // En el front usamos precios en CENTAVOS reales (ej: 4900 = 49.00 USD)
    // Así que acá NO convertimos nada: Stripe espera centavos → le mandamos tal cual.
    const line_items = items.map((item, index) => {
      const name = item.name || `Producto ${index + 1}`;
      const priceCents = Number(item.price) || 0;
      const quantity = Number(item.quantity ?? item.qty ?? 1) || 1;

      return {
        price_data: {
          currency: "usd",
          product_data: { name },
          unit_amount: priceCents, // 4900 => 49.00 USD
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

    // Siempre respondemos JSON con CORS para que el front NO caiga en error de red
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
