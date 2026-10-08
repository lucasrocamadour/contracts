export const state = {
  charts: {},
  govChangeGen: 0,
  rowLimit: 10,
  rowOffset: 0,
  lastPageCount: 0,
  activeView: "overview",
  currentGovernor: "",
};

const API_BASE = new URL("./api/", window.location.href);

export function buildApiUrl(path = "") {
  if (!path) {
    return new URL(API_BASE.toString());
  }
  if (/^https?:\/\//i.test(path)) {
    return new URL(path);
  }
  let relative = String(path);
  if (relative.startsWith("/")) {
    relative = relative.slice(1);
  }
  if (relative.startsWith("api/")) {
    relative = relative.slice(4);
  } else if (relative === "api" || relative === "api/") {
    relative = "";
  }
  return new URL(relative, API_BASE);
}

export const GOV_PATHS = {
  Fortuño: "analyzed/Fortuño",

  Padilla: "analyzed/Padilla",
  Pierluisi: "analyzed/pierluisi",
  "Pierluisi(De_Facto)": "analyzed/pierluisi_de_facto",
  Rosello: "analyzed/rosello",
  Vazquez: "analyzed/vazquez",
  Gonzalez: "analyzed/gonzalez",
};

export const PIE_TABLES = [
  {
    canvasId: "pie1",
    baseName: "Combined_by_Service",
    displayName: "Services - % of Total Amount",
    description: "Percentage of total contract amount attributable to each service.",
    labelCol: "Service",
    valueCol: "% Total Amount",
    topN: 10,
    format: "percent",
    formatOptions: { decimals: 1 },
  },
  {
    canvasId: "pie2",
    baseName: "Combined_by_Service",
    displayName: "Services - % Canceled Contracts",
    description: "Percentage of unique canceled contracts attributable to each service.",
    labelCol: "Service",
    valueCol: "% Canceled Contracts",
    topN: 10,
    format: "percent",
    formatOptions: { decimals: 1 },
  },
  {
    canvasId: "pie3",
    baseName: "Combined_by_Contractors",
    displayName: "Top 10 Contractors by Dollars",
    description: "Top 10 contractors by total contract amount (USD).",
    labelCol: "Contractor",
    valueCol: "Total Amount",
    topN: 10,
    format: "currency",
    formatOptions: { decimals: 0 },
  },
];


// Top 5 Tables
export const TABLE_SUMMARIES = [
  {
    id: "summary-contractors-cuantia",
    baseName: "Combined_by_Contractors",
    displayName: "Contractors by Amount",
    description: "Top unique contractors sorted by aggregated amount.",
    limit: 5,
    sort: { column: "Total Amount", ascending: false },
    columns: [
      { key: "Contractor", label: "Contractor", className: "summary-table__name" },
      {
        key: "Total Amount",
        label: "Amount",
        format: "currency",
        decimals: 0,
        className: "summary-table__value summary-table__value--money",
      },
      {
        key: "% Total Amount",
        label: "%",
        format: "percent",
        className: "summary-table__value summary-table__value--final",
      },
    ],
  },

  {
    id: "summary-most-unique",
    baseName: "Combined_by_Contractors",
    displayName: "Contractors by Contracts",
    description: "Contractors with the highest number of contracts.",
    limit: 5,
    sort: { column: "Unique Contracts", ascending: false },
    columns: [
      { key: "Contractor", label: "Contractor", className: "summary-table__name" },
      {
        key: "Unique Contracts",
        label: "Contracts",
        format: "number",
        decimals: 0,
        className: "summary-table__value summary-table__value--number",
      },
      {
        key: "% Total Contracts",
        label: "%",
        format: "percent",
        className: "summary-table__value summary-table__value--final",
      },
    ],
  },

  {
    id: "summary-services-cuantia",
    baseName: "Combined_by_Service",
    displayName: "Services by Amount",
    description: "Services with the highest share of total contract amount.",
    limit: 5,
    sort: { column: "Total Amount", ascending: false },
    columns: [
      { key: "Service", label: "Service", className: "summary-table__name" },
      {
        key: "Total Amount",
        label: "Amount",
        format: "currency",
        decimals: 0,
        className: "summary-table__value summary-table__value--money",
      },
      {
        key: "% Total Amount",
        label: "%",
        format: "percent",
        className: "summary-table__value summary-table__value--final",
      },
    ],
  },
  { // Most Canceled Services
    id: "summary-services-cancelled",
    baseName: "Combined_by_Service",
    displayName: "Most Canceled Services",
    description: "Services with the highest percentage of canceled contracts.",
    limit: 5,
    sort: { column: "% Canceled Contracts", ascending: false },
    columns: [
      { key: "Service", label: "Service", className: "summary-table__name" },
      {
        key: "Canceled Contracts",
        label: "Contracts",
        format: "number",
        decimals: 0,
        className: "summary-table__value summary-table__value--number",
      },
      {
        key: "% Canceled Contracts",
        label: "%",
        format: "percent",
        className: "summary-table__value summary-table__value--final",
      },
    ],
  },
  {
    id: "summary-entidades-cuantia",
    baseName: "Combined_by_EntityName",
    displayName: "Entities by Amount",
    description: "Entities with the highest aggregated contract amount.",
    limit: 5,
    sort: { column: "Total Amount", ascending: false },
    columns: [
      { key: "Entity", label: "Entity", className: "summary-table__name" },
      {
        key: "Total Amount",
        label: "Amount",
        format: "currency",
        decimals: 0,
        className: "summary-table__value summary-table__value--money",
      },
      {
        key: "% Total Amount",
        label: "%",
        format: "percent",
        className: "summary-table__value summary-table__value--final",
      },
    ],
  },
  { // Most Canceled Entities
    id: "summary-contractors-cancelled",
    baseName: "Combined_by_EntityName",
    displayName: "Entities with Most Cancellations",
    description: "Entities with the highest percentage of canceled contracts.",
    limit: 5,
    sort: { column: "% Canceled Contracts", ascending: false },
    columns: [
      { key: "Entity", label: "Entity", className: "summary-table__name" },
      {
        key: "Canceled Contracts",
        label: "Contracts",
        format: "number",
        decimals: 0,
        className: "summary-table__value summary-table__value--number",
      },
      {
        key: "% Canceled Contracts",
        label: "%",
        format: "percent",
        className: "summary-table__value summary-table__value--final",
      },
    ],
  },
];


// Pie Charts
export const PIE_COLS_BY_TABLE = {
};

export async function api(path, params = {}, opts = {}) {
  const p = Object.assign({}, params || {});

  if (Object.prototype.hasOwnProperty.call(p, "column")) {
    p.sort_col = p.column;
    delete p.column;
  }
  if (Object.prototype.hasOwnProperty.call(p, "ascending")) {
    p.sort_dir = p.ascending ? "ASC" : "DESC";
    delete p.ascending;
  }

  for (const k of Object.keys(p)) {
    if (p[k] === undefined || p[k] === null) {
      delete p[k];
    }
  }

  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item !== undefined && item !== null) usp.append(k, String(item));
      }
    } else {
      usp.append(k, String(v));
    }
  }
  const query = usp.toString();
  const target = buildApiUrl(path);
  if (query) {
    target.search = query;
  }

  const fetchOpts = Object.assign(
    {
      method: opts.method || "GET",
      headers: opts.headers || {},
    },
    opts.fetchOptions || {}
  );

  if (opts.body !== undefined && fetchOpts.method.toUpperCase() !== "GET") {
    if (typeof opts.body === "object" && !(opts.body instanceof FormData)) {
      fetchOpts.headers["Content-Type"] = fetchOpts.headers["Content-Type"] || "application/json";
      fetchOpts.body = JSON.stringify(opts.body);
    } else {
      fetchOpts.body = opts.body;
    }
  }

  const res = await fetch(target.toString(), fetchOpts);
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText || "API error");
    throw new Error(`${res.status} ${res.statusText}: ${txt}`);
  }
  return res.json();
}

export function resolveTableFilename(allFiles = [], baseName = "") {
  if (!Array.isArray(allFiles) || allFiles.length === 0 || !baseName) return null;
  const exact = allFiles.find(
    (f) => f === baseName || f === `${baseName}.parquet`
  );
  if (exact) return exact;

  const lowerBase = baseName.toLowerCase();
  const lowerFiles = allFiles.map((f) => ({ orig: f, lower: f.toLowerCase() }));
  const byPrefix = lowerFiles.find((x) => x.lower.startsWith(lowerBase));
  if (byPrefix) return byPrefix.orig;
  const byContains = lowerFiles.find((x) => x.lower.includes(lowerBase));
  return byContains ? byContains.orig : null;
}
