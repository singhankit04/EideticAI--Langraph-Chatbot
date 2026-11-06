import cron from "node-cron";
import "dotenv/config";

let cronTask = null;

// Resolves healthcheck URL from BACKEND_URL
export function getHealthUrl() {
  const base = (process.env.BACKEND_URL).replace(/\/+$/, "");
  return base.endsWith("/api/health") ? base : `${base}/api/health`;
}

// Dispatches a keep-alive ping
export async function pingHealthCheck(url = getHealthUrl()) {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "EideticAI-KeepAlive/1.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`[Keep-Alive] Ping to "${url}" returned HTTP ${res.status}`);
      return { success: false, status: res.status };
    }

    const data = await res.json().catch(() => null);
    console.log(`[Keep-Alive] Pinged "${url}" (200 OK, uptime: ${Math.round(data?.uptime || 0)}s)`);
    return { success: true, status: 200, data };
  } catch (err) {
    console.error(`[Keep-Alive] Failed to ping "${url}": ${err.message}`);
    return { success: false, error: err.message };
  }
}

// Starts keep-alive cron job (every 14 minutes: */14 * * * *)
export function startKeepAliveCron() {
  if (cronTask) return cronTask;

  const url = getHealthUrl();
  setTimeout(() => pingHealthCheck(url).catch(() => {}), 1000);

  cronTask = cron.schedule("*/14 * * * *", 
    () => pingHealthCheck(url),
    {
      timezone: "Asia/Kolkata"
    }
  );
  console.log(`[Keep-Alive] Scheduled every 14 minutes targeting "${url}"`);
  return cronTask;
}

// Stops keep-alive cron job
export function stopKeepAliveCron() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.log("[Keep-Alive] Stopped.");
  }
}

export default {
  startKeepAliveCron,
  stopKeepAliveCron,
};
