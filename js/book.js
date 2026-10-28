/* Cravn' Go — Book & order page: reserve a table, pick up or delivery (log-in required) */
(() => {
  const { $, $$, peso, db, dbError, NOT_READY, order, auth, initials, celebrate } = window.CG;
  const { toMinutes, toLabel, hoursFor, manilaNow, parseDate, whenText, openDialog } = window.CG;

  // Keep these in sync with supabase/schema.sql
  const SLOT_MINUTES = 30; // times every 30 min; the last one is 30 min before closing
  const LEAD_MINUTES = 30; // the earliest same-day time is 30 min from now
  const MAX_DAYS_AHEAD = 60;

  const form = $("[data-booking-form]");
  const who = $("[data-book-who]");
  const dateInput = $("[data-book-date]");
  const timeSelect = $("[data-book-time]");
  const submitBtn = $("[data-book-submit]");
  const errorEl = $("[data-book-error]");
  const confirmDialog = $("[data-confirm-dialog]");

  const TYPE_COPY = {
    reserve: {
      when: "Date & time", time: "Time", summary: "Pre-order food",
      hint: "Optional — we’ll have your dishes ready when you arrive.", submit: "Reserve table",
    },
    pickup: {
      when: "Pick-up time", time: "Pick-up time", summary: "Your order",
      hint: "Add dishes from the menu, then choose when to collect them.", submit: "Place pick-up order",
    },
    delivery: {
      when: "Delivery time", time: "Delivery time", summary: "Your order",
      hint: "Add dishes from the menu and tell us where to bring them.", submit: "Place delivery order",
    },
  };

  const bookType = () => form.elements.type.value;
  const loginUrl = (to = "login.html") => `${to}?next=${encodeURIComponent(`book.html?type=${bookType()}`)}`;
  const setSubmitLabel = () => {
    submitBtn.textContent = auth.user() ? TYPE_COPY[bookType()].submit : "Log in to book";
  };

  /* ---------- Who is booking ---------- */
  const renderWho = () => {
    const user = auth.user();
    if (user) {
      who.innerHTML = `
        <span class="avatar" aria-hidden="true"></span>
        <div>
          <p class="book-who-label">Booking as</p>
          <p class="book-who-name"></p>
          <p class="book-who-meta"></p>
        </div>
        <button class="link-btn link-inline" type="button" data-not-me>Not you?</button>`;
      $(".avatar", who).textContent = initials(user.full_name);
      $(".book-who-name", who).textContent = user.full_name;
      $(".book-who-meta", who).textContent = `@${user.username} · ${user.phone}`;
      $("[data-not-me]", who).addEventListener("click", () => auth.logOut());
      submitBtn.type = "submit";
    } else {
      who.innerHTML = `
        <div class="book-who-guest">
          <p><strong>Log in to book.</strong> Your bookings are saved to your account so you can check or cancel them anytime.</p>
          <div class="book-who-actions">
            <a class="btn btn-primary" data-login-link>Log in</a>
            <a class="btn btn-outline" data-register-link>Create account</a>
          </div>
        </div>`;
      $("[data-login-link]", who).href = loginUrl();
      $("[data-register-link]", who).href = loginUrl("register.html");
      submitBtn.type = "button";
    }
    setSubmitLabel();
  };

  // Logged out: the main button goes to the log-in page (and comes back here after)
  submitBtn.addEventListener("click", () => {
    if (!auth.user()) location.href = loginUrl();
  });

  // Show only the fields for the chosen type. Hidden groups are disabled, so they aren't required or sent.
  const applyType = () => {
    const type = bookType();
    const copy = TYPE_COPY[type];
    $$("[data-for]", form).forEach((group) => {
      const on = group.dataset.for.split(" ").includes(type);
      group.hidden = !on;
      group.disabled = !on;
    });
    $("[data-when-legend]", form).textContent = copy.when;
    $("[data-time-label]", form).textContent = copy.time;
    $("[data-summary-title]", form).textContent = copy.summary;
    $("[data-summary-hint]", form).textContent = copy.hint;
    errorEl.textContent = "";
    renderWho();
    syncChips();
    updateMeta();
  };

  const addDays = (iso, n) => {
    const d = parseDate(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const toHm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

  // Fill the time list with the open slots for the chosen date. Returns how many there are.
  const fillTimes = () => {
    const previous = timeSelect.value;
    const date = dateInput.value;
    const now = manilaNow();
    const hours = date && hoursFor(parseDate(date).getUTCDay());
    const earliest = date === now.date ? now.minutes + LEAD_MINUTES + 1 : 0;
    const slots = [];
    if (hours) {
      for (let t = toMinutes(hours.open); t <= toMinutes(hours.close) - SLOT_MINUTES; t += SLOT_MINUTES) {
        if (t >= earliest) slots.push(toHm(t));
      }
    }
    timeSelect.length = 0;
    const placeholder = new Option(
      !date ? "Pick a date first" : slots.length ? "Choose a time" : date === now.date ? "No times left today" : "Closed that day",
      ""
    );
    placeholder.disabled = true;
    timeSelect.add(placeholder);
    slots.forEach((slot) => timeSelect.add(new Option(toLabel(slot), slot)));
    timeSelect.value = slots.includes(previous) ? previous : "";
    return slots.length;
  };

  // Today if there are times left, otherwise tomorrow
  const resetDate = () => {
    const today = manilaNow().date;
    dateInput.min = today;
    dateInput.max = addDays(today, MAX_DAYS_AHEAD);
    dateInput.value = today;
    if (!fillTimes()) {
      dateInput.value = addDays(today, 1);
      fillTimes();
    }
  };

  const shortDate = (iso) =>
    parseDate(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

  /* ---------- Quick dates: Today / Tomorrow / the coming Saturday ---------- */
  const chipsEl = $("[data-date-chips]");
  const syncChips = () =>
    $$("button", chipsEl).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.date === dateInput.value)));

  const buildChips = () => {
    const today = manilaNow();
    let toSaturday = (6 - today.day + 7) % 7;
    if (toSaturday < 2) toSaturday += 7; // today or tomorrow already has its own chip
    const saturday = addDays(today.date, toSaturday);
    chipsEl.innerHTML = "";
    [["Today", today.date], ["Tomorrow", addDays(today.date, 1)], [shortDate(saturday), saturday]].forEach(([text, date]) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "date-chip";
      chip.textContent = text;
      chip.dataset.date = date;
      chip.addEventListener("click", () => {
        dateInput.value = date;
        dateInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
      chipsEl.appendChild(chip);
    });
  };

  /* ---------- Summary: what, when and for how many ---------- */
  const metaEl = $("[data-summary-meta]");
  const META_ICONS = {
    type: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    date: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    time: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    guests: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.6M18 19a6 6 0 0 0-3-5.2"/>',
    occasion: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
  };
  const TYPE_NAMES = { reserve: "Table reservation", pickup: "Pick-up order", delivery: "Delivery order" };
  let lastMeta = {};

  const updateMeta = () => {
    const rows = { type: TYPE_NAMES[bookType()] };
    rows.date = dateInput.value ? shortDate(dateInput.value) : "Pick a date";
    rows.time = timeSelect.value ? toLabel(timeSelect.value) : "Choose a time";
    if (bookType() === "reserve") {
      rows.guests = form.elements.guests.selectedOptions[0]?.text || "";
      if (form.elements.occasion.value) rows.occasion = form.elements.occasion.value;
    }
    if (JSON.stringify(rows) === JSON.stringify(lastMeta)) return;
    metaEl.innerHTML = "";
    Object.entries(rows).forEach(([key, text]) => {
      const li = document.createElement("li");
      li.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${META_ICONS[key]}</svg><span></span>`;
      $("span", li).textContent = text;
      // The line that just changed flashes so you can see the form and the summary are linked
      if (lastMeta.type && lastMeta[key] !== text) li.classList.add("is-changed");
      metaEl.appendChild(li);
    });
    lastMeta = rows;
  };

  dateInput.addEventListener("change", syncChips);
  form.addEventListener("change", updateMeta);

  for (let n = 1; n <= 20; n++) {
    form.elements.guests.add(new Option(n === 1 ? "1 guest" : `${n} guests`, n, n === 2, n === 2));
  }

  // book.html?type=pickup (from Checkout) or ?type=reserve (from "Book a table")
  const requested = new URLSearchParams(location.search).get("type");
  if (TYPE_COPY[requested]) form.elements.type.value = requested;

  buildChips();
  resetDate();
  applyType();
  auth.onChange(renderWho);
  dateInput.addEventListener("change", fillTimes);
  form.addEventListener("change", (e) => {
    if (e.target.name === "type") applyType();
  });

  // Checkout pressed in the order drawer while already on this page
  document.addEventListener("cg:checkout", () => {
    if (bookType() === "reserve") {
      form.elements.type.value = "pickup";
      applyType();
    }
    form.scrollIntoView({ behavior: "smooth" });
  });

  /* ---------- Food summary (the same order as the drawer) ---------- */
  const summaryLines = $("[data-summary-lines]");
  const summaryEmpty = $("[data-summary-empty]");
  const summaryTotal = $("[data-summary-total]");
  order.onChange(() => {
    summaryLines.innerHTML = "";
    order.items().forEach(({ id, qty }) => summaryLines.appendChild(order.line(id, qty)));
    summaryEmpty.hidden = order.count() > 0;
    const total = peso(order.total());
    if (summaryTotal.textContent !== total) {
      summaryTotal.textContent = total;
      summaryTotal.classList.remove("bump");
      void summaryTotal.offsetWidth;
      summaryTotal.classList.add("bump");
    }
  });

  /* ---------- Submit ---------- */
  const showConfirm = (b) => {
    const when = whenText(b);
    const text = {
      reserve: `Table for ${b.guests} on ${when}, under ${b.name}.`,
      pickup: `Pick-up on ${when}, under ${b.name}.`,
      delivery: `Delivery on ${when} to ${b.address?.street}, ${b.address?.barangay}, for ${b.name}.`,
    }[b.type];
    $("[data-confirm-text]", confirmDialog).textContent = b.total ? `${text} Total ${peso(b.total)}.` : text;
    $("[data-confirm-ref]", confirmDialog).textContent = b.ref;
    openDialog(confirmDialog);
    celebrate($(".confirm-check", confirmDialog));
  };

  const showError = (message, field) => {
    errorEl.textContent = message;
    if (field === "date" || field === "time") fillTimes();
    const input = field && form.elements[field];
    if (input && input.focus) input.focus();
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    if (!auth.user()) {
      location.href = loginUrl();
      return;
    }
    if (bookType() !== "reserve" && order.count() === 0) {
      showError("Add at least one dish from the menu for pick-up or delivery.");
      return;
    }
    if (!db) {
      showError(NOT_READY);
      return;
    }

    const booking = Object.fromEntries(new FormData(form));
    booking.token = auth.token();
    booking.items = order.items();

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    try {
      const { data, error } = await db.rpc("create_booking", { booking });
      if (error) {
        const { message, field } = dbError(error);
        if (field === "auth") {
          auth.clear(); // the session ended; the form now asks them to log in again
          showError("Your session has ended — please log in again. Your order is saved.");
          return;
        }
        showError(message, field);
        return;
      }
      order.clear();
      form.reset();
      resetDate();
      applyType();
      showConfirm(data);
    } finally {
      submitBtn.disabled = false;
      setSubmitLabel();
    }
  });
})();
