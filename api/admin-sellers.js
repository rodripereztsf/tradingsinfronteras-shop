// api/admin-sellers.js
//
// CRUD de vendedores TSF SHOP sobre Upstash Redis
// Guarda en key: tsf:sellers

const { Redis } = require("@upstash/redis");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
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

async function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function sanitizeRef(ref = "") {
  return ref
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  try {
    const redis = await getRedis();
    let sellers = await redis.get("tsf:sellers");
    if (!Array.isArray(sellers)) sellers = [];

    // GET: listar
    if (req.method === "GET") {
      revealEmails = false;
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ sellers }));
    }

    // POST: crear/actualizar
    if (req.method === "POST") {
      const payload = await parseBody(req);
      const name = (payload?.name || "").trim();
      const ref_id = sanitizeRef(payload?.ref_id || "");
      const commission_pct = Number(payload?.commission_pct ?? payload?.commission ?? 0);

      if (!name || !ref_id) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: "Faltan campos: name o ref_id" }));
      }

      if (!Number.isFinite(commission_pct) || commission_pct < 0 || commission_pct > 100) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: "commission_pct inválida (0 a 100)" }));
      }

      const normalized = {
        id: ref_id,
        name,
        ref_id,
        commission_pct,
        is_active: payload?.is_active !== false,
        created_at: payload?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const idx = sellers.findIndex((s) => s.ref_id === ref_id);
      if (idx >= 0) sellers[idx] = { ...sellers[idx], ...normalized };
      else sellers.push(normalized);

      await redis.set("tsf:sellers", sellers);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ seller: normalized, sellers }));
    }

    // DELETE: borrar
    if (req.method === "DELETE") {
      const body = await parseBody(req);
      const ref_id = sanitizeRef(body?.ref_id || body?.id || "");

      if (!ref_id) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: "Falta ref_id para borrar" }));
      }

      sellers = sellers.filter((s) => s.ref_id !== ref_id);
      await redis.set("tsf:sellers", sellers);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true }));
    }

    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  } catch (err) {
    console.error("Error en /api/admin-sellers:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Internal server error" }));
  }
};
