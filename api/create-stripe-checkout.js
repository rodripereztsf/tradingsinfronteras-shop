// api/create-stripe-checkout.js
import Stripe from "stripe";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function toCurrency(val) {
  return String(val || "usd").trim().toLowerCase();
}

// Normaliza WhatsApp venga como venga
function pickWhatsapp(body, customer) {
  const w =
    customer?.whatsapp ||
    customer?.buyerWhatsApp ||
    customer?.buyer_whatsapp ||
    customer?.whatsApp ||
    body?.buyerWhatsApp ||
    body?.buyer_whatsapp ||
    body?.whatsapp ||
    "";

  return String(w || "").trim();
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res
        .status(500)
        .json({ error: "Missing STRIPE_SECRET_KEY in Vercel env" });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const body = req.body || {};

    // --- Soportar FORMATO NUEVO (customer/cart) ---
    let customer = body.customer || null;
    let cart = body.cart || null;
    const currency = toCurrency(body.currency);

    // --- Soportar FORMATO VIEJO (items + buyerX) ---
    if (!customer && (body.buyerName || body.buyerEmail || body.buyerWhatsApp)) {
      customer = {
        name: body.buyerName,
        email: body.buyerEmail,
        whatsapp: body.buyerWhatsApp,
      };
    }

    if (!cart && Array.isArray(body.items)) {
      cart = body.items.map((it) => ({
        name: it.name,
        price: it.price, // centavos
        qty: it.quantity || 1,
      }));
    }

    // Validaciones
    if (!customer?.name || !customer?.email) {
      return res.status(400).json({
        error: "Missing customer data",
        details: { name: !!customer?.name, email: !!customer?.email },
      });
    }

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Empty cart" });
    }

    // WhatsApp blindado
    const whatsapp = pickWhatsapp(body, customer);

    // Line items: tu precio ya está en centavos
    const line_items = cart.map((item, idx) => {
      const name = String(item?.name || `Item ${idx + 1}`);
      const qty = Number(item?.qty || 1);

      const priceCents = Number(item?.price);
      if (!Number.isFinite(priceCents) || priceCents <= 0) {
        throw new Error(
          `Invalid price (cents) for "${name}". Got: ${item?.price}`
        );
      }

      return {
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        price_data: {
          currency,
          product_data: { name },
          unit_amount: Math.round(priceCents), // ya son centavos
        },
      };
    });

    // URLs: ojo con el baseUrl (ideal: tu url completa con /tradingsinfronteras-shop)
    const baseUrl =
      (process.env.ACCESS_BASE_URL && process.env.ACCESS_BASE_URL.trim()) ||
      (process.env.PUBLIC_SITE_URL && process.env.PUBLIC_SITE_URL.trim()) ||
      "https://rodripereztsf.github.io/tradingsinfronteras-shop";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${baseUrl}/checkout-success-stripe.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart.html`,
      customer_email: customer.email,

      // Metadata en Session (sirve para completed/expired)
      metadata: {
        name: String(customer.name),
        email: String(customer.email),
        whatsapp, // ✅ SIEMPRE ACÁ
        currency,
      },

      // Metadata en PaymentIntent (sirve para payment_failed)
      payment_intent_data: {
        metadata: {
          name: String(customer.name),
          email: String(customer.email),
          whatsapp, // ✅ SIEMPRE ACÁ TAMBIÉN
          currency,
        },
      },
    });

    return res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return res.status(500).json({
      error: "Stripe checkout failed",
      message: err?.message || String(err),
      type: err?.type,
      code: err?.code,
    });
  }
}
