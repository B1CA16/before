"""FastAPI application for beFORE."""

from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException

from before_api.forecast import build_forecast_rows
from before_api.repository import SupabaseRepository, get_repository
from before_api.schemas import ForecastHour, SpotOut
from before_surf.scoring.heuristic import HeuristicScorer

app = FastAPI(title="beFORE API")
_scorer = HeuristicScorer()

RepoDep = Annotated[SupabaseRepository, Depends(get_repository)]


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/spots", response_model=list[SpotOut])
def list_spots(repo: RepoDep):
    return repo.list_spots()


@app.get("/spots/{slug}/forecast", response_model=list[ForecastHour])
def spot_forecast(slug: str, repo: RepoDep):
    if repo.get_spot(slug) is None:
        raise HTTPException(status_code=404, detail="spot not found")
    df = repo.get_forecast(slug)
    if df.empty:
        return []
    return build_forecast_rows(df, _scorer)
