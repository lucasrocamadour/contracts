import {
  state,
  PIE_TABLES,
  TABLE_SUMMARIES,
  PIE_COLS_BY_TABLE,
  api,
  resolveTableFilename,
} from "./app-core.js";
import { FULL_TABLE_HIDDEN_COLUMNS } from "./table-config.js";

// Configure Chart.js defaults (global Chart loaded via CDN in index.html)
if (typeof Chart !== "undefined") {
  Chart.defaults.responsive = true;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.devicePixelRatio = 1;
}

function ensureChartShell(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  if (canvas.parentElement?.classList.contains("chart-wrap")) {
    return canvas.parentElement;
  }

  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  wrap.id = `${canvasId}-wrap`;

  const title = document.createElement("div");
  title.className = "chart-title";
  title.id = `${canvasId}-title`;

  const subtitle = document.createElement("div");
  subtitle.className = "chart-subtitle";
  subtitle.id = `${canvasId}-subtitle`;

  const parent = canvas.parentElement || document.body;
  parent.replaceChild(wrap, canvas);
  wrap.appendChild(title);
  wrap.appendChild(subtitle);
  wrap.appendChild(canvas);

  return wrap;
}

function ensureCanvasSize(canvas, px = 230) {
  canvas.style.width = `${px}px`;
  canvas.style.height = `${px}px`;
  canvas.setAttribute("width", px);
  canvas.setAttribute("height", px);
  canvas.width = px;
  canvas.height = px;
}

const PIE_COLOR_VARS = [
  "--pie-color-1",
  "--pie-color-2",
  "--pie-color-3",
  "--pie-color-4",
  "--pie-color-5",
  "--pie-color-6",
  "--pie-color-7",
  "--pie-color-8",
  "--pie-color-9",
  "--pie-color-10",
  "--pie-color-11",
];

const PIE_COLOR_FALLBACK = "#87cefa";

function getPiePalette(count) {
  if (typeof document === "undefined") {
    return Array.from({ length: count }, () => PIE_COLOR_FALLBACK);
  }

  const style = getComputedStyle(document.documentElement);
  const colors = PIE_COLOR_VARS.map((name) => style.getPropertyValue(name).trim()).filter(Boolean);
  if (!colors.length) {
    return Array.from({ length: count }, () => PIE_COLOR_FALLBACK);
  }

  const palette = [];
  for (let i = 0; i < count; i += 1) {
    palette.push(colors[i % colors.length]);
  }
  return palette;
}

export function drawPie(
  canvasId,
  { labels = [], values = [] } = {},
  titleText = "",
  subtitleText = "",
  valueFormat = null,
  valueFormatOptions = null
) {
  if (typeof Chart === "undefined") return;

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const wrap = ensureChartShell(canvasId);
  if (wrap) {
    const titleEl = document.getElementById(`${canvasId}-title`);
    const subtitleEl = document.getElementById(`${canvasId}-subtitle`);
    if (titleEl) titleEl.textContent = typeof titleText === "string" ? titleText : "";
    if (subtitleEl) subtitleEl.textContent = typeof subtitleText === "string" ? subtitleText : "";
  }

  const ctx = canvas.getContext("2d");
  ensureCanvasSize(canvas, 230);

  if (state.charts[canvasId]) {
    try {
      state.charts[canvasId].destroy();
    } catch (_) {
      // ignore
    }
    delete state.charts[canvasId];
  }

  const palette = getPiePalette(values.length);
  const othersIndex = labels.findIndex(
    (label) =>
      typeof label === "string" &&
      ["resto", "others"].includes(label.trim().toLowerCase())
  );
  let background = palette;
  if (othersIndex !== -1 && palette.length) {
    background = new Array(values.length);
    background[othersIndex] = palette[0];
    let colorCursor = 1;
    for (let i = 0; i < values.length; i += 1) {
      if (i === othersIndex) continue;
      background[i] = palette[colorCursor % palette.length];
      colorCursor += 1;
    }
  }

  const resolvedFormatOptions =
    valueFormat && valueFormatOptions && typeof valueFormatOptions === "object"
      ? valueFormatOptions
      : valueFormat
      ? {}
      : null;

  const formatPieValue = (value) => {
    if (valueFormat) {
      const formatted = formatValue(value, valueFormat, resolvedFormatOptions || {});
      return formatted === "—" ? "" : formatted;
    }
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.length ? value.join(", ") : "";
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numberFormatter1.format(numeric);
    }
    return String(value);
  };

  const tooltipHost = wrap || canvas.parentElement || document.body;

  const getOrCreateTooltip = () => {
    if (!tooltipHost) return null;
    let tooltipEl = tooltipHost.querySelector(".chart-tooltip");
    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.className = "chart-tooltip";
      tooltipHost.appendChild(tooltipEl);
    }
    return tooltipEl;
  };

  const externalTooltipHandler = (context) => {
    const { chart, tooltip } = context || {};
    const tooltipEl = getOrCreateTooltip();
    if (!tooltipEl || !tooltip) return;

    if (tooltip.opacity === 0) {
      tooltipEl.style.opacity = "0";
      return;
    }

    const lines = (tooltip.dataPoints || []).map((dp) => {
      const label = dp?.label ? String(dp.label) : "";
      const valueText = formatPieValue(dp?.raw ?? dp?.parsed ?? null);
      if (label && valueText) return `${label}: ${valueText}`;
      return label || valueText || "";
    }).filter(Boolean);

    tooltipEl.innerHTML = lines.length ? lines.map((line) => `<div>${line}</div>`).join("") : "";
    tooltipEl.style.opacity = lines.length ? "1" : "0";

    const canvasRect = chart?.canvas?.getBoundingClientRect?.() || { left: 0, top: 0 };
    const hostRect = tooltipHost?.getBoundingClientRect?.() || { left: 0, top: 0 };
    const left = (tooltip.caretX ?? 0) + canvasRect.left - hostRect.left;
    const top = (tooltip.caretY ?? 0) + canvasRect.top - hostRect.top;
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
  };

  state.charts[canvasId] = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: background,
          borderColor: "#ffffff",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: true },
      layout: {
        padding: 16,
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false, external: externalTooltipHandler },
        title: { display: false },
        subtitle: { display: false },
      },
    },
  });
}

export async function renderFixedPiesForGovernor(governor, allFiles = [], pieConfigs = PIE_TABLES) {
  if (!governor || !Array.isArray(allFiles)) return;

  const tasks = [];

  for (const spec of pieConfigs) {
    const file = resolveTableFilename(allFiles, spec.baseName) ?? spec.baseName;
    const uiTitle = typeof spec.displayName === "string" ? spec.displayName : "";
    const uiDesc = typeof spec.description === "string" ? spec.description : "";

    const tableMappings = PIE_COLS_BY_TABLE[spec.baseName] || null;
    const cols =
      spec.labelCol && spec.valueCol
        ? { label: spec.labelCol, value: spec.valueCol }
        : tableMappings &&
          (tableMappings[spec.canvasId] ||
            tableMappings.default ||
            (tableMappings.label && tableMappings.value ? tableMappings : null));

    if (!cols || !cols.label || !cols.value) {
      console.warn(`[pies] Missing manual column mapping for ${spec.baseName}`);
      drawPie(
        spec.canvasId,
        { labels: [], values: [] },
        uiTitle,
        uiDesc,
        spec.format || null,
        spec.formatOptions || null
      );
      continue;
    }

    tasks.push(
      (async () => {
        try {
          const raw = await api("/api/pie", {
            governor,
    table: file,
    label_col: cols.label,
    value_col: cols.value,
    top: spec.topN,
  });

          let payload = { labels: [], values: [] };
          if (raw && Array.isArray(raw.labels) && Array.isArray(raw.values)) {
            payload = { labels: raw.labels, values: raw.values };
          } else if (raw && Array.isArray(raw.rows)) {
            const labels = [];
            const values = [];
            for (const row of raw.rows) {
              const lbl = row[cols.label];
              const val = row[cols.value];
              labels.push(lbl == null ? "" : String(lbl));
              const numeric = Number(val);
              values.push(Number.isFinite(numeric) ? numeric : 0);
            }
            payload = { labels, values };
          }

          drawPie(
            spec.canvasId,
            payload,
            uiTitle,
            uiDesc,
            spec.format || null,
            spec.formatOptions || null
          );
        } catch (err) {
          console.error("Pie fetch error for canvas", spec.canvasId, ":", err);
          drawPie(
            spec.canvasId,
            { labels: [], values: [] },
            uiTitle,
            uiDesc,
            spec.format || null,
            spec.formatOptions || null
          );
        }
      })()
    );
  }

  await Promise.all(tasks);
}

const currencyFormatter0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const currencyFormatter2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const numberFormatter0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const numberFormatter1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const DEFAULT_COLUMN_WIDTH = 200;
const MIN_COLUMN_WIDTH = 96;
const MAX_COLUMN_WIDTH = 640;
const tableColumnWidths = new Map();

function getColumnWidthState(key) {
  let state = tableColumnWidths.get(key);
  if (!state) {
    state = new Map();
    tableColumnWidths.set(key, state);
  }
  return state;
}

function clampColumnWidth(width) {
  if (!Number.isFinite(width)) return DEFAULT_COLUMN_WIDTH;
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width));
}

function applyColumnWidthStyles(target, width) {
  const clamped = clampColumnWidth(width);
  const px = `${clamped}px`;
  target.style.width = px;
  target.style.minWidth = px;
  target.style.maxWidth = px;
  return clamped;
}

function formatValue(value, format, opts = {}) {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "—";
  }

  switch (format) {
    case "currency": {
      const decimals = Number.isInteger(opts.decimals) ? opts.decimals : 0;
      const num = Number(value);
      if (!Number.isFinite(num)) return String(value);
      return decimals > 0 ? currencyFormatter2.format(num) : currencyFormatter0.format(num);
    }
    case "number": {
      const decimals = Number.isInteger(opts.decimals) ? opts.decimals : 0;
      const num = Number(value);
      if (!Number.isFinite(num)) return String(value);
      return decimals > 0 ? numberFormatter1.format(num) : numberFormatter0.format(num);
    }
    case "percent": {
      const num = Number(value);
      if (!Number.isFinite(num)) return String(value);
      const ratio = opts.base100 === false ? num : Math.abs(num) > 1 ? num / 100 : num;
      return percentFormatter.format(ratio);
    }
    case "years": {
      const num = Number(value);
      if (!Number.isFinite(num)) return String(value);
      return numberFormatter1.format(num);
    }
    default:
      return String(value);
  }
}

const FULL_TABLE_COLUMN_FORMATS = {
  "Total Amount": { format: "currency", decimals: 0 },
  "All_TotalAmountInContracts": { format: "currency", decimals: 0 },
  AmountToPay: { format: "currency", decimals: 0 },
  TotalAmount: { format: "currency", decimals: 0 },
  "Canceled Contracts": { format: "number", decimals: 0 },
  "Unique Contracts": { format: "number", decimals: 0 },
  UniqueContracts: { format: "number", decimals: 0 },
  Rows: { format: "number", decimals: 0 },
  TotalUniqueContracts: { format: "number", decimals: 0 },
  DurationYears: { format: "number", decimals: 1 },
  "Proportion of Total Amount": { format: "percent" },
  "Proportion of Total Canceled Contracts": { format: "percent" },
  PercentOfTotal: { format: "percent" },


  "Proportion of Contracts by Contractor and Total Contracts": { format: "percent" },
"Proportion of Contracts by Entity and Total Contracts": { format: "percent" },
"Proportion of Contracts by Service and Total Contracts": { format: "percent" },
};

const NUMERIC_FORMAT_TYPES = new Set(["currency", "number", "percent"]);

const CENTERED_FULL_TABLES = new Set([
  "Combined_by_Contractors",
  "Combined_by_Service",
  "Combined_by_EntityName",
]);

const CONTRACT_IDS_COLUMN_REGEX = /contractids/i;

let contractIdsModalState = null;

function columnNameLooksLikePercent(name) {
  return typeof name === "string" && name.includes("%");
}

function isContractIdsColumn(columnName) {
  return typeof columnName === "string" && CONTRACT_IDS_COLUMN_REGEX.test(columnName);
}

function normalizeContractIds(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  const text = String(value).trim();
  if (!text) return [];
  if (text.includes(",")) {
    return text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [text];
}

function ensureContractIdsModal() {
  if (contractIdsModalState) return contractIdsModalState;

  const overlay = document.createElement("div");
  overlay.id = "contractIdsOverlay";
  overlay.className = "contractids-overlay hidden";
  overlay.setAttribute("aria-hidden", "true");

  const modal = document.createElement("div");
  modal.className = "contractids-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "contractIdsModalTitle");

  const header = document.createElement("header");
  header.className = "contractids-modal__header";

  const title = document.createElement("h3");
  title.className = "contractids-modal__title";
  title.id = "contractIdsModalTitle";
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "contractids-modal__close";
  closeBtn.textContent = "Close";
  closeBtn.setAttribute("aria-label", "Close ContractIDs window");
  header.appendChild(closeBtn);

  modal.appendChild(header);

  const body = document.createElement("div");
  body.className = "contractids-modal__body";
  modal.appendChild(body);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => {
    closeContractIdsModal();
  };

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  const escapeHandler = (event) => {
    if (event.key === "Escape" && !overlay.classList.contains("hidden")) {
      close();
    }
  };
  document.addEventListener("keydown", escapeHandler);

  contractIdsModalState = {
    overlay,
    modal,
    title,
    body,
    closeBtn,
    escapeHandler,
    lastTrigger: null,
  };

  return contractIdsModalState;
}

function closeContractIdsModal() {
  if (!contractIdsModalState) return;
  const { overlay, lastTrigger } = contractIdsModalState;
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  if (lastTrigger instanceof HTMLElement) {
    try {
      lastTrigger.focus({ preventScroll: true });
    } catch (err) {
      lastTrigger.focus();
    }
  }
  contractIdsModalState.lastTrigger = null;
}

function openContractIdsModal(columnLabel, ids = [], trigger = null) {
  const stateRef = ensureContractIdsModal();
  stateRef.lastTrigger = trigger instanceof HTMLElement ? trigger : null;
  stateRef.title.textContent = columnLabel || "ContractIDs";
  stateRef.body.innerHTML = "";

  if (Array.isArray(ids) && ids.length) {
    const list = document.createElement("ul");
    list.className = "contractids-list";
    ids.forEach((id) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = `https://consultacontratos.ocpr.gov.pr/contract/details?contractid=${encodeURIComponent(
        id
      )}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = id;
      li.appendChild(link);
      list.appendChild(li);
    });
    stateRef.body.appendChild(list);
  } else {
    const empty = document.createElement("div");
    empty.className = "contractids-empty";
    empty.textContent = "No ContractIDs available.";
    stateRef.body.appendChild(empty);
  }

  stateRef.overlay.classList.remove("hidden");
  stateRef.overlay.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    try {
      stateRef.closeBtn.focus({ preventScroll: true });
    } catch (err) {
      stateRef.closeBtn.focus();
    }
  });
}

function createTableSummaryCard(spec) {
  const card = document.createElement("article");
  card.className = "table-summary-card";
  card.setAttribute("role", "listitem");

  const header = document.createElement("header");
  header.className = "table-summary-card__header";
  const title = document.createElement("h3");
  title.className = "table-summary-card__title";
  title.textContent = spec.displayName || spec.baseName;
  header.appendChild(title);

  if (spec.description) {
    const desc = document.createElement("p");
    desc.className = "table-summary-card__desc";
    desc.textContent = spec.description;
    header.appendChild(desc);
  }

  const body = document.createElement("div");
  body.className = "table-summary-card__body";
  const status = document.createElement("div");
  status.className = "table-summary-card__status";
  status.textContent = "Loading...";
  body.appendChild(status);

  card.appendChild(header);
  card.appendChild(body);

  return card;
}

function renderSummaryTable(card, spec, rows) {
  const body = card.querySelector(".table-summary-card__body");
  if (!body) return;
  body.innerHTML = "";

  if (!rows || rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "table-summary-card__status";
    empty.textContent = "No data available.";
    body.appendChild(empty);
    return;
  }

  const table = document.createElement("table");
  table.className = "summary-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  const rankTh = document.createElement("th");
  rankTh.className = "summary-table__rank";
  rankTh.textContent = "#";
  headRow.appendChild(rankTh);

  for (const col of spec.columns) {
    const th = document.createElement("th");
    if (col.className) th.className = col.className;
    th.textContent = col.label || col.key;
    headRow.appendChild(th);
  }

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const limit = spec.limit ?? 5;

  rows.slice(0, limit).forEach((row, idx) => {
    const tr = document.createElement("tr");

    const rankTd = document.createElement("td");
    rankTd.className = "summary-table__rank";
    rankTd.textContent = String(idx + 1);
    tr.appendChild(rankTd);

    for (const col of spec.columns) {
      const td = document.createElement("td");
      if (col.className) td.className = col.className;
      const raw = row[col.key];
      const formatted = col.format
        ? formatValue(raw, col.format, col)
        : raw === null || raw === undefined
        ? "—"
        : String(raw);

      td.textContent = formatted;

      if (td.classList.contains("summary-table__name")) {
        if (raw !== null && raw !== undefined && raw !== "—") {
          td.title = String(raw);
        } else if (formatted && formatted !== "—") {
          td.title = formatted;
        } else {
          td.removeAttribute("title");
        }
      }
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  body.appendChild(table);

  if (spec.note) {
    const footer = document.createElement("div");
    footer.className = "table-summary-card__footer";
    footer.textContent = spec.note;
    body.appendChild(footer);
  }
}

export async function renderTableSummariesForGovernor(governor) {
  const container = document.getElementById("tableSummaryGrid");
  if (!container) return;
  container.innerHTML = "";

  if (!governor) return;

  const cards = TABLE_SUMMARIES.map((spec) => {
    const card = createTableSummaryCard(spec);
    container.appendChild(card);
    return { spec, card };
  });

  await Promise.all(
    cards.map(async ({ spec, card }) => {
      const body = card.querySelector(".table-summary-card__body");
      try {
        const params = {
          governor,
          table: spec.baseName,
          limit: spec.limit ?? 5,
          top5: true,
        };

        if (spec.sort?.column) {
          params.column = spec.sort.column;
          params.ascending = !!spec.sort.ascending;
        }

        const requestedColumns = [];
        for (const col of spec.columns) {
          if (col.key) requestedColumns.push(col.key);
        }
        if (spec.sort?.column) requestedColumns.push(spec.sort.column);
        if (spec.extraColumns) {
          for (const extra of spec.extraColumns) {
            requestedColumns.push(extra);
          }
        }

        if (requestedColumns.length) {
          params.columns = Array.from(new Set(requestedColumns));
        }

        const data = await api("/api/table", params);
        const rows = data && Array.isArray(data.rows) ? data.rows : [];
        renderSummaryTable(card, spec, rows);
      } catch (err) {
        if (body) {
          body.innerHTML = "";
          const error = document.createElement("div");
          error.className = "table-summary-card__status";
          error.textContent = "Could not load table.";
          body.appendChild(error);
        }
        console.error(`Error loading ${spec.baseName}:`, err);
      }
    })
  );
}

export async function renderFullTableForGovernor(
  governor,
  {
    table = "Combined_by_Contractors",
    containerId = "contractorsFullBody",
    limit = 10,
    offset = 0,
    sortColumn = "Total Amount",
    ascending = false,
    hiddenColumns = null,
  } = {}
) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const previousScrollWrapper = container.querySelector(".table-full__scroll");
  const previousViewState = {
    pageY: window.scrollY,
    scrollLeft: previousScrollWrapper ? previousScrollWrapper.scrollLeft : 0,
    scrollTop: previousScrollWrapper ? previousScrollWrapper.scrollTop : 0,
    focusColumn:
      container.contains(document.activeElement) && document.activeElement?.dataset?.column
        ? document.activeElement.dataset.column
        : null,
  };
  const previousHeight = container.offsetHeight;
  const hadMinHeight = previousHeight > 0;
  if (hadMinHeight) {
    container.style.minHeight = `${previousHeight}px`;
  }

  let scroll = null;
  const widthKey = `${table}::${containerId}`;
  const widthState = getColumnWidthState(widthKey);
  const centerNonFirstColumns = CENTERED_FULL_TABLES.has(table);

  const rawStoredOffset = Number.parseInt(container.dataset.offset || "0", 10);
  const storedOffset = Number.isFinite(rawStoredOffset) && rawStoredOffset >= 0 ? rawStoredOffset : 0;
  const effectiveOffset = Number.isFinite(offset) && offset >= 0 ? offset : storedOffset;

  const rawStoredLimit = Number.parseInt(container.dataset.limit || String(limit), 10);
  const storedLimit = Number.isFinite(rawStoredLimit) && rawStoredLimit > 0 ? rawStoredLimit : limit;
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? limit : storedLimit || 10;

  const effectiveSortColumn =
    typeof sortColumn === "string" && sortColumn
      ? sortColumn
      : container.dataset.sortColumn || null;
  const effectiveAscending =
    typeof ascending === "boolean"
      ? ascending
      : container.dataset.sortAscending === "1";

  container.dataset.sortColumn = effectiveSortColumn || "";
  container.dataset.sortAscending = effectiveAscending ? "1" : "0";
  container.dataset.offset = String(effectiveOffset);
  container.dataset.limit = String(effectiveLimit);
  container.dataset.loading = "1";

  container.innerHTML = "";

  if (!governor) {
    const status = document.createElement("div");
    status.className = "table-full__status";
    status.textContent = "Select a governor to view the information.";
    container.appendChild(status);
    container.dataset.loading = "0";
    if (hadMinHeight) container.style.removeProperty("min-height");
    return;
  }

  const loading = document.createElement("div");
  loading.className = "table-full__status";
  loading.textContent = "Loading...";
  container.appendChild(loading);

  try {
    const params = {
      governor,
      table,
      limit: effectiveLimit,
      offset: effectiveOffset,
      column: effectiveSortColumn || undefined,
      ascending: effectiveAscending,
      top5: false,
    };

    if (!effectiveSortColumn) {
      delete params.column;
    }

    const data = await api("/api/table", params);
    container.innerHTML = "";

    const rows = data && Array.isArray(data.rows) ? data.rows : [];
    const rawSchema = data && Array.isArray(data.schema) ? data.schema : [];

    const resolvedHidden = Array.isArray(hiddenColumns) && hiddenColumns.length
      ? hiddenColumns
      : FULL_TABLE_HIDDEN_COLUMNS[table] || null;

    const schema = Array.isArray(resolvedHidden)
      ? rawSchema.filter((col) => !resolvedHidden.includes(col))
      : rawSchema;

    const activeColumns = new Set(schema);
    for (const storedCol of Array.from(widthState.keys())) {
      if (!activeColumns.has(storedCol)) {
        widthState.delete(storedCol);
      }
    }

    const sortIndicatorColumn = schema.includes(effectiveSortColumn)
      ? effectiveSortColumn
      : null;

    if (!rows.length || !schema.length) {
      const empty = document.createElement("div");
      empty.className = "table-full__status";
      empty.textContent = "No data available.";
      container.appendChild(empty);
      return;
    }

    const requestSort = (nextColumn, nextAscending) => {
      if (!nextColumn) return;
      if (container.dataset.loading === "1") return;
      renderFullTableForGovernor(governor, {
        table,
        containerId,
        limit: effectiveLimit,
        offset: 0,
        sortColumn: nextColumn,
        ascending: nextAscending,
        hiddenColumns,
      }).catch((err) => {
        console.error(`renderFullTableForGovernor sort error (${table}):`, err);
      });
    };

    scroll = document.createElement("div");
    scroll.className = "table-full__scroll";

    const tableEl = document.createElement("table");
    tableEl.className = "table-full__table";

    const colgroup = document.createElement("colgroup");
    const colElements = new Map();
    let schemaColIndex = 0;
    for (const columnName of schema) {
      const colEl = document.createElement("col");
      colEl.dataset.column = columnName;
      let storedWidth = widthState.get(columnName);
      const desiredDefaultWidth =
        schemaColIndex === 0 ? DEFAULT_COLUMN_WIDTH * 2 : DEFAULT_COLUMN_WIDTH;
      if (schemaColIndex === 0 && storedWidth === DEFAULT_COLUMN_WIDTH) {
        storedWidth = desiredDefaultWidth;
      }
      if (!Number.isFinite(storedWidth) || storedWidth <= 0) {
        storedWidth = desiredDefaultWidth;
        widthState.set(columnName, storedWidth);
      }
      const appliedWidth = applyColumnWidthStyles(colEl, storedWidth);
      widthState.set(columnName, appliedWidth);
      colgroup.appendChild(colEl);
      colElements.set(columnName, colEl);
      schemaColIndex += 1;
    }
    tableEl.appendChild(colgroup);

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (let colIdx = 0; colIdx < schema.length; colIdx += 1) {
      const col = schema[colIdx];
      const th = document.createElement("th");
      th.scope = "col";
      th.dataset.column = col;
      th.title = `Sort by ${col}`;
      th.tabIndex = 0;
      th.classList.add("table-full__th--sortable");
      if (centerNonFirstColumns && colIdx > 0) {
        th.classList.add("table-full__th--center");
      }

      const label = document.createElement("span");
      label.className = "table-full__th-label";
      label.textContent = col;
      th.appendChild(label);

      const isActiveSort = sortIndicatorColumn === col;
      if (isActiveSort) {
        th.classList.add("table-full__th--sorted");
        th.dataset.sortDir = effectiveAscending ? "asc" : "desc";
        th.setAttribute("aria-sort", effectiveAscending ? "ascending" : "descending");
      } else {
        delete th.dataset.sortDir;
        th.setAttribute("aria-sort", "none");
      }

      const handleSort = () => {
        if (container.dataset.loading === "1") return;
        const nextAscending = isActiveSort ? !effectiveAscending : false;
        requestSort(col, nextAscending);
      };

      th.addEventListener("click", (event) => {
        event.preventDefault();
        handleSort();
      });
      th.addEventListener("keydown", (event) => {
        if (
          event.key === "Enter" ||
          event.key === " " ||
          event.key === "Spacebar" ||
          event.key === "Space"
        ) {
          event.preventDefault();
          handleSort();
        }
      });

      const colEl = colElements.get(col);
      if (colEl) {
        const storedWidth = widthState.get(col);
        if (Number.isFinite(storedWidth)) {
          applyColumnWidthStyles(th, storedWidth);
        }
      }
      if (colEl) {
        const resizer = document.createElement("span");
        resizer.className = "table-full__col-resizer";
        resizer.dataset.column = col;
        resizer.setAttribute("aria-hidden", "true");

        const beginResize = (event) => {
          if (event.button !== undefined && event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          const startX = event.clientX;
          const pointerId = event.pointerId;
          const startWidth = clampColumnWidth(colEl.getBoundingClientRect().width);

          const handlePointerMove = (moveEvent) => {
            if (
              (pointerId !== undefined && moveEvent.pointerId !== undefined && moveEvent.pointerId !== pointerId) ||
              (moveEvent.pointerType === "mouse" && moveEvent.buttons === 0)
            )
              return;
            moveEvent.preventDefault();
            moveEvent.stopPropagation();
            const delta = moveEvent.clientX - startX;
            const nextWidth = clampColumnWidth(startWidth + delta);
            applyColumnWidthStyles(colEl, nextWidth);
            applyColumnWidthStyles(th, nextWidth);
            widthState.set(col, nextWidth);
            const tbodyEl = tableEl.tBodies?.[0];
            if (tbodyEl) {
              for (const rowEl of tbodyEl.rows) {
                const cell = rowEl.cells?.[colIdx];
                if (cell) applyColumnWidthStyles(cell, nextWidth);
              }
            }
          };

          const endResize = (endEvent) => {
            if (pointerId !== undefined && endEvent?.pointerId !== undefined && endEvent.pointerId !== pointerId) {
              return;
            }
            document.removeEventListener("pointermove", handlePointerMove);
            document.removeEventListener("pointerup", endResize);
            document.removeEventListener("pointercancel", endResize);
            document.body.classList.remove("table-full__resize-active");
          };

          document.addEventListener("pointermove", handlePointerMove);
          document.addEventListener("pointerup", endResize);
          document.addEventListener("pointercancel", endResize);
          document.body.classList.add("table-full__resize-active");
        };

        resizer.addEventListener("pointerdown", beginResize);
        resizer.addEventListener("click", (event) => event.stopPropagation());
        resizer.addEventListener("dblclick", (event) => event.stopPropagation());

        th.classList.add("table-full__th--resizable");
        th.appendChild(resizer);
      }

      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    tableEl.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const row of rows) {
      const tr = document.createElement("tr");
      for (let colIdx = 0; colIdx < schema.length; colIdx += 1) {
        const col = schema[colIdx];
        const td = document.createElement("td");
        td.dataset.column = col;
        const hasValue = row && Object.prototype.hasOwnProperty.call(row, col);
        const value = hasValue ? row[col] : null;
        const columnFormat = FULL_TABLE_COLUMN_FORMATS[col] || null;
        const autoPercentColumn = !columnFormat && columnNameLooksLikePercent(col);
        const isNumericFormat = columnFormat && NUMERIC_FORMAT_TYPES.has(columnFormat.format);
        const treatAsNumeric = isNumericFormat || autoPercentColumn;
        const isContractColumn = isContractIdsColumn(col);

        if (treatAsNumeric) {
          td.classList.add("table-full__cell--numeric");
        }
        if (centerNonFirstColumns && colIdx > 0) {
          td.classList.add("table-full__cell--center");
        }

        if (isContractColumn) {
          td.classList.add("table-full__cell--contractids");
          const ids = normalizeContractIds(value);
          const button = document.createElement("button");
          button.type = "button";
          button.className = "table-full__contractids-btn";
          button.textContent = "IDs";

          if (ids.length) {
            button.title = ids.join(", ");
            button.setAttribute("aria-label", `View ${col}`);
            button.addEventListener("click", (event) => {
              event.preventDefault();
              openContractIdsModal(col, ids, button);
            });
          } else {
            button.disabled = true;
            button.setAttribute("aria-label", `No data for ${col}`);
          }

          td.appendChild(button);
        } else {
          let displayText = "";
          if (columnFormat) {
            const { format, ...options } = columnFormat;
            const formatted = formatValue(value, format, options);
            displayText = formatted === "—" ? "" : formatted;
          } else if (autoPercentColumn) {
            const formatted = formatValue(value, "percent", {});
            displayText = formatted === "—" ? "" : formatted;
          } else if (value === null || value === undefined) {
            displayText = "";
          } else if (Array.isArray(value)) {
            displayText = value.length ? value.join(", ") : "";
          } else {
            displayText = String(value);
          }

          td.textContent = displayText;
        }

        const storedWidth = widthState.get(col);
        applyColumnWidthStyles(td, Number.isFinite(storedWidth) ? storedWidth : DEFAULT_COLUMN_WIDTH);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    tableEl.appendChild(tbody);

    if (sortIndicatorColumn) {
      const sortInfo = document.createElement("div");
      sortInfo.className = "table-full__status table-full__status--sort";
      sortInfo.textContent = effectiveAscending
        ? `Sorted ascending by ${sortIndicatorColumn}`
        : `Sorted descending by ${sortIndicatorColumn}`;
      container.appendChild(sortInfo);
    }

    scroll.appendChild(tableEl);
    container.appendChild(scroll);

    const totalCount = typeof data?.total === "number" ? data.total : null;

    const pagination = document.createElement("div");
    pagination.className = "table-full__pagination";

    const hasPrev = effectiveOffset > 0;
    const hasNext = totalCount !== null
      ? effectiveOffset + rows.length < totalCount
      : rows.length === effectiveLimit;

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "table-full__pager-btn";
    prevBtn.textContent = "Previous";
    prevBtn.disabled = !hasPrev;
    prevBtn.addEventListener("click", (event) => {
      event.preventDefault();
      if (container.dataset.loading === "1" || !hasPrev) return;
      const nextOffset = Math.max(0, effectiveOffset - effectiveLimit);
      renderFullTableForGovernor(governor, {
        table,
        containerId,
        limit: effectiveLimit,
        offset: nextOffset,
        sortColumn: effectiveSortColumn,
        ascending: effectiveAscending,
        hiddenColumns,
      }).catch((err) => {
        console.error(`renderFullTableForGovernor prev error (${table}):`, err);
      });
    });

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "table-full__pager-btn";
    nextBtn.textContent = "Next";
    nextBtn.disabled = !hasNext;
    nextBtn.addEventListener("click", (event) => {
      event.preventDefault();
      if (container.dataset.loading === "1" || !hasNext) return;
      const nextOffset = effectiveOffset + effectiveLimit;
      renderFullTableForGovernor(governor, {
        table,
        containerId,
        limit: effectiveLimit,
        offset: nextOffset,
        sortColumn: effectiveSortColumn,
        ascending: effectiveAscending,
        hiddenColumns,
      }).catch((err) => {
        console.error(`renderFullTableForGovernor next error (${table}):`, err);
      });
    });

    const pageSummary = document.createElement("span");
    pageSummary.className = "table-full__pager-summary";
    if (rows.length) {
      const startIdx = effectiveOffset + 1;
      const endIdx = effectiveOffset + rows.length;
      if (totalCount !== null) {
        pageSummary.textContent = `Showing ${startIdx}-${endIdx} of ${totalCount}`;
      } else {
        pageSummary.textContent = `Showing ${startIdx}-${endIdx}`;
      }
    } else {
      pageSummary.textContent = "No records";
    }

    pagination.appendChild(prevBtn);
    pagination.appendChild(pageSummary);
    pagination.appendChild(nextBtn);

    container.appendChild(pagination);

    if (totalCount !== null) {
      const meta = document.createElement("div");
      meta.className = "table-full__status table-full__status--info";
      meta.textContent = `Total records: ${totalCount}`;
      container.appendChild(meta);
    }

    requestAnimationFrame(() => {
      if (scroll) {
        if (Number.isFinite(previousViewState.scrollLeft)) {
          scroll.scrollLeft = previousViewState.scrollLeft;
        }
        if (Number.isFinite(previousViewState.scrollTop)) {
          scroll.scrollTop = previousViewState.scrollTop;
        }
      }
      if (Number.isFinite(previousViewState.pageY)) {
        const targetY = previousViewState.pageY;
        if (Math.abs(window.scrollY - targetY) > 1) {
          window.scrollTo(0, targetY);
        }
      }
      if (previousViewState.focusColumn) {
        const candidate = Array.from(
          container.querySelectorAll("th[data-column]")
        ).find((el) => el.dataset.column === previousViewState.focusColumn);
        if (candidate instanceof HTMLElement) {
          try {
            candidate.focus({ preventScroll: true });
          } catch (err) {
            candidate.focus();
          }
        }
      }
    });
  } catch (err) {
    container.innerHTML = "";
    const error = document.createElement("div");
    error.className = "table-full__status table-full__status--error";
    error.textContent = "Could not load table.";
    container.appendChild(error);
    requestAnimationFrame(() => {
      if (Number.isFinite(previousViewState.pageY)) {
        const targetY = previousViewState.pageY;
        if (Math.abs(window.scrollY - targetY) > 1) {
          window.scrollTo(0, targetY);
        }
      }
    });
    throw err;
  } finally {
    container.dataset.loading = "0";
    if (hadMinHeight) {
      container.style.removeProperty("min-height");
    }
  }
}
