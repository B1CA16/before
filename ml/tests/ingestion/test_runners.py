from datetime import date, timedelta

from before_surf.ingestion.runners import archive_window, chunked


def test_archive_window_spans_one_year_with_lag():
    start, end = archive_window(date(2026, 7, 23), days=365, lag_days=5)
    assert end == "2026-07-18"  # today minus 5 days
    assert start == "2025-07-18"  # end minus 365 days


def test_archive_window_custom_days():
    start, end = archive_window(date(2026, 1, 10), days=30, lag_days=0)
    assert end == "2026-01-10"
    assert start == "2025-12-11"


def test_chunked_splits_with_remainder():
    items = [1, 2, 3, 4, 5]
    assert chunked(items, 2) == [[1, 2], [3, 4], [5]]
    assert chunked(items, 5) == [[1, 2, 3, 4, 5]]
    assert chunked([], 3) == []


def test_the_refresh_window_covers_the_gap_between_weekly_runs():
    """The window must reach back past what the previous run could possibly have seen.

    A run on any Monday can only see settled archive data up to 5 days earlier. The run before it,
    7 days prior, saw up to 12 days before today. Anything shorter than 12 days leaves hours that no
    run ever fetches, and those sessions keep their forecast conditions forever.
    """
    from before_surf.ingestion.run_archive_refresh import TRAILING_DAYS

    today = date(2026, 8, 24)
    start, end = archive_window(today, days=TRAILING_DAYS)
    assert end == "2026-08-19", "the 5 day lag should still hold"
    # Reaches past the oldest hour the previous weekly run could have reached.
    oldest_seen_by_previous_run = today - timedelta(days=7 + 5)
    assert date.fromisoformat(start) < oldest_seen_by_previous_run
    # And absorbs one missed run without leaving a hole.
    assert date.fromisoformat(start) <= today - timedelta(days=14 + 5)


def test_the_refresh_window_is_far_shorter_than_the_one_off_backfill():
    """Weekly runs must not re-fetch a year: that is 92 spots times 8,760 hours, every week."""
    from before_surf.ingestion.run_archive_refresh import TRAILING_DAYS

    assert TRAILING_DAYS < 60
