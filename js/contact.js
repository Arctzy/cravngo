/* Cravn' Go — Contact page: opening hours, "open now" badge and the message form */
(() => {
  const { $, showToast, hoursFor, toMinutes, toLabel, manilaNow } = window.CG;
  const DATA = window.CRAVNGO_DATA;
  const CONTACT_EMAIL = "latjhoseah09@gmail.com";

  /* ---------- Hours table + open/closed badge ---------- */
  const table = $("[data-hours]");
  const statusEl = $("[data-open-status]");
  const { day, minutes: now } = manilaNow();

  DATA.hours.forEach((h) => {
    const row = table.insertRow();
    row.innerHTML = '<th scope="row"></th><td></td>';
    row.cells[0].textContent = h.label;
    row.cells[1].textContent = `${toLabel(h.open)} – ${toLabel(h.close)}`;
    if (h.days.includes(day)) row.classList.add("is-today");
  });

  const today = hoursFor(day);
  const tomorrow = hoursFor((day + 1) % 7);
  let text = "Closed today";
  let open = false;
  if (today && now >= toMinutes(today.open) && now < toMinutes(today.close)) {
    open = true;
    text = `Open now · until ${toLabel(today.close)}`;
  } else if (today && now < toMinutes(today.open)) {
    text = `Closed · opens at ${toLabel(today.open)}`;
  } else if (tomorrow) {
    text = `Closed · opens tomorrow at ${toLabel(tomorrow.open)}`;
  }
  statusEl.textContent = text;
  statusEl.classList.add(open ? "is-open" : "is-closed");
  statusEl.hidden = false;

  /* ---------- Message form → visitor's email app ---------- */
  const contactForm = $("[data-contact-form]");
  contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(contactForm);
    const name = data.get("name").trim();
    const subject = `Website message from ${name}`;
    const body = `${data.get("message").trim()}\n\n— ${name}\n${data.get("email").trim()}`;
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    showToast("Opening your email app…");
  });
})();
