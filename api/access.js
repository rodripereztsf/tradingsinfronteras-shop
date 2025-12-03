// api/access.js

const setCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

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
    // sacamos el token de la query
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Missing token" }));
    }

    const redis = await getRedis();
    const record = await redis.get(`tsf:access:${token}`);

    if (!record) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Access not found" }));
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(record));
  } catch (err) {
    console.error("Error en /api/access:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Internal server error" }));
  }
};
