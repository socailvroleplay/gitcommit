// GitHub push webhook -> Discord embed (Design A) + website feed me save
import crypto from "crypto";
import { CREDIT, saveEntry } from "./_lib.js";

const COLOR_MERGE = 0x57f287; // green  - merge
const COLOR_PUSH = 0x5865f2;  // blurple - normal push

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function verify(raw, sigHeader, secret) {
  if (!secret) return true;
  if (!sigHeader) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sigHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// GitHub payload -> saaf data object (Discord aur website dono isi se bante hain)
function toEntry(p) {
  const head = p.head_commit || {};
  const msg = head.message || "";
  const [firstLine, ...restLines] = msg.split("\n");
  const rest = restLines.join("\n").trim();
  const commits = (p.commits || []).map((c) => ({
    sha: c.id.slice(0, 7),
    url: c.url,
    message: c.message.split("\n")[0],
  }));

  const e = {
    author: p.sender.login,
    avatar: p.sender.avatar_url,
    authorUrl: p.sender.html_url,
    repo: p.repository.full_name,
    branch: p.ref.replace("refs/heads/", ""),
    sha: (head.id || p.after || "").slice(0, 7),
    url: head.url || p.compare,
    time: head.timestamp || new Date().toISOString(),
    commits: [],
  };

  const prMerge = firstLine.match(/^Merge pull request #\d+ from [^/]+\/(.+)$/);
  const branchMerge = firstLine.match(/^Merge branch '([^']+)'/);

  if (prMerge || branchMerge) {
    e.type = "merge";
    e.source = (prMerge || branchMerge)[1];
    if (prMerge) {
      const [prTitle, ...body] = rest.split("\n");
      e.title = prTitle || e.source;
      e.message = body.join("\n").trim();
    } else {
      e.title = e.source;
      e.message = rest;
    }
  } else if (commits.length > 1) {
    e.type = "multi";
    e.title = `${commits.length} new commits`;
    e.commits = commits.slice(-10);
    e.url = p.compare;
  } else {
    e.type = "push";
    e.title = firstLine;
    e.message = rest;
  }

  e.title = (e.title || `Update on ${e.branch}`).slice(0, 250);
  if (e.type !== "multi") e.message = (e.message || firstLine || "No message").slice(0, 1000);
  return e;
}

function toDiscord(e) {
  const message =
    e.type === "multi"
      ? e.commits.map((c) => `[\`${c.sha}\`](${c.url}) ${c.message}`).join("\n").slice(0, 1000)
      : e.message;
  const status = e.type === "merge" ? `Merged · ${e.source} → ${e.branch}` : "Pushed";

  return {
    username: process.env.BOT_NAME || "Repo Commits",
    avatar_url: process.env.BOT_AVATAR || undefined,
    embeds: [
      {
        author: { name: e.author, icon_url: e.avatar, url: e.authorUrl },
        title: e.title,
        url: e.url,
        color: e.type === "merge" ? COLOR_MERGE : COLOR_PUSH,
        fields: [
          { name: "Repo", value: `\`${e.repo}\``, inline: true },
          { name: "Branch", value: `\`${e.branch}\``, inline: true },
          { name: "Commit", value: e.url ? `[\`${e.sha}\`](${e.url})` : `\`${e.sha}\``, inline: true },
          { name: "Message", value: message || "No message", inline: false },
        ],
        footer: { text: `${status}  •  ${CREDIT}` },
        timestamp: e.time,
      },
    ],
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("GitHub → Discord webhook is running ✅");

  const raw = await readRaw(req);
  if (!verify(raw, req.headers["x-hub-signature-256"], process.env.GITHUB_SECRET)) {
    return res.status(401).send("Invalid signature");
  }

  const event = req.headers["x-github-event"];
  if (event === "ping") return res.status(200).send("pong");
  if (event !== "push") return res.status(200).send(`ignored: ${event}`);

  const payload = JSON.parse(raw.toString("utf8"));
  if (payload.deleted) return res.status(200).send("branch deleted, skipped");

  const entry = toEntry(payload);

  // Dono kaam ek saath: Discord bhejo + website ke liye save karo
  const [discord, saved] = await Promise.allSettled([
    fetch(process.env.DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toDiscord(entry)),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`Discord error: ${await r.text()}`);
    }),
    saveEntry(entry),
  ]);

  const errors = [discord, saved].filter((x) => x.status === "rejected").map((x) => x.reason.message);
  if (errors.length) return res.status(502).send(errors.join(" | "));
  return res.status(200).send("sent + saved");
}
