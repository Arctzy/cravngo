/* Cravn' Go — Contact page: opening hours, "open now" badge, the map and the message form */
(() => {
  const { $, $$, showToast, copyText, hoursFor, toMinutes, toLabel, manilaNow } = window.CG;
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

  // Today's opening hours as a bar, filled up to the current time (Philippine time)
  if (today) {
    const start = toMinutes(today.open);
    const end = toMinutes(today.close);
    const done = Math.min(Math.max((now - start) / (end - start), 0), 1);
    const bar = document.createElement("div");
    bar.className = `today-bar${open ? " is-open" : ""}`;
    bar.style.setProperty("--done", done.toFixed(3));
    bar.innerHTML = `
      <div class="today-track"><span class="today-fill"></span><span class="today-now"></span></div>
      <div class="today-labels"><span></span><span></span></div>`;
    const [openLabel, closeLabel] = bar.querySelectorAll(".today-labels span");
    openLabel.textContent = `Opens ${toLabel(today.open)}`;
    closeLabel.textContent = `Closes ${toLabel(today.close)}`;
    statusEl.after(bar);
  }

  /* ---------- Map: Map / Satellite switch, loading shimmer, copy address ---------- */
  const mapCard = $("[data-map]");
  const frame = $("[data-map-frame]");
  const mapStatus = $("[data-map-status]");
  const ADDRESS = "Cravn’ Go, The Lifestyle Strip, Sto. Tomas, Batangas";
  const MAP_SRC = "https://www.google.com/maps?q=The+Lifestyle+Strip,+Sto.+Tomas,+Batangas&output=embed";

  mapStatus.textContent = text;
  mapStatus.classList.add(open ? "is-open" : "is-closed");
  mapStatus.hidden = false;

  let loadTimer;
  const setLoading = (on) => {
    mapCard.classList.toggle("is-loading", on);
    clearTimeout(loadTimer);
    // Never leave the shimmer up if the map is slow to report in
    if (on) loadTimer = setTimeout(() => setLoading(false), 12000);
  };
  frame.addEventListener("load", () => setLoading(false));
  setLoading(true);

  const views = $$("[data-map-view]", mapCard);
  views.forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.getAttribute("aria-pressed") === "true") return;
      views.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      mapCard.dataset.view = btn.dataset.mapView;
      setLoading(true);
      frame.src = MAP_SRC + (btn.dataset.mapView === "k" ? "&t=k" : "");
    })
  );

  $("[data-copy-address]", mapCard).addEventListener("click", async () => {
    const copied = await copyText(ADDRESS);
    showToast(copied ? "Address copied — paste it in your maps app" : "Couldn’t copy — the address is The Lifestyle Strip, Sto. Tomas");
  });

  /* ---------- Message form → visitor's email app ---------- */
  const contactForm = $("[data-contact-form]");
  const message = $("[data-message]");
  const counter = $("[data-message-count]");
  const sendBtn = $("[data-send]");

  const updateCount = () => {
    counter.textContent = `${message.value.length} / ${message.maxLength}`;
    counter.classList.toggle("is-near", message.value.length > message.maxLength * 0.9);
  };
  message.addEventListener("input", updateCount);
  updateCount();

  contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    // The paper plane takes off, then glides back in
    sendBtn.classList.remove("is-sent");
    void sendBtn.offsetWidth;
    sendBtn.classList.add("is-sent");
    setTimeout(() => sendBtn.classList.remove("is-sent"), 1400);
    const data = new FormData(contactForm);
    const name = data.get("name").trim();
    const subject = `Website message from ${name}`;
    const body = `${data.get("message").trim()}\n\n— ${name}\n${data.get("email").trim()}`;
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    showToast("Opening your email app…");
  });
})();
