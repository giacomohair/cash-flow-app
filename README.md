# Cash‑Flow App — v2-fixes4 (pixel-parity UI)

This build keeps the **exact UI** of your reference HTML (same CSS, classes, icons, layout) while keeping all logic in the **Python FastAPI** backend. The React frontend is a thin shell that renders server-provided HTML for the grid and binds toolbar/menu interactions to backend endpoints.

## Run locally (Docker)
```bash
unzip cashflow-app-v2-fixes4.zip && cd cashflow-app-v2-fixes4
cp backend/.env.example backend/.env
docker compose up --build
# Frontend → http://localhost:5173
# Backend docs → http://localhost:8000/docs
```

If you see fonts/icons off, ensure the frontend `styles.css` is loaded (this repo uses the exact CSS from your HTML).

