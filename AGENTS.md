# Repository Guidelines

## Project Structure & Module Organization
- `app.py` is the Flask entry point; most backend logic lives in `core/`.
- `templates/` contains Jinja HTML; `static/` holds JS/CSS/wasm assets (desktop + mobile).
- `utils/` includes setup, database, and testing scripts; `docs/` holds user/admin/dev guides.
- Runtime data and logs live under `core/downloads/`, `stemtubes.db`, and `logs/` (avoid committing these).

## Build, Test, and Development Commands
- `python3.12 setup_dependencies.py` creates the venv and installs models/deps.
- `source venv/bin/activate` then `python app.py` runs the app in dev mode.
- `./start.sh` launches with CUDA library path setup (same app entry).
- `./start_service.sh` starts Flask plus ngrok with `.env` enforced; `./stop_service.sh` stops it.

## Coding Style & Naming Conventions
- Python: PEP 8, 4-space indent, 100-char soft line limit (120 hard), stdlib/third-party/local import order.
- Use docstrings on functions, type hints where practical, and descriptive variable names.
- JavaScript: ES6+, `const`/`let`, async/await, class-based modules.
- Comments must be in English and explain why, not what.
- Branch names: `feature/...`, `fix/...`, `docs/...`, `refactor/...`, `test/...`.

## Testing Guidelines
- There is no single test runner; use targeted scripts in `utils/testing/`.
- Examples: `python utils/testing/test_lyrics_cpu.py <audio_file>`, `python utils/testing/test_madmom_tempo_key.py <audio_file>`.
- Database checks: `python utils/database/debug_db.py`.
- For UI or processing changes, manually verify download, extraction, mixer, and mobile flows.

## Commit & Pull Request Guidelines
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Keep the subject under 72 characters; add a body when context is needed.
- PRs should include a clear change summary, testing notes (CPU/GPU if relevant), and linked issues.

## Security & Configuration Tips
- `.env` is required; set `FLASK_SECRET_KEY` (see `.env.example` and `start_service.sh`).
- Central config lives in `core/config.json` and `core/config.py`; keep secrets out of VCS.

## Agent Notes
- If you use an AI assistant, also review `docs/developer-guides/AGENTS.md`.
