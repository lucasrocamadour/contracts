from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from datetime import datetime, timezone
from typing import List
import duckdb
from .modules.table_full import get_full_table
from .modules.table_top5 import get_top5_table
from .modules.pr_pie import pr_pie

# -------------------- DO NOT CHANGE PATHS --------------------
BASE = Path(__file__).parent.resolve()
ANALYZED = BASE / "analyzed"
PHOTOS = BASE / "photos"
# -------------------------------------------------------------

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")

def _validate_parquet_path(p: Path) -> Path:
    if not p.exists():
        raise HTTPException(404, f"File not found: {p}")
    if p.suffix.lower() != ".parquet":
        raise HTTPException(400, "Only .parquet supported.")
    return p

@app.get("/")
def root():
    return FileResponse(BASE / "static" / "index.html")

@app.get("/api/governors")
def list_governors():
    items = sorted([d.name for d in ANALYZED.glob("*") if d.is_dir()])
    return {"governors": items}

@app.get("/api/tables")
def list_tables(governor: str):
    gdir = ANALYZED / governor
    if not gdir.exists():
        raise HTTPException(404, "Governor folder not found.")
    files = sorted([f.name for f in gdir.glob("*.*") if f.suffix.lower() == ".parquet"])
    return {"tables": files}

@app.get("/api/columns")
def list_columns(governor: str, table: str):
    parquet_path = _validate_parquet_path(ANALYZED / governor / table)
    try:
        with duckdb.connect() as conn:
            rows = conn.execute(
                "DESCRIBE SELECT * FROM read_parquet(?)",
                [str(parquet_path)],
            ).fetchall()
    except Exception as e:
        raise HTTPException(400, f"Error reading {parquet_path.name}: {e}")
    return {"columns": [str(row[0]) for row in rows]}

# server-side canonical projection + rename map (defaults for UI)


def _parse_rename_param(rename_str: str):
    """
    Accepts format: orig1:New1,orig2:New2
    Returns dict {orig1: New1, ...}
    """
    if not rename_str:
        return {}
    out = {}
    for pair in rename_str.split(","):
        if ":" not in pair:
            continue
        k, v = pair.split(":", 1)
        out[k.strip()] = v.strip()
    return out

@app.get("/api/table")
def pr_table(
    governor: str,
    table: str,
    limit: int,
    offset: int = Query(0, ge=0),
    sort_col: str = "Contractor",
    sort_dir: str = "DESC",
    raw: bool = Query(False),
    top5: bool = Query(False),
    columns: List[str] | None = Query(None),
):
    if top5:
        return get_top5_table(governor, table, limit, offset, sort_col, sort_dir, raw, columns)
    return get_full_table(governor, table, limit, offset, sort_col, sort_dir, raw, columns)


@app.get("/api/pie")
def pie(
    governor: str,
    table: str,
    label_col: str,
    value_col: str,
    top: int = 6,
    include_others: bool = True,
    others_label: str = "Others"
):
    return pr_pie(governor,table,label_col,value_col,top,include_others,others_label)



@app.get("/api/latest-update")
def latest_update(governor: str):
    gdir = ANALYZED / governor
    if not gdir.exists():
        raise HTTPException(404, "Governor folder not found.")

    latest_ts = None
    for path in gdir.rglob("*.parquet"):
        try:
            ts = path.stat().st_mtime
        except FileNotFoundError:
            continue
        if latest_ts is None or ts > latest_ts:
            latest_ts = ts

    if latest_ts is None:
        return {"latest_update": None}

    dt = datetime.fromtimestamp(latest_ts, tz=timezone.utc)
    return {"latest_update": dt.isoformat()}


@app.get("/api/photo")
def photo(governor: str):
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        p = PHOTOS / f"{governor}{ext}"
        if p.exists():
            return FileResponse(p)
    raise HTTPException(404, "Photo not found.")
