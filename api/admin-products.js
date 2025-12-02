// api/admin-products.js

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "tsfadmin2025";

const setCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,x-admin-token"
  );
};

// helper para Upstash Redis
let redisPromise = null;
async function getRedis() {
  if (!redisPromise) {
    redisPromise = import("@upstash/redis").then(({ Redis }) => {
      return new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
    });
  }
  return redisPromise;
}

function unauthorized(res) {
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Unauthorized" }));
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  // token simple por header
  const token =
    req.headers["x-admin-token"] || req.headers["x-admin-token".toLowerCase()];
  if (!token || token !== ADMIN_TOKEN) {
    return unauthorized(res);
  }

  // ------------------
  // GET → lista TODOS los productos (activos e inactivos)
  // ------------------
  if (req.method === "GET") {
    try {
      const redis = await getRedis();
      let products = await redis.get("tsf:products");
      if (!Array.isArray(products)) products = [];

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ products }));
    } catch (err) {
      console.error("Error GET /admin-products:", err);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }

  // ------------------
  // POST → crea un nuevo producto
  // ------------------
  if (req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", async () => {
      try {
        const data = JSON.parse(body || "{}");

        // generar id si no viene
        const id =
          data.id ||
          (data.name || "producto")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") +
            "-" +
            Date.now().toString(36);

        const product = {
          id,
          name: data.name || "Producto sin nombre",
          type: data.type || "other",
          short_description: data.short_description || "",
          price_cents: Number(data.price_cents || 0),
          currency: "USD",
          image_url: data.image_url || "",
          is_active: Boolean(data.is_active),
          delivery_type: data.delivery_type || "none",
          delivery_value: data.delivery_value || "",
        };

        const redis = await getRedis();
        let products = await redis.get("tsf:products");
        if (!Array.isArray(products)) products = [];

        products.push(product);
        await redis.set("tsf:products", products);

        res.statusCode = 201;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ ok: true, product }));
      } catch (err) {
        console.error("Error POST /admin-products:", err);
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: "Invalid body" }));
      }
    });
    return;
  }

  // Otros métodos no permitidos
  res.statusCode = 405;
  res.setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify({ error: "Method not allowed" }));
};
