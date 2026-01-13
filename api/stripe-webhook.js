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

function normalizeName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function getLineItems(sessionId) {
  const li = await stripe.checkout.sessions.listLineItems(sessionId, {
    limit: 100,
  });
  return li?.data || [];
}

async function fetchAdminProducts() {
  const base =
    (process.env.API_BASE_URL && process.env.API_BASE_URL.trim()) ||
    "https://tradingsinfronteras-shop.vercel.app";

  const url = `${base}/api/admin-products`;

  const res = await fetch(url);
  const text = await res.text();
  const data = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  })();

  if (!res.ok) throw new Error(data?.error || "No se pudo leer /api/admin-products");
  if (!data || !Array.isArray(data.products)) throw new Error("Respuesta inválida de /api/admin-products");

  return data.products;
}

function matchProductFromLineItem(adminProducts, lineItem) {
  const liName = normalizeName(lineItem?.description || "");
  const liQty = Number(lineItem?.quantity || 1);
  const liTotal = Number(lineItem?.amount_total ?? lineItem?.amount_subtotal ?? 0);
  const liUnit = liQty > 0 ? Math.round(liTotal / liQty) : liTotal;

  // 1) Match fuerte: nombre + price_cents exacto
  let hit = adminProducts.find((p) => {
    const pName = normalizeName(p?.name || "");
    const pPrice = Number(p?.price_cents ?? 0);
    return pName === liName && pPrice === liUnit;
  });
  if (hit) return hit;

  // 2) Match por nombre
  hit = adminProducts.find((p) => normalizeName(p?.name || "") === liName);
  if (hit) return hit;

  // 3) Match parcial
  hit = adminProducts.find((p) => {
    const pName = normalizeName(p?.name || "");
    return pName && liName && (pName.includes(liName) || liName.includes(pName));
  });

  return hit || null;
}

/* =========================
   EMAIL HTMLs
========================= */

function pillButton(label, href, variant = "primary") {
  const styles =
    variant === "whatsapp"
      ? "background:#00cfff;color:#001018;border:1px solid rgba(0,207,255,.35);"
      : "background:#00cfff;color:#001018;border:1px solid rgba(0,207,255,.35);";

  return `
    <a href="${escapeHtml(href)}"
       style="display:inline-block; padding:12px 18px; border-radius:999px; text-decoration:none;
              font-weight:800; letter-spacing:.02em; ${styles}">
      ${escapeHtml(label)}
    </a>
  `;
}

function emailAdminHtml({ title, eventType, statusLabel, name, email, whatsapp, totalLabel, rowsHtml, extraLines }) {
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

function emailCustomerHtml({ buyerName, deliveries, fallbackWalink }) {
  const blocks = deliveries
    .map((d) => {
      const access = d.accessUrl
        ? `<div style="margin-top:12px;">${pillButton(
            d.accessLabel || "Acceder",
            d.accessUrl
          )}</div>`
        : `<p style="margin:10px 0 0 0; opacity:.85;"><b>Acceso:</b> Te lo enviamos/activamos manualmente.</p>`;

      const pdf = d.pdf_url
        ? `<p style="margin:10px 0 0 0;"><b>PDF:</b> <a href="${escapeHtml(d.pdf_url)}" style="color:#00cfff;">Descargar instructivo</a></p>`
        : "";

      const body = d.email_body
        ? `<div style="margin-top:12px; padding:12px; border-radius:12px; border:1px solid #222; background:#0f0f0f;">
             <div style="opacity:.95;">${d.email_body}</div>
           </div>`
        : "";

      const walink = (d.walink_url || "").trim() || (fallbackWalink || "").trim();
      const whatsappBtn = walink
        ? `<div style="margin-top:12px;">${pillButton("WHATSAPP", walink, "whatsapp")}</div>`
        : "";

      return `
        <div style="margin-top:16px; padding:16px; border-radius:16px; border:1px solid #222; background:#0b0d13;">
          <h3 style="margin:0 0 8px 0;">${escapeHtml(d.name)}</h3>
          ${access}
          ${whatsappBtn}
          ${pdf}
          ${body}
        </div>
      `;
    })
    .join("");

  return `
  <div style="font-family:Arial,sans-serif; background:#0b0b0b; color:#fff; padding:24px;">
    <h2 style="margin:0 0 6px 0;">¡Gracias por tu compra!</h2>
    <p style="margin:0 0 14px 0; opacity:.85;">
      Hola <b>${escapeHtml(buyerName || "Trader")}</b>, acá tenés tus accesos e instrucciones.
    </p>

    ${blocks}

    <p style="margin-top:18px; opacity:.75;">
      Si no ves el contenido al instante, revisá Spam/Promociones o escribinos por WhatsApp.
    </p>

    <p style="margin-top:20px; opacity:.65;">© ${new Date().getFullYear()} TRADING SIN FRONTERAS SHOP</p>
  </div>
  `;
}

/* =========================
   SENDERS
========================= */

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

async function sendCustomerEmail({ to, subject, html }) {
  const transporter = buildTransporter();
  const bcc = (process.env.CUSTOMER_EMAIL_BCC || "").trim() || undefined;

  await transporter.sendMail({
    from: `TSF SHOP <${process.env.SMTP_EMAIL}>`,
    to,
    bcc,
    subject,
    html,
  });
}

/* =========================
   MAIN HANDLER
========================= */

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
    return res
      .status(400)
      .send(`Webhook Error: ${err?.message || "Invalid signature"}`);
  }

  try {
    // 1) COMPRA EXITOSA
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const buyerName =
        session?.metadata?.name || session?.customer_details?.name || "Cliente";

      const buyerEmail =
        session?.metadata?.email ||
        session?.customer_details?.email ||
        session?.customer_email ||
        "";

      const buyerWhatsapp =
        session?.metadata?.whatsapp ||
        session?.metadata?.buyerWhatsApp ||
        "";

      const currency = session?.currency || session?.metadata?.currency || "usd";

      // ADMIN MAIL
      const lineItems = await getLineItems(session.id);

      let rowsHtml = "";
      let totalFromItemsCents = 0;

      if (!lineItems.length) {
        rowsHtml = `<tr><td colspan="3">(sin items)</td></tr>`;
      } else {
        rowsHtml = lineItems
          .map((it) => {
            const name = escapeHtml(it.description || "Producto");
            const qty = Number(it.quantity || 1);
            const amount = Number(it.amount_total ?? it.amount_subtotal ?? 0);

            totalFromItemsCents += amount;

            return `
              <tr>
                <td style="padding:10px; border-bottom:1px solid #222;">${name}</td>
                <td style="padding:10px; text-align:center; border-bottom:1px solid #222;">${qty}</td>
                <td style="padding:10px; text-align:right; border-bottom:1px solid #222;">${money(amount, it.currency || currency)}</td>
              </tr>
            `;
          })
          .join("");
      }

      const totalCents =
        Number(session?.amount_total ?? 0) > 0
          ? Number(session.amount_total)
          : totalFromItemsCents;

      const totalLabel = money(totalCents, currency);

      await sendAdminEmail({
        subject: `✅ Compra confirmada - ${totalLabel}`,
        html: emailAdminHtml({
          title: "TRADING SIN FRONTERAS SHOP · Notificación",
          eventType: event.type,
          statusLabel: "PAGO COMPLETADO",
          name: buyerName,
          email: buyerEmail || "—",
          whatsapp: buyerWhatsapp || "—",
          totalLabel,
          rowsHtml,
          extraLines: [`Session ID: ${session.id}`],
        }),
      });

      // CUSTOMER MAIL (entrega)
      if (!buyerEmail) {
        console.warn("No buyerEmail => no se envía mail de entrega.");
        return res.status(200).json({ received: true, customer_email_sent: false });
      }

      let adminProducts = [];
      try {
        adminProducts = await fetchAdminProducts();
      } catch (e) {
        console.error("No se pudieron leer productos del admin:", e?.message || e);
        // Respondemos OK a Stripe, pero queda logueado
        return res.status(200).json({
          received: true,
          customer_email_sent: false,
          reason: "cannot_fetch_products",
        });
      }

      const deliveries = lineItems.map((li) => {
        const matched = matchProductFromLineItem(adminProducts, li);

        if (!matched) {
          return {
            name: li.description || "Producto",
            accessLabel: "Acceso",
            accessUrl: "",
            email_body:
              `<p>Estamos preparando tu acceso. Si no lo recibís en breve, respondé este mail.</p>`,
            pdf_url: "",
            walink_url: "",
          };
        }

        const accessUrl = (matched.delivery_value || "").trim();
        const accessLabel =
          accessUrl && accessUrl.includes("skool.com")
            ? "Entrar al aula (Skool)"
            : "Abrir acceso";

        const email_body = matched.email_body
          ? matched.email_body
          : `<p>Tu acceso está listo. Si necesitás ayuda, respondé este mail.</p>`;

        return {
          name: matched.name || li.description || "Producto",
          accessLabel,
          accessUrl,
          email_body,
          pdf_url: (matched.pdf_url || "").trim(),
          walink_url: (matched.walink_url || "").trim(),
        };
      });

      await sendCustomerEmail({
        to: buyerEmail,
        subject: `🎁 Acceso a tu compra – TSF SHOP`,
        html: emailCustomerHtml({
          buyerName,
          deliveries,
          // Fallback global si un producto no trae walink_url:
          fallbackWalink: (process.env.SUPPORT_WALINK || "").trim(),
        }),
      });

      return res.status(200).json({ received: true, customer_email_sent: true });
    }

    // otros eventos: OK
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).send("Webhook handler failed");
  }
}
