// Website ke liye: saved commits ki list JSON me
import { CREDIT, loadEntries } from "./_lib.js";

export default async function handler(req, res) {
  try {
    const entries = await loadEntries(100);
    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");
    return res.status(200).json({
      title: process.env.BOT_NAME || "Repo Commits",
      credit: CREDIT,
      entries,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
