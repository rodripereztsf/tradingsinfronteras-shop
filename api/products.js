// api/products.js

// Seed inicial: solo se usa si la base está vacía
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
    instructions:
      "<p>Te recomiendo ver las clases en orden, tomando apuntes y pausando cuando sea necesario. Tené tu diario de trading a mano y aplicá cada concepto en demo antes de llevarlo a real.</p>",
    pdf_url: "https://tusitio.com/pdfs/formacion-inicial-tsf.pdf"
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
    instructions:
      "<p>Esta formación está pensada para que la veas con el gráfico abierto. Seguí los ejemplos en XAUUSD, marcá estructura, liquidez y zonas clave y practicá primero en demo.</p>",
    pdf_url: "https://tusitio.com/pdfs/formacion-avanzada-liquidez.pdf"
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
    instructions:
      "<p>Dentro del acceso privado vas a encontrar el código o el usuario autorizado en TradingView, junto con el paso a paso para agregar el indicador a tu gráfico.</p>",
    pdf_url: "https://tusitio.com/pdfs/indicador-liquidez-tsf.pdf"
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
    instructions:
      "<p>Seguí el instructivo paso a paso para instalar el bot en MT5, configurar el tamaño de lote, riesgo por operación y horarios de operación recomendados.</p>",
    pdf_url: "https://tusitio.com/pdfs/bot-scalping-xauusd.pdf"
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
    instructions: "",
    pdf_url: ""
  }
];

const setCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

    let products = await redis.get("tsf:products");

    // si no hay nada en Redis, sembramos el seed inicial
    if (!Array.isArray(products) || products.length === 0) {
      products = seedProducts;
      await redis.set("tsf:products", products);
    }

    const activeProducts = products.filter((p) => p.is_active);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ products: activeProducts }));
  } catch (err) {
    console.error("Error en /api/products:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Internal server error" }));
  }
};
