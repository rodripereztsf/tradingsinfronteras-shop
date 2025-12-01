// api/create-stripe-checkout.js
const Stripe = require("stripe");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Opcional: podés poner tu dominio exacto en vez de "*"
const setCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://rodripereztsf.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

module.exports = async (req, res) => {
  setCors(res);

  // Preflight CORS (OPTIONS) → responde OK y corta
  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  // Solo aceptamos POST
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const { items, successUrl, cancelUrl } = req.body;

    // items: [{ name, price, qty }]
    const USD_RATE = 1 / 1000; // MISMO VALOR QUE EN script.js

    const line_items = items.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: item.name,
        },
        unit_amount: Math.round(item.price * USD_RATE * 100), // en centavos
      },
      quantity: item.qty,
    }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ url: session.url }));
  } catch (err) {
    console.error("Stripe error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Error creating Stripe checkout" }));
  }
};
