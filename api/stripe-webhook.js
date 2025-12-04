import Stripe from "stripe";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false,
  },
};

function buffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Only POST allowed");
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers["stripe-signature"];
  const buf = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // MOSTRAR EVENTO EN CONSOLA (LOG)
  // -------------------------------------------------------------
  console.log("➡️ EVENT RECEIVED:", event.type);

  // -------------------------------------------------------------
  // EXTRAER MAIL + NOMBRE + PRODUCTO
  // -------------------------------------------------------------
  let email = null;
  let buyer_name = null;
  let product_id = null;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    email = session.customer_details?.email;
    buyer_name = session.customer_details?.name || "cliente";

    const line_items = await stripe.checkout.sessions.listLineItems(
      session.id
    );

    product_id = line_items.data?.[0]?.price?.product || null;
  }

  // -------------------------------------------------------------
  // ENVIAR DATOS A KOMMO
  // -------------------------------------------------------------
  async function sendToKommo(status_id) {
    if (!email) return;

    const url = `${process.env.KOMMO_BASE_URL}/api/v4/leads`;

    const body = {
      name: `Compra - ${email}`,
      price: 0,
      status_id: status_id,
      pipeline_id: Number(process.env.KOMMO_PIPELINE_ID),
      custom_fields_values: [
        {
          field_id: 123456, // si querés guardar mail en un campo personalizado
          values: [{ value: email }],
        },
      ],
    };

    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.KOMMO_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([body]),
    });
  }

  // -------------------------------------------------------------
  // LÓGICA SEGÚN EVENTO
  // -------------------------------------------------------------
  switch (event.type) {
    case "payment_intent.succeeded":
    case "checkout.session.completed":
      await sendToKommo(process.env.KOMMO_STATUS_ID_COMPLETADO);
      break;

    case "payment_intent.payment_failed":
      await sendToKommo(process.env.KOMMO_STATUS_ID_RECHAZADO);
      break;

    case "checkout.session.async_payment_failed":
      await sendToKommo(process.env.KOMMO_STATUS_ID_RECHAZADO);
      break;

    case "checkout.session.expired":
      await sendToKommo(process.env.KOMMO_STATUS_ID_INCOMPLETO);
      break;

    default:
      console.log("Evento no manejado:", event.type);
  }

  res.json({ received: true });
}
