from before_surf.features.dataset import records_to_dataframe


def test_records_to_dataframe_builds_named_columns():
    rows = [(1, 270.0, 1.4), (2, 200.0, 0.9)]
    columns = ["spot_id", "orientation_deg", "wave_height_m"]
    df = records_to_dataframe(rows, columns)
    assert list(df.columns) == columns
    assert len(df) == 2
    assert df["orientation_deg"].iloc[0] == 270.0
