// api/admin-sales.js
//
// Lee Stripe Checkout Sessions (paid) y cruza seller_ref con tsf:sellers en Upstash.
// Calcula comisión automáticamente usando commission_pct del seller.

const Stripe = require("stripe");
const { Redis } = require("@upstash/redis");

function setCors(res) {
  // Podés dejar "*" como en admin-sellers por ahora, ya que tu admin panel es público estático.
  // Si querés endurecer seguridad, lo ajustamos luego con allowlist.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

let redisClient = null;
async function getRedis() {
  if (!redisClient) {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redisClient;
}

function pctToRate(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return 0.2;
  return Math.max(0, Math.min(1, n / 100));
}

function toISOFromUnixSeconds(sec) {
  if (!sec) return null;
  return new Date(sec * 1000).toISOString();
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Falta STRIPE_SECRET_KEY en Vercel" }));
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });

    // ---- Query params ----
    const url = new URL(req.url, "http://localhost");
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
    const starting_after = url.searchParams.get("starting_after") || undefined;

    const refFilterRaw = (url.searchParams.get("ref") || "").trim().toLowerCase();
    const days = Number(url.searchParams.get("days") || 0);

    let createdGte = undefined;
    if (Number.isFinite(days) && days > 0) {
      const nowSec = Math.floor(Date.now() / 1000);
      createdGte = nowSec - Math.floor(days * 24 * 60 * 60);
    }

    // ---- Load sellers from Upstash ----
    const redis = await getRedis();
    let sellers = await redis.get("tsf:sellers");
    if (!Array.isArray(sellers)) sellers = [];

    const sellersMap = {};
    for (const s of sellers) {
      if (s?.ref_id) sellersMap[String(s.ref_id).toLowerCase()] = s;
    }

    // ---- Stripe sessions list ----
    // Nota: list() no filtra perfecto por "paid", por eso filtramos localmente.
    const sessions = await stripe.checkout.sessions.list({
      limit,
      ...(starting_after ? { starting_after } : {}),
      ...(createdGte ? { created: { gte: createdGte } } : {}),
      // expandimos customer para email si está disponible (a veces ya viene en customer_details)
      expand: ["data.customer"],
    });

    const paid = sessions.data.filter((s) => s.payment_status === "paid");

    // Normalizamos ventas
    let sales = paid.map((s) => {
      const seller_ref =
        (s.metadata && (s.metadata.seller_ref || s.metadata.sellerRef)) ||
        s.client_reference_id ||
        "";

      const seller_ref_norm = String(seller_ref || "").trim().toLowerCase();

      const amount_total = typeof s.amount_total === "number" ? s.amount_total : 0; // centavos
      const currency = (s.currency || "usd").toLowerCase();

      const customer_email =
        s.customer_details?.email ||
        (typeof s.customer === "object" ? s.customer.email : null) ||
        null;

      return {
        session_id: s.id,
        created: toISOFromUnixSeconds(s.created),
        amount_total,
        currency,
        customer_email,
        seller_ref: seller_ref_norm || null,
        payment_intent: s.payment_intent || null,
      };
    });

    // Filtro por seller_ref si viene
    if (refFilterRaw) {
      sales = sales.filter((x) => (x.seller_ref || "") === refFilterRaw);
    }

    // Agrupamos y calculamos comisiones
    const bySeller = {};

    for (const sale of sales) {
      const ref = sale.seller_ref || "sin_ref";
      const seller = sellersMap[ref] || null;

      const commission_rate = seller ? pctToRate(seller.commission_pct) : 0; // sin ref => 0 (podés poner default si querés)
      const commission_amount = Math.round(sale.amount_total * commission_rate);

      if (!bySeller[ref]) {
        bySeller[ref] = {
          seller_ref: ref,
          seller: seller
            ? {
                id: seller.id,
                name: seller.name,
                ref_id: seller.ref_id,
                commission_pct: seller.commission_pct,
                is_active: seller.is_active,
              }
            : null,
          totals: {
            orders: 0,
            gross_amount_total: 0, // centavos
            commission_total: 0,   // centavos
          },
          orders: [],
        };
      }

      bySeller[ref].totals.orders += 1;
      bySeller[ref].totals.gross_amount_total += sale.amount_total;
      bySeller[ref].totals.commission_total += commission_amount;

      bySeller[ref].orders.push({
        ...sale,
        commission_amount,   // centavos
        commission_rate,     // 0.30 por ej
      });
    }

    // Orden opcional: mayor venta primero
    const summary_by_seller = Object.values(bySeller).sort(
      (a, b) => (b.totals.gross_amount_total || 0) - (a.totals.gross_amount_total || 0)
    );

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        ok: true,
        page: {
          has_more: sessions.has_more,
          next_starting_after: sessions.data.length ? sessions.data[sessions.data.length - 1].id : null,
          returned_paid: sales.length,
        },
        sales,
        summary_by_seller,
      })
    );
  } catch (err) {
    console.error("Error en /api/admin-sales:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: err.message || "Internal server error" }));
  }
};
