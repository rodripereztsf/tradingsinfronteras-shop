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
  // Gmail SMTP
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
    .replace(/[\u0300-\u036f]/g, "") // sin tildes
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
  // Usá tu dominio de Vercel como “API”
  const base =
    (process.env.API_BASE_URL && process.env.API_BASE_URL.trim()) ||
    "https://tradingsinfronteras-shop.vercel.app";

  const url = `${base}/api/admin-products`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) throw new Error(data?.error || "No se pudo leer /api/admin-products");
  if (!data || !Array.isArray(data.products)) throw new Error("Respuesta inválida de /api/admin-products");

  return data.products;
}

function matchProductFromLineItem(adminProducts, lineItem) {
  // lineItem.description suele ser el nombre del producto
  const liName = normalizeName(lineItem?.description || "");
  const liQty = Number(lineItem?.quantity || 1);

  // amount_total es por ítem * qty (Stripe lo entrega así en listLineItems)
  const liTotal = Number(lineItem?.amount_total ?? lineItem?.amount_subtotal ?? 0);
  const liUnit = liQty > 0 ? Math.round(liTotal / liQty) : liTotal;

  // 1) Match fuerte: nombre normalizado + price_cents exacto
  let hit = adminProducts.find((p) => {
    const pName = normalizeName(p?.name || "");
    const pPrice = Number(p?.price_cents ?? 0);
    return pName === liName && pPrice === liUnit;
  });

  if (hit) return hit;

  // 2) Match por nombre solamente (si cambiaste precio o Stripe redondeó)
  hit = adminProducts.find((p) => normalizeName(p?.name || "") === liName);
  if (hit) return hit;

  // 3) Match parcial (por si hay diferencias mínimas en strings)
  hit = adminProducts.find((p) => {
    const pName = normalizeName(p?.name || "");
    return pName && liName && (pName.includes(liName) || liName.includes(pName));
  });

  return hit || null;
}

/* =========================
   EMAIL HTMLS
========================= */

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

function emailCustomerHtml({ buyerName, deliveries, supportWhatsapp }) {
  // deliveries: [{ name, accessLabel, accessUrl, email_body, pdf_url }]
  const blocks = deliveries
    .map((d) => {
      const access = d.accessUrl
        ? `<p style="margin:10px 0 0 0;"><b>Acceso:</b> <a href="${escapeHtml(d.accessUrl)}" style="color:#00cfff;">${escapeHtml(d.accessLabel || d.accessUrl)}</a></p>`
        : `<p style="margin:10px 0 0 0; opacity:.85;"><b>Acceso:</b> Te lo enviamos/activamos manualmente.</p>`;

      const pdf = d.pdf_url
        ? `<p style="margin:6px 0;"><b>PDF:</b> <a href="${escapeHtml(d.pdf_url)}" style="color:#00cfff;">Descargar instructivo</a></p>`
        : "";

      const body = d.email_body
        ? `<div style="margin-top:10px; padding:12px; border-radius:12px; border:1px solid #222; background:#0f0f0f;">
             <div style="opacity:.95;">${d.email_body}</div>
           </div>`
        : "";

      return `
        <div style="margin-top:16px; padding:16px; border-radius:16px; border:1px solid #222; background:#0b0d13;">
          <h3 style="margin:0 0 8px 0;">${escapeHtml(d.name)}</h3>
          ${access}
          ${pdf}
          ${body}
        </div>
      `;
    })
    .join("");

  const supportLine = supportWhatsapp
    ? `<p style="margin-top:16px; opacity:.85;">Soporte WhatsApp: <b>${escapeHtml(supportWhatsapp)}</b></p>`
    : `<p style="margin-top:16px; opacity:.85;">Si necesitás ayuda, respondé este mail y te asistimos.</p>`;

  return `
  <div style="font-family:Arial,sans-serif; background:#0b0b0b; color:#fff; padding:24px;">
    <h2 style="margin:0 0 6px 0;">¡Gracias por tu compra!</h2>
    <p style="margin:0 0 14px 0; opacity:.85;">
      Hola <b>${escapeHtml(buyerName || "Trader")}</b>, acá tenés tus accesos e instrucciones.
    </p>

    ${blocks}

    ${supportLine}

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

  // Si querés que SIEMPRE te llegue copia oculta:
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
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err?.message || err);
    return res.status(400).send(`Webhook Error: ${err?.message || "Invalid signature"}`);
  }

  try {
    // ===============================
    // 1) COMPRA EXITOSA
    // ===============================
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const buyerName =
        session?.metadata?.name ||
        session?.customer_details?.name ||
        "Cliente";

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

      // --- ADMIN MAIL (como ya tenías) ---
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
                <td>${name}</td>
                <td style="text-align:center;">${qty}</td>
                <td style="text-align:right;">${money(amount, it.currency || currency)}</td>
              </tr>
            `;
          })
          .join("");
      }

      const totalCents =
        Number(session?.amount_total ?? 0) > 0 ? Number(session.amount_total) : totalFromItemsCents;

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

      // --- CUSTOMER DELIVERY MAIL ---
      // Solo intentamos si hay email
      if (!buyerEmail) {
        console.warn("checkout.session.completed: no buyerEmail => no se envía mail de entrega.");
        return res.status(200).json({ received: true, customer_email_sent: false });
      }

      let adminProducts = [];
      try {
        adminProducts = await fetchAdminProducts();
      } catch (e) {
        console.error("No se pudieron leer productos del admin:", e?.message || e);
        // Igual respondemos ok (para no romper Stripe), pero te queda en logs
        return res.status(200).json({ received: true, customer_email_sent: false, reason: "cannot_fetch_products" });
      }

      // Armamos entregas por cada line item
      const deliveries = lineItems.map((li) => {
        const matched = matchProductFromLineItem(adminProducts, li);

        // Fallback si no matchea: enviamos al menos el nombre del producto
        if (!matched) {
          return {
            name: li.description || "Producto",
            accessLabel: "Acceso",
            accessUrl: "",
            email_body: `<p>Estamos preparando tu acceso. Si no lo recibís en breve, respondé este mail.</p>`,
            pdf_url: "",
          };
        }

        // delivery_value lo usás como link (Skool/Drive/etc)
        const accessUrl = (matched.delivery_value || "").trim();

        // si es Skool, conviene decirle “solicitá acceso” o “entrás por acá”
        const accessLabel =
          accessUrl && accessUrl.includes("skool.com")
            ? "Entrar al aula (Skool)"
            : "Abrir acceso";

        // OJO: email_body puede ser HTML o texto. Acá lo insertamos tal cual.
        const email_body = matched.email_body
          ? matched.email_body
          : `<p>Tu acceso está listo. Si necesitás ayuda, respondé este mail.</p>`;

        return {
          name: matched.name || li.description || "Producto",
          accessLabel,
          accessUrl,
          email_body,
          pdf_url: (matched.pdf_url || "").trim(),
        };
      });

      await sendCustomerEmail({
        to: buyerEmail,
        subject: `🎁 Acceso a tu compra – TSF SHOP`,
        html: emailCustomerHtml({
          buyerName,
          deliveries,
          supportWhatsapp: (process.env.SUPPORT_WHATSAPP || "").trim(),
        }),
      });

      return res.status(200).json({ received: true, customer_email_sent: true });
    }

    // ===============================
    // 2) CHECKOUT EXPIRADO
    // ===============================
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

      // Line items si se puede
      let rowsHtml = `<tr><td colspan="3">(no disponible)</td></tr>`;
      let totalFromItemsCents = 0;

      try {
        const li = await getLineItems(session.id);
        if (li.length) {
          rowsHtml = li
            .map((it) => {
              const nm = escapeHtml(it.description || "Producto");
              const qty = Number(it.quantity || 1);
              const amt = Number(it.amount_total ?? it.amount_subtotal ?? 0);
              totalFromItemsCents += amt;
              return `
                <tr>
                  <td>${nm}</td>
                  <td style="text-align:center;">${qty}</td>
                  <td style="text-align:right;">${money(amt, it.currency || currency)}</td>
                </tr>
              `;
            })
            .join("");
        }
      } catch {}

      const totalCents =
        Number(session?.amount_total ?? 0) > 0 ? Number(session.amount_total) : totalFromItemsCents;

      const totalLabel = money(totalCents, currency);

      await sendAdminEmail({
        subject: `⏳ Checkout expirado - ${totalLabel}`,
        html: emailAdminHtml({
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

      return res.status(200).json({ received: true });
    }

    // ===============================
    // 3) PAGO FALLIDO (PaymentIntent)
    // ===============================
    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object;

      const amount = Number(pi.amount ?? 0);
      const currency = pi.currency || "usd";
      const totalLabel = money(amount, currency);

      const lastErr = pi.last_payment_error;
      const reason = lastErr?.message || lastErr?.code || "Pago fallido (sin detalle)";

      const name = pi?.metadata?.name || "Cliente";
      const email = pi?.metadata?.email || "—";
      const whatsapp = pi?.metadata?.whatsapp || "—";

      await sendAdminEmail({
        subject: `❌ Pago fallido - ${totalLabel}`,
        html: emailAdminHtml({
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

      return res.status(200).json({ received: true });
    }

    // Otros eventos: respondemos OK
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).send("Webhook handler failed");
  }
}
