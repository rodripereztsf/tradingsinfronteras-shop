// api/admin-sales.js
// Lee ventas desde Upstash: tsf:sales (array JSON)

const { Redis } = require("@upstash/redis");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

let redisClient = null;
function getRedis() {
  if (!redisClient) {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redisClient;
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const redis = getRedis();
    let sales = await redis.get("tsf:sales");
    if (!Array.isArray(sales)) sales = [];

    // filtros
    const seller = String(req.query?.seller || "").trim().toLowerCase(); // seller_ref
    const q = String(req.query?.q || "").trim().toLowerCase(); // search email/checkout id
    const limit = Math.min(Math.max(Number(req.query?.limit || 200), 1), 2000);

    let out = sales.slice().reverse(); // newest first (si guardamos append)

    if (seller) out = out.filter((s) => String(s.seller_ref || "").toLowerCase() === seller);
    if (q) {
      out = out.filter((s) => {
        const hay = `${s.buyer_email || ""} ${s.session_id || ""} ${s.payment_intent || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    out = out.slice(0, limit);

    return res.status(200).json({ sales: out, total: out.length });
  } catch (err) {
    console.error("Error en /api/admin-sales:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
