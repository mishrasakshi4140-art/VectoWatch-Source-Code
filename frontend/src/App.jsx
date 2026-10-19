import { useEffect, useState } from "react";
import L from "leaflet";
import { ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { Bug } from "@phosphor-icons/react/dist/csr/Bug";
import { Camera } from "@phosphor-icons/react/dist/csr/Camera";
import { ChartBar } from "@phosphor-icons/react/dist/csr/ChartBar";
import { CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { ClipboardText } from "@phosphor-icons/react/dist/csr/ClipboardText";
import { CloudRain } from "@phosphor-icons/react/dist/csr/CloudRain";
import { Crosshair } from "@phosphor-icons/react/dist/csr/Crosshair";
import { Drop } from "@phosphor-icons/react/dist/csr/Drop";
import { Flag } from "@phosphor-icons/react/dist/csr/Flag";
import { Hash } from "@phosphor-icons/react/dist/csr/Hash";
import { House } from "@phosphor-icons/react/dist/csr/House";
import { MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import { PlusCircle } from "@phosphor-icons/react/dist/csr/PlusCircle";
import { ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { SquaresFour } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { Thermometer } from "@phosphor-icons/react/dist/csr/Thermometer";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { XCircle } from "@phosphor-icons/react/dist/csr/XCircle";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

const API_BASE_URL = "http://127.0.0.1:8000";
const DEMO_ACCOUNTS = [
  {
    email: "citizen@vectowatch.demo",
    password: "citizen123",
    role: "citizen",
  },
  {
    email: "officer@vectowatch.demo",
    password: "officer123",
    role: "officer",
  },
];

function getStoredDemoRole() {
  try {
    const role = localStorage.getItem("vectowatch_demo_role");
    return role === "citizen" || role === "officer" ? role : "";
  } catch {
    return "";
  }
}

const PILOT_WARDS = [
  { id: 7, name: "Ward 7", latitude: 19.28, longitude: 72.85 },
  { id: 12, name: "Ward 12", latitude: 19.29, longitude: 72.87 },
  { id: 4, name: "Ward 4", latitude: 19.27, longitude: 72.84 },
];

const iconProps = {
  size: 19,
  weight: "fill",
  "aria-hidden": true,
};

function FitReportLocations({ reports }) {
  const map = useMap();
  const locationsKey = reports
    .map((report) => `${report.latitude},${report.longitude}`)
    .join(";");

  useEffect(() => {
    if (!locationsKey) {
      return;
    }

    const locations = locationsKey
      .split(";")
      .map((location) => location.split(",").map(Number));
    const [firstLatitude, firstLongitude] = locations[0];
    const hasDifferentLocation = locations.some(
      ([latitude, longitude]) =>
        latitude !== firstLatitude ||
        longitude !== firstLongitude
    );

    if (locations.length === 1 || !hasDifferentLocation) {
      map.setView([firstLatitude, firstLongitude], 15);
      return;
    }

    map.fitBounds(locations, {
      padding: [28, 28],
      maxZoom: 15,
    });
  }, [locationsKey, map]);

  return null;
}

function App() {
  const [userRole, setUserRole] = useState(getStoredDemoRole);
  const [activePage, setActivePage] = useState(() =>
    getStoredDemoRole() === "citizen" ? "home" : "dashboard"
  );
  const [selectedCaseReportId, setSelectedCaseReportId] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [wardRisk, setWardRisk] = useState([]);
  const [citizenReports, setCitizenReports] = useState([]);
  const [containmentActions, setContainmentActions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyticsRefreshing, setAnalyticsRefreshing] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [verificationLoading, setVerificationLoading] =
    useState(false);
  const [actionsLoading, setActionsLoading] = useState(false);

  const [error, setError] = useState("");
  const [reportsError, setReportsError] = useState("");
  const [actionsError, setActionsError] = useState("");

  const [submitMessage, setSubmitMessage] = useState("");
  const [verificationMessage, setVerificationMessage] =
    useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [followUpMessage, setFollowUpMessage] = useState({
    type: "",
    text: "",
  });
  const [followUpLoadingActionId, setFollowUpLoadingActionId] =
    useState(null);

  const [lastUpdated, setLastUpdated] = useState(null);

  const [reportForm, setReportForm] = useState({
    report_type: "standing_water",
    description: "",
    latitude: "",
    longitude: "",
  });

  const [locationStatus, setLocationStatus] = useState("not_set");
  const [locationMessage, setLocationMessage] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");

  // Citizen report tracking:
  // keep only report IDs submitted from this browser so the public
  // portal does not expose other citizens' reports.
  const [trackedReportIds, setTrackedReportIds] = useState(() => {
    try {
      const saved = localStorage.getItem(
        "vectowatch_tracked_report_ids"
      );
      return Array.isArray(JSON.parse(saved))
        ? JSON.parse(saved)
        : [];
    } catch {
      return [];
    }
  });

  // ==================================================
  // LOAD WARD RISK
  // ==================================================

  const loadWardRisk = async () => {
    try {
      setRefreshing(true);
      setError("");

      const response = await fetch(
        `${API_BASE_URL}/wards/risk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Ward risk request failed: ${response.status}`
        );
      }

      const data = await response.json();

      let wards = [];

      if (Array.isArray(data)) {
        wards = data;
      } else if (Array.isArray(data?.wards)) {
        wards = data.wards;
      } else if (Array.isArray(data?.data)) {
        wards = data.data;
      } else if (Array.isArray(data?.results)) {
        wards = data.results;
      }

      setWardRisk(wards);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Ward risk error:", err);

      setError(
        err.message ||
          "Unable to connect to VectoWatch API"
      );

      setWardRisk([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ==================================================
  // LOAD CITIZEN REPORTS
  // ==================================================

  const loadCitizenReports = async () => {
    try {
      setReportsLoading(true);
      setReportsError("");

      const response = await fetch(
        `${API_BASE_URL}/reports`
      );

      if (!response.ok) {
        throw new Error(
          `Reports request failed: ${response.status}`
        );
      }

      const data = await response.json();

      setCitizenReports(
        Array.isArray(data) ? data : []
      );
    } catch (err) {
      console.error("Citizen reports error:", err);

      setReportsError(
        err.message ||
          "Unable to load citizen reports"
      );
    } finally {
      setReportsLoading(false);
    }
  };

  // ==================================================
  // LOAD CONTAINMENT ACTIONS
  // ==================================================

  const loadContainmentActions = async () => {
    try {
      setActionsLoading(true);
      setActionsError("");

      const response = await fetch(
        `${API_BASE_URL}/containment-actions`
      );

      if (!response.ok) {
        throw new Error(
          `Containment action request failed: ${response.status}`
        );
      }

      const data = await response.json();

      setContainmentActions(
        Array.isArray(data) ? data : []
      );
    } catch (err) {
      console.error(
        "Containment actions error:",
        err
      );

      setActionsError(
        err.message ||
          "Unable to load containment actions"
      );
    } finally {
      setActionsLoading(false);
    }
  };

  // ==================================================
  // CITIZEN LOCATION + PHOTO HELPERS
  // ==================================================

  const useMyLocation = () => {
    setLocationMessage("");

    if (!navigator.geolocation) {
      setLocationStatus("error");
      setLocationMessage("Location is not supported by this browser. Choose a pilot area instead.");
      return;
    }

    setLocationStatus("loading");
    setLocationMessage("Requesting your location…");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setReportForm((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        setLocationStatus("success");
        setLocationMessage("Location added. You can review it before sending.");
      },
      (error) => {
        console.warn("Location permission/error:", error);
        setLocationStatus("error");
        setLocationMessage("We couldn't access your location. You can choose your pilot area below instead.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  const choosePilotArea = (ward) => {
    setReportForm((current) => ({
      ...current,
      latitude: String(ward.latitude),
      longitude: String(ward.longitude),
    }));
    setLocationStatus("area");
    setLocationMessage(`${ward.name} selected as the report area.`);
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setPhotoPreview("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setSubmitMessage("Please choose an image file.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  // ==================================================
  // REFRESH ANALYTICS
  // ==================================================

  const refreshAnalytics = async () => {
    if (analyticsRefreshing) {
      return;
    }

    try {
      setAnalyticsRefreshing(true);
      setError("");
      setReportsError("");
      setActionsError("");

      await Promise.all([
        loadWardRisk(),
        loadCitizenReports(),
        loadContainmentActions(),
      ]);

      setLastUpdated(new Date());
    } catch (err) {
      console.error("Analytics refresh error:", err);
      setError(
        err.message ||
          "Unable to refresh VectoWatch analytics."
      );
    } finally {
      setAnalyticsRefreshing(false);
    }
  };

  // ==================================================
  // SUBMIT CITIZEN REPORT
  // ==================================================

  const submitCitizenReport = async (event) => {
    event.preventDefault();

    setSubmitMessage("");
    setReportsError("");

    const latitude = Number(
      reportForm.latitude
    );

    const longitude = Number(
      reportForm.longitude
    );

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude === 0 ||
      longitude === 0
    ) {
      setSubmitMessage(
        "Please choose your location before sending the report."
      );
      return;
    }

    const fallbackDescriptions = {
      standing_water: "Possible standing water observed.",
      uncovered_tank: "Possible uncovered water tank observed.",
      discarded_container: "Possible water-holding discarded container observed.",
      symptom_signal: "Anonymous symptom signal reported by a community member.",
    };

    const description =
      reportForm.description.trim() ||
      fallbackDescriptions[reportForm.report_type] ||
      "Community observation reported.";

    try {
      const response = await fetch(
        `${API_BASE_URL}/reports`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            report_type:
              reportForm.report_type,
            description,
            latitude,
            longitude,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Report submission failed: ${response.status}`
        );
      }

      const createdReport = await response.json();

      const createdReportId =
        createdReport?.id ??
        createdReport?.report_id;

      if (createdReportId !== undefined && createdReportId !== null) {
        setTrackedReportIds((current) => {
          const next = [
            ...new Set([
              Number(createdReportId),
              ...current.map(Number),
            ]),
          ].filter(Number.isFinite);

          localStorage.setItem(
            "vectowatch_tracked_report_ids",
            JSON.stringify(next.slice(0, 10))
          );

          return next.slice(0, 10);
        });
      }

      setSubmitMessage(
        createdReportId !== undefined && createdReportId !== null
          ? `✓ Report #${createdReportId} received. You can track its progress below.`
          : "✓ Report received. Thank you for helping protect your neighbourhood."
      );

      setReportForm({
        report_type: "standing_water",
        description: "",
        latitude: "",
        longitude: "",
      });
      setLocationStatus("not_set");
      setLocationMessage("");
      setPhotoPreview("");

      await loadCitizenReports();
    } catch (err) {
      console.error(
        "Citizen report submission error:",
        err
      );

      setSubmitMessage(
        err.message ||
          "Unable to submit report."
      );
    }
  };

  // ==================================================
  // VERIFY CITIZEN REPORT
  // ==================================================

  const verifyCitizenReport = async (
    reportId,
    result
  ) => {
    try {
      setVerificationLoading(true);
      setVerificationMessage("");

      const response = await fetch(
        `${API_BASE_URL}/reports/${reportId}/verify?result=${result}`,
        {
          method: "PUT",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            `Verification failed: ${response.status}`
        );
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setVerificationMessage(
        result === "confirmed"
          ? "Report confirmed. A containment action has been created."
          : "Report marked as not found."
      );

      await loadCitizenReports();
      await loadContainmentActions();
    } catch (err) {
      console.error(
        "Verification error:",
        err
      );

      setVerificationMessage(
        err.message ||
          "Unable to update verification."
      );
    } finally {
      setVerificationLoading(false);
    }
  };

  // ==================================================
  // UPDATE CONTAINMENT ACTION
  // ==================================================

  const updateContainmentAction = async (
    actionId,
    status
  ) => {
    try {
      setActionsLoading(true);
      setActionMessage("");

      const response = await fetch(
        `${API_BASE_URL}/containment-actions/${actionId}/status?status=${status}`,
        {
          method: "PUT",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            `Action update failed: ${response.status}`
        );
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setActionMessage(
        `Containment action marked as ${formatStatus(
          status
        )}.`
      );

      await loadContainmentActions();
    } catch (err) {
      console.error(
        "Containment action update error:",
        err
      );

      setActionMessage(
        err.message ||
          "Unable to update containment action."
      );
    } finally {
      setActionsLoading(false);
    }
  };

  const recordFollowUpVerification = async (
    actionId,
    outcome
  ) => {
    try {
      setFollowUpLoadingActionId(actionId);
      setFollowUpMessage({ type: "", text: "" });

      const response = await fetch(
        `${API_BASE_URL}/containment-actions/${actionId}/follow-ups`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ outcome }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            `Follow-up verification failed: ${response.status}`
        );
      }

      setFollowUpMessage({
        type: "success",
        text: "Follow-up verification recorded.",
      });
      await loadContainmentActions();
    } catch (err) {
      console.error("Follow-up verification error:", err);
      setFollowUpMessage({
        type: "error",
        text:
          err.message ||
          "Unable to record follow-up verification.",
      });
    } finally {
      setFollowUpLoadingActionId(null);
    }
  };

  // ==================================================
  // INITIAL LOAD
  // ==================================================

  useEffect(() => {
    loadWardRisk();
    loadCitizenReports();
    loadContainmentActions();
  }, []);

  // ==================================================
  // HELPERS
  // ==================================================

  const getScore = (ward) => {
    return (
      ward?.score ??
      ward?.risk_assessment?.score ??
      0
    );
  };

  const getRiskLevel = (ward) => {
    return (
      ward?.risk_level ??
      ward?.risk_assessment?.risk_level ??
      "Unknown"
    );
  };

  const getFactors = (ward) => {
    if (Array.isArray(ward?.factors)) {
      return ward.factors;
    }

    if (
      Array.isArray(
        ward?.risk_assessment?.factors
      )
    ) {
      return ward.risk_assessment.factors;
    }

    return [];
  };

  const getWardName = (ward) => {
    return (
      ward?.name ??
      ward?.ward_name ??
      `Ward ${ward?.id ?? ""}`
    );
  };

  const getEnvironmentalConditions = (
    ward
  ) => {
    return {
      rainfall_mm:
        ward?.rainfall_mm ??
        ward?.environmental_conditions
          ?.rainfall_mm ??
        0,

      temperature_c:
        ward?.temperature_c ??
        ward?.environmental_conditions
          ?.temperature_c ??
        0,

      humidity_pct:
        ward?.humidity_pct ??
        ward?.environmental_conditions
          ?.humidity_pct ??
        0,
    };
  };

  const getRiskClass = (level) => {
    if (level === "High") {
      return "high-risk";
    }

    if (
      level === "Elevated" ||
      level === "Moderate"
    ) {
      return "medium-risk";
    }

    return "low-risk";
  };

  const getRiskDotClass = (level) => {
    if (
      level === "High" ||
      level === "Elevated"
    ) {
      return "marker-high";
    }

    if (level === "Moderate") {
      return "marker-medium";
    }

    return "marker-low";
  };

  const formatStatus = (status) => {
    if (!status) {
      return "Unknown";
    }

    return status
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) =>
        letter.toUpperCase()
      );
  };

  const formatFollowUpOutcome = (outcome) => {
    const labels = {
      resolved: "Resolved",
      still_present: "Issue Still Present",
      needs_action: "Further Action Needed",
    };

    return labels[outcome] || "Not recorded";
  };

  const getStatusClass = (status) => {
    if (status === "completed") {
      return "low-risk";
    }

    if (status === "in_progress") {
      return "medium-risk";
    }

    return "high-risk";
  };

  const highestRiskWard =
    wardRisk.length > 0
      ? wardRisk.reduce(
          (highest, current) =>
            getScore(current) >
            getScore(highest)
              ? current
              : highest
        )
      : null;

  const highRiskWardCount =
    wardRisk.filter(
      (ward) =>
        getRiskLevel(ward) === "High"
    ).length;

  const pendingReports =
    citizenReports.filter(
      (report) =>
        report.status === "pending"
    );

  const confirmedReports =
    citizenReports.filter(
      (report) =>
        report.status === "confirmed"
    );

  const notFoundReports =
    citizenReports.filter(
      (report) =>
        report.status === "not_found"
    );

  const openActions =
    containmentActions.filter(
      (action) =>
        action.status === "open"
    );

  const inProgressActions =
    containmentActions.filter(
      (action) =>
        action.status === "in_progress"
    );

  const completedActions =
    containmentActions.filter(
      (action) =>
        action.status === "completed"
    );

  // ==================================================
  // MAP POSITIONS
  // ==================================================

  const mapPositions = [
    { top: "18%", left: "20%" },
    { top: "30%", left: "56%" },
    { top: "57%", left: "33%" },
    { top: "50%", left: "75%" },
    { top: "72%", left: "58%" },
  ];

  // ==================================================
  // SPATIAL HOTSPOT CLUSTERING (DBSCAN)
  // ==================================================

  const buildDbscanClusters = (reports) => {
    const points = (reports || [])
      .map((report) => ({
        ...report,
        latitude: Number(report.latitude),
        longitude: Number(report.longitude),
      }))
      .filter(
        (report) =>
          Number.isFinite(report.latitude) &&
          Number.isFinite(report.longitude)
      );

    const epsilonMeters = 500;
    const minSamples = 2;
    const earthRadiusMeters = 6371000;

    const distanceMeters = (a, b) => {
      const toRadians = (value) =>
        (value * Math.PI) / 180;
      const dLat = toRadians(
        b.latitude - a.latitude
      );
      const dLon = toRadians(
        b.longitude - a.longitude
      );
      const lat1 = toRadians(a.latitude);
      const lat2 = toRadians(b.latitude);
      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) *
          Math.cos(lat2) *
          Math.sin(dLon / 2) ** 2;
      return (
        2 *
        earthRadiusMeters *
        Math.asin(Math.sqrt(h))
      );
    };

    const neighborsOf = (index) =>
      points
        .map((_, candidateIndex) => candidateIndex)
        .filter(
          (candidateIndex) =>
            distanceMeters(
              points[index],
              points[candidateIndex]
            ) <= epsilonMeters
        );

    const labels = new Array(points.length).fill(
      undefined
    );
    let clusterId = 0;

    const expandCluster = (seedIndex, seedNeighbors) => {
      labels[seedIndex] = clusterId;
      const queue = [...seedNeighbors];

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const currentIndex = queue[cursor];

        if (labels[currentIndex] === -1) {
          labels[currentIndex] = clusterId;
        }

        if (labels[currentIndex] !== undefined) {
          continue;
        }

        labels[currentIndex] = clusterId;
        const currentNeighbors = neighborsOf(currentIndex);

        if (currentNeighbors.length >= minSamples) {
          currentNeighbors.forEach((neighborIndex) => {
            if (!queue.includes(neighborIndex)) {
              queue.push(neighborIndex);
            }
          });
        }
      }
    };

    points.forEach((_, index) => {
      if (labels[index] !== undefined) {
        return;
      }

      const neighbors = neighborsOf(index);

      if (neighbors.length < minSamples) {
        labels[index] = -1;
        return;
      }

      expandCluster(index, neighbors);
      clusterId += 1;
    });

    return Array.from({ length: clusterId }, (_, id) => {
      const members = points.filter(
        (_, index) => labels[index] === id
      );

      const latitude =
        members.reduce((sum, point) => sum + point.latitude, 0) /
        members.length;
      const longitude =
        members.reduce((sum, point) => sum + point.longitude, 0) /
        members.length;

      const radiusMeters = Math.max(
        ...members.map((point) =>
          distanceMeters(
            { latitude, longitude },
            point
          )
        )
      );

      return {
        id: id + 1,
        latitude,
        longitude,
        radiusMeters: Math.round(radiusMeters),
        reports: members,
        confirmedCount: members.filter(
          (report) => report.status === "confirmed"
        ).length,
        pendingCount: members.filter(
          (report) =>
            report.status === "pending"
        ).length,
      };
    });
  };

  // ==================================================
  // CITIZEN REPORT TRACKING
  // ==================================================

  const renderCitizenReportTracking = () => (
    <>
        <section
          style={{
            marginTop: "22px",
            background: "#ffffff",
            border: "1px solid #e4e7ec",
            borderRadius: "20px",
            padding: "24px",
            boxShadow: "0 8px 25px rgba(16,24,40,0.04)",
          }}
          id="citizen-report-tracking"
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <p className="panel-kicker">YOUR REPORTS</p>
              <h2 style={{ margin: "5px 0 7px", fontSize: "26px" }}>
                My Reports
              </h2>
              <p
                style={{
                  color: "#667085",
                  margin: 0,
                  lineHeight: 1.5,
                  maxWidth: "720px",
                }}
              >
                Follow the progress of reports submitted from this browser.
                VectoWatch shows a simple public status without exposing
                other citizens' reports.
              </p>
            </div>

            <button
              type="button"
              className="small-button"
              onClick={async () => {
                await Promise.all([
                  loadCitizenReports(),
                  loadContainmentActions(),
                ]);
              }}
              disabled={reportsLoading || actionsLoading}
            >
              {reportsLoading || actionsLoading
                ? "Updating..."
                : "Update status"}
            </button>
          </div>

          {getTrackedReports().length === 0 ? (
            <div
              style={{
                marginTop: "18px",
                padding: "18px",
                borderRadius: "14px",
                background: "#f8fafc",
                border: "1px dashed #d0d5dd",
              }}
            >
              <strong>No tracked reports yet.</strong>
              <p
                style={{
                  margin: "7px 0 0",
                  color: "#667085",
                  lineHeight: 1.5,
                }}
              >
                After you submit a report, its report number will appear
                here automatically.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "16px",
                marginTop: "20px",
              }}
            >
              {getTrackedReports().map((report) => {
                const stage = getCitizenReportStage(report);
                const timeline = getCitizenTimeline(report);
                const action = getActionForReport(report.id);

                return (
                  <article
                    key={report.id}
                    style={{
                      border: "1px solid #e4e7ec",
                      borderRadius: "16px",
                      padding: "18px",
                      background: "#fcfdfd",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "16px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "11px",
                            fontWeight: 800,
                            letterSpacing: "0.07em",
                            color: "#667085",
                          }}
                        >
                          REPORT #{report.id}
                        </span>

                        <h3
                          style={{
                            margin: "7px 0 5px",
                            fontSize: "18px",
                          }}
                        >
                          {formatStatus(report.report_type)}
                        </h3>

                        <p
                          style={{
                            margin: 0,
                            color: "#667085",
                            fontSize: "13px",
                          }}
                        >
                          {report.description ||
                            "Community observation"}
                        </p>
                        <p
                          style={{
                            margin: "7px 0 0",
                            color: "#667085",
                            fontSize: "12px",
                          }}
                        >
                          Reported: {report.created_at || "Date unavailable"}
                        </p>
                      </div>

                      <div
                        style={{
                          minWidth: "220px",
                          padding: "12px 14px",
                          borderRadius: "12px",
                          background:
                            stage.key === "completed"
                              ? "#f0fdf4"
                              : stage.key === "not_found"
                                ? "#f8fafc"
                                : "#f0fbf8",
                          border:
                            stage.key === "completed"
                              ? "1px solid #bbf7d0"
                              : "1px solid #cce7dc",
                        }}
                      >
                        <small
                          style={{
                            display: "block",
                            color: "#667085",
                            fontSize: "11px",
                            fontWeight: 700,
                            letterSpacing: "0.05em",
                          }}
                        >
                          CURRENT STATUS
                        </small>
                        <strong
                          style={{
                            display: "block",
                            marginTop: "5px",
                            color: "#075e54",
                          }}
                        >
                          {stage.label}
                        </strong>
                        <span
                          style={{
                            display: "block",
                            marginTop: "4px",
                            color: "#667085",
                            fontSize: "12px",
                            lineHeight: 1.4,
                          }}
                        >
                          {stage.description}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: "22px",
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(5, minmax(0, 1fr))",
                        gap: "6px",
                      }}
                    >
                      {timeline.map((item, index) => (
                        <div
                          key={item.key}
                          style={{
                            position: "relative",
                            minWidth: 0,
                          }}
                        >
                          {index > 0 && (
                            <div
                              style={{
                                position: "absolute",
                                top: "12px",
                                right: "50%",
                                width: "100%",
                                height: "2px",
                                background: timeline[index - 1].done
                                  ? "#0b8f7d"
                                  : "#e4e7ec",
                                zIndex: 0,
                              }}
                            />
                          )}

                          <div
                            style={{
                              position: "relative",
                              zIndex: 1,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              textAlign: "center",
                            }}
                          >
                            <div
                              style={{
                                width: "24px",
                                height: "24px",
                                borderRadius: "50%",
                                display: "grid",
                                placeItems: "center",
                                background: item.done
                                  ? "#0b8f7d"
                                  : "#ffffff",
                                border: item.current
                                  ? "3px solid #0b8f7d"
                                  : item.done
                                    ? "2px solid #0b8f7d"
                                    : "2px solid #d0d5dd",
                                color: item.done
                                  ? "#ffffff"
                                  : "#98a2b3",
                                fontSize: "11px",
                                fontWeight: 800,
                                boxSizing: "border-box",
                              }}
                            >
                              {item.done && <CheckCircle {...iconProps} size={15} />}
                            </div>

                            <strong
                              style={{
                                marginTop: "8px",
                                fontSize: "11px",
                                color: item.done || item.current
                                  ? "#344054"
                                  : "#98a2b3",
                              }}
                            >
                              {item.label}
                            </strong>

                            <span
                              style={{
                                marginTop: "3px",
                                fontSize: "10px",
                                lineHeight: 1.3,
                                color: "#98a2b3",
                              }}
                            >
                              {item.description}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {action && (
                      <div
                        style={{
                          marginTop: "18px",
                          paddingTop: "14px",
                          borderTop: "1px solid #eef2f4",
                          display: "flex",
                          gap: "18px",
                          flexWrap: "wrap",
                          color: "#667085",
                          fontSize: "12px",
                        }}
                      >
                        <span>
                          <strong>Response:</strong>{" "}
                          {formatStatus(action.action_type)}
                        </span>

                        <span>
                          <strong>Action status:</strong>{" "}
                          {formatStatus(action.status)}
                        </span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
    </>
  );

  const renderDashboard = () => {
    const environmentalConditions =
      getEnvironmentalConditions(
        highestRiskWard
      );

    const highestFactors =
      getFactors(highestRiskWard);

    return (
      <>
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              MUNICIPAL HEALTH INTELLIGENCE
            </p>

            <h1>VectoWatch Dashboard</h1>

            <p className="page-description">
              Early vector-borne disease risk
              detection and prevention.
            </p>
          </div>

          <div className="status-pill">
            <span className="status-dot"></span>
            System Active
          </div>
        </div>

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">
              <WarningCircle {...iconProps} />
            </div>

            <div>
              <span>
                HIGH-RISK WARDS
              </span>

              <strong>
                {highRiskWardCount}
              </strong>

              <small>
                Current risk assessment
              </small>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <ChartBar {...iconProps} />
            </div>

            <div>
              <span>
                CITIZEN REPORTS
              </span>

              <strong>
                {citizenReports.length}
              </strong>

              <small>
                Breeding-site observations
              </small>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <ClipboardText {...iconProps} />
            </div>

            <div>
              <span>
                PENDING VERIFICATION
              </span>

              <strong>
                {pendingReports.length}
              </strong>

              <small>
                Awaiting field checks
              </small>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <MapPin {...iconProps} />
            </div>

            <div>
              <span>
                CONFIRMED HOTSPOTS
              </span>

              <strong>
                {confirmedReports.length}
              </strong>

              <small>
                Verified breeding locations
              </small>
            </div>
          </div>
        </div>

        <div className="content-grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">
                  LIVE SPATIAL VIEW
                </p>

                <h3>Ward Risk Map</h3>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                {lastUpdated && (
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#718096",
                    }}
                  >
                    Updated{" "}
                    {lastUpdated.toLocaleTimeString()}
                  </span>
                )}

                <button
                  className="small-button"
                  onClick={
                    loadWardRisk
                  }
                  disabled={
                    refreshing
                  }
                >
                  {refreshing
                    ? "Refreshing..."
                    : "Refresh"}
                </button>
              </div>
            </div>

            <div className="risk-map">
              {loading ? (
                <div className="map-loading">
                  Loading ward risk...
                </div>
              ) : wardRisk.length ===
                0 ? (
                <div className="map-loading">
                  No ward risk data available.
                </div>
              ) : (
                wardRisk.map(
                  (ward, index) => {
                    const position =
                      mapPositions[
                        index %
                          mapPositions.length
                      ];

                    const riskLevel =
                      getRiskLevel(
                        ward
                      );

                    const score =
                      getScore(ward);

                    return (
                      <div
                        key={
                          ward?.id ??
                          ward?.ward_id ??
                          index
                        }
                        className={`map-marker ${getRiskDotClass(
                          riskLevel
                        )}`}
                        style={{
                          top: position.top,
                          left: position.left,
                        }}
                        title={`${getWardName(
                          ward
                        )}: ${score}/100`}
                      >
                        <span>
                          {score}
                        </span>

                        <strong>
                          {getWardName(
                            ward
                          )}
                        </strong>
                      </div>
                    );
                  }
                )
              )}

              <div className="map-legend">
                <div>
                  <span className="legend-dot high"></span>
                  High
                </div>

                <div>
                  <span className="legend-dot medium"></span>
                  Moderate
                </div>

                <div>
                  <span className="legend-dot low"></span>
                  Low
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">
                  ENVIRONMENTAL SIGNALS
                </p>

                <h3>
                  {highestRiskWard
                    ? getWardName(
                        highestRiskWard
                      )
                    : "Ward Conditions"}
                </h3>
              </div>

              <span className="source-badge">
                LIVE RISK ENGINE
              </span>
            </div>

            {highestRiskWard ? (
              <>
                <div className="environment-grid">
                  <div className="environment-card">
                    <span><CloudRain {...iconProps} /></span>

                    <small>
                      RAINFALL
                    </small>

                    <strong>
                      {
                        environmentalConditions.rainfall_mm
                      }{" "}
                      mm
                    </strong>

                    <em>
                      Recent rainfall
                    </em>
                  </div>

                  <div className="environment-card">
                    <span><Thermometer {...iconProps} /></span>

                    <small>
                      TEMPERATURE
                    </small>

                    <strong>
                      {
                        environmentalConditions.temperature_c
                      }
                      °C
                    </strong>

                    <em>
                      Current condition
                    </em>
                  </div>

                  <div className="environment-card">
                    <span><Drop {...iconProps} /></span>

                    <small>
                      HUMIDITY
                    </small>

                    <strong>
                      {
                        environmentalConditions.humidity_pct
                      }
                      %
                    </strong>

                    <em>
                      Current condition
                    </em>
                  </div>

                  <div className="environment-card">
                    <span><WarningCircle {...iconProps} /></span>

                    <small>
                      RISK SCORE
                    </small>

                    <strong>
                      {getScore(
                        highestRiskWard
                      )}
                      /100
                    </strong>

                    <em>
                      {getRiskLevel(
                        highestRiskWard
                      )}{" "}
                      risk
                    </em>
                  </div>
                </div>

                <div
                  className="insight-box"
                  style={{ marginTop: "14px" }}
                >
                  <strong>
                    Explainable Risk Breakdown
                  </strong>
                  <p>
                    Transparent prototype environmental risk index
                  </p>

                  {highestRiskWard.risk_breakdown ? (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(150px, 1fr))",
                          gap: "8px",
                          marginTop: "10px",
                        }}
                      >
                        {[
                          "rainfall",
                          "temperature",
                          "humidity",
                        ].map((factorKey) => {
                          const factor =
                            highestRiskWard.risk_breakdown[
                              factorKey
                            ];

                          if (!factor) {
                            return null;
                          }

                          return (
                            <div
                              key={factorKey}
                              style={{
                                padding: "10px",
                                border: "1px solid #e7eeee",
                                borderRadius: "9px",
                                background: "#ffffff",
                              }}
                            >
                              <strong
                                style={{
                                  display: "block",
                                  color: "#295b60",
                                  fontSize: "11px",
                                }}
                              >
                                {factor.factor_name}
                              </strong>
                              <span
                                style={{
                                  display: "block",
                                  marginTop: "4px",
                                  color: "#17324d",
                                  fontSize: "13px",
                                  fontWeight: "700",
                                }}
                              >
                                {factor.value} {factor.unit}
                              </span>
                              <small
                                style={{
                                  display: "block",
                                  marginTop: "4px",
                                  color: "#667085",
                                  fontSize: "10px",
                                }}
                              >
                                {factor.rule_applied}
                              </small>
                              <strong
                                style={{
                                  display: "block",
                                  marginTop: "6px",
                                  color: "#0f766e",
                                  fontSize: "12px",
                                }}
                              >
                                +{factor.contribution_points} points
                              </strong>
                            </div>
                          );
                        })}
                      </div>

                      <p style={{ marginTop: "10px" }}>
                        Final prototype score:{" "}
                        <strong>
                          {getScore(highestRiskWard)}/100
                        </strong>
                      </p>
                    </>
                  ) : (
                    <p>
                      Detailed factor breakdown is unavailable from
                      the current risk data.
                    </p>
                  )}

                  <p style={{ marginTop: "8px" }}>
                    This score uses rainfall, temperature, and humidity
                    observations to prioritize environmental
                    monitoring. It does not diagnose disease or predict
                    whether an individual will become sick.
                  </p>
                </div>

                <div className="insight-box">
                  <strong>
                    Risk factors detected
                  </strong>

                  {highestFactors.length >
                  0 ? (
                    highestFactors.map(
                      (
                        factor,
                        index
                      ) => (
                        <p
                          key={
                            index
                          }
                        >
                          • {factor}
                        </p>
                      )
                    )
                  ) : (
                    <p>
                      • No contributing
                      factors reported.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p>
                No environmental data
                available.
              </p>
            )}
          </section>
        </div>

        <section className="panel hotspot-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">
                PRIORITY QUEUE
              </p>

              <h3>
                Ward Risk Assessment
              </h3>
            </div>

            <span className="count-badge">
              {wardRisk.length} wards
            </span>
          </div>

          <div className="hotspot-table">
            <div className="table-row table-heading">
              <span>WARD</span>
              <span>RISK LEVEL</span>
              <span>
                CONTRIBUTING FACTORS
              </span>
              <span>SCORE</span>
              <span>STATUS</span>
            </div>

            {wardRisk.length ===
            0 ? (
              <div className="table-row">
                <span>
                  No ward data available.
                </span>
              </div>
            ) : (
              wardRisk.map(
                (ward, index) => {
                  const score =
                    getScore(ward);

                  const riskLevel =
                    getRiskLevel(
                      ward
                    );

                  const factors =
                    getFactors(
                      ward
                    );

                  return (
                    <div
                      className="table-row"
                      key={
                        ward?.id ??
                        ward?.ward_id ??
                        index
                      }
                    >
                      <strong>
                        {getWardName(
                          ward
                        )}
                      </strong>

                      <span
                        className={`risk-badge ${getRiskClass(
                          riskLevel
                        )}`}
                      >
                        {riskLevel}
                      </span>

                      <span>
                        {
                          factors.length
                        }{" "}
                        detected
                      </span>

                      <div className="score">
                        <div className="score-bar">
                          <div
                            className="score-fill"
                            style={{
                              width: `${Math.min(
                                Math.max(
                                  score,
                                  0
                                ),
                                100
                              )}%`,
                            }}
                          ></div>
                        </div>

                        <strong>
                          {score}
                        </strong>
                      </div>

                      <span>
                        Monitoring
                      </span>
                    </div>
                  );
                }
              )
            )}
          </div>
        </section>

        <div className="bottom-grid">
          <div className="action-card">
            <div className="action-icon">
              <Crosshair {...iconProps} />
            </div>

            <div>
              <h3>
                Field Verification
              </h3>

              <p>
                Review flagged breeding
                locations and record ground
                verification.
              </p>
            </div>

            <button
              onClick={() =>
                setActivePage(
                  "verification"
                )
              }
            >
              Open
            </button>
          </div>

          <div className="action-card">
            <div className="action-icon">
              <Flag {...iconProps} />
            </div>

            <div>
              <h3>
                Containment Actions
              </h3>

              <p>
                Manage confirmed hotspots
                and municipal containment
                tasks.
              </p>
            </div>

            <button
              onClick={() =>
                setActivePage(
                  "actions"
                )
              }
            >
              Open
            </button>
          </div>
        </div>
      </>
    );
  };

  // ==================================================
  // UNIFIED CASE WORKSPACE
  // ==================================================

  const openCase = (reportId) => {
    setSelectedCaseReportId(Number(reportId));
    setActivePage("case");
  };

  const renderCaseView = () => {
    const report = citizenReports.find(
      (item) => Number(item.id) === Number(selectedCaseReportId)
    );

    if (!report) {
      return (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">OPERATIONAL CASE MANAGEMENT</p>
              <h1>Case Workspace</h1>
              <p className="page-description">
                Select a citizen report to view its complete operational journey.
              </p>
            </div>
            <button className="small-button" onClick={() => setActivePage("reports")}>
              Back to Reports
            </button>
          </div>
          <section className="panel">
            <div className="placeholder-page">
              <div className="placeholder-icon"><ClipboardText {...iconProps} /></div>
              <h3>No case selected</h3>
              <p>Open a report from Citizen Reports to view its complete case journey.</p>
            </div>
          </section>
        </>
      );
    }

    const action = getActionForReport(report.id);
    const timeline = getCitizenTimeline(report);
    const stage = getCitizenReportStage(report);

    return (
      <>
        <div className="page-heading">
          <div>
            <p className="eyebrow">OPERATIONAL CASE MANAGEMENT</p>
            <h1>Case #{report.id}</h1>
            <p className="page-description">
              One view connecting community evidence, field verification, municipal response, and outcome.
            </p>
          </div>
          <div style={{display:"flex",gap:"10px",flexWrap:"wrap"}}>
            <button
              className="small-button"
              onClick={async () => {
                await Promise.all([
                  loadCitizenReports(),
                  loadContainmentActions(),
                ]);
              }}
              disabled={reportsLoading || actionsLoading}
            >
              {reportsLoading || actionsLoading ? "Updating..." : "Update Case"}
            </button>
            <button className="small-button" onClick={() => setActivePage("reports")}>
              Back to Reports
            </button>
          </div>
        </div>

        {reportsError && (
          <div className="error-banner">
            {reportsError}
          </div>
        )}

        {actionsError && (
          <div className="error-banner">
            {actionsError}
          </div>
        )}

        <section style={{display:"grid",gridTemplateColumns:"minmax(0,1.6fr) minmax(280px,.8fr)",gap:"18px",marginBottom:"18px"}}>
          <div className="panel" style={{marginBottom:0}}>
            <div className="panel-header">
              <div>
                <p className="panel-kicker">COMMUNITY SIGNAL</p>
                <h3>{formatStatus(report.report_type)}</h3>
              </div>
              <span className="count-badge">{formatStatus(report.status)}</span>
            </div>
            <p style={{margin:"4px 0 18px",color:"#475467",lineHeight:1.55}}>
              {report.description || "No additional citizen description was provided."}
            </p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:"12px"}}>
              {[
                ["LOCATION", Number.isFinite(Number(report.latitude)) && Number.isFinite(Number(report.longitude)) ? `${Number(report.latitude).toFixed(4)}, ${Number(report.longitude).toFixed(4)}` : "—"],
                ["REPORTED", report.created_at || "—"],
                ["REPORT ID", `#${report.id}`],
              ].map(([label,value]) => (
                <div key={label} style={{padding:"13px",borderRadius:"11px",background:"#f8fafc",border:"1px solid #eef2f6"}}>
                  <small style={{display:"block",color:"#667085",fontWeight:700,fontSize:"10px",letterSpacing:".05em"}}>{label}</small>
                  <strong style={{display:"block",marginTop:"6px",fontSize:"13px",color:"#344054"}}>{value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="panel" style={{marginBottom:0}}>
            <div className="panel-header">
              <div>
                <p className="panel-kicker">CURRENT POSITION</p>
                <h3>Case status</h3>
              </div>
            </div>
            <strong style={{display:"block",fontSize:"22px",color:"#075e54",marginTop:"4px"}}>{stage.label}</strong>
            <p style={{color:"#667085",lineHeight:1.5,fontSize:"13px"}}>{stage.description}</p>
            {action && (
              <div style={{marginTop:"15px",padding:"13px",borderRadius:"11px",background:"#f8fafc"}}>
                <small style={{color:"#667085",fontWeight:700}}>MUNICIPAL ACTION</small>
                <strong style={{display:"block",marginTop:"5px"}}>{formatStatus(action.action_type)}</strong>
                <span style={{color:"#667085",fontSize:"12px"}}>{formatStatus(action.status)}</span>
                {action.latest_follow_up_outcome && (
                  <div style={{marginTop:"12px",paddingTop:"12px",borderTop:"1px solid #e4e7ec"}}>
                    <small style={{color:"#667085",fontWeight:700}}>LATEST FOLLOW-UP</small>
                    <strong style={{display:"block",marginTop:"5px",color:action.latest_follow_up_outcome === "resolved" ? "#166534" : "#b54708"}}>
                      {formatFollowUpOutcome(action.latest_follow_up_outcome)}
                    </strong>
                    {action.latest_follow_up_outcome !== "resolved" && (
                      <span style={{display:"block",marginTop:"4px",fontSize:"12px",color:"#667085"}}>
                        {action.latest_follow_up_outcome === "still_present"
                          ? "The issue is still present at this hotspot."
                          : "Further municipal action is needed."}
                      </span>
                    )}
                    <span style={{display:"block",marginTop:"4px",fontSize:"12px",color:"#667085"}}>
                      {action.latest_follow_up_at || "Timestamp unavailable"}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">END-TO-END WORKFLOW</p>
              <h3>Case journey</h3>
            </div>
            <span className="count-badge">{timeline.filter(item => item.done).length}/{timeline.length} completed</span>
          </div>
          <div style={{display:"grid"}}>
            {timeline.map((item,index) => (
              <div key={item.key} style={{display:"grid",gridTemplateColumns:"42px minmax(0,1fr)",gap:"14px",minHeight:index===timeline.length-1?"auto":"76px"}}>
                <div style={{position:"relative",display:"flex",justifyContent:"center"}}>
                  {index < timeline.length-1 && <div style={{position:"absolute",top:"25px",bottom:"-1px",width:"2px",background:item.done?"#0b8f7d":"#e4e7ec"}} />}
                  <div style={{position:"relative",zIndex:1,width:"28px",height:"28px",borderRadius:"50%",display:"grid",placeItems:"center",background:item.done?"#0b8f7d":"#fff",border:item.current?"3px solid #0b8f7d":item.done?"2px solid #0b8f7d":"2px solid #d0d5dd",color:item.done?"#fff":"#98a2b3",fontWeight:800,fontSize:"12px",boxSizing:"border-box"}}>
                    {item.done && <CheckCircle {...iconProps} size={16} />}
                  </div>
                </div>
                <div style={{paddingBottom:index===timeline.length-1?"2px":"22px"}}>
                  <strong style={{color:item.done||item.current?"#344054":"#98a2b3",fontSize:"14px"}}>{item.label}</strong>
                  <p style={{margin:"5px 0 0",color:"#667085",fontSize:"13px"}}>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:"18px"}}>
          <section className="panel">
            <div className="panel-header"><div><p className="panel-kicker">FIELD VERIFICATION</p><h3>Ground truth</h3></div></div>
            <div style={{display:"grid",gap:"10px"}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:"12px"}}><span style={{color:"#667085"}}>Verification status</span><strong>{formatStatus(report.status)}</strong></div>
              <div style={{display:"flex",justifyContent:"space-between",gap:"12px"}}><span style={{color:"#667085"}}>Result</span><strong style={{textAlign:"right"}}>{report.status === "confirmed" ? "Location confirmed" : report.status === "not_found" ? "Condition not confirmed" : "Awaiting field check"}</strong></div>
              {report.status === "pending" && <button className="small-button" style={{marginTop:"6px"}} onClick={() => setActivePage("verification")}>Open Verification Queue</button>}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header"><div><p className="panel-kicker">MUNICIPAL RESPONSE</p><h3>Containment</h3></div></div>
            {action ? (
              <div style={{display:"grid",gap:"10px"}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:"12px"}}><span style={{color:"#667085"}}>Action</span><strong style={{textAlign:"right"}}>{formatStatus(action.action_type)}</strong></div>
                <div style={{display:"flex",justifyContent:"space-between",gap:"12px"}}><span style={{color:"#667085"}}>Status</span><strong>{formatStatus(action.status)}</strong></div>
                <button className="small-button" style={{marginTop:"6px"}} onClick={() => setActivePage("actions")}>Open Containment Queue</button>
              </div>
            ) : (
              <div><strong>No containment action yet</strong><p style={{color:"#667085",fontSize:"13px",lineHeight:1.5}}>A municipal containment action is created after a report is confirmed.</p></div>
            )}
          </section>
        </section>
      </>
    );
  };

  // ==================================================
  // CITIZEN REPORTS
  // ==================================================

  const renderCitizenReports = () => {
    return (
      <>
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              COMMUNITY SURVEILLANCE
            </p>

            <h1>
              Citizen Reports
            </h1>

            <p className="page-description">
              Submit and review breeding-site
              observations.
            </p>
          </div>

          <button
            className="small-button"
            onClick={
              loadCitizenReports
            }
            disabled={
              reportsLoading
            }
          >
            {reportsLoading
              ? "Refreshing..."
              : "Refresh Reports"}
          </button>
        </div>

        {reportsError && (
          <div className="error-banner">
            {reportsError}
          </div>
        )}

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">
                COMMUNITY INPUT
              </p>

              <h3>
                Submit New Report
              </h3>
            </div>

            <span className="source-badge">
              CITIZEN PORTAL
            </span>
          </div>

          <form
            onSubmit={
              submitCitizenReport
            }
            style={{
              display: "grid",
              gap: "16px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(2, minmax(0, 1fr))",
                gap: "16px",
              }}
            >
              <label
                style={{
                  display: "grid",
                  gap: "7px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    color: "#344054",
                  }}
                >
                  Report Type
                </span>

                <select
                  value={
                    reportForm.report_type
                  }
                  onChange={(event) =>
                    setReportForm({
                      ...reportForm,
                      report_type:
                        event.target
                          .value,
                    })
                  }
                  style={{
                    padding:
                      "11px 12px",
                    borderRadius:
                      "9px",
                    border:
                      "1px solid #d0d5dd",
                    background:
                      "#fff",
                    fontSize:
                      "14px",
                  }}
                >
                  <option value="standing_water">
                    Standing Water
                  </option>

                  <option value="uncovered_tank">
                    Uncovered Tank
                  </option>

                  <option value="mosquito_breeding">
                    Suspected Mosquito Breeding
                  </option>

                  <option value="other">
                    Other
                  </option>
                </select>
              </label>

              <label
                style={{
                  display: "grid",
                  gap: "7px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    color: "#344054",
                  }}
                >
                  Description
                </span>

                <input
                  type="text"
                  value={
                    reportForm.description
                  }
                  onChange={(event) =>
                    setReportForm({
                      ...reportForm,
                      description:
                        event.target
                          .value,
                    })
                  }
                  placeholder="Example: Water collected near an uncovered container"
                  style={{
                    padding:
                      "11px 12px",
                    borderRadius:
                      "9px",
                    border:
                      "1px solid #d0d5dd",
                    fontSize:
                      "14px",
                  }}
                />
              </label>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(2, minmax(0, 1fr))",
                gap: "16px",
              }}
            >
              <label
                style={{
                  display: "grid",
                  gap: "7px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    color: "#344054",
                  }}
                >
                  Latitude
                </span>

                <input
                  type="number"
                  step="any"
                  value={
                    reportForm.latitude
                  }
                  onChange={(event) =>
                    setReportForm({
                      ...reportForm,
                      latitude:
                        event.target
                          .value,
                    })
                  }
                  placeholder="19.2800"
                  style={{
                    padding:
                      "11px 12px",
                    borderRadius:
                      "9px",
                    border:
                      "1px solid #d0d5dd",
                    fontSize:
                      "14px",
                  }}
                />
              </label>

              <label
                style={{
                  display: "grid",
                  gap: "7px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    color: "#344054",
                  }}
                >
                  Longitude
                </span>

                <input
                  type="number"
                  step="any"
                  value={
                    reportForm.longitude
                  }
                  onChange={(event) =>
                    setReportForm({
                      ...reportForm,
                      longitude:
                        event.target
                          .value,
                    })
                  }
                  placeholder="72.8500"
                  style={{
                    padding:
                      "11px 12px",
                    borderRadius:
                      "9px",
                    border:
                      "1px solid #d0d5dd",
                    fontSize:
                      "14px",
                  }}
                />
              </label>
            </div>

            <div
              style={{
                display: "flex",
                alignItems:
                  "center",
                gap: "14px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="submit"
                className="primary-button"
              >
                Submit Report
              </button>

              {submitMessage && (
                <span
                  style={{
                    fontSize:
                      "13px",
                    fontWeight:
                      "600",
                  }}
                >
                  {submitMessage}
                </span>
              )}
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">
                REPORT QUEUE
              </p>

              <h3>
                Submitted Observations
              </h3>
            </div>

            <span className="count-badge">
              {citizenReports.length} reports
            </span>
          </div>

          {reportsLoading ? (
            <div className="placeholder-page">
              <p>
                Loading citizen reports...
              </p>
            </div>
          ) : citizenReports.length ===
            0 ? (
            <div className="placeholder-page">
              <div className="placeholder-icon">
                <ClipboardText {...iconProps} />
              </div>

              <h3>
                No reports found
              </h3>

              <p>
                Citizen-submitted
                observations will appear
                here.
              </p>
            </div>
          ) : (
            <div className="hotspot-table">
              <div className="table-row table-heading">
                <span>TYPE</span>
                <span>
                  DESCRIPTION
                </span>
                <span>LOCATION</span>
                <span>STATUS</span>
                <span>REPORTED</span>
                <span>CASE</span>
              </div>

              {citizenReports.map(
                (report) => (
                  <div
                    className="table-row"
                    key={report.id}
                  >
                    <strong>
                      {
                        report.report_type
                      }
                    </strong>

                    <span>
                      {report.description ||
                        "No description"}
                    </span>

                    <span>
                      {Number(
                        report.latitude
                      ).toFixed(4)}
                      ,{" "}
                      {Number(
                        report.longitude
                      ).toFixed(4)}
                    </span>

                    <span
                      className={`risk-badge ${
                        report.status ===
                        "pending"
                          ? "medium-risk"
                          : report.status ===
                            "confirmed"
                          ? "low-risk"
                          : "high-risk"
                      }`}
                    >
                      {formatStatus(
                        report.status
                      )}
                    </span>

                    <span>
                      {report.created_at ||
                        "—"}
                    </span>

                    <button
                      className="small-button"
                      style={{ padding: "7px 10px", whiteSpace: "nowrap" }}
                      onClick={() => openCase(report.id)}
                    >
                      Open case
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </section>
      </>
    );
  };

  // ==================================================
  // FIELD VERIFICATION
  // ==================================================

  const renderFieldVerification =
    () => {
      return (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                GROUND VERIFICATION
              </p>

              <h1>
                Field Verification
              </h1>

              <p className="page-description">
                Verify reported breeding
                locations before containment
                action is initiated.
              </p>
            </div>

            <button
              className="small-button"
              onClick={
                loadCitizenReports
              }
              disabled={
                reportsLoading
              }
            >
              {reportsLoading
                ? "Refreshing..."
                : "Refresh Queue"}
            </button>
          </div>

          {reportsError && (
            <div className="error-banner">
              {reportsError}
            </div>
          )}

          {verificationMessage && (
            <div
              className="error-banner"
              style={{
                background:
                  "#f0fdf4",
                color:
                  "#166534",
                border:
                  "1px solid #bbf7d0",
              }}
            >
              {verificationMessage}
            </div>
          )}

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">
                <WarningCircle {...iconProps} />
              </div>

              <div>
                <span>
                  PENDING CHECKS
                </span>

                <strong>
                  {
                    pendingReports.length
                  }
                </strong>

                <small>
                  Awaiting field verification
                </small>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <CheckCircle {...iconProps} />
              </div>

              <div>
                <span>
                  CONFIRMED
                </span>

                <strong>
                  {
                    confirmedReports.length
                  }
                </strong>

                <small>
                  Verified breeding locations
                </small>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <XCircle {...iconProps} />
              </div>

              <div>
                <span>
                  NOT FOUND
                </span>

                <strong>
                  {
                    notFoundReports.length
                  }
                </strong>

                <small>
                  Not confirmed in field
                </small>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <Hash {...iconProps} />
              </div>

              <div>
                <span>
                  TOTAL REPORTS
                </span>

                <strong>
                  {
                    citizenReports.length
                  }
                </strong>

                <small>
                  All submitted observations
                </small>
              </div>
            </div>
          </div>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">
                  VERIFICATION QUEUE
                </p>

                <h3>
                  Pending Field Checks
                </h3>
              </div>

              <span className="count-badge">
                {
                  pendingReports.length
                }{" "}
                pending
              </span>
            </div>

            {pendingReports.length ===
            0 ? (
              <div className="placeholder-page">
                <div className="placeholder-icon">
                  <CheckCircle {...iconProps} />
                </div>

                <h3>
                  Verification queue is clear
                </h3>

                <p>
                  There are no citizen
                  reports waiting for field
                  verification.
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "14px",
                }}
              >
                {pendingReports.map(
                  (report) => (
                    <div
                      key={report.id}
                      style={{
                        border:
                          "1px solid #e4e7ec",
                        borderRadius:
                          "12px",
                        padding:
                          "18px",
                        background:
                          "#ffffff",
                        display:
                          "grid",
                        gridTemplateColumns:
                          "1fr auto",
                        gap: "20px",
                        alignItems:
                          "center",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display:
                              "flex",
                            gap:
                              "10px",
                            alignItems:
                              "center",
                            marginBottom:
                              "8px",
                          }}
                        >
                          <strong>
                            Report #
                            {
                              report.id
                            }
                          </strong>

                          <span
                            className="risk-badge medium-risk"
                          >
                            Pending
                          </span>
                        </div>

                        <p
                          style={{
                            margin:
                              "0 0 8px",
                            fontWeight:
                              "600",
                          }}
                        >
                          {
                            report.report_type
                          }
                        </p>

                        <p
                          style={{
                            margin:
                              "0 0 8px",
                            color:
                              "#667085",
                          }}
                        >
                          {
                            report.description ||
                            "No description"
                          }
                        </p>

                        <small
                          style={{
                            color:
                              "#667085",
                          }}
                        >
                          Location:{" "}
                          {Number(
                            report.latitude
                          ).toFixed(
                            4
                          )}
                          ,{" "}
                          {Number(
                            report.longitude
                          ).toFixed(
                            4
                          )}
                        </small>
                      </div>

                      <div
                        style={{
                          display:
                            "flex",
                          gap:
                            "8px",
                          flexWrap:
                            "wrap",
                          justifyContent:
                            "flex-end",
                        }}
                      >
                        <button
                          className="primary-button"
                          disabled={
                            verificationLoading
                          }
                          onClick={() =>
                            verifyCitizenReport(
                              report.id,
                              "confirmed"
                            )
                          }
                        >
                          Confirm
                        </button>

                        <button
                          className="small-button"
                          disabled={
                            verificationLoading
                          }
                          onClick={() =>
                            verifyCitizenReport(
                              report.id,
                              "not_found"
                            )
                          }
                        >
                          Not Found
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">
                  VERIFICATION HISTORY
                </p>

                <h3>
                  Completed Checks
                </h3>
              </div>

              <span className="count-badge">
                {confirmedReports.length +
                  notFoundReports.length}{" "}
                completed
              </span>
            </div>

            {confirmedReports.length +
              notFoundReports.length ===
            0 ? (
              <div className="placeholder-page">
                <p>
                  No completed verification
                  records yet.
                </p>
              </div>
            ) : (
              <div className="hotspot-table">
                <div className="table-row table-heading">
                  <span>
                    REPORT
                  </span>

                  <span>
                    TYPE
                  </span>

                  <span>
                    LOCATION
                  </span>

                  <span>
                    RESULT
                  </span>

                  <span>
                    REPORTED
                  </span>
                </div>

                {[
                  ...confirmedReports,
                  ...notFoundReports,
                ]
                  .sort((a, b) =>
                    String(
                      b.created_at ||
                        ""
                    ).localeCompare(
                      String(
                        a.created_at ||
                          ""
                      )
                    )
                  )
                  .map((report) => (
                    <div
                      className="table-row"
                      key={report.id}
                    >
                      <strong>
                        #{report.id}
                      </strong>

                      <span>
                        {
                          report.report_type
                        }
                      </span>

                      <span>
                        {Number(
                          report.latitude
                        ).toFixed(4)}
                        ,{" "}
                        {Number(
                          report.longitude
                        ).toFixed(4)}
                      </span>

                      <span
                        className={`risk-badge ${
                          report.status ===
                          "confirmed"
                            ? "low-risk"
                            : "high-risk"
                        }`}
                      >
                        {formatStatus(
                          report.status
                        )}
                      </span>

                      <span>
                        {
                          report.created_at ||
                          "—"
                        }
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </>
      );
    };

  // ==================================================
  // CONTAINMENT ACTIONS
  // ==================================================

  const renderContainmentActions =
    () => {
      return (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                MUNICIPAL RESPONSE
              </p>

              <h1>
                Containment Actions
              </h1>

              <p className="page-description">
                Manage response actions created
                from confirmed breeding-site
                reports.
              </p>
            </div>

            <button
              className="small-button"
              onClick={
                loadContainmentActions
              }
              disabled={
                actionsLoading
              }
            >
              {actionsLoading
                ? "Refreshing..."
                : "Refresh Actions"}
            </button>
          </div>

          {actionsError && (
            <div className="error-banner">
              {actionsError}
            </div>
          )}

          {actionMessage && (
            <div
              className="error-banner"
              style={{
                background:
                  "#f0fdf4",
                color:
                  "#166534",
                border:
                  "1px solid #bbf7d0",
              }}
            >
              {actionMessage}
            </div>
          )}

          {followUpMessage.text && (
            <div
              className="error-banner"
              style={
                followUpMessage.type === "success"
                  ? {
                      background: "#f0fdf4",
                      color: "#166534",
                      border: "1px solid #bbf7d0",
                    }
                  : undefined
              }
            >
              {followUpMessage.text}
            </div>
          )}

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">
                <WarningCircle {...iconProps} />
              </div>

              <div>
                <span>
                  OPEN ACTIONS
                </span>

                <strong>
                  {openActions.length}
                </strong>

                <small>
                  Awaiting municipal response
                </small>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <ArrowClockwise {...iconProps} />
              </div>

              <div>
                <span>
                  IN PROGRESS
                </span>

                <strong>
                  {
                    inProgressActions.length
                  }
                </strong>

                <small>
                  Currently being handled
                </small>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <CheckCircle {...iconProps} />
              </div>

              <div>
                <span>
                  COMPLETED
                </span>

                <strong>
                  {
                    completedActions.length
                  }
                </strong>

                <small>
                  Completed containment tasks
                </small>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <Hash {...iconProps} />
              </div>

              <div>
                <span>
                  TOTAL ACTIONS
                </span>

                <strong>
                  {
                    containmentActions.length
                  }
                </strong>

                <small>
                  Confirmed hotspot responses
                </small>
              </div>
            </div>
          </div>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">
                  RESPONSE QUEUE
                </p>

                <h3>
                  Municipal Containment Tasks
                </h3>
              </div>

              <span className="count-badge">
                {
                  containmentActions.length
                }{" "}
                actions
              </span>
            </div>

            {actionsLoading &&
            containmentActions.length ===
              0 ? (
              <div className="placeholder-page">
                <p>
                  Loading containment
                  actions...
                </p>
              </div>
            ) : containmentActions.length ===
              0 ? (
              <div className="placeholder-page">
                <div className="placeholder-icon">
                    <Flag {...iconProps} />
                </div>

                <h3>
                  No containment actions
                </h3>

                <p>
                  When a field officer
                  confirms a breeding site,
                  the system will create a
                  containment action here.
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "16px",
                }}
              >
                {containmentActions.map(
                  (action) => (
                    <div
                      key={action.id}
                      style={{
                        border:
                          "1px solid #e4e7ec",
                        borderRadius:
                          "12px",
                        padding:
                          "20px",
                        background:
                          "#ffffff",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          justifyContent:
                            "space-between",
                          gap:
                            "16px",
                          alignItems:
                            "flex-start",
                          flexWrap:
                            "wrap",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              display:
                                "flex",
                              alignItems:
                                "center",
                              gap:
                                "10px",
                              marginBottom:
                                "8px",
                              flexWrap:
                                "wrap",
                            }}
                          >
                            <strong
                              style={{
                                fontSize:
                                  "16px",
                              }}
                            >
                              Action #
                              {
                                action.id
                              }
                            </strong>

                            <span
                              className={`risk-badge ${getStatusClass(
                                action.status
                              )}`}
                            >
                              {formatStatus(
                                action.status
                              )}
                            </span>
                          </div>

                          <h3
                            style={{
                              margin:
                                "0 0 8px",
                            }}
                          >
                            {
                              action.action_type
                            }
                          </h3>

                          <p
                            style={{
                              margin:
                                "0 0 10px",
                              color:
                                "#667085",
                            }}
                          >
                            {
                              action.description
                            }
                          </p>
                        </div>

                        <div
                          style={{
                            fontSize:
                              "12px",
                            color:
                              "#667085",
                            textAlign:
                              "right",
                          }}
                        >
                          <div>
                            Report #
                            {
                              action.report_id
                            }
                          </div>

                          <div>
                            Created:{" "}
                            {
                              action.created_at ||
                              "—"
                            }
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop:
                            "16px",
                          padding:
                            "14px",
                          background:
                            "#f8fafc",
                          borderRadius:
                            "9px",
                          display:
                            "grid",
                          gridTemplateColumns:
                            "repeat(3, minmax(0, 1fr))",
                          gap:
                            "12px",
                        }}
                      >
                        <div>
                          <small
                            style={{
                              display:
                                "block",
                              color:
                                "#667085",
                              marginBottom:
                                "4px",
                            }}
                          >
                            REPORT TYPE
                          </small>

                          <strong>
                            {formatStatus(
                              action.report_type
                            )}
                          </strong>
                        </div>

                        <div>
                          <small
                            style={{
                              display:
                                "block",
                              color:
                                "#667085",
                              marginBottom:
                                "4px",
                            }}
                          >
                            LOCATION
                          </small>

                          <strong>
                            {Number(
                              action.latitude
                            ).toFixed(4)}
                            ,{" "}
                            {Number(
                              action.longitude
                            ).toFixed(4)}
                          </strong>
                        </div>

                        <div>
                          <small
                            style={{
                              display:
                                "block",
                              color:
                                "#667085",
                              marginBottom:
                                "4px",
                            }}
                          >
                            ORIGINAL REPORT
                          </small>

                          <strong>
                            {action.report_description ||
                              "No description"}
                          </strong>
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop:
                            "16px",
                          display:
                            "flex",
                          gap:
                            "8px",
                          justifyContent:
                            "flex-end",
                          flexWrap:
                            "wrap",
                        }}
                      >
                        {action.status !==
                          "in_progress" &&
                          action.status !==
                            "completed" && (
                            <button
                              className="small-button"
                              disabled={
                                actionsLoading
                              }
                              onClick={() =>
                                updateContainmentAction(
                                  action.id,
                                  "in_progress"
                                )
                              }
                            >
                              Start Action
                            </button>
                          )}

                        {action.status ===
                          "in_progress" && (
                          <button
                            className="primary-button"
                            disabled={
                              actionsLoading
                            }
                            onClick={() =>
                              updateContainmentAction(
                                action.id,
                                "completed"
                              )
                            }
                          >
                            Mark Completed
                          </button>
                        )}

                        {action.status ===
                          "completed" && (
                          <>
                            <span
                              style={{
                                fontSize: "13px",
                                fontWeight: "600",
                                color: "#166534",
                                alignSelf: "center",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                              }}
                            >
                              <CheckCircle {...iconProps} size={15} />
                              Completed{" "}
                              {action.completed_at
                                ? `on ${action.completed_at}`
                                : ""}
                            </span>
                            {action.latest_follow_up_outcome && (
                              <span
                                style={{
                                  fontSize: "13px",
                                  color: action.latest_follow_up_outcome === "resolved" ? "#166534" : "#b54708",
                                  alignSelf: "center",
                                }}
                              >
                                Latest follow-up: {formatFollowUpOutcome(action.latest_follow_up_outcome)}
                                {action.latest_follow_up_at
                                  ? ` (${action.latest_follow_up_at})`
                                  : ""}
                              </span>
                            )}
                            <div
                              style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "flex-end",
                                gap: "8px",
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{fontSize:"13px",color:"#667085",marginRight:"4px"}}>
                                Record follow-up:
                              </span>
                              {[
                                ["resolved", "Resolved"],
                                ["still_present", "Issue Still Present"],
                                ["needs_action", "Further Action Needed"],
                              ].map(([outcome, label]) => (
                                <button
                                  key={outcome}
                                  className="small-button"
                                  disabled={followUpLoadingActionId === action.id}
                                  onClick={() =>
                                    recordFollowUpVerification(
                                      action.id,
                                      outcome
                                    )
                                  }
                                >
                                  {followUpLoadingActionId === action.id
                                    ? "Saving..."
                                    : label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        </>
      );
    };

  // ==================================================
  // ANALYTICS
  // ==================================================

  const renderAnalytics = () => {
    const totalReports =
      citizenReports.length;

    const completedVerifications =
      confirmedReports.length +
      notFoundReports.length;

    const verificationRate =
      completedVerifications > 0
        ? Math.round(
            (confirmedReports.length /
              completedVerifications) *
              100
          )
        : 0;

    const containmentCompletionRate =
      containmentActions.length > 0
        ? Math.round(
            (completedActions.length /
              containmentActions.length) *
              100
          )
        : 0;

    const reportProcessingRate =
      totalReports > 0
        ? Math.round(
            (completedVerifications /
              totalReports) *
              100
          )
        : 0;

    const highRiskPercentage =
      wardRisk.length > 0
        ? Math.round(
            (highRiskWardCount /
              wardRisk.length) *
              100
          )
        : 0;

    return (
      <>
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              SYSTEM PERFORMANCE
            </p>

            <h1>
              Analytics
            </h1>

            <p className="page-description">
              Operational evidence from the
              VectoWatch surveillance workflow.
            </p>
          </div>

          <button
            className="small-button"
            onClick={refreshAnalytics}
            disabled={analyticsRefreshing}
          >
            {analyticsRefreshing
              ? "Refreshing..."
              : "Refresh Analytics"}
          </button>
        </div>

        {/* =========================================
            KEY PERFORMANCE INDICATORS
        ========================================= */}

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">
              <ClipboardText {...iconProps} />
            </div>

            <div>
              <span>
                TOTAL REPORTS
              </span>

              <strong>
                {totalReports}
              </strong>

              <small>
                Community observations received
              </small>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <CheckCircle {...iconProps} />
            </div>

            <div>
              <span>
                VERIFICATION RATE
              </span>

              <strong>
                {verificationRate}%
              </strong>

              <small>
                Confirmed among completed checks
              </small>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <Flag {...iconProps} />
            </div>

            <div>
              <span>
                CONTAINMENT ACTIONS
              </span>

              <strong>
                {
                  containmentActions.length
                }
              </strong>

              <small>
                Generated from confirmed reports
              </small>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <CheckCircle {...iconProps} />
            </div>

            <div>
              <span>
                COMPLETION RATE
              </span>

              <strong>
                {containmentCompletionRate}%
              </strong>

              <small>
                Containment tasks completed
              </small>
            </div>
          </div>
        </div>

        {/* =========================================
            PIPELINE
        ========================================= */}

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">
                END-TO-END WORKFLOW
              </p>

              <h3>
                VectoWatch Operational Pipeline
              </h3>
            </div>

            <span className="source-badge">
              LIVE DATABASE
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(5, minmax(0, 1fr))",
              gap: "12px",
            }}
          >
            {[
              {
                number: "01",
                title: "Predict",
                value:
                  `${highRiskWardCount} high-risk wards`,
                description:
                  "Environmental risk assessment",
              },
              {
                number: "02",
                title: "Corroborate",
                value:
                  `${totalReports} citizen reports`,
                description:
                  "Community observations",
              },
              {
                number: "03",
                title: "Verify",
                value:
                  `${completedVerifications} completed`,
                description:
                  "Ground verification",
              },
              {
                number: "04",
                title: "Act",
                value:
                  `${containmentActions.length} actions`,
                description:
                  "Municipal containment",
              },
              {
                number: "05",
                title: "Learn",
                value:
                  `${containmentCompletionRate}% completed`,
                description:
                  "Outcome tracking",
              },
            ].map((step) => (
              <div
                key={step.number}
                style={{
                  border:
                    "1px solid #e4e7ec",
                  borderRadius:
                    "12px",
                  padding:
                    "18px",
                  background:
                    "#ffffff",
                  minHeight:
                    "135px",
                }}
              >
                <small
                  style={{
                    color:
                      "#98a2b3",
                    fontWeight:
                      "700",
                  }}
                >
                  {step.number}
                </small>

                <h3
                  style={{
                    margin:
                      "8px 0 5px",
                  }}
                >
                  {step.title}
                </h3>

                <strong
                  style={{
                    display:
                      "block",
                    fontSize:
                      "14px",
                    marginBottom:
                      "5px",
                  }}
                >
                  {step.value}
                </strong>

                <p
                  style={{
                    margin: 0,
                    color:
                      "#667085",
                    fontSize:
                      "12px",
                  }}
                >
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* =========================================
            LIVE WEATHER EVIDENCE
        ========================================= */}

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">
                LIVE WEATHER EVIDENCE
              </p>

              <h3>
                Environmental Risk Drivers
              </h3>

              <p
                style={{
                  margin: "6px 0 0",
                  color: "#667085",
                  fontSize: "12px",
                }}
              >
                Live weather observations feeding the
                VectoWatch prototype environmental risk engine.
              </p>
            </div>

            <span className="source-badge">
              OPEN-METEO / LIVE
            </span>
          </div>

          {wardRisk.length === 0 ? (
            <div className="placeholder-page">
              <p>
                No live ward weather data available.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "14px",
              }}
            >
              {wardRisk.map((ward) => {
                const conditions =
                  getEnvironmentalConditions(ward);
                const score = getScore(ward);
                const level = getRiskLevel(ward);
                const weatherMetadata =
                  ward?.weather_metadata ??
                  ward?.weather ??
                  {};

                const rainfallPoints =
                  conditions.rainfall_mm >= 50
                    ? 40
                    : conditions.rainfall_mm >= 25
                    ? 30
                    : conditions.rainfall_mm >= 10
                    ? 20
                    : conditions.rainfall_mm > 0
                    ? 10
                    : 0;

                const temperaturePoints =
                  conditions.temperature_c >= 25 &&
                  conditions.temperature_c <= 32
                    ? 30
                    : (conditions.temperature_c >= 20 &&
                        conditions.temperature_c < 25) ||
                      (conditions.temperature_c > 32 &&
                        conditions.temperature_c <= 35)
                    ? 20
                    : 5;

                const humidityPoints =
                  conditions.humidity_pct >= 80
                    ? 30
                    : conditions.humidity_pct >= 60
                    ? 20
                    : conditions.humidity_pct >= 40
                    ? 10
                    : 5;

                const factors = [
                  rainfallPoints > 0
                    ? `Rainfall contribution: +${rainfallPoints}`
                    : "No rainfall contribution",
                  `Temperature contribution: +${temperaturePoints}`,
                  `Humidity contribution: +${humidityPoints}`,
                ];

                return (
                  <div
                    key={
                      ward.id ??
                      ward.ward_id ??
                      getWardName(ward)
                    }
                    style={{
                      border: "1px solid #e4e7ec",
                      borderRadius: "12px",
                      padding: "16px",
                      background: "#ffffff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "10px",
                        marginBottom: "12px",
                      }}
                    >
                      <div>
                        <strong
                          style={{
                            display: "block",
                            color: "#17324d",
                            fontSize: "15px",
                          }}
                        >
                          {getWardName(ward)}
                        </strong>

                        <small
                          style={{
                            color: weatherMetadata.live
                              ? "#15803d"
                              : "#b45309",
                            fontWeight: "700",
                          }}
                        >
                          {weatherMetadata.live
                            ? "● LIVE OBSERVATION"
                            : "● FALLBACK DATA"}
                        </small>
                      </div>

                      <span
                        className={`risk-badge ${getRiskClass(
                          level
                        )}`}
                      >
                        {level}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(3, 1fr)",
                        gap: "8px",
                        marginBottom: "14px",
                      }}
                    >
                      {[
                        [
                          CloudRain,
                          "Rainfall",
                          `${conditions.rainfall_mm} mm`,
                        ],
                        [
                          Thermometer,
                          "Temperature",
                          `${conditions.temperature_c}°C`,
                        ],
                        [
                          Drop,
                          "Humidity",
                          `${conditions.humidity_pct}%`,
                        ],
                      ].map(([Icon, label, value]) => (
                        <div
                          key={label}
                          style={{
                            padding: "10px",
                            borderRadius: "9px",
                            background: "#f7f9fa",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "15px",
                              marginBottom: "3px",
                            }}
                          >
                            <Icon {...iconProps} size={17} />
                          </div>
                          <small
                            style={{
                              display: "block",
                              color: "#667085",
                              fontSize: "10px",
                              textTransform: "uppercase",
                              letterSpacing: "0.4px",
                            }}
                          >
                            {label}
                          </small>
                          <strong
                            style={{
                              display: "block",
                              marginTop: "2px",
                              fontSize: "14px",
                              color: "#17324d",
                            }}
                          >
                            {value}
                          </strong>
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "8px",
                      }}
                    >
                      <span
                        style={{
                          color: "#667085",
                          fontSize: "11px",
                          fontWeight: "700",
                          textTransform: "uppercase",
                        }}
                      >
                        Prototype risk score
                      </span>

                      <strong
                        style={{
                          fontSize: "18px",
                          color: "#17324d",
                        }}
                      >
                        {score}/100
                      </strong>
                    </div>

                    <div
                      style={{
                        height: "8px",
                        background: "#eef2f3",
                        borderRadius: "20px",
                        overflow: "hidden",
                        marginBottom: "12px",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(
                            Math.max(score, 0),
                            100
                          )}%`,
                          height: "100%",
                          background: "#0f8b78",
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: "5px",
                        color: "#667085",
                        fontSize: "11px",
                      }}
                    >
                      {factors.map((factor) => (
                        <div key={factor}>• {factor}</div>
                      ))}
                    </div>

                    <div
                      style={{
                        marginTop: "12px",
                        paddingTop: "10px",
                        borderTop: "1px solid #eef2f3",
                        color: "#98a2b3",
                        fontSize: "10px",
                      }}
                    >
                      Source: {weatherMetadata.source || "Weather API"}
                      {weatherMetadata.observed_at
                        ? ` • Observed ${weatherMetadata.observed_at}`
                        : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div
            className="insight-box"
            style={{ marginTop: "16px" }}
          >
            <strong>How to read this</strong>
            <p>
              These are environmental observations and a transparent
              prototype risk index for prioritizing monitoring. They do
              not diagnose illness or predict that an individual will
              become sick.
            </p>
          </div>
        </section>

        {/* =========================================
            SPATIAL HOTSPOT CLUSTERING
        ========================================= */}

        {(() => {
          const spatialClusters =
            buildDbscanClusters(citizenReports);
          const clusteredReportIds = new Set(
            spatialClusters.flatMap((cluster) =>
              cluster.reports.map((report) => report.id)
            )
          );
          const unclusteredCount =
            citizenReports.filter(
              (report) => !clusteredReportIds.has(report.id)
            ).length;

          const validReports = citizenReports
            .map((report) => ({
              ...report,
              latitude: Number(report.latitude),
              longitude: Number(report.longitude),
            }))
            .filter(
              (report) =>
                Number.isFinite(report.latitude) &&
                Number.isFinite(report.longitude)
            );

          const mapCenter =
            validReports.length > 0
              ? [
                  validReports.reduce(
                    (sum, report) => sum + report.latitude,
                    0
                  ) / validReports.length,
                  validReports.reduce(
                    (sum, report) => sum + report.longitude,
                    0
                  ) / validReports.length,
                ]
              : [0, 0];

          return (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">
                    SPATIAL CORROBORATION
                  </p>
                  <h3>
                    Citizen Report Hotspot Clusters
                  </h3>
                  <p
                    style={{
                      margin: "6px 0 0",
                      color: "#667085",
                      fontSize: "12px",
                    }}
                  >
                    DBSCAN groups nearby citizen observations into
                    potential geographic hotspots.
                  </p>
                </div>

                <span className="source-badge">
                  DBSCAN / 500 M
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(280px, 1.15fr) minmax(300px, 1fr)",
                  gap: "18px",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    height: "315px",
                    minWidth: 0,
                    border: "1px solid #e4e7ec",
                    borderRadius: "13px",
                    overflow: "hidden",
                    background: "#eef3f1",
                  }}
                >
                  <MapContainer
                    center={mapCenter}
                    zoom={validReports.length > 0 ? 13 : 2}
                    scrollWheelZoom
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <FitReportLocations reports={validReports} />

                    {validReports.map((report) => (
                      <CircleMarker
                        key={`report-${report.id}`}
                        center={[report.latitude, report.longitude]}
                        radius={7}
                        pathOptions={{
                          color: "#ffffff",
                          weight: 2,
                          fillColor: clusteredReportIds.has(report.id)
                            ? "#0f8b78"
                            : "#667085",
                          fillOpacity: 1,
                        }}
                      >
                        <Popup>
                          <strong>Citizen report #{report.id}</strong>
                          <div>
                            <strong>Type:</strong>{" "}
                            {formatStatus(report.report_type)}
                          </div>
                          <div>
                            <strong>Ward:</strong>{" "}
                            {report.ward_name ??
                              (report.ward_id
                                ? `Ward ${report.ward_id}`
                                : "Not provided")}
                          </div>
                          <div>
                            <strong>Status:</strong>{" "}
                            {formatStatus(report.status)}
                          </div>
                          <div>
                            <strong>Coordinates:</strong>{" "}
                            {report.latitude.toFixed(5)},{" "}
                            {report.longitude.toFixed(5)}
                          </div>
                        </Popup>
                      </CircleMarker>
                    ))}

                    {spatialClusters.map((cluster) => (
                      <Marker
                        key={`cluster-${cluster.id}`}
                        position={[cluster.latitude, cluster.longitude]}
                        icon={L.divIcon({
                          className: "",
                          html: `<div style="width:40px;height:40px;border-radius:50%;background:rgba(15,139,120,0.2);display:grid;place-items:center"><span style="width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#0f8b78;color:#fff;font-size:11px;font-weight:800;border:2px solid #fff;box-shadow:0 2px 8px rgba(16,24,40,0.25)">${cluster.reports.length}</span></div>`,
                          iconSize: [40, 40],
                          iconAnchor: [20, 20],
                        })}
                      >
                        <Popup>
                          <strong>Hotspot Cluster {cluster.id}</strong>
                          <div>
                            <strong>Reports:</strong>{" "}
                            {cluster.reports.length}
                          </div>
                          <div>
                            <strong>Centroid:</strong>{" "}
                            {cluster.latitude.toFixed(5)},{" "}
                            {cluster.longitude.toFixed(5)}
                          </div>
                          <div>
                            <strong>Confirmed:</strong>{" "}
                            {cluster.confirmedCount}
                          </div>
                          <div>
                            <strong>Pending:</strong>{" "}
                            {cluster.pendingCount}
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>

                  <div
                    style={{
                      position: "absolute",
                      top: "12px",
                      left: "14px",
                      zIndex: 2,
                      padding: "7px 9px",
                      borderRadius: "8px",
                      background: "rgba(255,255,255,0.92)",
                      color: "#475467",
                      fontSize: "10px",
                      fontWeight: "800",
                      letterSpacing: "0.5px",
                    }}
                  >
                    REPORT LOCATION MAP
                  </div>

                  {validReports.length === 0 && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        color: "#667085",
                        fontSize: "12px",
                      }}
                    >
                      No geolocated citizen reports yet.
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gap: "10px", alignContent: "start" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: "8px",
                    }}
                  >
                    {[
                      ["REPORTS", citizenReports.length],
                      ["CLUSTERS", spatialClusters.length],
                      ["UNCLUSTERED", unclusteredCount],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        style={{
                          padding: "12px",
                          border: "1px solid #e4e7ec",
                          borderRadius: "10px",
                          background: "#ffffff",
                        }}
                      >
                        <small
                          style={{
                            color: "#667085",
                            fontSize: "9px",
                            fontWeight: "800",
                            letterSpacing: "0.5px",
                          }}
                        >
                          {label}
                        </small>
                        <strong
                          style={{
                            display: "block",
                            marginTop: "3px",
                            color: "#17324d",
                            fontSize: "20px",
                          }}
                        >
                          {value}
                        </strong>
                      </div>
                    ))}
                  </div>

                  {spatialClusters.length === 0 ? (
                    <div className="placeholder-page" style={{ padding: "28px 18px" }}>
                      <h3 style={{ marginBottom: "6px" }}>
                        No spatial hotspot yet
                      </h3>
                      <p>
                        DBSCAN needs at least two nearby reports to form a cluster.
                      </p>
                    </div>
                  ) : (
                    spatialClusters.map((cluster) => (
                      <div
                        key={cluster.id}
                        style={{
                          padding: "14px",
                          border: "1px solid #dce9e6",
                          borderRadius: "11px",
                          background: "#f7fbfa",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "10px",
                            alignItems: "center",
                          }}
                        >
                          <strong style={{ color: "#17324d" }}>
                            Hotspot Cluster {cluster.id}
                          </strong>
                          <span className="risk-badge low-risk">
                            {cluster.reports.length} reports
                          </span>
                        </div>
                        <p
                          style={{
                            margin: "7px 0",
                            color: "#667085",
                            fontSize: "11px",
                          }}
                        >
                          Centroid {cluster.latitude.toFixed(4)}, {cluster.longitude.toFixed(4)}
                          {cluster.radiusMeters > 0
                            ? ` • radius ${cluster.radiusMeters} m`
                            : " • same-location reports"}
                        </p>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            flexWrap: "wrap",
                            fontSize: "10px",
                            color: "#475467",
                          }}
                        >
                          <span>{cluster.confirmedCount} confirmed</span>
                          <span>•</span>
                          <span>{cluster.pendingCount} pending</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div
                className="insight-box"
                style={{ marginTop: "16px" }}
              >
                <strong>How this supports corroboration</strong>
                <p>
                  DBSCAN is being used here as a transparent spatial grouping step: nearby citizen observations are combined into potential hotspots before field verification. A cluster is not treated as proof of disease or a confirmed breeding site; field verification remains the ground-truth step.
                </p>
              </div>
            </section>
          );
        })()}

        {/* =========================================
            MULTI-SOURCE CORROBORATION (MCVI)
        ========================================= */}

        {(() => {
          const spatialClusters =
            buildDbscanClusters(citizenReports);

          const validWardRisk = wardRisk.filter(
            (ward) =>
              Number.isFinite(Number(ward?.latitude)) &&
              Number.isFinite(Number(ward?.longitude))
          );

          const distanceMeters = (a, b) => {
            const toRadians = (value) =>
              (value * Math.PI) / 180;
            const earthRadiusMeters = 6371000;
            const dLat = toRadians(
              b.latitude - a.latitude
            );
            const dLon = toRadians(
              b.longitude - a.longitude
            );
            const lat1 = toRadians(a.latitude);
            const lat2 = toRadians(b.latitude);
            const h =
              Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1) *
                Math.cos(lat2) *
                Math.sin(dLon / 2) ** 2;
            return (
              2 *
              earthRadiusMeters *
              Math.asin(Math.sqrt(h))
            );
          };

          const getNearestWard = (cluster) => {
            if (validWardRisk.length === 0) {
              return null;
            }

            return validWardRisk.reduce(
              (nearest, ward) => {
                const candidateDistance =
                  distanceMeters(
                    {
                      latitude: cluster.latitude,
                      longitude: cluster.longitude,
                    },
                    {
                      latitude: Number(ward.latitude),
                      longitude: Number(ward.longitude),
                    }
                  );

                if (!nearest) {
                  return {
                    ward,
                    distance: candidateDistance,
                  };
                }

                return candidateDistance < nearest.distance
                  ? {
                      ward,
                      distance: candidateDistance,
                    }
                  : nearest;
              },
              null
            );
          };

          const buildMcvi = (cluster) => {
            const nearestWard = getNearestWard(cluster);
            const environmentalScore = nearestWard
              ? Math.max(
                  0,
                  Math.min(
                    100,
                    Number(getScore(nearestWard.ward)) || 0
                  )
                )
              : null;

            // Prototype community signal: more independent observations
            // in the same spatial cluster increase corroboration strength.
            // This is intentionally transparent and configurable, not a
            // scientifically validated probability of disease.
            const communityScore = Math.min(
              100,
              cluster.reports.length * 25
            );

            const completedClusterReports =
              cluster.reports.filter(
                (report) =>
                  report.status === "confirmed" ||
                  report.status === "not_found"
              );

            const confirmedClusterReports =
              cluster.reports.filter(
                (report) => report.status === "confirmed"
              );

            const verificationScore =
              completedClusterReports.length > 0
                ? Math.round(
                    (confirmedClusterReports.length /
                      completedClusterReports.length) *
                      100
                  )
                : null;

            const components = [];

            if (environmentalScore !== null) {
              components.push({
                label: "Environmental risk",
                shortLabel: "Environment",
                score: environmentalScore,
                weight: 50,
              });
            }

            components.push({
              label: "Spatial community signal",
              shortLabel: "Community",
              score: communityScore,
              weight: 30,
            });

            if (verificationScore !== null) {
              components.push({
                label: "Field verification",
                shortLabel: "Verification",
                score: verificationScore,
                weight: 20,
              });
            }

            const availableWeight = components.reduce(
              (sum, component) =>
                sum + component.weight,
              0
            );

            const mcvi =
              availableWeight > 0
                ? Math.round(
                    components.reduce(
                      (sum, component) =>
                        sum +
                        component.score *
                          (component.weight / availableWeight),
                      0
                    )
                  )
                : 0;

            let label = "Low corroboration";
            if (mcvi >= 70) {
              label = "High corroboration";
            } else if (mcvi >= 50) {
              label = "Moderate corroboration";
            }

            return {
              nearestWard,
              environmentalScore,
              communityScore,
              verificationScore,
              completedClusterReports,
              confirmedClusterReports,
              mcvi,
              label,
              components,
            };
          };

          const mcviRows = spatialClusters.map(
            (cluster) => ({
              cluster,
              ...buildMcvi(cluster),
            })
          );

          const highCorroborationCount =
            mcviRows.filter(
              (row) => row.mcvi >= 70
            ).length;

          return (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">
                    MULTI-SOURCE CORROBORATION
                  </p>
                  <h3>
                    MCVI — Hotspot Confidence Evidence
                  </h3>
                  <p
                    style={{
                      margin: "6px 0 0",
                      color: "#667085",
                      fontSize: "11px",
                    }}
                  >
                    A transparent prototype index combining environmental risk,
                    spatial citizen evidence, and field verification.
                  </p>
                </div>

                <span className="count-badge">
                  {mcviRows.length} hotspot{mcviRows.length === 1 ? "" : "s"}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(3, minmax(0, 1fr))",
                  gap: "10px",
                  marginBottom: "16px",
                }}
              >
                {[
                  ["HOTSPOTS", mcviRows.length],
                  ["HIGH CORROBORATION", highCorroborationCount],
                  ["PENDING VERIFICATION", mcviRows.filter((row) => row.verificationScore === null).length],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      padding: "13px",
                      border: "1px solid #e4e7ec",
                      borderRadius: "10px",
                      background: "#ffffff",
                    }}
                  >
                    <small
                      style={{
                        color: "#667085",
                        fontSize: "9px",
                        fontWeight: "800",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {label}
                    </small>
                    <strong
                      style={{
                        display: "block",
                        marginTop: "4px",
                        color: "#17324d",
                        fontSize: "21px",
                      }}
                    >
                      {value}
                    </strong>
                  </div>
                ))}
              </div>

              {mcviRows.length === 0 ? (
                <div
                  className="placeholder-page"
                  style={{ padding: "30px 18px" }}
                >
                  <h3 style={{ marginBottom: "6px" }}>
                    Waiting for a spatial hotspot
                  </h3>
                  <p>
                    MCVI becomes active when citizen observations form a DBSCAN
                    hotspot. Field verification then provides an additional
                    ground-truth signal.
                  </p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {mcviRows.map((row) => {
                    const {
                      cluster,
                      nearestWard,
                      environmentalScore,
                      verificationScore,
                      mcvi,
                      label,
                      components,
                      completedClusterReports,
                      confirmedClusterReports,
                    } = row;

                    return (
                      <div
                        key={`mcvi-${cluster.id}`}
                        style={{
                          border: "1px solid #dce9e6",
                          borderRadius: "12px",
                          padding: "16px",
                          background: "#f9fcfb",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: "12px",
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                display: "flex",
                                gap: "9px",
                                alignItems: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              <strong
                                style={{
                                  color: "#17324d",
                                  fontSize: "15px",
                                }}
                              >
                                Hotspot Cluster {cluster.id}
                              </strong>
                              <span className="risk-badge medium-risk">
                                {label}
                              </span>
                            </div>
                            <p
                              style={{
                                margin: "6px 0 0",
                                color: "#667085",
                                fontSize: "11px",
                              }}
                            >
                              {cluster.reports.length} citizen reports • centroid {cluster.latitude.toFixed(4)}, {cluster.longitude.toFixed(4)}
                              {nearestWard
                                ? ` • nearest ${getWardName(nearestWard.ward)} (${Math.round(nearestWard.distance)} m)`
                                : ""}
                            </p>
                          </div>

                          <div style={{ minWidth: "150px" }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: "10px",
                                fontWeight: "800",
                                color: "#475467",
                                marginBottom: "5px",
                              }}
                            >
                              <span>MCVI SCORE</span>
                              <strong>{mcvi}/100</strong>
                            </div>
                            <div
                              style={{
                                height: "7px",
                                borderRadius: "999px",
                                background: "#e7efed",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${mcvi}%`,
                                  height: "100%",
                                  background: "#0f8b78",
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(3, minmax(0, 1fr))",
                            gap: "9px",
                            marginTop: "14px",
                          }}
                        >
                          {components.map((component) => (
                            <div
                              key={component.shortLabel}
                              style={{
                                padding: "10px",
                                background: "#ffffff",
                                border: "1px solid #e4e7ec",
                                borderRadius: "9px",
                              }}
                            >
                              <small
                                style={{
                                  display: "block",
                                  color: "#667085",
                                  fontSize: "9px",
                                  fontWeight: "800",
                                  marginBottom: "4px",
                                }}
                              >
                                {component.shortLabel.toUpperCase()} • {component.weight}%
                              </small>
                              <strong
                                style={{
                                  color: "#17324d",
                                  fontSize: "17px",
                                }}
                              >
                                {component.score}/100
                              </strong>
                            </div>
                          ))}
                        </div>

                        <div
                          style={{
                            marginTop: "12px",
                            padding: "11px",
                            border: "1px solid #dce9e6",
                            borderRadius: "9px",
                            background: "#ffffff",
                          }}
                        >
                          <strong
                            style={{
                              color: "#295b60",
                              fontSize: "11px",
                            }}
                          >
                            Why?
                          </strong>
                          <div
                            style={{
                              display: "grid",
                              gap: "6px",
                              marginTop: "8px",
                              color: "#667085",
                              fontSize: "11px",
                            }}
                          >
                            <div>
                              {nearestWard
                                ? `✓ Environmental evidence: ${getRiskLevel(nearestWard.ward)} conditions at ${getWardName(nearestWard.ward)} (${environmentalScore}/100)`
                                : "○ Environmental risk data unavailable for nearby wards"}
                            </div>
                            <div>
                              ✓ Citizen reports: {cluster.reports.length} observation{cluster.reports.length === 1 ? "" : "s"} in this hotspot cluster
                            </div>
                            <div>
                              ✓ Reports grouped by DBSCAN using its 500 m neighborhood rule
                            </div>
                            <div>
                              {completedClusterReports.length === 0
                                ? "○ Field verification pending"
                                : `✓ Field verification: ${confirmedClusterReports.length} confirmed among ${completedClusterReports.length} completed field check${completedClusterReports.length === 1 ? "" : "s"}`}
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: "12px",
                            paddingTop: "10px",
                            borderTop: "1px solid #e4e7ec",
                            display: "flex",
                            gap: "10px",
                            flexWrap: "wrap",
                            color: "#667085",
                            fontSize: "10px",
                          }}
                        >
                          <span>
                            Field checks: {completedClusterReports.length}
                          </span>
                          <span>•</span>
                          <span>
                            Verification signal: {verificationScore === null ? "pending" : `${verificationScore}/100`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                className="insight-box"
                style={{ marginTop: "16px" }}
              >
                <strong>MCVI methodology — prototype only</strong>
                <p>
                  The current prototype uses configurable weights of 50% environmental
                  risk, 30% spatial community signal, and 20% field verification.
                  If verification is not yet available, the available evidence is
                  re-normalized rather than treating an unverified hotspot as a zero.
                  These weights are design parameters for the prototype, not a
                  clinically or epidemiologically validated probability of disease.
                </p>
              </div>
            </section>
          );
        })()}

        {/* =========================================
            OPERATIONAL ALERT PRIORITIZATION
        ========================================= */}

        {(() => {
          const spatialClusters =
            buildDbscanClusters(citizenReports);

          const validWardRisk = wardRisk.filter(
            (ward) =>
              Number.isFinite(Number(ward?.latitude)) &&
              Number.isFinite(Number(ward?.longitude))
          );

          const toRadians = (value) =>
            (value * Math.PI) / 180;

          const distanceMeters = (a, b) => {
            const earthRadiusMeters = 6371000;
            const dLat = toRadians(
              b.latitude - a.latitude
            );
            const dLon = toRadians(
              b.longitude - a.longitude
            );
            const lat1 = toRadians(a.latitude);
            const lat2 = toRadians(b.latitude);
            const h =
              Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1) *
                Math.cos(lat2) *
                Math.sin(dLon / 2) ** 2;
            return (
              2 *
              earthRadiusMeters *
              Math.asin(Math.sqrt(h))
            );
          };

          const getNearestWard = (cluster) => {
            if (validWardRisk.length === 0) {
              return null;
            }

            return validWardRisk.reduce(
              (nearest, ward) => {
                const candidateDistance =
                  distanceMeters(
                    {
                      latitude: cluster.latitude,
                      longitude: cluster.longitude,
                    },
                    {
                      latitude: Number(ward.latitude),
                      longitude: Number(ward.longitude),
                    }
                  );

                if (!nearest) {
                  return {
                    ward,
                    distance: candidateDistance,
                  };
                }

                return candidateDistance < nearest.distance
                  ? {
                      ward,
                      distance: candidateDistance,
                    }
                  : nearest;
              },
              null
            );
          };

          const getAlertEvidence = (cluster) => {
            const nearestWard = getNearestWard(cluster);
            const environmentScore = nearestWard
              ? Math.max(
                  0,
                  Math.min(
                    100,
                    Number(getScore(nearestWard.ward)) || 0
                  )
                )
              : 0;

            const communityScore = Math.min(
              100,
              cluster.reports.length * 25
            );

            const completedReports =
              cluster.reports.filter(
                (report) =>
                  report.status === "confirmed" ||
                  report.status === "not_found"
              );

            const confirmedReports =
              cluster.reports.filter(
                (report) => report.status === "confirmed"
              );

            const verificationScore =
              completedReports.length > 0
                ? Math.round(
                    (confirmedReports.length /
                      completedReports.length) *
                      100
                  )
                : null;

            const components = [
              {
                score: environmentScore,
                weight: 50,
              },
              {
                score: communityScore,
                weight: 30,
              },
            ];

            if (verificationScore !== null) {
              components.push({
                score: verificationScore,
                weight: 20,
              });
            }

            const availableWeight = components.reduce(
              (sum, component) =>
                sum + component.weight,
              0
            );

            const mcvi =
              availableWeight > 0
                ? Math.round(
                    components.reduce(
                      (sum, component) =>
                        sum +
                        component.score *
                          (component.weight /
                            availableWeight),
                      0
                    )
                  )
                : 0;

            const reportIds = new Set(
              cluster.reports.map((report) => report.id)
            );

            const relatedActions =
              containmentActions.filter((action) =>
                reportIds.has(action.report_id)
              );

            const hasOpenAction =
              relatedActions.some(
                (action) =>
                  action.status === "open" ||
                  action.status === "in_progress"
              );

            const hasCompletedAction =
              relatedActions.some(
                (action) => action.status === "completed"
              );

            let decision = "MONITOR";
            let recommendation =
              "Continue routine environmental and community monitoring.";
            let decisionTone = "monitor";

            if (hasOpenAction) {
              decision = "CONTAINMENT IN PROGRESS";
              recommendation =
                "Follow the assigned municipal containment action and re-check the hotspot after completion.";
              decisionTone = "action";
            } else if (hasCompletedAction) {
              decision = "CONTAINMENT COMPLETED";
              recommendation =
                "Continue post-intervention monitoring and watch for renewed community reports.";
              decisionTone = "complete";
            } else if (confirmedReports.length > 0) {
              decision = "CONTAINMENT REQUIRED";
              recommendation =
                "A field-confirmed report is present; create or assign the appropriate containment action.";
              decisionTone = "action";
            } else if (mcvi >= 70 && cluster.reports.length >= 2) {
              decision = "PRIORITY FIELD REVIEW";
              recommendation =
                "Prioritize a field verification visit because multiple evidence sources indicate elevated corroboration.";
              decisionTone = "priority";
            } else if (mcvi >= 50) {
              decision = "FIELD REVIEW";
              recommendation =
                "Review the hotspot in the field before escalating to containment.";
              decisionTone = "review";
            }

            return {
              nearestWard,
              environmentScore,
              communityScore,
              verificationScore,
              completedReports,
              confirmedReports,
              mcvi,
              relatedActions,
              decision,
              recommendation,
              decisionTone,
            };
          };

          const rows = spatialClusters.map((cluster) => ({
            cluster,
            ...getAlertEvidence(cluster),
          }));

          const priorityCount = rows.filter(
            (row) =>
              row.decision === "PRIORITY FIELD REVIEW" ||
              row.decision === "CONTAINMENT REQUIRED"
          ).length;

          const activeActionCount = rows.filter(
            (row) => row.decision === "CONTAINMENT IN PROGRESS"
          ).length;

          return (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">
                    OPERATIONAL DECISION SUPPORT
                  </p>
                  <h3>
                    Alert Prioritization & Response Queue
                  </h3>
                  <p
                    style={{
                      margin: "6px 0 0",
                      color: "#667085",
                      fontSize: "11px",
                    }}
                  >
                    Converts corroborated hotspot evidence into a transparent monitoring or response status.
                  </p>
                </div>

                <span className="count-badge">
                  {rows.length} hotspot{rows.length === 1 ? "" : "s"}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(3, minmax(0, 1fr))",
                  gap: "10px",
                  marginBottom: "16px",
                }}
              >
                {[
                  ["HOTSPOTS", rows.length],
                  ["PRIORITY / CONTAINMENT", priorityCount],
                  ["ACTIVE RESPONSE", activeActionCount],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      padding: "13px",
                      border: "1px solid #e4e7ec",
                      borderRadius: "10px",
                      background: "#ffffff",
                    }}
                  >
                    <small
                      style={{
                        color: "#667085",
                        fontSize: "9px",
                        fontWeight: "800",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {label}
                    </small>
                    <strong
                      style={{
                        display: "block",
                        marginTop: "5px",
                        fontSize: "22px",
                        color: "#17324d",
                      }}
                    >
                      {value}
                    </strong>
                  </div>
                ))}
              </div>

              {rows.length === 0 ? (
                <div className="placeholder-page">
                  <div className="placeholder-icon"><WarningCircle {...iconProps} /></div>
                  <h3>No operational alerts yet</h3>
                  <p>
                    Alerts will appear when citizen observations form a spatial hotspot.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: "12px",
                  }}
                >
                  {rows.map((row, index) => {
                    const decisionClass =
                      row.decisionTone === "action" ||
                      row.decisionTone === "priority"
                        ? "high-risk"
                        : row.decisionTone === "complete"
                        ? "low-risk"
                        : "medium-risk";

                    return (
                      <div
                        key={`${row.cluster.id || "cluster"}-${index}`}
                        style={{
                          border: "1px solid #e4e7ec",
                          borderRadius: "12px",
                          padding: "16px",
                          background: "#ffffff",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                flexWrap: "wrap",
                              }}
                            >
                              <strong
                                style={{
                                  fontSize: "16px",
                                  color: "#17324d",
                                }}
                              >
                                Hotspot Cluster {index + 1}
                              </strong>
                              <span
                                className={`risk-badge ${decisionClass}`}
                              >
                                {row.decision}
                              </span>
                            </div>
                            <p
                              style={{
                                margin: "5px 0 0",
                                color: "#667085",
                                fontSize: "11px",
                              }}
                            >
                              {row.cluster.reports.length} citizen report{row.cluster.reports.length === 1 ? "" : "s"} • centroid {row.cluster.latitude.toFixed(4)}, {row.cluster.longitude.toFixed(4)}
                            </p>
                          </div>

                          <div
                            style={{
                              minWidth: "150px",
                              textAlign: "right",
                            }}
                          >
                            <small
                              style={{
                                display: "block",
                                color: "#667085",
                                fontSize: "9px",
                                fontWeight: "800",
                                letterSpacing: "0.5px",
                              }}
                            >
                              MCVI
                            </small>
                            <strong
                              style={{
                                color: "#17324d",
                                fontSize: "18px",
                              }}
                            >
                              {row.mcvi}/100
                            </strong>
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(3, minmax(0, 1fr))",
                            gap: "8px",
                            marginTop: "13px",
                          }}
                        >
                          {[
                            ["ENVIRONMENT", row.environmentScore],
                            ["COMMUNITY", row.communityScore],
                            [
                              "VERIFICATION",
                              row.verificationScore === null
                                ? "Pending"
                                : row.verificationScore,
                            ],
                          ].map(([label, value]) => (
                            <div
                              key={label}
                              style={{
                                padding: "10px",
                                borderRadius: "9px",
                                background: "#f8fafb",
                                border: "1px solid #edf0f2",
                              }}
                            >
                              <small
                                style={{
                                  display: "block",
                                  color: "#667085",
                                  fontSize: "8px",
                                  fontWeight: "800",
                                  marginBottom: "3px",
                                }}
                              >
                                {label}
                              </small>
                              <strong
                                style={{
                                  color: "#17324d",
                                  fontSize: "14px",
                                }}
                              >
                                {typeof value === "number"
                                  ? `${value}/100`
                                  : value}
                              </strong>
                            </div>
                          ))}
                        </div>

                        <div
                          style={{
                            marginTop: "12px",
                            padding: "11px 12px",
                            borderRadius: "9px",
                            background: "#f0f8f6",
                            border: "1px solid #d7ece7",
                          }}
                        >
                          <strong
                            style={{
                              display: "block",
                              color: "#17324d",
                              fontSize: "11px",
                              marginBottom: "3px",
                            }}
                          >
                            Recommended next step
                          </strong>
                          <span
                            style={{
                              color: "#4b5563",
                              fontSize: "11px",
                            }}
                          >
                            {row.recommendation}
                          </span>
                        </div>

                        <div
                          style={{
                            marginTop: "10px",
                            display: "flex",
                            gap: "10px",
                            flexWrap: "wrap",
                            color: "#667085",
                            fontSize: "10px",
                          }}
                        >
                          <span>
                            Confirmed: {row.confirmedReports.length}
                          </span>
                          <span>•</span>
                          <span>
                            Related containment actions: {row.relatedActions.length}
                          </span>
                          <span>•</span>
                          <span>
                            Nearest ward: {row.nearestWard?.ward?.ward_name || "—"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                className="insight-box"
                style={{ marginTop: "16px" }}
              >
                <strong>
                  Operational decision logic — prototype only
                </strong>
                <p>
                  A hotspot is not automatically treated as an outbreak. The queue uses the prototype MCVI evidence together with field verification and existing containment status to suggest the next operational step. Thresholds are configurable design parameters and require local validation before real municipal deployment.
                </p>
              </div>
            </section>
          );
        })()}

        {/* =========================================
            VERIFICATION ANALYTICS
        ========================================= */}

        <div className="content-grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">
                  FIELD VERIFICATION
                </p>

                <h3>
                  Verification Outcomes
                </h3>
              </div>

              <span className="count-badge">
                {completedVerifications} processed
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gap: "20px",
              }}
            >
              <div>
                <div
                  style={{
                    display:
                      "flex",
                    justifyContent:
                      "space-between",
                    marginBottom:
                      "8px",
                  }}
                >
                  <strong>
                    Confirmed
                  </strong>

                  <span>
                    {
                      confirmedReports.length
                    }{" "}
                    reports
                  </span>
                </div>

                <div
                  style={{
                    height:
                      "12px",
                    background:
                      "#e8f5f2",
                    borderRadius:
                      "20px",
                    overflow:
                      "hidden",
                  }}
                >
                  <div
                    style={{
                      width:
                        completedVerifications >
                        0
                          ? `${
                              (confirmedReports.length /
                                completedVerifications) *
                              100
                            }%`
                          : "0%",
                      height:
                        "100%",
                      background:
                        "#0f8b78",
                    }}
                  />
                </div>
              </div>

              <div>
                <div
                  style={{
                    display:
                      "flex",
                    justifyContent:
                      "space-between",
                    marginBottom:
                      "8px",
                  }}
                >
                  <strong>
                    Not Found
                  </strong>

                  <span>
                    {
                      notFoundReports.length
                    }{" "}
                    reports
                  </span>
                </div>

                <div
                  style={{
                    height:
                      "12px",
                    background:
                      "#f3f4f6",
                    borderRadius:
                      "20px",
                    overflow:
                      "hidden",
                  }}
                >
                  <div
                    style={{
                      width:
                        completedVerifications >
                        0
                          ? `${
                              (notFoundReports.length /
                                completedVerifications) *
                              100
                            }%`
                          : "0%",
                      height:
                        "100%",
                      background:
                        "#98a2b3",
                    }}
                  />
                </div>
              </div>

              <div>
                <div
                  style={{
                    display:
                      "flex",
                    justifyContent:
                      "space-between",
                    marginBottom:
                      "8px",
                  }}
                >
                  <strong>
                    Pending
                  </strong>

                  <span>
                    {
                      pendingReports.length
                    }{" "}
                    reports
                  </span>
                </div>

                <div
                  style={{
                    height:
                      "12px",
                    background:
                      "#fff7e8",
                    borderRadius:
                      "20px",
                    overflow:
                      "hidden",
                  }}
                >
                  <div
                    style={{
                      width:
                        totalReports > 0
                          ? `${
                              (pendingReports.length /
                                totalReports) *
                              100
                            }%`
                          : "0%",
                      height:
                        "100%",
                      background:
                        "#d99a28",
                    }}
                  />
                </div>
              </div>
            </div>

            <div
              className="insight-box"
              style={{
                marginTop:
                  "24px",
              }}
            >
              <strong>
                Verification coverage
              </strong>

              <p>
                {reportProcessingRate}% of
                submitted reports have received
                a field-verification result.
              </p>
            </div>
          </section>

          {/* =====================================
              CONTAINMENT ANALYTICS
          ===================================== */}

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">
                  MUNICIPAL RESPONSE
                </p>

                <h3>
                  Containment Status
                </h3>
              </div>

              <span className="count-badge">
                {
                  containmentActions.length
                }{" "}
                total
              </span>
            </div>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(3, minmax(0, 1fr))",
                gap:
                  "12px",
              }}
            >
              <div
                style={{
                  padding:
                    "18px",
                  border:
                    "1px solid #f1d6d6",
                  borderRadius:
                    "12px",
                  background:
                    "#fffafa",
                }}
              >
                <small
                  style={{
                    color:
                      "#667085",
                  }}
                >
                  OPEN
                </small>

                <strong
                  style={{
                    display:
                      "block",
                    fontSize:
                      "28px",
                    marginTop:
                      "8px",
                  }}
                >
                  {
                    openActions.length
                  }
                </strong>

                <span
                  style={{
                    fontSize:
                      "12px",
                    color:
                      "#667085",
                  }}
                >
                  Awaiting response
                </span>
              </div>

              <div
                style={{
                  padding:
                    "18px",
                  border:
                    "1px solid #eadfbf",
                  borderRadius:
                    "12px",
                  background:
                    "#fffdf5",
                }}
              >
                <small
                  style={{
                    color:
                      "#667085",
                  }}
                >
                  IN PROGRESS
                </small>

                <strong
                  style={{
                    display:
                      "block",
                    fontSize:
                      "28px",
                    marginTop:
                      "8px",
                  }}
                >
                  {
                    inProgressActions.length
                  }
                </strong>

                <span
                  style={{
                    fontSize:
                      "12px",
                    color:
                      "#667085",
                  }}
                >
                  Being handled
                </span>
              </div>

              <div
                style={{
                  padding:
                    "18px",
                  border:
                    "1px solid #cce7dc",
                  borderRadius:
                    "12px",
                  background:
                    "#f7fcfa",
                }}
              >
                <small
                  style={{
                    color:
                      "#667085",
                  }}
                >
                  COMPLETED
                </small>

                <strong
                  style={{
                    display:
                      "block",
                    fontSize:
                      "28px",
                    marginTop:
                      "8px",
                  }}
                >
                  {
                    completedActions.length
                  }
                </strong>

                <span
                  style={{
                    fontSize:
                      "12px",
                    color:
                      "#667085",
                  }}
                >
                  Response completed
                </span>
              </div>
            </div>

            <div
              className="insight-box"
              style={{
                marginTop:
                  "20px",
              }}
            >
              <strong>
                Containment completion
              </strong>

              <p>
                {containmentActions.length ===
                0
                  ? "No containment actions have been created yet."
                  : `${containmentCompletionRate}% of containment actions have been completed.`}
              </p>
            </div>
          </section>
        </div>

        {/* =========================================
            WARD RISK ANALYTICS
        ========================================= */}

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">
                ENVIRONMENTAL RISK
              </p>

              <h3>
                Ward Risk Overview
              </h3>
            </div>

            <span className="count-badge">
              {wardRisk.length} wards
            </span>
          </div>

          {wardRisk.length ===
          0 ? (
            <div className="placeholder-page">
              <p>
                No ward risk data available.
              </p>
            </div>
          ) : (
            <div
              style={{
                display:
                  "grid",
                gap:
                  "12px",
              }}
            >
              {wardRisk.map(
                (ward) => {
                  const score =
                    getScore(
                      ward
                    );

                  const level =
                    getRiskLevel(
                      ward
                    );

                  return (
                    <div
                      key={
                        ward.id ??
                        ward.ward_id ??
                        getWardName(
                          ward
                        )
                      }
                      style={{
                        display:
                          "grid",
                        gridTemplateColumns:
                          "140px 110px 1fr 70px",
                        gap:
                          "16px",
                        alignItems:
                          "center",
                        padding:
                          "14px 16px",
                        border:
                          "1px solid #eaecf0",
                        borderRadius:
                          "10px",
                      }}
                    >
                      <strong>
                        {getWardName(
                          ward
                        )}
                      </strong>

                      <span
                        className={`risk-badge ${getRiskClass(
                          level
                        )}`}
                      >
                        {level}
                      </span>

                      <div
                        style={{
                          height:
                            "10px",
                          background:
                            "#eef2f3",
                          borderRadius:
                            "20px",
                          overflow:
                            "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(
                              Math.max(
                                score,
                                0
                              ),
                              100
                            )}%`,
                            height:
                              "100%",
                            background:
                              "#0f8b78",
                          }}
                        />
                      </div>

                      <strong
                        style={{
                          textAlign:
                            "right",
                        }}
                      >
                        {score}
                      </strong>
                    </div>
                  );
                }
              )}
            </div>
          )}

          {wardRisk.length > 0 && (
            <div
              className="insight-box"
              style={{
                marginTop:
                  "20px",
              }}
            >
              <strong>
                Current ward-risk distribution
              </strong>

              <p>
                {highRiskPercentage}% of the
                monitored wards are currently
                classified as high risk by the
                prototype risk engine.
              </p>
            </div>
          )}
        </section>

        {/* =========================================
            SYSTEM LEARNING SUMMARY
        ========================================= */}

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">
                LEARNING LOOP
              </p>

              <h3>
                Operational Evidence
              </h3>
            </div>
          </div>

          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "repeat(3, minmax(0, 1fr))",
              gap:
                "16px",
            }}
          >
            <div
              style={{
                padding:
                  "20px",
                border:
                  "1px solid #e4e7ec",
                borderRadius:
                  "12px",
                background:
                  "#ffffff",
              }}
            >
              <span
                style={{
                  fontSize:
                    "12px",
                  fontWeight:
                    "700",
                  color:
                    "#667085",
                }}
              >
                COMMUNITY SIGNAL
              </span>

              <h3
                style={{
                  margin:
                    "8px 0",
                }}
              >
                {totalReports} observations
              </h3>

              <p
                style={{
                  margin:
                    0,
                  color:
                    "#667085",
                  fontSize:
                    "13px",
                }}
              >
                Citizen reports provide
                ground-level information about
                potential breeding locations.
              </p>
            </div>

            <div
              style={{
                padding:
                  "20px",
                border:
                  "1px solid #e4e7ec",
                borderRadius:
                  "12px",
                background:
                  "#ffffff",
              }}
            >
              <span
                style={{
                  fontSize:
                    "12px",
                  fontWeight:
                    "700",
                  color:
                    "#667085",
                }}
              >
                GROUND TRUTH
              </span>

              <h3
                style={{
                  margin:
                    "8px 0",
                }}
              >
                {verificationRate}% confirmed
              </h3>

              <p
                style={{
                  margin:
                    0,
                  color:
                    "#667085",
                  fontSize:
                    "13px",
                }}
              >
                Field verification provides
                feedback on whether reported
                locations were confirmed.
              </p>
            </div>

            <div
              style={{
                padding:
                  "20px",
                border:
                  "1px solid #e4e7ec",
                borderRadius:
                  "12px",
                background:
                  "#ffffff",
              }}
            >
              <span
                style={{
                  fontSize:
                    "12px",
                  fontWeight:
                    "700",
                  color:
                    "#667085",
                }}
              >
                RESPONSE OUTCOME
              </span>

              <h3
                style={{
                  margin:
                    "8px 0",
                }}
              >
                {containmentCompletionRate}% completed
              </h3>

              <p
                style={{
                  margin:
                    0,
                  color:
                    "#667085",
                  fontSize:
                    "13px",
                }}
              >
                Completed containment actions
                provide an operational measure
                of response progress.
              </p>
            </div>
          </div>
        </section>
      </>
    );
  };

  // ==================================================
  // CITIZEN PORTAL
  // ==================================================

  // ==================================================
  // CITIZEN REPORT TRACKING
  // ==================================================

  function getTrackedReports() {
    const ids = new Set(
      trackedReportIds.map((id) => Number(id))
    );

    return citizenReports
      .filter((report) => ids.has(Number(report.id)))
      .sort((a, b) => Number(b.id) - Number(a.id));
  }

  function getActionForReport(reportId) {
    return containmentActions.find(
      (action) =>
        Number(action.report_id) === Number(reportId)
    );
  }

  function getCitizenReportStage(report) {
    if (!report) {
      return {
        key: "submitted",
        label: "Submitted",
        description:
          "Your report has been received by VectoWatch.",
      };
    }

    const action = getActionForReport(report.id);

    if (action?.status === "completed") {
      return {
        key: "completed",
        label: "Completed",
        description:
          "The municipal containment action has been completed.",
      };
    }

    if (action?.status === "in_progress") {
      return {
        key: "in_progress",
        label: "Municipal action in progress",
        description:
          "A containment response is currently being handled.",
      };
    }

    if (action?.status === "open") {
      return {
        key: "action_open",
        label: "Municipal action created",
        description:
          "The verified report has generated a municipal containment task.",
      };
    }

    if (report.status === "confirmed") {
      return {
        key: "confirmed",
        label: "Verified",
        description:
          "Field verification confirmed the reported location.",
      };
    }

    if (report.status === "not_found") {
      return {
        key: "not_found",
        label: "Not confirmed in field",
        description:
          "The location was checked but the reported condition was not confirmed.",
      };
    }

    return {
      key: "verification",
      label: "Under field verification",
      description:
        "Your report is waiting for or undergoing a ground verification check.",
    };
  }

  function getCitizenTimeline(report) {
    const action = getActionForReport(report?.id);
    const status = report?.status || "pending";

    const verified =
      status === "confirmed" ||
      status === "not_found";

    const actionCreated =
      Boolean(action);

    const actionCompleted =
      action?.status === "completed";

    return [
      {
        key: "submitted",
        label: "Submitted",
        description: "Report received",
        done: true,
        current: status === "pending" && !action,
      },
      {
        key: "verification",
        label: "Field verification",
        description:
          verified
            ? "Ground check completed"
            : "Awaiting ground check",
        done: verified,
        current:
          status === "pending" && !action,
      },
      {
        key: "confirmed",
        label:
          status === "not_found"
            ? "Not confirmed"
            : "Verified",
        description:
          status === "not_found"
            ? "Condition not confirmed"
            : "Location confirmed",
        done:
          status === "confirmed" ||
          status === "not_found",
        current:
          status === "confirmed" && !action,
      },
      {
        key: "action",
        label: "Municipal action",
        description:
          action
            ? formatStatus(action.status)
            : "Waiting for response action",
        done: actionCreated,
        current:
          actionCreated && !actionCompleted,
      },
      {
        key: "completed",
        label: "Completed",
        description:
          actionCompleted
            ? "Response completed"
            : "Response not yet completed",
        done: actionCompleted,
        current: actionCompleted,
      },
    ];
  }

  const renderCitizenPortal = () => {
    const elevatedWard = wardRisk.find(
      (ward) => getRiskLevel(ward) === "Elevated" || getRiskLevel(ward) === "High"
    );

    const averageRisk = wardRisk.length
      ? Math.round(
          wardRisk.reduce(
            (sum, ward) => sum + getScore(ward),
            0
          ) / wardRisk.length
        )
      : null;

    const citizenSubmit = async (event) => {
      event.preventDefault();
      await submitCitizenReport(event);
    };

    return (
      <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
        {activePage === "home" && (
          <>
        <section
          style={{
            background:
              "linear-gradient(135deg, #075e54 0%, #0b7a6d 55%, #13a58f 100%)",
            color: "white",
            borderRadius: "24px",
            padding: "34px",
            marginBottom: "22px",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 18px 45px rgba(5, 83, 75, 0.18)",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: "220px",
              height: "220px",
              borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
              right: "-55px",
              top: "-75px",
            }}
          />

          <div style={{ position: "relative", maxWidth: "700px" }}>
            <span
              style={{
                display: "inline-block",
                padding: "7px 11px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.14)",
                fontSize: "11px",
                fontWeight: "800",
                letterSpacing: "0.08em",
              }}
            >
              COMMUNITY HEALTH WATCH
            </span>

            <h1
              style={{
                fontSize: "clamp(30px, 4vw, 48px)",
                lineHeight: 1.05,
                margin: "18px 0 12px",
              }}
            >
              Protect your neighbourhood.
            </h1>

            <p
              style={{
                fontSize: "16px",
                lineHeight: 1.65,
                margin: 0,
                color: "rgba(255,255,255,0.9)",
              }}
            >
              See a place where mosquitoes could breed? Report it in a few taps.
              Your observation helps local teams identify places that need attention.
            </p>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
            marginBottom: "22px",
          }}
        >
          <div
            style={{
              background: "white",
              border: "1px solid #e4e7ec",
              borderRadius: "18px",
              padding: "20px",
            }}
            id="citizen-community-overview"
          >
            <div className="citizen-feature-icon"><MapPin {...iconProps} size={24} /></div>
            <h3 style={{ margin: "12px 0 7px" }}>Check your area</h3>
            <p style={{ color: "#667085", lineHeight: 1.5, fontSize: "13px" }}>
              Current environmental conditions are being monitored across pilot wards.
            </p>
            <strong style={{ color: "#075e54", fontSize: "25px" }}>
              {averageRisk === null ? "—" : `${averageRisk}/100`}
            </strong>
            <span style={{ display: "block", color: "#667085", fontSize: "12px", marginTop: "3px" }}>
              prototype area risk index
            </span>
          </div>

          <div
            style={{
              background: "#f7fcfa",
              border: "1px solid #cce7dc",
              borderRadius: "18px",
              padding: "20px",
            }}
          >
            <div className="citizen-feature-icon"><Drop {...iconProps} size={24} /></div>
            <h3 style={{ margin: "12px 0 7px" }}>Remove standing water</h3>
            <p style={{ color: "#667085", lineHeight: 1.5, fontSize: "13px", marginBottom: 0 }}>
              Empty, cover or clean containers that can collect rainwater when it is safe to do so.
            </p>
          </div>

          <div
            style={{
              background: "#fffaf1",
              border: "1px solid #f0dfbd",
              borderRadius: "18px",
              padding: "20px",
            }}
          >
            <div className="citizen-feature-icon"><Bug {...iconProps} size={24} /></div>
            <h3 style={{ margin: "12px 0 7px" }}>Report early</h3>
            <p style={{ color: "#667085", lineHeight: 1.5, fontSize: "13px", marginBottom: 0 }}>
              A location report is a community signal. It does not diagnose illness or confirm a breeding site.
            </p>
          </div>
        </section>
          </>
        )}

        {(activePage === "home" || activePage === "report") && (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr)",
              gap: "20px",
              alignItems: "start",
            }}
          >
          {activePage === "report" && (
          <div
            style={{
              background: "white",
              border: "1px solid #e4e7ec",
              borderRadius: "20px",
              padding: "24px",
              boxShadow: "0 8px 25px rgba(16,24,40,0.04)",
            }}
          >
            <p className="panel-kicker">QUICK REPORT</p>
            <h2 style={{ margin: "5px 0 7px", fontSize: "26px" }}>
              See something? Tell us.
            </h2>
            <p style={{ color: "#667085", marginTop: 0, lineHeight: 1.5 }}>
              This takes less than a minute. You can report a possible mosquito breeding location or an anonymous symptom signal.
            </p>

            <form id="citizen-report-form" onSubmit={citizenSubmit}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "10px",
                  margin: "20px 0",
                }}
              >
                {[
                  ["standing_water", Drop, "Standing water"],
                  ["uncovered_tank", Drop, "Uncovered tank"],
                  ["discarded_container", MapPin, "Discarded container"],
                  ["symptom_signal", Bug, "Symptom signal"],
                ].map(([value, Icon, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setReportForm((current) => ({
                        ...current,
                        report_type: value,
                      }))
                    }
                    style={{
                      textAlign: "left",
                      border:
                        reportForm.report_type === value
                          ? "2px solid #0b8f7d"
                          : "1px solid #e4e7ec",
                      background:
                        reportForm.report_type === value
                          ? "#f0fbf8"
                          : "#ffffff",
                      borderRadius: "14px",
                      padding: "14px",
                      cursor: "pointer",
                    }}
                  >
                    <div className="report-type-icon"><Icon {...iconProps} size={22} /></div>
                    <strong style={{ display: "block", marginTop: "8px", fontSize: "13px" }}>
                      {label}
                    </strong>
                  </button>
                ))}
              </div>

              <label style={{ display: "block", fontWeight: "700", fontSize: "13px", marginBottom: "7px" }}>
                What did you notice?
              </label>
              <textarea
                value={reportForm.description}
                onChange={(event) =>
                  setReportForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Example: Water has collected in an uncovered container near the building entrance."
                rows={4}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid #d0d5dd",
                  borderRadius: "12px",
                  padding: "13px",
                  font: "inherit",
                  resize: "vertical",
                }}
              />

              <div
                style={{
                  marginTop: "16px",
                  border: "1px solid #dbe7e4",
                  borderRadius: "16px",
                  padding: "16px",
                  background: "#f8fcfb",
                }}
              >
                <div style={{ fontWeight: "800", fontSize: "14px", marginBottom: "5px" }}>
                  <MapPin {...iconProps} size={17} /> Where did you see it?
                </div>
                <div style={{ color: "#667085", fontSize: "12px", lineHeight: 1.5, marginBottom: "12px" }}>
                  We only need the location of the observation. You can use your device location or choose the nearest pilot area.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={useMyLocation}
                    className="secondary-button"
                    style={{ minHeight: "48px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                  >
                    <MapPin {...iconProps} size={17} weight="fill" /> Use my location
                  </button>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
                    {PILOT_WARDS.map((ward) => (
                      <button
                        key={ward.id}
                        type="button"
                        onClick={() => choosePilotArea(ward)}
                        style={{
                          border: reportForm.latitude === String(ward.latitude) && reportForm.longitude === String(ward.longitude) ? "2px solid #0b8f7d" : "1px solid #d0d5dd",
                          background: "white",
                          borderRadius: "9px",
                          padding: "8px 5px",
                          cursor: "pointer",
                          fontSize: "11px",
                          fontWeight: "800",
                        }}
                      >
                        Ward {ward.id}
                      </button>
                    ))}
                  </div>
                </div>

                {locationMessage && (
                  <div style={{ marginTop: "10px", color: locationStatus === "error" ? "#b42318" : "#087443", fontSize: "12px", fontWeight: "700" }}>
                    {locationMessage}
                  </div>
                )}

              </div>

              <div style={{ marginTop: "14px" }}>
                <label style={{ display: "block", fontWeight: "700", fontSize: "12px", marginBottom: "7px" }}>
                  <Camera {...iconProps} size={16} /> Add a photo <span style={{ color: "#98a2b3", fontWeight: "500" }}>(optional)</span>
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  style={{ width: "100%", fontSize: "12px" }}
                />
                {photoPreview && (
                  <div style={{ marginTop: "10px", display: "flex", gap: "10px", alignItems: "center" }}>
                    <img
                      src={photoPreview}
                      alt="Preview of the selected observation"
                      style={{ width: "72px", height: "72px", objectFit: "cover", borderRadius: "10px", border: "1px solid #d0d5dd" }}
                    />
                    <span style={{ fontSize: "11px", color: "#667085" }}>Photo selected for this report.</span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="primary-button"
                style={{
                  width: "100%",
                  marginTop: "16px",
                  minHeight: "50px",
                  fontSize: "15px",
                }}
              >
                Send report
              </button>

              {submitMessage && (
                <div className="success-box" style={{ marginTop: "14px" }}>
                  {submitMessage}
                </div>
              )}
            </form>
          </div>
          )}

          {activePage === "home" && (
          <div style={{ display: "grid", gap: "14px" }}>
            <div
              style={{
                background: "#075e54",
                color: "white",
                borderRadius: "20px",
                padding: "22px",
              }}
            >
              <span style={{ fontSize: "12px", fontWeight: "800", letterSpacing: "0.06em" }}>
                YOUR COMMUNITY SIGNAL MATTERS
              </span>
              <h3 style={{ fontSize: "22px", margin: "12px 0 8px" }}>
                See it. Report it. Help stop it.
              </h3>
              <p style={{ color: "rgba(255,255,255,0.84)", lineHeight: 1.55, fontSize: "13px" }}>
                Reports are grouped with other nearby observations so municipal teams can decide where field verification is needed.
              </p>
            </div>

            <div
              style={{
                background: "white",
                border: "1px solid #e4e7ec",
                borderRadius: "18px",
                padding: "20px",
              }}
            >
              <p className="panel-kicker">LOCAL STATUS</p>
              <h3 style={{ margin: "4px 0 8px" }}>
                {elevatedWard ? `${getWardName(elevatedWard)} is being monitored` : "Pilot wards are being monitored"}
              </h3>
              <p style={{ color: "#667085", lineHeight: 1.5, fontSize: "13px" }}>
                Environmental observations help identify areas that may need closer monitoring. They are not a diagnosis and do not predict whether an individual will become sick.
              </p>
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById("citizen-community-overview")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="secondary-button"
                style={{ width: "100%" }}
              >
                View community dashboard
              </button>
            </div>
          </div>
          )}
          </section>
        )}

        {activePage === "myReports" && renderCitizenReportTracking()}

        {activePage === "home" && (
          <div
            className="insight-box"
            style={{ marginTop: "20px" }}
          >
            <strong>Privacy-friendly reporting</strong>
            <p style={{ marginBottom: 0 }}>
              This prototype stores the location and observation needed for hotspot analysis. Avoid entering names, phone numbers, or other personal medical details in the description.
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderCitizenAdvisoryDesk = () => {
    const riskLevel = highestRiskWard
      ? getRiskLevel(highestRiskWard)
      : null;
    const riskClass =
      riskLevel === "High"
        ? "high-risk"
        : riskLevel === "Elevated"
          ? "elevated-risk"
          : riskLevel === "Moderate"
            ? "medium-risk"
            : riskLevel === "Low"
              ? "low-risk"
              : "";

    return (
      <div className="citizen-advisory">
        <div className="page-heading">
          <div>
            <p className="eyebrow">CITIZEN PREVENTION &amp; AWARENESS</p>
            <h1>Advisory Desk</h1>
            <p className="page-description">
              Practical steps to reduce mosquito breeding and protect your community.
            </p>
          </div>
          {riskLevel && (
            <span className={`risk-badge ${riskClass}`}>
              Current area risk: {riskLevel}
            </span>
          )}
        </div>

        <section className="citizen-advisory-card citizen-advisory-today">
          <p className="panel-kicker">TODAY&apos;S PREVENTION ADVISORY</p>
          <h2>Protect your home from mosquito breeding today.</h2>
          <p>
            Check for stagnant water around your home, terrace, balcony, drains,
            coolers, and containers, especially after rainfall.
          </p>
        </section>

        <div className="citizen-advisory-columns">
          <section className="citizen-advisory-card">
            <h2>Do</h2>
            <ul className="citizen-advisory-list citizen-advisory-do">
              <li>Remove stagnant water regularly.</li>
              <li>Keep water storage containers tightly covered.</li>
              <li>Clean coolers, trays, pots, and drains regularly.</li>
              <li>Keep surrounding areas free from waste that can collect water.</li>
              <li>Use mosquito nets, screens, or repellents where appropriate.</li>
              <li>Report suspected breeding sites through VectoWatch.</li>
            </ul>
          </section>

          <section className="citizen-advisory-card">
            <h2>Don&apos;t</h2>
            <ul className="citizen-advisory-list citizen-advisory-dont">
              <li>Don&apos;t leave buckets, pots, tyres, trays, or containers holding rainwater.</li>
              <li>Don&apos;t keep water tanks or storage containers uncovered.</li>
              <li>Don&apos;t ignore stagnant water after rainfall.</li>
              <li>Don&apos;t allow waste to accumulate where it can hold water.</li>
              <li>Don&apos;t assume a small amount of stagnant water is harmless.</li>
            </ul>
          </section>
        </div>

        <section className="citizen-advisory-card">
          <div className="citizen-advisory-section-heading">
            <div>
              <p className="panel-kicker">A QUICK ROUTINE</p>
              <h2>60-Second Home Check</h2>
            </div>
          </div>
          <div className="citizen-home-check">
            {[
              "Balcony / Terrace",
              "Flower Pots & Trays",
              "Water Coolers",
              "Buckets / Containers",
              "Water Tanks",
              "Drains / Gutters",
              "Discarded Tyres or Plastic Items",
            ].map((item) => (
              <label key={item}>
                <input type="checkbox" />
                <span>{item}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="primary-button citizen-advisory-cta"
            onClick={() => setActivePage("report")}
          >
            Found stagnant water? → Report a Risk
          </button>
        </section>

        <section className="citizen-advisory-card citizen-medical-advice">
          <h2>When to seek medical care</h2>
          <p>
            If you develop symptoms such as high fever, severe headache,
            significant body pain, rash, persistent vomiting, breathing
            difficulty, bleeding, or worsening illness, seek medical attention
            promptly.
          </p>
          <p className="citizen-advisory-disclaimer">
            VectoWatch does not diagnose disease. Environmental risk information
            is intended for prevention and awareness.
          </p>
        </section>
      </div>
    );
  };

  const handleDemoLogin = (event) => {
    event.preventDefault();
    setLoginError("");

    const account = DEMO_ACCOUNTS.find(
      ({ email, password }) =>
        email === loginEmail.trim().toLowerCase() &&
        password === loginPassword
    );

    if (!account) {
      setLoginError("The email or password is incorrect.");
      return;
    }

    try {
      localStorage.setItem("vectowatch_demo_role", account.role);
    } catch (err) {
      console.error("Demo session storage error:", err);
      setLoginError("Unable to save this demo session in this browser.");
      return;
    }

    setUserRole(account.role);
    setActivePage(account.role === "citizen" ? "home" : "dashboard");
    setLoginPassword("");
  };

  const handleDemoSignOut = () => {
    try {
      localStorage.removeItem("vectowatch_demo_role");
    } catch (err) {
      console.error("Demo sign-out error:", err);
      setLoginError("Unable to clear the saved demo session.");
      return;
    }

    setLoginError("");
    setLoginEmail("");
    setLoginPassword("");
    setUserRole("");
  };

  const pageTitles = {
    home: "Community Portal",
    report: "Report a Risk",
    myReports: "My Reports",
    advisory: "Advisory Desk",
    dashboard: "Municipal Dashboard",
    reports: "Citizen Reports",
    case: selectedCaseReportId
      ? `Case #${selectedCaseReportId}`
      : "Case Workspace",
    verification: "Field Verification",
    actions: "Containment Actions",
    analytics: "Analytics",
  };
  const pageTitle = pageTitles[activePage] || "VectoWatch";
  const photoAcknowledgement = (
    <p className="visually-hidden">
      Environmental background photograph by CEphoto, Uwe Aranas. Source:
      Wikimedia Commons, Keningau Sabah Rainforest after afternoon torrential
      rain. Licensed under Creative Commons Attribution-ShareAlike 3.0
      (CC BY-SA 3.0): https://creativecommons.org/licenses/by-sa/3.0/
    </p>
  );

  const renderLogin = () => (
    <main className="login-screen">
      <section className="login-hero">
        <div className="login-hero-brand">
          <img src="/vectowatch-logo.svg" alt="" />
          <span>VectoWatch</span>
        </div>
        <p className="login-eyebrow">ENVIRONMENTAL HEALTH INTELLIGENCE</p>
        <h1>Protect your community from mosquito-borne risk.</h1>
        <p className="login-hero-description">
          Monitor environmental conditions, report standing water after
          rainfall, and help prevent mosquito breeding.
        </p>
      </section>
      {photoAcknowledgement}
      <section className="login-card">
        <div className="login-heading">
          <p className="login-eyebrow">CIVIC HEALTH INTELLIGENCE</p>
          <h1>Sign in</h1>
          <p>Access your VectoWatch workspace.</p>
        </div>

        <form className="login-form" onSubmit={handleDemoLogin}>
          <label htmlFor="demo-email">Email / User ID</label>
          <input
            id="demo-email"
            type="email"
            autoComplete="username"
            value={loginEmail}
            onChange={(event) => setLoginEmail(event.target.value)}
            required
          />

          <label htmlFor="demo-password">Password</label>
          <input
            id="demo-password"
            type="password"
            autoComplete="current-password"
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
            required
          />

          {loginError && (
            <div className="login-error" role="alert">
              {loginError}
            </div>
          )}

          <button className="login-submit" type="submit">
            Sign In
          </button>
        </form>

      </section>
    </main>
  );

  // ==================================================
  // APP LAYOUT
  // ==================================================

  if (!userRole) {
    return renderLogin();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            V
          </div>

          <div>
            <h2>
              VectoWatch
            </h2>

            <span>
              Health Intelligence
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {userRole === "citizen" ? (
            <>
              <button
                className={activePage === "home" ? "nav-item active" : "nav-item"}
                onClick={() => setActivePage("home")}
              >
                <House {...iconProps} />
                Home
              </button>
              <button
                className={activePage === "report" ? "nav-item active" : "nav-item"}
                onClick={() => setActivePage("report")}
              >
                <PlusCircle {...iconProps} />
                Report a Risk
              </button>
              <button
                className={activePage === "myReports" ? "nav-item active" : "nav-item"}
                onClick={() => setActivePage("myReports")}
              >
                <ClipboardText {...iconProps} />
                My Reports
              </button>
              <button
                className={activePage === "advisory" ? "nav-item active" : "nav-item"}
                onClick={() => setActivePage("advisory")}
              >
                <ShieldCheck {...iconProps} />
                Advisory Desk
              </button>
            </>
          ) : (
            <>
              <button
                className={
                  activePage === "dashboard"
                    ? "nav-item active"
                    : "nav-item"
                }
                onClick={() => setActivePage("dashboard")}
              >
                <SquaresFour {...iconProps} />
                Dashboard
              </button>

              <button
                className={
                  activePage === "reports"
                    ? "nav-item active"
                    : "nav-item"
                }
                onClick={() => setActivePage("reports")}
              >
                <ClipboardText {...iconProps} />
                Citizen Reports
              </button>

              {selectedCaseReportId && (
                <button
                  className={
                    activePage === "case"
                      ? "nav-item active"
                      : "nav-item"
                  }
                  onClick={() => setActivePage("case")}
                >
                  <Crosshair {...iconProps} />
                  Case Workspace
                </button>
              )}

            <button
              className={
                activePage === "verification"
                  ? "nav-item active"
                  : "nav-item"
              }
              onClick={() => setActivePage("verification")}
            >
              <CheckCircle {...iconProps} />
              Field Verification
            </button>

              <button
                className={
                  activePage === "actions"
                    ? "nav-item active"
                    : "nav-item"
                }
                onClick={() => setActivePage("actions")}
              >
                <Flag {...iconProps} />
                Containment Actions
              </button>

              <button
                className={
                  activePage === "analytics"
                    ? "nav-item active"
                    : "nav-item"
                }
                onClick={() => setActivePage("analytics")}
              >
                <ChartBar {...iconProps} />
                Analytics
              </button>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="footer-status">
            <span className="status-dot"></span>
            API Connected
          </div>

          <small>
            VectoWatch Prototype
          </small>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="topbar-label">
              {userRole === "citizen"
                ? "VECTOWATCH COMMUNITY PORTAL"
                : "MUNICIPAL VECTOR SURVEILLANCE"}
            </span>
          </div>

          <div className="topbar-account">
            <div className="topbar-user">
              <div className="user-avatar">
                {userRole === "citizen" ? "C" : "H"}
              </div>

              <div>
                <strong>
                  {userRole === "citizen"
                    ? "Community Member"
                    : "Health Officer"}
                </strong>

                <span>
                  {userRole === "citizen"
                    ? "VectoWatch Public Portal"
                    : "MBMC Monitoring"}
                </span>
              </div>
            </div>

            <button
              className="sign-out-button"
              onClick={handleDemoSignOut}
            >
              Sign Out / Switch Account
            </button>
          </div>
        </header>

        <section className="environment-banner">
          <div className="environment-banner-heading">
            <img src="/vectowatch-logo.svg" alt="" />
            <div>
              <p className="environment-banner-kicker">
                {userRole === "citizen"
                  ? "VECTOWATCH COMMUNITY PORTAL"
                  : "MUNICIPAL VECTOR SURVEILLANCE"}
              </p>
              <h1>{pageTitle}</h1>
            </div>
          </div>
        </section>
        {photoAcknowledgement}

        <div className="page-content">
          {userRole === "citizen" &&
            activePage !== "advisory" &&
            renderCitizenPortal()}

          {userRole === "citizen" &&
            activePage === "advisory" &&
            renderCitizenAdvisoryDesk()}

          {userRole === "officer" &&
            activePage ===
            "dashboard" &&
            renderDashboard()}

          {userRole === "officer" &&
            activePage === "reports" &&
            renderCitizenReports()}

          {userRole === "officer" &&
            activePage ===
            "verification" &&
            renderFieldVerification()}

          {userRole === "officer" &&
            activePage === "actions" &&
            renderContainmentActions()}

          {userRole === "officer" &&
            activePage ===
            "analytics" &&
            renderAnalytics()}

          {userRole === "officer" &&
            activePage === "case" &&
            renderCaseView()}
        </div>
      </main>
    </div>
  );
}

export default App;