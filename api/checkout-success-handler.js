// api/checkout-success-handler.js

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { Redis } = require("@upstash/redis");
const nodemailer = require("nodemailer");

const setCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // si querés, luego limitamos a tu dominio
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const { session_id } = body;

    if (!session_id) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Missing session_id" }));
    }

    // 1️⃣ Traer sesión de Stripe con sus line_items
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["line_items"],
    });

    const email =
      session.customer_details?.email || session.customer_email || null;

    if (!email) {
      throw new Error("No se encontró el email del comprador en la sesión.");
    }

    const lineItems = session.line_items?.data || [];
    if (!lineItems.length) {
      throw new Error("La sesión no tiene productos asociados.");
    }

    // 2️⃣ Leer productos desde Redis
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    let products = await redis.get("tsf:products");
    if (!Array.isArray(products)) {
      products = [];
    }

    // 3️⃣ Cruzar items de Stripe con productos por nombre
    const purchased = [];

    for (const item of lineItems) {
      const name = item.description; // viene del product_data.name
      const quantity = item.quantity || 1;

      const product = products.find((p) => p.name === name);
      if (product) {
        purchased.push({ product, quantity });
      }
    }

    if (!purchased.length) {
      throw new Error(
        "No se pudieron mapear los productos de Stripe con los productos TSF."
      );
    }

    // 4️⃣ Armar contenido del mail
    const buyerName = session.customer_details?.name || "trader";

    let html = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#020308; color:#ffffff; padding:24px;">
        <h1 style="font-size:20px; margin-bottom:8px;">¡Gracias por tu compra en TRADING SIN FRONTERAS SHOP!</h1>
        <p style="font-size:14px; opacity:0.9; margin-bottom:16px;">
          Hola ${buyerName},<br/>
          tu pago fue procesado correctamente. A continuación tenés el detalle de los productos que acabás de adquirir y los pasos para acceder a cada uno.
        </p>
    `;

    for (const { product, quantity } of purchased) {
      html += `
        <hr style="border:none; border-top:1px solid #333; margin:16px 0;" />
        <h2 style="font-size:16px; margin:4px 0;">${product.name}</h2>
        <p style="font-size:13px; opacity:0.85; margin:4px 0;">
          Cantidad: ${quantity}<br/>
          Tipo: ${product.type || "-"}
        </p>
      `;

      if (product.delivery_value) {
        html += `
          <p style="font-size:13px; margin:4px 0;">
            <strong>Acceso / contenido:</strong><br/>
            <a href="${product.delivery_value}" style="color:#f1c40f;" target="_blank" rel="noopener noreferrer">
              ${product.delivery_value}
            </a>
          </p>
        `;
      }

      if (product.instructions) {
        html += `
          <p style="font-size:13px; margin:8px 0;">
            <strong>Instructivo:</strong><br/>
            ${product.instructions}
          </p>
        `;
      }

      if (product.pdf_url) {
        html += `
          <p style="font-size:13px; margin:4px 0;">
            <strong>Instructivo en PDF:</strong><br/>
            <a href="${product.pdf_url}" style="color:#f1c40f;" target="_blank" rel="noopener noreferrer">
              Descargar PDF
            </a>
          </p>
        `;
      }
    }

    html += `
        <hr style="border:none; border-top:1px solid #333; margin:20px 0;" />
        <p style="font-size:12px; opacity:0.7;">
          Si tenés alguna duda, simplemente respondé este correo o contactanos por los canales oficiales de la comunidad TSF.
        </p>
        <p style="font-size:12px; opacity:0.7;">
          Equipo TRADING SIN FRONTERAS.
        </p>
      </div>
    `;

    // 5️⃣ Transporter SMTP (Gmail u otro)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Trading Sin Fronteras" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: "Tu compra en TRADING SIN FRONTERAS SHOP",
      html,
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error("checkout-success-handler ERROR:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        error: "Error processing checkout success",
        message: err?.message,
      })
    );
  }
};
