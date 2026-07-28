"""FastAPI application for beFORE."""

from fastapi import FastAPI

app = FastAPI(title="beFORE API")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
