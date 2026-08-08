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

// Mobile numbers display as: first 3 chars, space, next 5, space, remaining balance.
function formatMobile(value) {
  const raw = String(value ?? "").replace(/\s+/g, "");
  if (raw.length <= 3) return raw;
  const part1 = raw.slice(0, 3);
  const rest = raw.slice(3);
  if (rest.length <= 5) return `${part1} ${rest}`;
  const part2 = rest.slice(0, 5);
  const part3 = rest.slice(5);
  return `${part1} ${part2} ${part3}`;
}

// Mobile number fields only accept digits and "+" as the user types.
function filterMobileInput(el) {
  const cleaned = el.value.replace(/[^\d+]/g, "");
  if (cleaned !== el.value) el.value = cleaned;
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
  if (!years.includes(selectedYear)) {
    const currentYear = new Date().getFullYear();
    selectedYear = years.includes(currentYear) ? currentYear : years[years.length - 1] ?? null;
  }
  $("year-pills").innerHTML = years
    .map((y) => `<button type="button" class="pill ${y === selectedYear ? "active" : ""}" data-year="${y}">${y}</button>`)
    .join("");
  renderFunctionPills();
}

function renderFunctionPills() {
  const funcs = functionsList.filter((f) => f.year === selectedYear);
  if (!funcs.some((f) => f.id === selectedFunctionId)) {
    // திருமுருகன் தீர்த்தக்காவடி defaults for Jan-Jun, the other function for Jul-Dec.
    const isFirstHalf = new Date().getMonth() < 6;
    const kavadi = funcs.find((f) => f.name.includes("தீர்த்தக்காவடி"));
    const other = funcs.find((f) => f.id !== kavadi?.id);
    const preferred = isFirstHalf ? kavadi : other;
    selectedFunctionId = (preferred ?? funcs[0])?.id ?? null;
  }
  $("function-pills").innerHTML = funcs
    .map((f) => `<button type="button" class="pill ${f.id === selectedFunctionId ? "active" : ""}" data-function="${f.id}">${escapeHtml(f.name)}</button>`)
    .join("");
  updateSheetTitle();
}

function updateSheetTitle() {
  const f = functionsList.find((f) => f.id === selectedFunctionId);
  const title = f ? `${f.name} (${f.year})` : "Ledger Sheet";
  $("sheet-title").innerHTML = `<span>${escapeHtml(title)}</span> <button type="button" id="toggle-members-btn" class="members-toggle active">உறுப்பினர்கள் - ${peopleForCurrentFunction().length}</button>`;
  $("sheet-table-wrap").classList.remove("hidden");
}

$("sheet-title").addEventListener("click", (e) => {
  const btn = e.target.closest("#toggle-members-btn");
  if (!btn) return;
  const nowHidden = $("sheet-table-wrap").classList.toggle("hidden");
  btn.classList.toggle("active", !nowHidden);
  if (!nowHidden) alignTotalsBanner();
});

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
  updateNewRowLock();
  refreshNewRowSanthaAmount();
}

function refreshNewRowSanthaAmount() {
  const amount = currentSanthaAmount();
  $("new-santha-check").dataset.amount = amount;
  $("new-santha-amount").textContent = amount.toFixed(0);
}

// New row starts locked (only the Name field is enterable) until a name is typed.
// பெயர் and Name (English) are both always enterable — at least one of the two
// filled in is enough to unlock the rest of the row.
function updateNewRowLock() {
  const hasName = $("new-name").value.trim().length > 0 || $("new-name-en").value.trim().length > 0;
  ["new-member-no", "new-mobile", "new-santha-check", "new-asal", "new-vatti", "new-thogai", "new-paid"].forEach((id) => {
    $(id).disabled = !hasName;
  });
}

// ---------- Sheet rendering ----------

// Each function can restrict its Ledger Sheet to just 24Manai, just Others,
// or everyone ("All", the default for functions created before this existed).
function peopleForCurrentFunction() {
  const f = functionsList.find((f) => f.id === selectedFunctionId);
  const allowedType = f?.allowed_type || "All";
  if (allowedType === "All") return people;
  return people.filter((p) => p.type === allowedType);
}

// சந்தா is a fixed price the admin sets per function (Dashboard) — members are
// just checked/unchecked here, never allowed to type a custom amount.
function currentSanthaAmount() {
  const f = functionsList.find((f) => f.id === selectedFunctionId);
  return Number(f?.santha_amount ?? 1000);
}

function entryRows() {
  const entryMap = Object.fromEntries(ledgerEntries.map((e) => [e.person_id, e]));
  return peopleForCurrentFunction().map((p) => ({
    p,
    e: entryMap[p.id] || { asal: 0, santha: 0, vatti: 0, thogai: 0, total: 0, paid: "", santha_checked: false, low_confidence: false },
  }));
}

function renderSheet() {
  const rows = entryRows();
  const santhaAmount = currentSanthaAmount();

  const snoQ = $("filter-sno").value.trim().toLowerCase();
  const nameQ = $("filter-name").value.trim().toLowerCase();
  const nameEnQ = $("filter-name-en").value.trim().toLowerCase();
  const mobileQ = $("filter-mobile").value.trim().replace(/\s+/g, "").toLowerCase();
  const santhaQ = $("filter-santha").value.trim();
  const asalQ = $("filter-asal").value.trim();
  const vattiQ = $("filter-vatti").value.trim();
  const thogaiQ = $("filter-thogai").value.trim();
  const totalQ = $("filter-total").value.trim();
  const paidQ = $("filter-paid").value.trim().toLowerCase();

  const visible = rows.filter(({ p, e }) => {
    if (snoQ && !String(p.member_no ?? "").toLowerCase().includes(snoQ)) return false;
    if (nameQ && !(p.name || "").toLowerCase().includes(nameQ)) return false;
    if (nameEnQ && !(p.name_en || "").toLowerCase().includes(nameEnQ)) return false;
    if (mobileQ && !formatMobile(p.mobile).replace(/\s+/g, "").toLowerCase().includes(mobileQ)) return false;
    if (santhaQ && !String(Number(e.santha)).includes(santhaQ)) return false;
    if (asalQ && !String(Number(e.asal)).includes(asalQ)) return false;
    if (vattiQ && !String(Number(e.vatti)).includes(vattiQ)) return false;
    if (thogaiQ && !String(Number(e.thogai)).includes(thogaiQ)) return false;
    if (totalQ && !Number(e.total).toFixed(0).includes(totalQ)) return false;
    if (paidQ && !String(e.paid || "").toLowerCase().includes(paidQ)) return false;
    return true;
  });

  $("sheet-body").innerHTML = visible
    .map(({ p, e }) => {
      const cls = e.low_confidence ? "uncertain" : "";
      return `<tr data-person="${p.id}">
        <td>${p.member_no ?? ""}</td>
        <td><input type="text" class="f-name" value="${escapeHtml(p.name)}" readonly /></td>
        <td><input type="text" class="f-name-en" value="${escapeHtml(p.name_en ?? "")}" /></td>
        <td><input type="text" class="f-mobile" value="${escapeHtml(formatMobile(p.mobile))}" inputmode="numeric" /></td>
        <td>
          <div class="santha-cell">
            <input type="checkbox" class="f-santha-check" data-amount="${santhaAmount}" ${e.santha_checked ? "checked" : ""} />
            <span class="santha-amount ${e.santha_checked ? "" : "faded"}">${santhaAmount.toFixed(0)}</span>
          </div>
        </td>
        <td><input type="number" step="0.01" min="0" class="f-asal ${cls}" value="${Number(e.asal)}" /></td>
        <td><input type="number" step="0.01" min="0" class="f-vatti ${cls}" value="${Number(e.vatti)}" /></td>
        <td><input type="number" step="0.01" min="0" class="f-thogai ${cls}" value="${Number(e.thogai)}" /></td>
        <td class="total-cell">${Number(e.total).toFixed(0)}</td>
        <td><input type="text" class="f-paid" value="${escapeHtml(e.paid || "")}" /></td>
      </tr>`;
    })
    .join("");

  updateTotalsBanner(rows);
}

function updateTotalsBanner(rows) {
  const sums = rows.reduce(
    (acc, { e }) => {
      acc.santha += Number(e.santha);
      acc.asal += Number(e.asal);
      acc.vatti += Number(e.vatti);
      acc.thogai += Number(e.thogai);
      acc.total += Number(e.total);
      return acc;
    },
    { santha: 0, asal: 0, vatti: 0, thogai: 0, total: 0 }
  );
  $("totals-santha").textContent = sums.santha.toFixed(0);
  $("totals-asal").textContent = sums.asal.toFixed(0);
  $("totals-vatti").textContent = sums.vatti.toFixed(0);
  $("totals-thogai").textContent = sums.thogai.toFixed(0);
  $("totals-total").textContent = sums.total.toFixed(0);
  const grand = sums.santha + sums.asal + sums.vatti + sums.thogai + sums.total;
  $("totals-grand").textContent = grand.toFixed(0);
  alignTotalsBanner();
}

// Positions each totals-col exactly on top of its real table column by
// measuring the actual rendered header cells, rather than guessing matching
// CSS percentages (which drift out of sync whenever the table's own column
// widths change).
function alignTotalsBanner() {
  const headerRow = document.querySelector("table.sheet thead tr:first-child");
  if (!headerRow) return;
  const ths = headerRow.querySelectorAll("th");
  document.querySelectorAll("#totals-track .totals-col").forEach((col) => {
    const th = ths[Number(col.dataset.col) - 1];
    if (!th) return;
    const rect = th.getBoundingClientRect();
    col.style.left = rect.left + "px";
    col.style.width = rect.width + "px";
  });
}
window.addEventListener("resize", alignTotalsBanner);
$("sheet-table-wrap").addEventListener("scroll", alignTotalsBanner);

[
  "filter-sno",
  "filter-name",
  "filter-name-en",
  "filter-mobile",
  "filter-santha",
  "filter-asal",
  "filter-vatti",
  "filter-thogai",
  "filter-total",
].forEach((id) => $(id).addEventListener("input", renderSheet));
$("filter-paid").addEventListener("input", renderSheet);

function rowValues(tr) {
  const santhaCheck = tr.querySelector(".f-santha-check");
  return {
    asal: parseFloat(tr.querySelector(".f-asal").value) || 0,
    santhaChecked: santhaCheck.checked,
    santha: santhaCheck.checked ? Number(santhaCheck.dataset.amount) : 0,
    vatti: parseFloat(tr.querySelector(".f-vatti").value) || 0,
    thogai: parseFloat(tr.querySelector(".f-thogai").value) || 0,
    paid: tr.querySelector(".f-paid").value.trim(),
  };
}

async function saveRow(personId, tr) {
  const funcId = selectedFunctionId;
  const v = rowValues(tr);
  const total = v.asal + v.santha + v.vatti + v.thogai;
  tr.querySelector(".total-cell").textContent = total.toFixed(0);

  const payload = {
    function_id: funcId,
    person_id: personId,
    asal: v.asal,
    santha: v.santha,
    santha_checked: v.santhaChecked,
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
  updateTotalsBanner(entryRows());
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
  if (e.target.classList.contains("f-mobile")) {
    filterMobileInput(e.target);
    return; // mobile lives on `people`, not `ledger_entries`
  }
  if (e.target.classList.contains("f-name-en")) return; // this lives on `people`, not `ledger_entries`
  const tr = e.target.closest("tr");
  if (!tr) return;
  const personId = tr.dataset.person;
  if (e.target.classList.contains("f-asal") || e.target.classList.contains("f-vatti") || e.target.classList.contains("f-thogai")) {
    const v = rowValues(tr);
    tr.querySelector(".total-cell").textContent = (v.asal + v.santha + v.vatti + v.thogai).toFixed(0);
  }
  scheduleSave(personId, tr, false);
});

async function commitMobile(input) {
  const tr = input.closest("tr");
  const personId = tr.dataset.person;
  const mobile = formatMobile(input.value.trim());
  input.value = mobile;
  const { error } = await client.from("people").update({ mobile }).eq("id", personId);
  if (error) {
    setStatus("sheet-status", "Error saving mobile number: " + error.message, true);
    return;
  }
  const p = people.find((p) => p.id === personId);
  if (p) p.mobile = mobile;
  setStatus("sheet-status", "", false);
}

async function commitNameEn(input) {
  const tr = input.closest("tr");
  const personId = tr.dataset.person;
  const nameEn = input.value.trim();
  const { error } = await client.from("people").update({ name_en: nameEn }).eq("id", personId);
  if (error) {
    setStatus("sheet-status", "Error saving name: " + error.message, true);
    return;
  }
  const p = people.find((p) => p.id === personId);
  if (p) p.name_en = nameEn;
  setStatus("sheet-status", "", false);
}

$("sheet-body").addEventListener("change", (e) => {
  if (e.target.classList.contains("f-mobile")) {
    commitMobile(e.target);
  } else if (e.target.classList.contains("f-name-en")) {
    commitNameEn(e.target);
  } else if (e.target.classList.contains("f-santha-check")) {
    const tr = e.target.closest("tr");
    const span = tr.querySelector(".santha-amount");
    span.classList.toggle("faded", !e.target.checked);
    const v = rowValues(tr);
    tr.querySelector(".total-cell").textContent = (v.asal + v.santha + v.vatti + v.thogai).toFixed(0);
    scheduleSave(tr.dataset.person, tr, true);
  }
});

// Enter commits without needing to leave the field.
$("sheet-body").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.classList.contains("f-mobile")) {
    e.preventDefault();
    commitMobile(e.target);
  } else if (e.target.classList.contains("f-name-en")) {
    e.preventDefault();
    commitNameEn(e.target);
  }
});

// Safari doesn't fire blur/change when clicking non-interactive elements
// (blank space, plain text, etc.), so also catch clicks anywhere else at the
// document level for whichever field currently has focus.
document.addEventListener("click", (e) => {
  const active = document.activeElement;
  if (!active || active === e.target) return;
  if (active.classList?.contains("f-mobile")) commitMobile(active);
  else if (active.classList?.contains("f-name-en")) commitNameEn(active);
});

// ---------- Add-new-row (bottom of sheet) ----------

async function addNewRow() {
  const nameEn = $("new-name-en").value.trim();
  const name = $("new-name").value.trim();
  if (!name && !nameEn) return;

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

  const mobile = formatMobile($("new-mobile").value.trim());
  const { data: person, error: personError } = await client.from("people").insert({ name, member_no: memberNo, mobile, name_en: nameEn }).select().single();
  if (personError) {
    setStatus("sheet-status", "Error adding person: " + personError.message, true);
    return;
  }
  people.push(person);
  people.sort((a, b) => (a.member_no ?? 9999) - (b.member_no ?? 9999) || a.name.localeCompare(b.name));

  const asal = parseInt($("new-asal").value, 10) || 0;
  const santhaChecked = $("new-santha-check").checked;
  const santha = santhaChecked ? currentSanthaAmount() : 0;
  const vatti = parseInt($("new-vatti").value, 10) || 0;
  const thogai = parseInt($("new-thogai").value, 10) || 0;
  const paid = $("new-paid").value.trim();
  const total = asal + santha + vatti + thogai;

  const { error: entryError } = await client
    .from("ledger_entries")
    .upsert(
      { function_id: funcId, person_id: person.id, asal, santha, santha_checked: santhaChecked, vatti, thogai, total, paid, low_confidence: false },
      { onConflict: "function_id,person_id" }
    );
  if (entryError) {
    setStatus("sheet-status", "Error saving entry: " + entryError.message, true);
    return;
  }

  ["new-member-no", "new-mobile", "new-name-en", "new-name", "new-asal", "new-vatti", "new-thogai", "new-paid"].forEach((id) => ($(id).value = ""));
  $("new-santha-check").checked = false;
  $("sheet-new-row").querySelector(".total-cell").textContent = "0";
  updateNewRowLock();
  setStatus("sheet-status", "Added.", false);
  await loadLedgerEntries();
  updateSheetTitle();

  const savedTr = $("sheet-body").querySelector(`tr[data-person="${person.id}"]`);
  if (savedTr) {
    savedTr.scrollIntoView({ behavior: "smooth", block: "center" });
    savedTr.classList.add("row-blink");
    setTimeout(() => savedTr.classList.remove("row-blink"), 1100);
  }
}

function recalcNewRowTotal() {
  const asal = parseInt($("new-asal").value, 10) || 0;
  const santha = $("new-santha-check").checked ? currentSanthaAmount() : 0;
  const vatti = parseInt($("new-vatti").value, 10) || 0;
  const thogai = parseInt($("new-thogai").value, 10) || 0;
  $("sheet-new-row").querySelector(".total-cell").textContent = asal + santha + vatti + thogai;
}

// Asal/Vatti/Thogai are whole numbers only — strip any decimal as it's typed.
["new-asal", "new-vatti", "new-thogai"].forEach((id) => {
  $(id).addEventListener("input", () => {
    const el = $(id);
    const digitsOnly = el.value.replace(/[^\d]/g, "");
    if (digitsOnly !== el.value) el.value = digitsOnly;
    recalcNewRowTotal();
  });
});

$("new-santha-check").addEventListener("change", () => {
  $("new-santha-amount").classList.toggle("faded", !$("new-santha-check").checked);
  recalcNewRowTotal();
});

$("new-name").addEventListener("input", updateNewRowLock);
$("new-name-en").addEventListener("input", updateNewRowLock);
$("new-mobile").addEventListener("input", () => filterMobileInput($("new-mobile")));

// Row stays unsaved while typing — Enter (on any field in the row) commits it,
// and so does clicking/tabbing away to somewhere outside the row entirely.
["new-name", "new-member-no", "new-mobile", "new-name-en", "new-asal", "new-santha-check", "new-vatti", "new-thogai", "new-paid"].forEach((id) => {
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addNewRow();
    }
  });
});

// Safari doesn't fire blur/focusout when clicking non-interactive elements (blank
// space, plain text, etc.), so a click-anywhere-outside check is done at the
// document level instead of relying on focus events.
document.addEventListener("click", (e) => {
  if (!$("sheet-new-row").contains(e.target)) addNewRow();
});
