/* Cravn' Go — Log in page: username or email + password */
(() => {
  const { $, db, dbError, NOT_READY, withBusy, firstName, auth, safeNext, flash } = window.CG;

  // Where to go afterwards, e.g. back to the booking form
  const next = safeNext(new URLSearchParams(location.search).get("next"));
  if (auth.user()) {
    location.replace(next || "account.html");
    return;
  }
  if (next) $("[data-register-link]").href = `register.html?next=${encodeURIComponent(next)}`;

  const form = $("[data-login-form]");
  const errorEl = $("[data-form-error]", form);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    if (!db) {
      errorEl.textContent = NOT_READY;
      return;
    }
    const data = Object.fromEntries(new FormData(form));

    withBusy($("[type=submit]", form), "Logging in…", async () => {
      const { data: result, error } = await db.rpc("log_in", { p_login: data.login.trim(), p_password: data.password });
      if (error) {
        errorEl.textContent = dbError(error).message;
        return;
      }
      if (result.error) {
        errorEl.textContent = result.error;
        form.elements.password.value = "";
        form.elements.password.focus();
        return;
      }
      auth.set(result.token, result.user);
      flash(`Welcome back, ${firstName(result.user.full_name)}!`);
      location.href = next || "account.html";
    });
  });
})();
