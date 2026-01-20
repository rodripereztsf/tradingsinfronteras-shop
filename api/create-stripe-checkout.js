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

function sanitizeSellerRef(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY in Vercel env" });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const body = req.body || {};

    let customer = body.customer || null;
    let cart = body.cart || null;
    let currency = toCurrency(body.currency);

    // formato viejo
    if (!customer && (body.buyerName || body.buyerEmail || body.buyerWhatsApp)) {
      customer = { name: body.buyerName, email: body.buyerEmail, whatsapp: body.buyerWhatsApp };
    }
    if (!cart && Array.isArray(body.items)) {
      cart = body.items.map((it) => ({ name: it.name, price: it.price, qty: it.quantity || 1 }));
    }

    // seller ref (desde el front)
    const seller_ref = sanitizeSellerRef(body.seller_ref || body.sellerRef || "");

    if (!customer?.name || !customer?.email) {
      return res.status(400).json({ error: "Missing customer data" });
    }
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Empty cart" });
    }

    const line_items = cart.map((item, idx) => {
      const name = String(item?.name || `Item ${idx + 1}`);
      const qty = Number(item?.qty || 1);

      const priceCents = Number(item?.price);
      if (!Number.isFinite(priceCents) || priceCents <= 0) {
        throw new Error(`Invalid price (cents) for "${name}". Got: ${item?.price}`);
      }

      return {
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        price_data: {
          currency,
          product_data: { name },
          unit_amount: Math.round(priceCents),
        },
      };
    });

    const baseUrl =
      (process.env.PUBLIC_SITE_URL && process.env.PUBLIC_SITE_URL.trim()) ||
      "https://tradingsinfronteras.shop";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${baseUrl}/checkout-success-stripe.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart.html`,
      customer_email: customer.email,

      // ✅ esto hace que en Stripe lo veas claro
      client_reference_id: seller_ref || undefined,

      metadata: {
        name: String(customer.name),
        email: String(customer.email),
        whatsapp: String(customer.whatsapp || ""),
        currency,
        seller_ref: seller_ref || "",
      },
    });

    return res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return res.status(500).json({
      error: "Stripe checkout failed",
      message: err?.message || String(err),
    });
  }
}
