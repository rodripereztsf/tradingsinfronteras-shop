// api/admin-affiliates.js
// Configuración de vendedores (affiliates) + comisiones en Upstash

const { Redis } = require("@upstash/redis");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
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

async function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function sanitizeId(id) {
  return String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "");
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const redis = getRedis();

    let config = await redis.get("tsf:affiliate_config");
    if (!config || typeof config !== "object") config = {};

    // estructura:
    // config = {
    //   default_commission_pct: 10,
    //   affiliates: [{ id, name, commission_pct, is_active, created_at }]
    // }

    if (typeof config.default_commission_pct !== "number") {
      config.default_commission_pct = 10; // default si no existe
    }
    if (!Array.isArray(config.affiliates)) config.affiliates = [];

    // GET
    if (req.method === "GET") {
      return res.status(200).json({ config });
    }

    // POST create/update
    if (req.method === "POST") {
      const body = await parseBody(req);

      // actualizar default
      if (body && body.set_default === true) {
        const pct = Number(body.default_commission_pct);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
          return res.status(400).json({ error: "default_commission_pct inválido (0..100)" });
        }
        config.default_commission_pct = pct;
        await redis.set("tsf:affiliate_config", config);
        return res.status(200).json({ ok: true, config });
      }

      // upsert affiliate
      const id = sanitizeId(body.id);
      const name = String(body.name || "").trim();
      const is_active = body.is_active !== false;

      if (!id || id.length < 3) {
        return res.status(400).json({ error: "id inválido (mínimo 3 caracteres, solo a-z 0-9 _ -)" });
      }
      if (!name) {
        return res.status(400).json({ error: "Falta name" });
      }

      let commission_pct = body.commission_pct;
      if (commission_pct === "" || commission_pct === null || commission_pct === undefined) {
        commission_pct = null; // null => usa default
      } else {
        commission_pct = Number(commission_pct);
        if (!Number.isFinite(commission_pct) || commission_pct < 0 || commission_pct > 100) {
          return res.status(400).json({ error: "commission_pct inválido (0..100) o vacío para usar default" });
        }
      }

      const now = new Date().toISOString();
      const idx = config.affiliates.findIndex((a) => a.id === id);
      const row = {
        id,
        name,
        commission_pct, // number o null
        is_active,
        updated_at: now,
        created_at: idx >= 0 ? config.affiliates[idx].created_at : now,
      };

      if (idx >= 0) config.affiliates[idx] = row;
      else config.affiliates.push(row);

      await redis.set("tsf:affiliate_config", config);
      return res.status(200).json({ ok: true, affiliate: row, config });
    }

    // DELETE affiliate
    if (req.method === "DELETE") {
      const body = await parseBody(req);
      const id = sanitizeId(body.id);

      if (!id) return res.status(400).json({ error: "Falta id" });

      config.affiliates = config.affiliates.filter((a) => a.id !== id);
      await redis.set("tsf:affiliate_config", config);
      return res.status(200).json({ ok: true, config });
    }
  } catch (err) {
    console.error("Error en /api/admin-affiliates:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
