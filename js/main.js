/*
 * Cravn' Go — shared code for every page: header (with the logged-in account menu),
 * scroll effects, the order drawer, the newsletter form and small helpers.
 * Page scripts (menu.js, book.js, login.js, …) use the helpers through window.CG.
 */
(() => {
  const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61595608813635";
  const ORDER_KEY = "cravngo-order";
  const SESSION_KEY = "cravngo-session";
  const FLASH_KEY = "cravngo-flash";
  const DATA = window.CRAVNGO_DATA;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const peso = (n) => "₱" + n.toLocaleString("en-PH");
  const firstName = (name) => String(name).trim().split(/\s+/)[0];
  const initials = (name) =>
    String(name).trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  // PH mobile number: exactly 11 digits, starting with 09 (e.g. 09171234567)
  const isPhMobile = (value) => /^09\d{9}$/.test(String(value).trim());
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const page = location.pathname.split("/").pop() || "index.html";

  // Only follow ?next= to our own pages, e.g. "book.html?type=pickup"
  const safeNext = (value) => (/^[a-z]+\.html(\?[\w=&%-]*)?$/i.test(value || "") ? value : null);

  /* ---------- Database: our functions in supabase/schema.sql, via Supabase's REST API ---------- */
  const CONFIG = window.CRAVNGO_CONFIG || {};
  // Accept the "API URL" too (…supabase.co/rest/v1/) — we need just the project URL
  const API_URL = String(CONFIG.supabaseUrl || "").trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  const API_KEY = String(CONFIG.supabaseKey || "").trim();

  // Call a database function → { data, error }
  const rpc = async (fn, args = {}) => {
    const headers = { apikey: API_KEY, "Content-Type": "application/json" };
    if (API_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${API_KEY}`; // legacy "anon" keys
    try {
      const res = await fetch(`${API_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args) });
      const body = res.status === 204 ? null : await res.json().catch(() => null);
      if (!res.ok) return { data: null, error: body || { message: `Request failed (${res.status})` } };
      return { data: body, error: null };
    } catch {
      return { data: null, error: { message: "network" } };
    }
  };
  const db = API_URL && API_KEY ? { rpc } : null;
  if (!db) console.warn("Cravn’ Go: add your Supabase URL and key to js/config.js to turn on accounts, bookings and the newsletter.");
  const NOT_READY = "Online accounts and bookings aren’t switched on yet — please call us at 0930 559 1153.";

  // Database error → { message, field }. Our functions put the form field to fix in `hint`.
  const dbError = (error) => {
    if (/fetch|network/i.test(error.message || "")) {
      return { message: "We couldn’t reach the server. Check your connection and try again.", field: null };
    }
    return { message: error.message || "Something went wrong. Please try again.", field: error.hint || null };
  };

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
  window.matchMedia("(min-width: 861px)").addEventListener("change", () => setNav(false));

  /* ---------- Toast + messages carried to the next page ---------- */
  const toast = $("[data-toast]");
  let toastTimer;
  const showToast = (msg) => {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
  };
  const flash = (msg) => {
    try {
      sessionStorage.setItem(FLASH_KEY, msg);
    } catch {
      /* no storage — the message is skipped */
    }
  };
  try {
    const pending = sessionStorage.getItem(FLASH_KEY);
    if (pending) {
      sessionStorage.removeItem(FLASH_KEY);
      setTimeout(() => showToast(pending), 400);
    }
  } catch {
    /* no storage */
  }

  /* ---------- Log-in session (token kept in this browser) ---------- */
  const readSession = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return saved && saved.token && saved.user ? saved : null;
    } catch {
      return null;
    }
  };
  let session = readSession();
  const authListeners = [];

  const setSession = (next) => {
    session = next;
    try {
      if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* no storage — logged in for this page only */
    }
    document.documentElement.classList.toggle("signed-in", !!next);
    renderAccount();
    authListeners.forEach((fn) => fn(next ? next.user : null));
  };

  const logOut = async () => {
    const token = session && session.token;
    setSession(null);
    if (db && token) await rpc("log_out", { p_token: token });
  };

  /* ---------- Header account area: "Log in", or the customer's name + menu ---------- */
  const accountSlot = $("[data-account-slot]");
  const USER_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';

  const closeAccountMenu = () => {
    const button = $("[data-account-button]", accountSlot);
    if (!button || button.getAttribute("aria-expanded") !== "true") return false;
    button.setAttribute("aria-expanded", "false");
    $(".account-dropdown", accountSlot).hidden = true;
    return true;
  };

  function renderAccount() {
    const user = session && session.user;
    if (!user) {
      const onAuthPage = page === "login.html" || page === "register.html";
      const href = onAuthPage ? "login.html" : `login.html?next=${encodeURIComponent(page + location.search)}`;
      accountSlot.innerHTML = `<a class="account-toggle" href="${href}" aria-label="Log in"${onAuthPage ? ' aria-current="page"' : ""}>${USER_ICON}<span class="account-toggle-label">Log in</span></a>`;
    } else {
      accountSlot.innerHTML = `
        <div class="account-menu">
          <button class="account-toggle is-user" type="button" aria-expanded="false" aria-controls="account-dropdown" data-account-button>
            <span class="avatar" aria-hidden="true"></span>
            <span class="account-toggle-label"></span>
            <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div class="account-dropdown" id="account-dropdown" hidden>
            <div class="account-dropdown-head"><strong></strong><span></span></div>
            <a href="account.html">My bookings</a>
            <a href="book.html">New booking</a>
            <button type="button" data-log-out>Log out</button>
          </div>
        </div>`;
      const button = $("[data-account-button]", accountSlot);
      const dropdown = $(".account-dropdown", accountSlot);
      $(".avatar", button).textContent = initials(user.full_name);
      $(".account-toggle-label", button).textContent = firstName(user.full_name);
      button.setAttribute("aria-label", `Account menu for ${user.full_name}`);
      $(".account-dropdown-head strong", dropdown).textContent = user.full_name;
      $(".account-dropdown-head span", dropdown).textContent = `@${user.username}`;

      button.addEventListener("click", () => {
        const open = dropdown.hidden;
        button.setAttribute("aria-expanded", String(open));
        dropdown.hidden = !open;
      });
      $("[data-log-out]", dropdown).addEventListener("click", async () => {
        await logOut();
        flash("You’re logged out. See you soon!");
        location.href = page === "account.html" ? "index.html" : location.href;
      });
    }
    accountSlot.classList.add("is-ready");
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".account-menu")) closeAccountMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (closeAccountMenu()) $("[data-account-button]", accountSlot).focus();
    else if (nav.classList.contains("is-open")) {
      setNav(false);
      navToggle.focus();
    }
  });

  renderAccount();

  // The saved session shows the name instantly; check it's still valid (it may have expired)
  if (session && db) {
    rpc("current_customer", { p_token: session.token }).then(({ data, error }) => {
      if (error) return; // offline — keep the saved session for now
      if (!data) setSession(null);
      else if (JSON.stringify(data) !== JSON.stringify(session.user)) setSession({ token: session.token, user: data });
    });
  }

  /* ---------- Mobile number fields: exactly 11 digits (09XXXXXXXXX) ---------- */
  // Letters, spaces and a 12th digit are ignored; a pasted "+63 917 123 4567" becomes "09171234567"
  const toPhMobile = (value) => {
    let digits = String(value).replace(/\D/g, "");
    if (digits.startsWith("63")) digits = "0" + digits.slice(2);
    else if (digits.startsWith("9")) digits = "0" + digits;
    return digits.slice(0, 11);
  };
  $$("[data-phone]").forEach((input) => {
    const check = () =>
      input.setCustomValidity(!input.value || isPhMobile(input.value) ? "" : "Enter your 11-digit mobile number, e.g. 09171234567.");
    input.addEventListener("input", () => {
      const clean = toPhMobile(input.value);
      if (clean !== input.value) input.value = clean;
      check();
    });
    check();
  });

  /* ---------- Show / hide password ---------- */
  $$("[data-toggle-password]").forEach((btn) => {
    const input = $("input", btn.parentElement);
    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      input.focus();
    });
  });

  /* ---------- Reveal on scroll ---------- */
  const io =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              const el = entry.target;
              el.classList.add("in");
              io.unobserve(el);
              // Drop the stagger once revealed so hover effects respond instantly
              setTimeout(() => el.style.removeProperty("--reveal-delay"), 2200);
            });
          },
          { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
        )
      : null;

  // Also used by page scripts for content they add later (e.g. menu cards)
  const observe = (elements) => {
    elements.forEach((el) => {
      const siblings = $$(":scope > .reveal", el.parentElement);
      if (siblings.length > 1) el.style.setProperty("--reveal-delay", `${(siblings.indexOf(el) % 3) * 90}ms`);
      if (io) io.observe(el);
      else el.classList.add("in");
    });
  };
  observe($$(".reveal"));

  /* ---------- Dialogs ---------- */
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
    // Click on the dimmed backdrop closes it
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) closeDialog(dlg);
    });
  });

  /* ---------- Little celebrations ---------- */
  // A burst of Italian-flag confetti from inside an element (it needs position: relative)
  const celebrate = (anchor) => {
    if (reduceMotion.matches || !anchor || !anchor.animate) return;
    const colors = ["#2f8a4a", "#fffaf1", "#c8372d", "#f1d7a8"];
    for (let i = 0; i < 26; i++) {
      const bit = document.createElement("span");
      bit.className = "confetti";
      bit.style.background = colors[i % colors.length];
      anchor.appendChild(bit);
      const angle = (i / 26) * Math.PI * 2 + Math.random() * 0.4;
      const distance = 60 + Math.random() * 70;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      bit
        .animate(
          [
            { transform: "translate(-50%, -50%) rotate(0deg) scale(1)", opacity: 1 },
            { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y + 40}px)) rotate(${200 + Math.random() * 400}deg) scale(0.6)`, opacity: 0 },
          ],
          { duration: 900 + Math.random() * 500, delay: 250, easing: "cubic-bezier(0.15, 0.7, 0.35, 1)", fill: "backwards" }
        )
        .finished.catch(() => {})
        .finally(() => bit.remove());
    }
  };

  /* ---------- Order (cart), kept in this browser across pages ---------- */
  const menu = new Map(DATA.menu.map((dish) => [dish.id, dish]));

  const load = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || "{}");
      return Object.fromEntries(Object.entries(saved).filter(([id, q]) => menu.has(id) && q > 0));
    } catch {
      return {};
    }
  };
  const save = () => {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(order));
    } catch {
      /* storage unavailable — the order still works on this page */
    }
  };

  let order = load();
  const listeners = [];

  const drawer = $("[data-drawer]");
  const linesEl = $("[data-order-lines]");
  const emptyEl = $("[data-order-empty]");
  const footEl = $("[data-order-foot]");
  const totalEl = $("[data-order-total]");
  const countEl = $("[data-order-count]");
  const toggleBtn = $(".order-toggle");

  const itemCount = () => Object.values(order).reduce((a, b) => a + b, 0);
  const orderTotal = () => Object.entries(order).reduce((sum, [id, q]) => sum + menu.get(id).price * q, 0);

  // One line in the order drawer or booking summary, with − / + controls
  const orderLine = (id, qty) => {
    const item = menu.get(id);
    const li = document.createElement("li");
    li.className = "order-line";
    li.innerHTML = `
      <img src="${item.image}" alt="">
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
    Object.entries(order).forEach(([id, qty]) => linesEl.appendChild(orderLine(id, qty)));
    emptyEl.hidden = count > 0;
    footEl.hidden = count === 0;
    totalEl.textContent = peso(orderTotal());
    listeners.forEach((fn) => fn());
  };

  const setQty = (id, qty) => {
    if (qty <= 0) delete order[id];
    else order[id] = Math.min(qty, 50);
    save();
    render();
    // Keep focus inside the drawer when a line disappears
    if (!order[id] && drawer.open) (linesEl.querySelector("[data-step]") || drawer.querySelector("[data-close]")).focus();
  };

  const bumpCount = () => {
    countEl.classList.remove("bump");
    void countEl.offsetWidth;
    countEl.classList.add("bump");
  };

  // The dish photo flies into the order bag in the header
  const flyToCart = (fromImg) => {
    if (reduceMotion.matches || !fromImg || !fromImg.animate) return Promise.resolve();
    const from = fromImg.getBoundingClientRect();
    const to = toggleBtn.getBoundingClientRect();
    if (!from.width || !to.width) return Promise.resolve();
    const size = Math.min(from.width, from.height, 140);
    const ghost = document.createElement("img");
    ghost.src = fromImg.currentSrc || fromImg.src;
    ghost.alt = "";
    ghost.className = "fly-img";
    ghost.style.cssText = `left:${from.left + from.width / 2 - size / 2}px;top:${from.top + from.height / 2 - size / 2}px;width:${size}px;height:${size}px`;
    document.body.appendChild(ghost);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    return ghost
      .animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 90}px) scale(0.55)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.12)`, opacity: 0.35 },
        ],
        { duration: 800, easing: "cubic-bezier(0.5, 0, 0.3, 1)" }
      )
      .finished.catch(() => {})
      .finally(() => ghost.remove());
  };

  // "Add" buttons — menu cards are added by menu.js, so listen on the whole page
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add]");
    if (!btn) return;
    const id = btn.dataset.add;
    setQty(id, (order[id] || 0) + 1);
    showToast(`${menu.get(id).name} added · ${itemCount()} in your order`);
    flyToCart(btn.closest(".dish")?.querySelector("img")).then(bumpCount);

    btn.classList.add("added");
    btn.firstChild.textContent = "Added";
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      btn.classList.remove("added");
      btn.firstChild.textContent = "Add";
    }, 1400);
  });

  $$("[data-open-order]").forEach((btn) =>
    btn.addEventListener("click", () => {
      setNav(false);
      openDialog(drawer);
    })
  );

  // Checkout → the booking page (or, if we're on it, straight to the form)
  $("[data-checkout]").addEventListener("click", () => {
    closeDialog(drawer);
    if ($("[data-booking-form]")) document.dispatchEvent(new CustomEvent("cg:checkout"));
    else location.href = "book.html?type=pickup";
  });

  $("[data-clear-order]").addEventListener("click", () => {
    order = {};
    save();
    render();
    showToast("Order cleared");
  });

  const orderText = () => {
    const lines = Object.entries(order).map(([id, q]) => `• ${q} × ${menu.get(id).name} — ${peso(menu.get(id).price * q)}`);
    return ["Hi Cravn’ Go! I’d like to order:", ...lines, `Total: ${peso(orderTotal())}`, "", "Name: ", "Pickup or delivery: "].join("\n");
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

  /* ---------- Opening hours and dates (Philippine time) ---------- */
  const toMinutes = (hm) => {
    const [h, m] = hm.split(":").map(Number);
    return h * 60 + m;
  };
  const toLabel = (hm) => {
    const [h, m] = hm.split(":").map(Number);
    return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`;
  };
  const hoursFor = (day) => DATA.hours.find((h) => h.days.includes(day));
  const parseDate = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  // "Mon, Nov 2 at 6:30 PM" for a booking's date + time
  const whenText = (b) =>
    `${parseDate(b.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })} at ${toLabel(b.time)}`;

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

  /* ---------- Newsletter ---------- */
  const subscribeForm = $("[data-subscribe-form]");
  if (subscribeForm) {
    const subscribeStatus = $("[data-subscribe-status]");
    const setStatus = (message, ok) => {
      subscribeStatus.textContent = message;
      subscribeStatus.classList.toggle("is-error", !ok);
    };

    subscribeForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(subscribeForm);
      // Honeypot: only bots fill in the hidden "website" field
      if (String(data.get("website") || "").trim()) {
        subscribeForm.reset();
        setStatus("Grazie! You’re on the list.", true);
        return;
      }
      if (!db) {
        setStatus("Sign-ups open soon — follow us on Facebook in the meantime.", false);
        return;
      }
      withBusy($("button[type=submit]", subscribeForm), "Subscribing…", async () => {
        setStatus("", true);
        const { data: result, error } = await rpc("subscribe", { p_name: data.get("name"), p_email: data.get("email") });
        if (error) return setStatus(dbError(error).message, false);
        subscribeForm.reset();
        setStatus(
          result === "already" ? "You’re already on the list — grazie!" : `Grazie, ${firstName(data.get("name"))}! You’re on the list.`,
          true
        );
      });
    });
  }

  /* ---------- Shared with page scripts ---------- */
  window.CG = {
    $, $$, peso, firstName, initials, isPhMobile, safeNext, reduceMotion,
    db, dbError, NOT_READY, withBusy,
    showToast, flash, openDialog, closeDialog, observe, setNav, celebrate,
    toMinutes, toLabel, hoursFor, manilaNow, parseDate, whenText,
    auth: {
      user: () => (session ? session.user : null),
      token: () => (session ? session.token : null),
      set: (token, user) => setSession({ token, user }),
      clear: () => setSession(null),
      logOut,
      // Called whenever someone logs in or out
      onChange(fn) {
        authListeners.push(fn);
      },
    },
    order: {
      items: () => Object.entries(order).map(([id, qty]) => ({ id, qty })),
      count: itemCount,
      total: orderTotal,
      line: orderLine,
      clear() {
        order = {};
        save();
        render();
      },
      // Run fn now and whenever the order changes
      onChange(fn) {
        listeners.push(fn);
        fn();
      },
    },
  };
})();
