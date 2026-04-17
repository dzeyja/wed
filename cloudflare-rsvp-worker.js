/**
 * Cloudflare Worker: форма на GitHub Pages → Telegram.
 *
 * Токен бота сюда НЕ вставляйте — только через Secrets в Cloudflare.
 *
 * Деплой (CLI):
 *   npm i -g wrangler
 *   wrangler deploy cloudflare-rsvp-worker.js
 *   wrangler secret put TELEGRAM_BOT_TOKEN
 *   wrangler secret put TELEGRAM_CHAT_ID
 *
 * Или: Workers & Pages → Create → HTTP handler → вставить код → Settings → Variables → Secrets.
 *
 * После деплоя скопируйте URL вида https://visit-rsvp.xxx.workers.dev
 * и вставьте в index.html в window.__RSVP_ENDPOINT__.
 */

function attendanceLabel(value) {
  switch (value) {
    case "yes":
      return "Келемін";
    case "with_spouse":
      return "Жұбайыммен келемін";
    case "no":
      return "Өкінішке орай, келе алмаймын";
    default:
      return value || "(unknown)";
  }
}

function withCors(response) {
  const h = new Headers(response.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  h.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}

function json(status, obj) {
  return withCors(
    new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    })
  );
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (request.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const token = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      return json(500, { error: "Worker is not configured (secrets missing)" });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "Invalid JSON" });
    }

    const name = String(body?.name ?? "").trim();
    const attendance = String(body?.attendance ?? "").trim();

    if (!name) return json(400, { error: "Name is required" });
    if (!attendance) return json(400, { error: "Attendance is required" });

    const text =
      `RSVP жауап\n` +
      `Аты: ${name}\n` +
      `Жауабы: ${attendanceLabel(attendance)}`;

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true
      })
    });

    const tgJson = await tgRes.json().catch(() => null);
    if (!tgRes.ok || !tgJson?.ok) {
      return json(502, { error: "Telegram send failed", details: tgJson });
    }

    return json(200, { ok: true });
  }
};
