"""Label report: is there enough data to attempt the ML model yet?

Run: uv run python ml/notebooks/label_report.py

This script exists to make "are we ready for ML" a measurement rather than a feeling. It is easy to
start modelling too early, get a plausible-looking accuracy out of forty examples, and spend weeks
tuning noise. The thresholds live in before_surf.labels so they cannot be quietly relaxed to make a
run look better.
"""

from before_surf.config import get_settings
from before_surf.labels import (
    MIN_LABELS,
    MIN_MINORITY_SHARE,
    WORTH_IT_FROM,
    load_training_set,
    readiness,
)


def report(training) -> None:
    """Print the report for an already-built training set.

    Separated from loading so the populated branches below can be exercised without a database, and
    without waiting for real labels to accumulate.
    """
    verdict = readiness(training)
    frame = training.frame

    print("=" * 72)
    print("LABEL REPORT")
    print("=" * 72)

    print(f"\nusable training examples: {verdict['labels']}")
    print(f"  worth it (rating >= {WORTH_IT_FROM}): {verdict['worth_it']}")
    print(f"  not worth it:                  {verdict['not_worth_it']}")
    print(f"  smaller class share:           {verdict['minority_share']:.0%}")

    print("\nconditions each label was paired with:")
    print(f"  archive  (what the ocean did):     {verdict['from_archive']}")
    print(f"  forecast (what we predicted):      {verdict['from_forecast']}")
    if verdict["from_forecast"]:
        print("  note: forecast-paired examples improve on their own as the weekly")
        print("        archive refresh catches up. Nothing to fix here.")

    print("\ncoverage:")
    print(f"  distinct spots: {verdict['distinct_spots']}")
    print(f"  distinct users: {verdict['distinct_users']}")

    print("\nsessions that could not become examples:")
    print(f"  no conditions on record for that hour: {verdict['dropped_no_conditions']}")
    print(f"  incomplete features (unknown orientation, gaps): {verdict['dropped_incomplete']}")
    if verdict["dropped_no_conditions"]:
        print("  these are dropped rather than filled in: imputing conditions would")
        print("  manufacture an example nobody actually surfed.")

    if verdict["labels"]:
        print("\nratings given:")
        for rating, count in sorted(frame["rating"].value_counts().items()):
            print(f"  {rating}: {'#' * count} ({count})")

        tag_counts: dict[str, int] = {}
        for tags in frame["tags"]:
            for tag in tags or []:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
        if tag_counts:
            print("\ntags, which is how noise our features cannot see gets identified:")
            for tag, count in sorted(tag_counts.items(), key=lambda kv: -kv[1]):
                print(f"  {tag}: {count}")
            if tag_counts.get("crowded"):
                print("  'crowded' matters most: a crowd is invisible to every feature we have,")
                print("  so those sessions are candidates to exclude if the model underfits.")

        print("\nlabels per spot (top 10):")
        for slug, count in frame["slug"].value_counts().head(10).items():
            print(f"  {slug}: {count}")

    print("\n" + "=" * 72)
    if verdict["ready"]:
        print("READY: enough labels, and both classes are represented.")
        print("M9 can begin. The heuristic is the baseline to beat, not the target.")
    else:
        print("NOT READY. Blockers:")
        for blocker in verdict["blockers"]:
            print(f"  - {blocker}")
        print(f"\nBar: at least {MIN_LABELS} examples with the smaller class")
        print(f"above {MIN_MINORITY_SHARE:.0%}. Below that, a model would be fitting noise")
        print("and its accuracy would say more about the split than about surf.")
        print("\nThe way forward is logging sessions, including old ones from memory:")
        print("a year of archive conditions is already in the database waiting to be")
        print("paired with them.")
    print("=" * 72)


def main() -> None:
    settings = get_settings()
    assert settings.database_url, "DATABASE_URL is not set"
    report(load_training_set(settings.database_url))


if __name__ == "__main__":
    main()
