/* Cravn' Go — Gallery page: full-screen photo viewer */
(() => {
  const { $, $$, openDialog, closeDialog } = window.CG;

  const lb = $("[data-lightbox-dialog]");
  const lbImg = $("[data-lightbox-img]");
  const lbCap = $("[data-lightbox-cap]");
  const tiles = $$("[data-lightbox]");
  let index = 0;

  const show = (i) => {
    index = (i + tiles.length) % tiles.length;
    const img = $("img", tiles[index]);
    lbImg.src = img.getAttribute("src");
    lbImg.alt = img.alt;
    lbCap.textContent = img.alt;
  };

  tiles.forEach((tile, i) =>
    tile.addEventListener("click", () => {
      show(i);
      openDialog(lb);
    })
  );
  $("[data-lb-prev]").addEventListener("click", () => show(index - 1));
  $("[data-lb-next]").addEventListener("click", () => show(index + 1));
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(index - 1);
    if (e.key === "ArrowRight") show(index + 1);
  });
  lb.addEventListener("click", (e) => {
    if (e.target.tagName === "FIGURE") closeDialog(lb);
  });
  lb.addEventListener("close", () => tiles[index].focus());
})();
