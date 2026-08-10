// Helpers shared by index.html (app.js) and members.html (members.js). Kept
// as one copy so heart-logic rules and formatting behavior can't drift
// between the two pages — include this script before app.js/members.js.

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

// Number-only fields (S.No, Roll No, etc.) only accept digits as the user types.
function filterDigitsInput(el) {
  const cleaned = el.value.replace(/[^\d]/g, "");
  if (cleaned !== el.value) el.value = cleaned;
}

// HEART LOGIC — do not change without asking (transform, not font-size, for
// the title's shrink — see members.html's HEART LOGIC index, point 3, for
// the full reasoning: animating font-size on wrapping text causes a
// discrete, unsmoothable jump exactly when it collapses from 2 lines to 1).
// Shared by index.html and members.html — both use the same
// body.is-scrolled header h1 transform:scale() rule in style.css. Scaling
// alone doesn't shrink the space the title reserves in the page (transform
// is purely visual, not layout), so a negative margin pulls that freed
// space closed — computed from the title's actual rendered height
// (h1.offsetHeight, which transform doesn't affect) rather than guessed,
// since the Tamil text's wrap/height varies by screen width.
// SCALE here must match the `scale(0.6)` in body.is-scrolled header h1.
const HEADER_TITLE_COMPACT_SCALE = 0.6;
function syncHeaderTitleCollapse() {
  const h1 = document.querySelector("header h1");
  if (!h1) return;
  const collapse = -(h1.offsetHeight * (1 - HEADER_TITLE_COMPACT_SCALE));
  document.documentElement.style.setProperty("--header-h1-margin-collapse", collapse + "px");
}
window.addEventListener("resize", syncHeaderTitleCollapse);
window.addEventListener("load", syncHeaderTitleCollapse);
if (document.fonts) document.fonts.ready.then(syncHeaderTitleCollapse);
syncHeaderTitleCollapse();

// HEART LOGIC — do not change without asking first.
// Roll Number is each person's permanent TOWN REGISTRY identification number
// (the members page represents the total population of the town, not just
// people tied to a function). It is distinct from S.No./member_no, which is
// just a registration-order number that can show gaps once a function's
// people-Type filter excludes some members. Roll Number stays fixed to the
// person, starts at 1001, and must never appear on a function's Ledger Sheet
// — only on the members directory page.
function computeNextRollNumber(peopleList) {
  const max = peopleList.reduce((m, p) => Math.max(m, p.roll_number || 0), 1000);
  return max + 1;
}

function computeNextMemberNo(peopleList) {
  const max = peopleList.reduce((m, p) => Math.max(m, p.member_no || 0), 0);
  return max + 1;
}
