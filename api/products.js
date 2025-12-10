// api/products.js
//
// API pública de la tienda TSF SHOP.
// Devuelve SOLO los productos guardados en Redis.
// No hay productos "seed" ni relleno automático.

// CORS helper
const setCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

// Helper para Upstash Redis (mismo estilo que tenías)
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
    const redis = await getRedis();

    // Leemos directamente lo que haya en Redis
    let products = await redis.get("tsf:products");

    // Si no hay nada, trabajamos con array vacío
    if (!Array.isArray(products)) {
      products = [];
    }

    // Sólo devolvemos productos activos
    const activeProducts = products.filter((p) => p.is_active !== false);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ products: activeProducts }));
  } catch (err) {
    console.error("Error en /api/products:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    // Para que el front no rompa, devolvemos lista vacía
    return res.end(JSON.stringify({ products: [] }));
  }
};
