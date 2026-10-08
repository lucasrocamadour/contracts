from __future__ import annotations

from typing import List, Optional

import duckdb

from .table_utils import build_scan_expression, quote_ident, resolve_table_path, to_jsonable

ALL_COLUMNS = None


def _prepare_requested_columns(columns: Optional[List[str]] = None) -> List[str]:
  if not columns:
    return []
  seen = set()
  cleaned: List[str] = []
  for value in columns:
    if not isinstance(value, str):
      continue
    name = value.strip()
    if not name or name in seen:
      continue
    seen.add(name)
    cleaned.append(name)
  return cleaned


def get_full_table(
  governor: str,
  table: str,
  limit: int = 10,
  offset: int = 0,
  sort_col: str = "Contractor",
  sort_dir: str = "DESC",
  raw: bool = False,
  columns: Optional[List[str]] = None,
):
  candidate = resolve_table_path(governor, table)
  scan = build_scan_expression(candidate)

  conn = duckdb.connect(database=":memory:")
  try:
    cur = conn.cursor()
    cur.execute(f"SELECT * FROM {scan} LIMIT 0;")
    desc = cur.description or []
    cols: List[str] = [c[0] for c in desc]

    requested_columns = _prepare_requested_columns(columns)

    asc = str(sort_dir).strip().lower() == "asc"
    do_sort = sort_col in cols
    requested_sort = {
      "requested": sort_col,
      "resolved_orig": sort_col if do_sort else None,
      "resolved_ui": None,
      "ascending": asc,
    }

    if raw:
      order_clause = f" ORDER BY {quote_ident(sort_col)} {'ASC' if asc else 'DESC'}" if do_sort else ""
      sql = f"SELECT * FROM {scan}{order_clause} LIMIT {int(limit)} OFFSET {int(offset)};"
      cur.execute(sql)
      rows = cur.fetchall()
      out_schema = [c[0] for c in cur.description]

      selected_schema = out_schema[:]
      if requested_columns:
        filtered = [c for c in out_schema if c in requested_columns]
        if filtered:
          selected_schema = filtered

      selected_set = set(selected_schema)
      out_rows = []
      for row in rows:
        record = {}
        for key, value in zip(out_schema, row):
          if key not in selected_set:
            continue
          record[key] = to_jsonable(value)
        out_rows.append(record)

      total = conn.execute(f"SELECT COUNT(*) FROM {scan};").fetchone()[0]
      return {
        "rows": out_rows,
        "total": int(total),
        "schema": selected_schema,
        "requested_sort": requested_sort,
      }

    if requested_columns:
      base_columns = requested_columns
    elif ALL_COLUMNS is None:
      base_columns = cols
    else:
      base_columns = ALL_COLUMNS

    if base_columns is None:
      base_columns = cols

    available = [c for c in base_columns if c in cols]
    if not available:
      return {"rows": [], "total": 0, "schema": [], "requested_sort": requested_sort}

    select_items = [f"{quote_ident(c)} AS {quote_ident(c)}" for c in available]
    select_clause = ", ".join(select_items)
    order_clause = f" ORDER BY {quote_ident(sort_col)} {'ASC' if asc else 'DESC'}" if do_sort else ""
    sql = f"SELECT {select_clause} FROM {scan}{order_clause} LIMIT {int(limit)} OFFSET {int(offset)};"

    cur.execute(sql)
    data = cur.fetchall()

    out_rows = []
    for row in data:
      record = {}
      for key, value in zip(available, row):
        record[key] = to_jsonable(value)
      out_rows.append(record)

    total = conn.execute(f"SELECT COUNT(*) FROM {scan};").fetchone()[0]
    return {"rows": out_rows, "total": int(total), "schema": available, "requested_sort": requested_sort}
  finally:
    conn.close()
