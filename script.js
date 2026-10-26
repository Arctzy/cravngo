/* Cravn' Go — site interactions */
(() => {
  const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61595608813635";
  const CONTACT_EMAIL = "latjhoseah09@gmail.com";
  const STORAGE_KEY = "cravngo-order";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const peso = (n) => "₱" + n.toLocaleString("en-PH");

  /* ---------- Supabase (accounts, bookings, newsletter) ---------- */
  const CONFIG = window.CRAVNGO_CONFIG || {};
  const db =
    CONFIG.supabaseUrl && CONFIG.supabaseKey && window.supabase
      ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey)
      : null;
  if (!db) console.warn("Cravn’ Go: add your Supabase URL and key to config.js to turn on accounts, bookings and the newsletter.");
  const NOT_READY = "Online booking isn’t switched on yet — please call us at 0930 559 1153.";

  // Supabase error → { message, field }. Our database functions put the form field to fix in `hint`.
  const dbError = (error) => {
    if (error.code === "42501" || error.code === "28000" || /JWT/i.test(error.message)) {
      return { message: "Please sign in first.", field: "auth" };
    }
    if (/fetch|network/i.test(error.message)) {
      return { message: "We couldn’t reach the server. Check your connection and try again.", field: null };
    }
    return { message: error.message || "Something went wrong. Please try again.", field: error.hint || null };
  };

  /* ---------- Footer year ---------- */
  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

  /* ---------- Header: solid on scroll + mobile nav ---------- */
  const header = $("[data-header]");
  const nav = $("#site-nav");
  const navToggle = $("[data-nav-toggle]");

  const updateHeader = () => header.classList.toggle("is-solid", window.scrollY > 24);
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  const setNav = (open) => {
    nav.classList.toggle("is-open", open);
    header.classList.toggle("nav-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
  };
  navToggle.addEventListener("click", () => setNav(!nav.classList.contains("is-open")));
  $$("a", nav).forEach((a) => a.addEventListener("click", () => setNav(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      setNav(false);
      navToggle.focus();
    }
  });
  window.matchMedia("(min-width: 861px)").addEventListener("change", () => setNav(false));

  /* ---------- Active nav link ---------- */
  const navLinks = $$("a[href^='#']", nav);
  if ("IntersectionObserver" in window) {
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = "#" + entry.target.id;
          navLinks.forEach((a) => {
            if (a.getAttribute("href") === id) a.setAttribute("aria-current", "true");
            else a.removeAttribute("aria-current");
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    ["#top", "#about", "#menu", "#book", "#gallery", "#visit"].forEach((id) => {
      const el = $(id);
      if (el) spy.observe(el);
    });
  }

  /* ---------- Reveal on scroll ---------- */
  const reveals = $$(".reveal");
  reveals.forEach((el) => {
    const siblings = $$(":scope > .reveal", el.parentElement);
    const i = siblings.indexOf(el);
    if (siblings.length > 1) el.style.transitionDelay = `${(i % 3) * 90}ms`;
  });
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }

  /* ---------- Toast ---------- */
  const toast = $("[data-toast]");
  let toastTimer;
  const showToast = (msg) => {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  };

  /* ---------- Dialog helpers ---------- */
  const openDialog = (dlg) => {
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  };
  const closeDialog = (dlg) => {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
  };
  $$("dialog").forEach((dlg) => {
    $$("[data-close]", dlg).forEach((btn) => btn.addEventListener("click", () => closeDialog(dlg)));
  });

  /* ---------- Order (cart) ---------- */
  const menu = new Map(
    $$("[data-item]").map((el) => [
      el.dataset.id,
      {
        name: el.dataset.name,
        price: Number(el.dataset.price),
        img: $("img", el).getAttribute("src"),
      },
    ])
  );

  const load = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return Object.fromEntries(Object.entries(saved).filter(([id, q]) => menu.has(id) && q > 0));
    } catch {
      return {};
    }
  };
  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    } catch {
      /* storage unavailable — order still works for this visit */
    }
  };

  let order = load();

  const drawer = $("[data-drawer]");
  const linesEl = $("[data-order-lines]");
  const emptyEl = $("[data-order-empty]");
  const footEl = $("[data-order-foot]");
  const totalEl = $("[data-order-total]");
  const countEl = $("[data-order-count]");
  const toggleBtn = $(".order-toggle");
  const summaryLines = $("[data-summary-lines]");
  const summaryEmpty = $("[data-summary-empty]");
  const summaryTotal = $("[data-summary-total]");

  const itemCount = () => Object.values(order).reduce((a, b) => a + b, 0);
  const orderTotal = () => Object.entries(order).reduce((sum, [id, q]) => sum + menu.get(id).price * q, 0);

  // One line in the order drawer or booking summary, with − / + controls
  const orderLine = (id, qty) => {
    const item = menu.get(id);
    const li = document.createElement("li");
    li.className = "order-line";
    li.innerHTML = `
      <img src="${item.img}" alt="">
      <div>
        <div class="order-line-name"></div>
        <div class="order-line-price">${peso(item.price)} each</div>
        <div class="stepper">
          <button type="button" data-step="-1" aria-label="Remove one ${item.name}">−</button>
          <output aria-live="polite">${qty}</output>
          <button type="button" data-step="1" aria-label="Add one ${item.name}">+</button>
        </div>
      </div>
      <div class="order-line-sub">${peso(item.price * qty)}</div>`;
    $(".order-line-name", li).textContent = item.name;
    $$("[data-step]", li).forEach((btn) =>
      btn.addEventListener("click", () => setQty(id, (order[id] || 0) + Number(btn.dataset.step)))
    );
    return li;
  };

  const render = () => {
    const count = itemCount();
    countEl.textContent = count;
    countEl.hidden = count === 0;
    toggleBtn.setAttribute("aria-label", `Your order, ${count} item${count === 1 ? "" : "s"}`);

    linesEl.innerHTML = "";
    summaryLines.innerHTML = "";
    Object.entries(order).forEach(([id, qty]) => {
      linesEl.appendChild(orderLine(id, qty));
      summaryLines.appendChild(orderLine(id, qty));
    });

    emptyEl.hidden = count > 0;
    footEl.hidden = count === 0;
    summaryEmpty.hidden = count > 0;
    totalEl.textContent = summaryTotal.textContent = peso(orderTotal());
  };

  const setQty = (id, qty) => {
    if (qty <= 0) delete order[id];
    else order[id] = Math.min(qty, 99);
    save();
    render();
    // Keep focus inside the drawer when a line disappears
    if (!order[id] && drawer.open) (linesEl.querySelector("[data-step]") || drawer.querySelector("[data-close]")).focus();
  };

  $$("[data-add]").forEach((btn) => {
    const card = btn.closest("[data-item]");
    btn.addEventListener("click", () => {
      const id = card.dataset.id;
      setQty(id, (order[id] || 0) + 1);
      showToast(`${card.dataset.name} added · ${itemCount()} in your order`);

      countEl.classList.remove("bump");
      void countEl.offsetWidth;
      countEl.classList.add("bump");

      btn.classList.add("added");
      btn.firstChild.textContent = "Added";
      clearTimeout(btn._t);
      btn._t = setTimeout(() => {
        btn.classList.remove("added");
        btn.firstChild.textContent = "Add";
      }, 1400);
    });
  });

  $$("[data-open-order]").forEach((btn) =>
    btn.addEventListener("click", () => {
      // From the CTA band with nothing picked yet, the menu is the better destination
      if (btn.dataset.openOrder === "menu-if-empty" && itemCount() === 0) {
        $("#menu").scrollIntoView({ behavior: "smooth" });
        return;
      }
      setNav(false);
      openDialog(drawer);
    })
  );

  drawer.addEventListener("click", (e) => {
    if (e.target === drawer) closeDialog(drawer);
  });

  $("[data-clear-order]").addEventListener("click", () => {
    order = {};
    save();
    render();
    showToast("Order cleared");
  });

  const orderText = () => {
    const lines = Object.entries(order).map(([id, q]) => {
      const item = menu.get(id);
      return `• ${q} × ${item.name} — ${peso(item.price * q)}`;
    });
    return [
      "Hi Cravn’ Go! I’d like to order:",
      ...lines,
      `Total: ${peso(orderTotal())}`,
      "",
      "Name: ",
      "Pickup or delivery: ",
    ].join("\n");
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      drawer.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  };

  $("[data-send-order]").addEventListener("click", async () => {
    const copied = await copyText(orderText());
    showToast(copied ? "Order copied — paste it in a message to us" : "Couldn’t copy automatically — please type your order in Messenger");
    window.open(FACEBOOK_URL, "_blank", "noopener");
  });

  render();

  /* ---------- Opening hours: highlight today + open/closed badge ---------- */
  const hoursRows = $$("[data-hours] tr");
  const toMinutes = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  const toLabel = (hm) => {
    const [h, m] = hm.split(":").map(Number);
    return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`;
  };
  const rowFor = (d) => hoursRows.find((r) => r.dataset.days.split(" ").map(Number).includes(d));

  // Today's date and time in the Philippines, wherever the visitor is
  const manilaNow = () => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
      weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23",
    }).formatToParts(new Date());
    const part = (type) => parts.find((p) => p.type === type).value;
    return {
      date: `${part("year")}-${part("month")}-${part("day")}`,
      day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(part("weekday")),
      minutes: Number(part("hour")) * 60 + Number(part("minute")),
    };
  };

  const statusEl = $("[data-open-status]");
  if (hoursRows.length && statusEl) {
    const { day, minutes: now } = manilaNow();
    const today = rowFor(day);
    const tomorrow = rowFor((day + 1) % 7);
    if (today) today.classList.add("is-today");

    let text = "Closed today";
    let open = false;
    if (today && now >= toMinutes(today.dataset.open) && now < toMinutes(today.dataset.close)) {
      open = true;
      text = `Open now · until ${toLabel(today.dataset.close)}`;
    } else if (today && now < toMinutes(today.dataset.open)) {
      text = `Closed · opens at ${toLabel(today.dataset.open)}`;
    } else if (tomorrow) {
      text = `Closed · opens tomorrow at ${toLabel(tomorrow.dataset.open)}`;
    }
    statusEl.textContent = text;
    statusEl.classList.add(open ? "is-open" : "is-closed");
    statusEl.hidden = false;
  }

  /* ---------- Contact form → visitor's email app ---------- */
  const contactForm = $("[data-contact-form]");
  if (contactForm) {
    contactForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(contactForm);
      const name = data.get("name").trim();
      const subject = `Website message from ${name}`;
      const body = `${data.get("message").trim()}\n\n— ${name}\n${data.get("email").trim()}`;
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      showToast("Opening your email app…");
    });
  }

  const firstName = (name) => String(name).trim().split(/\s+/)[0];

  // Disable a button with a "working…" label while an async task runs
  const withBusy = async (button, busyText, task) => {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
    try {
      return await task();
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  };

  /* ---------- Newsletter → Supabase "subscribe" function ---------- */
  const subscribeForm = $("[data-subscribe-form]");
  const subscribeStatus = $("[data-subscribe-status]");
  const setSubscribeStatus = (message, ok) => {
    subscribeStatus.textContent = message;
    subscribeStatus.classList.toggle("is-error", !ok);
  };

  subscribeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(subscribeForm);
    // Honeypot: only bots fill in the hidden "website" field
    if (String(data.get("website") || "").trim()) {
      subscribeForm.reset();
      setSubscribeStatus("Grazie! You’re on the list.", true);
      return;
    }
    if (!db) {
      setSubscribeStatus("Sign-ups open soon — follow us on Facebook in the meantime.", false);
      return;
    }
    withBusy($("button[type=submit]", subscribeForm), "Subscribing…", async () => {
      setSubscribeStatus("", true);
      const { data: result, error } = await db.rpc("subscribe", { p_name: data.get("name"), p_email: data.get("email") });
      if (error) return setSubscribeStatus(dbError(error).message, false);
      subscribeForm.reset();
      setSubscribeStatus(
        result === "already"
          ? "You’re already on the list — grazie!"
          : `Grazie, ${firstName(data.get("name"))}! You’re on the list.`,
        true
      );
    });
  });

  /* ---------- Booking form: reserve, pick up or delivery ---------- */
  // Keep these in sync with supabase/schema.sql
  const SLOT_MINUTES = 30; // times every 30 min; the last one is 30 min before closing
  const LEAD_MINUTES = 30; // the earliest same-day time is 30 min from now
  const MAX_DAYS_AHEAD = 60;

  const bookForm = $("[data-booking-form]");
  const dateInput = $("[data-book-date]");
  const timeSelect = $("[data-book-time]");
  const bookSubmit = $("[data-book-submit]");
  const bookError = $("[data-book-error]");
  const authNote = $("[data-auth-note]");

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
  const TYPE_LABEL = { reserve: "Table reservation", pickup: "Pick-up", delivery: "Delivery" };

  const bookType = () => bookForm.elements.type.value;
  const setSubmitLabel = () => (bookSubmit.textContent = TYPE_COPY[bookType()].submit);

  // Show only the fields for the chosen type. Hidden groups are disabled, so they aren't required or sent.
  const applyType = () => {
    const type = bookType();
    const copy = TYPE_COPY[type];
    $$("[data-for]", bookForm).forEach((group) => {
      const on = group.dataset.for.split(" ").includes(type);
      group.hidden = !on;
      group.disabled = !on;
    });
    $("[data-when-legend]", bookForm).textContent = copy.when;
    $("[data-time-label]", bookForm).textContent = copy.time;
    $("[data-summary-title]", bookForm).textContent = copy.summary;
    $("[data-summary-hint]", bookForm).textContent = copy.hint;
    bookError.textContent = "";
    setSubmitLabel();
  };

  const isPhMobile = (value) => /^(?:\+?63|0)?9\d{9}$/.test(String(value).replace(/[\s-]/g, ""));
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
    const row = date && rowFor(parseDate(date).getUTCDay());
    const earliest = date === now.date ? now.minutes + LEAD_MINUTES + 1 : 0;
    const slots = [];
    if (row) {
      for (let t = toMinutes(row.dataset.open); t <= toMinutes(row.dataset.close) - SLOT_MINUTES; t += SLOT_MINUTES) {
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

  for (let n = 1; n <= 20; n++) {
    bookForm.elements.guests.add(new Option(n === 1 ? "1 guest" : `${n} guests`, n, n === 2, n === 2));
  }
  resetDate();
  applyType();
  dateInput.addEventListener("change", fillTimes);
  bookForm.addEventListener("change", (e) => {
    if (e.target.name === "type") applyType();
  });

  // "Book a table" links pre-select the matching option
  $$("[data-book-type]").forEach((link) =>
    link.addEventListener("click", () => {
      bookForm.elements.type.value = link.dataset.bookType;
      applyType();
    })
  );

  // Checkout from the order drawer → the booking form, with the food already in it
  $("[data-checkout]").addEventListener("click", () => {
    closeDialog(drawer);
    if (bookType() === "reserve") {
      bookForm.elements.type.value = "pickup";
      applyType();
    }
    $("#book").scrollIntoView({ behavior: "smooth" });
  });

  /* ---------- Accounts (Supabase Auth) ---------- */
  const authDialog = $("[data-auth-dialog]");
  const accountDialog = $("[data-account-dialog]");
  const confirmDialog = $("[data-confirm-dialog]");
  const accountToggle = $("[data-account-toggle]");
  const authReason = $("[data-auth-reason]");
  const authForms = { login: $('[data-auth-form="login"]'), register: $('[data-auth-form="register"]') };
  let currentUser = null;
  let afterSignIn = null; // e.g. finish the booking someone started before signing in

  const AUTH_MESSAGES = [
    [/invalid login credentials/i, "That email and password don’t match."],
    [/already registered|already been registered|already exists/i, "An account with that email already exists. Try signing in."],
    [/email not confirmed/i, "Please confirm your email first — check your inbox for the link we sent."],
    [/rate limit|too many/i, "Too many attempts. Please wait a minute and try again."],
    [/fetch|network/i, "We couldn’t reach the server. Check your connection and try again."],
  ];
  const authMessage = (error) =>
    AUTH_MESSAGES.find(([pattern]) => pattern.test(error.message))?.[1] || error.message || "Something went wrong. Please try again.";

  const profileOf = (user) => ({
    name: user.user_metadata?.name || user.email.split("@")[0],
    phone: user.user_metadata?.phone || "",
    email: user.email,
  });

  const setUser = (user) => {
    currentUser = user;
    const profile = user && profileOf(user);
    $("[data-account-label]").textContent = profile ? firstName(profile.name) : "Sign in";
    accountToggle.setAttribute("aria-label", profile ? `My account (${profile.name})` : "Sign in or create an account");
    accountToggle.classList.toggle("is-signed-in", !!user);
    authNote.hidden = !!user;
    if (profile) {
      if (!bookForm.elements.name.value) bookForm.elements.name.value = profile.name;
      if (!bookForm.elements.phone.value) bookForm.elements.phone.value = profile.phone;
    }
  };

  if (db) {
    db.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    db.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
  }

  const setAuthMode = (mode) => {
    $$("[data-auth-mode]", authDialog).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.authMode === mode)));
    Object.entries(authForms).forEach(([m, form]) => (form.hidden = m !== mode));
    $("[data-auth-title]", authDialog).textContent = mode === "login" ? "Welcome back" : "Create your account";
  };
  $$("[data-auth-mode]", authDialog).forEach((b) =>
    b.addEventListener("click", () => {
      const mode = b.dataset.authMode;
      setAuthMode(mode);
      $("[data-form-error]", authForms[mode]).textContent = "";
      $("input", authForms[mode]).focus();
    })
  );

  const openAuth = (reason = "", mode = "login") => {
    if (!db) return showToast(NOT_READY);
    authReason.textContent = reason;
    authReason.hidden = !reason;
    Object.values(authForms).forEach((form) => ($("[data-form-error]", form).textContent = ""));
    setAuthMode(mode);
    setNav(false);
    openDialog(authDialog);
    $("input", authForms[mode]).focus();
  };
  authDialog.addEventListener("close", () => {
    if (!currentUser) afterSignIn = null;
  });

  const showFormError = (form, message, field) => {
    $("[data-form-error]", form).textContent = message;
    const input = field && form.elements[field];
    if (input && input.focus) input.focus();
  };

  const signedIn = (user, greeting) => {
    setUser(user);
    closeDialog(authDialog);
    Object.values(authForms).forEach((form) => form.reset());
    showToast(`${greeting}, ${firstName(profileOf(user).name)}!`);
    const next = afterSignIn;
    afterSignIn = null;
    if (next) next();
  };

  authForms.login.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = authForms.login;
    const data = new FormData(form);
    withBusy($("[type=submit]", form), "Signing in…", async () => {
      const { data: result, error } = await db.auth.signInWithPassword({
        email: String(data.get("email")).trim(),
        password: String(data.get("password")),
      });
      if (error) return showFormError(form, authMessage(error), "password");
      signedIn(result.user, "Welcome back");
    });
  });

  authForms.register.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = authForms.register;
    const data = new FormData(form);
    const email = String(data.get("email")).trim();
    const name = String(data.get("name")).trim().replace(/\s+/g, " ");
    const phone = String(data.get("phone")).trim();
    if (!isPhMobile(phone)) return showFormError(form, "Please enter a valid mobile number, e.g. 0917 123 4567.", "phone");
    withBusy($("[type=submit]", form), "Creating account…", async () => {
      const { data: result, error } = await db.auth.signUp({
        email,
        password: String(data.get("password")),
        options: { data: { name, phone }, emailRedirectTo: location.origin + location.pathname },
      });
      if (error) return showFormError(form, authMessage(error), /password/i.test(error.message) ? "password" : "email");
      if (result.session) return signedIn(result.user, "Welcome to Cravn’ Go");
      // "Confirm email" is on in Supabase: the customer has to click the emailed link first
      form.reset();
      setAuthMode("login");
      authForms.login.elements.email.value = email;
      authReason.textContent = `Almost there! We sent a confirmation link to ${email}. Click it, then sign in here.`;
      authReason.hidden = false;
    });
  });

  accountToggle.addEventListener("click", () => (currentUser ? openAccount() : openAuth()));
  $$("[data-open-auth]").forEach((b) => b.addEventListener("click", () => openAuth()));

  /* ---------- My account: bookings ---------- */
  const bookingList = $("[data-booking-list]");
  const bookingsStatus = $("[data-bookings-status]");

  const bookingDetail = (b) => {
    const parts = [];
    if (b.type === "reserve") parts.push(`Table for ${b.guests}${b.occasion ? ` · ${b.occasion}` : ""}`);
    if (b.type === "delivery" && b.address) parts.push(`${b.address.street}, ${b.address.barangay}, ${b.address.city}`);
    if (b.items.length) parts.push(b.items.map((i) => `${i.qty} × ${i.name}`).join(", "));
    return parts.join(" · ");
  };

  const bookingItem = (b) => {
    const li = document.createElement("li");
    li.className = "booking";
    li.innerHTML = `
      <div class="booking-top"><span class="booking-type"></span><span class="status"></span></div>
      <p class="booking-when"></p>
      <p class="booking-detail"></p>
      <div class="booking-foot"><span class="booking-ref"></span><strong class="booking-total"></strong></div>`;
    $(".booking-type", li).textContent = TYPE_LABEL[b.type] || b.type;
    $(".status", li).textContent = b.status;
    $(".status", li).classList.add(`status-${b.status}`);
    $(".booking-when", li).textContent = whenText(b);
    $(".booking-detail", li).textContent = bookingDetail(b);
    $(".booking-ref", li).textContent = b.ref;
    $(".booking-total", li).textContent = b.total ? peso(b.total) : "";
    if (b.status === "pending" && b.upcoming) {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "link-btn";
      cancel.textContent = "Cancel";
      cancel.setAttribute("aria-label", `Cancel booking ${b.ref}`);
      cancel.addEventListener("click", () => cancelBooking(b, li));
      $(".booking-foot", li).insertBefore(cancel, $(".booking-total", li));
    }
    return li;
  };

  const loadBookings = async () => {
    bookingList.innerHTML = "";
    bookingsStatus.hidden = false;
    bookingsStatus.textContent = "Loading your bookings…";
    const { data, error } = await db.rpc("my_bookings");
    if (error) {
      bookingsStatus.textContent = dbError(error).message;
      return;
    }
    bookingsStatus.textContent = "No bookings yet — reserve a table or order ahead anytime.";
    bookingsStatus.hidden = data.length > 0;
    data.forEach((b) => bookingList.appendChild(bookingItem(b)));
  };

  const openAccount = () => {
    const profile = profileOf(currentUser);
    $("[data-account-name]", accountDialog).textContent = `Hi, ${firstName(profile.name)}!`;
    $("[data-account-contact]", accountDialog).textContent = [profile.email, profile.phone].filter(Boolean).join(" · ");
    setNav(false);
    openDialog(accountDialog);
    loadBookings();
  };

  const cancelBooking = async (b, li) => {
    if (!window.confirm(`Cancel booking ${b.ref} on ${whenText(b)}?`)) return;
    const { data, error } = await db.rpc("cancel_booking", { p_id: b.id });
    if (error) return showToast(dbError(error).message);
    li.replaceWith(bookingItem(data));
    showToast(`Booking ${b.ref} cancelled`);
  };

  $("[data-sign-out]", accountDialog).addEventListener("click", async () => {
    await db.auth.signOut();
    setUser(null);
    closeDialog(accountDialog);
    showToast("You’re signed out");
  });
  $("[data-open-account]", confirmDialog).addEventListener("click", () => {
    closeDialog(confirmDialog);
    openAccount();
  });
  [authDialog, accountDialog, confirmDialog].forEach((dlg) =>
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) closeDialog(dlg);
    })
  );

  /* ---------- Submit a booking ---------- */
  const showConfirm = (b) => {
    const when = whenText(b);
    const text = {
      reserve: `Table for ${b.guests} on ${when}.`,
      pickup: `Pick-up on ${when}.`,
      delivery: `Delivery on ${when} to ${b.address?.street}, ${b.address?.barangay}.`,
    }[b.type];
    $("[data-confirm-text]", confirmDialog).textContent = b.total ? `${text} Total ${peso(b.total)}.` : text;
    $("[data-confirm-ref]", confirmDialog).textContent = b.ref;
    openDialog(confirmDialog);
  };

  bookForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    bookError.textContent = "";
    if (bookType() !== "reserve" && itemCount() === 0) {
      bookError.textContent = "Add at least one dish from the menu for pick-up or delivery.";
      return;
    }
    if (!isPhMobile(bookForm.elements.phone.value)) {
      bookError.textContent = "Please enter a valid mobile number, e.g. 0917 123 4567.";
      bookForm.elements.phone.focus();
      return;
    }
    if (!db) {
      bookError.textContent = NOT_READY;
      return;
    }
    if (!currentUser) {
      afterSignIn = () => bookForm.requestSubmit();
      openAuth("Sign in or create an account to finish your booking — it only takes a minute.");
      return;
    }

    const booking = Object.fromEntries(new FormData(bookForm));
    booking.items = Object.entries(order).map(([id, qty]) => ({ id, qty }));

    bookSubmit.disabled = true;
    bookSubmit.textContent = "Sending…";
    try {
      const { data, error } = await db.rpc("create_booking", { booking });
      if (error) {
        const { message, field } = dbError(error);
        if (field === "auth") {
          afterSignIn = () => bookForm.requestSubmit();
          openAuth("Please sign in again to finish your booking.");
          return;
        }
        bookError.textContent = message;
        if (field === "date" || field === "time") fillTimes();
        const input = field && bookForm.elements[field];
        if (input && input.focus) input.focus();
        return;
      }
      order = {};
      save();
      render();
      bookForm.reset();
      resetDate();
      applyType();
      setUser(currentUser); // refill name + phone from the account
      showConfirm(data);
    } finally {
      bookSubmit.disabled = false;
      setSubmitLabel();
    }
  });

  /* ---------- Gallery lightbox ---------- */
  const lb = $("[data-lightbox-dialog]");
  const lbImg = $("[data-lightbox-img]");
  const lbCap = $("[data-lightbox-cap]");
  const tiles = $$("[data-lightbox]");
  let lbIndex = 0;

  const showTile = (i) => {
    lbIndex = (i + tiles.length) % tiles.length;
    const img = $("img", tiles[lbIndex]);
    lbImg.src = img.getAttribute("src");
    lbImg.alt = img.alt;
    lbCap.textContent = img.alt;
  };

  tiles.forEach((tile, i) =>
    tile.addEventListener("click", () => {
      showTile(i);
      openDialog(lb);
    })
  );
  $("[data-lb-prev]").addEventListener("click", () => showTile(lbIndex - 1));
  $("[data-lb-next]").addEventListener("click", () => showTile(lbIndex + 1));
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") showTile(lbIndex - 1);
    if (e.key === "ArrowRight") showTile(lbIndex + 1);
  });
  lb.addEventListener("click", (e) => {
    if (e.target === lb || e.target.tagName === "FIGURE") closeDialog(lb);
  });
  lb.addEventListener("close", () => tiles[lbIndex].focus());
})();
