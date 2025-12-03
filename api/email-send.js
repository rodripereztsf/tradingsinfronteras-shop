// api/email-send.js
const nodemailer = require("nodemailer");
const { Redis } = require("@upstash/redis");

// --- CORS helper (por si en algún momento llamás desde el front directamente)
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// --- helper para leer el body JSON en funciones serverless de Vercel
async function parseJsonBody(req) {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  try {
    const { email, product_id, buyer_name = "trader" } = await parseJsonBody(req);

    if (!email || !product_id) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Missing email or product_id" }));
    }

    // 1️⃣ Conectamos Redis
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    // 2️⃣ Buscamos lista de productos y el producto específico
    let products = await redis.get("tsf:products");
    if (!Array.isArray(products)) {
      throw new Error("No product list in Redis.");
    }

    const product = products.find((p) => p.id === product_id);
    if (!product) {
      throw new Error("Product not found");
    }

    // 3️⃣ Template de asunto y cuerpo
    const subject =
      product.email_subject || `Tu compra en Trading Sin Fronteras – ${product.name}`;

    // Si querés guardar un HTML personalizado por producto en Redis,
    // se usa product.email_body. Si no, usamos uno genérico:
    let html =
      product.email_body ||
      `
      <p>Hola {{name}},</p>

      <p>
        ¡Gracias por tu compra en <strong>Trading Sin Fronteras</strong>!<br>
        Te compartimos los datos de tu producto:
      </p>

      <ul>
        <li><strong>Producto:</strong> {{product}}</li>
      </ul>

      ${
        product.delivery_value
          ? `<p><strong>Acceso al contenido:</strong><br>
             <a href="{{delivery}}" target="_blank">Hacé clic acá para acceder al material</a>
             </p>`
          : ""
      }

      <p>
        Cualquier duda o inconveniente, respondé a este correo indicando tu nombre
        y el mail de compra.
      </p>

      <p>
        Abrazo,<br>
        <strong>Rodrigo Pérez</strong><br>
        Trading Sin Fronteras – TSF SHOP
      </p>
    `;

    // 4️⃣ Reemplazos dinámicos
    html = html
      .replace(/{{name}}/g, buyer_name)
      .replace(/{{product}}/g, product.name)
      .replace(/{{delivery}}/g, product.delivery_value || "");

    // 5️⃣ Configurar transporter (Gmail) usando tus envs SMTP_EMAIL / SMTP_PASS
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // STARTTLS
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASS,
      },
    });

    // 6️⃣ Adjuntos (PDF si está configurado en el producto)
    const attachments = [];
    if (product.pdf_url) {
      attachments.push({
        filename: product.name + ".pdf",
        path: product.pdf_url,
      });
    }

    // 7️⃣ Enviar email
    const info = await transporter.sendMail({
      from: `"Trading Sin Fronteras" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject,
      html,
      attachments,
    });

    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, messageId: info.messageId }));
  } catch (err) {
    console.error("EMAIL ERROR:", err);
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: err.message || "Email error" }));
  }
};
