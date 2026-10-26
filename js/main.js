/*
 * Cravn' Go — shared code for every page: header, scroll effects, the order
 * drawer, the newsletter form and small helpers.
 * Page scripts (menu.js, book.js, register.js, …) use the helpers through window.CG.
 */
(() => {
  const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61595608813635";
  const STORAGE_KEY = "cravngo-order";
  const DATA = window.CRAVNGO_DATA;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const peso = (n) => "₱" + n.toLocaleString("en-PH");
  const firstName = (name) => String(name).trim().split(/\s+/)[0];
  const isPhMobile = (value) => /^(?:\+?63|0)?9\d{9}$/.test(String(value).replace(/[\s-]/g, ""));

  /* ---------- Supabase (accounts, bookings, newsletter) ---------- */
  const CONFIG = window.CRAVNGO_CONFIG || {};
  const db =
    CONFIG.supabaseUrl && CONFIG.supabaseKey && window.supabase
      ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  if (window.supabase && !db) {
    console.warn("Cravn’ Go: add your Supabase URL and key to js/config.js to turn on accounts, bookings and the newsletter.");
  }
  const NOT_READY = "Online accounts and bookings aren’t switched on yet — please call us at 0930 559 1153.";

  // Supabase error → { message, field }. Our database functions put the form field to fix in `hint`.
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
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      setNav(false);
      navToggle.focus();
    }
  });
  window.matchMedia("(min-width: 861px)").addEventListener("change", () => setNav(false));

  /* ---------- Reveal on scroll ---------- */
  const io =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              entry.target.classList.add("in");
              io.unobserve(entry.target);
            });
          },
          { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
        )
      : null;

  // Also used by page scripts for content they add later (e.g. menu cards)
  const observe = (elements) => {
    elements.forEach((el) => {
      const siblings = $$(":scope > .reveal", el.parentElement);
      if (siblings.length > 1) el.style.transitionDelay = `${(siblings.indexOf(el) % 3) * 90}ms`;
      if (io) io.observe(el);
      else el.classList.add("in");
    });
  };
  observe($$(".reveal"));

  /* ---------- Toast ---------- */
  const toast = $("[data-toast]");
  let toastTimer;
  const showToast = (msg) => {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  };

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

  /* ---------- Order (cart), kept in this browser across pages ---------- */
  const menu = new Map(DATA.menu.map((dish) => [dish.id, dish]));

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

  // "Add" buttons — menu cards are added by menu.js, so listen on the whole page
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add]");
    if (!btn) return;
    const id = btn.dataset.add;
    setQty(id, (order[id] || 0) + 1);
    showToast(`${menu.get(id).name} added · ${itemCount()} in your order`);

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

  /* ---------- Opening hours helpers (Philippine time) ---------- */
  const toMinutes = (hm) => {
    const [h, m] = hm.split(":").map(Number);
    return h * 60 + m;
  };
  const toLabel = (hm) => {
    const [h, m] = hm.split(":").map(Number);
    return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`;
  };
  const hoursFor = (day) => DATA.hours.find((h) => h.days.includes(day));

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

  /* ---------- Newsletter → Supabase "subscribe" function ---------- */
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
        const { data: result, error } = await db.rpc("subscribe", { p_name: data.get("name"), p_email: data.get("email") });
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
    $, $$, peso, firstName, isPhMobile,
    db, dbError, NOT_READY, withBusy,
    showToast, openDialog, closeDialog, observe, setNav,
    toMinutes, toLabel, hoursFor, manilaNow,
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
