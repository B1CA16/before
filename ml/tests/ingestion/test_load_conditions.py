from before_surf.ingestion.load_conditions import build_upsert_sql
from before_surf.ingestion.openmeteo import CONDITION_COLUMNS


def test_upsert_sql_targets_conflict_key_and_all_columns():
    sql = build_upsert_sql()
    assert "insert into conditions" in sql
    assert "on conflict (spot_id, observed_at, source)" in sql
    # every measurement column participates in the upsert
    for col in CONDITION_COLUMNS:
        assert col in sql
