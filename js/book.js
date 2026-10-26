/* Cravn' Go — Book & order page: reserve a table, pick up or delivery */
(() => {
  const { $, $$, peso, db, dbError, NOT_READY, order, toMinutes, toLabel, hoursFor, manilaNow, openDialog } = window.CG;
  const USERNAME_KEY = "cravngo-username"; // remembered after creating an account or booking

  // Keep these in sync with supabase/schema.sql
  const SLOT_MINUTES = 30; // times every 30 min; the last one is 30 min before closing
  const LEAD_MINUTES = 30; // the earliest same-day time is 30 min from now
  const MAX_DAYS_AHEAD = 60;

  const form = $("[data-booking-form]");
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
  const setSubmitLabel = () => (submitBtn.textContent = TYPE_COPY[bookType()].submit);

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
    setSubmitLabel();
  };

  const parseDate = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  const addDays = (iso, n) => {
    const d = parseDate(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const toHm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const whenText = (b) =>
    `${parseDate(b.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })} at ${toLabel(b.time)}`;

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

  const rememberedUsername = () => {
    try {
      return localStorage.getItem(USERNAME_KEY) || "";
    } catch {
      return "";
    }
  };

  for (let n = 1; n <= 20; n++) {
    form.elements.guests.add(new Option(n === 1 ? "1 guest" : `${n} guests`, n, n === 2, n === 2));
  }

  // book.html?type=pickup (from Checkout) or ?type=reserve (from "Book a table")
  const requested = new URLSearchParams(location.search).get("type");
  if (TYPE_COPY[requested]) form.elements.type.value = requested;

  form.elements.account.value = rememberedUsername();
  resetDate();
  applyType();
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
    summaryTotal.textContent = peso(order.total());
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
  };

  const showError = (message, field) => {
    errorEl.textContent = message;
    if (field === "account") {
      const link = document.createElement("a");
      link.href = "register.html";
      link.textContent = "Create an account";
      errorEl.append(" ", link);
    }
    if (field === "date" || field === "time") fillTimes();
    const input = field && form.elements[field];
    if (input && input.focus) input.focus();
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    if (bookType() !== "reserve" && order.count() === 0) {
      showError("Add at least one dish from the menu for pick-up or delivery.");
      return;
    }
    if (!db) {
      showError(NOT_READY);
      return;
    }

    const booking = Object.fromEntries(new FormData(form));
    booking.account = booking.account.trim();
    booking.items = order.items();

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    try {
      const { data, error } = await db.rpc("create_booking", { booking });
      if (error) {
        const { message, field } = dbError(error);
        showError(message, field);
        return;
      }
      try {
        localStorage.setItem(USERNAME_KEY, booking.account);
      } catch {
        /* not remembered — that's fine */
      }
      order.clear();
      form.reset();
      form.elements.account.value = booking.account;
      resetDate();
      applyType();
      showConfirm(data);
    } finally {
      submitBtn.disabled = false;
      setSubmitLabel();
    }
  });
})();
