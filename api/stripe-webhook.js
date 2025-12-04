// api/stripe-webhook.js  (o checkout-success-handler.js)

// 1) Stripe
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 2) Helpers Kommo
const KOMMO_BASE_URL = (process.env.KOMMO_BASE_URL || "").replace(/\/$/, "");
const KOMMO_API_TOKEN = process.env.KOMMO_API_TOKEN;
const KOMMO_PIPELINE_ID = Number(process.env.KOMMO_PIPELINE_ID || 0);

// IDs de etapas (los que ya cargaste en Vercel)
const STATUS_INCOMPLETO = Number(process.env.KOMMO_STATUS_ID_INCOMPLETO || 0);
const STATUS_RECHAZADO = Number(process.env.KOMMO_STATUS_ID_RECHAZADO || 0);
const STATUS_COMPLETADO = Number(process.env.KOMMO_STATUS_ID_COMPLETADO || 0);
const STATUS_GANADO = Number(process.env.KOMMO_STATUS_ID_GANADO || 0);
const STATUS_PERDIDO = Number(process.env.KOMMO_STATUS_ID_PERDIDO || 0);

// 👉 helper para crear el lead en Kommo
async function createKommoLead({ statusId, email, name, amountUsd }) {
  if (!KOMMO_BASE_URL || !KOMMO_API_TOKEN || !KOMMO_PIPELINE_ID) {
    console.error("Faltan variables de entorno de Kommo");
    return;
  }
  if (!email || !statusId) {
    console.error("Falta email o statusId para crear lead en Kommo");
    return;
  }

  const url = `${KOMMO_BASE_URL}/api/v4/leads`;

  const body = [
    {
      name: `Stripe · ${email}`,
      price: amountUsd ? Math.round(amountUsd) : 0, // Kommo usa importe en la moneda de la cuenta
      pipeline_id: KOMMO_PIPELINE_ID,
      status_id: statusId,
      // 👇 después acá podemos agregar custom_fields para mail, teléfono, etc.
    },
  ];

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KOMMO_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("Error creando lead en Kommo:", resp.status, txt);
    } else {
      console.log("Lead creado en Kommo OK");
    }
  } catch (e) {
    console.error("Error de red al hablar con Kommo:", e);
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  // En Vercel el body ya viene parseado; si es string lo parseamos nosotros
  let event;
  try {
    event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (err) {
    console.error("Error parseando body de Stripe:", err);
    res.statusCode = 400;
    return res.end("Invalid payload");
  }

  try {
    const type = event.type;
    console.log("Stripe webhook type:", type);

    let email = null;
    let name = null;
    let amountTotalUsd = null;
    let statusId = null;

    // 1) Pago completado (tarjetas/aprobado)
    if (
      type === "checkout.session.completed" ||
      type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object;

      email = session.customer_details?.email;
      name = session.customer_details?.name || "Cliente";
      // Stripe envía el monto en centavos
      amountTotalUsd = session.amount_total
        ? session.amount_total / 100
        : null;

      statusId = STATUS_COMPLETADO;
    }

    // 2) Pago expirado / abandonado
    else if (type === "checkout.session.expired") {
      const session = event.data.object;

      email = session.customer_details?.email;
      name = session.customer_details?.name || "Cliente";
      amountTotalUsd = session.amount_total
        ? session.amount_total / 100
        : null;

      statusId = STATUS_INCOMPLETO;
    }

    // 3) Pago rechazado
    else if (
      type === "checkout.session.async_payment_failed" ||
      type === "payment_intent.payment_failed"
    ) {
      const obj = event.data.object;

      // en payment_intent viene diferente
      email =
        obj.customer_email ||
        obj.receipt_email ||
        obj.charges?.data?.[0]?.billing_details?.email ||
        null;

      name =
        obj.charges?.data?.[0]?.billing_details?.name ||
        "Cliente Stripe";

      const amountCents = obj.amount || obj.amount_received || null;
      amountTotalUsd = amountCents ? amountCents / 100 : null;

      statusId = STATUS_RECHAZADO;
    }

    // 4) Otros eventos → no hacemos nada
    else {
      res.statusCode = 200;
      return res.end("Event ignored");
    }

    // Creamos el lead en Kommo
    await createKommoLead({
      statusId,
      email,
      name,
      amountUsd: amountTotalUsd,
    });

    res.statusCode = 200;
    res.end("OK");
  } catch (err) {
    console.error("Error manejando webhook de Stripe:", err);
    res.statusCode = 500;
    res.end("Webhook error");
  }
};
