/* Cravn' Go — Gallery page: hover captions and the full-screen photo viewer */
(() => {
  const { $, $$, openDialog, closeDialog, reduceMotion } = window.CG;

  const lb = $("[data-lightbox-dialog]");
  const lbImg = $("[data-lightbox-img]");
  const lbCap = $("[data-lightbox-cap]");
  const tiles = $$("[data-lightbox]");
  let index = 0;

  // Each photo gets a caption that slides up on hover (the button is already named by the photo)
  tiles.forEach((tile) => {
    const cap = document.createElement("span");
    cap.className = "tile-cap";
    cap.setAttribute("aria-hidden", "true");
    cap.textContent = $("img", tile).alt;
    tile.appendChild(cap);
  });

  // "2 / 6" counter in the viewer
  const count = document.createElement("span");
  count.className = "lb-count";
  lbCap.before(count);

  // dir: -1 previous, 1 next, 0 opening — the photo slides in from that side
  const show = (i, dir = 0) => {
    index = (i + tiles.length) % tiles.length;
    const img = $("img", tiles[index]);
    lbImg.src = img.getAttribute("src");
    lbImg.alt = img.alt;
    lbCap.textContent = img.alt;
    count.textContent = `${index + 1} / ${tiles.length}`;
    if (reduceMotion.matches || !lbImg.animate) return;
    lbImg.animate(
      [
        { opacity: 0, transform: `translateX(${dir * 48}px) scale(${dir ? 0.98 : 0.94})` },
        { opacity: 1, transform: "none" },
      ],
      { duration: 480, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }
    );
  };

  tiles.forEach((tile, i) =>
    tile.addEventListener("click", () => {
      show(i);
      openDialog(lb);
    })
  );
  $("[data-lb-prev]").addEventListener("click", () => show(index - 1, -1));
  $("[data-lb-next]").addEventListener("click", () => show(index + 1, 1));
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(index - 1, -1);
    if (e.key === "ArrowRight") show(index + 1, 1);
  });
  let swiped = false;
  lb.addEventListener("click", (e) => {
    if (swiped) swiped = false;
    else if (e.target.tagName === "FIGURE") closeDialog(lb);
  });
  lb.addEventListener("close", () => tiles[index].focus());

  // Swipe left / right on touch screens
  let startX = null;
  lb.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") startX = e.clientX;
  });
  lb.addEventListener("pointerup", (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) < 50) return;
    swiped = true;
    setTimeout(() => (swiped = false), 0);
    show(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  });
})();
