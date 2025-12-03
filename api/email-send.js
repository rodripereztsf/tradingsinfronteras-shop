// api/email-send.js
const nodemailer = require("nodemailer");
const { Redis } = require("@upstash/redis");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  const {
    email,
    product_id,
    buyer_name = "trader",
  } = JSON.parse(req.body || "{}");

  if (!email || !product_id) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Missing fields" }));
  }

  try {
    // 1️⃣ Conectamos Redis
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    // 2️⃣ Buscamos todos los productos y uno por ID
    let products = await redis.get("tsf:products");
    if (!Array.isArray(products)) throw new Error("No product list in Redis.");

    const product = products.find((p) => p.id === product_id);
    if (!product) throw new Error("Product not found");

    // 3️⃣ EMAIL TEMPLATE SEGÚN PRODUCTO
    const subject = product.email_subject || `Tu compra en Trading Sin Fronteras`;
    let body = product.email_body || `
      ¡Hola {{name}}!
      Gracias por tu compra del producto: **${product.name}**.
      Acceso: ${product.delivery_value}
      Equipo TSF.
    `;

    // 4️⃣ Reemplazos dinámicos
    body = body
      .replace(/{{name}}/g, buyer_name)
      .replace(/{{product}}/g, product.name)
      .replace(/{{delivery}}/g, product.delivery_value);

    // 5️⃣ Configurar transporter Gmail / SMTP
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASS,
      },
    });

    // 6️⃣ Adjuntos (PDF si está configurado)
    const attachments = [];
    if (product.pdf_url) {
      attachments.push({
        filename: product.name + ".pdf",
        path: product.pdf_url,
      });
    }

    // 7️⃣ Enviar email
    await transporter.sendMail({
      from: `"Trading Sin Fronteras" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject,
      html: body,
      attachments,
    });

    return res.end(JSON.stringify({ ok: true }));

  } catch (err) {
    console.error("EMAIL ERROR:", err);
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: err.message }));
  }
};
