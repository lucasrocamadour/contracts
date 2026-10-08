from __future__ import annotations

from datetime import date, datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ANALYZED_ROOT = BASE_DIR.parent / "analyzed"


def resolve_table_path(governor: str, table: str) -> Path:
  base = Path(str(table)).stem
  candidate = ANALYZED_ROOT / governor / table
  if candidate.exists():
    return candidate

  alt = ANALYZED_ROOT / governor / f"{table}.parquet"
  if alt.exists():
    return alt

  fallback = ANALYZED_ROOT / governor / f"{base}.parquet"
  if fallback.exists():
    return fallback

  raise FileNotFoundError(f"Table file not found for analyzed/{governor}/{table}")


def build_scan_expression(path: Path) -> str:
  escaped = path.as_posix().replace("'", "''")
  if path.suffix.lower() != ".parquet":
    raise ValueError("Only .parquet files are supported.")
  return f"parquet_scan('{escaped}')"


def quote_ident(name: str) -> str:
  return '"' + name.replace('"', '""') + '"'


def to_jsonable(value):
  if value is None:
    return None
  if isinstance(value, (datetime, date)):
    return value.isoformat()
  if isinstance(value, (bytes, bytearray)):
    return value.decode("utf-8", "ignore")
  return value
