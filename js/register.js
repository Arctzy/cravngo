/*
 * Cravn' Go — Create account page.
 * Each username and each email can be registered only once. Creating an account logs you in.
 */
(() => {
  const { $, db, dbError, NOT_READY, withBusy, firstName, isPhMobile, auth, safeNext, celebrate, flash } = window.CG;
  const USERNAME_RE = /^[a-z0-9._]{3,20}$/i;
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const TAKEN = {
    username: "That username is already taken.",
    email: "That email is already registered.",
  };

  // Where to go afterwards, e.g. back to the booking form
  const next = safeNext(new URLSearchParams(location.search).get("next"));
  if (auth.user()) {
    location.replace(next || "account.html");
    return;
  }
  if (next) $("[data-login-link]").href = `login.html?next=${encodeURIComponent(next)}`;

  const form = $("[data-register-form]");
  const done = $("[data-register-done]");
  const errorEl = $("[data-form-error]", form);

  const setStatus = (name, text, ok) => {
    const el = $(`[data-status-for="${name}"]`, form);
    el.textContent = text;
    el.classList.toggle("is-ok", ok === true);
    el.classList.toggle("is-bad", ok === false);
  };

  // While typing, ask the database whether the username / email is still free.
  // A taken value blocks the form; the database checks again when it's submitted.
  const check = async (name) => {
    const input = form.elements[name];
    const value = input.value.trim();
    input.setCustomValidity("");
    const wellFormed = name === "username" ? USERNAME_RE.test(value) : EMAIL_RE.test(value);
    if (!value || !wellFormed || !db) return setStatus(name, "", null);

    setStatus(name, "Checking…", null);
    const { data, error } = await db.rpc("account_available", name === "username" ? { p_username: value } : { p_email: value });
    if (input.value.trim() !== value) return; // changed while we were checking
    if (error) return setStatus(name, "", null);

    const taken = name === "username" ? data.username_taken : data.email_taken;
    input.setCustomValidity(taken ? TAKEN[name] : "");
    setStatus(name, taken ? `✗ ${TAKEN[name]}` : "✓ Available", !taken);
  };

  const timers = {};
  ["username", "email"].forEach((name) => {
    const input = form.elements[name];
    input.addEventListener("input", () => {
      clearTimeout(timers[name]);
      input.setCustomValidity("");
      setStatus(name, "", null);
      timers[name] = setTimeout(() => check(name), 450);
    });
    input.addEventListener("blur", () => {
      clearTimeout(timers[name]);
      check(name);
    });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    const data = Object.fromEntries(new FormData(form));
    if (!isPhMobile(data.phone)) {
      errorEl.textContent = "Please enter a valid mobile number, e.g. 0917 123 4567.";
      form.elements.phone.focus();
      return;
    }
    if (!db) {
      errorEl.textContent = NOT_READY;
      return;
    }

    withBusy($("[type=submit]", form), "Creating account…", async () => {
      const { data: result, error } = await db.rpc("register_customer", {
        p_username: data.username,
        p_full_name: data.full_name,
        p_email: data.email,
        p_phone: data.phone,
        p_password: data.password,
      });
      if (error) {
        const { message, field } = dbError(error);
        errorEl.textContent = message;
        if (field === "username" || field === "email") setStatus(field, `✗ ${TAKEN[field]}`, false);
        const input = field && form.elements[field];
        if (input) input.focus();
        return;
      }

      auth.set(result.token, result.user); // logged in — the header now shows their name
      $("[data-done-name]", done).textContent = firstName(result.user.full_name);
      $("[data-done-username]", done).textContent = result.user.username;
      if (next) {
        const primary = $("[data-done-primary]", done);
        primary.href = next;
        primary.textContent = "Continue booking";
      }
      form.hidden = true;
      done.hidden = false;
      done.focus();
      celebrate($(".confirm-check", done));
      flash(`Welcome to Cravn’ Go, ${firstName(result.user.full_name)}!`);
    });
  });
})();
