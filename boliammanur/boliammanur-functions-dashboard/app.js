const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);

let people = [];
let functionsList = [];
let ledgerEntries = [];
let materials = [];
let charts = {};

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function setStatus(id, message, isError) {
  const el = $(id);
  el.textContent = message || "";
  el.className = "status " + (isError ? "error" : "ok");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
}

if (sessionStorage.getItem("boliammanur_unlocked") === "1") {
  unlockApp();
}

// ---------- Data loading ----------

async function loadAll() {
  const [p, f, l, m] = await Promise.all([
    client.from("people").select("*").order("member_no", { ascending: true, nullsFirst: false }).order("name"),
    client.from("functions").select("*").order("year"),
    client.from("ledger_entries").select("*"),
    client.from("materials").select("*"),
  ]);
  people = p.data || [];
  functionsList = f.data || [];
  ledgerEntries = l.data || [];
  materials = m.data || [];

  populateFilters();
  render();
}

function populateFilters() {
  const years = [...new Set(functionsList.map((f) => f.year))].sort((a, b) => b - a);
  $("filter-year").innerHTML =
    `<option value="">All years</option>` + years.map((y) => `<option value="${y}">${y}</option>`).join("");
  $("filter-function").innerHTML =
    `<option value="">All functions</option>` +
    functionsList.map((f) => `<option value="${f.id}">${escapeHtml(f.name)} (${f.year})</option>`).join("");
  $("functions-list").innerHTML = functionsList
    .slice()
    .sort((a, b) => b.year - a.year)
    .map(
      (f) => `<tr data-function="${f.id}">
        <td>${escapeHtml(f.name)}</td>
        <td>${f.year}</td>
        <td>${escapeHtml(f.allowed_type || "All")}</td>
        <td class="santha-amount-cell">
          <input type="number" class="santha-amount-input" min="0" step="1" value="${Number(f.santha_amount ?? 1000)}" />
          <button type="button" class="secondary santha-amount-save">Save</button>
        </td>
      </tr>`
    )
    .join("");
}

// Updates the fixed சந்தா price for a function, and cascades the new amount
// to every existing entry that's already checked "paid" for it, so stored
// totals stay consistent with what the entry site now shows.
$("functions-list").addEventListener("click", async (e) => {
  const btn = e.target.closest(".santha-amount-save");
  if (!btn) return;
  const tr = btn.closest("tr");
  const functionId = tr.dataset.function;
  const newAmount = Number(tr.querySelector(".santha-amount-input").value) || 0;

  const { error: fnError } = await client.from("functions").update({ santha_amount: newAmount }).eq("id", functionId);
  if (fnError) {
    setStatus("function-status", "Error updating amount: " + fnError.message, true);
    return;
  }

  const { data: checkedRows, error: fetchError } = await client
    .from("ledger_entries")
    .select("id, asal, vatti, thogai")
    .eq("function_id", functionId)
    .eq("santha_checked", true);
  if (fetchError) {
    setStatus("function-status", "Amount saved, but couldn't update existing entries: " + fetchError.message, true);
    return;
  }
  for (const row of checkedRows) {
    const total = Number(row.asal) + newAmount + Number(row.vatti) + Number(row.thogai);
    await client.from("ledger_entries").update({ santha: newAmount, total }).eq("id", row.id);
  }

  setStatus("function-status", `சந்தா amount updated to ${newAmount} (${checkedRows.length} existing entries recalculated).`, false);
  await loadAll();
});

$("filter-year").addEventListener("change", render);
$("filter-function").addEventListener("change", render);

// ---------- Add Function ----------

$("function-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("function-name").value.trim();
  const year = parseInt($("function-year").value, 10);
  const allowedType = $("function-allowed-type").value;
  const santhaAmount = Number($("function-santha-amount").value) || 0;
  if (!name || !year) return;
  const { error } = await client.from("functions").insert({ name, year, allowed_type: allowedType, santha_amount: santhaAmount });
  if (error) {
    setStatus("function-status", "Error: " + error.message, true);
    return;
  }
  $("function-form").reset();
  setStatus("function-status", "Added.", false);
  await loadAll();
});

// ---------- Rendering ----------

function currentFilteredFunctionIds() {
  const year = $("filter-year").value;
  const funcId = $("filter-function").value;
  return functionsList
    .filter((f) => (year ? String(f.year) === year : true))
    .filter((f) => (funcId ? f.id === funcId : true))
    .map((f) => f.id);
}

let lastFilteredEntries = [];
let lastFilteredMaterials = [];

function render() {
  const funcIds = new Set(currentFilteredFunctionIds());
  const filteredEntries = ledgerEntries.filter((e) => funcIds.has(e.function_id));
  const filteredMaterials = materials.filter((m) => funcIds.has(m.function_id));
  lastFilteredEntries = filteredEntries;
  lastFilteredMaterials = filteredMaterials;

  renderTiles(filteredEntries, filteredMaterials);
  renderYearChart(filteredEntries);
  renderCumulativeChart();
  renderPeopleChart(filteredEntries);
  renderMaterialsChart(filteredMaterials);
  renderPeopleTable(filteredEntries);
  renderMaterialsTable(filteredMaterials);
}

function renderTiles(entries, mats) {
  const asal = entries.reduce((s, e) => s + Number(e.asal), 0);
  const santha = entries.reduce((s, e) => s + Number(e.santha), 0);
  const vatti = entries.reduce((s, e) => s + Number(e.vatti), 0);
  const thogai = entries.reduce((s, e) => s + Number(e.thogai), 0);
  const total = entries.reduce((s, e) => s + Number(e.total), 0);
  const matCost = mats.reduce((s, m) => s + Number(m.cost || 0), 0);

  $("tile-asal").textContent = money(asal);
  $("tile-santha").textContent = money(santha);
  $("tile-vatti").textContent = money(vatti);
  $("tile-thogai").textContent = money(thogai);
  $("tile-total").textContent = money(total);
  $("tile-material").textContent = money(matCost);
}

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
}

function baseOptions() {
  const grid = cssVar("--grid");
  const muted = cssVar("--muted");
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { grid: { color: grid }, ticks: { color: muted }, stacked: false },
      y: { grid: { color: grid }, ticks: { color: muted }, beginAtZero: true, stacked: false },
    },
    plugins: {
      legend: { labels: { color: muted } },
    },
  };
}

function renderYearChart(entries) {
  const years = [...new Set(functionsList.map((f) => f.year))].sort();
  const funcYear = Object.fromEntries(functionsList.map((f) => [f.id, f.year]));
  const sumByYear = (field) =>
    years.map((y) =>
      entries.filter((e) => funcYear[e.function_id] === y).reduce((s, e) => s + Number(e[field]), 0)
    );

  destroyChart("year");
  const opts = baseOptions();
  opts.scales.x.stacked = true;
  opts.scales.y.stacked = true;
  charts.year = new Chart($("chart-year"), {
    type: "bar",
    data: {
      labels: years,
      datasets: [
        { label: "Santha", data: sumByYear("santha"), backgroundColor: cssVar("--series-1"), borderRadius: 4 },
        { label: "Vatti", data: sumByYear("vatti"), backgroundColor: cssVar("--series-2"), borderRadius: 4 },
        { label: "Thogai", data: sumByYear("thogai"), backgroundColor: cssVar("--series-3"), borderRadius: 4 },
      ],
    },
    options: opts,
  });
}

function renderCumulativeChart() {
  const years = [...new Set(functionsList.map((f) => f.year))].sort();
  const funcYear = Object.fromEntries(functionsList.map((f) => [f.id, f.year]));
  let running = 0;
  const totalByYear = years.map((y) => {
    const yearEntries = ledgerEntries.filter((e) => funcYear[e.function_id] === y);
    running += yearEntries.reduce((s, e) => s + Number(e.total), 0);
    return running;
  });

  destroyChart("cumulative");
  charts.cumulative = new Chart($("chart-cumulative"), {
    type: "line",
    data: {
      labels: years,
      datasets: [
        {
          label: "Cumulative total collected",
          data: totalByYear,
          borderColor: cssVar("--credit"),
          backgroundColor: cssVar("--credit"),
          borderWidth: 2,
          pointRadius: 4,
          tension: 0.15,
        },
      ],
    },
    options: baseOptions(),
  });
}

function renderPeopleChart(entries) {
  const peopleName = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const totals = {};
  entries.forEach((e) => {
    totals[e.person_id] = (totals[e.person_id] || 0) + Number(e.total);
  });
  const sorted = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  destroyChart("people");
  charts.people = new Chart($("chart-people"), {
    type: "bar",
    data: {
      labels: sorted.map(([id]) => peopleName[id] || "?"),
      datasets: [{ label: "Total", data: sorted.map(([, v]) => v), backgroundColor: cssVar("--series-1"), borderRadius: 4 }],
    },
    options: { ...baseOptions(), indexAxis: "y", plugins: { legend: { display: false } } },
  });
}

function renderMaterialsChart(mats) {
  const totals = {};
  mats.forEach((m) => {
    totals[m.item_name] = (totals[m.item_name] || 0) + Number(m.cost || 0);
  });
  const sorted = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  destroyChart("materials");
  charts.materials = new Chart($("chart-materials"), {
    type: "bar",
    data: {
      labels: sorted.map(([name]) => name),
      datasets: [{ label: "Cost", data: sorted.map(([, v]) => v), backgroundColor: cssVar("--series-1"), borderRadius: 4 }],
    },
    options: { ...baseOptions(), indexAxis: "y", plugins: { legend: { display: false } } },
  });
}

function renderPeopleTable(entries) {
  const peopleMap = Object.fromEntries(people.map((p) => [p.id, p]));
  const totals = {};
  entries.forEach((e) => {
    if (!totals[e.person_id]) totals[e.person_id] = { asal: 0, santha: 0, vatti: 0, thogai: 0, total: 0, remarks: [] };
    const t = totals[e.person_id];
    t.asal += Number(e.asal);
    t.santha += Number(e.santha);
    t.vatti += Number(e.vatti);
    t.thogai += Number(e.thogai);
    t.total += Number(e.total);
    if (e.paid) t.remarks.push(e.paid);
  });
  let rows = Object.entries(totals).sort((a, b) => {
    const pa = peopleMap[a[0]], pb = peopleMap[b[0]];
    return (pa?.member_no ?? 9999) - (pb?.member_no ?? 9999) || (pa?.name || "").localeCompare(pb?.name || "");
  });

  const snoQ = $("filter-people-sno").value.trim().toLowerCase();
  const nameQ = $("filter-people-name").value.trim().toLowerCase();
  const asalQ = $("filter-people-asal").value.trim();
  const santhaQ = $("filter-people-santha").value.trim();
  const vattiQ = $("filter-people-vatti").value.trim();
  const thogaiQ = $("filter-people-thogai").value.trim();
  const totalQ = $("filter-people-total").value.trim();
  const paidQ = $("filter-people-paid").value.trim().toLowerCase();

  rows = rows.filter(([id, v]) => {
    const p = peopleMap[id];
    if (snoQ && !String(p?.member_no ?? "").toLowerCase().includes(snoQ)) return false;
    if (nameQ && !(p?.name || "").toLowerCase().includes(nameQ)) return false;
    if (asalQ && !money(v.asal).includes(asalQ)) return false;
    if (santhaQ && !money(v.santha).includes(santhaQ)) return false;
    if (vattiQ && !money(v.vatti).includes(vattiQ)) return false;
    if (thogaiQ && !money(v.thogai).includes(thogaiQ)) return false;
    if (totalQ && !money(v.total).includes(totalQ)) return false;
    if (paidQ && !v.remarks.join("; ").toLowerCase().includes(paidQ)) return false;
    return true;
  });

  $("people-table").innerHTML = rows
    .map(([id, v]) => {
      const p = peopleMap[id];
      return `<tr>
        <td>${p?.member_no ?? ""}</td>
        <td>${escapeHtml(p?.name || "?")}</td>
        <td>${money(v.asal)}</td>
        <td>${money(v.santha)}</td>
        <td>${money(v.vatti)}</td>
        <td>${money(v.thogai)}</td>
        <td>${money(v.total)}</td>
        <td>${escapeHtml(v.remarks.join("; "))}</td>
      </tr>`;
    })
    .join("");
}

function renderMaterialsTable(mats) {
  const funcMap = Object.fromEntries(functionsList.map((f) => [f.id, `${f.name} (${f.year})`]));

  const funcQ = $("filter-mat-function").value.trim().toLowerCase();
  const itemQ = $("filter-mat-item").value.trim().toLowerCase();
  const qtyQ = $("filter-mat-qty").value.trim().toLowerCase();
  const costQ = $("filter-mat-cost").value.trim();

  const rows = mats
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .filter((m) => {
      const funcLabel = (funcMap[m.function_id] || "?").toLowerCase();
      const qtyLabel = `${m.quantity ?? ""} ${m.unit || ""}`.toLowerCase();
      if (funcQ && !funcLabel.includes(funcQ)) return false;
      if (itemQ && !(m.item_name || "").toLowerCase().includes(itemQ)) return false;
      if (qtyQ && !qtyLabel.includes(qtyQ)) return false;
      if (costQ && !money(m.cost).includes(costQ)) return false;
      return true;
    });

  $("materials-table").innerHTML = rows
    .map(
      (m) => `<tr>
        <td>${escapeHtml(funcMap[m.function_id] || "?")}</td>
        <td>${escapeHtml(m.item_name)}</td>
        <td>${m.quantity ?? ""} ${escapeHtml(m.unit || "")}</td>
        <td>${money(m.cost)}</td>
      </tr>`
    )
    .join("");
}

// ---------- Change password ----------

$("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const oldPassword = $("old-password").value;
  const newPassword = $("new-password").value;
  setStatus("password-status", "Updating...", false);
  const { data, error } = await client.rpc("set_password", { old_password: oldPassword, new_password: newPassword });
  if (error) {
    setStatus("password-status", "Error: " + error.message, true);
    return;
  }
  if (data === true) {
    setStatus("password-status", "Password updated.", false);
    $("password-form").reset();
  } else {
    setStatus("password-status", "Current password is incorrect.", true);
  }
});

// ---------- Table filter rows ----------

[
  "filter-people-sno",
  "filter-people-name",
  "filter-people-asal",
  "filter-people-santha",
  "filter-people-vatti",
  "filter-people-thogai",
  "filter-people-total",
].forEach((id) => $(id).addEventListener("input", () => renderPeopleTable(lastFilteredEntries)));
$("filter-people-paid").addEventListener("change", () => renderPeopleTable(lastFilteredEntries));

["filter-mat-function", "filter-mat-item", "filter-mat-qty", "filter-mat-cost"].forEach((id) =>
  $(id).addEventListener("input", () => renderMaterialsTable(lastFilteredMaterials))
);
