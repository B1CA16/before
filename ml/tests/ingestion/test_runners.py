from datetime import date

from before_surf.ingestion.runners import archive_window


def test_archive_window_spans_one_year_with_lag():
    start, end = archive_window(date(2026, 7, 23), days=365, lag_days=5)
    assert end == "2026-07-18"  # today minus 5 days
    assert start == "2025-07-18"  # end minus 365 days


def test_archive_window_custom_days():
    start, end = archive_window(date(2026, 1, 10), days=30, lag_days=0)
    assert end == "2026-01-10"
    assert start == "2025-12-11"
