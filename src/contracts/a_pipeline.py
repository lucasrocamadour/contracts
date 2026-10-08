from datetime import datetime
from pathlib import Path

from .step1_scrape import run_t
from .step2_normalizedates import normalizedates
from .step3_normalizenames import normalizenames
from .step4_merge import merge_names
from .step5_fix import main_fix
from .combined import main_combined


def main() -> None:
    current_year = datetime.now().year

    # Download current year (must run before transforms).
    print(current_year)
    run_t(current_year)

    # Ensure the downloader produced the expected file for this year.
    base_dir = Path(__file__).resolve().parent
    raw_path = base_dir / "download/1a_contracts_raw" / f"contracts_{current_year}.parquet"
    if not raw_path.exists():
        raise FileNotFoundError(f"Missing raw contracts file after download step: {raw_path}")

    # Normalize, merge, and apply manual fixes
    print(current_year)
    normalizedates(current_year)
    normalizenames(current_year)
    merge_names(current_year)
    main_fix(current_year)

    # Runs all analysis
    governor = "Gonzalez"
    date_from = "2025-01-02"
    date_to = "2029-01-01"
    metrics = ["Contractors", "Service", "EntityName"]

    for metric in metrics:
        print(date_from, date_to)
        print(metric)
        print(governor)
        main_combined(date_from, date_to, governor, metric)


if __name__ == "__main__":
    main()
