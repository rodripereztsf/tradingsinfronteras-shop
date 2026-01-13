// api/admin-products.js
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = "tsf_shop_products_v1";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function toBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return fallback;
}

function uid() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readProducts() {
  const data = await redis.get(KEY);
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return [];
}

async function writeProducts(products) {
  await redis.set(KEY, products);
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // GET: listar
    if (req.method === "GET") {
      const products = await readProducts();
      return res.status(200).json({ products });
    }

    // POST: crear/editar
    if (req.method === "POST") {
      const body = req.body || {};

      const incomingId = safeStr(body.id);
      const isEdit = !!incomingId;

      const name = safeStr(body.name);
      const type = safeStr(body.type) || "other";
      const short_description = safeStr(body.short_description);
      const price_cents = Number(body.price_cents ?? 0);
      const currency = safeStr(body.currency || "USD") || "USD";

      const image_url = safeStr(body.image_url);
      const is_active = toBool(body.is_active, true);
      const is_featured = toBool(body.is_featured, true);

      const delivery_type = safeStr(body.delivery_type || (safeStr(body.delivery_value) ? "drive_link" : "none"));
      const delivery_value = safeStr(body.delivery_value);

      const email_body = body.email_body ?? ""; // puede venir HTML
      const pdf_url = safeStr(body.pdf_url);

      // ✅ NUEVO
      const whatsapp_url = safeStr(body.whatsapp_url);

      if (!name) return res.status(400).json({ error: "Missing name" });
      if (!Number.isFinite(price_cents) || price_cents <= 0) {
        return res.status(400).json({ error: "Invalid price_cents" });
      }

      const products = await readProducts();

      if (isEdit) {
        const idx = products.findIndex((p) => p.id === incomingId);
        if (idx === -1) return res.status(404).json({ error: "Product not found" });

        products[idx] = {
          ...products[idx],
          id: incomingId,
          name,
          type,
          short_description,
          price_cents,
          currency,
          image_url,
          is_active,
          is_featured,
          delivery_type,
          delivery_value,
          email_body,
          pdf_url,
          whatsapp_url, // ✅
          updated_at: new Date().toISOString(),
        };

        await writeProducts(products);
        return res.status(200).json({ ok: true, product: products[idx] });
      }

      const newProduct = {
        id: uid(),
        name,
        type,
        short_description,
        price_cents,
        currency,
        image_url,
        is_active,
        is_featured,
        delivery_type,
        delivery_value,
        email_body,
        pdf_url,
        whatsapp_url, // ✅
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      products.unshift(newProduct);
      await writeProducts(products);
      return res.status(200).json({ ok: true, product: newProduct });
    }

    // DELETE: borrar
    if (req.method === "DELETE") {
      const body = req.body || {};
      const id = safeStr(body.id);
      if (!id) return res.status(400).json({ error: "Missing id" });

      const products = await readProducts();
      const next = products.filter((p) => p.id !== id);

      await writeProducts(next);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("admin-products error:", e);
    return res.status(500).json({ error: "Server error", message: e?.message || String(e) });
  }
}
