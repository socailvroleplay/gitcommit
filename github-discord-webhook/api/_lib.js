// Shared helpers (underscore wali file Vercel endpoint nahi banata)

export const CREDIT =
  process.env.DEV_CREDIT || "Developed by Vision Development / David Conway";

const KEY = "commits";
const MAX_SAVED = 200;

const redisUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(commands) {
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) throw new Error("Redis env vars missing (KV_REST_API_URL / KV_REST_API_TOKEN)");
  const r = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`Redis error: ${await r.text()}`);
  return r.json();
}

export async function saveEntry(entry) {
  await redis([
    ["LPUSH", KEY, JSON.stringify(entry)],
    ["LTRIM", KEY, "0", String(MAX_SAVED - 1)],
  ]);
}

export async function loadEntries(limit = 100) {
  const [res] = await redis([["LRANGE", KEY, "0", String(limit - 1)]]);
  return (res.result || []).map((s) => JSON.parse(s));
}
