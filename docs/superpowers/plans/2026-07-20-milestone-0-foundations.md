# Milestone 0: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the BeFORE monorepo skeleton and a reproducible Python toolchain (uv workspace, ruff, pytest, pre-commit, typed settings, ADRs, CI) so every later milestone builds on solid, automated foundations.

**Architecture:** A monorepo with a uv *virtual workspace* at the root. The root `pyproject.toml` declares no package of its own; it only lists workspace members and dev tooling. The first member is `ml/`, an installable package named `before-surf` (import name `before_surf`, src layout). Later milestones add `apps/api` as a second member. Quality gates (ruff, pytest, an em-dash guard) run locally via pre-commit and remotely via GitHub Actions.

**Tech Stack:** Python 3.12, uv (package/workspace manager), ruff (lint + format), pytest, pre-commit, pydantic-settings, GitHub Actions.

## Global Constraints

- Python version floor: `>=3.12` (copied verbatim into every `pyproject.toml`).
- Free-tier tooling only. No paid services.
- **No em-dashes** anywhere: chat, code, comments, docs, config, app text. Enforced by a pre-commit hook.
- **Never auto-commit.** Every "Commit" step provides a message; Francisco runs the commit himself.
- Commit messages are a **single conventional-commit subject line** (feat, fix, chore, docs, refactor, test, perf, build, ci, style). No body, no trailer.
- Primary shell is **PowerShell on Windows**. All commands below are PowerShell.
- Import name of the ML package is `before_surf`. First-party code lives under `ml/src/before_surf/`.

---

### Task 1: Monorepo skeleton and root config files

**Files:**
- Create: `.gitignore`
- Create: `.editorconfig`
- Modify: `README.md`
- Create: `ml/.gitkeep`, `apps/api/.gitkeep`, `apps/web/.gitkeep`, `db/.gitkeep`, `scripts/.gitkeep`, `infrastructure/.gitkeep`, `docs/adr/.gitkeep`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the directory tree that all later tasks and milestones populate.

- [ ] **Step 1: Create the directory tree**

Run:
```powershell
New-Item -ItemType Directory -Force -Path ml,apps/api,apps/web,db,scripts,infrastructure,docs/adr | Out-Null
foreach ($d in "ml","apps/api","apps/web","db","scripts","infrastructure","docs/adr") {
  New-Item -ItemType File -Force -Path (Join-Path $d ".gitkeep") | Out-Null
}
```
Expected: the folders exist, each empty one holds a `.gitkeep`. (`docs/` already contains `superpowers/`, so its `.gitkeep` is only for `docs/adr`.)

- [ ] **Step 2: Write `.gitignore`**

Create `.gitignore` with exactly:
```gitignore
# Python
__pycache__/
*.py[cod]
.venv/
.pytest_cache/
.ruff_cache/
*.egg-info/

# Environments and secrets
.env
.env.*
!.env.example

# uv
# (uv.lock IS committed; do not ignore it)

# OS and editors
.DS_Store
Thumbs.db
.idea/
.vscode/

# Node (added when apps/web arrives)
node_modules/
```

- [ ] **Step 3: Write `.editorconfig`**

Create `.editorconfig` with exactly:
```editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 4

[*.{js,jsx,ts,tsx,json,yml,yaml,md}]
indent_size = 2
```

- [ ] **Step 4: Replace `README.md`**

Overwrite `README.md` with exactly:
```markdown
# BeFORE

Decide whether outdoor sports are worth doing given environmental conditions.
We train our own ML models (this is not an AI wrapper). Built one module at a time.

**Current module: Surf Intelligence.**

- Design spec: `docs/superpowers/specs/2026-07-20-surf-intelligence-design.md`
- Architecture decisions: `docs/adr/`
- Conventions for contributors and agents: `CLAUDE.md`

## Layout

- `ml/` first-party Python package `before_surf` (ingestion, features, scoring, training, evaluation)
- `apps/` FastAPI backend (`api`) and Next.js frontend (`web`), added in later milestones
- `db/` SQL migrations (schema source of truth)
- `docs/` design specs, plans, and ADRs
- `scripts/`, `infrastructure/` tooling and deploy config
```

- [ ] **Step 5: Verify the tree**

Run:
```powershell
Get-ChildItem -Force -Name
```
Expected: shows `.editorconfig`, `.gitignore`, `README.md`, `ml`, `apps`, `db`, `docs`, `scripts`, `infrastructure`, plus existing `.git`, `.gitattributes`, `CLAUDE.md`, `LICENSE`.

- [ ] **Step 6: Commit**

Provide Francisco this message (he runs the commit):
```
chore: scaffold monorepo directory structure and root config
```

---

### Task 2: uv virtual workspace, `before-surf` package, and pytest

**Files:**
- Create: `pyproject.toml` (workspace root)
- Create: `ml/pyproject.toml`
- Create: `ml/src/before_surf/__init__.py`
- Create: `.python-version` (via `uv python pin`)
- Create: `uv.lock` (via `uv sync`)
- Test: `ml/tests/test_package.py`

**Interfaces:**
- Consumes: the `ml/` directory from Task 1 (replaces its `.gitkeep`).
- Produces: an importable package `before_surf` with `before_surf.__version__: str`, installed editable into the workspace `.venv`; the commands `uv sync --all-packages`, `uv run pytest`.

- [ ] **Step 1: Remove the ml placeholder**

Run:
```powershell
Remove-Item ml/.gitkeep -ErrorAction SilentlyContinue
```

- [ ] **Step 2: Create the workspace root `pyproject.toml`**

Create `pyproject.toml` (repo root) with exactly:
```toml
[tool.uv.workspace]
members = ["ml"]

[tool.ruff]
line-length = 100
target-version = "py312"
src = ["ml/src"]

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "SIM"]

[tool.ruff.lint.isort]
known-first-party = ["before_surf"]

[tool.pytest.ini_options]
testpaths = ["ml/tests"]
addopts = "-ra"
```
Note: no `[project]` table, so this is a *virtual* workspace root (never built or installed). It exists to declare members and hold shared tool config.

- [ ] **Step 3: Create `ml/pyproject.toml`**

Create `ml/pyproject.toml` with exactly:
```toml
[project]
name = "before-surf"
version = "0.0.0"
description = "BeFORE Surf Intelligence: data, features, and scoring."
requires-python = ">=3.12"
dependencies = []

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/before_surf"]
```

- [ ] **Step 4: Create the package init**

Create `ml/src/before_surf/__init__.py` with exactly:
```python
"""BeFORE Surf Intelligence package."""

__version__ = "0.0.0"
```

- [ ] **Step 5: Write the toolchain-proving test**

Create `ml/tests/test_package.py` with exactly:
```python
import before_surf


def test_version_is_nonempty_string():
    assert isinstance(before_surf.__version__, str)
    assert before_surf.__version__
```

- [ ] **Step 6: Pin Python and add dev tools**

Run:
```powershell
uv python pin 3.12
uv add --dev pytest ruff pre-commit
```
Expected: `.python-version` created; `uv.lock` created; `[dependency-groups] dev = [...]` appended to the root `pyproject.toml`. (If `uv` is not installed, first run `irm https://astral.sh/uv/install.ps1 | iex` and open a new PowerShell.)

- [ ] **Step 7: Sync and run the test to verify it passes**

Run:
```powershell
uv sync --all-packages
uv run pytest
```
Expected: `1 passed`. This proves the workspace, editable install of `before_surf`, and pytest all work together.

- [ ] **Step 8: Commit**

Provide Francisco this message (he runs the commit):
```
build: add uv workspace with before-surf package and pytest
```

---

### Task 3: ruff linting and formatting

**Files:**
- Modify: `pyproject.toml` (ruff config already added in Task 2, Step 2; this task verifies and applies it)

**Interfaces:**
- Consumes: `[tool.ruff]` config from Task 2.
- Produces: the commands `uv run ruff check .` and `uv run ruff format --check .`, both clean.

- [ ] **Step 1: Run the linter**

Run:
```powershell
uv run ruff check .
```
Expected: `All checks passed!` (If it reports fixable issues, run `uv run ruff check --fix .` and re-run.)

- [ ] **Step 2: Apply formatting**

Run:
```powershell
uv run ruff format .
```
Expected: reports files formatted or left unchanged (e.g. `2 files left unchanged`).

- [ ] **Step 3: Verify formatting is stable**

Run:
```powershell
uv run ruff format --check .
```
Expected: `N files already formatted`. No diffs.

- [ ] **Step 4: Commit**

Provide Francisco this message (he runs the commit):
```
build: configure ruff linting and formatting
```

---

### Task 4: pre-commit hooks (with em-dash guard)

**Files:**
- Create: `.pre-commit-config.yaml`

**Interfaces:**
- Consumes: ruff dev dependency from Task 2.
- Produces: a git pre-commit hook chain; a reusable hook id `no-em-dash`.

- [ ] **Step 1: Create `.pre-commit-config.yaml`**

Create `.pre-commit-config.yaml` with exactly:
```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-toml
      - id: check-added-large-files

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.15.22
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: local
    hooks:
      - id: no-em-dash
        name: no em-dashes
        description: Fail if any staged text file contains an em-dash.
        language: pygrep
        entry: '\xe2\x80\x94'
        types: [text]
```
Note: `entry` is single-quoted so YAML passes the escape text through unchanged. pre-commit's pygrep compiles the pattern as bytes, and byte regexes do not support \u escapes, so we match the em-dash by its UTF-8 byte sequence `\xe2\x80\x94`. That string contains no literal em-dash, so the guard never flags its own definition.

- [ ] **Step 2: Install the git hook**

Run:
```powershell
uv run pre-commit install
```
Expected: `pre-commit installed at .git/hooks/pre-commit`.

- [ ] **Step 3: Run all hooks against the whole repo**

Run:
```powershell
uv run pre-commit run --all-files
```
Expected: every hook reports `Passed` (some may `Fixed` whitespace on first run; if so, re-run until all `Passed`).

- [ ] **Step 4: Prove the em-dash guard actually fails**

Run:
```powershell
Set-Content -Path scratch_emdash.txt -Value ("bad" + [char]0x2014 + "dash") -Encoding utf8
uv run pre-commit run no-em-dash --files scratch_emdash.txt
```
Expected: the `no em-dashes` hook **fails** on this file.

- [ ] **Step 5: Remove the probe file**

Run:
```powershell
Remove-Item scratch_emdash.txt
```
Expected: file gone; `git status` shows no `scratch_emdash.txt`.

- [ ] **Step 6: Commit**

Provide Francisco this message (he runs the commit):
```
build: add pre-commit hooks including em-dash guard
```

---

### Task 5: Typed settings module (pydantic-settings)

**Files:**
- Create: `ml/src/before_surf/config.py`
- Create: `.env.example`
- Test: `ml/tests/test_config.py`

**Interfaces:**
- Consumes: the `before_surf` package from Task 2.
- Produces:
  - `class Settings(BaseSettings)` with fields `app_env: str = "development"` and `database_url: str | None = None`.
  - `def get_settings() -> Settings` returning a fresh `Settings()`.
  - Env vars map case-insensitively to fields (`APP_ENV` -> `app_env`). Later milestones add fields such as the Supabase connection string.

- [ ] **Step 1: Add the dependency**

Run:
```powershell
uv add --package before-surf pydantic-settings
uv sync --all-packages
```
Expected: `pydantic-settings` added to `ml/pyproject.toml` `[project].dependencies`; lockfile updated.

- [ ] **Step 2: Write the failing test**

Create `ml/tests/test_config.py` with exactly:
```python
from before_surf.config import Settings, get_settings


def test_defaults_when_no_env(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    settings = Settings(_env_file=None)
    assert settings.app_env == "development"
    assert settings.database_url is None


def test_env_override(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    settings = Settings(_env_file=None)
    assert settings.app_env == "production"


def test_get_settings_returns_settings():
    assert isinstance(get_settings(), Settings)
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```powershell
uv run pytest ml/tests/test_config.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'before_surf.config'`.

- [ ] **Step 4: Implement the config module**

Create `ml/src/before_surf/config.py` with exactly:
```python
"""Typed application settings loaded from environment variables and .env."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    database_url: str | None = None


def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```powershell
uv run pytest ml/tests/test_config.py -v
```
Expected: `3 passed`.

- [ ] **Step 6: Create `.env.example`**

Create `.env.example` with exactly:
```dotenv
# Copy to .env and fill in. .env is gitignored.
APP_ENV=development

# Supabase Postgres connection string (added in Milestone 1)
# DATABASE_URL=
```

- [ ] **Step 7: Run the full suite and hooks**

Run:
```powershell
uv run pytest
uv run pre-commit run --all-files
```
Expected: all tests pass; all hooks pass.

- [ ] **Step 8: Commit**

Provide Francisco this message (he runs the commit):
```
feat: add typed settings module with pydantic-settings
```

---

### Task 6: ADR structure and foundational ADR

**Files:**
- Create: `docs/adr/README.md`
- Create: `docs/adr/0000-template.md`
- Create: `docs/adr/0001-architecture-foundations.md`
- Delete: `docs/adr/.gitkeep`

**Interfaces:**
- Consumes: the approved spec at `docs/superpowers/specs/2026-07-20-surf-intelligence-design.md`.
- Produces: a numbered ADR log; the convention that each significant decision gets its own ADR.

- [ ] **Step 1: Remove the placeholder**

Run:
```powershell
Remove-Item docs/adr/.gitkeep -ErrorAction SilentlyContinue
```

- [ ] **Step 2: Create the ADR index**

Create `docs/adr/README.md` with exactly:
```markdown
# Architecture Decision Records

Each ADR captures one significant decision: its context, the choice, and the consequences.
ADRs are immutable once accepted; a later ADR supersedes an earlier one rather than editing it.

- [0001](0001-architecture-foundations.md) Architecture foundations (monorepo, uv workspace, stack)
```

- [ ] **Step 3: Create the ADR template**

Create `docs/adr/0000-template.md` with exactly:
```markdown
# ADR NNNN: <title>

- Status: proposed | accepted | superseded by ADR-XXXX
- Date: YYYY-MM-DD

## Context

What problem or force is driving this decision?

## Decision

The choice we made, stated plainly.

## Consequences

What becomes easier, harder, or constrained as a result. Include trade-offs accepted.
```

- [ ] **Step 4: Create ADR-0001**

Create `docs/adr/0001-architecture-foundations.md` with exactly:
```markdown
# ADR 0001: Architecture foundations

- Status: accepted
- Date: 2026-07-20

## Context

BeFORE is a learning-focused, portfolio-quality ML project starting from an empty repo. It must
scale from a notebook-provable hypothesis to a deployed product, and later to more sports, using
only free-tier tooling. Full reasoning is in the design spec:
`docs/superpowers/specs/2026-07-20-surf-intelligence-design.md`.

## Decision

- Single **monorepo** managed as a **uv virtual workspace**. First member: `ml/` (package
  `before-surf`, import `before_surf`). `apps/api` (FastAPI) and `apps/web` (Next.js) join later.
- The ML code is an **installable package imported by the API**, so feature and scoring logic is
  written once and shared between training and serving (prevents training/serving skew).
- **No separate model-serving service** in v0/v1; the model artifact loads inside the API.
- Stack: Python 3.12, FastAPI, Supabase (Postgres + PostGIS), Next.js on Vercel, GitHub Actions
  cron for ingestion. All free tier.
- Quality gates from day one: ruff, pytest, pre-commit (including an em-dash guard), and CI.
- We do **not** scrape or train on competitor surf ratings; labels come from data we own.

## Consequences

- One language (Python) spans ML and backend, reducing a whole class of bugs, at the cost of a
  slightly harder always-on-server story on free hosts (accepted; serverless or spin-down is fine).
- The monorepo keeps shared code cohesive; adding a second sport later is a mechanical refactor,
  not a rewrite.
- No competitor data caps legal risk and keeps the product from being a derivative, at the cost of
  a cold-start on labels (mitigated by the heuristic v0 and our own annotation).
```

- [ ] **Step 5: Update the README pointer if needed and run hooks**

Run:
```powershell
uv run pre-commit run --all-files
```
Expected: all hooks pass (this confirms the new markdown is em-dash free and well formed).

- [ ] **Step 6: Commit**

Provide Francisco this message (he runs the commit):
```
docs: add ADR structure and foundational architecture ADR
```

---

### Task 7: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `uv.lock`, ruff config, and pytest suite from earlier tasks.
- Produces: a CI pipeline that runs ruff and pytest on every push to `main` and every pull request.

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/ci.yml` with exactly:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v6
        with:
          enable-cache: true

      - name: Install Python
        run: uv python install 3.12

      - name: Sync workspace
        run: uv sync --all-packages --locked

      - name: Ruff lint
        run: uv run ruff check .

      - name: Ruff format check
        run: uv run ruff format --check .

      - name: Tests
        run: uv run pytest
```

- [ ] **Step 2: Validate the workflow file locally**

Run:
```powershell
uv run python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml',encoding='utf-8')); print('yaml ok')"
```
Expected: `yaml ok`. (If PyYAML is missing, run `uv add --dev pyyaml` first; it is a harmless dev dependency.)

- [ ] **Step 3: Run hooks once more**

Run:
```powershell
uv run pre-commit run --all-files
```
Expected: all hooks pass.

- [ ] **Step 4: Commit**

Provide Francisco this message (he runs the commit):
```
ci: add GitHub Actions workflow for lint and tests
```

- [ ] **Step 5: Verify CI on GitHub (Francisco)**

After Francisco pushes to GitHub, open the repository's **Actions** tab and confirm the `CI`
workflow runs and all steps are green. If a step fails, read its log and fix locally before proceeding.

---

## Definition of done for Milestone 0

- `uv sync --all-packages` and `uv run pytest` succeed from a clean clone.
- `uv run ruff check .` and `uv run ruff format --check .` are clean.
- `uv run pre-commit run --all-files` passes, and the `no-em-dash` guard demonstrably fails on an em-dash.
- `docs/adr/` holds the template and ADR-0001.
- CI is green on GitHub.
- All work committed by Francisco with the provided conventional-commit messages.

## What we deliberately did NOT do (deferred)

- No Supabase project yet (Milestone 1, when the database is first used).
- No `apps/api` or `apps/web` packages yet (Milestones 5 and 6).
- No `ingestion` / `features` / `scoring` subpackages yet (Milestones 2 to 4).
- No experiment tracking, Docker, or model registry (introduced when useful).
