// api/checkout-success-handler.js

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const setCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

// helper Upstash Redis
let redisPromise = null;
async function getRedis() {
  if (!redisPromise) {
    redisPromise = import("@upstash/redis").then(({ Redis }) => {
      return new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
    });
  }
  return redisPromise;
}

// helper para leer body JSON
async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => {
      try {
        const data = body ? JSON.parse(body) : {};
        resolve(data);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// helper para enviar mail de acceso (Resend)
async function sendAccessEmail(to, accessLinks) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("RESEND_API_KEY no configurado; no se envía email.");
    return;
  }

  const subject = "Tu acceso a TRADING SIN FRONTERAS SHOP";

  const linksHtml = accessLinks
    .map((link) => {
      const safeName = link.product_name || "Contenido TSF";

      let htmlItem = `<li style="margin-bottom:12px;">
        <strong>${safeName}</strong><br/>
        Acceso seguro TSF: <a href="${link.url}">${link.url}</a>
      `;

      if (link.content_url) {
        htmlItem += `<br/>Contenido (Drive / recurso): <a href="${link.content_url}">${link.content_url}</a>`;
      }

      if (link.instructions) {
        htmlItem += `<br/><br/><em>Instructivo:</em><br/>${link.instructions}`;
      }

      if (link.pdf_url) {
        htmlItem += `<br/><br/>Instructivo en PDF: <a href="${link.pdf_url}">${link.pdf_url}</a>`;
      }

      htmlItem += "</li>";
      return htmlItem;
    })
    .join("");

  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; line-height: 1.5;">
      <h2 style="margin-bottom: 8px;">Gracias por tu compra en <span style="color:#f1c40f;">TRADING SIN FRONTERAS SHOP</span></h2>
      <p>Te doy la bienvenida oficialmente a la comunidad. A continuación tenés tus accesos privados a los productos digitales que adquiriste:</p>
      <ul>
        ${linksHtml}
      </ul>
      <p>
        Cada enlace de <strong>Acceso seguro TSF</strong> es único y privado para vos.<br/>
        Dentro de esa página vas a encontrar el instructivo, materiales y, cuando corresponda, el link directo a tu contenido (Drive, indicadores, bots, etc.).
      </p>
      <p style="margin-top:16px;">
        Te recomiendo:<br/>
        • Guardar este correo en una carpeta de favoritos.<br/>
        • No compartir los enlaces de acceso con terceros.<br/>
        • Si cambiaste de mail o necesitás soporte, escribinos con el comprobante de pago.
      </p>
      <p style="margin-top:18px;">
        Un abrazo,<br/>
        <strong>Rodrigo Pérez</strong><br/>
        Founder – Trading Sin Fronteras
      </p>
    </div>
  `;

  const payload = {
    from: "TSF SHOP <no-reply@tradingsinfronteras.com>",
    to,
    subject,
    html,
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Error enviando email:", res.status, text);
  }
}

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
    const body = await readJsonBody(req);
    const { sessionId } = body || {};

    if (!sessionId) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Missing sessionId" }));
    }

    const redis = await getRedis();

    // evitamos procesar dos veces la misma sesión
    const already = await redis.get(`tsf:access_session:${sessionId}`);
    if (already) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({ ok: true, info: "Session already processed" })
      );
    }

    // obtenemos la sesión de Stripe con los items
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"],
    });

    if (session.payment_status !== "paid") {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Payment not completed" }));
    }

    const email =
      session.customer_details?.email || session.customer_email || null;

    if (!email) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "No customer email in session" }));
    }

    // productos desde Redis
    let products = await redis.get("tsf:products");
    if (!Array.isArray(products)) products = [];

    const lineItems = session.line_items?.data || [];
    const accessLinks = [];

    const baseAccessUrl =
      process.env.ACCESS_BASE_URL ||
      "https://tradingsinfronteras-shop.vercel.app/access.html";

    for (const li of lineItems) {
      const name = li.description || li.price?.product || "Producto";
      const product = products.find((p) => p.name === name);

      if (!product) {
        console.warn("Producto no encontrado por nombre:", name);
        continue;
      }

      // si es físico, no generamos acceso digital
      if (product.type === "physical" || product.delivery_type === "none") {
        continue;
      }

      // generamos token único
      const token =
        Math.random().toString(36).slice(2) + Date.now().toString(36);

      const record = {
        token,
        product_id: product.id,
        product_name: product.name,
        email,
        created_at: Date.now(),
        delivery_type: product.delivery_type || "generated_access",
        delivery_value: product.delivery_value || "",
        instructions: product.instructions || "",
        pdf_url: product.pdf_url || ""
      };

      await redis.set(`tsf:access:${token}`, record);

      const url = `${baseAccessUrl}?token=${encodeURIComponent(token)}`;

      accessLinks.push({
        token,
        product_name: product.name,
        url,
        content_url: product.delivery_value || null,
        instructions: product.instructions || "",
        pdf_url: product.pdf_url || null,
      });
    }

    // marcamos la sesión como procesada
    await redis.set(`tsf:access_session:${sessionId}`, {
      email,
      accessLinks,
      created_at: Date.now(),
    });

    // enviamos mail si hay al menos un acceso
    if (accessLinks.length > 0) {
      try {
        await sendAccessEmail(email, accessLinks);
      } catch (e) {
        console.error("Error enviando email de acceso:", e);
      }
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: true, email, accessLinks }));
  } catch (err) {
    console.error("Error en /api/checkout-success-handler:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        error: "Internal server error",
        message: err?.message,
      })
    );
  }
};
