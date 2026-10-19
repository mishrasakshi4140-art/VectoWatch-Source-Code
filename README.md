# VectoWatch

VectoWatch is a student prototype for early warning and response to support vector-borne disease prevention, aligned with **Sustainable Development Goal 3: Good Health and Well-Being**. It helps citizens report potential risks and helps municipal teams prioritize and follow up on field response.

## What it does

- Accepts citizen reports with an observation, description, and location.
- Adds environmental context using rainfall, temperature, and humidity, including live weather from Open-Meteo with fallback values.
- Groups nearby reports into potential hotspots using DBSCAN, then supports hotspot prioritization.
- Supports municipal field verification, containment actions, and follow-up verification.

Reports and environmental estimates are indicators for prioritization—not proof of disease outbreaks, confirmed breeding sites, or medical diagnoses. Field verification is needed.

## Architecture

- **Frontend:** React and Vite.
- **Backend:** FastAPI with Pydantic.
- **Data:** SQLite (`vectowatch.db`), opened using a relative path from the backend process's working directory.
- **Maps:** React Leaflet/Leaflet with OpenStreetMap tiles.
- **Hotspots:** DBSCAN-style spatial grouping is implemented in the frontend, using a 500 m neighborhood and a minimum of two nearby reports.
- **Weather:** Open-Meteo is called by the backend for current conditions and recent rainfall.

## Run locally

Use Python 3 and Node.js/npm.

### Backend

From the project root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn backend.main:app --reload
```

The API runs at `http://127.0.0.1:8000` by default. Run it from the project root so the relative SQLite path points to the project's `vectowatch.db`.

### Frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

The Vite development server normally serves the app at `http://localhost:5173`. Other package scripts are `npm run build`, `npm run lint`, and `npm run preview`.

### Demo sign-in

The frontend contains hardcoded prototype-only demo accounts:

| Role | Email | Password |
|---|---|---|
| Citizen | `citizen@vectowatch.demo` | `citizen123` |
| Municipal officer | `officer@vectowatch.demo` | `officer123` |

These are not secure authentication credentials and must not be used for real accounts or production access.

## Deployment

GitHub stores and versions the source code; it does not run the application. Deploy the frontend and FastAPI backend to hosting services separately, and configure the frontend's backend URL and the backend's allowed frontend origins for those deployments.

SQLite data must live on persistent storage provided to the backend. Ephemeral deployments may lose the database on restart or redeploy. Back up the database separately; do not commit database files or backups to Git.

## Prototype limitations

Weather estimates, citizen observations, hotspot grouping, and prioritization support review only. They do not establish an outbreak, diagnose illness, or replace public-health or field assessment. Validate the prototype's assumptions and thresholds locally before operational use.
