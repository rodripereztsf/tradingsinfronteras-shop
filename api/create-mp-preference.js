// api/create-mp-preference.js
import mercadopago from "mercadopago";

mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end("Method not allowed");
  }

  try {
    const { items, successUrl, cancelUrl } = req.body;

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
    res.status(200).json({ url: response.body.init_point });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error creating MP preference" });
  }
}
