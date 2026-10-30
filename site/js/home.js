// The palimpsest stack: nine real world maps (generated from upstream's GeoJSON by tools/build_slices.py)
// laid one on another in 3D. Hover or focus a sheet to lift it; each opens that year in the atlas.
(() => {
  "use strict";
  const stack = document.getElementById("stack");
  const core = document.getElementById("core");
  const pause = document.getElementById("stack-pause");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  fetch("data/meta.json").then((r) => r.json()).then((m) => {
    document.querySelectorAll("[data-meta]").forEach((el) => {
      const v = m[el.dataset.meta];
      if (v != null) el.textContent = typeof v === "number" ? v.toLocaleString("en-US") : v;
    });
  }).catch(() => {});

  fetch("data/slices.json").then((r) => r.json()).then(({ w, h, slices }) => {
    const n = slices.length;
    // newest on top: render oldest first so it sits at the bottom of the stack
    stack.innerHTML = slices.map((s, i) => `
      <a class="sheet" role="listitem" href="map.html?year=${s.year}" style="--i:${i};--n:${n}" data-i="${i}" aria-label="${s.label}: ${s.regions} named regions. Open in the atlas">
        <svg viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">
          <rect class="sea" width="${w}" height="${h}" rx="6"/>
          ${s.layers.map((l) => `<path d="${l.d}" fill="hsl(${l.h} 42% 58%)"/>`).join("")}
        </svg>
        <span class="tab">${s.label}</span>
      </a>`).join("");
    core.innerHTML = slices.slice().reverse().map((s, k) => `
      <li><a href="map.html?year=${s.year}" data-i="${n - 1 - k}" tabindex="-1"><b>${s.label}</b><span>${s.regions} regions</span></a></li>`).join("");

    const sheets = [...stack.querySelectorAll(".sheet")];
    const light = (i, on) => {
      sheets[i]?.classList.toggle("lift", on);
      core.querySelector(`[data-i="${i}"]`)?.classList.toggle("on", on);
      stack.classList.toggle("focusing", on);
    };
    [...sheets, ...core.querySelectorAll("a")].forEach((el) => {
      const i = Number(el.dataset.i);
      el.addEventListener("mouseenter", () => light(i, true));
      el.addEventListener("mouseleave", () => light(i, false));
      el.addEventListener("focus", () => light(i, true));
      el.addEventListener("blur", () => light(i, false));
    });

    // scrape: collapse every sheet onto one page and overprint the eras as ghost borders, newest brightest
    const scrape = document.getElementById("stack-scrape");
    scrape.addEventListener("click", () => {
      const on = stack.classList.toggle("scraped");
      scrape.setAttribute("aria-pressed", String(on));
      scrape.textContent = on ? "Restack" : "Scrape the stack";
    });

    // the sheets settle in from above, then the stack breathes slowly
    requestAnimationFrame(() => stack.classList.add("ready"));
    if (reduce) { stack.classList.add("still"); pause.hidden = true; return; }
    pause.addEventListener("click", () => {
      const still = stack.classList.toggle("still");
      pause.setAttribute("aria-pressed", String(still));
      pause.textContent = still ? "Play" : "Pause";
    });
  }).catch(() => {
    stack.innerHTML = '<p class="stack-error">The stack could not load. <a href="map.html">Open the atlas</a> instead.</p>';
    pause.hidden = true;
  });
})();
