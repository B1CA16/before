from pathlib import Path

from before_surf.ingestion.load_seed import rows_from_csv


def test_rows_from_csv(tmp_path: Path):
    csv_text = (
        "slug,name,region,latitude,longitude,break_type,orientation_deg\n"
        "carcavelos,Carcavelos,Lisbon,38.68,-9.33,,265.0\n"
        "guincho,Guincho,Lisbon,38.73,-9.47,beach,\n"
    )
    path = tmp_path / "spots.csv"
    path.write_text(csv_text, encoding="utf-8")

    rows = rows_from_csv(path)
    assert len(rows) == 2
    assert rows[0]["slug"] == "carcavelos"
    assert rows[0]["orientation_deg"] == 265.0
    assert rows[0]["break_type"] is None
    assert rows[1]["break_type"] == "beach"
    assert rows[1]["orientation_deg"] is None
