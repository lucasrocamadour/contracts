from pathlib import Path

import duckdb
from fastapi import HTTPException

BASE_DIR = Path(__file__).resolve().parent
ANALYZED_ROOT = BASE_DIR.parent / "analyzed"

def pr_pie(governor: str,
    table: str,
    label_col: str,
    value_col: str,
    top: int = 6,
    include_others: bool = True,
    others_label: str = "Resto"
    ):
    # --- resolve file under analyzed/<governor>/<table>.parquet ---
    base = (ANALYZED_ROOT / governor / table)  # ANALYZED is your existing global
    if base.exists():
        file_path = base
    else:
        cand = base.with_suffix(".parquet")
        if not cand.exists():
            raise HTTPException(404, f"Table not found under analyzed/{governor}: {table}")
        file_path = cand
    if file_path.suffix.lower() != ".parquet":
        raise HTTPException(400, "Only .parquet files are supported.")
    reader = "read_parquet(?)"
    # simple identifier quoting (double quotes)
    def qident(name: str) -> str:
        return '"' + name.replace('"', '""') + '"'
    con = duckdb.connect(database=":memory:")
    try:
        # validate columns exist
        cols = [r[0] for r in con.execute(
            f"DESCRIBE SELECT * FROM {reader}", [str(file_path)]
        ).fetchall()]
        if label_col not in cols or value_col not in cols:
            raise HTTPException(400, "Bad column names.")
        lbl = qident(label_col)
        val = qident(value_col)
        # Top-N groups (sum over numeric-coerced values)
        top_rows = con.execute(
            f"""
            WITH src AS (SELECT * FROM {reader}),
            agg AS (
                SELECT
                    CAST({lbl} AS VARCHAR) AS label,
                    SUM(TRY_CAST({val} AS DOUBLE)) AS value
                FROM src
                GROUP BY 1
            )
            SELECT label, value
            FROM agg
            ORDER BY value DESC NULLS LAST
            LIMIT ?
            """,
            [str(file_path), top]
        ).fetchall()
        labels = [str(r[0]) for r in top_rows]  # str(None) -> "None", matches original
        values = [None if r[1] is None else float(r[1]) for r in top_rows]
        # Optional "Others": sum of all remaining groups beyond Top-N
        if include_others:
            cnt, other_sum = con.execute(
                f"""
                WITH src AS (SELECT * FROM {reader}),
                agg AS (
                    SELECT
                        CAST({lbl} AS VARCHAR) AS label,
                        SUM(TRY_CAST({val} AS DOUBLE)) AS value
                    FROM src
                    GROUP BY 1
                ),
                ranked AS (
                    SELECT
                        label,
                        value,
                        ROW_NUMBER() OVER (ORDER BY value DESC NULLS LAST) AS rn
                    FROM agg
                )
                SELECT COUNT(*), SUM(value)
                FROM ranked
                WHERE rn > ?
                """,
                [str(file_path), top]
            ).fetchone()
            if cnt and other_sum is not None and abs(other_sum) > 0:
                labels.append(others_label)
                values.append(float(other_sum))
        return {"labels": labels, "values": values}
    finally:
        con.close()
