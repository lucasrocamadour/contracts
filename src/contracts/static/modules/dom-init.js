import { state, GOV_PATHS, TABLE_SUMMARIES, buildApiUrl } from "./app-core.js";
import { FULL_TABLE_HIDDEN_COLUMNS } from "./table-config.js";
import {
  renderFixedPiesForGovernor,
  renderTableSummariesForGovernor,
  renderFullTableForGovernor,
} from "./charts-tables.js";

const $ = (id) => document.getElementById(id);

function setOptions(sel, items = []) {
  if (!sel) return;
  sel.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const item of items) {
    const opt = document.createElement("option");
    if (typeof item === "string") {
      opt.value = opt.textContent = item;
    } else {
      opt.value = item.value;
      opt.textContent = item.label ?? item.value;
    }
    frag.appendChild(opt);
  }
  sel.appendChild(frag);
}

function safeAddListener(el, evt, cb) {
  if (el) el.addEventListener(evt, cb);
}

function ensureOverlay() {
  let el = document.getElementById("appOverlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "appOverlay";
    el.innerHTML = '<div class="spinner" aria-label="Loading…"></div>';
    document.body.appendChild(el);
  }
  return el;
}

function showOverlay() {
  ensureOverlay().classList.remove("hidden");
}

function hideOverlay() {
  ensureOverlay().classList.add("hidden");
}

const VIEW_CONFIG = {
  overview: {
    sectionId: "overviewView",
    type: "overview",
  },
  contractors: {
    sectionId: "contractorsView",
    table: "Combined_by_Contractors",
    containerId: "contractorsFullBody",
    sortColumn: "Total Amount",
    ascending: false,
    limit: 10,
    hiddenKey: "Combined_by_Contractors",
  },
  services: {
    sectionId: "servicesView",
    table: "Combined_by_Service",
    containerId: "servicesFullBody",
    sortColumn: "Total Amount",
    ascending: false,
    limit: 10,
    hiddenKey: "Combined_by_Service",
  },
  entidades: {
    sectionId: "entidadesView",
    table: "Combined_by_EntityName",
    containerId: "entidadesFullBody",
    sortColumn: "Total Amount",
    ascending: false,
    limit: 10,
    hiddenKey: "Combined_by_EntityName",
  },
};

const getViewConfig = (view) => VIEW_CONFIG[view] || null;

function updateViewButtons(activeView) {
  const buttons = document.querySelectorAll(".view-nav__btn");
  buttons.forEach((btn) => {
    const view = btn?.dataset?.view;
    const isActive = view === activeView;
    btn.classList.toggle("is-active", isActive);
    if (btn instanceof HTMLElement) {
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  });
}

function applyViewVisibility(activeView) {
  for (const [viewKey, config] of Object.entries(VIEW_CONFIG)) {
    const section = document.getElementById(config.sectionId);
    if (section) {
      section.classList.toggle("hidden", activeView !== viewKey);
    }
  }
}

function waitForImageLoad(img) {
  return new Promise((resolve) => {
    if (!img) return resolve();
    if (img.complete && img.naturalWidth > 0) return resolve();
    const done = () => {
      img.removeEventListener("load", done);
      img.removeEventListener("error", done);
      resolve();
    };
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
}

function waitForFonts() {
  if (document.fonts?.ready) {
    return document.fonts.ready.catch(() => {});
  }
  return Promise.resolve();
}

async function updateLatestUpdate(governor, myGen) {
  const el = $("govLatestUpdate");
  if (!el) return;
  el.textContent = "Updating...";
  try {
    const url = buildApiUrl("/api/latest-update");
    url.searchParams.set("governor", governor);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`latest-update ${res.status}`);
    const data = await res.json();
    let text = "Unavailable";
    const raw = data?.latest_update ?? null;
    if (raw) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.valueOf())) {
        text = parsed.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      } else if (typeof raw === "string") {
        text = raw;
      }
    }
    if (typeof myGen === "number" && myGen !== state.govChangeGen) return;
    el.textContent = text;
  } catch (err) {
    console.error("Failed to load latest update:", err);
    if (typeof myGen === "number" && myGen !== state.govChangeGen) return;
    el.textContent = "Unavailable";
  }
}

async function renderViewForGovernor(view, governor, myGen) {
  if (!governor) return;

  const config = getViewConfig(view);
  if (!config) return;

  if (config.type === "overview") {
    const tableBaseNames = TABLE_SUMMARIES.map((t) => t.baseName);
    await renderFixedPiesForGovernor(governor, tableBaseNames);
    if (typeof myGen === "number" && myGen !== state.govChangeGen) return;
    await renderTableSummariesForGovernor(governor);
    return;
  }

  const hiddenColumns =
    (config.hiddenKey && FULL_TABLE_HIDDEN_COLUMNS?.[config.hiddenKey]) || null;

  const containerEl = document.getElementById(config.containerId);
  if (containerEl) {
    containerEl.dataset.offset = "0";
  }

  await renderFullTableForGovernor(governor, {
    table: config.table,
    containerId: config.containerId,
    limit: config.limit,
    sortColumn: config.sortColumn,
    ascending: config.ascending,
    hiddenColumns,
  });
  if (typeof myGen === "number" && myGen !== state.govChangeGen) return;
}

function changeActiveView(view) {
  if (!view || state.activeView === view) {
    updateViewButtons(state.activeView);
    applyViewVisibility(state.activeView);
    return;
  }

  state.activeView = view;
  updateViewButtons(view);
  applyViewVisibility(view);

  const governor = state.currentGovernor;
  if (!governor) return;

  const myGen = state.govChangeGen;
  showOverlay();
  renderViewForGovernor(view, governor, myGen)
    .catch((err) => {
      console.error(`renderViewForGovernor(${view}) error:`, err);
    })
    .finally(() => {
      if (myGen === state.govChangeGen) hideOverlay();
    });
}

function setupViewNavigation() {
  const buttons = document.querySelectorAll(".view-nav__btn");
  buttons.forEach((btn) => {
    safeAddListener(btn, "click", (event) => {
      const target = event.currentTarget;
      const view = target?.dataset?.view;
      if (!view) return;
      changeActiveView(view);
    });
  });

  updateViewButtons(state.activeView);
  applyViewVisibility(state.activeView);
}

async function refreshSelectors() {
  try {
    const sel = $("gov");
    if (!sel) {
      console.warn("refreshSelectors: no #gov select found in DOM.");
      return;
    }
    if (sel.options && sel.options.length > 0) {
      sel.selectedIndex = sel.selectedIndex >= 0 ? sel.selectedIndex : 0;
      await onGovernorChange();
      return;
    }

    const labels = Object.keys(GOV_PATHS);
    const opts = labels.map((label) => ({ value: GOV_PATHS[label], label }));
    setOptions(sel, opts);
    sel.selectedIndex = 0;
    await onGovernorChange();
  } catch (err) {
    console.error("Failed to refresh selectors:", err);
  }
}

export async function onGovernorChange() {
  const myGen = ++state.govChangeGen;
  showOverlay();

  try {
    const sel = $("gov");
    if (!sel) return;
    const chosenOption = sel.selectedOptions?.[0];
    if (!chosenOption) return;

    const visibleLabel = chosenOption.textContent.trim();
    const resolvedPath =
      (chosenOption.value && String(chosenOption.value).trim()) || GOV_PATHS[visibleLabel] || "";
    if (!resolvedPath) {
      console.warn("onGovernorChange: could not resolve governor path for", visibleLabel);
      return;
    }

    const nameEl = $("govName");
    if (nameEl) {
      nameEl.textContent = visibleLabel;
    }

    sel.dataset.govPath = resolvedPath;
    state.currentGovernor = resolvedPath;

    state.rowOffset = 0;
    state.lastPageCount = 0;

    const img = $("govPhoto");
    if (img) {
      const photoUrl = buildApiUrl("/api/photo");
      photoUrl.searchParams.set("governor", resolvedPath);
      img.src = photoUrl.toString();
      img.onerror = () => {
        img.removeAttribute("src");
        img.alt = "No photo";
      };
      await waitForImageLoad(img);
      if (myGen !== state.govChangeGen) return;
    }

    await updateLatestUpdate(resolvedPath, myGen);
    if (myGen !== state.govChangeGen) return;

    await renderViewForGovernor(state.activeView, resolvedPath, myGen);
    if (myGen !== state.govChangeGen) return;
  } catch (err) {
    console.error("onGovernorChange error:", err);
  } finally {
    if (myGen === state.govChangeGen) hideOverlay();
  }
}

export function bootstrapApp() {
  safeAddListener($("gov"), "change", onGovernorChange);

  setupViewNavigation();

  window.addEventListener("load", async () => {
    try {
      showOverlay();
      await waitForFonts();
      await refreshSelectors();
      await waitForImageLoad($("govPhoto"));
    } catch (err) {
      console.error("bootstrap error:", err);
    } finally {
      hideOverlay();
    }
  });
}
