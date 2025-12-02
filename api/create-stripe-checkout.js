// api/create-stripe-checkout.js

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// ---------------------------------------------------------
// CORS (ajustá el origin si querés limitarlo solo a tu dominio)
// ---------------------------------------------------------
const setCors = (res) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://rodripereztst.github.io" // tu tienda en GitHub Pages
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
};

module.exports = async (req, res) => {
  setCors(res);

  // Pre-flight CORS
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
    const { items, successUrl, cancelUrl } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Cart is empty" }));
    }

    // ⚠️ ESTE RATE TIENE QUE MATCHEAR CON EL DEL FRONT (script.js)
    // Si tu precio en la tienda es "USD 149.90" y en el código lo manejás como 14990,
    // este RATE = 1 / 1000 convierte 14990 -> 14.99 USD para Stripe.
    const USD_RATE = 1 / 1000;

    // ---------------------------------------------------------
    // Construimos line_items para Stripe, asegurando quantity
    // ---------------------------------------------------------
    const line_items = items.map((item, index) => {
      const name = item.name || `Producto ${index + 1}`;
      const priceNumber = Number(item.price) || 0;

      // Aceptamos tanto "quantity" como "qty" desde el front
      const quantity =
        Number(item.quantity ?? item.qty ?? 1) || 1;

      return {
        price_data: {
          currency: "usd",
          product_data: { name },
          // priceNumber viene en “miles” (14990) => lo llevamos a 14.99 USD
          unit_amount: Math.round(priceNumber * USD_RATE * 100), // en centavos
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
