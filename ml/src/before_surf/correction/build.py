"""Build the shipped wind-correction artefact, and refuse to ship one that is not an improvement.

Run with `uv run python -m before_surf.correction.build`. It writes
`before_surf/artifacts/wind_correction.json`, which is committed to the repo: at about a kilobyte
it needs no object storage, and having the deployed coefficients visible in a diff is worth more
than the elegance of fetching them from somewhere.

The gate at the end matters more than the arithmetic. This runs again whenever the data grows, and
without a check the day will come when it quietly writes a table that is worse than doing nothing.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from before_surf.correction.artifact import (
    DEFAULT_PATH,
    WEB_COPY_PATH,
    WindCorrection,
    fit_correction,
)
from before_surf.correction.dataset import build_features, load_pairs, split_by_time
from before_surf.correction.evaluate import score


def evaluate_correction(correction: WindCorrection, holdout: pd.DataFrame) -> dict:
    """Score a table on rows it was not fitted on."""
    predicted = correction.lookup(holdout["observed_at"])
    corrected = score(holdout["error_kmh"], predicted)
    uncorrected = score(holdout["error_kmh"], pd.Series(0.0, index=holdout.index))
    return {
        "holdout_mae_kmh": round(corrected.mae, 4),
        "holdout_rmse_kmh": round(corrected.rmse, 4),
        "do_nothing_mae_kmh": round(uncorrected.mae, 4),
        "improvement_kmh": round(uncorrected.mae - corrected.mae, 4),
        "holdout_rows": corrected.n,
    }


def build(database_url: str, path: Path | None = None) -> tuple[WindCorrection, dict]:
    """Measure on the held-out weeks, then fit the shipped table on everything.

    Two fits, deliberately. The first exists only to produce an honest number, so it sees three
    quarters of the timeline. The second is what ships, and there is no reason to withhold data
    from it once the number has been obtained.
    """
    pairs = build_features(load_pairs(database_url))
    split = split_by_time(pairs)

    measured = fit_correction(split.train)
    report = evaluate_correction(measured, split.test)

    shipped = fit_correction(pairs)
    shipped = WindCorrection(
        by_local_hour=shipped.by_local_hour,
        fallback_kmh=shipped.fallback_kmh,
        timezone=shipped.timezone,
        metadata={
            # Deliberately the score of the table fitted on the training weeks only. Quoting the
            # shipped table's own fit would be quoting a number it was allowed to see the answers
            # for, and the whole milestone has been about not doing that.
            **report,
            "fitted_rows": int(len(pairs)),
            "fitted_hours": int(pairs["observed_at"].nunique()),
            "spots": int(pairs["spot"].nunique()),
            "data_from": str(pairs["observed_at"].min()),
            "data_to": str(pairs["observed_at"].max()),
            "hours_covered": len(shipped.by_local_hour),
            "note": (
                "Correction added to the forecast wind speed, keyed by local hour. Learned against "
                "ERA5 reanalysis, which is not the same thing as measured wind. See ADR-0009."
            ),
        },
    )

    if report["improvement_kmh"] <= 0:
        raise SystemExit(
            "Refusing to write the artefact: on the held-out weeks this table scores "
            f"{report['holdout_mae_kmh']} MAE against {report['do_nothing_mae_kmh']} for doing "
            "nothing. Serving it would make the forecast worse."
        )

    path = path or DEFAULT_PATH
    text = shipped.to_json() + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")

    # The web app's copy, written here so the two can never be updated separately. Skipped when the
    # caller asked for a specific output path, which is what the tests do.
    if path == DEFAULT_PATH and WEB_COPY_PATH.parent.exists():
        WEB_COPY_PATH.write_text(text, encoding="utf-8")
    return shipped, report


def main() -> None:
    from before_surf.config import get_settings

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    correction, report = build(get_settings().database_url, args.out)
    path = args.out or DEFAULT_PATH
    print(f"wrote {path} ({path.stat().st_size} bytes)")
    print(
        f"held out: MAE {report['holdout_mae_kmh']} vs {report['do_nothing_mae_kmh']} "
        f"for doing nothing, an improvement of {report['improvement_kmh']} km/h"
    )
    print(
        f"fitted on {correction.metadata['fitted_rows']:,} rows, "
        f"{correction.metadata['hours_covered']}/24 local hours have their own value"
    )
    print()
    for hour in range(24):
        value = correction.by_local_hour.get(hour)
        shown = (
            f"{value:+.2f}" if value is not None else f"{correction.fallback_kmh:+.2f} (default)"
        )
        print(f"  {hour:02d}:00 local  {shown}")


if __name__ == "__main__":
    main()
