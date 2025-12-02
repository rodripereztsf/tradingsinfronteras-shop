// api/products.js

// Por ahora usamos un JSON "duro". Luego esto lo cambiamos a BD (Supabase).
const products = [
  {
    id: "formacion-inicial-tsf",
    name: "Formación Inicial TSF",
    type: "course",
    short_description:
      "Curso base de trading para dar tus primeros pasos con el sistema TSF.",
    price_cents: 4900, // USD 49.00
    currency: "USD",
    image_url: "https://rodripereztsf.github.io/IMG/formacion-inicial.jpg",
    is_active: true,
    delivery_type: "drive_link",
    delivery_value: "https://drive.google.com/XXXXX", // reemplazar luego
  },
  {
    id: "formacion-avanzada-liquidez",
    name: "Formación Avanzada – Liquidez y Scalping",
    type: "course",
    short_description:
      "Entrenamiento intensivo en liquidez institucional y scalping en XAUUSD.",
    price_cents: 19900, // USD 199.00
    currency: "USD",
    image_url: "https://rodripereztsf.github.io/IMG/formacion-avanzada.jpg",
    is_active: true,
    delivery_type: "drive_link",
    delivery_value: "https://drive.google.com/YYYYY",
  },
  {
    id: "indicador-liquidez-tsf",
    name: "Indicador TSF Liquidez MTF",
    type: "indicator",
    short_description:
      "Indicador avanzado de liquidez multi–timeframe para TradingView.",
    price_cents: 9900, // USD 99.00
    currency: "USD",
    image_url: "https://rodripereztsf.github.io/IMG/indicador-liquidez.jpg",
    is_active: true,
    delivery_type: "instruction_page",
    delivery_value: "/acceso/indicador-liquidez-tsf",
  },
  {
    id: "bot-scalping-xauusd",
    name: "Bot de Scalping XAUUSD",
    type: "bot",
    short_description:
      "Robot de trading optimizado para XAUUSD en sesiones de Londres y NY.",
    price_cents: 24900, // USD 249.00
    currency: "USD",
    image_url: "https://rodripereztsf.github.io/IMG/bot-scalping.jpg",
    is_active: true,
    delivery_type: "instruction_page",
    delivery_value: "/acceso/bot-scalping-xauusd",
  },
  {
    id: "remera-oficial-tsf",
    name: "Remera Oficial TRADING SIN FRONTERAS",
    type: "physical",
    short_description:
      "Remera negra edición limitada TSF para traders sin fronteras.",
    price_cents: 6900, // USD 69.00
    currency: "USD",
    image_url: "https://rodripereztsf.github.io/IMG/remera-oficial.jpg",
    is_active: true,
    delivery_type: "none",
    delivery_value: "",
  },
];

const setCors = (res) => {
  // Dejamos abierto por ahora. Luego podemos limitar al dominio de la tienda.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

module.exports = (req, res) => {
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

  const activeProducts = products.filter((p) => p.is_active);

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify({ products: activeProducts }));
};
