// api/create-stripe-checkout.js
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end("Method not allowed");
  }

  try {
    const { items, successUrl, cancelUrl } = req.body;

    // items viene del frontend: [{ name, price, qty }]
    // price está en ARS, lo convertimos a USD
    const USD_RATE = 1 / 1000; // mismo valor que uses en el front
    const line_items = items.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: { name: item.name },
        unit_amount: Math.round(item.price * USD_RATE * 100), // a centavos
      },
      quantity: item.qty,
    }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error creating Stripe checkout" });
  }
}
