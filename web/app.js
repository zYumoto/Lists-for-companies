const API = "http://localhost:3001";

const el = (id) => document.getElementById(id);

const tbody = el("tbody");
const count = el("count");
const search = el("search");

const title = el("title");
const status = el("status");
const owner = el("owner");

const bulk = el("bulk");
const bulkPreview = el("bulkPreview");

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erro");
  return data;
}

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR");
  } catch { return iso; }
}

function parseBulk(text) {
  // Aceita TSV (Excel) e CSV simples
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows = [];

  for (const line of lines) {
    // se tem TAB, usa TAB; senão tenta CSV por vírgula/; (bem simples)
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

async function load() {
  const q = search.value.trim();
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

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function createOne() {
  const payload = {
    title: title.value.trim(),
    status: status.value,
    owner: owner.value.trim()
  };
  if (!payload.title) return alert("Preencha o título.");

  await api("/items", { method: "POST", body: JSON.stringify(payload) });
  title.value = "";
  await load();
}

async function saveRow(id) {
  const inputs = [...document.querySelectorAll(`[data-id="${id}"][data-field]`)];
  const payload = {};
  for (const inp of inputs) {
    payload[inp.dataset.field] = inp.value;
  }
  await api(`/items/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  await load();
}

async function deleteRow(id) {
  if (!confirm("Excluir este item?")) return;
  await api(`/items/${id}`, { method: "DELETE" });
  await load();
}

async function sendBulk() {
  const rows = parseBulk(bulk.value);
  if (!rows.length) return alert("Cole pelo menos 1 linha válida.");

  const r = await api("/items/bulk", {
    method: "POST",
    body: JSON.stringify({ rows })
  });

  alert(`OK! Inseridos: ${r.inserted}`);
  bulk.value = "";
  renderBulkPreview();
  await load();
}

// Events
el("create").addEventListener("click", createOne);
el("refresh").addEventListener("click", load);

search.addEventListener("input", () => {
  // debouncing simples
  clearTimeout(window.__t);
  window.__t = setTimeout(load, 250);
});

tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;

  try {
    if (action === "save") await saveRow(id);
    if (action === "delete") await deleteRow(id);
  } catch (err) {
    alert(err.message);
  }
});

bulk.addEventListener("input", renderBulkPreview);
renderBulkPreview();

load().catch(err => alert(err.message));
