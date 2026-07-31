"""FastAPI application for beFORE."""

from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from before_api.forecast import build_forecast_rows, build_score_rows
from before_api.repository import SupabaseRepository, get_repository
from before_api.schemas import ForecastHour, ScoreOut, SpotOut
from before_surf.config import get_settings
from before_surf.scoring.heuristic import HeuristicScorer

app = FastAPI(title="beFORE API")

# A browser will not read a cross-origin response unless the API allows the origin. Driven by
# config, so production can name the real frontend without a code change.
_origins = [o.strip() for o in get_settings().allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)
_scorer = HeuristicScorer()

RepoDep = Annotated[SupabaseRepository, Depends(get_repository)]


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/spots", response_model=list[SpotOut])
def list_spots(repo: RepoDep):
    return repo.list_spots()


@app.get("/scores", response_model=list[ScoreOut])
def scores(repo: RepoDep):
    return build_score_rows(repo.get_current_conditions(), _scorer)


@app.get("/spots/{slug}/forecast", response_model=list[ForecastHour])
def spot_forecast(slug: str, repo: RepoDep):
    if repo.get_spot(slug) is None:
        raise HTTPException(status_code=404, detail="spot not found")
    df = repo.get_forecast(slug)
    if df.empty:
        return []
    return build_forecast_rows(df, _scorer)
