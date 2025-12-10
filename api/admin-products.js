// api/admin-products.js
//
// CRUD de productos TSF SHOP sobre Upstash Redis
// Incluye flag is_featured para "Productos destacados"

const { Redis } = require("@upstash/redis");

// ---------------------------
// Helpers
// ---------------------------

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

function generateIdFromName(name = "") {
  return (
    name
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") +
    "-" +
    Date.now().toString(36)
  );
}

// Parsear body seguro
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

// ---------------------------
// Handler principal
// ---------------------------

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  try {
    const redis = await getRedis();
    let products = await redis.get("tsf:products");
    if (!Array.isArray(products)) products = [];

    // -------- GET: listado completo para el panel admin --------
    if (req.method === "GET") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ products }));
    }

    // -------- POST: crear / actualizar producto --------
    if (req.method === "POST") {
      const payload = await parseBody(req);

      const {
        id,
        name,
        type,
        short_description,
        price_cents,
        currency,
        image_url,
        is_active,
        delivery_type,
        delivery_value,
        email_subject,
        email_body,
        pdf_url,
        is_featured, // true/false/"true"/"false"/1/"1"
      } = payload || {};

      if (!name || !price_cents) {
        res.statusCode = 400;
        return res.end(
          JSON.stringify({ error: "Faltan campos: name o price_cents" })
        );
      }

      // Normalizaciones
      const normalizedIsActive = is_active !== false;
      const normalizedIsFeatured =
        is_featured === true ||
        is_featured === "true" ||
        is_featured === 1 ||
        is_featured === "1";

      const productId = id || generateIdFromName(name);

      const normalizedProduct = {
        id: productId,
        name,
        type: type || "other",
        short_description: short_description || "",
        price_cents: Number(price_cents),
        currency: currency || "USD",
        image_url: image_url || "",
        is_active: normalizedIsActive,
        delivery_type: delivery_type || "none",
        delivery_value: delivery_value || "",
        email_subject:
          email_subject ||
          `Tu compra en Trading Sin Fronteras – ${name}`,
        email_body: email_body || "",
        pdf_url: pdf_url || "",
        // 👇 Flag para "Productos destacados"
        // Los viejos (sin campo) se consideran destacados hasta que los edites.
        is_featured:
          is_featured === undefined ? true : normalizedIsFeatured,
      };

      const index = products.findIndex((p) => p.id === productId);
      if (index >= 0) {
        products[index] = normalizedProduct;
      } else {
        products.push(normalizedProduct);
      }

      await redis.set("tsf:products", products);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ product: normalizedProduct }));
    }

    // -------- DELETE: borrar producto --------
    if (req.method === "DELETE") {
      const body = await parseBody(req);
      const id = body.id || (req.query ? req.query.id : null);

      if (!id) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Falta id para borrar" }));
      }

      const newProducts = products.filter((p) => p.id !== id);
      await redis.set("tsf:products", newProducts);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true }));
    }

    // -------- Método no permitido --------
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  } catch (err) {
    console.error("Error en /api/admin-products:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Internal server error" }));
  }
};
