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

function syncHeaderHeight() {
  const header = document.querySelector("header");
  document.documentElement.style.setProperty("--header-height", header.offsetHeight + "px");
}
window.addEventListener("resize", syncHeaderHeight);
syncHeaderHeight();

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
