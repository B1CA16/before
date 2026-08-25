"""FastAPI application for BeFORE."""

from datetime import datetime
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from before_api.auth import CurrentUser
from before_api.forecast import build_conditions_row, build_forecast_rows, build_score_rows
from before_api.repository import SupabaseRepository, get_repository
from before_api.schemas import (
    ConditionsAt,
    ForecastHour,
    ScoreOut,
    SessionIn,
    SessionOut,
    SpotOut,
    SpotWithScore,
)
from before_surf.config import get_settings
from before_surf.scoring.heuristic import HeuristicScorer

app = FastAPI(title="BeFORE API")

# A browser will not read a cross-origin response unless the API allows the origin. Driven by
# config, so production can name the real frontend without a code change.
_origins = [o.strip() for o in get_settings().allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    # POST and DELETE for session logging. OPTIONS is the preflight the browser sends before either.
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
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


@app.get("/spots/{slug}", response_model=SpotWithScore)
def spot_detail(slug: str, repo: RepoDep):
    """One spot with its current score, for the server-rendered spot page."""
    spot = repo.get_spot(slug)
    if spot is None:
        raise HTTPException(status_code=404, detail="spot not found")
    rows = build_score_rows(repo.get_current_conditions(slug), _scorer)
    return {"spot": spot, "now": rows[0] if rows else None}


@app.get("/spots/{slug}/forecast", response_model=list[ForecastHour])
def spot_forecast(slug: str, repo: RepoDep):
    if repo.get_spot(slug) is None:
        raise HTTPException(status_code=404, detail="spot not found")
    df = repo.get_forecast(slug)
    if df.empty:
        return []
    return build_forecast_rows(df, _scorer)


@app.get("/spots/{slug}/conditions", response_model=ConditionsAt)
def conditions_at(slug: str, at: datetime, repo: RepoDep):
    """Conditions for a given hour, so someone logging a past session can check they have the right
    one, and can see when we have no record of that hour at all."""
    if repo.get_spot(slug) is None:
        raise HTTPException(status_code=404, detail="spot not found")
    df = repo.get_conditions_at(slug, at)
    if df.empty:
        # A real answer, not an error state to paper over: with no conditions for this hour, a
        # session logged here cannot become a training example.
        raise HTTPException(status_code=404, detail="no conditions on record for that hour")
    return build_conditions_row(df, _scorer)


# --- surf sessions --------------------------------------------------------------------------------
# Every handler takes `user_id` from the verified token and never from the request body. A caller
# cannot log a session as someone else, or read one, because the identity is not theirs to state.


@app.post("/sessions", response_model=SessionOut, status_code=201)
def log_session(body: SessionIn, user_id: CurrentUser, repo: RepoDep):
    spot = repo.get_spot(body.slug)
    if spot is None:
        raise HTTPException(status_code=404, detail="spot not found")
    row = repo.upsert_session(
        user_id=user_id,
        spot_slug=body.slug,
        surfed_at=body.surfed_at,
        rating=body.rating,
        tags=list(body.tags),
        note=body.note,
    )
    return SessionOut(
        id=row["id"],
        slug=body.slug,
        name=spot["name"],
        surfed_at=row["surfed_at"],
        rating=row["rating"],
        tags=list(row["tags"]),
        note=row["note"],
    )


@app.get("/sessions", response_model=list[SessionOut])
def my_sessions(user_id: CurrentUser, repo: RepoDep):
    return repo.list_sessions(user_id)


@app.delete("/account", status_code=204)
def delete_account(user_id: CurrentUser, repo: RepoDep):
    """Erase the caller's account and, by cascade, every session they logged.

    Takes no identifier: the only account anyone can delete here is their own, which removes a whole
    class of authorisation bug rather than guarding against it.
    """
    if not repo.delete_account(user_id):
        raise HTTPException(status_code=404, detail="account not found")


@app.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: int, user_id: CurrentUser, repo: RepoDep):
    if not repo.delete_session(user_id, session_id):
        # 404 and not 403, even when the row exists under another user. A 403 would confirm that
        # someone else's session has this id.
        raise HTTPException(status_code=404, detail="session not found")
