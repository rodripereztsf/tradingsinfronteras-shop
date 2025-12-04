// api/stripe-webhook.js

const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const KOMMO_BASE_URL = (process.env.KOMMO_BASE_URL || "").replace(/\/$/, "");
const KOMMO_API_TOKEN = process.env.KOMMO_API_TOKEN;
const KOMMO_PIPELINE_ID = Number(process.env.KOMMO_PIPELINE_ID || 0);

const STATUS_INCOMPLETO = Number(process.env.KOMMO_STATUS_ID_INCOMPLETO || 0);
const STATUS_RECHAZADO = Number(process.env.KOMMO_STATUS_ID_RECHAZADO || 0);
const STATUS_COMPLETADO = Number(process.env.KOMMO_STATUS_ID_COMPLETADO || 0);
const STATUS_GANADO = Number(process.env.KOMMO_STATUS_ID_GANADO || 0);
const STATUS_PERDIDO = Number(process.env.KOMMO_STATUS_ID_PERDIDO || 0);

// Opcionales: campos personalizados en Kommo (cuando los definas)
const KOMMO_CF_EMAIL = process.env.KOMMO_CF_EMAIL
  ? Number(process.env.KOMMO_CF_EMAIL)
  : null;
const KOMMO_CF_WHATSAPP = process.env.KOMMO_CF_WHATSAPP
  ? Number(process.env.KOMMO_CF_WHATSAPP)
  : null;

async function createKommoLead({ statusId, email, name, amountUsd, whatsapp }) {
  if (!KOMMO_BASE_URL || !KOMMO_API_TOKEN || !KOMMO_PIPELINE_ID) {
    console.error("Faltan variables de entorno de Kommo");
    return;
  }
  if (!email || !statusId) {
    console.error("Falta email o statusId para crear lead en Kommo");
    return;
  }

  const url = `${KOMMO_BASE_URL}/api/v4/leads`;

  const customFields = [];

  if (KOMMO_CF_EMAIL && email) {
    customFields.push({
      field_id: KOMMO_CF_EMAIL,
      values: [{ value: email }],
    });
  }

  if (KOMMO_CF_WHATSAPP && whatsapp) {
    customFields.push({
      field_id: KOMMO_CF_WHATSAPP,
      values: [{ value: whatsapp }],
    });
  }

  const body = [
    {
      name: `Stripe · ${email}`,
      price: amountUsd ? Math.round(amountUsd) : 0,
      pipeline_id: KOMMO_PIPELINE_ID,
      status_id: statusId,
      ...(customFields.length
        ? { custom_fields_values: customFields }
        : {}),
      _embedded: {
        contacts: [
          {
            name: name || "Cliente Stripe",
            custom_fields_values: [
              ...(whatsapp
                ? [
                    {
                      field_code: "PHONE",
                      values: [{ value: whatsapp, enum_code: "OTHER" }],
                    },
                  ]
                : []),
              ...(email
                ? [
                    {
                      field_code: "EMAIL",
                      values: [{ value: email, enum_code: "WORK" }],
                    },
                  ]
                : []),
            ],
          },
        ],
      },
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

  let event;
  try {
    event =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;
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
    let whatsapp = null;
    let amountTotalUsd = null;
    let statusId = null;

    // 1) Pago completado
    if (
      type === "checkout.session.completed" ||
      type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object || {};
      const md = session.metadata || {};

      email =
        md.buyer_email ||
        session.customer_details?.email ||
        md.email ||
        null;
      name =
        md.buyer_name ||
        session.customer_details?.name ||
        "Cliente Stripe";
      whatsapp = md.buyer_whatsapp || null;

      amountTotalUsd = session.amount_total
        ? session.amount_total / 100
        : null;

      statusId = STATUS_COMPLETADO;
    }
    // 2) Pago expirado / abandonado
    else if (type === "checkout.session.expired") {
      const session = event.data.object || {};
      const md = session.metadata || {};

      email =
        md.buyer_email ||
        session.customer_details?.email ||
        md.email ||
        null;
      name =
        md.buyer_name ||
        session.customer_details?.name ||
        "Cliente Stripe";
      whatsapp = md.buyer_whatsapp || null;

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
      const obj = event.data.object || {};
      const md = obj.metadata || {};

      email =
        md.buyer_email ||
        obj.customer_email ||
        obj.receipt_email ||
        obj.charges?.data?.[0]?.billing_details?.email ||
        null;
      name =
        md.buyer_name ||
        obj.charges?.data?.[0]?.billing_details?.name ||
        "Cliente Stripe";
      whatsapp = md.buyer_whatsapp || null;

      const amountCents = obj.amount || obj.amount_received || null;
      amountTotalUsd = amountCents ? amountCents / 100 : null;

      statusId = STATUS_RECHAZADO;
    } else {
      res.statusCode = 200;
      return res.end("Event ignored");
    }

    await createKommoLead({
      statusId,
      email,
      name,
      amountUsd: amountTotalUsd,
      whatsapp,
    });

    res.statusCode = 200;
    res.end("OK");
  } catch (err) {
    console.error("Error manejando webhook de Stripe:", err);
    res.statusCode = 500;
    res.end("Webhook error");
  }
};
