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

// escapeHtml, formatMobile, filterMobileInput, syncHeaderTitleCollapse live
// in shared.js (loaded before this file) — kept as one copy with members.js.

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
  // #app is display:none behind the gate, so header h1's offsetHeight read
  // as 0 when syncHeaderTitleCollapse() ran on the page's "load" event —
  // its only other triggers are resize/fonts.ready, neither of which fires
  // just from unhiding #app — leaving --header-h1-margin-collapse stuck at
  // 0px for the rest of the session. Re-run it now that h1 is actually
  // laid out, so the scrolled-state header height genuinely shrinks to fit
  // the (now correctly measured) title instead of just visually scaling
  // without reclaiming the freed space.
  syncHeaderTitleCollapse();
  // #gate-password's autofocus scrolls the page to bring it into view
  // during the initial render (its card is taller than a lot of real
  // viewports) — that residual scroll position doesn't reset on its own
  // once #gate is hidden and #app appears, and was enough on its own to
  // cross the is-scrolled threshold (window.scrollY > 10) before the user
  // had scrolled anything, starting the whole page in its compact state.
  window.scrollTo(0, 0);
  loadAll();
}

if (sessionStorage.getItem("boliammanur_unlocked") === "1") {
  unlockApp();
}

// ---------- Scroll-compact shrink ----------
// Same architecture as members.html (see that file's HEART LOGIC index for
// the full reasoning): header + pills + #sheet-title + the ledger sheet's
// own thead all live in one shared .sticky-top-stack (style.css). .pills-
// inline and #sheet-title each shrink via transform:scale() (same
// technique as .members-filter-card — the whole element shrinks as one
// compositor-only unit instead of animating individual children's padding/
// font-size), so each needs its own JS-measured margin-collapse below.
// Measures .pills-inline specifically, not .sheet-filter-card itself —
// that outer card's own width must stay fixed at all times to keep
// matching the spreadsheet's width below it (see .sheet-filter-card's own
// comment in style.css), so it can't be the thing that scales. SCALE here
// must match body.is-scrolled .pills-inline's scale() in style.css.
const SHEET_FILTER_CARD_COMPACT_SCALE = 0.85;
function syncSheetFilterCardCollapse() {
  const pillsInline = document.querySelector(".pills-inline");
  if (!pillsInline) return;
  const collapse = -(pillsInline.offsetHeight * (1 - SHEET_FILTER_CARD_COMPACT_SCALE));
  document.documentElement.style.setProperty("--sheet-filter-card-margin-collapse", collapse + "px");
}
window.addEventListener("resize", syncSheetFilterCardCollapse);
window.addEventListener("load", syncSheetFilterCardCollapse);
if (document.fonts) document.fonts.ready.then(syncSheetFilterCardCollapse);
syncSheetFilterCardCollapse();
// Year/function pill counts (and thus how many lines they wrap onto) change
// every time the user picks a different year/function — re-measuring only
// on load/resize left the card's real height uncorrected after that, the
// same undershoot bug fixed for members.html's pills card.
const sheetFilterCard = document.querySelector(".pills-inline");
if (sheetFilterCard) new MutationObserver(syncSheetFilterCardCollapse).observe(sheetFilterCard, { childList: true, subtree: true, characterData: true });

// Same transform:scale() + margin-collapse technique as
// syncSheetFilterCardCollapse above, for #sheet-title (the function
// name/year heading + உறுப்பினர்கள் toggle button). SCALE here must match
// body.is-scrolled #sheet-title's scale() in style.css.
const SHEET_TITLE_COMPACT_SCALE = 0.7;
function syncSheetTitleCollapse() {
  const title = document.getElementById("sheet-title");
  if (!title) return;
  const collapse = -(title.offsetHeight * (1 - SHEET_TITLE_COMPACT_SCALE));
  document.documentElement.style.setProperty("--sheet-title-margin-collapse", collapse + "px");
}
window.addEventListener("resize", syncSheetTitleCollapse);
window.addEventListener("load", syncSheetTitleCollapse);
if (document.fonts) document.fonts.ready.then(syncSheetTitleCollapse);
syncSheetTitleCollapse();
// updateSheetTitle() replaces #sheet-title's entire innerHTML (new function
// name/year, new உறுப்பினர்கள் count) every time the user picks a different
// year/function — same re-measure-on-content-change need as the pills card.
const sheetTitleEl = document.getElementById("sheet-title");
if (sheetTitleEl) new MutationObserver(syncSheetTitleCollapse).observe(sheetTitleEl, { childList: true, subtree: true, characterData: true });

// HEART LOGIC — do not change without asking (scrollY-based shrink +
// wheel-delta-gated expand + a post-expand grace period + a re-armable
// scroll freeze). Two earlier versions computed scroll direction by
// diffing window.scrollY between animation frames — unreliable during
// real trackpad momentum scrolling, since the deceleration tail can
// report tiny/jittery or even momentarily-reversed deltas frame to frame,
// so "expand" could fire and then get undone by the very next frame
// misreading its own direction. Wheel events' own deltaY is the actual
// physical input signal (not a derived diff of eased scroll position), so
// it doesn't suffer that jitter — used for both the expand check and the
// freeze check below. Shrinking itself stays the simple, already-
// confirmed-reliable scrollY>10 check (any scroll method — wheel,
// scrollbar, keyboard — not just wheel), but the same wheel gesture that
// triggers an expand also keeps scrolling the page (there's one shared
// page-level scroll, not a separate non-scrolling header zone), so its
// trailing native "scroll" events — and momentum after it — would
// otherwise immediately re-shrink it. suppressShrinkUntil is a short
// grace window after an expand during which the shrink check is skipped,
// so that same gesture can't undo itself.
let scrollTicking = false;
let suppressShrinkUntil = 0;
function updateScrollCompactState() {
  if (window.scrollY > 10 && Date.now() > suppressShrinkUntil) {
    document.body.classList.add("is-scrolled");
  }
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

// Freeze: whenever the top content is expanded (freezeArmed) and the user
// starts to scroll down, the spreadsheet is held exactly where it is —
// not necessarily scrollY 0; see freezeHoldY — while the shrink animation
// plays, then released after ~350ms so the NEXT scroll is what actually
// moves the spreadsheet. Re-arms every time the header expands again (see
// freezeArmed = true in the wheel-expand handler below) — by explicit
// request, this isn't a one-time-on-page-load thing, it applies to every
// expand→scroll-down transition for the life of the page.
//
// The actual block is position:fixed on <body> (with a negative top offset
// compensating so nothing visually jumps), NOT overflow:hidden and NOT
// preventDefault() on wheel events alone — two earlier versions tried
// both and both leaked under a real trackpad in real Chrome. A fast/big
// trackpad flick starts a momentum/fling animation that Chrome runs on
// the compositor thread, independent of the main JS thread; once that
// fling has begun, neither cancelling later wheel events nor toggling
// overflow reliably stops it — the fling can keep running to completion
// regardless, easily outlasting a fixed freeze timer. position:fixed
// removes <body> from the scrollable flow entirely, so there is no
// scrollable content left for a fling to move — not "discouraged",
// structurally impossible — which is the same technique production
// scroll-lock libraries use for exactly this class of bug. The
// preventDefault() calls on wheel/touchmove/keydown are kept as a
// first-line catch for the common case (stops the scroll before the lock
// even needs to engage, when timing lines up) — position:fixed is what
// guarantees the freeze holds even when it doesn't.
// Pinning <body> alone isn't enough: is-scrolled also transitions the
// header/pills/#sheet-title's margin-bottom (not just their compositor-
// only transform) over the same ~200ms, which shrinks .sticky-top-stack's
// real document height as it plays — that pulls everything below it
// (<main>, i.e. the spreadsheet) upward in the document, independent of
// scroll position, so body's fixed offset alone doesn't stop it from
// visibly drifting during the freeze. <main> is pinned separately here,
// at its own on-screen position captured before anything shrinks, so it
// can't move regardless of what the header's layout does above it. This
// doesn't touch the header/title margin-collapse mechanism itself (HEART
// LOGIC elsewhere in this file/style.css) — it just holds <main> still
// alongside it.
let freezeArmed = true;
let freezeActive = false;
let freezeHoldY = 0;
const mainEl = document.querySelector("main");
function beginFreeze() {
  if (!freezeArmed || freezeActive) return;
  freezeArmed = false;
  freezeActive = true;
  freezeHoldY = window.scrollY;
  const mainTop = mainEl.getBoundingClientRect().top;
  document.body.classList.add("is-scrolled");
  document.body.style.position = "fixed";
  document.body.style.top = -freezeHoldY + "px";
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  mainEl.style.position = "fixed";
  mainEl.style.top = mainTop + "px";
  mainEl.style.left = "0";
  mainEl.style.right = "0";
  setTimeout(() => {
    freezeActive = false;
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    mainEl.style.position = "";
    mainEl.style.top = "";
    mainEl.style.left = "";
    mainEl.style.right = "";
    window.scrollTo(0, freezeHoldY);
  }, 350);
}
function onWheelForFreeze(e) {
  if (e.deltaY <= 0 || (!freezeArmed && !freezeActive)) return;
  e.preventDefault();
  beginFreeze();
}
let freezeTouchStartY = null;
function onTouchStartForFreeze(e) {
  freezeTouchStartY = e.touches[0].clientY;
}
function onTouchMoveForFreeze(e) {
  if (freezeTouchStartY === null || (!freezeArmed && !freezeActive)) return;
  if (freezeTouchStartY - e.touches[0].clientY > 0) {
    e.preventDefault();
    beginFreeze();
  }
}
const FREEZE_DOWN_KEYS = new Set(["ArrowDown", "PageDown", " ", "End"]);
function onKeyForFreeze(e) {
  if (!FREEZE_DOWN_KEYS.has(e.key) || (!freezeArmed && !freezeActive)) return;
  e.preventDefault();
  beginFreeze();
}
window.addEventListener("wheel", onWheelForFreeze, { passive: false });
window.addEventListener("touchstart", onTouchStartForFreeze, { passive: true });
window.addEventListener("touchmove", onTouchMoveForFreeze, { passive: false });
window.addEventListener("keydown", onKeyForFreeze);
// Scrollbar-dragging fires none of the above — it's not a cancelable
// input event, just a resulting "scroll". Catch it here: if scrollY moved
// while still armed (nothing else caught it first), snap back to where it
// was and begin the freeze from there instead.
let freezeLastKnownScrollY = window.scrollY;
window.addEventListener(
  "scroll",
  () => {
    // Only a DOWNWARD drift counts as an uncaught scrollbar-drag needing a
    // freeze — an upward one is just as likely to be the natural scroll
    // that a wheel-over-header expand causes on its own (freezeArmed is
    // set true synchronously right before that scroll fires), and treating
    // that as a fresh down-attempt would immediately re-shrink what was
    // just expanded.
    if (freezeArmed && !freezeActive && window.scrollY > freezeLastKnownScrollY) {
      window.scrollTo(0, freezeLastKnownScrollY);
      beginFreeze();
    }
    freezeLastKnownScrollY = window.scrollY;
  },
  { passive: true }
);

const stickyTopStackEl = document.querySelector(".sticky-top-stack");
window.addEventListener(
  "wheel",
  (e) => {
    if (e.deltaY >= 0 || !stickyTopStackEl) return;
    const rect = stickyTopStackEl.getBoundingClientRect();
    if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
      document.body.classList.remove("is-scrolled");
      suppressShrinkUntil = Date.now() + 600;
      freezeArmed = true;
    }
  },
  { passive: true }
);
updateScrollCompactState();

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
  $("sheet-tbody-wrap").classList.remove("hidden");
  $("sheet-thead-wrap").classList.remove("hidden");
}

$("sheet-title").addEventListener("click", (e) => {
  const btn = e.target.closest("#toggle-members-btn");
  if (!btn) return;
  // .sheet-thead-wrap lives in .sticky-top-stack now (see that HEART LOGIC
  // comment in style.css), separate from .sheet-tbody-wrap in <main> — both
  // need toggling together to fully collapse/restore the table, matching
  // the original single-wrap behavior before the split.
  const nowHidden = $("sheet-tbody-wrap").classList.toggle("hidden");
  $("sheet-thead-wrap").classList.toggle("hidden", nowHidden);
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

// nextMemberNo/nextRollNumber wrap the shared computeNextMemberNo/
// computeNextRollNumber (shared.js) bound to this page's `people` array —
// see shared.js for the Roll Number HEART LOGIC rule.
function nextMemberNo() {
  return computeNextMemberNo(people);
}
function nextRollNumber() {
  return computeNextRollNumber(people);
}

function prefillNewRowNumber() {
  $("new-member-no").value = nextMemberNo();
  updateNewRowLock();
  refreshNewRowSanthaAmount();
  refreshNewTypeRow();
}

function refreshNewRowSanthaAmount() {
  const amount = currentSanthaAmount();
  $("new-santha-check").dataset.amount = amount;
  $("new-santha-amount").textContent = amount.toFixed(0);
}

// HEART LOGIC — Type is mandatory at creation and permanently uneditable
// afterward (see members.js). Functions restricted to one Type assign it
// automatically; a function set to "All" must ask, since it's ambiguous.
function refreshNewTypeRow() {
  const f = functionsList.find((f) => f.id === selectedFunctionId);
  const needsChoice = (f?.allowed_type || "All") === "All";
  $("new-type-row").classList.toggle("hidden", !needsChoice);
  if (!needsChoice) $("new-type").value = "";
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
// HEART LOGIC — "Avoid" (set on the members page) means the person is no
// longer active (e.g. deceased). They're hidden from this and every future
// function's Ledger Sheet, EXCEPT a function where they already have an
// existing ledger_entries row — that historical record stays visible.
function peopleForCurrentFunction() {
  const f = functionsList.find((f) => f.id === selectedFunctionId);
  const allowedType = f?.allowed_type || "All";
  let filtered = allowedType === "All" ? people : people.filter((p) => p.type === allowedType);

  const hasExistingEntry = new Set(ledgerEntries.map((e) => e.person_id));
  filtered = filtered.filter((p) => !p.avoid || hasExistingEntry.has(p.id));

  return filtered;
}

// சந்தா is a fixed price the admin sets per function (Dashboard) — members are
// just checked/unchecked here, never allowed to type a custom amount.
function currentSanthaAmount() {
  const f = functionsList.find((f) => f.id === selectedFunctionId);
  return Number(f?.santha_amount ?? 1000);
}

// S.No. shown on this sheet is a plain running count for whoever's actually on
// it — not the person's permanent member_no, which has gaps once a function's
// people-Type restriction excludes some members.
function entryRows() {
  const entryMap = Object.fromEntries(ledgerEntries.map((e) => [e.person_id, e]));
  return peopleForCurrentFunction().map((p, idx) => ({
    p,
    seq: idx + 1,
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

  const visible = rows.filter(({ p, seq, e }) => {
    if (snoQ && !String(seq).includes(snoQ)) return false;
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
    .map(({ p, seq, e }) => {
      const cls = e.low_confidence ? "uncertain" : "";
      return `<tr data-person="${p.id}">
        <td>${seq}</td>
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
// #sheet-thead-wrap itself doesn't scroll horizontally (overflow:hidden —
// same reasoning as members.html's .members-thead-wrap) so a horizontal
// drag on the body table mirrors onto it here, keeping columns aligned on
// narrow screens (this table has a mobile min-width, same as members.html's).
$("sheet-tbody-wrap").addEventListener("scroll", () => {
  $("sheet-thead-wrap").scrollLeft = $("sheet-tbody-wrap").scrollLeft;
  alignTotalsBanner();
});

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
  // HEART LOGIC — Type is mandatory and set once, at creation, then never
  // editable again (see members.js). A function restricted to one Type
  // assigns it automatically; a function set to "All" requires an explicit
  // pick via #new-type since it can't be inferred.
  const currentFunction = functionsList.find((f) => f.id === funcId);
  let newPersonType = null;
  if (currentFunction?.allowed_type && currentFunction.allowed_type !== "All") {
    newPersonType = currentFunction.allowed_type;
  } else {
    newPersonType = $("new-type").value;
    if (!newPersonType) {
      setStatus("sheet-status", "Pick a Type (24Manai/Others) for the new member before saving.", true);
      return;
    }
  }
  const { data: person, error: personError } = await client
    .from("people")
    .insert({ name, member_no: memberNo, mobile, name_en: nameEn, type: newPersonType, roll_number: nextRollNumber() })
    .select()
    .single();
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

  ["new-member-no", "new-mobile", "new-name-en", "new-name", "new-asal", "new-vatti", "new-thogai", "new-paid", "new-type"].forEach((id) => ($(id).value = ""));
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
