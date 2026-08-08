const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);

if (sessionStorage.getItem("boliammanur_unlocked") !== "1") {
  window.location.href = "index.html";
}

let allPeople = [];
let currentFilter = "24manai";

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

function setStatus(message, isError) {
  const el = $("members-status");
  el.textContent = message || "";
  el.className = "status " + (isError ? "error" : "ok");
}

function cell(field, value, extraAttrs) {
  return `<td>
    <div class="cell-flex">
      <input type="text" class="cell-input" data-field="${field}" value="${escapeHtml(value)}" readonly ${extraAttrs || ""} />
      <button type="button" class="lock-btn" aria-label="Unlock to edit">🔒</button>
    </div>
  </td>`;
}

function typeCell(value) {
  const v = value || "";
  const opt = (val, label) => `<option value="${val}" ${v === val ? "selected" : ""}>${label}</option>`;
  return `<td>
    <select class="type-select">
      ${opt("", "—")}
      ${opt("24Manai", "24Manai")}
      ${opt("Others", "Others")}
    </select>
  </td>`;
}

function renderRows() {
  const pillFiltered = currentFilter === "24manai" ? allPeople.filter((p) => p.type === "24Manai") : allPeople;

  const snoQ = $("filter-sno").value.trim().toLowerCase();
  const nameQ = $("filter-name").value.trim().toLowerCase();
  const nameEnQ = $("filter-name-en").value.trim().toLowerCase();
  const mobileQ = $("filter-mobile").value.trim().replace(/\s+/g, "").toLowerCase();
  const typeQ = $("filter-type").value;

  const visible = pillFiltered.filter((p) => {
    if (snoQ && !String(p.member_no ?? "").toLowerCase().includes(snoQ)) return false;
    if (nameQ && !(p.name || "").toLowerCase().includes(nameQ)) return false;
    if (nameEnQ && !(p.name_en || "").toLowerCase().includes(nameEnQ)) return false;
    if (mobileQ && !formatMobile(p.mobile).replace(/\s+/g, "").toLowerCase().includes(mobileQ)) return false;
    if (typeQ && p.type !== typeQ) return false;
    return true;
  });

  $("members-body").innerHTML = visible
    .map(
      (p) => `<tr data-person="${p.id}">
        <td>${p.member_no ?? ""}</td>
        ${cell("name", p.name)}
        ${cell("name_en", p.name_en ?? "")}
        ${cell("mobile", formatMobile(p.mobile), 'inputmode="numeric"')}
        ${typeCell(p.type)}
      </tr>`
    )
    .join("");
}

async function loadMembers() {
  const { data, error } = await client
    .from("people")
    .select("*")
    .order("member_no", { ascending: true, nullsFirst: false })
    .order("name");
  if (error) {
    setStatus("Error loading members: " + error.message, true);
    return;
  }
  allPeople = data;
  renderRows();
}

["filter-sno", "filter-name", "filter-name-en", "filter-mobile"].forEach((id) => {
  $(id).addEventListener("input", renderRows);
});
$("filter-type").addEventListener("change", renderRows);

$("type-filter-pills").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-filter]");
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  $("type-filter-pills").querySelectorAll(".pill").forEach((p) => p.classList.toggle("active", p === btn));
  renderRows();
});

$("members-body").addEventListener("change", async (e) => {
  if (!e.target.classList.contains("type-select")) return;
  const select = e.target;
  const tr = select.closest("tr");
  const personId = tr.dataset.person;
  const value = select.value;
  const { error } = await client.from("people").update({ type: value || null }).eq("id", personId);
  if (error) {
    setStatus("Error saving type: " + error.message, true);
    return;
  }
  const p = allPeople.find((p) => p.id === personId);
  if (p) p.type = value || null;
  setStatus("Saved.", false);
  renderRows();
});

function lockInput(input) {
  input.readOnly = true;
  input.classList.remove("unlocked");
  const btn = input.nextElementSibling;
  if (btn) {
    btn.textContent = "🔒";
    btn.setAttribute("aria-label", "Unlock to edit");
  }
}

function unlockInput(input) {
  input.readOnly = false;
  input.classList.add("unlocked");
  const btn = input.nextElementSibling;
  if (btn) {
    btn.textContent = "✏️";
    btn.setAttribute("aria-label", "Lock");
  }
  input.focus();
  input.select();
}

// Locks (and thus commits) exactly once per edit — the readOnly check makes
// repeat calls from different trigger paths (Enter, blur, click-away) harmless.
async function commitCell(input) {
  if (input.readOnly) return;
  const tr = input.closest("tr");
  const personId = tr.dataset.person;
  const field = input.dataset.field;
  let value = input.value.trim();

  if (field === "mobile") value = formatMobile(value);

  if (field === "name") {
    if (!value) {
      setStatus("Name cannot be empty.", true);
      loadMembers();
      return;
    }
    const dup = allPeople.find((p) => p.id !== personId && p.name.trim().toLowerCase() === value.toLowerCase());
    if (dup) {
      setStatus(`"${value}" is already used by another member (S.No. ${dup.member_no ?? "-"}).`, true);
      loadMembers();
      return;
    }
  }

  input.value = value;
  lockInput(input);

  const { error } = await client.from("people").update({ [field]: value }).eq("id", personId);
  if (error) {
    setStatus("Error saving: " + error.message, true);
    return;
  }
  const p = allPeople.find((p) => p.id === personId);
  if (p) p[field] = value;
  setStatus("Saved.", false);
}

$("members-body").addEventListener("input", (e) => {
  if (!e.target.classList.contains("cell-input") || e.target.dataset.field !== "mobile") return;
  const cleaned = e.target.value.replace(/[^\d+]/g, "");
  if (cleaned !== e.target.value) e.target.value = cleaned;
});

$("members-body").addEventListener("click", (e) => {
  const btn = e.target.closest(".lock-btn");
  if (!btn) return;
  const input = btn.previousElementSibling;
  if (input.readOnly) {
    unlockInput(input);
  } else {
    commitCell(input);
  }
});

// Enter commits without needing to leave the field.
$("members-body").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const input = e.target.closest(".cell-input");
  if (!input || input.readOnly) return;
  e.preventDefault();
  commitCell(input);
});

// Tab/click to another field.
$("members-body").addEventListener("focusout", (e) => {
  const input = e.target.closest(".cell-input");
  if (!input || input.readOnly) return;
  commitCell(input);
});

// Safari doesn't fire blur/focusout when clicking non-interactive elements
// (blank space, plain text, etc.), so also catch clicks anywhere outside the
// cell's own input+button pair at the document level.
document.addEventListener("click", (e) => {
  document.querySelectorAll(".cell-input.unlocked").forEach((input) => {
    const wrapper = input.closest(".cell-flex");
    if (wrapper && !wrapper.contains(e.target)) commitCell(input);
  });
});

loadMembers();
