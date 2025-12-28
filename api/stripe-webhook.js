// api/stripe-webhook.js
const Stripe = require("stripe");
const nodemailer = require("nodemailer");
const { Redis } = require("@upstash/redis");

// Stripe
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Kommo env
const KOMMO_BASE_URL = (process.env.KOMMO_BASE_URL || "").replace(/\/$/, "");
const KOMMO_API_TOKEN = process.env.KOMMO_API_TOKEN;
const KOMMO_PIPELINE_ID = Number(process.env.KOMMO_PIPELINE_ID || 0);

const STATUS_INCOMPLETO = Number(process.env.KOMMO_STATUS_ID_INCOMPLETO || 0);
const STATUS_RECHAZADO = Number(process.env.KOMMO_STATUS_ID_RECHAZADO || 0);
const STATUS_COMPLETADO = Number(process.env.KOMMO_STATUS_ID_COMPLETADO || 0);

const KOMMO_CF_EMAIL = process.env.KOMMO_CF_EMAIL
  ? Number(process.env.KOMMO_CF_EMAIL)
  : null;
const KOMMO_CF_WHATSAPP = process.env.KOMMO_CF_WHATSAPP
  ? Number(process.env.KOMMO_CF_WHATSAPP)
  : null;

// Mail env
const SHOP_NAME = process.env.SHOP_NAME || "TRADING SIN FRONTERAS SHOP";
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || process.env.SMTP_EMAIL;
const SHOP_SUPPORT_EMAIL = process.env.SHOP_SUPPORT_EMAIL || process.env.SMTP_EMAIL;

// Redis client
let redisClient = null;
function getRedis() {
  if (!redisClient) {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redisClient;
}

// Mail transporter
let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

// ─────────────────────────────────────────────
// Kommo: crear lead
// ─────────────────────────────────────────────
async function createKommoLead({ statusId, email, name, amountUsd, whatsapp }) {
  if (!KOMMO_BASE_URL || !KOMMO_API_TOKEN || !KOMMO_PIPELINE_ID) return;
  if (!email || !statusId) return;

  const url = `${KOMMO_BASE_URL}/api/v4/leads`;
  const customFields = [];

  if (KOMMO_CF_EMAIL && email) {
    customFields.push({ field_id: KOMMO_CF_EMAIL, values: [{ value: email }] });
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
      ...(customFields.length ? { custom_fields_values: customFields } : {}),
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
      console.error("Kommo error:", resp.status, txt);
    }
  } catch (e) {
    console.error("Kommo network error:", e);
  }
}

// ─────────────────────────────────────────────
// Helpers: construir mail comprador + admin
// ─────────────────────────────────────────────
function moneyUsd(amountUsd) {
  if (amountUsd == null) return "-";
  return `USD ${Number(amountUsd).toFixed(2)}`;
}

function safeHtml(s = "") {
  return String(s || "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// arma HTML comprador, usando Redis para obtener delivery_value/email_body/pdf_url por producto
async function buildBuyerEmailHtml({ buyerName, cartItems }) {
  const redis = getRedis();
  let products = await redis.get("tsf:products");
  if (!Array.isArray(products)) products = [];

  // Match por name (porque el front manda name)
  const blocks = cartItems.map((ci) => {
    const p = products.find((x) => (x.name || "").trim() === (ci.name || "").trim());
    const title = p?.name || ci.name || "Producto";
    const delivery = p?.delivery_value || "";
    const instructions = p?.email_body || p?.instructions || "";
    const pdf = p?.pdf_url || "";

    return `
      <div style="border:1px solid #111; border-radius:14px; padding:16px; margin:14px 0; background:#050505;">
        <div style="font-weight:800; font-size:16px; margin-bottom:6px;">${safeHtml(title)}</div>
        <div style="opacity:.85; font-size:13px; margin-bottom:8px;">
          Cantidad: ${Number(ci.quantity || 1)}
        </div>

        ${
          delivery
            ? `<div style="margin:10px 0; font-size:14px;">
                <b>Acceso:</b> <a href="${delivery}" target="_blank" rel="noreferrer" style="color:#00cfff;">${delivery}</a>
              </div>`
            : `<div style="margin:10px 0; font-size:14px; opacity:.85;">
                <b>Acceso:</b> Te contactaremos con los detalles de entrega.
              </div>`
        }

        ${
          instructions
            ? `<div style="margin-top:12px; font-size:14px; line-height:1.6;">
                <b>Instructivo:</b><br/>
                ${instructions}
              </div>`
            : ""
        }

        ${
          pdf
            ? `<div style="margin-top:12px; font-size:14px;">
                <b>PDF:</b> <a href="${pdf}" target="_blank" rel="noreferrer" style="color:#00cfff;">Descargar instructivo</a>
              </div>`
            : ""
        }
      </div>
    `;
  });

  const name = buyerName || "trader";

  return `
    <div style="font-family:Arial, sans-serif; background:#000; color:#fff; padding:24px;">
      <div style="max-width:720px; margin:0 auto;">
        <div style="font-size:18px; font-weight:800; letter-spacing:.5px;">${SHOP_NAME}</div>
        <div style="opacity:.85; margin-top:6px;">¡Hola ${safeHtml(name)}! Gracias por tu compra.</div>

        <div style="margin-top:18px; opacity:.85;">
          Abajo tenés el acceso y el instructivo de tu producto.
        </div>

        ${blocks.join("")}

        <div style="margin-top:22px; font-size:12px; opacity:.65;">
          Si tenés algún problema con el acceso, respondé este mail y te ayudamos.
        </div>

        <div style="margin-top:10px; font-size:12px; opacity:.65;">
          © ${new Date().getFullYear()} ${SHOP_NAME}
        </div>
      </div>
    </div>
  `;
}

function buildAdminEmailHtml({ email, name, whatsapp, amountUsd, cartItems, stripeEventType }) {
  const rows = cartItems
    .map(
      (i) => `
      <tr>
        <td style="padding:8px 10px; border-bottom:1px solid #111;">${safeHtml(i.name || "-")}</td>
        <td style="padding:8px 10px; border-bottom:1px solid #111; text-align:center;">${Number(i.quantity || 1)}</td>
        <td style="padding:8px 10px; border-bottom:1px solid #111; text-align:right;">USD ${(Number(i.price || 0) / 100).toFixed(2)}</td>
      </tr>
    `
    )
    .join("");

  return `
    <div style="font-family:Arial, sans-serif; background:#000; color:#fff; padding:24px;">
      <div style="max-width:820px; margin:0 auto;">
        <div style="font-size:18px; font-weight:800;">${SHOP_NAME} · Notificación</div>
        <div style="opacity:.8; margin-top:6px;">Evento: <b>${safeHtml(stripeEventType || "-")}</b></div>

        <div style="margin-top:16px; padding:14px; border:1px solid #111; border-radius:14px; background:#050505;">
          <div><b>Nombre:</b> ${safeHtml(name || "-")}</div>
          <div><b>Email:</b> ${safeHtml(email || "-")}</div>
          <div><b>WhatsApp:</b> ${safeHtml(whatsapp || "-")}</div>
          <div style="margin-top:10px;"><b>Total:</b> ${moneyUsd(amountUsd)}</div>
        </div>

        <div style="margin-top:18px; font-weight:800;">Carrito</div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; border:1px solid #111;">
          <thead>
            <tr>
              <th style="padding:8px 10px; text-align:left; border-bottom:1px solid #111;">Producto</th>
              <th style="padding:8px 10px; text-align:center; border-bottom:1px solid #111;">Cant</th>
              <th style="padding:8px 10px; text-align:right; border-bottom:1px solid #111;">Precio</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="3" style="padding:10px;">(sin items)</td></tr>`}
          </tbody>
        </table>

        <div style="margin-top:16px; font-size:12px; opacity:.65;">
          © ${new Date().getFullYear()} ${SHOP_NAME}
        </div>
      </div>
    </div>
  `;
}

async function sendMail({ to, subject, html }) {
  const t = getTransporter();
  await t.sendMail({
    from: `"${SHOP_NAME}" <${process.env.SMTP_EMAIL}>`,
    replyTo: SHOP_SUPPORT_EMAIL,
    to,
    subject,
    html,
  });
}

// ─────────────────────────────────────────────
// Handler principal Webhook
// ─────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

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
    let whatsapp = null;
    let amountTotalUsd = null;
    let statusId = null;
    let cartItems = [];

    // ✅ Pago completado
    if (
      type === "checkout.session.completed" ||
      type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object || {};
      const md = session.metadata || {};

      email = md.buyer_email || session.customer_details?.email || session.customer_email || null;
      name = md.buyer_name || session.customer_details?.name || "Cliente Stripe";
      whatsapp = md.buyer_whatsapp || null;

      amountTotalUsd = session.amount_total ? session.amount_total / 100 : null;

      try {
        cartItems = md.cart ? JSON.parse(md.cart) : [];
      } catch {
        cartItems = [];
      }

      statusId = STATUS_COMPLETADO;

      // 1) Kommo
      await createKommoLead({
        statusId,
        email,
        name,
        amountUsd: amountTotalUsd,
        whatsapp,
      });

      // 2) Mail comprador
      if (email) {
        const buyerHtml = await buildBuyerEmailHtml({
          buyerName: name,
          cartItems,
        });
        await sendMail({
          to: email,
          subject: `✅ Compra confirmada · ${SHOP_NAME}`,
          html: buyerHtml,
        });
      }

      // 3) Mail admin (vos)
      if (ADMIN_NOTIFY_EMAIL) {
        const adminHtml = buildAdminEmailHtml({
          email,
          name,
          whatsapp,
          amountUsd: amountTotalUsd,
          cartItems,
          stripeEventType: type,
        });
        await sendMail({
          to: ADMIN_NOTIFY_EMAIL,
          subject: `🧾 Nueva compra confirmada · ${SHOP_NAME}`,
          html: adminHtml,
        });
      }

      res.statusCode = 200;
      return res.end("OK");
    }

    // ⏳ Pago expirado / abandonado
    if (type === "checkout.session.expired") {
      const session = event.data.object || {};
      const md = session.metadata || {};

      email = md.buyer_email || session.customer_details?.email || session.customer_email || null;
      name = md.buyer_name || session.customer_details?.name || "Cliente Stripe";
      whatsapp = md.buyer_whatsapp || null;

      amountTotalUsd = session.amount_total ? session.amount_total / 100 : null;

      try {
        cartItems = md.cart ? JSON.parse(md.cart) : [];
      } catch {
        cartItems = [];
      }

      statusId = STATUS_INCOMPLETO;

      await createKommoLead({
        statusId,
        email,
        name,
        amountUsd: amountTotalUsd,
        whatsapp,
      });

      // Aviso admin (opcional)
      if (ADMIN_NOTIFY_EMAIL) {
        const adminHtml = buildAdminEmailHtml({
          email,
          name,
          whatsapp,
          amountUsd: amountTotalUsd,
          cartItems,
          stripeEventType: type,
        });
        await sendMail({
          to: ADMIN_NOTIFY_EMAIL,
          subject: `⏳ Checkout expirado/abandonado · ${SHOP_NAME}`,
          html: adminHtml,
        });
      }

      res.statusCode = 200;
      return res.end("OK");
    }

    // ❌ Pago rechazado
    if (
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

      try {
        cartItems = md.cart ? JSON.parse(md.cart) : [];
      } catch {
        cartItems = [];
      }

      statusId = STATUS_RECHAZADO;

      await createKommoLead({
        statusId,
        email,
        name,
        amountUsd: amountTotalUsd,
        whatsapp,
      });

      // Aviso admin (opcional)
      if (ADMIN_NOTIFY_EMAIL) {
        const adminHtml = buildAdminEmailHtml({
          email,
          name,
          whatsapp,
          amountUsd: amountTotalUsd,
          cartItems,
          stripeEventType: type,
        });
        await sendMail({
          to: ADMIN_NOTIFY_EMAIL,
          subject: `❌ Pago rechazado · ${SHOP_NAME}`,
          html: adminHtml,
        });
      }

      res.statusCode = 200;
      return res.end("OK");
    }

    res.statusCode = 200;
    return res.end("Event ignored");
  } catch (err) {
    console.error("Error manejando webhook de Stripe:", err);
    res.statusCode = 500;
    return res.end("Webhook error");
  }
};
