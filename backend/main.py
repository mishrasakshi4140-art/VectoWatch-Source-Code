from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import math
import json
import urllib.parse
import urllib.request

from backend.database import get_connection, create_tables


# ============================================================
# APP CONFIGURATION
# ============================================================

app = FastAPI(
    title="VectoWatch API",
    description="Early vector-borne disease risk detection and prevention system",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# DATABASE INITIALIZATION
# ============================================================

create_tables()


def ensure_containment_table():
    """
    Make sure the containment-actions table exists.

    This is intentionally kept here as a safety layer so that
    updating main.py does not remove the containment workflow.
    """
    connection = get_connection()

    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS containment_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            action_type TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP NULL
        )
        """
    )

    connection.commit()
    connection.close()


ensure_containment_table()


# ============================================================
# PILOT WARD CONFIGURATION
# ============================================================

# These are prototype monitoring points for the pilot.
# They are NOT official municipal ward boundaries.
#
# The coordinates are used to retrieve live weather conditions
# for the prototype risk engine.

PILOT_WARDS = [
    {
        "ward_id": 7,
        "ward_name": "Ward 7",
        "latitude": 19.2800,
        "longitude": 72.8500,
    },
    {
        "ward_id": 12,
        "ward_name": "Ward 12",
        "latitude": 19.2900,
        "longitude": 72.8700,
    },
    {
        "ward_id": 4,
        "ward_name": "Ward 4",
        "latitude": 19.2700,
        "longitude": 72.8400,
    },
]


# ============================================================
# FALLBACK WEATHER VALUES
# ============================================================

# If the internet/weather service is temporarily unavailable,
# the prototype continues working instead of crashing.
#
# These are only fallback/demo values.
#
# They are NOT presented as live measurements.

WEATHER_FALLBACKS = {
    7: {
        "rainfall_mm": 42.0,
        "temperature_c": 29.0,
        "humidity_pct": 78.0,
    },
    12: {
        "rainfall_mm": 28.0,
        "temperature_c": 28.0,
        "humidity_pct": 72.0,
    },
    4: {
        "rainfall_mm": 8.0,
        "temperature_c": 27.0,
        "humidity_pct": 55.0,
    },
}


# ============================================================
# PYDANTIC MODELS
# ============================================================

class CitizenReport(BaseModel):
    report_type: str
    description: Optional[str] = ""
    latitude: float
    longitude: float


class EnvironmentalConditions(BaseModel):
    rainfall_mm: float
    temperature_c: float
    humidity_pct: float


class FollowUpVerification(BaseModel):
    outcome: str


# ============================================================
# WEATHER SERVICE
# ============================================================

def fetch_live_weather(latitude: float, longitude: float):
    """
    Fetch current temperature/humidity and recent rainfall
    from Open-Meteo.

    Rainfall is calculated from the hourly rain values returned
    for the recent 24-hour period.

    Returns:
        dict with:
        rainfall_mm
        temperature_c
        humidity_pct
        source
        observed_at
    """

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,rain",
        "hourly": "rain",
        "past_hours": 24,
        "forecast_hours": 1,
        "timezone": "Asia/Kolkata",
    }

    url = (
        "https://api.open-meteo.com/v1/forecast?"
        + urllib.parse.urlencode(params)
    )

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "VectoWatch/1.0"
        },
    )

    with urllib.request.urlopen(
        request,
        timeout=12,
    ) as response:

        payload = json.loads(
            response.read().decode("utf-8")
        )

    current = payload.get("current", {})
    hourly = payload.get("hourly", {})

    temperature = current.get("temperature_2m")
    humidity = current.get("relative_humidity_2m")

    hourly_rain = hourly.get("rain", [])

    rainfall_24h = sum(
        float(value or 0)
        for value in hourly_rain
    )

    if temperature is None:
        raise ValueError(
            "Live weather response did not contain temperature."
        )

    if humidity is None:
        raise ValueError(
            "Live weather response did not contain humidity."
        )

    return {
        "rainfall_mm": round(rainfall_24h, 1),
        "temperature_c": round(float(temperature), 1),
        "humidity_pct": round(float(humidity), 1),
        "source": "Open-Meteo",
        "observed_at": current.get("time"),
    }


def get_weather_for_ward(ward):
    """
    Get live weather for one pilot ward.

    If the external weather service is unavailable,
    use the prototype fallback so the rest of the
    application continues working.
    """

    try:
        weather = fetch_live_weather(
            ward["latitude"],
            ward["longitude"],
        )

        weather["live"] = True

        return weather

    except Exception as error:

        print(
            f"WARNING: Live weather unavailable for "
            f"{ward['ward_name']}: {error}"
        )

        fallback = WEATHER_FALLBACKS.get(
            ward["ward_id"],
            {
                "rainfall_mm": 0.0,
                "temperature_c": 0.0,
                "humidity_pct": 0.0,
            },
        ).copy()

        fallback["source"] = "Prototype fallback"
        fallback["observed_at"] = None
        fallback["live"] = False

        return fallback


# ============================================================
# ENVIRONMENTAL RISK ENGINE
# ============================================================

def calculate_environmental_risk(
    rainfall_mm: float,
    temperature_c: float,
    humidity_pct: float,
):
    """
    Transparent prototype environmental risk index.

    IMPORTANT:
    This is an experimental prototype score.
    It is not a clinical prediction and does not diagnose
    dengue, malaria, or any individual illness.
    """

    score = 0
    factors = []
    risk_breakdown = {}

    # --------------------------------------------------------
    # RAINFALL
    # --------------------------------------------------------

    if rainfall_mm >= 50:
        rainfall_points = 40
        rainfall_rule = "≥50 mm → +40"
        factors.append(
            "Heavy recent rainfall may increase standing-water risk"
        )

    elif rainfall_mm >= 25:
        rainfall_points = 30
        rainfall_rule = "25–<50 mm → +30"
        factors.append(
            "Moderate recent rainfall may increase breeding-site risk"
        )

    elif rainfall_mm >= 10:
        rainfall_points = 20
        rainfall_rule = "10–<25 mm → +20"
        factors.append(
            "Recent rainfall detected"
        )

    elif rainfall_mm > 0:
        rainfall_points = 10
        rainfall_rule = ">0–<10 mm → +10"
        factors.append(
            "Light recent rainfall detected"
        )

    else:
        rainfall_points = 0
        rainfall_rule = "≤0 mm → +0"
        factors.append(
            "No recent rainfall detected"
        )

    score += rainfall_points
    risk_breakdown["rainfall"] = {
        "factor_name": "Rainfall",
        "value": rainfall_mm,
        "unit": "mm",
        "contribution_points": rainfall_points,
        "rule_applied": rainfall_rule,
    }

    # --------------------------------------------------------
    # TEMPERATURE
    # --------------------------------------------------------

    if 25 <= temperature_c <= 32:
        temperature_points = 30
        temperature_rule = "25–32 °C → +30"
        factors.append(
            "Temperature is within a mosquito-suitable range"
        )

    elif 20 <= temperature_c < 25 or 32 < temperature_c <= 35:
        temperature_points = 20
        temperature_rule = "20–<25 °C or >32–35 °C → +20"
        factors.append(
            "Temperature is moderately suitable for mosquito activity"
        )

    else:
        temperature_points = 5
        temperature_rule = "Otherwise → +5"
        factors.append(
            "Temperature is outside the preferred prototype range"
        )

    score += temperature_points
    risk_breakdown["temperature"] = {
        "factor_name": "Temperature",
        "value": temperature_c,
        "unit": "°C",
        "contribution_points": temperature_points,
        "rule_applied": temperature_rule,
    }

    # --------------------------------------------------------
    # HUMIDITY
    # --------------------------------------------------------

    if humidity_pct >= 80:
        humidity_points = 30
        humidity_rule = "≥80% → +30"
        factors.append(
            "High humidity supports mosquito survival conditions"
        )

    elif humidity_pct >= 60:
        humidity_points = 20
        humidity_rule = "60–<80% → +20"
        factors.append(
            "Moderate humidity detected"
        )

    elif humidity_pct >= 40:
        humidity_points = 10
        humidity_rule = "40–<60% → +10"
        factors.append(
            "Some humidity contribution detected"
        )

    else:
        humidity_points = 5
        humidity_rule = "<40% → +5"
        factors.append(
            "Low humidity contribution"
        )

    score += humidity_points
    risk_breakdown["humidity"] = {
        "factor_name": "Humidity",
        "value": humidity_pct,
        "unit": "%",
        "contribution_points": humidity_points,
        "rule_applied": humidity_rule,
    }

    score = min(score, 100)

    # --------------------------------------------------------
    # RISK LEVEL
    # --------------------------------------------------------

    if score >= 75:
        risk_level = "High"

    elif score >= 55:
        risk_level = "Elevated"

    elif score >= 30:
        risk_level = "Moderate"

    else:
        risk_level = "Low"

    return {
        "score": score,
        "risk_level": risk_level,
        "factors": factors,
        "risk_breakdown": risk_breakdown,
    }


# ============================================================
# ROOT / HEALTH
# ============================================================

@app.get("/")
def root():
    return {
        "service": "VectoWatch API",
        "status": "running",
        "version": "1.0.0",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "VectoWatch API",
    }


# ============================================================
# WEATHER ENDPOINT
# ============================================================

@app.get("/weather")
def get_weather():
    """
    Return live weather for all pilot wards.
    """

    results = []

    for ward in PILOT_WARDS:

        weather = get_weather_for_ward(ward)

        results.append(
            {
                **ward,
                "weather": weather,
            }
        )

    return {
        "source": "Open-Meteo with prototype fallback",
        "wards": results,
    }


# ============================================================
# SINGLE WARD WEATHER
# ============================================================

@app.get("/weather/{ward_id}")
def get_single_ward_weather(ward_id: int):

    ward = next(
        (
            ward
            for ward in PILOT_WARDS
            if ward["ward_id"] == ward_id
        ),
        None,
    )

    if ward is None:
        return {
            "error": "Ward not found"
        }

    weather = get_weather_for_ward(ward)

    return {
        **ward,
        "weather": weather,
    }


# ============================================================
# CITIZEN REPORTS - CREATE
# ============================================================

@app.post("/reports")
def create_report(report: CitizenReport):

    if (
        not math.isfinite(report.latitude)
        or not math.isfinite(report.longitude)
        or report.latitude == 0
        or report.longitude == 0
    ):
        raise HTTPException(
            status_code=400,
            detail="Latitude and longitude must be finite and non-zero.",
        )

    connection = get_connection()

    cursor = connection.execute(
        """
        INSERT INTO citizen_reports
        (
            report_type,
            description,
            latitude,
            longitude,
            status
        )
        VALUES (?, ?, ?, ?, 'pending')
        """,
        (
            report.report_type,
            report.description,
            report.latitude,
            report.longitude,
        ),
    )

    connection.commit()

    report_id = cursor.lastrowid

    connection.close()

    return {
        "message": "Citizen report created successfully",
        "report_id": report_id,
        "status": "pending",
    }


# ============================================================
# CITIZEN REPORTS - LIST
# ============================================================

@app.get("/reports")
def get_reports():

    connection = get_connection()

    reports = connection.execute(
        """
        SELECT *
        FROM citizen_reports
        ORDER BY created_at DESC
        """
    ).fetchall()

    connection.close()

    return [
        dict(report)
        for report in reports
    ]


# ============================================================
# ENVIRONMENTAL RISK
# ============================================================

@app.post("/risk")
def calculate_risk(
    conditions: EnvironmentalConditions,
):

    risk = calculate_environmental_risk(
        conditions.rainfall_mm,
        conditions.temperature_c,
        conditions.humidity_pct,
    )

    return {
        "environmental_conditions": {
            "rainfall_mm": conditions.rainfall_mm,
            "temperature_c": conditions.temperature_c,
            "humidity_pct": conditions.humidity_pct,
        },
        "risk_assessment": risk,
    }


# ============================================================
# PILOT WARDS
# ============================================================

@app.get("/wards")
def get_wards():

    return [
        dict(ward)
        for ward in PILOT_WARDS
    ]


# ============================================================
# WARD RISK - LIVE WEATHER
# ============================================================

@app.post("/wards/risk")
def get_ward_risk():

    results = []

    for ward in PILOT_WARDS:

        weather = get_weather_for_ward(ward)

        risk = calculate_environmental_risk(
            rainfall_mm=weather["rainfall_mm"],
            temperature_c=weather["temperature_c"],
            humidity_pct=weather["humidity_pct"],
        )
        risk_breakdown = risk.pop("risk_breakdown")

        results.append(
            {
                "ward_id": ward["ward_id"],
                "ward_name": ward["ward_name"],
                "latitude": ward["latitude"],
                "longitude": ward["longitude"],

                "environmental_conditions": {
                    "rainfall_mm": weather["rainfall_mm"],
                    "temperature_c": weather["temperature_c"],
                    "humidity_pct": weather["humidity_pct"],
                },

                "weather_metadata": {
                    "source": weather["source"],
                    "live": weather["live"],
                    "observed_at": weather["observed_at"],
                },

                "risk_assessment": risk,
                "risk_breakdown": risk_breakdown,
            }
        )

    results.sort(
        key=lambda item: item["risk_assessment"]["score"],
        reverse=True,
    )

    return results


# ============================================================
# FIELD VERIFICATION
# ============================================================

@app.put("/reports/{report_id}/verify")
def verify_report(
    report_id: int,
    result: str,
):

    if result not in [
        "confirmed",
        "not_found",
    ]:
        return {
            "error": (
                "Result must be 'confirmed' "
                "or 'not_found'"
            )
        }

    connection = get_connection()

    report = connection.execute(
        """
        SELECT *
        FROM citizen_reports
        WHERE id = ?
        """,
        (report_id,),
    ).fetchone()

    if report is None:

        connection.close()

        return {
            "error": "Report not found"
        }

    connection.execute(
        """
        UPDATE citizen_reports
        SET status = ?
        WHERE id = ?
        """,
        (
            result,
            report_id,
        ),
    )

    # --------------------------------------------------------
    # AUTOMATIC CONTAINMENT ACTION
    # --------------------------------------------------------

    if result == "confirmed":

        existing_action = connection.execute(
            """
            SELECT id
            FROM containment_actions
            WHERE report_id = ?
            """,
            (report_id,),
        ).fetchone()

        if existing_action is None:

            connection.execute(
                """
                INSERT INTO containment_actions
                (
                    report_id,
                    action_type,
                    description,
                    status
                )
                VALUES (?, ?, ?, 'open')
                """,
                (
                    report_id,
                    "Remove standing water",
                    (
                        "Confirmed breeding site requires "
                        "field containment and removal of "
                        "stagnant water."
                    ),
                ),
            )

    connection.commit()

    connection.close()

    return {
        "message": "Report verification updated",
        "report_id": report_id,
        "status": result,
    }


# ============================================================
# CONTAINMENT ACTIONS
# ============================================================

@app.get("/containment-actions")
def get_containment_actions():

    connection = get_connection()

    actions = connection.execute(
        """
        SELECT
            ca.id,
            ca.report_id,
            ca.action_type,
            ca.description,
            ca.status,
            ca.created_at,
            ca.completed_at,

            (
                SELECT fv.outcome
                FROM follow_up_verifications fv
                WHERE fv.containment_action_id = ca.id
                ORDER BY fv.created_at DESC, fv.id DESC
                LIMIT 1
            ) AS latest_follow_up_outcome,
            (
                SELECT fv.created_at
                FROM follow_up_verifications fv
                WHERE fv.containment_action_id = ca.id
                ORDER BY fv.created_at DESC, fv.id DESC
                LIMIT 1
            ) AS latest_follow_up_at,

            cr.report_type,
            cr.latitude,
            cr.longitude,
            cr.description AS report_description

        FROM containment_actions ca

        LEFT JOIN citizen_reports cr
            ON cr.id = ca.report_id

        ORDER BY ca.created_at DESC
        """
    ).fetchall()

    connection.close()

    return [
        dict(action)
        for action in actions
    ]


@app.post(
    "/containment-actions/{action_id}/follow-ups",
    status_code=201,
)
def record_follow_up_verification(
    action_id: int,
    follow_up: FollowUpVerification,
):
    allowed_outcomes = [
        "resolved",
        "still_present",
        "needs_action",
    ]

    if follow_up.outcome not in allowed_outcomes:
        raise HTTPException(
            status_code=422,
            detail=(
                "Outcome must be one of: "
                "resolved, still_present, needs_action"
            ),
        )

    connection = get_connection()
    action = connection.execute(
        """
        SELECT id, report_id, status
        FROM containment_actions
        WHERE id = ?
        """,
        (action_id,),
    ).fetchone()

    if action is None:
        connection.close()
        raise HTTPException(
            status_code=404,
            detail="Containment action not found",
        )

    if action["status"] != "completed":
        connection.close()
        raise HTTPException(
            status_code=409,
            detail="Follow-up verification requires a completed containment action",
        )

    cursor = connection.execute(
        """
        INSERT INTO follow_up_verifications (
            report_id,
            containment_action_id,
            outcome
        )
        VALUES (?, ?, ?)
        """,
        (
            action["report_id"],
            action_id,
            follow_up.outcome,
        ),
    )
    connection.commit()

    saved_follow_up = connection.execute(
        """
        SELECT id, report_id, containment_action_id, outcome, created_at
        FROM follow_up_verifications
        WHERE id = ?
        """,
        (cursor.lastrowid,),
    ).fetchone()
    connection.close()

    return dict(saved_follow_up)


# Alias for flexibility
@app.get("/actions")
def get_actions():

    return get_containment_actions()


# ============================================================
# START CONTAINMENT ACTION
# ============================================================

@app.put("/containment-actions/{action_id}/start")
def start_containment_action(
    action_id: int,
):

    connection = get_connection()

    action = connection.execute(
        """
        SELECT *
        FROM containment_actions
        WHERE id = ?
        """,
        (action_id,),
    ).fetchone()

    if action is None:

        connection.close()

        return {
            "error": "Containment action not found"
        }

    connection.execute(
        """
        UPDATE containment_actions
        SET status = 'in_progress'
        WHERE id = ?
        """,
        (action_id,),
    )

    connection.commit()
    connection.close()

    return {
        "message": "Containment action started",
        "action_id": action_id,
        "status": "in_progress",
    }


# ============================================================
# COMPLETE CONTAINMENT ACTION
# ============================================================

@app.put("/containment-actions/{action_id}/complete")
def complete_containment_action(
    action_id: int,
):

    connection = get_connection()

    action = connection.execute(
        """
        SELECT *
        FROM containment_actions
        WHERE id = ?
        """,
        (action_id,),
    ).fetchone()

    if action is None:

        connection.close()

        return {
            "error": "Containment action not found"
        }

    connection.execute(
        """
        UPDATE containment_actions
        SET
            status = 'completed',
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (action_id,),
    )

    connection.commit()
    connection.close()

    return {
        "message": "Containment action marked as completed",
        "action_id": action_id,
        "status": "completed",
    }


# ============================================================
# GENERIC ACTION STATUS ENDPOINT
# ============================================================

@app.put("/containment-actions/{action_id}/status")
def update_action_status(
    action_id: int,
    status: str,
):

    allowed_statuses = [
        "open",
        "in_progress",
        "completed",
    ]

    if status not in allowed_statuses:
        return {
            "error": (
                "Status must be one of: "
                "open, in_progress, completed"
            )
        }

    connection = get_connection()

    action = connection.execute(
        """
        SELECT *
        FROM containment_actions
        WHERE id = ?
        """,
        (action_id,),
    ).fetchone()

    if action is None:

        connection.close()

        return {
            "error": "Containment action not found"
        }

    if status == "completed":

        connection.execute(
            """
            UPDATE containment_actions
            SET
                status = ?,
                completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                status,
                action_id,
            ),
        )

    else:

        connection.execute(
            """
            UPDATE containment_actions
            SET
                status = ?,
                completed_at = NULL
            WHERE id = ?
            """,
            (
                status,
                action_id,
            ),
        )

    connection.commit()
    connection.close()

    return {
        "message": "Containment action status updated",
        "action_id": action_id,
        "status": status,
    }


# ============================================================
# ANALYTICS
# ============================================================

@app.get("/analytics")
def get_analytics():

    connection = get_connection()

    total_reports = connection.execute(
        """
        SELECT COUNT(*) AS count
        FROM citizen_reports
        """
    ).fetchone()["count"]

    confirmed_reports = connection.execute(
        """
        SELECT COUNT(*) AS count
        FROM citizen_reports
        WHERE status = 'confirmed'
        """
    ).fetchone()["count"]

    not_found_reports = connection.execute(
        """
        SELECT COUNT(*) AS count
        FROM citizen_reports
        WHERE status = 'not_found'
        """
    ).fetchone()["count"]

    pending_reports = connection.execute(
        """
        SELECT COUNT(*) AS count
        FROM citizen_reports
        WHERE status = 'pending'
        """
    ).fetchone()["count"]

    total_actions = connection.execute(
        """
        SELECT COUNT(*) AS count
        FROM containment_actions
        """
    ).fetchone()["count"]

    open_actions = connection.execute(
        """
        SELECT COUNT(*) AS count
        FROM containment_actions
        WHERE status = 'open'
        """
    ).fetchone()["count"]

    in_progress_actions = connection.execute(
        """
        SELECT COUNT(*) AS count
        FROM containment_actions
        WHERE status = 'in_progress'
        """
    ).fetchone()["count"]

    completed_actions = connection.execute(
        """
        SELECT COUNT(*) AS count
        FROM containment_actions
        WHERE status = 'completed'
        """
    ).fetchone()["count"]

    connection.close()

    if total_reports > 0:
        verification_rate = round(
            (
                confirmed_reports
                + not_found_reports
            )
            / total_reports
            * 100,
            1,
        )
    else:
        verification_rate = 0

    if total_actions > 0:
        completion_rate = round(
            completed_actions
            / total_actions
            * 100,
            1,
        )
    else:
        completion_rate = 0

    ward_risk = get_ward_risk()

    high_risk_wards = sum(
        1
        for ward in ward_risk
        if ward["risk_assessment"]["risk_level"]
        == "High"
    )

    return {
        "total_reports": total_reports,

        "verification": {
            "confirmed": confirmed_reports,
            "not_found": not_found_reports,
            "pending": pending_reports,
            "verification_rate": verification_rate,
        },

        "containment": {
            "total": total_actions,
            "open": open_actions,
            "in_progress": in_progress_actions,
            "completed": completed_actions,
            "completion_rate": completion_rate,
        },

        "risk": {
            "high_risk_wards": high_risk_wards,
            "wards": ward_risk,
        },

        "workflow": {
            "predict": "Environmental risk assessment",
            "corroborate": "Citizen observations",
            "verify": "Field verification",
            "act": "Municipal containment",
            "learn": "Outcome tracking",
        },
    }


# ============================================================
# ANALYTICS SUMMARY ALIAS
# ============================================================

@app.get("/analytics/summary")
def get_analytics_summary():

    return get_analytics()