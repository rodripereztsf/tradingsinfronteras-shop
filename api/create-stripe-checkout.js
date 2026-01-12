// api/create-stripe-checkout.js

import Stripe from "stripe";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);

  // Preflight CORS
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1) Env vars mínimas
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        error: "Missing STRIPE_SECRET_KEY in Vercel env",
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // 2) Body
    const body = req.body || {};
    const customer = body.customer || {};
    const cart = body.cart || [];
    const currencyRaw = body.currency || "usd";
    const currency = String(currencyRaw).trim().toLowerCase();

    // 3) Validaciones básicas
    if (!customer.name || !customer.email) {
      return res.status(400).json({
        error: "Missing customer data",
        details: { name: !!customer.name, email: !!customer.email },
      });
    }

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Empty cart" });
    }

    // 4) Line items (Stripe requiere unit_amount entero)
    const line_items = cart.map((item, idx) => {
      const name = String(item?.name || `Item ${idx + 1}`);
      const qty = Number(item?.qty || 1);

      const priceNum = Number(item?.price);
      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        throw new Error(`Invalid price for "${name}". Got: ${item?.price}`);
      }

      const unit_amount = Math.round(priceNum * 100); // centavos

      return {
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        price_data: {
          currency,
          product_data: { name },
          unit_amount,
        },
      };
    });

    // 5) URLs completas para Stripe (sí o sí https://)
    const baseUrl =
      (process.env.PUBLIC_SITE_URL && process.env.PUBLIC_SITE_URL.trim()) ||
      "https://rodripereztsf.github.io";

    const successUrl = `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/cancel.html`;

    // 6) Crear sesión
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: customer.email,
      metadata: {
        name: String(customer.name),
        email: String(customer.email),
        whatsapp: String(customer.whatsapp || ""),
        currency,
      },
    });

    // 7) Respuesta OK
    return res.status(200).json({
      url: session.url,
      id: session.id,
    });
  } catch (err) {
    // Importante: devolver mensaje legible para debug
    console.error("Stripe checkout error:", err);

    return res.status(500).json({
      error: "Stripe checkout failed",
      message: err?.message || String(err),
      type: err?.type,
      code: err?.code,
    });
  }
}
