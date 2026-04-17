import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

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

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".mp3":
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
}

async function readBodyJson(req, limitBytes = 32 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) throw new Error("Payload too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return null;
  return JSON.parse(raw);
}

async function handleRsvp(req, res) {
  const body = await readBodyJson(req);
  const name = String(body?.name ?? "").trim();
  const attendance = String(body?.attendance ?? "").trim();

  if (!name) return sendJson(res, 400, { error: "Name is required" });
  if (!attendance) return sendJson(res, 400, { error: "Attendance is required" });

  const token = mustGetEnv("TELEGRAM_BOT_TOKEN");
  const chatId = mustGetEnv("TELEGRAM_CHAT_ID");

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
    return sendJson(res, 502, { error: "Telegram send failed", details: tgJson });
  }

  return sendJson(res, 200, { ok: true });
}

async function serveStatic(req, res, urlPath) {
  const safePath = urlPath === "/" ? "/index.html" : urlPath;
  const decoded = decodeURIComponent(safePath);
  const normalized = path.posix.normalize(decoded);
  const rel = normalized.replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(__dirname, rel);

  // Prevent path escape
  if (!filePath.startsWith(__dirname + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": guessContentType(filePath) });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "POST" && url.pathname === "/api/rsvp") {
      return await handleRsvp(req, res);
    }

    if (req.method === "GET" || req.method === "HEAD") {
      return await serveStatic(req, res, url.pathname);
    }

    res.writeHead(405);
    res.end("Method not allowed");
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || "Server error" });
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`RSVP server listening on http://localhost:${port}`);
});

