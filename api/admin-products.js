// api/admin-products.js
//
// Endpoint de administración de productos TSF SHOP
// Métodos soportados:
//  - GET    /api/admin-products           -> lista productos
//  - POST   /api/admin-products           -> crea producto
//  - PUT    /api/admin-products           -> edita producto (requiere id)
//  - DELETE /api/admin-products?id=XXX    -> borra producto por id
//
// Usa la misma key de Redis que /api/products: "tsf:products"

const { Redis } = require("@upstash/redis");

// --------------------------------------------------
// CORS helper
// --------------------------------------------------
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// --------------------------------------------------
// Redis helper
// --------------------------------------------------
let redisPromise = null;

async function getRedis() {
  if (!redisPromise) {
    redisPromise = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redisPromise;
}

// --------------------------------------------------
// Seed inicial (por si la base está vacía)
// --------------------------------------------------
const seedProducts = [
  {
    id: "formacion-inicial-tsf",
    name: "Formación Inicial TSF",
    type: "course",
    short_description:
      "Curso base de trading para dar tus primeros pasos con el sistema TSF.",
    price_cents: 4900,
    currency: "USD",
    image_url: "https://rodripereztsf.github.io/IMG/formacion-inicial.jpg",
    is_active: true,
    delivery_type: "drive_link",
    delivery_value: "https://drive.google.com/XXXXX",
    email_subject: "Tu acceso a Formación Inicial TSF",
    email_body: "",
    pdf_url: "",
    is_featured: true,
  },
  {
    id: "formacion-avanzada-liquidez",
    name: "Formación Avanzada – Liquidez y Scalping",
    type: "course",
    short_description:
      "Entrenamiento intensivo en liquidez institucional y scalping en XAUUSD.",
    price_cents: 19900,
    currency: "USD",
    image_url: "https://rodripereztsf.github.io/IMG/formacion-avanzada.jpg",
    is_active: true,
    delivery_type: "drive_link",
    delivery_value: "https://drive.google.com/YYYYY",
    email_subject: "Tu acceso a Formación Avanzada TSF",
    email_body: "",
    pdf_url: "",
    is_featured: true,
  },
  {
    id: "indicador-liquidez-tsf",
    name: "Indicador TSF Liquidez MTF",
    type: "indicator",
    short_description:
      "Indicador avanzado de liquidez multi–timeframe para TradingView.",
    price_cents: 9900,
    currency: "USD",
    image_url: "https://rodripereztsf.github.io/IMG/indicador-liquidez.jpg",
    is_active: true,
    delivery_type: "instruction_page",
    delivery_value: "/acceso/indicador-liquidez-tsf",
    email_subject: "Tu acceso al Indicador TSF Liquidez MTF",
    email_body: "",
    pdf_url: "",
    is_featured: true,
  },
  {
    id: "bot-scalping-xauusd",
    name: "Bot de Scalping XAUUSD",
    type: "bot",
    short_description:
      "Robot de trading optimizado para XAUUSD en sesiones de Londres y NY.",
    price_cents: 24900,
    currency: "USD",
    image_url: "https://rodripereztsf.github.io/IMG/bot-scalping.jpg",
    is_active: true,
    delivery_type: "instruction_page",
    delivery_value: "/acceso/bot-scalping-xauusd",
    email_subject: "Tu acceso al Bot de Scalping XAUUSD",
    email_body: "",
    pdf_url: "",
    is_featured: true,
  },
  {
    id: "remera-oficial-tsf",
    name: "Remera Oficial TRADING SIN FRONTERAS",
    type: "physical",
    short_description:
      "Remera negra edición limitada TSF para traders sin fronteras.",
    price_cents: 6900,
    currency: "USD",
    image_url: "https://rodripereztsf.github.io/IMG/remera-oficial.jpg",
    is_active: true,
    delivery_type: "none",
    delivery_value: "",
    email_subject: "Gracias por tu compra en TSF SHOP",
    email_body: "",
    pdf_url: "",
    is_featured: false,
  },
];

// --------------------------------------------------
// Helpers de producto
// --------------------------------------------------
function generateIdFromName(name = "") {
  return (
    name
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[^\w]+/g, "-") || "producto-" + Date.now()
  );
}

function normalizeBoolean(value, defaultValue = true) {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }
  return defaultValue;
}

function normalizeProduct(payload = {}, existing = null) {
  const price_cents = Number.parseInt(payload.price_cents, 10);
  const currency = payload.currency || existing?.currency || "USD";

  const is_active = normalizeBoolean(
    payload.is_active,
    existing?.is_active ?? true
  );

  // 👇 NUEVO: flag de producto destacado
  const is_featured = normalizeBoolean(
    payload.is_featured,
    existing?.is_featured ?? true
  );

  return {
    id: (payload.id || existing?.id || generateIdFromName(payload.name)).trim(),
    name: (payload.name || existing?.name || "").trim(),
    type: (payload.type || existing?.type || "other").trim(),
    short_description:
      (payload.short_description || existing?.short_description || "").trim(),
    price_cents: Number.isFinite(price_cents)
      ? price_cents
      : existing?.price_cents || 0,
    currency,
    image_url: (payload.image_url || existing?.image_url || "").trim(),
    is_active,
    delivery_type:
      (payload.delivery_type || existing?.delivery_type || "none").trim(),
    delivery_value:
      (payload.delivery_value || existing?.delivery_value || "").trim(),
    email_subject:
      (payload.email_subject || existing?.email_subject || "").trim(),
    email_body: (payload.email_body || existing?.email_body || "").trim(),
    pdf_url: (payload.pdf_url || existing?.pdf_url || "").trim(),
    is_featured,
  };
}

// --------------------------------------------------
// Handler principal
// --------------------------------------------------
module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  try {
    const redis = await getRedis();

    // Asegurar estructura base
    let products = await redis.get("tsf:products");
    if (!Array.isArray(products) || products.length === 0) {
      products = seedProducts;
      await redis.set("tsf:products", products);
    }

    // -----------------------------
    // GET: listar productos
    // -----------------------------
    if (req.method === "GET") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ products }));
    }

    // Parseamos body para POST/PUT
    let payload = {};
    if (req.body) {
      try {
        payload =
          typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      } catch (err) {
        console.error("Error parseando JSON:", err);
        res.statusCode = 400;
        return res.end(
          JSON.stringify({ error: "Body inválido, se esperaba JSON." })
        );
      }
    }

    // -----------------------------
    // POST: crear producto
    // -----------------------------
    if (req.method === "POST") {
      const product = normalizeProduct(payload, null);

      // Evitar duplicados por id
      const exists = products.find((p) => p.id === product.id);
      if (exists) {
        res.statusCode = 409;
        return res.end(
          JSON.stringify({
            error:
              "Ya existe un producto con este ID. Editalo en vez de crearlo.",
          })
        );
      }

      products.push(product);
      await redis.set("tsf:products", products);

      res.statusCode = 201;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ product }));
    }

    // -----------------------------
    // PUT: editar producto
    // -----------------------------
    if (req.method === "PUT") {
      const id = (payload.id || "").trim();
      if (!id) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Falta el ID del producto." }));
      }

      const index = products.findIndex((p) => p.id === id);
      if (index === -1) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "Producto no encontrado." }));
      }

      const existing = products[index];
      const updated = normalizeProduct(payload, existing);
      products[index] = updated;

      await redis.set("tsf:products", products);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ product: updated }));
    }

    // -----------------------------
    // DELETE: borrar producto
    // -----------------------------
    if (req.method === "DELETE") {
      const id = (req.query?.id || "").trim();
      if (!id) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Falta el ID en la query." }));
      }

      const before = products.length;
      products = products.filter((p) => p.id !== id);

      if (products.length === before) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: "Producto no encontrado." }));
      }

      await redis.set("tsf:products", products);

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
