// api/stripe-webhook.js
import Stripe from "stripe";
import nodemailer from "nodemailer";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: { bodyParser: false },
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
}

function buildTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASS,
    },
  });
}

function money(amount, currency) {
  const n = Number(amount || 0) / 100;
  return `${String(currency || "").toUpperCase()} ${n.toFixed(2)}`;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getLineItemsRows(sessionId, currencyFallback = "usd") {
  try {
    const li = await stripe.checkout.sessions.listLineItems(sessionId, {
      limit: 100,
    });

    if (!li?.data?.length) {
      return {
        rowsHtml: `<tr><td colspan="3">(sin items)</td></tr>`,
        totalFromItemsCents: 0,
        currency: currencyFallback,
      };
    }

    let total = 0;
    let currency = currencyFallback;

    const rowsHtml = li.data
      .map((it) => {
        const name = escapeHtml(it.description || "Producto");
        const qty = Number(it.quantity || 1);
        const amount = Number(it.amount_total ?? it.amount_subtotal ?? 0);

        total += amount;
        currency = it.currency || currency;

        return `
          <tr>
            <td>${name}</td>
            <td style="text-align:center;">${qty}</td>
            <td style="text-align:right;">${money(amount, currency)}</td>
          </tr>
        `;
      })
      .join("");

    return { rowsHtml, totalFromItemsCents: total, currency };
  } catch (e) {
    // Si Stripe no permite listar items por algún motivo, no rompemos el webhook
    return {
      rowsHtml: `<tr><td colspan="3">(no disponible)</td></tr>`,
      totalFromItemsCents: 0,
      currency: currencyFallback,
    };
  }
}

function emailHtml({ title, eventType, statusLabel, name, email, whatsapp, totalLabel, rowsHtml, extraLines }) {
  const extra = (extraLines || [])
    .map((l) => `<p style="margin:6px 0; opacity:.9;">${escapeHtml(l)}</p>`)
    .join("");

  return `
  <div style="font-family:Arial,sans-serif; background:#0b0b0b; color:#fff; padding:24px;">
    <h2 style="margin:0 0 8px 0;">${escapeHtml(title)}</h2>
    <p style="margin:0 0 10px 0; opacity:.85;">Evento: ${escapeHtml(eventType)}</p>
    <p style="margin:0 0 16px 0; opacity:.85;">Estado: <b>${escapeHtml(statusLabel)}</b></p>

    <div style="background:#111; border:1px solid #222; border-radius:12px; padding:16px; margin-bottom:18px;">
      <p style="margin:6px 0;"><b>Nombre:</b> ${escapeHtml(name)}</p>
      <p style="margin:6px 0;"><b>Email:</b> ${escapeHtml(email)}</p>
      <p style="margin:6px 0;"><b>WhatsApp:</b> ${escapeHtml(whatsapp || "—")}</p>
      <p style="margin:10px 0 0 0;"><b>Total:</b> ${escapeHtml(totalLabel)}</p>
      ${extra}
    </div>

    <h3 style="margin:0 0 10px 0;">Carrito</h3>
    <table style="width:100%; border-collapse:collapse; background:#0f0f0f; border:1px solid #222;">
      <thead>
        <tr>
          <th style="text-align:left; padding:10px; border-bottom:1px solid #222;">Producto</th>
          <th style="text-align:center; padding:10px; border-bottom:1px solid #222;">Cant</th>
          <th style="text-align:right; padding:10px; border-bottom:1px solid #222;">Precio</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <p style="margin-top:18px; opacity:.65;">© ${new Date().getFullYear()} TRADING SIN FRONTERAS SHOP</p>
  </div>
  `;
}

async function sendAdminEmail({ subject, html }) {
  const transporter = buildTransporter();
  const to = process.env.ADMIN_EMAIL || process.env.SMTP_EMAIL;

  await transporter.sendMail({
    from: `TSF SHOP <${process.env.SMTP_EMAIL}>`,
    to,
    subject,
    html,
  });
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err?.message || err);
    return res.status(400).send(`Webhook Error: ${err?.message || "Invalid signature"}`);
  }

  try {
    // 1) COMPRA EXITOSA
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const name =
        session?.metadata?.name ||
        session?.customer_details?.name ||
        "Cliente";
      const email =
  session?.customer_details?.email ||
  session?.customer_email ||
  session?.metadata?.email ||
  session?.payment_intent?.charges?.data?.[0]?.billing_details?.email ||
  "";
console.log("📧 Buyer email detected:", email);

      const whatsapp =
        session?.metadata?.whatsapp ||
        session?.metadata?.buyerWhatsApp ||
        "—";

      const currency = session?.currency || session?.metadata?.currency || "usd";

      const { rowsHtml, totalFromItemsCents } = await getLineItemsRows(session.id, currency);

      const totalCents =
        Number(session?.amount_total ?? 0) > 0
          ? Number(session.amount_total)
          : totalFromItemsCents;

      const totalLabel = money(totalCents, currency);

      await sendAdminEmail({
        subject: `✅ Compra confirmada - ${totalLabel}`,
        html: emailHtml({
          title: "TRADING SIN FRONTERAS SHOP · Notificación",
          eventType: event.type,
          statusLabel: "PAGO COMPLETADO",
          name,
          email,
          whatsapp,
          totalLabel,
          rowsHtml,
          extraLines: [`Session ID: ${session.id}`],
        }),
      });
    }

    // 2) CHECKOUT EXPIRADO
    if (event.type === "checkout.session.expired") {
      const session = event.data.object;

      const name =
        session?.metadata?.name ||
        session?.customer_details?.name ||
        "Cliente";
      const email =
        session?.metadata?.email ||
        session?.customer_details?.email ||
        session?.customer_email ||
        "—";
      const whatsapp =
        session?.metadata?.whatsapp ||
        session?.metadata?.buyerWhatsApp ||
        "—";

      const currency = session?.currency || session?.metadata?.currency || "usd";

      const { rowsHtml, totalFromItemsCents } = await getLineItemsRows(session.id, currency);

      const totalCents =
        Number(session?.amount_total ?? 0) > 0
          ? Number(session.amount_total)
          : totalFromItemsCents;

      const totalLabel = money(totalCents, currency);

      await sendAdminEmail({
        subject: `⏳ Checkout expirado - ${totalLabel}`,
        html: emailHtml({
          title: "TRADING SIN FRONTERAS SHOP · Alerta",
          eventType: event.type,
          statusLabel: "EXPIRADO (NO PAGADO)",
          name,
          email,
          whatsapp,
          totalLabel,
          rowsHtml,
          extraLines: [`Session ID: ${session.id}`],
        }),
      });
    }

    // 3) PAGO FALLIDO (PaymentIntent)
    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object;

      // Acá no siempre tenemos line items (porque no es session), pero sí tenemos monto y motivo
      const amount = Number(pi.amount ?? 0);
      const currency = pi.currency || "usd";
      const totalLabel = money(amount, currency);

      const lastErr = pi.last_payment_error;
      const reason =
        lastErr?.message ||
        lastErr?.code ||
        "Pago fallido (sin detalle)";

      // Intentamos extraer datos del metadata (si los seteaste)
      const name = pi?.metadata?.name || "Cliente";
      const email = pi?.metadata?.email || "—";
      const whatsapp = pi?.metadata?.whatsapp || "—";

      await sendAdminEmail({
        subject: `❌ Pago fallido - ${totalLabel}`,
        html: emailHtml({
          title: "TRADING SIN FRONTERAS SHOP · Alerta",
          eventType: event.type,
          statusLabel: "PAGO FALLIDO",
          name,
          email,
          whatsapp,
          totalLabel,
          rowsHtml: `<tr><td colspan="3">(no disponible en este evento)</td></tr>`,
          extraLines: [`Motivo: ${reason}`, `PaymentIntent: ${pi.id}`],
        }),
      });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).send("Webhook handler failed");
  }
}
