/* Cravn' Go — dish cards for the Menu page and the home page favorites */
(() => {
  const { $, $$, peso, observe, reduceMotion } = window.CG;
  const DATA = window.CRAVNGO_DATA;

  const card = (dish) => {
    const el = document.createElement("article");
    el.className = "dish reveal";
    el.dataset.category = dish.category;
    el.innerHTML = `
      <div class="dish-media">
        <img loading="lazy" alt="">
        ${dish.favorite ? '<span class="badge">Customer favorite</span>' : ""}
      </div>
      <div class="dish-body">
        <p class="dish-cat"></p>
        <div class="dish-head"><h3></h3><span class="price"></span></div>
        <p class="dish-desc"></p>
        <button class="add-btn" type="button" data-add="${dish.id}">Add<span class="sr-only"></span></button>
      </div>`;
    const img = $("img", el);
    img.src = dish.image;
    img.alt = dish.alt;
    img.width = dish.width;
    img.height = dish.height;
    if (dish.position) img.style.objectPosition = dish.position;
    $(".dish-cat", el).textContent = dish.category;
    $("h3", el).textContent = dish.name;
    $(".price", el).textContent = peso(dish.price);
    $(".dish-desc", el).textContent = dish.description;
    $(".sr-only", el).textContent = ` ${dish.name} to order`;
    return el;
  };

  // data-dishes="all" (Menu page) or "favorites" (home page)
  $$("[data-dishes]").forEach((grid) => {
    const dishes = grid.dataset.dishes === "favorites" ? DATA.menu.filter((d) => d.favorite) : DATA.menu;
    dishes.forEach((dish) => grid.appendChild(card(dish)));
    observe($$(".reveal", grid));
  });

  // Category filter on the Menu page; the dishes that stay pop back in one by one
  const filters = $$("[data-filter]");

  // A pill slides behind the chosen filter
  const filterBar = $(".menu-filters");
  let movePill = () => {};
  if (filterBar && "ResizeObserver" in window) {
    const pill = document.createElement("span");
    pill.className = "filter-pill";
    pill.setAttribute("aria-hidden", "true");
    filterBar.prepend(pill);
    filterBar.classList.add("has-pill");
    movePill = () => {
      const on = $('[aria-pressed="true"]', filterBar);
      pill.style.width = `${on.offsetWidth}px`;
      pill.style.height = `${on.offsetHeight}px`;
      pill.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    };
    const ro = new ResizeObserver(movePill);
    [filterBar, ...filters].forEach((el) => ro.observe(el));
    // Slide only after the first placement, so it doesn't fly in from the corner
    requestAnimationFrame(() => requestAnimationFrame(() => filterBar.classList.add("pill-ready")));
  }

  filters.forEach((btn) =>
    btn.addEventListener("click", () => {
      filters.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      movePill();
      const shown = $$("[data-dishes] .dish").filter((el) => {
        el.hidden = btn.dataset.filter !== "all" && el.dataset.category !== btn.dataset.filter;
        return !el.hidden;
      });
      if (reduceMotion.matches) return;
      shown.forEach((el, i) =>
        el.animate(
          [{ opacity: 0, transform: "translateY(18px) scale(0.97)" }, { opacity: 1, transform: "none" }],
          { duration: 450, delay: i * 60, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "backwards" }
        )
      );
    })
  );
})();
