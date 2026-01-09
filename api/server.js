import express from "express";
import cors from "cors";
import { initDb, run, all, get } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

initDb();

function nowIso() {
  return new Date().toISOString();
}

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// List (com busca)
app.get("/items", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const rows = q
      ? await all(
          `SELECT * FROM items
           WHERE title LIKE ? OR status LIKE ? OR owner LIKE ?
           ORDER BY id DESC`,
          [`%${q}%`, `%${q}%`, `%${q}%`]
        )
      : await all(`SELECT * FROM items ORDER BY id DESC`);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Create 1
app.post("/items", async (req, res) => {
  try {
    const { title, status = "New", owner = "" } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: "title is required" });

    const ts = nowIso();
    const r = await run(
      `INSERT INTO items (title, status, owner, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [String(title).trim(), String(status).trim(), String(owner).trim(), ts, ts]
    );

    const created = await get(`SELECT * FROM items WHERE id = ?`, [r.lastID]);
    res.json(created);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Update 1
app.put("/items/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, status, owner } = req.body || {};

    const existing = await get(`SELECT * FROM items WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: "not found" });

    const newTitle = title !== undefined ? String(title).trim() : existing.title;
    const newStatus = status !== undefined ? String(status).trim() : existing.status;
    const newOwner = owner !== undefined ? String(owner).trim() : existing.owner;

    await run(
      `UPDATE items SET title=?, status=?, owner=?, updated_at=? WHERE id=?`,
      [newTitle, newStatus, newOwner, nowIso(), id]
    );

    const updated = await get(`SELECT * FROM items WHERE id = ?`, [id]);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Delete 1
app.delete("/items/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await run(`DELETE FROM items WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});


app.post("/items/bulk", async (req, res) => {
  try {
    const rows = req.body?.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "rows must be a non-empty array" });
    }

    const ts = nowIso();
    let inserted = 0;

    for (const r of rows) {
      const title = String(r.title || "").trim();
      if (!title) continue;

      const status = String(r.status || "New").trim();
      const owner = String(r.owner || "").trim();

      await run(
        `INSERT INTO items (title, status, owner, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [title, status, owner, ts, ts]
      );
      inserted++;
    }

    res.json({ ok: true, inserted });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
