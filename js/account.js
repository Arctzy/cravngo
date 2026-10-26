/* Cravn' Go — My account page: profile, bookings, cancel, log out */
(() => {
  const { $, peso, db, dbError, NOT_READY, auth, initials, firstName, whenText, showToast, flash } = window.CG;
  const TYPE_LABEL = { reserve: "Table reservation", pickup: "Pick-up", delivery: "Delivery" };

  const user = auth.user();
  if (!user) {
    location.replace("login.html?next=account.html");
    return;
  }
  // Logged out (here or in another tab) → back to the home page
  auth.onChange((current) => {
    if (!current) location.replace("index.html");
  });

  /* ---------- Profile ---------- */
  $("[data-greeting]").textContent = `Hi, ${firstName(user.full_name)}!`;
  $("[data-profile-avatar]").textContent = initials(user.full_name);
  $("[data-profile-name]").textContent = user.full_name;
  $("[data-profile-username]").textContent = `@${user.username}`;
  $("[data-profile-email]").textContent = user.email;
  $("[data-profile-phone]").textContent = user.phone;
  $("[data-account-log-out]").addEventListener("click", async () => {
    flash("You’re logged out. See you soon!");
    await auth.logOut();
  });

  /* ---------- Bookings ---------- */
  const list = $("[data-booking-list]");
  const status = $("[data-bookings-status]");

  const detail = (b) => {
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
    $(".booking-detail", li).textContent = detail(b);
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

  const cancelBooking = async (b, li) => {
    if (!window.confirm(`Cancel booking ${b.ref} on ${whenText(b)}?`)) return;
    const { data, error } = await db.rpc("cancel_booking", { p_token: auth.token(), p_id: b.id });
    if (error) {
      const { message, field } = dbError(error);
      if (field === "auth") return auth.clear();
      return showToast(message);
    }
    li.replaceWith(bookingItem(data));
    showToast(`Booking ${b.ref} cancelled`);
  };

  const load = async () => {
    if (!db) {
      status.textContent = NOT_READY;
      return;
    }
    const { data, error } = await db.rpc("my_bookings", { p_token: auth.token() });
    if (error) {
      const { message, field } = dbError(error);
      if (field === "auth") return auth.clear(); // session ended → sent home by onChange above
      status.textContent = message;
      return;
    }
    status.textContent = "No bookings yet — reserve a table or order ahead anytime.";
    status.hidden = data.length > 0;
    data.forEach((b, i) => {
      const li = bookingItem(b);
      li.style.setProperty("--i", i);
      list.appendChild(li);
    });
  };
  load();
})();
