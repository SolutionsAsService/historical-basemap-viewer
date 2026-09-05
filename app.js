/* ============================================================
   HISTORICAL ATLAS
   app.js
   ============================================================

   Data source:
   /index.json
   /geojson/world_*.geojson
   /geojson/places.geojson

   Expected HTML IDs:
   #map
   #timeline
   #year
   #yearLabel
   #playButton
   #prevButton
   #nextButton
   #search
   #entityList
   #loading
   #error

   Requires:
   D3.js
   ============================================================ */

(() => {
  "use strict";

  /* ----------------------------------------------------------
     CONFIGURATION
     ---------------------------------------------------------- */

  const CONFIG = {
    indexUrl: "./index.json",
    geojsonPath: "./geojson/",
    placesUrl: "./geojson/places.geojson",

    mapSelector: "#map",
    leafletSelector: "#leafletMap",
    globeSelector: "#globe",
    timelineSelector: "#timeline",
    yearSelector: "#year",
    yearLabelSelector: "#yearLabel",
    playSelector: "#playButton",
    prevSelector: "#prevButton",
    nextSelector: "#nextButton",
    searchSelector: "#search",
    entityListSelector: "#entityList",
    loadingSelector: "#loading",
    errorSelector: "#error",
    loadingTextSelector: "#loadingText",
    errorTextSelector: "#errorText",
    viewSwitchSelector: "#viewSwitch",
    globeHintSelector: "#globeHint",
    timelineTicksSelector: "#timelineTicks",
    timelineEarliestSelector: "#timelineEarliest",
    timelineLatestSelector: "#timelineLatest",
    timelineCurrentSelector: "#timelineCurrent",

    animationDuration: 450,
    playInterval: 900,

    // Available map views (header switch)
    views: ["atlas", "map", "globe"],
    defaultView: "atlas",

    // World map defaults
    width: 1200,
    height: 650,

    // Globe behaviour
    globe: {
      minScaleFactor: 0.7,
      maxScaleFactor: 4.5,
      dragSensitivity: 0.28,
      // Slow auto-rotation while idle on the globe view
      autoRotateDegreesPerSecond: 2.5
    },

    // Default map padding
    padding: 20
  };


  /* ----------------------------------------------------------
     APPLICATION STATE
     ---------------------------------------------------------- */

  const state = {
    index: null,

    years: [],
    currentYearIndex: 0,
    currentYear: null,

    currentMap: null,
    currentFeatures: [],

    places: null,
    placesLoaded: false,

    // Active view: "atlas" (D3 flat), "map" (Leaflet), "globe" (D3 3D)
    view: CONFIG.defaultView,

    projection: null,
    path: null,

    svg: null,
    mapLayer: null,
    borderLayer: null,
    placeLayer: null,

    // Leaflet slippy-map view
    leaflet: {
      map: null,
      regionLayer: null,
      placeLayer: null
    },

    // D3 orthographic globe view
    globe: {
      svg: null,
      sphereLayer: null,
      graticuleLayer: null,
      regionLayer: null,
      placeLayer: null,
      projection: null,
      path: null,
      rotation: [-20, -30, 0],
      baseScale: null,
      scale: 1,
      dragging: false,
      autoRotateTimer: null
    },

    playing: false,
    playTimer: null,

    selectedEntity: null,
    searchTerm: "",

    initialized: false
  };


  /* ----------------------------------------------------------
     DOM HELPERS
     ---------------------------------------------------------- */

  const $ = (selector) => document.querySelector(selector);

  const mapElement = $(CONFIG.mapSelector);
  const leafletElement = $(CONFIG.leafletSelector);
  const globeElement = $(CONFIG.globeSelector);
  const timelineElement = $(CONFIG.timelineSelector);
  const yearElement = $(CONFIG.yearSelector);
  const yearLabelElement = $(CONFIG.yearLabelSelector);
  const playButton = $(CONFIG.playSelector);
  const prevButton = $(CONFIG.prevSelector);
  const nextButton = $(CONFIG.nextSelector);
  const searchElement = $(CONFIG.searchSelector);
  const entityListElement = $(CONFIG.entityListSelector);
  const loadingElement = $(CONFIG.loadingSelector);
  const errorElement = $(CONFIG.errorSelector);
  const loadingTextElement = $(CONFIG.loadingTextSelector);
  const errorTextElement = $(CONFIG.errorTextSelector);
  const viewSwitchElement = $(CONFIG.viewSwitchSelector);
  const globeHintElement = $(CONFIG.globeHintSelector);
  const timelineTicksElement = $(CONFIG.timelineTicksSelector);


  /* ----------------------------------------------------------
     UI STATE
     ---------------------------------------------------------- */

  function setLoading(visible, message = "Loading…") {
    if (!loadingElement) return;

    if (loadingTextElement) {
      loadingTextElement.textContent = message;
    } else {
      loadingElement.textContent = message;
    }

    loadingElement.hidden = !visible;
  }


  function showError(message) {
    console.error(message);

    if (!errorElement) return;

    if (errorTextElement) {
      errorTextElement.textContent = message;
    } else {
      errorElement.textContent = message;
    }

    errorElement.hidden = false;
  }


  function clearError() {
    if (!errorElement) return;

    if (errorTextElement) {
      errorTextElement.textContent = "";
    } else {
      errorElement.textContent = "";
    }

    errorElement.hidden = true;
  }


  /* ----------------------------------------------------------
     YEAR FORMATTING
     ---------------------------------------------------------- */

  function formatYear(year) {
    if (year === null || year === undefined) {
      return "";
    }

    const numericYear = Number(year);

    if (numericYear < 0) {
      return `${Math.abs(numericYear)} BC`;
    }

    if (numericYear === 0) {
      return "1 BC";
    }

    return `${numericYear} AD`;
  }


  function formatYearShort(year) {
    const numericYear = Number(year);

    if (numericYear < 0) {
      return `${Math.abs(numericYear)} BC`;
    }

    return `${numericYear}`;
  }


  /* ----------------------------------------------------------
     INDEX NORMALIZATION
     ---------------------------------------------------------- */

  function normalizeIndex(rawIndex) {
    /*
      The repository currently uses:

      {
        "years": [
          {
            "year": 1492,
            "filename": "world_1492.geojson",
            "countries": [...]
          }
        ]
      }

      This function deliberately accepts either:

      index.json
        -> { years: [...] }

      or

      [
        {...},
        {...}
      ]

      so the application remains tolerant of future changes.
    */

    let records;

    if (Array.isArray(rawIndex)) {
      records = rawIndex;
    } else if (Array.isArray(rawIndex.years)) {
      records = rawIndex.years;
    } else {
      throw new Error("Invalid index.json format.");
    }

    return records
      .filter(record => {
        return (
          record &&
          Number.isFinite(Number(record.year)) &&
          typeof record.filename === "string"
        );
      })
      .map(record => ({
        year: Number(record.year),
        filename: record.filename,
        countries: Array.isArray(record.countries)
          ? [...record.countries]
          : []
      }))
      .sort((a, b) => a.year - b.year);
  }


  /* ----------------------------------------------------------
     LOAD INDEX
     ---------------------------------------------------------- */

  async function loadIndex() {
    const response = await fetch(CONFIG.indexUrl, {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(
        `Unable to load index.json (${response.status})`
      );
    }

    const data = await response.json();

    state.index = data;
    state.years = normalizeIndex(data);

    if (!state.years.length) {
      throw new Error("index.json contains no historical years.");
    }

    console.log(
      `Historical Atlas: loaded ${state.years.length} years.`
    );
  }


  /* ----------------------------------------------------------
     GEOJSON URL
     ---------------------------------------------------------- */

  function getGeoJSONUrl(record) {
    return `${CONFIG.geojsonPath}${record.filename}`;
  }


  /* ----------------------------------------------------------
     LOAD HISTORICAL MAP
     ---------------------------------------------------------- */

  async function loadHistoricalMap(record) {
    if (!record) {
      throw new Error("No historical map record selected.");
    }

    const url = getGeoJSONUrl(record);

    setLoading(true, `Loading ${formatYear(record.year)}…`);
    clearError();

    try {
      const response = await fetch(url, {
        cache: "force-cache"
      });

      if (!response.ok) {
        throw new Error(
          `Unable to load ${record.filename} (${response.status})`
        );
      }

      const geojson = await response.json();

      state.currentMap = geojson;

      if (
        !geojson ||
        geojson.type !== "FeatureCollection"
      ) {
        throw new Error(
          `${record.filename} is not a valid GeoJSON FeatureCollection.`
        );
      }

      state.currentFeatures = geojson.features || [];

      renderMap();

      updateEntityList();

      updateYearUI();

      setLoading(false);

      return geojson;

    } catch (error) {
      setLoading(false);
      showError(error.message);
      throw error;
    }
  }


  /* ----------------------------------------------------------
     LOAD PLACES
     ---------------------------------------------------------- */

  async function loadPlaces() {
    if (state.placesLoaded) {
      return state.places;
    }

    try {
      const response = await fetch(CONFIG.placesUrl);

      if (!response.ok) {
        throw new Error(
          `Unable to load places.geojson (${response.status})`
        );
      }

      state.places = await response.json();
      state.placesLoaded = true;

      return state.places;

    } catch (error) {
      console.warn(
        "Historical places could not be loaded:",
        error
      );

      return null;
    }
  }


  /* ----------------------------------------------------------
     FEATURE COLORS

     Historical regions are colored deterministically by
     their controlling authority (SUBJECTO), falling back
     to their name, so related territories share a hue in
     every view (atlas, Leaflet map, globe).
     ---------------------------------------------------------- */

  function getFeatureAuthority(feature) {
    const props =
      (feature && feature.properties) || {};

    return (
      props.SUBJECTO ||
      props.PARTOF ||
      props.NAME ||
      props.name ||
      ""
    );
  }


  function getFeatureColor(feature) {
    const key = String(
      getFeatureAuthority(feature)
    );

    let hash = 0;

    for (
      let i = 0;
      i < key.length;
      i += 1
    ) {
      hash =
        ((hash << 5) - hash) +
        key.charCodeAt(i);

      hash |= 0;
    }

    const hue =
      ((hash % 360) + 360) % 360;

    return `hsl(${hue}, 30%, 55%)`;
  }


  /* ----------------------------------------------------------
     FEATURE VISIBLE ON GLOBE HEMISPHERE
     ---------------------------------------------------------- */

  function isFeatureVisibleOnGlobe(feature) {
    if (
      !state.globe.projection ||
      !feature
    ) {
      return true;
    }

    try {
      const centroid =
        d3.geoCentroid(feature);

      if (
        !centroid ||
        !Number.isFinite(centroid[0]) ||
        !Number.isFinite(centroid[1])
      ) {
        return false;
      }

      const rotation =
        state.globe.projection.rotate();

      return d3.geoDistance(
        centroid,
        [-rotation[0], -rotation[1]]
      ) <= Math.PI / 2;

    } catch (error) {
      return false;
    }
  }


  /* ----------------------------------------------------------
     MAP INITIALIZATION
     ---------------------------------------------------------- */

  function initializeMap() {
    if (!mapElement) {
      throw new Error(
        `Map element ${CONFIG.mapSelector} was not found.`
      );
    }

    const rect = mapElement.getBoundingClientRect();

    const width =
      rect.width ||
      CONFIG.width;

    const height =
      rect.height ||
      CONFIG.height;

    state.svg = d3
      .select(mapElement)
      .append("svg")
      .attr("class", "atlas-svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    state.mapLayer = state.svg
      .append("g")
      .attr("class", "atlas-map-layer");

    state.borderLayer = state.svg
      .append("g")
      .attr("class", "atlas-border-layer");

    state.placeLayer = state.svg
      .append("g")
      .attr("class", "atlas-place-layer");

    /*
      Natural Earth is a good default for a world historical atlas.
      D3's geoNaturalEarth1 gives us a world-friendly projection
      without needing another projection library.
    */

    state.projection = d3
      .geoNaturalEarth1()
      .translate([
        width / 2,
        height / 2
      ])
      .scale(
        Math.min(width, height) * 0.31
      );

    state.path = d3
      .geoPath()
      .projection(state.projection);

    /*
      Resize support.
    */

    window.addEventListener(
      "resize",
      debounce(resizeMap, 200)
    );
  }


  /* ----------------------------------------------------------
     MAP RESIZE
     ---------------------------------------------------------- */

  function resizeMap() {
    if (!state.svg || !mapElement) {
      return;
    }

    const rect = mapElement.getBoundingClientRect();

    const width =
      rect.width ||
      CONFIG.width;

    const height =
      rect.height ||
      CONFIG.height;

    state.svg
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`);

    state.projection
      .translate([
        width / 2,
        height / 2
      ])
      .scale(
        Math.min(width, height) * 0.31
      );

    state.path = d3
      .geoPath()
      .projection(state.projection);

    renderMap();
  }


  /* ----------------------------------------------------------
     MAP RENDERING
     ---------------------------------------------------------- */

  function renderMap() {
    if (!state.currentMap) {
      return;
    }

    /*
      Keep the alternate views in sync with the
      currently loaded historical map.
    */

    renderLeafletView();
    renderGlobeView();

    const features =
      state.currentMap.features || [];

    state.currentFeatures = features;

    const paths = state.mapLayer
      .selectAll("path.historical-region")
      .data(
        features,
        featureKey
      );

    /*
      ENTER
    */

    paths
      .enter()
      .append("path")
      .attr(
        "class",
        "historical-region"
      )
      .attr(
        "d",
        state.path
      )
      .attr(
        "data-name",
        getFeatureName
      )
      .on(
        "mouseenter",
        handleFeatureEnter
      )
      .on(
        "mousemove",
        handleFeatureMove
      )
      .on(
        "mouseleave",
        handleFeatureLeave
      )
      .on(
        "click",
        handleFeatureClick
      )
      .merge(paths)
      .transition()
      .duration(CONFIG.animationDuration)
      .attr(
        "d",
        state.path
      )
      .attr(
        "data-name",
        getFeatureName
      )
      .attr(
        "class",
        featureClass
      );

    /*
      EXIT
    */

    paths
      .exit()
      .transition()
      .duration(CONFIG.animationDuration)
      .style("opacity", 0)
      .remove();

    /*
      Borders are rendered separately so we can eventually
      control fuzzy/uncertain boundaries.
    */

    renderBorders();

    /*
      Places can be rendered independently from political
      polygons.
    */

    renderPlaces();
  }


  /* ----------------------------------------------------------
     BORDER RENDERING
     ---------------------------------------------------------- */

  function renderBorders() {
    const features =
      state.currentFeatures || [];

    const borders = state.borderLayer
      .selectAll("path.historical-border")
      .data(
        features,
        featureKey
      );

    borders
      .enter()
      .append("path")
      .attr(
        "class",
        "historical-border"
      )
      .attr(
        "d",
        state.path
      )
      .merge(borders)
      .transition()
      .duration(CONFIG.animationDuration)
      .attr(
        "d",
        state.path
      );

    borders
      .exit()
      .remove();
  }


  /* ----------------------------------------------------------
     FEATURE KEY
     ---------------------------------------------------------- */

  function featureKey(feature, index) {
    const props =
      feature.properties || {};

    return [
      props.NAME || "",
      props.SUBJECTO || "",
      props.PARTOF || "",
      index
    ].join("|");
  }


  /* ----------------------------------------------------------
     FEATURE NAME
     ---------------------------------------------------------- */

  function getFeatureName(feature) {
    const props =
      feature.properties || {};

    return (
      props.NAME ||
      props.name ||
      "Unknown"
    );
  }


  /* ----------------------------------------------------------
     FEATURE CLASS
     ---------------------------------------------------------- */

  function featureClass(feature) {
    const props =
      feature.properties || {};

    const name =
      getFeatureName(feature);

    const precision =
      Number(
        props.BORDERPRECISION
      ) || 1;

    const classes = [
      "historical-region",
      `precision-${precision}`
    ];

    if (
      state.selectedEntity &&
      name === state.selectedEntity
    ) {
      classes.push(
        "selected"
      );
    }

    if (
      state.searchTerm &&
      name
        .toLowerCase()
        .includes(
          state.searchTerm.toLowerCase()
        )
    ) {
      classes.push(
        "search-match"
      );
    }

    return classes.join(" ");
  }


  /* ----------------------------------------------------------
     HISTORICAL PLACES
     ---------------------------------------------------------- */

  function renderPlaces() {
    if (!state.places) {
      return;
    }

    renderLeafletPlaces();
    renderGlobePlaces();

    const features =
      state.places.features || [];

    const currentYear =
      state.currentYear;

    const visiblePlaces =
      features.filter(feature => {

        const props =
          feature.properties || {};

        const since =
          Number.isFinite(
            Number(props.inhabitedSince)
          )
            ? Number(props.inhabitedSince)
            : -Infinity;

        const until =
          Number.isFinite(
            Number(props.inhabitedUntil)
          )
            ? Number(props.inhabitedUntil)
            : Infinity;

        return (
          currentYear >= since &&
          currentYear <= until
        );
      });

    const places =
      state.placeLayer
        .selectAll("circle.historical-place")
        .data(
          visiblePlaces,
          placeKey
        );

    places
      .enter()
      .append("circle")
      .attr(
        "class",
        "historical-place"
      )
      .attr(
        "r",
        2.5
      )
      .attr(
        "cx",
        feature => {
          const coordinates =
            getCoordinates(feature);

          return coordinates
            ? state.projection(
                coordinates
              )[0]
            : -1000;
        }
      )
      .attr(
        "cy",
        feature => {
          const coordinates =
            getCoordinates(feature);

          return coordinates
            ? state.projection(
                coordinates
              )[1]
            : -1000;
        }
      )
      .on(
        "mouseenter",
        handlePlaceEnter
      )
      .on(
        "mouseleave",
        handlePlaceLeave
      )
      .merge(places)
      .transition()
      .duration(CONFIG.animationDuration)
      .attr(
        "cx",
        feature => {
          const coordinates =
            getCoordinates(feature);

          return coordinates
            ? state.projection(
                coordinates
              )[0]
            : -1000;
        }
      )
      .attr(
        "cy",
        feature => {
          const coordinates =
            getCoordinates(feature);

          return coordinates
            ? state.projection(
                coordinates
              )[1]
            : -1000;
        }
      );

    places
      .exit()
      .remove();
  }


  function placeKey(feature, index) {
    const props =
      feature.properties || {};

    return [
      props.name || "",
      props.inhabitedSince || "",
      props.inhabitedUntil || "",
      index
    ].join("|");
  }


  function getCoordinates(feature) {
    if (
      !feature ||
      !feature.geometry
    ) {
      return null;
    }

    if (
      feature.geometry.type ===
      "Point"
    ) {
      return feature.geometry.coordinates;
    }

    return null;
  }


  /* ----------------------------------------------------------
     FEATURE INTERACTION
     ---------------------------------------------------------- */

  function handleFeatureEnter(event, feature) {
    const name =
      getFeatureName(feature);

    showTooltip(
      event,
      createFeatureTooltip(feature)
    );

    d3.select(event.currentTarget)
      .classed(
        "hovered",
        true
      );
  }


  function handleFeatureMove(event) {
    moveTooltip(event);
  }


  function handleFeatureLeave(event) {
    hideTooltip();

    d3.select(event.currentTarget)
      .classed(
        "hovered",
        false
      );
  }


  function handleFeatureClick(event, feature) {
    event.stopPropagation();

    const name =
      getFeatureName(feature);

    state.selectedEntity =
      state.selectedEntity === name
        ? null
        : name;

    renderMap();

    updateEntityList();
  }


  /* ----------------------------------------------------------
     PLACE INTERACTION
     ---------------------------------------------------------- */

  function handlePlaceEnter(event, feature) {
    const props =
      feature.properties || {};

    showTooltip(
      event,
      `
        <strong>${escapeHtml(
          props.name || "Unknown place"
        )}</strong>
        <br>
        <span>Historical settlement</span>
      `
    );

    moveTooltip(event);
  }


  function handlePlaceLeave() {
    hideTooltip();
  }


  /* ----------------------------------------------------------
     TOOLTIP
     ---------------------------------------------------------- */

  let tooltip = null;

  function createTooltip() {
    if (tooltip) {
      return;
    }

    tooltip = document.createElement(
      "div"
    );

    tooltip.className =
      "atlas-tooltip";

    tooltip.style.position =
      "fixed";

    tooltip.style.pointerEvents =
      "none";

    tooltip.style.opacity =
      "0";

    document.body.appendChild(
      tooltip
    );
  }


  function showTooltip(event, html) {
    createTooltip();

    tooltip.innerHTML = html;

    tooltip.style.opacity =
      "1";

    moveTooltip(event);
  }


  function moveTooltip(event) {
    if (!tooltip) {
      return;
    }

    tooltip.style.left =
      `${event.clientX + 14}px`;

    tooltip.style.top =
      `${event.clientY + 14}px`;
  }


  function hideTooltip() {
    if (!tooltip) {
      return;
    }

    tooltip.style.opacity =
      "0";
  }


  function createFeatureTooltip(feature) {
    const props =
      feature.properties || {};

    const name =
      props.NAME ||
      "Unknown";

    const subject =
      props.SUBJECTO ||
      "";

    const partOf =
      props.PARTOF ||
      "";

    const precision =
      props.BORDERPRECISION ||
      "";

    let html = `
      <strong>
        ${escapeHtml(name)}
      </strong>
    `;

    if (subject) {
      html += `
        <br>
        <span>
          Authority:
          ${escapeHtml(subject)}
        </span>
      `;
    }

    if (partOf) {
      html += `
        <br>
        <span>
          Part of:
          ${escapeHtml(partOf)}
        </span>
      `;
    }

    if (precision) {
      html += `
        <br>
        <span>
          Border precision:
          ${escapeHtml(String(precision))}
        </span>
      `;
    }

    return html;
  }


  /* ----------------------------------------------------------
     ENTITY LIST
     ---------------------------------------------------------- */

  function updateEntityList() {
    if (!entityListElement) {
      return;
    }

    const names = [
      ...new Set(
        state.currentFeatures
          .map(getFeatureName)
          .filter(Boolean)
      )
    ].sort(
      (a, b) =>
        a.localeCompare(b)
    );

    const filtered =
      state.searchTerm
        ? names.filter(name =>
            name
              .toLowerCase()
              .includes(
                state.searchTerm
                  .toLowerCase()
              )
          )
        : names;

    entityListElement.innerHTML = "";

    const fragment =
      document.createDocumentFragment();

    filtered.forEach(name => {
      const button =
        document.createElement(
          "button"
        );

      button.type =
        "button";

      button.className =
        "entity-item";

      if (
        name ===
        state.selectedEntity
      ) {
        button.classList.add(
          "selected"
        );
      }

      button.textContent =
        name;

      button.addEventListener(
        "click",
        () => {
          state.selectedEntity =
            state.selectedEntity === name
              ? null
              : name;

          renderMap();
          updateEntityList();
        }
      );

      fragment.appendChild(
        button
      );
    });

    entityListElement.appendChild(
      fragment
    );
  }


  /* ----------------------------------------------------------
     SEARCH
     ---------------------------------------------------------- */

  function initializeSearch() {
    if (!searchElement) {
      return;
    }

    searchElement.addEventListener(
      "input",
      event => {
        state.searchTerm =
          event.target.value.trim();

        renderMap();
        updateEntityList();
      }
    );
  }


  /* ----------------------------------------------------------
     TIMELINE
     ---------------------------------------------------------- */

  function initializeTimeline() {
    if (!timelineElement) {
      return;
    }

    timelineElement.min =
      "0";

    timelineElement.max =
      String(
        Math.max(
          state.years.length - 1,
          0
        )
      );

    timelineElement.step =
      "1";

    timelineElement.value =
      String(
        state.currentYearIndex
      );

    timelineElement.addEventListener(
      "input",
      async event => {

        const index =
          Number(
            event.target.value
          );

        await setYearIndex(
          index
        );
      }
    );

    buildTimelineTicks();
  }


  /* ----------------------------------------------------------
     TIMELINE TICKS

     One tick per available historical snapshot. Deep-time
     snapshots (far past) get a "major" tick so the rail
     communicates the huge time spans at a glance.
     ---------------------------------------------------------- */

  function buildTimelineTicks() {
    if (!timelineTicksElement) {
      return;
    }

    timelineTicksElement.innerHTML = "";

    const count = state.years.length;

    if (!count) {
      return;
    }

    const fragment =
      document.createDocumentFragment();

    state.years.forEach((record, index) => {
      const tick = document.createElement("div");

      tick.className = "timeline-tick";

      if (record.year < 0) {
        tick.classList.add("major");
      }

      tick.style.left =
        `${(index / Math.max(count - 1, 1)) * 100}%`;

      tick.title = formatYear(record.year);

      fragment.appendChild(tick);
    });

    timelineTicksElement.appendChild(fragment);

    const earliest = $(CONFIG.timelineEarliestSelector);
    const latest = $(CONFIG.timelineLatestSelector);

    if (earliest) {
      earliest.textContent = formatYear(state.years[0].year);
    }

    if (latest) {
      latest.textContent = formatYear(
        state.years[count - 1].year
      );
    }
  }


  /* ----------------------------------------------------------
     YEAR UI
     ---------------------------------------------------------- */

  function updateYearUI() {
    if (!state.years.length) {
      return;
    }

    const record =
      state.years[
        state.currentYearIndex
      ];

    if (!record) {
      return;
    }

    if (timelineElement) {
      timelineElement.value =
        String(
          state.currentYearIndex
        );
    }

    if (yearElement) {
      yearElement.value =
        String(
          state.currentYear
        );
    }

    if (yearLabelElement) {
      yearLabelElement.textContent =
        formatYear(
          state.currentYear
        );
    }

    const timelineCurrent = $(
      CONFIG.timelineCurrentSelector
    );

    if (timelineCurrent) {
      timelineCurrent.textContent =
        formatYear(
          state.currentYear
        );
    }

    /*
      Highlight the era button whose period is closest
      to (but not after) the selected year.
    */

    document
      .querySelectorAll(".period-button")
      .forEach(button => {

        const buttonYear = Number(
          button.dataset.year
        );

        const active =
          Number.isFinite(buttonYear) &&
          buttonYear <= state.currentYear &&
          state.currentYear <
            nextPeriodYear(buttonYear);

        button.classList.toggle(
          "active",
          active
        );
      });

    updateNavigationButtons();
  }


  function nextPeriodYear(year) {
    const periodYears = [
      ...document.querySelectorAll(
        ".period-button"
      )
    ]
      .map(button =>
        Number(button.dataset.year)
      )
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    const next = periodYears.find(
      periodYear => periodYear > year
    );

    return next === undefined
      ? Infinity
      : next;
  }


  /* ----------------------------------------------------------
     YEAR SELECTION
     ---------------------------------------------------------- */

  async function setYearIndex(index) {
    if (!state.years.length) {
      return;
    }

    const clamped =
      Math.max(
        0,
        Math.min(
          state.years.length - 1,
          Number(index)
        )
      );

    state.currentYearIndex =
      clamped;

    const record =
      state.years[
        state.currentYearIndex
      ];

    state.currentYear =
      record.year;

    updateYearUI();

    await loadHistoricalMap(
      record
    );

    updateURLState();
  }


  async function setYear(year) {
    if (!state.years.length) {
      return;
    }

    const numericYear =
      Number(year);

    let closestIndex = 0;

    let smallestDifference =
      Infinity;

    state.years.forEach(
      (record, index) => {

        const difference =
          Math.abs(
            record.year -
            numericYear
          );

        if (
          difference <
          smallestDifference
        ) {
          smallestDifference =
            difference;

          closestIndex =
            index;
        }
      }
    );

    await setYearIndex(
      closestIndex
    );
  }


  /* ----------------------------------------------------------
     NAVIGATION
     ---------------------------------------------------------- */

  function updateNavigationButtons() {
    if (prevButton) {
      prevButton.disabled =
        state.currentYearIndex <= 0;
    }

    if (nextButton) {
      nextButton.disabled =
        state.currentYearIndex >=
        state.years.length - 1;
    }

    if (playButton) {
      playButton.textContent =
        state.playing
          ? "Pause"
          : "Play";
    }
  }


  function initializeNavigation() {
    if (prevButton) {
      prevButton.addEventListener(
        "click",
        () => {
          previousYear();
        }
      );
    }

    if (nextButton) {
      nextButton.addEventListener(
        "click",
        () => {
          nextYear();
        }
      );

    }

    if (playButton) {
      playButton.addEventListener(
        "click",
        () => {
          togglePlayback();
        }
      );
    }
  }


  async function previousYear() {
    if (
      state.currentYearIndex <= 0
    ) {
      return;
    }

    await setYearIndex(
      state.currentYearIndex - 1
    );
  }


  async function nextYear() {
    if (
      state.currentYearIndex >=
      state.years.length - 1
    ) {
      stopPlayback();
      return;
    }

    await setYearIndex(
      state.currentYearIndex + 1
    );
  }


  /* ----------------------------------------------------------
     PLAYBACK
     ---------------------------------------------------------- */

  function togglePlayback() {
    if (state.playing) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }


  function startPlayback() {
    if (state.playing) {
      return;
    }

    state.playing = true;

    updateNavigationButtons();

    state.playTimer =
      window.setInterval(
        async () => {

          if (
            state.currentYearIndex >=
            state.years.length - 1
          ) {
            stopPlayback();
            return;
          }

          try {
            await nextYear();
          } catch (error) {
            console.error(
              "Timeline playback error:",
              error
            );

            stopPlayback();
          }

        },
        CONFIG.playInterval
      );
  }


  function stopPlayback() {
    state.playing =
      false;

    if (state.playTimer) {
      clearInterval(
        state.playTimer
      );

      state.playTimer =
        null;
    }

    updateNavigationButtons();
  }


  /* ----------------------------------------------------------
     KEYBOARD CONTROLS
     ---------------------------------------------------------- */

  function initializeKeyboard() {
    document.addEventListener(
      "keydown",
      event => {

        /*
          Don't steal keyboard input from
          search boxes or other controls.
        */

        const target =
          event.target;

        if (
          target &&
          (
            target.tagName ===
              "INPUT" ||
            target.tagName ===
              "TEXTAREA" ||
            target.isContentEditable
          )
        ) {
          return;
        }

        if (
          event.key ===
          "ArrowLeft"
        ) {
          previousYear();
        }

        if (
          event.key ===
          "ArrowRight"
        ) {
          nextYear();
        }

        if (
          event.code ===
          "Space"
        ) {
          event.preventDefault();

          togglePlayback();
        }
      }
    );
  }


  /* ----------------------------------------------------------
     INITIAL YEAR
     ---------------------------------------------------------- */

  function findInitialYear() {
    /*
      Prefer 0 / earliest available historical
      snapshot if no year is specified.

      If the dataset contains 1492, you could
      later change this to 1492.
    */

    const preferredYears = [
      1492,
      1500,
      0,
      1
    ];

    for (
      const preferred of preferredYears
    ) {

      const index =
        state.years.findIndex(
          record =>
            record.year ===
            preferred
        );

      if (index !== -1) {
        return index;
      }
    }

    return 0;
  }


  /* ----------------------------------------------------------
     URL / HASH STATE
     ---------------------------------------------------------- */

  function readURLState() {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const year =
      params.get("year");

    const entity =
      params.get("entity");

    const view =
      params.get("view");

    const result = {
      year: null,
      entity,
      view:
        view &&
        CONFIG.views.includes(view)
          ? view
          : null
    };

    if (year !== null) {
      const numericYear =
        Number(year);

      if (
        Number.isFinite(
          numericYear
        )
      ) {
        result.year = numericYear;
      }
    }

    return result;
  }


  function updateURLState() {
    const params =
      new URLSearchParams(
        window.location.search
      );

    params.set(
      "year",
      String(
        state.currentYear
      )
    );

    if (
      state.selectedEntity
    ) {
      params.set(
        "entity",
        state.selectedEntity
      );
    } else {
      params.delete(
        "entity"
      );
    }

    if (
      state.view &&
      state.view !== CONFIG.defaultView
    ) {
      params.set("view", state.view);
    } else {
      params.delete("view");
    }

    const url =
      `${window.location.pathname}?${params.toString()}`;

    window.history.replaceState(
      {},
      "",
      url
    );
  }


  /* ----------------------------------------------------------
     URL STATE SYNC
     ---------------------------------------------------------- */

  function initializeURLSync() {
    window.addEventListener(
      "popstate",
      async () => {

        const urlState =
          readURLState();

        if (
          urlState.year !== null
        ) {
          await setYear(
            urlState.year
          );
        }

        if (
          urlState.entity
        ) {
          state.selectedEntity =
            urlState.entity;

          renderMap();
          updateEntityList();
        }

        if (urlState.view) {
          setView(urlState.view);
        }
      }
    );
  }


  /* ----------------------------------------------------------
     LEAFLET SLIPPY-MAP VIEW

     Renders the same historical GeoJSON on a pannable /
     zoomable Leaflet map. A graticule replaces modern web
     tiles so the historical borders are never misleadingly
     overlaid on present-day geography (and the app keeps
     working fully offline).
     ---------------------------------------------------------- */

  function initializeLeaflet() {
    if (
      state.leaflet.map ||
      !leafletElement ||
      typeof L === "undefined"
    ) {
      return;
    }

    state.leaflet.map = L.map(leafletElement, {
      center: [22, 12],
      zoom: 2,
      minZoom: 1,
      maxZoom: 8,
      worldCopyJump: true,
      zoomControl: false,
      attributionControl: false
    });

    L.control
      .zoom({ position: "bottomright" })
      .addTo(state.leaflet.map);

    L.geoJSON(d3.geoGraticule10(), {
      style: {
        className: "leaflet-graticule",
        color: "rgba(255, 255, 255, 0.09)",
        weight: 0.7,
        fill: false,
        interactive: false
      }
    }).addTo(state.leaflet.map);

    state.leaflet.regionLayer =
      L.geoJSON(null, {
        style: leafletFeatureStyle,

        onEachFeature(feature, layer) {
          layer.bindTooltip(
            getFeatureName(feature),
            {
              sticky: true,
              className: "leaflet-entity-tooltip"
            }
          );

          layer.on("click", event => {
            if (event.originalEvent) {
              L.DomEvent.stopPropagation(
                event.originalEvent
              );
            }

            selectEntityByName(
              getFeatureName(feature)
            );
          });
        }
      }).addTo(state.leaflet.map);

    state.leaflet.placeLayer =
      L.layerGroup().addTo(
        state.leaflet.map
      );

    state.leaflet.map.on("click", () => {
      if (state.selectedEntity) {
        selectEntityByName(null);
      }
    });
  }


  function leafletFeatureStyle(feature) {
    const props =
      (feature && feature.properties) || {};

    const precision =
      Number(props.BORDERPRECISION) || 1;

    const name = getFeatureName(feature);

    const selected =
      state.selectedEntity &&
      name === state.selectedEntity;

    const searchMatch =
      state.searchTerm &&
      name
        .toLowerCase()
        .includes(
          state.searchTerm.toLowerCase()
        );

    return {
      color: selected
        ? "#e0c48b"
        : precision === 1
          ? "rgba(24, 27, 24, 0.5)"
          : "rgba(24, 27, 24, 0.85)",
      weight:
        selected || searchMatch ? 1.8 : 0.8,
      dashArray:
        precision === 1 ? "3 3" : null,
      fillColor: selected
        ? "#e0c48b"
        : getFeatureColor(feature),
      fillOpacity: selected
        ? 0.85
        : precision === 1
          ? 0.5
          : precision === 2
            ? 0.72
            : 0.88
    };
  }


  function renderLeafletView() {
    if (!state.leaflet.regionLayer) {
      return;
    }

    state.leaflet.regionLayer.clearLayers();

    if (
      state.currentMap &&
      Array.isArray(state.currentMap.features)
    ) {
      state.leaflet.regionLayer.addData(
        state.currentMap.features
      );
    }

    renderLeafletPlaces();
  }


  function renderLeafletPlaces() {
    if (
      !state.leaflet.placeLayer ||
      !state.places
    ) {
      return;
    }

    state.leaflet.placeLayer.clearLayers();

    const visiblePlaces =
      getVisiblePlaces();

    visiblePlaces.forEach(feature => {
      const coordinates =
        getCoordinates(feature);

      if (!coordinates) {
        return;
      }

      const props =
        feature.properties || {};

      state.leaflet.placeLayer.addLayer(
        L.circleMarker(
          [coordinates[1], coordinates[0]],
          {
            className: "leaflet-place",
            radius: 3.5,
            color: "#e0c48b",
            weight: 1,
            fillColor: "#e0c48b",
            fillOpacity: 0.9
          }
        ).bindTooltip(
          props.name || "Historical settlement",
          {
            className: "leaflet-entity-tooltip"
          }
        )
      );
    });
  }


  function getVisiblePlaces() {
    if (!state.places) {
      return [];
    }

    const features =
      state.places.features || [];

    const currentYear =
      state.currentYear;

    return features.filter(feature => {
      const props =
        feature.properties || {};

      const since =
        Number.isFinite(
          Number(props.inhabitedSince)
        )
          ? Number(props.inhabitedSince)
          : -Infinity;

      const until =
        Number.isFinite(
          Number(props.inhabitedUntil)
        )
          ? Number(props.inhabitedUntil)
          : Infinity;

      return (
        currentYear >= since &&
        currentYear <= until
      );
    });
  }


  /* ----------------------------------------------------------
     GLOBE VIEW (3D ORTHOGRAPHIC)

     A drag-rotatable orthographic projection of the same
     historical regions — a 3D "globe viewer" built with D3,
     so no extra dependency is required.
     ---------------------------------------------------------- */

  function initializeGlobe() {
    if (
      state.globe.svg ||
      !globeElement
    ) {
      return;
    }

    const rect =
      globeElement.getBoundingClientRect();

    const width =
      rect.width || CONFIG.width;

    const height =
      rect.height || CONFIG.height;

    const projection =
      d3.geoOrthographic()
        .translate([
          width / 2,
          height / 2
        ])
        .rotate(state.globe.rotation)
        .clipAngle(90);

    state.globe.baseScale =
      Math.min(width, height) / 2 - 24;

    projection.scale(
      state.globe.baseScale *
        state.globe.scale
    );

    state.globe.projection = projection;

    state.globe.path = d3
      .geoPath()
      .projection(projection);

    const svg = d3
      .select(globeElement)
      .append("svg")
      .attr("class", "globe-svg")
      .attr("width", width)
      .attr("height", height);

    state.globe.svg = svg;

    state.globe.sphereLayer = svg
      .append("g")
      .attr("class", "globe-sphere-layer");

    state.globe.graticuleLayer = svg
      .append("g")
      .attr("class", "globe-graticule-layer");

    state.globe.regionLayer = svg
      .append("g")
      .attr("class", "globe-region-layer");

    state.globe.placeLayer = svg
      .append("g")
      .attr("class", "globe-place-layer");

    state.globe.sphereLayer
      .append("path")
      .attr("class", "globe-sphere")
      .datum({ type: "Sphere" });

    state.globe.graticuleLayer
      .append("path")
      .attr("class", "globe-graticule")
      .datum(d3.geoGraticule10());

    const drag = d3
      .drag()
      .on("start", () => {
        state.globe.dragging = true;
        stopGlobeAutoRotate();
      })
      .on("drag", event => {
        const rotate =
          state.globe.projection.rotate();

        const scaleFactor =
          state.globe.projection.scale() /
          Math.max(
            state.globe.baseScale,
            1
          );

        state.globe.projection.rotate([
          rotate[0] +
            event.dx *
              CONFIG.globe.dragSensitivity /
              Math.max(scaleFactor, 0.4),
          Math.max(
            -90,
            Math.min(
              90,
              rotate[1] -
                event.dy *
                  CONFIG.globe.dragSensitivity /
                  Math.max(scaleFactor, 0.4)
            )
          ),
          rotate[2]
        ]);

        renderGlobeView();
      })
      .on("end", () => {
        state.globe.dragging = false;
      });

    svg.call(drag);

    svg.on("wheel", event => {
      event.preventDefault();

      const direction =
        event.deltaY < 0 ? 1.12 : 1 / 1.12;

      state.globe.scale = Math.max(
        CONFIG.globe.minScaleFactor,
        Math.min(
          CONFIG.globe.maxScaleFactor,
          state.globe.scale * direction
        )
      );

      state.globe.projection.scale(
        state.globe.baseScale *
          state.globe.scale
      );

      renderGlobeView();
    }, { passive: false });

    svg.on("click", () => {
      if (state.selectedEntity) {
        selectEntityByName(null);
      }
    });

    renderGlobeView();
  }


  function renderGlobeView() {
    if (!state.globe.svg) {
      return;
    }

    const path = state.globe.path;

    state.globe.sphereLayer
      .select("path.globe-sphere")
      .attr("d", path);

    state.globe.graticuleLayer
      .select("path.globe-graticule")
      .attr("d", path);

    const features =
      (
        state.currentMap &&
        Array.isArray(
          state.currentMap.features
        )
          ? state.currentMap.features
          : []
      ).filter(isFeatureVisibleOnGlobe);

    const regions = state.globe.regionLayer
      .selectAll("path.historical-region")
      .data(features, featureKey);

    regions
      .enter()
      .append("path")
      .attr("d", path)
      .attr("data-name", getFeatureName)
      .attr("fill", getFeatureColor)
      .on("mouseenter", handleFeatureEnter)
      .on("mousemove", handleFeatureMove)
      .on("mouseleave", handleFeatureLeave)
      .on("click", (event, feature) => {
        event.stopPropagation();
        selectEntityByName(
          getFeatureName(feature)
        );
      })
      .merge(regions)
      .attr("d", path)
      .attr("data-name", getFeatureName)
      .attr("fill", getFeatureColor)
      .attr("class", featureClass);

    regions.exit().remove();

    renderGlobePlaces();
  }


  function renderGlobePlaces() {
    if (!state.globe.placeLayer) {
      return;
    }

    const path = state.globe.path;

    const visible = getVisiblePlaces()
      .filter(isFeatureVisibleOnGlobe);

    const places = state.globe.placeLayer
      .selectAll("path.historical-place")
      .data(
        visible,
        placeKey
      );

    places
      .enter()
      .append("path")
      .attr(
        "class",
        "historical-place"
      )
      .on(
        "mouseenter",
        handlePlaceEnter
      )
      .on(
        "mouseleave",
        handlePlaceLeave
      )
      .merge(places)
      .attr("d", feature => {
        const coordinates =
          getCoordinates(feature);

        if (!coordinates) {
          return null;
        }

        return path({
          type: "Point",
          coordinates
        });
      });

    places.exit().remove();
  }


  function startGlobeAutoRotate() {
    stopGlobeAutoRotate();

    let previous = Date.now();

    state.globe.autoRotateTimer =
      window.setInterval(() => {

        if (
          state.globe.dragging ||
          state.view !== "globe" ||
          !state.globe.projection
        ) {
          previous = Date.now();
          return;
        }

        const now = Date.now();

        const elapsed =
          (now - previous) / 1000;

        previous = now;

        const rotate =
          state.globe.projection.rotate();

        state.globe.projection.rotate([
          rotate[0] +
            elapsed *
              CONFIG.globe
                .autoRotateDegreesPerSecond,
          rotate[1],
          rotate[2]
        ]);

        renderGlobeView();
      }, 50);
  }


  function stopGlobeAutoRotate() {
    if (state.globe.autoRotateTimer) {
      clearInterval(
        state.globe.autoRotateTimer
      );

      state.globe.autoRotateTimer = null;
    }
  }


  /* ----------------------------------------------------------
     VIEW SWITCHING

     Exactly one view is visible at a time:
       "atlas" -> flat D3 map (default)
       "map"   -> Leaflet slippy map
       "globe" -> D3 orthographic 3D globe
     ---------------------------------------------------------- */

  function setView(view) {
    if (!CONFIG.views.includes(view)) {
      return;
    }

    state.view = view;

    if (view === "map") {
      initializeLeaflet();
    }

    if (view === "globe") {
      initializeGlobe();
    }

    document
      .querySelectorAll(".map-view")
      .forEach(element => {
        element.classList.toggle(
          "active",
          element.id ===
            viewElementId(view)
        );
      });

    document
      .querySelectorAll(".view-button")
      .forEach(button => {
        button.classList.toggle(
          "active",
          button.dataset.view === view
        );
      });

    if (globeHintElement) {
      globeHintElement.hidden =
        view !== "globe";
    }

    if (view === "globe") {
      startGlobeAutoRotate();
    } else {
      stopGlobeAutoRotate();
    }

    if (
      view === "map" &&
      state.leaflet.map
    ) {
      /*
        Leaflet must recompute its size after being
        un-hidden, then be re-centered on the data.
      */

      state.leaflet.map.invalidateSize();

      renderLeafletView();
    } else {
      renderLeafletView();
    }

    if (view === "globe") {
      renderGlobeView();
    }

    updateURLState();
  }


  function viewElementId(view) {
    if (view === "map") {
      return leafletElement
        ? leafletElement.id
        : "leafletMap";
    }

    if (view === "globe") {
      return globeElement
        ? globeElement.id
        : "globe";
    }

    return mapElement
      ? mapElement.id
      : "map";
  }


  function initializeViewSwitch() {
    if (!viewSwitchElement) {
      return;
    }

    viewSwitchElement
      .querySelectorAll(".view-button")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => setView(button.dataset.view)
        );
      });
  }


  /* ----------------------------------------------------------
     ENTITY SELECTION (SHARED BY ALL VIEWS)
     ---------------------------------------------------------- */

  function selectEntityByName(name) {
    state.selectedEntity =
      name && state.selectedEntity !== name
        ? name
        : null;

    renderMap();
    updateEntityList();
    updateURLState();
  }


  /* ----------------------------------------------------------
     MAP CLICK
     ---------------------------------------------------------- */

  function initializeMapClick() {
    if (!state.svg) {
      return;
    }

    state.svg.on(
      "click",
      () => {

        if (
          state.selectedEntity
        ) {
          state.selectedEntity =
            null;

          renderMap();
          updateEntityList();
        }
      }
    );
  }


  /* ----------------------------------------------------------
     ESCAPE HTML
     ---------------------------------------------------------- */

  function escapeHtml(value) {
    return String(value)
      .replaceAll(
        "&",
        "&amp;"
      )
      .replaceAll(
        "<",
        "&lt;"
      )
      .replaceAll(
        ">",
        "&gt;"
      )
      .replaceAll(
        '"',
        "&quot;"
      )
      .replaceAll(
        "'",
        "&#039;"
      );
  }


  /* ----------------------------------------------------------
     DEBOUNCE
     ---------------------------------------------------------- */

  function debounce(
    callback,
    delay
  ) {
    let timeout;

    return (...args) => {

      clearTimeout(
        timeout
      );

      timeout =
        setTimeout(
          () => {
            callback(...args);
          },
          delay
        );
    };
  }


  /* ----------------------------------------------------------
     INITIALIZE
     ---------------------------------------------------------- */

  async function initialize() {
    if (state.initialized) {
      return;
    }

    state.initialized =
      true;

    try {

      setLoading(
        true,
        "Loading historical atlas…"
      );

      clearError();

      /*
        Load the index first.

        This gives us the complete timeline
        without loading hundreds of GeoJSON
        files.
      */

      await loadIndex();

      /*
        Initialize the map.
      */

      initializeMap();

      /*
        Initialize controls.
      */

      initializeTimeline();
      initializeNavigation();
      initializeSearch();
      initializeKeyboard();
      initializeURLSync();
      initializeMapClick();
      initializeViewSwitch();

      /*
        Places are optional. Loading them in
        parallel prevents them from blocking
        the political map.
      */

      loadPlaces()
        .then(() => {
          renderPlaces();
        })
        .catch(error => {
          console.warn(
            "Places unavailable:",
            error
          );
        });

      /*
        Determine initial year.

        URL ?year=1492 takes priority.
      */

      const urlState =
        readURLState();

      /*
        Restore the requested view (?view=map|globe)
        before the first map loads so it renders into
        the correct view from the start.
      */

      if (urlState.view) {
        setView(urlState.view);
      }

      let initialIndex =
        findInitialYear();

      if (
        urlState.year !== null
      ) {

        const requestedYear =
          Number(
            urlState.year
          );

        let closest =
          Infinity;

        state.years.forEach(
          (record, index) => {

            const difference =
              Math.abs(
                record.year -
                requestedYear
              );

            if (
              difference <
              closest
            ) {
              closest =
                difference;

              initialIndex =
                index;
            }
          }
        );
      }

      /*
        Select initial entity from URL
        after map loads.
      */

      await setYearIndex(
        initialIndex
      );

      if (
        urlState.entity
      ) {
        state.selectedEntity =
          urlState.entity;

        renderMap();
        updateEntityList();
      }

      updateURLState();

      setLoading(false);

      console.log(
        "Historical Atlas initialized.",
        {
          years:
            state.years.length,
          firstYear:
            state.years[0]?.year,
          lastYear:
            state.years[
              state.years.length - 1
            ]?.year
        }
      );

    } catch (error) {

      state.initialized =
        false;

      setLoading(false);

      showError(
        error.message ||
        "Unable to initialize the Historical Atlas."
      );

      console.error(
        "Historical Atlas initialization failed:",
        error
      );
    }
  }


  /* ----------------------------------------------------------
     PUBLIC API
     ----------------------------------------------------------

     Expose a tiny API so other scripts can
     interact with the atlas later.

     Example:

       Atlas.setYear(1492)
       Atlas.play()
       Atlas.pause()
       Atlas.next()
     ---------------------------------------------------------- */

  window.Atlas = {

    setYear,

    next: nextYear,

    previous: previousYear,

    play: startPlayback,

    pause: stopPlayback,

    togglePlay: togglePlayback,

    setView,

    getState() {
      return {
        year:
          state.currentYear,

        yearIndex:
          state.currentYearIndex,

        years:
          [...state.years],

        selectedEntity:
          state.selectedEntity,

        playing:
          state.playing,

        view:
          state.view,

        featureCount:
          state.currentFeatures.length
      };
    }
  };


  /* ----------------------------------------------------------
     BOOT
     ---------------------------------------------------------- */

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      {
        once: true
      }
    );

  } else {

    initialize();

  }

})();
