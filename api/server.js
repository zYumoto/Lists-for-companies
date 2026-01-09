import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";

import { initDb, run, get, all } from "./db.js";
import { signToken, authMiddleware, requireAdmin } from "./auth.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

initDb();

function nowIso() {
  return new Date().toISOString();
}

/* =========================
   SEED ADMIN MASTER
========================= */
async function seedMaster() {
  // ✅ Seu perfil como Admin Master
  const email = "victor.charleaux@msc.com";
  const name = "Victor";
  const password = "ChangeMe123!"; // troque depois

  const exists = await get(`SELECT id FROM users WHERE email = ?`, [email]);
  if (exists) return;

  const hash = await bcrypt.hash(password, 10);
  const ts = nowIso();

  await run(
    `INSERT INTO users (email, name, password_hash, role, is_master, created_at, updated_at)
     VALUES (?, ?, ?, 'ADMIN', 1, ?, ?)`,
    [email, name, hash, ts, ts]
  );

  console.log("✅ Admin Master criado:");
  console.log("   Email:", email);
  console.log("   Senha:", password);
}
await seedMaster();

/* =========================
   HEALTH
========================= */
app.get("/health", (_req, res) => res.json({ ok: true }));

/* =========================
   AUTH
========================= */
app.post("/auth/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) return res.status(400).json({ error: "email e senha são obrigatórios" });

    const user = await get(`SELECT * FROM users WHERE email = ?`, [email]);
    if (!user) return res.status(401).json({ error: "Credenciais inválidas" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciais inválidas" });

    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_master: !!user.is_master
      }
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ✅ ROTA QUE O FRONT PRECISA
app.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await get(
      `SELECT id, email, name, role, is_master, created_at, updated_at
       FROM users WHERE id = ?`,
      [req.user.sub]
    );

    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ✅ Registrar novo admin (somente ADMIN logado)
app.post("/auth/register", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const name = String(req.body?.name || "").trim();
    const password = String(req.body?.password || "");

    if (!email || !name || !password) {
      return res.status(400).json({ error: "name, email e password são obrigatórios" });
    }

    const exists = await get(`SELECT id FROM users WHERE email = ?`, [email]);
    if (exists) return res.status(409).json({ error: "Email já existe" });

    const ts = nowIso();
    const password_hash = await bcrypt.hash(password, 10);

    await run(
      `INSERT INTO users (email, name, password_hash, role, is_master, created_at, updated_at)
       VALUES (?, ?, ?, 'ADMIN', 0, ?, ?)`,
      [email, name, password_hash, ts, ts]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* =========================
   ITEMS (PROTEGIDO)
========================= */

// Listar (com busca ?q=)
app.get("/items", authMiddleware, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

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

// Criar 1
app.post("/items", authMiddleware, async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const status = String(req.body?.status || "New").trim();
    const owner = String(req.body?.owner || "").trim();

    if (!title) return res.status(400).json({ error: "title é obrigatório" });

    const ts = nowIso();
    await run(
      `INSERT INTO items (title, status, owner, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [title, status, owner, ts, ts]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Atualizar 1 (Salvar)
app.put("/items/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "id inválido" });

    const existing = await get(`SELECT * FROM items WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: "Item não encontrado" });

    const title = req.body?.title !== undefined ? String(req.body.title).trim() : existing.title;
    const status = req.body?.status !== undefined ? String(req.body.status).trim() : existing.status;
    const owner = req.body?.owner !== undefined ? String(req.body.owner).trim() : (existing.owner || "");

    if (!title) return res.status(400).json({ error: "title é obrigatório" });

    await run(
      `UPDATE items SET title=?, status=?, owner=?, updated_at=? WHERE id=?`,
      [title, status, owner, nowIso(), id]
    );

    const updated = await get(`SELECT * FROM items WHERE id = ?`, [id]);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Excluir 1
app.delete("/items/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "id inválido" });

    await run(`DELETE FROM items WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Inserção em lote
app.post("/items/bulk", authMiddleware, async (req, res) => {
  try {
    const rows = req.body?.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "rows deve ser um array com pelo menos 1 item" });
    }

    const ts = nowIso();
    let inserted = 0;

    for (const r of rows) {
      const title = String(r?.title || "").trim();
      if (!title) continue;

      const status = String(r?.status || "New").trim();
      const owner = String(r?.owner || "").trim();

      await run(
        `INSERT INTO items (title, status, owner, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [title, status, owner, ts, ts]
      );

      inserted++;
    }

    res.json({ inserted });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* =========================
   START
========================= */
const PORT = 3001;
app.listen(PORT, () => console.log(`🚀 API rodando em http://localhost:${PORT}`));
