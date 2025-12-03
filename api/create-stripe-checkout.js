<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Pago recibido - TSF SHOP</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link
    href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;800&display=swap"
    rel="stylesheet"
  />
  <link rel="stylesheet" href="style.css" />
  <style>
    body {
      font-family: "Montserrat", system-ui, -apple-system, BlinkMacSystemFont,
        "Segoe UI", sans-serif;
      background: #020308;
      color: #fff;
      text-align: center;
      padding: 40px 16px;
    }

    .success-box {
      max-width: 600px;
      margin: 60px auto;
      background: #05060a;
      border-radius: 16px;
      border: 1px solid #222;
      padding: 24px 20px;
    }

    .success-title {
      font-size: 1.6rem;
      margin-bottom: 8px;
    }

    .success-msg {
      font-size: 0.95rem;
      opacity: 0.85;
      margin-bottom: 16px;
    }

    .status {
      font-size: 0.85rem;
      margin-top: 12px;
      opacity: 0.8;
    }

    .btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 20px;
      border-radius: 999px;
      border: 1px solid #f1c40f;
      color: #f1c40f;
      background: transparent;
      font-weight: 600;
      margin-top: 20px;
      text-decoration: none;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="success-box">
    <h1 class="success-title">¡Pago recibido correctamente!</h1>
    <p class="success-msg">
      Estamos procesando tu compra y generando el acceso a tus productos TSF.
    </p>
    <p id="status-text" class="status">
      Confirmando tu compra con Stripe...
    </p>

    <a href="index.html" class="btn-primary">Volver a la tienda</a>
  </div>

  <script>
    const API_BASE = "https://tradingsinfronteras-shop.vercel.app";

    function getSessionId() {
      const params = new URLSearchParams(window.location.search);
      return params.get("session_id") || params.get("sessionId");
    }

    async function processSuccess() {
      const statusEl = document.getElementById("status-text");
      const sessionId = getSessionId();

      if (!sessionId) {
        statusEl.textContent =
          "No se encontró la sesión de pago. Si ya realizaste el pago, revisá tu correo o contactá con soporte TSF.";
        return;
      }

      try {
        statusEl.textContent = "Confirmando tu compra y enviando el correo de acceso...";

        const res = await fetch(`${API_BASE}/api/checkout-success-handler`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          console.error("checkout-success-handler error:", data);
          statusEl.textContent =
            "Tu pago fue recibido, pero hubo un error al procesar el acceso automático. Por favor, revisá tu correo unos minutos más tarde o escribinos con el comprobante.";
          return;
        }

        statusEl.textContent =
          "Listo. En los próximos minutos deberías recibir un correo con todos los accesos e instructivos.";
      } catch (e) {
        console.error(e);
        statusEl.textContent =
          "Tu pago fue recibido, pero hubo un error de conexión al procesar el acceso automático. Si no recibís el correo, contactanos con tu comprobante.";
      }
    }

    document.addEventListener("DOMContentLoaded", processSuccess);
  </script>
</body>
</html>
