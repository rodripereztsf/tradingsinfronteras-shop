// api/admin-products.js

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "tsfadmin2025";

const setCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS"
  );
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
        token: process.env.UPSTASH_REDIS_REST_TOKEN
      });
    });
  }
  return redisPromise;
}

// leer body JSON
async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => {
      try {
        const data = body ? JSON.parse(body) : {};
        resolve(data);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
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

  const token =
    req.headers["x-admin-token"] || req.headers["x-admin-token".toLowerCase()];
  if (!token || token !== ADMIN_TOKEN) {
    return unauthorized(res);
  }

  try {
    const redis = await getRedis();

    // GET → lista todos los productos
    if (req.method === "GET") {
      let products = await redis.get("tsf:products");
      if (!Array.isArray(products)) products = [];

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ products }));
    }

    // para POST/PUT/DELETE leemos body
    const data = await readJsonBody(req);

    // POST → crear producto
    if (req.method === "POST") {
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
        delivery_type: data.delivery_type || "generated_access",
        delivery_value: data.delivery_value || "",
        instructions: data.instructions || "",
        pdf_url: data.pdf_url || ""
      };

      let products = await redis.get("tsf:products");
      if (!Array.isArray(products)) products = [];

      products.push(product);
      await redis.set("tsf:products", products);

      res.statusCode = 201;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true, product }));
    }

    // PUT → actualizar producto
    if (req.method === "PUT") {
      const { id } = data;
      if (!id) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: "Missing id" }));
      }

      let products = await redis.get("tsf:products");
      if (!Array.isArray(products)) products = [];

      const index = products.findIndex((p) => p.id === id);
      if (index === -1) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: "Product not found" }));
      }

      const current = products[index];

      const updated = {
        ...current,
        ...data,
        price_cents:
          data.price_cents !== undefined
            ? Number(data.price_cents)
            : current.price_cents,
        is_active:
          data.is_active !== undefined
            ? Boolean(data.is_active)
            : current.is_active,
        instructions:
          data.instructions !== undefined
            ? data.instructions
            : current.instructions || "",
        pdf_url:
          data.pdf_url !== undefined ? data.pdf_url : current.pdf_url || ""
      };

      products[index] = updated;
      await redis.set("tsf:products", products);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true, product: updated }));
    }

    // DELETE → eliminar producto
    if (req.method === "DELETE") {
      const { id } = data;
      if (!id) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: "Missing id" }));
      }

      let products = await redis.get("tsf:products");
      if (!Array.isArray(products)) products = [];

      const newList = products.filter((p) => p.id !== id);
      await redis.set("tsf:products", newList);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true }));
    }

    // Método no soportado
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
