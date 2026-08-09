const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);

if (sessionStorage.getItem("boliammanur_unlocked") !== "1") {
  window.location.href = "index.html";
}

let allPeople = [];
let currentFilter = "all";

// escapeHtml, formatMobile, syncHeaderHeight live in shared.js (loaded
// before this file) — kept as one copy with app.js.

// #members-thead-wrap (column titles + filter inputs) sticks against the
// whole PAGE scroll, stacked below the site header and the filter-pills
// card — its sticky "top" must equal their combined height, measured live
// since it varies by screen width (see .members-thead-wrap in style.css).
function syncMembersStickyOffsets() {
  const header = document.querySelector("header");
  const pillsCard = document.querySelector(".members-filter-card");
  if (!header || !pillsCard) return;
  document.documentElement.style.setProperty("--members-thead-top", header.offsetHeight + pillsCard.offsetHeight + "px");
}
window.addEventListener("resize", syncMembersStickyOffsets);
window.addEventListener("load", syncMembersStickyOffsets);
syncMembersStickyOffsets();

// #members-thead-wrap itself doesn't scroll horizontally (overflow-x:hidden
// — see style.css comment for why) so a horizontal drag on the body table
// mirrors onto it here, keeping columns aligned on narrow screens.
$("members-tbody-wrap").addEventListener("scroll", () => {
  $("members-thead-wrap").scrollLeft = $("members-tbody-wrap").scrollLeft;
});

// Once the user is actually scrolling to browse the sheet, the header and
// pills bar shrink (see body.is-scrolled rules in style.css) to give more
// of the screen to the table. syncHeaderHeight/syncMembersStickyOffsets
// already measure these elements live for sticky positioning, so calling
// them again right after the class toggle keeps the table header/filter
// row correctly pinned right below the now-smaller stack — no hardcoded
// heights to keep in sync by hand.
let scrollTicking = false;
function updateScrollCompactState() {
  document.body.classList.toggle("is-scrolled", window.scrollY > 10);
  syncHeaderHeight();
  syncMembersStickyOffsets();
  scrollTicking = false;
}
window.addEventListener(
  "scroll",
  () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(updateScrollCompactState);
  },
  { passive: true }
);
// One more sync once the shrink/expand transition itself finishes, in case
// a fast scroll-then-stop left the offset measured mid-transition.
document.querySelector("header").addEventListener("transitionend", syncMembersStickyOffsets);
updateScrollCompactState();

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

// HEART LOGIC — Type is set once at creation (see addNewRow in app.js) and is
// permanently uneditable afterward, so this is plain text, not a control.
function typeCell(value) {
  return `<td>${escapeHtml(value || "—")}</td>`;
}

// HEART LOGIC — "Avoid" means the person is no longer active (e.g.
// deceased). Default unchecked. Checking it fades this row and hides them
// from the current + every future function's Ledger Sheet, except a function
// where they already have an existing entry (see peopleForCurrentFunction()
// in app.js — do not change that exclusion rule without asking).
function avoidCell(checked) {
  return `<td><input type="checkbox" class="avoid-check" ${checked ? "checked" : ""} /></td>`;
}

// Counts reflect the full roster (not the currently active filter/search),
// so switching pills always shows where you're headed, not a shrinking number.
function updatePillCounts() {
  const counts = {
    all: allPeople.length,
    "24manai": allPeople.filter((p) => p.type === "24Manai").length,
    others: allPeople.filter((p) => p.type === "Others").length,
  };
  $("type-filter-pills")
    .querySelectorAll("button[data-filter]")
    .forEach((btn) => {
      const count = counts[btn.dataset.filter] ?? 0;
      btn.textContent = `${btn.dataset.label} - ${count}`;
    });
}

// HEART LOGIC — roll_number is each person's permanent town-registry ID
// (see nextRollNumber() in app.js). It belongs only on this members page,
// never on a function's Ledger Sheet — do not change that without asking.
function renderRows() {
  updatePillCounts();
  const pillFiltered =
    currentFilter === "24manai"
      ? allPeople.filter((p) => p.type === "24Manai")
      : currentFilter === "others"
      ? allPeople.filter((p) => p.type === "Others")
      : allPeople;

  const snoQ = $("filter-sno").value.trim().toLowerCase();
  const rollQ = $("filter-roll").value.trim().toLowerCase();
  const nameQ = $("filter-name").value.trim().toLowerCase();
  const nameEnQ = $("filter-name-en").value.trim().toLowerCase();
  const mobileQ = $("filter-mobile").value.trim().replace(/\s+/g, "").toLowerCase();
  const typeQ = $("filter-type").value;

  const visible = pillFiltered.filter((p) => {
    if (snoQ && !String(p.member_no ?? "").toLowerCase().includes(snoQ)) return false;
    if (rollQ && !String(p.roll_number ?? "").toLowerCase().includes(rollQ)) return false;
    if (nameQ && !(p.name || "").toLowerCase().includes(nameQ)) return false;
    if (nameEnQ && !(p.name_en || "").toLowerCase().includes(nameEnQ)) return false;
    if (mobileQ && !formatMobile(p.mobile).replace(/\s+/g, "").toLowerCase().includes(mobileQ)) return false;
    if (typeQ && p.type !== typeQ) return false;
    return true;
  });

  $("members-body").innerHTML = visible
    .map(
      (p) => `<tr data-person="${p.id}" class="${p.avoid ? "row-avoided" : ""}">
        <td>${p.member_no ?? ""}</td>
        <td>${p.roll_number ?? ""}</td>
        ${cell("name", p.name)}
        ${cell("name_en", p.name_en ?? "")}
        ${cell("mobile", formatMobile(p.mobile), 'inputmode="numeric"')}
        ${typeCell(p.type)}
        ${avoidCell(p.avoid)}
      </tr>`
    )
    .join("");
}

async function loadMembers() {
  setStatus("Loading members…", false);
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
  prefillNewMemberRow();
  setStatus("", false);
}

// nextMemberNo/nextRollNumber wrap the shared computeNextMemberNo/
// computeNextRollNumber (shared.js) bound to this page's `allPeople` array —
// see shared.js for the Roll Number HEART LOGIC rule.
function nextMemberNo() {
  return computeNextMemberNo(allPeople);
}
function nextRollNumber() {
  return computeNextRollNumber(allPeople);
}

function prefillNewMemberRow() {
  $("new-m-sno").textContent = nextMemberNo();
  $("new-m-roll").textContent = nextRollNumber();
  updateNewMemberLock();
}

// nextMemberNo()/nextRollNumber() above are fine for the tfoot's live preview
// (just a hint, never saved as-is), but the actual insert needs numbers
// computed from a fresh fetch right before writing — allPeople can be stale
// if another admin (this page in another tab, or the main Ledger Sheet) added
// someone since this page loaded. A unique constraint on both columns is the
// real backstop (see add_unique_constraints.sql / add_roll_number.sql); on a
// collision (Postgres code 23505) this just re-fetches and retries.
async function insertPersonRaceSafe(base, attemptsLeft = 3) {
  const { data: numberSource, error: fetchError } = await client.from("people").select("member_no, roll_number");
  if (fetchError) return { data: null, error: fetchError };
  const memberNo = computeNextMemberNo(numberSource);
  const rollNumber = computeNextRollNumber(numberSource);

  const { data, error } = await client
    .from("people")
    .insert({ ...base, member_no: memberNo, roll_number: rollNumber })
    .select()
    .single();
  if (error && error.code === "23505" && attemptsLeft > 1) {
    return insertPersonRaceSafe(base, attemptsLeft - 1);
  }
  return { data, error };
}

// New row starts locked (only பெயர்/Name enterable) until a name is typed —
// same pattern as the main Ledger Sheet's new row (see updateNewRowLock in app.js).
function updateNewMemberLock() {
  const hasName = $("new-m-name").value.trim().length > 0 || $("new-m-name-en").value.trim().length > 0;
  $("new-m-mobile").disabled = !hasName;
  $("new-m-type").disabled = !hasName;
}

async function addNewMember() {
  const name = $("new-m-name").value.trim();
  const nameEn = $("new-m-name-en").value.trim();
  if (!name && !nameEn) return;

  const dup = allPeople.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
  if (dup) {
    setStatus(`"${name}" already exists (S.No. ${dup.member_no ?? "-"}) — scroll up to find them instead of re-adding.`, true);
    return;
  }

  const type = $("new-m-type").value;
  if (!type) {
    setStatus("Pick a Type (24Manai/Others) for the new member before saving.", true);
    return;
  }

  const mobile = $("new-m-mobile").value.trim().replace(/[^\d+]/g, "");

  const { data: person, error } = await insertPersonRaceSafe({ name, name_en: nameEn, mobile, type });
  if (error) {
    setStatus("Error adding member: " + error.message, true);
    return;
  }

  allPeople.push(person);
  allPeople.sort((a, b) => (a.member_no ?? 9999) - (b.member_no ?? 9999) || a.name.localeCompare(b.name));

  ["new-m-name", "new-m-name-en", "new-m-mobile"].forEach((id) => ($(id).value = ""));
  $("new-m-type").value = "";
  updateNewMemberLock();
  setStatus("Added.", false);
  renderRows();
  prefillNewMemberRow();

  const savedTr = $("members-body").querySelector(`tr[data-person="${person.id}"]`);
  if (savedTr) {
    savedTr.scrollIntoView({ behavior: "smooth", block: "center" });
    savedTr.classList.add("row-blink");
    setTimeout(() => savedTr.classList.remove("row-blink"), 1100);
  }
}

$("new-m-name").addEventListener("input", updateNewMemberLock);
$("new-m-name-en").addEventListener("input", updateNewMemberLock);
$("new-m-mobile").addEventListener("input", () => filterMobileInput($("new-m-mobile")));

// Row stays unsaved while typing — Enter (on any field in the row) commits it,
// and so does clicking/tabbing away to somewhere outside the row entirely.
["new-m-name", "new-m-name-en", "new-m-mobile", "new-m-type"].forEach((id) => {
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addNewMember();
    }
  });
});

// Safari doesn't fire blur/focusout when clicking non-interactive elements
// (blank space, plain text, etc.), so a click-anywhere-outside check is done
// at the document level instead of relying on focus events.
document.addEventListener("click", (e) => {
  if (!$("new-member-row").contains(e.target)) addNewMember();
});

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

// renderRows() replaces the whole tbody, which would silently discard any
// cell that's mid-edit (unlocked, not yet committed) — e.g. typing a Name
// correction, then touching a filter box before pressing Enter. Auto-commit
// any open cell first (same save path as clicking away) so filtering never
// loses an edit.
async function requestRenderRows() {
  const unlockedInputs = Array.from(document.querySelectorAll("#members-body .cell-input.unlocked"));
  if (unlockedInputs.length) {
    await Promise.all(unlockedInputs.map((input) => commitCell(input)));
  }
  renderRows();
}
const debouncedRequestRenderRows = debounce(requestRenderRows, 150);

// S.No/Roll No./Mobile hold numbers, so their filter boxes only accept the
// kind of input those columns can actually contain — matches how the
// corresponding table cells themselves are already restricted (e.g. new-m-mobile).
// Registered before the render-triggering listeners below so the value is
// already sanitized by the time renderRows() reads it.
$("filter-sno").addEventListener("input", () => filterDigitsInput($("filter-sno")));
$("filter-roll").addEventListener("input", () => filterDigitsInput($("filter-roll")));
$("filter-mobile").addEventListener("input", () => filterMobileInput($("filter-mobile")));

["filter-sno", "filter-roll", "filter-name", "filter-name-en", "filter-mobile"].forEach((id) => {
  $(id).addEventListener("input", debouncedRequestRenderRows);
});
$("filter-type").addEventListener("change", requestRenderRows);

$("type-filter-pills").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-filter]");
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  $("type-filter-pills").querySelectorAll(".pill").forEach((p) => p.classList.toggle("active", p === btn));
  requestRenderRows();
});

// btn is optional — falls back to nextElementSibling, but callers that already
// have the button in hand (e.g. the click handler) pass it directly so the
// icon update never depends on re-deriving it from the DOM.
function lockInput(input, btn) {
  input.readOnly = true;
  input.classList.remove("unlocked");
  btn = btn || input.nextElementSibling;
  if (btn) {
    btn.textContent = "🔒";
    btn.setAttribute("aria-label", "Unlock to edit");
  }
}

function unlockInput(input, btn) {
  input.readOnly = false;
  input.classList.add("unlocked");
  btn = btn || input.nextElementSibling;
  if (btn) {
    btn.textContent = "✏️";
    btn.setAttribute("aria-label", "Lock");
  }
  input.focus();
  input.select();
}

// Locks (and thus commits) exactly once per edit — the readOnly check makes
// repeat calls from different trigger paths (Enter, blur, click-away) harmless.
async function commitCell(input, btn) {
  if (input.readOnly) return;
  const tr = input.closest("tr");
  const personId = tr.dataset.person;
  const field = input.dataset.field;
  let value = input.value.trim();
  let displayValue = value;

  // Store raw digits (+prefix allowed), not the display-formatted string with
  // spaces — keeps the DB value usable for search/export/dial-links later.
  // formatMobile() strips whitespace before reformatting either way, so this
  // stays safe to display even for older rows saved with spaces baked in.
  if (field === "mobile") {
    value = value.replace(/[^\d+]/g, "");
    displayValue = formatMobile(value);
  }

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

  input.value = displayValue;
  lockInput(input, btn);

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
  filterMobileInput(e.target);
});

$("members-body").addEventListener("change", async (e) => {
  if (!e.target.classList.contains("avoid-check")) return;
  const checkbox = e.target;
  const tr = checkbox.closest("tr");
  const personId = tr.dataset.person;
  const value = checkbox.checked;
  const { error } = await client.from("people").update({ avoid: value }).eq("id", personId);
  if (error) {
    setStatus("Error saving: " + error.message, true);
    checkbox.checked = !value;
    return;
  }
  const p = allPeople.find((p) => p.id === personId);
  if (p) p.avoid = value;
  tr.classList.toggle("row-avoided", value);
  setStatus("Saved.", false);
});

// Without this, clicking the lock button while the field is still focused
// shifts focus to the button first, firing the "save on Tab-away" (focusout)
// handler before this click even runs — the field saves and re-locks, then
// this click's own toggle logic immediately reopens it. Blocking the focus
// shift means only this handler decides what happens.
$("members-body").addEventListener("mousedown", (e) => {
  if (e.target.closest(".lock-btn")) e.preventDefault();
});

$("members-body").addEventListener("click", (e) => {
  const btn = e.target.closest(".lock-btn");
  if (!btn) return;
  e.stopPropagation();
  const input = btn.previousElementSibling;
  if (input.readOnly) {
    unlockInput(input, btn);
  } else {
    commitCell(input, btn);
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
