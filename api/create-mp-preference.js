// api/create-mp-preference.js
const mercadopago = require("mercadopago");

mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN,
});

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const { items, successUrl, cancelUrl } = req.body;

    // items: [{ name, price, qty }] en ARS
    const preference = {
      items: items.map((item) => ({
        title: item.name,
        quantity: item.qty,
        currency_id: "ARS",
        unit_price: Number(item.price),
      })),
      back_urls: {
        success: successUrl,
        failure: cancelUrl,
        pending: cancelUrl,
      },
      auto_return: "approved",
    };

    const response = await mercadopago.preferences.create(preference);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ url: response.body.init_point }));
  } catch (err) {
    console.error("Mercado Pago error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Error creating MP preference" }));
  }
};
