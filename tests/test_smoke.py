import importlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import duckdb
from fastapi.testclient import TestClient

app_module = importlib.import_module("contracts.app")
table_utils = importlib.import_module("contracts.modules.table_utils")
pie_module = importlib.import_module("contracts.modules.pr_pie")


class SmokeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        governor = self.root / "Gonzalez"
        governor.mkdir()
        path = governor / "Combined_by_Contractors.parquet"
        with duckdb.connect() as db:
            db.execute("CREATE TABLE sample AS SELECT 'Example A' AS Contractor, 100.0 AS \"Total Amount\" UNION ALL SELECT 'Example B', 50.0")
            db.execute("COPY sample TO ? (FORMAT PARQUET)", [str(path)])
        for obj, name in ((app_module, "ANALYZED"), (table_utils, "ANALYZED_ROOT"), (pie_module, "ANALYZED_ROOT")):
            patcher = patch.object(obj, name, self.root)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = TestClient(app_module.app)
        self.addCleanup(self.client.close)

    def test_home_and_static(self):
        self.assertEqual(self.client.get("/").status_code, 200)
        self.assertEqual(self.client.get("/static/main.js").status_code, 200)

    def test_governors_tables_and_columns(self):
        self.assertEqual(self.client.get("/api/governors").json(), {"governors": ["Gonzalez"]})
        self.assertEqual(self.client.get("/api/tables", params={"governor": "Gonzalez"}).json()["tables"], ["Combined_by_Contractors.parquet"])
        response = self.client.get("/api/columns", params={"governor": "Gonzalez", "table": "Combined_by_Contractors.parquet"})
        self.assertEqual(response.json()["columns"], ["Contractor", "Total Amount"])

    def test_table_and_pie(self):
        params = {"governor": "Gonzalez", "table": "Combined_by_Contractors.parquet", "limit": 10, "sort_col": "Total Amount"}
        response = self.client.get("/api/table", params=params)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total"], 2)
        response = self.client.get("/api/pie", params={"governor": "Gonzalez", "table": "Combined_by_Contractors", "label_col": "Contractor", "value_col": "Total Amount"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["values"], [100.0, 50.0])

    def test_pipeline_package_import(self):
        pipeline = importlib.import_module("contracts.a_pipeline")
        self.assertTrue(callable(pipeline.main))


if __name__ == "__main__":
    unittest.main()
