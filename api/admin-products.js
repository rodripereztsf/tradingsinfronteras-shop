// api/admin-products.js
//
// CRUD de productos para el panel admin TSF SHOP
// Usa el mismo key de Redis que /api/products: "tsf:products"

const { Redis } = require("@upstash/redis");

const REDIS_KEY = "tsf:products";

const setCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        if (!body) return resolve({});
        const parsed = JSON.parse(body);
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

async function loadProducts(redis) {
  let products = await redis.get(REDIS_KEY);
  if (!Array.isArray(products)) products = [];
  return products;
}

async function saveProducts(redis, products) {
  await redis.set(REDIS_KEY, products);
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  try {
    const redis = await getRedis();
    const url = new URL(req.url, `http://${req.headers.host}`);
    const id = url.searchParams.get("id");

    // =======================
    // GET -> listar productos
    // =======================
    if (req.method === "GET") {
      const products = await loadProducts(redis);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ products }));
    }

    // =======================
    // POST -> crear producto
    // =======================
    if (req.method === "POST") {
      const body = await parseBody(req);

      const products = await loadProducts(redis);

      // si no viene id, generamos uno simple
      const newId =
        body.id ||
        (body.name || "producto")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, "") +
          "-" +
          Date.now().toString(36);

      const product = {
        id: newId,
        name: body.name || "Producto sin nombre",
        type: body.type || "other",
        short_description: body.short_description || "",
        price_cents: Number(body.price_cents) || 0,
        currency: body.currency || "USD",
        image_url: body.image_url || "",
        is_active: Boolean(body.is_active),
        delivery_type: body.delivery_type || "drive_link",
        delivery_value: body.delivery_value || "",
        instructions: body.instructions || "",
        pdf_url: body.pdf_url || "",
      };

      products.push(product);
      await saveProducts(redis, products);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true, product }));
    }

    // =======================
    // PUT -> actualizar producto
    // =======================
    if (req.method === "PUT") {
      if (!id) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: "Missing id" }));
      }

      const body = await parseBody(req);
      const products = await loadProducts(redis);
      const idx = products.findIndex((p) => p.id === id);

      if (idx === -1) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: "Product not found" }));
      }

      const prev = products[idx];

      const updated = {
        ...prev,
        name: body.name ?? prev.name,
        type: body.type ?? prev.type,
        short_description: body.short_description ?? prev.short_description,
        price_cents:
          body.price_cents !== undefined
            ? Number(body.price_cents) || 0
            : prev.price_cents,
        currency: body.currency ?? prev.currency,
        image_url: body.image_url ?? prev.image_url,
        is_active:
          body.is_active !== undefined
            ? Boolean(body.is_active)
            : prev.is_active,
        delivery_type: body.delivery_type ?? prev.delivery_type,
        delivery_value: body.delivery_value ?? prev.delivery_value,
        instructions: body.instructions ?? prev.instructions,
        pdf_url: body.pdf_url ?? prev.pdf_url,
      };

      products[idx] = updated;
      await saveProducts(redis, products);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true, product: updated }));
    }

    // =======================
    // DELETE -> eliminar producto
    // =======================
    if (req.method === "DELETE") {
      if (!id) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: "Missing id" }));
      }

      const products = await loadProducts(redis);
      const newProducts = products.filter((p) => p.id !== id);

      await saveProducts(redis, newProducts);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true }));
    }

    // Si llega algún método raro
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  } catch (err) {
    console.error("admin-products error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        error: "Internal server error",
        message: err?.message,
      })
    );
  }
};
