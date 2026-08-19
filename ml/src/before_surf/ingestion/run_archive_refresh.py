"""Re-fetch archive conditions for the recent past, so logged sessions gain ground truth.

A session logged today can only be paired with `forecast` conditions, because that is all we hold
for an hour that has only just happened. Training on those teaches the model to reproduce the
forecast instead of the ocean: the circularity trap in another guise. This job closes the gap.

Separate from run_backfill, which fetches a whole year and exists to be run once.
"""

from before_surf.ingestion.runners import run

# Sized from the schedule, not picked round. The job runs weekly and the archive lags 5 days, so the
# newest settled hour is already up to 12 days old when a run sees it. 21 absorbs that plus a missed
# run, and re-fetching hours we already hold is free: the upsert is idempotent.
TRAILING_DAYS = 21


def main() -> None:
    run("archive", archive_days=TRAILING_DAYS)


if __name__ == "__main__":
    main()
