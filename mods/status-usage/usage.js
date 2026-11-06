// Agent plan usage (share of the limit used), read from each agent's own data.
//  - Claude Code: the OAuth usage endpoint Claude Code itself uses, with the
//    token Claude Code keeps in ~/.claude/.credentials.json (sent only to
//    api.anthropic.com).
//  - Codex: the latest `rate_limits` Codex writes into ~/.codex/sessions.
import * as fs from "fs/promises";
import { home } from "herdr";

const join = (...p) => p.join("/");

// A window: { used: 0..100, resetsAt: ms epoch | null, label }
function windowOf(used, resetsAt, label) {
  if (typeof used !== "number") return null;
  // A window whose reset already passed starts over at 0.
  if (resetsAt && resetsAt < Date.now()) used = 0;
  return { used: Math.max(0, Math.min(100, used)), resetsAt, label };
}

export async function claudeUsage() {
  let token;
  try {
    const creds = JSON.parse(await fs.readFile(join(home(), ".claude", ".credentials.json"), "utf8"));
    token = creds?.claudeAiOauth?.accessToken;
  } catch {
    return { error: "未ログイン" };
  }
  if (!token) return { error: "未ログイン" };
  const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const d = await res.json();
  const at = (w) => (w?.resets_at ? Date.parse(w.resets_at) : null);
  return {
    windows: [
      windowOf(d?.five_hour?.utilization, at(d?.five_hour), "5時間"),
      windowOf(d?.seven_day?.utilization, at(d?.seven_day), "週"),
    ].filter(Boolean),
  };
}

function findRateLimits(line) {
  try {
    const o = JSON.parse(line);
    const r = o?.payload?.rate_limits ?? o?.rate_limits ?? o?.payload?.info?.rate_limits;
    return r && (r.primary || r.secondary) ? r : null;
  } catch {
    return null;
  }
}

function minutesLabel(m) {
  if (!m) return "";
  if (m % 10080 === 0) return "週";
  if (m % 1440 === 0) return `${m / 1440}日`;
  if (m % 60 === 0) return `${m / 60}時間`;
  return `${m}分`;
}

export async function codexUsage() {
  const root = join(home(), ".codex", "sessions");
  // Newest session files first: sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl
  const files = [];
  for (let back = 0; back < 14 && files.length < 6; back++) {
    const d = new Date(Date.now() - back * 86400000);
    const dir = join(root, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0"));
    let names = [];
    try { names = await fs.readdir(dir); } catch { continue; }
    names.filter((n) => n.endsWith(".jsonl")).sort().reverse().forEach((n) => files.push(join(dir, n)));
  }
  if (files.length === 0) return { error: "記録なし" };
  for (const f of files.slice(0, 6)) {
    let text;
    try { text = await fs.readFile(f, "utf8"); } catch { continue; }
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"rate_limits"')) continue;
      const r = findRateLimits(lines[i]);
      if (!r) continue;
      const w = (x) => x && windowOf(x.used_percent, x.resets_at ? x.resets_at * 1000 : null, minutesLabel(x.window_minutes));
      return { windows: [w(r.primary), w(r.secondary)].filter(Boolean) };
    }
  }
  return { error: "記録なし" };
}

export function resetText(ms) {
  if (!ms) return "";
  const left = ms - Date.now();
  if (left <= 0) return "リセット済み";
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  if (h >= 24) return `あと${Math.floor(h / 24)}日${h % 24}時間でリセット`;
  return h > 0 ? `あと${h}時間${m}分でリセット` : `あと${m}分でリセット`;
}
