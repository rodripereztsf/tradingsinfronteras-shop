// api/stripe-webhook.js
//
// Webhook de Stripe para:
// - checkout.session.completed  -> pago aprobado, enviamos producto
// - payment_intent.succeeded    -> pago confirmado (extra seguridad)
// - payment_intent.payment_failed -> más adelante: mail de pago rechazado

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Dominio base de tu deploy en Vercel
const BASE_URL =
  process.env.SELF_BASE_URL ||
  "https://tradingsinfronteras-shop.vercel.app";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  // ⚠️ En esta primera versión asumimos que Vercel ya nos da req.body como JSON.
  // Stripe recomienda verificar la firma con el raw body.
  // Cuando quieras, endurecemos esto con verificación de firma completa.
  const event = req.body || {};

  try {
    const type = event.type;
    console.log("Stripe webhook recibido:", type);

    switch (type) {
      case "checkout.session.completed": {
        const session = event.data?.object || {};

        const email =
          session.customer_details?.email ||
          session.customer_email ||
          session.metadata?.buyer_email;

        const metadata = session.metadata || {};
        const productId = metadata.product_id; // lo vamos a setear desde create-stripe-checkout
        const buyerName =
          metadata.buyer_name ||
          session.customer_details?.name ||
          "trader";

        console.log("SESSION COMPLETED:", {
          email,
          productId,
          buyerName,
        });

        // Si no tenemos email o productId, no podemos enviar el acceso
        if (!email || !productId) {
          console.warn(
            "Faltan datos para enviar email (email o product_id). No se envía nada."
          );
          break;
        }

        // Llamamos a nuestra propia API de email para reutilizar la lógica
        const payload = {
          email,
          product_id: productId,
          buyer_name: buyerName,
        };

        const resp = await fetch(`${BASE_URL}/api/email-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await resp.json().catch(() => ({}));
        console.log("Respuesta de /api/email-send:", data);

        if (!resp.ok) {
          console.error(
            "Fallo al enviar email desde webhook:",
            resp.status,
            data
          );
        }
        break;
      }

      case "payment_intent.succeeded": {
        const intent = event.data?.object || {};
        console.log("PaymentIntent succeeded:", intent.id);
        // Acá podríamos hacer lógica extra si hiciera falta.
        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data?.object || {};
        const lastError = intent.last_payment_error;
        console.warn("PaymentIntent FAILED:", intent.id, lastError?.message);
        // Más adelante: acá podemos disparar un mail de "pago rechazado"
        break;
      }

      default:
        console.log("Evento Stripe no manejado:", type);
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ received: true }));
  } catch (err) {
    console.error("Error en stripe-webhook:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Webhook handler error" }));
  }
};
