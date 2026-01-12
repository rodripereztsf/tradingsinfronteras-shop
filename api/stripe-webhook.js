// api/stripe-webhook.js
import Stripe from "stripe";
import nodemailer from "nodemailer";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function buildTransporter() {
  // Si usás Gmail SMTP:
  // SMTP_EMAIL = tu gmail
  // SMTP_PASS = app password
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

async function getLineItemsTable(sessionId, currencyFallback = "usd") {
  const li = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });

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
      const name = escapeHtml(it.description || it.price?.product?.name || "Producto");
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
}

function adminEmailHtml({ eventType, name, email, whatsapp, totalLabel, rowsHtml }) {
  return `
  <div style="font-family:Arial,sans-serif; background:#0b0b0b; color:#fff; padding:24px;">
    <h2 style="margin:0 0 8px 0;">TRADING SIN FRONTERAS SHOP · Notificación</h2>
    <p style="margin:0 0 16px 0; opacity:.85;">Evento: ${escapeHtml(eventType)}</p>

    <div style="background:#111; border:1px solid #222; border-radius:12px; padding:16px; margin-bottom:18px;">
      <p style="margin:6px 0;"><b>Nombre:</b> ${escapeHtml(name)}</p>
      <p style="margin:6px 0;"><b>Email:</b> ${escapeHtml(email)}</p>
      <p style="margin:6px 0;"><b>WhatsApp:</b> ${escapeHtml(whatsapp || "-")}</p>
      <p style="margin:10px 0 0 0;"><b>Total:</b> ${escapeHtml(totalLabel)}</p>
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

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);

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
    // Solo nos importa el pago completado para mail admin (por ahora)
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // Datos del comprador: priorizamos metadata, pero fallback a customer_details
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

      // Traer items reales desde Stripe
      const { rowsHtml, totalFromItemsCents, currency } = await getLineItemsTable(
        session.id,
        session?.currency || session?.metadata?.currency || "usd"
      );

      // Total: si session trae amount_total lo usamos, si no usamos suma de items
      const totalCents =
        Number(session?.amount_total ?? 0) > 0
          ? Number(session.amount_total)
          : totalFromItemsCents;

      const totalLabel = money(totalCents, currency);

      // Enviar mail al ADMIN (tu casilla TSF)
      const transporter = buildTransporter();

      const adminTo = process.env.ADMIN_EMAIL || process.env.SMTP_EMAIL; // recomendación: crear ADMIN_EMAIL
      await transporter.sendMail({
        from: `TSF SHOP <${process.env.SMTP_EMAIL}>`,
        to: adminTo,
        subject: `Nueva compra - ${totalLabel}`,
        html: adminEmailHtml({
          eventType: event.type,
          name,
          email,
          whatsapp,
          totalLabel,
          rowsHtml,
        }),
      });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).send("Webhook handler failed");
  }
}
