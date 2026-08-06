const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let people = [];
let functionsList = [];
let ledgerEntries = [];
let selectedYear = null;
let selectedFunctionId = null;
const saveTimers = {};

const $ = (id) => document.getElementById(id);

function setStatus(id, message, isError) {
  const el = $(id);
  el.textContent = message || "";
  el.className = "status " + (isError ? "error" : "ok");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function syncHeaderHeight() {
  const header = document.querySelector("header");
  document.documentElement.style.setProperty("--header-height", header.offsetHeight + "px");
}
window.addEventListener("resize", syncHeaderHeight);
syncHeaderHeight();

// ---------- Password gate ----------

$("gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = $("gate-password").value;
  setStatus("gate-status", "Checking...", false);
  const { data, error } = await client.rpc("check_password", { input: password });
  if (error) {
    setStatus("gate-status", "Error contacting server.", true);
    return;
  }
  if (data === true) {
    sessionStorage.setItem("boliammanur_unlocked", "1");
    unlockApp();
  } else {
    setStatus("gate-status", "Wrong password.", true);
  }
});

function unlockApp() {
  $("gate").classList.add("hidden");
  $("app").classList.remove("hidden");
  loadAll();
  syncHeaderHeight();
}

if (sessionStorage.getItem("boliammanur_unlocked") === "1") {
  unlockApp();
}

// ---------- Data loading ----------

async function loadAll() {
  await loadPeople();
  await loadFunctions();
  await loadLedgerEntries();
}

async function loadPeople() {
  const { data, error } = await client.from("people").select("*").order("member_no", { ascending: true, nullsFirst: false }).order("name");
  if (error) return;
  people = data;
}

async function loadFunctions() {
  const { data, error } = await client.from("functions").select("*").order("year", { ascending: false });
  if (error) return;
  functionsList = data;
  renderYearPills();
}

function renderYearPills() {
  const years = [...new Set(functionsList.map((f) => f.year))].sort((a, b) => a - b);
  if (!years.includes(selectedYear)) selectedYear = years[years.length - 1] ?? null;
  $("year-pills").innerHTML = years
    .map((y) => `<button type="button" class="pill ${y === selectedYear ? "active" : ""}" data-year="${y}">${y}</button>`)
    .join("");
  renderFunctionPills();
}

function renderFunctionPills() {
  const funcs = functionsList.filter((f) => f.year === selectedYear);
  if (!funcs.some((f) => f.id === selectedFunctionId)) selectedFunctionId = funcs[0]?.id ?? null;
  $("function-pills").innerHTML = funcs
    .map((f) => `<button type="button" class="pill ${f.id === selectedFunctionId ? "active" : ""}" data-function="${f.id}">${escapeHtml(f.name)}</button>`)
    .join("");
  updateSheetTitle();
}

function updateSheetTitle() {
  const f = functionsList.find((f) => f.id === selectedFunctionId);
  $("sheet-title").textContent = f ? `${f.name} (${f.year})` : "Ledger Sheet";
}

$("year-pills").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-year]");
  if (!btn) return;
  selectedYear = parseInt(btn.dataset.year, 10);
  selectedFunctionId = null;
  renderYearPills();
  await loadLedgerEntries();
});

$("function-pills").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-function]");
  if (!btn) return;
  selectedFunctionId = btn.dataset.function;
  renderFunctionPills();
  await loadLedgerEntries();
});

async function loadLedgerEntries() {
  if (!selectedFunctionId) {
    ledgerEntries = [];
    $("sheet-body").innerHTML = "";
    return;
  }
  const { data, error } = await client.from("ledger_entries").select("*").eq("function_id", selectedFunctionId);
  if (error) {
    setStatus("sheet-status", "Error loading sheet: " + error.message, true);
    return;
  }
  ledgerEntries = data;
  renderSheet();
  prefillNewRowNumber();
}

function nextMemberNo() {
  const max = people.reduce((m, p) => Math.max(m, p.member_no || 0), 0);
  return max + 1;
}

function prefillNewRowNumber() {
  $("new-member-no").value = nextMemberNo();
}

// ---------- Sheet rendering ----------

function renderSheet() {
  const entryMap = Object.fromEntries(ledgerEntries.map((e) => [e.person_id, e]));
  $("sheet-body").innerHTML = people
    .map((p) => {
      const e = entryMap[p.id] || { asal: 0, santha: 0, vatti: 0, thogai: 0, total: 0, paid: false, low_confidence: false };
      const cls = e.low_confidence ? "uncertain" : "";
      return `<tr data-person="${p.id}">
        <td>${p.member_no ?? ""}</td>
        <td><input type="text" class="f-name" value="${escapeHtml(p.name)}" /></td>
        <td><input type="number" step="0.01" min="0" class="f-asal ${cls}" value="${Number(e.asal)}" /></td>
        <td><input type="number" step="0.01" min="0" class="f-santha ${cls}" value="${Number(e.santha)}" /></td>
        <td><input type="number" step="0.01" min="0" class="f-vatti ${cls}" value="${Number(e.vatti)}" /></td>
        <td><input type="number" step="0.01" min="0" class="f-thogai ${cls}" value="${Number(e.thogai)}" /></td>
        <td class="total-cell">${Number(e.total).toFixed(2)}</td>
        <td style="text-align:center;"><input type="checkbox" class="f-paid" style="width:auto; min-height:auto;" ${e.paid ? "checked" : ""} /></td>
      </tr>`;
    })
    .join("");
}

function rowValues(tr) {
  return {
    asal: parseFloat(tr.querySelector(".f-asal").value) || 0,
    santha: parseFloat(tr.querySelector(".f-santha").value) || 0,
    vatti: parseFloat(tr.querySelector(".f-vatti").value) || 0,
    thogai: parseFloat(tr.querySelector(".f-thogai").value) || 0,
    paid: tr.querySelector(".f-paid").checked,
  };
}

async function saveRow(personId, tr) {
  const funcId = selectedFunctionId;
  const v = rowValues(tr);
  const total = v.asal + v.santha + v.vatti + v.thogai;
  tr.querySelector(".total-cell").textContent = total.toFixed(2);

  const payload = {
    function_id: funcId,
    person_id: personId,
    asal: v.asal,
    santha: v.santha,
    vatti: v.vatti,
    thogai: v.thogai,
    total,
    paid: v.paid,
    low_confidence: false,
  };
  const { error } = await client.from("ledger_entries").upsert(payload, { onConflict: "function_id,person_id" });
  if (error) {
    setStatus("sheet-status", "Error saving row: " + error.message, true);
    return;
  }
  setStatus("sheet-status", "", false);
  tr.querySelectorAll("input.uncertain").forEach((i) => i.classList.remove("uncertain"));
  tr.classList.add("row-saved");
  setTimeout(() => tr.classList.remove("row-saved"), 1200);
  const idx = ledgerEntries.findIndex((e) => e.person_id === personId);
  if (idx >= 0) ledgerEntries[idx] = { ...ledgerEntries[idx], ...payload };
  else ledgerEntries.push(payload);
}

function scheduleSave(personId, tr, immediate) {
  clearTimeout(saveTimers[personId]);
  if (immediate) {
    saveRow(personId, tr);
  } else {
    saveTimers[personId] = setTimeout(() => saveRow(personId, tr), 700);
  }
}

$("sheet-body").addEventListener("input", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const personId = tr.dataset.person;
  if (e.target.classList.contains("f-asal") || e.target.classList.contains("f-santha") || e.target.classList.contains("f-vatti") || e.target.classList.contains("f-thogai")) {
    const v = rowValues(tr);
    tr.querySelector(".total-cell").textContent = (v.asal + v.santha + v.vatti + v.thogai).toFixed(2);
  }
  scheduleSave(personId, tr, false);
});

$("sheet-body").addEventListener("change", (e) => {
  if (e.target.classList.contains("f-paid")) {
    const tr = e.target.closest("tr");
    scheduleSave(tr.dataset.person, tr, true);
  }
});

// name edits: update the people table, not the ledger row
$("sheet-body").addEventListener("change", async (e) => {
  if (!e.target.classList.contains("f-name")) return;
  const tr = e.target.closest("tr");
  const personId = tr.dataset.person;
  const p = people.find((p) => p.id === personId);
  const name = e.target.value.trim();

  if (!name) {
    if (p) e.target.value = p.name;
    return;
  }

  const dup = people.find((other) => other.id !== personId && other.name.trim().toLowerCase() === name.toLowerCase());
  if (dup) {
    setStatus("sheet-status", `"${name}" is already used by S.No. ${dup.member_no ?? "-"}. Names must be unique.`, true);
    if (p) e.target.value = p.name;
    return;
  }

  const { error } = await client.from("people").update({ name }).eq("id", personId);
  if (error) {
    setStatus("sheet-status", "Error renaming: " + error.message, true);
    if (p) e.target.value = p.name;
    return;
  }
  if (p) p.name = name;
  setStatus("sheet-status", "", false);
});

// ---------- Add-new-row (bottom of sheet) ----------

async function addNewRow() {
  const name = $("new-name").value.trim();
  if (!name) return;
  const funcId = selectedFunctionId;
  if (!funcId) {
    setStatus("sheet-status", "Pick a sheet (function/year) first.", true);
    return;
  }

  const dupName = people.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
  if (dupName) {
    setStatus("sheet-status", `"${name}" already exists (S.No. ${dupName.member_no ?? "-"}) — scroll up to find them instead of re-adding.`, true);
    return;
  }

  const memberNo = $("new-member-no").value ? parseInt($("new-member-no").value, 10) : nextMemberNo();
  const dupNo = people.find((p) => p.member_no === memberNo);
  if (dupNo) {
    setStatus("sheet-status", `S.No. ${memberNo} is already used by "${dupNo.name}".`, true);
    return;
  }

  const { data: person, error: personError } = await client.from("people").insert({ name, member_no: memberNo }).select().single();
  if (personError) {
    setStatus("sheet-status", "Error adding person: " + personError.message, true);
    return;
  }
  people.push(person);
  people.sort((a, b) => (a.member_no ?? 9999) - (b.member_no ?? 9999) || a.name.localeCompare(b.name));

  const asal = parseFloat($("new-asal").value) || 0;
  const santha = parseFloat($("new-santha").value) || 0;
  const vatti = parseFloat($("new-vatti").value) || 0;
  const thogai = parseFloat($("new-thogai").value) || 0;
  const paid = $("new-paid").checked;
  const total = asal + santha + vatti + thogai;

  const { error: entryError } = await client
    .from("ledger_entries")
    .upsert(
      { function_id: funcId, person_id: person.id, asal, santha, vatti, thogai, total, paid, low_confidence: false },
      { onConflict: "function_id,person_id" }
    );
  if (entryError) {
    setStatus("sheet-status", "Error saving entry: " + entryError.message, true);
    return;
  }

  ["new-member-no", "new-name", "new-asal", "new-santha", "new-vatti", "new-thogai"].forEach((id) => ($(id).value = ""));
  $("new-paid").checked = false;
  $("sheet-new-row").querySelector(".total-cell").textContent = "0.00";
  setStatus("sheet-status", "Added.", false);
  await loadLedgerEntries();
  $("sheet-new-row").scrollIntoView({ behavior: "smooth", block: "end" });
  $("new-name").focus();
}

["new-asal", "new-santha", "new-vatti", "new-thogai"].forEach((id) => {
  $(id).addEventListener("input", () => {
    const asal = parseFloat($("new-asal").value) || 0;
    const santha = parseFloat($("new-santha").value) || 0;
    const vatti = parseFloat($("new-vatti").value) || 0;
    const thogai = parseFloat($("new-thogai").value) || 0;
    $("sheet-new-row").querySelector(".total-cell").textContent = (asal + santha + vatti + thogai).toFixed(2);
  });
});

$("new-name").addEventListener("change", addNewRow);
$("new-paid").addEventListener("change", addNewRow);
