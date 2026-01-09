/* =========================
   CONFIG
========================= */
const API = "http://localhost:3001";

/* =========================
   HELPERS
========================= */
const el = (id) => document.getElementById(id);

function setAlert(node, msg, type = "bad") {
  if (!node) return;
  if (!msg) {
    node.classList.add("hidden");
    node.textContent = "";
    node.classList.remove("ok", "bad");
    return;
  }
  node.textContent = msg;
  node.classList.remove("hidden");
  node.classList.remove("ok", "bad");
  node.classList.add(type);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

/* =========================
   AUTH STORAGE
========================= */
function getToken() {
  return localStorage.getItem("token");
}
function setToken(token) {
  localStorage.setItem("token", token);
}
function clearToken() {
  localStorage.removeItem("token");
}

/* =========================
   API WRAPPER
========================= */
async function api(path, opts = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...opts, headers });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erro");
  return data;
}

/* =========================
   UI NODES
========================= */
// Views
const authView = el("authView");
const appView = el("appView");

// Header user box
const userBox = el("userBox");
const userName = el("userName");
const userEmail = el("userEmail");
const logoutBtn = el("logoutBtn");

// Auth
const loginEmail = el("loginEmail");
const loginPassword = el("loginPassword");
const loginBtn = el("loginBtn");
const authError = el("authError");

// App
const search = el("search");
const refreshBtn = el("refresh");
const count = el("count");

const title = el("title");
const status = el("status");
const owner = el("owner");
const createBtn = el("create");
const appError = el("appError");

// Bulk
const bulk = el("bulk");
const bulkSend = el("bulkSend");
const bulkPreview = el("bulkPreview");

// Table
const tbody = el("tbody");

// Admin register
const adminPanel = el("adminPanel");
const regName = el("regName");
const regEmail = el("regEmail");
const regPassword = el("regPassword");
const regBtn = el("regBtn");
const regResult = el("regResult");

/* =========================
   STATE
========================= */
let currentUser = null;

/* =========================
   VIEW CONTROL
========================= */
function showAuth() {
  authView.classList.remove("hidden");
  appView.classList.add("hidden");
  userBox.classList.add("hidden");
  currentUser = null;
  setAlert(authError, "");
  setAlert(appError, "");
  setAlert(regResult, "");
}

function showApp() {
  authView.classList.add("hidden");
  appView.classList.remove("hidden");
  userBox.classList.remove("hidden");
  setAlert(authError, "");
  setAlert(appError, "");
}

function applyUserToUI(user) {
  currentUser = user;

  userName.textContent = user?.name ? `${user.name}${user.is_master ? " (Master)" : ""}` : "—";
  userEmail.textContent = user?.email || "—";

  // Admin panel: aparece somente se ADMIN
  if (user?.role === "ADMIN") adminPanel.classList.remove("hidden");
  else adminPanel.classList.add("hidden");
}

/* =========================
   AUTH ACTIONS
========================= */
async function login() {
  setAlert(authError, "");
  const email = String(loginEmail.value || "").trim().toLowerCase();
  const password = String(loginPassword.value || "");

  if (!email || !password) {
    setAlert(authError, "Preencha email e senha.", "bad");
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "Entrando...";

  try {
    const r = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    setToken(r.token);
    await bootstrap(); // carrega /me e lista
  } catch (err) {
    setAlert(authError, err.message, "bad");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Entrar";
  }
}

async function logout() {
  clearToken();
  showAuth();
}

/* =========================
   BOOTSTRAP (auto-login)
========================= */
async function bootstrap() {
  const token = getToken();
  if (!token) {
    showAuth();
    return;
  }

  try {
    const me = await api("/me");
    applyUserToUI(me);
    showApp();
    await loadItems();
  } catch {
    // token inválido/expirado
    clearToken();
    showAuth();
  }
}

/* =========================
   LIST LOGIC
========================= */
function parseBulk(text) {
  // Aceita TSV (Excel) e CSV simples
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const rows = [];
  for (const line of lines) {
    let parts = line.includes("\t")
      ? line.split("\t")
      : (line.includes(";") ? line.split(";") : line.split(","));

    parts = parts.map(p => String(p ?? "").trim());

    rows.push({
      title: parts[0] || "",
      status: parts[1] || "New",
      owner: parts[2] || ""
    });
  }

  return rows.filter(r => r.title);
}

function renderBulkPreview() {
  const rows = parseBulk(bulk.value);
  bulkPreview.textContent = rows.length
    ? `Pronto para enviar: ${rows.length} linha(s). Primeira: "${rows[0].title}" / ${rows[0].status} / ${rows[0].owner}`
    : "Nenhuma linha válida detectada ainda.";
}

async function loadItems() {
  setAlert(appError, "");
  const q = (search?.value || "").trim();
  const items = await api(`/items${q ? `?q=${encodeURIComponent(q)}` : ""}`);

  count.textContent = `${items.length} item(ns)`;

  tbody.innerHTML = "";
  for (const it of items) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${it.id}</td>
      <td><input data-id="${it.id}" data-field="title" value="${escapeHtml(it.title)}" /></td>
      <td>
        <select data-id="${it.id}" data-field="status">
          ${["New","In Progress","Done","Blocked"].map(s => `
            <option ${s === it.status ? "selected" : ""}>${s}</option>
          `).join("")}
        </select>
      </td>
      <td><input data-id="${it.id}" data-field="owner" value="${escapeHtml(it.owner || "")}" /></td>
      <td class="small">${fmtDate(it.updated_at)}</td>
      <td>
        <div class="actionsCell">
          <button class="primary" data-action="save" data-id="${it.id}">Salvar</button>
          <button class="danger" data-action="delete" data-id="${it.id}">Excluir</button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  }
}

async function createOne() {
  setAlert(appError, "");
  const payload = {
    title: String(title.value || "").trim(),
    status: status.value,
    owner: String(owner.value || "").trim()
  };

  if (!payload.title) {
    setAlert(appError, "Preencha o título.", "bad");
    return;
  }

  createBtn.disabled = true;
  createBtn.textContent = "Adicionando...";

  try {
    await api("/items", { method: "POST", body: JSON.stringify(payload) });
    title.value = "";
    await loadItems();
  } catch (err) {
    setAlert(appError, err.message, "bad");
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = "Adicionar";
  }
}

async function saveRow(id) {
  setAlert(appError, "");
  const inputs = [...document.querySelectorAll(`[data-id="${id}"][data-field]`)];
  const payload = {};
  for (const inp of inputs) payload[inp.dataset.field] = inp.value;

  await api(`/items/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  await loadItems();
}

async function deleteRow(id) {
  setAlert(appError, "");
  if (!confirm("Excluir este item?")) return;

  await api(`/items/${id}`, { method: "DELETE" });
  await loadItems();
}

async function sendBulk() {
  setAlert(appError, "");
  const rows = parseBulk(bulk.value);
  if (!rows.length) {
    setAlert(appError, "Cole pelo menos 1 linha válida no lote.", "bad");
    return;
  }

  bulkSend.disabled = true;
  bulkSend.textContent = "Enviando...";

  try {
    const r = await api("/items/bulk", {
      method: "POST",
      body: JSON.stringify({ rows })
    });

    bulk.value = "";
    renderBulkPreview();
    setAlert(appError, `OK! Inseridos: ${r.inserted}`, "ok");
    await loadItems();
  } catch (err) {
    setAlert(appError, err.message, "bad");
  } finally {
    bulkSend.disabled = false;
    bulkSend.textContent = "Enviar lote";
  }
}

/* =========================
   ADMIN REGISTER
========================= */
async function registerAdmin() {
  setAlert(regResult, "");
  const name = String(regName.value || "").trim();
  const email = String(regEmail.value || "").trim().toLowerCase();
  const password = String(regPassword.value || "");

  if (!name || !email || !password) {
    setAlert(regResult, "Preencha nome, email e senha.", "bad");
    return;
  }

  regBtn.disabled = true;
  regBtn.textContent = "Criando...";

  try {
    await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password })
    });

    regName.value = "";
    regEmail.value = "";
    regPassword.value = "";
    setAlert(regResult, `Admin criado com sucesso: ${email}`, "ok");
  } catch (err) {
    setAlert(regResult, err.message, "bad");
  } finally {
    regBtn.disabled = false;
    regBtn.textContent = "Criar admin";
  }
}

/* =========================
   EVENTS
========================= */
loginBtn.addEventListener("click", login);
loginPassword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});
logoutBtn.addEventListener("click", logout);

refreshBtn.addEventListener("click", loadItems);

search.addEventListener("input", () => {
  clearTimeout(window.__t);
  window.__t = setTimeout(() => loadItems().catch(() => {}), 250);
});

createBtn.addEventListener("click", createOne);

tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;

  try {
    if (action === "save") await saveRow(id);
    if (action === "delete") await deleteRow(id);
  } catch (err) {
    setAlert(appError, err.message, "bad");
  }
});

bulk.addEventListener("input", renderBulkPreview);
bulkSend.addEventListener("click", sendBulk);

regBtn.addEventListener("click", registerAdmin);

/* =========================
   START
========================= */
renderBulkPreview();
bootstrap();
