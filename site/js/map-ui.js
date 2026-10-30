// Map page glue around the atlas engine (atlas.js): mirrors the year and counts into the sidebar
// and footer, wires the era buttons, the help dialog and the search shortcut.
document.addEventListener("DOMContentLoaded", () => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const formatYear = (y) => {
    const n = Number(y);
    if (!Number.isFinite(n)) return "—";
    if (n < 0) return `${Math.abs(n).toLocaleString("en-US")} BC`;
    return n === 0 ? "1 BC" : `${n} AD`;
  };

  let last = "";
  function sync() {
    if (!window.Atlas) return;
    const s = window.Atlas.getState();
    const key = `${s.year}|${s.featureCount}|${document.querySelectorAll(".entity-item").length}`;
    if (key === last) return;
    last = key;
    $("timeline").setAttribute("aria-valuetext", formatYear(s.year));
    $("timelineYearLabel").textContent = formatYear(s.year);
    $("featureCount").textContent = s.featureCount ?? "—";
    $("entityCount").textContent = document.querySelectorAll(".entity-item").length;
    document.title = `${formatYear(s.year)} — Palimpsest`;
  }
  setInterval(sync, 300);

  document.querySelectorAll(".period-button").forEach((b) =>
    b.addEventListener("click", () => {
      const y = Number(b.dataset.year);
      if (window.Atlas && Number.isFinite(y)) window.Atlas.setYear(y);
    })
  );

  // help dialog: open, close, Escape, focus back to the opener
  const modal = $("aboutModal"), open = $("aboutButton");
  const close = () => { if (modal.hidden) return; modal.hidden = true; document.body.classList.remove("modal-open"); open.focus(); };
  open.addEventListener("click", () => { modal.hidden = false; document.body.classList.add("modal-open"); $("closeAbout").focus(); });
  // keep Tab inside the dialog while it is open
  modal.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const f = [...modal.querySelectorAll("button, a[href]")];
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  $("closeAbout").addEventListener("click", close);
  document.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", close));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  $("searchToggle").addEventListener("click", () => $("search").focus());
  $("closeMapInfo").addEventListener("click", () => $("mapInfo").classList.remove("visible"));
});
