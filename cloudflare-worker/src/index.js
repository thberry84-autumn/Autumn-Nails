const GITHUB_API = "https://api.github.com";
const REPO = "thberry84-autumn/Autumn-Nails";
const GALLERY_PATH = "images/nails";
const CAPTIONS_FILE = `${GALLERY_PATH}/captions.json`;
const SITE_ORIGINS = new Set(["https://autumnnails.com", "https://www.autumnnails.com"]);
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const SESSION_MAX_AGE = 12 * 60 * 60;
const ORDER_KEY = "_order";
const HOMEPAGE_KEY = "_homepage";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const corsOrigin = SITE_ORIGINS.has(origin) ? origin : "https://autumnnails.com";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, service: "autumn-nails-upload" }, 200, corsOrigin);
      if (url.pathname.startsWith("/images/") && request.method === "GET") return await serveImage(decodeURIComponent(url.pathname.slice(8)), env, corsOrigin);
      if (url.pathname === "/api/login" && request.method === "POST") return await login(request, env, corsOrigin);
      if (url.pathname === "/api/logout" && request.method === "POST") return json({ ok: true }, 200, corsOrigin);
      if (url.pathname === "/api/session" && request.method === "GET") return json({ authenticated: Boolean(await readSession(request, env)) }, 200, corsOrigin);
      if (url.pathname === "/api/gallery" && request.method === "GET") return json({ files: await listGallery(env) }, 200, corsOrigin, { "Cache-Control": "no-store" });
      if (url.pathname === "/api/gallery/metadata" && request.method === "PUT") {
        if (!await readSession(request, env)) return json({ error: "Not authorised" }, 401, corsOrigin);
        return await updateGalleryMetadata(request, env, corsOrigin);
      }
      if (url.pathname === "/api/upload" && request.method === "POST") {
        if (!await readSession(request, env)) return json({ error: "Not authorised" }, 401, corsOrigin);
        return await uploadFiles(request, env, corsOrigin);
      }
      if (url.pathname.startsWith("/api/gallery/") && request.method === "DELETE") {
        if (!await readSession(request, env)) return json({ error: "Not authorised" }, 401, corsOrigin);
        return await deleteFile(decodeURIComponent(url.pathname.slice(13)), env, corsOrigin);
      }
      return json({ error: "Not found" }, 404, corsOrigin);
    } catch (error) {
      console.error(error);
      return json({ error: "Something went wrong. Please try again." }, 500, corsOrigin);
    }
  }
};

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  };
}

function json(data, status, origin, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", ...extra } });
}

async function login(request, env, origin) {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) return json({ error: "Admin login has not been configured yet." }, 503, origin);
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (email !== env.ADMIN_EMAIL.trim().toLowerCase() || password !== env.ADMIN_PASSWORD) return json({ error: "Incorrect email or password." }, 401, origin);
  const payload = `${email}|${Date.now() + SESSION_MAX_AGE * 1000}`;
  const signature = await sign(payload, env.SESSION_SECRET);
  const token = `${b64url(payload)}.${signature}`;
  return json({ ok: true, token }, 200, origin);
}

async function readSession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;
  try {
    const payload = fromB64url(encodedPayload);
    if (!safeEqual(signature, await sign(payload, env.SESSION_SECRET))) return null;
    const separator = payload.lastIndexOf("|");
    const email = payload.slice(0, separator);
    const expiry = Number(payload.slice(separator + 1));
    if (!email || !Number.isFinite(expiry) || Date.now() > expiry) return null;
    if (env.ADMIN_EMAIL && email !== env.ADMIN_EMAIL.trim().toLowerCase()) return null;
    return { email, expiry };
  } catch { return null; }
}

async function uploadFiles(request, env, origin) {
  const form = await request.formData();
  const files = form.getAll("files").filter(v => v instanceof File);
  if (!files.length) return json({ error: "No photos were selected." }, 400, origin);
  if (files.length > 20) return json({ error: "Please upload no more than 20 photos at once." }, 400, origin);
  let captions = {};
  try { captions = JSON.parse(String(form.get("captions") || "{}")); } catch { return json({ error: "The captions could not be read." }, 400, origin); }
  const metadata = await getCaptions(env);
  const order = Array.isArray(metadata[ORDER_KEY]) ? metadata[ORDER_KEY].filter(Boolean) : [];
  const uploaded = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return json({ error: `${file.name} is not a supported image type.` }, 400, origin);
    if (file.size > MAX_FILE_SIZE) return json({ error: `${file.name} is larger than 8 MB.` }, 400, origin);
    const filename = makeFilename(file.name);
    await env.BUCKET.put(filename, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
    metadata[filename] = String(captions[String(i)] || "").trim().slice(0, 180);
    order.push(filename);
    uploaded.push({ name: filename, caption: metadata[filename] });
  }
  metadata[ORDER_KEY] = unique(order);
  await saveCaptions(metadata, env, "Add nail gallery photos");
  return json({ ok: true, uploaded }, 200, origin, { "Cache-Control": "no-store" });
}

async function updateGalleryMetadata(request, env, origin) {
  const body = await request.json();
  const metadata = await getCaptions(env);
  const listed = await env.BUCKET.list({ limit: 1000 });
  const validNames = new Set(listed.objects.filter(o => /\.(jpe?g|png|webp)$/i.test(o.key)).map(o => o.key));
  const name = String(body.name || "");
  if (name && !validNames.has(name)) return json({ error: "Photo not found." }, 404, origin);
  if (name && Object.prototype.hasOwnProperty.call(body, "caption")) metadata[name] = String(body.caption || "").trim().slice(0, 180);
  const currentOrder = Array.isArray(metadata[ORDER_KEY]) ? metadata[ORDER_KEY] : [];
  const requestedOrder = Array.isArray(body.order) ? body.order.filter(v => typeof v === "string") : currentOrder;
  const ordered = unique(requestedOrder.filter(n => validNames.has(n)));
  for (const n of validNames) if (!ordered.includes(n)) ordered.push(n);
  metadata[ORDER_KEY] = ordered;
  if (Object.prototype.hasOwnProperty.call(body, "homepage")) {
    const homepage = body.homepage == null ? "" : String(body.homepage);
    if (homepage && !validNames.has(homepage)) return json({ error: "Homepage photo not found." }, 404, origin);
    metadata[HOMEPAGE_KEY] = homepage;
  } else if (metadata[HOMEPAGE_KEY] && !validNames.has(metadata[HOMEPAGE_KEY])) {
    metadata[HOMEPAGE_KEY] = "";
  }
  await saveCaptions(metadata, env, "Update nail gallery settings");
  return json({ ok: true, files: await listGallery(env) }, 200, origin, { "Cache-Control": "no-store" });
}

async function serveImage(filename, env, origin) {
  if (!/^[\w .()\-]+\.(jpe?g|png|webp)$/i.test(filename)) return new Response("Not found", { status: 404, headers: corsHeaders(origin) });
  const object = await env.BUCKET.get(filename);
  if (!object) return new Response("Not found", { status: 404, headers: corsHeaders(origin) });
  const headers = new Headers(corsHeaders(origin));
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

async function listGallery(env) {
  const captions = await getCaptions(env);
  const listed = await env.BUCKET.list({ limit: 1000 });
  const objects = listed.objects.filter(o => /\.(jpe?g|png|webp)$/i.test(o.key));
  const order = Array.isArray(captions[ORDER_KEY]) ? captions[ORDER_KEY] : [];
  const rank = new Map(order.map((name, i) => [name, i]));
  objects.sort((a, b) => {
    const ar = rank.has(a.key) ? rank.get(a.key) : Number.MAX_SAFE_INTEGER;
    const br = rank.has(b.key) ? rank.get(b.key) : Number.MAX_SAFE_INTEGER;
    return ar - br || b.key.localeCompare(a.key);
  });
  const homepage = captions[HOMEPAGE_KEY] || objects[0]?.key || "";
  return objects.map((o, i) => ({ name: o.key, caption: captions[o.key] || "", url: `https://autumn-nails-upload.thberry84.workers.dev/images/${encodeURIComponent(o.key)}`, position: i + 1, homepage: o.key === homepage }));
}

async function deleteFile(filename, env, origin) {
  if (!/^[\w .()\-]+\.(jpe?g|png|webp)$/i.test(filename)) return json({ error: "Invalid filename." }, 400, origin);
  const existing = await env.BUCKET.head(filename);
  if (!existing) return json({ error: "Photo not found." }, 404, origin);
  await env.BUCKET.delete(filename);
  const captions = await getCaptions(env);
  delete captions[filename];
  captions[ORDER_KEY] = (Array.isArray(captions[ORDER_KEY]) ? captions[ORDER_KEY] : []).filter(n => n !== filename);
  if (captions[HOMEPAGE_KEY] === filename) captions[HOMEPAGE_KEY] = captions[ORDER_KEY][0] || "";
  await saveCaptions(captions, env, "Delete nail gallery photo");
  return json({ ok: true }, 200, origin, { "Cache-Control": "no-store" });
}

async function getCaptions(env) {
  const result = await githubRequest(`/repos/${REPO}/contents/${CAPTIONS_FILE}`, env.GITHUB_TOKEN);
  if (result.status === 404) return {};
  if (!result.ok) throw new Error(`GitHub captions request failed: ${result.status}`);
  const data = await result.json();
  try {
    const binary = atob(data.content.replace(/\n/g, ""));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0))));
  } catch { return {}; }
}

async function saveCaptions(captions, env, message = "Update nail photo captions") {
  const current = await githubRequest(`/repos/${REPO}/contents/${CAPTIONS_FILE}`, env.GITHUB_TOKEN);
  const sha = current.ok ? (await current.json()).sha : undefined;
  const content = toBase64Sync(new TextEncoder().encode(JSON.stringify(captions, null, 2) + "\n"));
  const body = { message, content };
  if (sha) body.sha = sha;
  const result = await githubRequest(`/repos/${REPO}/contents/${CAPTIONS_FILE}`, env.GITHUB_TOKEN, { method: "PUT", body: JSON.stringify(body) });
  if (!result.ok) throw new Error(`GitHub captions save failed: ${result.status}`);
}

async function githubRequest(path, token, options = {}) {
  return fetch(`${GITHUB_API}${path}`, { ...options, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10", "User-Agent": "Autumn-Nails-Upload-Worker", ...(options.headers || {}) } });
}

function makeFilename(original) {
  const extension = original.toLowerCase().match(/\.(jpe?g|png|webp)$/)?.[1] || "jpg";
  const base = original.replace(/\.[^.]+$/, " ").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "nail-set";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${crypto.randomUUID().slice(0, 8)}-${base}.${extension}`;
}

function unique(values) { return [...new Set(values)]; }
async function sign(value, secret) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))); }
function safeEqual(a, b) { if (a.length !== b.length) return false; let result = 0; for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i); return result === 0; }
function b64url(value) { const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value); let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function fromB64url(value) { const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4); return new TextDecoder().decode(Uint8Array.from(atob(padded), c => c.charCodeAt(0))); }
function toBase64Sync(bytes) { let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); }
