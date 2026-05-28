import React, { useState, useRef, useEffect } from "react";
import { 
  Compass, Map as LucideMap, Plus, Trash2, Download, Upload, Eye, EyeOff, 
  Layers, FileJson, Zap, Calendar, Clock, Crosshair, ClipboardCopy, FileText, Settings, User,
  Play, Pause, RotateCcw, Loader2, Database, Save, Sparkles
} from "lucide-react";
import { collection, getDocs, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from "../firebase";

export interface LocationFix {
  id: string;
  lat: number;
  lng: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  timestamp: number;
  rawSnippet: string;
  details?: string; // custom details/labels e.g. "home", "office"
}

export interface TargetProfile {
  id: string;
  name: string;
  caseNumber: string;
  markerColor: string;
  isVisible: boolean;
  locations: LocationFix[];
  imei?: string;
  phone?: string;
}

export interface CriminalMovementWorkspace {
  profiles: { [key: string]: TargetProfile };
  mergedTargets: string[];
}

const compressSharedData = (profilesMap: { [key: string]: TargetProfile }): string => {
  const pList = Object.values(profilesMap).map((p: any) => ({
    n: p.name,
    c: p.caseNumber || "",
    col: p.markerColor || "#10b981",
    l: p.locations.map((l: any) => ({
      la: l.lat,
      lo: l.lng,
      d: l.date || "",
      t: l.time || "",
      s: l.rawSnippet || "",
      det: l.details || ""
    }))
  }));
  const rawJson = JSON.stringify({ p: pList });
  try {
    const base64 = btoa(unescape(encodeURIComponent(rawJson)));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  } catch (e) {
    return btoa(rawJson).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }
};

const decompressSharedData = (base64Str: string): { [key: string]: TargetProfile } | null => {
  try {
    let normalized = base64Str.replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4) {
      normalized += "=";
    }
    const rawJson = decodeURIComponent(escape(atob(normalized)));
    const data = JSON.parse(rawJson);
    const decodedProfiles: { [key: string]: TargetProfile } = {};
    if (Array.isArray(data.p)) {
      data.p.forEach((p: any, idx: number) => {
        const id = `shared-${idx}`;
        decodedProfiles[id] = {
          id,
          name: p.n,
          caseNumber: p.c,
          markerColor: p.col,
          isVisible: true,
          locations: p.l.map((l: any, lIdx: number) => ({
            id: `l-${lIdx}`,
            lat: l.la,
            lng: l.lo,
            date: l.d,
            time: l.t,
            timestamp: l.d && l.t ? new Date(`${l.d} ${l.t}`).getTime() : Date.now() + lIdx * 1000,
            rawSnippet: l.s || "",
            details: l.det || ""
          }))
        };
      });
    }
    return decodedProfiles;
  } catch (err) {
    console.error("Failed to decode shared data:", err);
    return null;
  }
};

const PRESET_COLORS = [
  "#10b981", // Emerald
  "#06b6d4", // Cyan
  "#f43f5e", // Rose
  "#eab308", // Yellow
  "#a855f7", // Purple
  "#f97316", // Orange
  "#3b82f6", // Blue
  "#ec4899"  // Pink
];

interface Props {
  onAddHistory: (title: string, query: string) => void;
  isSharedView?: boolean;
}

export default function CriminalMovementTab({ onAddHistory, isSharedView }: Props) {
  // Global Workspace State
  const [profiles, setProfiles] = useState<{ [key: string]: TargetProfile }>({});

  // Selected multi targets for overlap rendering
  const [mergedTargets, setMergedTargets] = useState<string[]>([]);

  // Full screen presentation and sharing status indicators
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  // Load shared link coordinates or local storage triggers upon mounting
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const shareVal = params.get("share");
      if (shareVal) {
        const decoded = decompressSharedData(shareVal);
        if (decoded) {
          setProfiles(decoded);
          const keys = Object.keys(decoded);
          setMergedTargets(keys);
          if (keys.length > 0) {
            setSelectedProfileId(keys[0]);
          }
          onAddHistory("Shared Workspace Loaded", `Decoded ${keys.length} custom tracking trajectory records from sharing URL payload.`);
        }
      }
    }
  }, []);

  // Sync Leaflet map canvas sizing when entering/exiting fullscreen maximizes
  useEffect(() => {
    if (leafletMapRef.current) {
      setTimeout(() => {
        leafletMapRef.current.invalidateSize();
        // Recenter on bounding markers
        const points: [number, number][] = [];
        profilesArray.forEach(profile => {
          if (!profile.isVisible || !mergedTargets.includes(profile.id)) return;
          profile.locations.forEach(loc => {
            points.push([loc.lat, loc.lng]);
          });
        });
        if (points.length > 0) {
          leafletMapRef.current.fitBounds(points, { padding: [50, 50] });
        }
      }, 300);
    }
  }, [isFullScreen, mergedTargets]);

  const profilesArray: TargetProfile[] = Object.keys(profiles).map(key => profiles[key]);

  // Profile Form States
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileCase, setNewProfileCase] = useState("");
  const [newProfileColor, setNewProfileColor] = useState("#10b981");
  const [newProfileImei, setNewProfileImei] = useState("");

  // Selected Active target profile for coordinate parsing/addition
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");

  // Playback Animation States
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [animationStep, setAnimationStep] = useState(0);
  const [playMode, setPlayMode] = useState<"uniform" | "proportional">("uniform");
  const [uniformSpeedKmH, setUniformSpeedKmH] = useState<number>(60);
  const [currentPositions, setCurrentPositions] = useState<{ [profileId: string]: { lat: number; lng: number } }>({});
  const carMarkersRef = useRef<{ [profileId: string]: any }>({});

  const getHaversineDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Raw Telecom Log Ingestion
  const [rawTextLog, setRawTextLog] = useState("");
  const [parsingResultsLog, setParsingResultsLog] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  // --- New Database + AI Route Tracing States ---
  const [dbSaving, setDbSaving] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const [aiTracingLoading, setAiTracingLoading] = useState(false);
  const [activeTracedRoute, setActiveTracedRoute] = useState<any | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<any[]>([]);
  const [customRouteName, setCustomRouteName] = useState("");

  const [cloudProfiles, setCloudProfiles] = useState<{ [key: string]: TargetProfile }>({});
  const [selectedCloudProfileIds, setSelectedCloudProfileIds] = useState<string[]>([]);
  const [selectedLocalProfileIdsToSave, setSelectedLocalProfileIdsToSave] = useState<string[]>([]);

  // Manual Coordinates Addition form states
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [manualDetails, setManualDetails] = useState("");

  const [customPoiDetails, setCustomPoiDetails] = useState("");

  // Real-time Geolocation tracking states
  const [userCurrentLocation, setUserCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isTrackingUser, setIsTrackingUser] = useState(false);
  const watchPositionIdRef = useRef<number | null>(null);

  enum OperationType {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    LIST = 'list',
    GET = 'get',
    WRITE = 'write',
  }

  interface FirestoreErrorInfo {
    error: string;
    operationType: OperationType;
    path: string | null;
    authInfo: {
      userId?: string | null;
    }
  }

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: "anonymous_osint_operator"
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    alert(`Cloud Database Access Issue: ${error instanceof Error ? error.message : String(error)}`);
  };

  // Pull dynamic list from Cloud Firestore
  const fetchCloudProfilesOnly = async () => {
    setDbLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "profiles"));
      const loaded: { [key: string]: TargetProfile } = {};
      querySnapshot.forEach((doc) => {
        loaded[doc.id] = doc.data() as TargetProfile;
      });
      setCloudProfiles(loaded);
      onAddHistory("Db Directory Synced", `Pulled live list of ${Object.keys(loaded).length} saved targets from Cloud.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, "profiles");
    } finally {
      setDbLoading(false);
    }
  };

  const loadProfilesFromFirebase = async () => {
    setDbLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "profiles"));
      const loaded: { [key: string]: TargetProfile } = {};
      querySnapshot.forEach((doc) => {
        loaded[doc.id] = doc.data() as TargetProfile;
      });
      
      setCloudProfiles(loaded);

      if (Object.keys(loaded).length > 0) {
        setProfiles(prev => {
          const merged = { ...prev, ...loaded };
          return merged;
        });
        const firstId = Object.keys(loaded)[0];
        setSelectedProfileId(prevId => prevId || firstId);
        setMergedTargets(prev => {
          const combined = Array.from(new Set([...prev, ...Object.keys(loaded)]));
          return combined;
        });
        onAddHistory("Database Sync", `Successfully synchronized ${Object.keys(loaded).length} target profiles from Firebase cloud storage.`);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, "profiles");
    } finally {
      setDbLoading(false);
    }
  };

  const saveProfileToFirebase = async (profileId: string) => {
    const profile = profiles[profileId];
    if (!profile) return;
    setDbSaving(true);
    try {
      const serializedProfile = JSON.parse(JSON.stringify(profile));
      await setDoc(doc(db, "profiles", profileId), serializedProfile);
      onAddHistory("Profile Saved to DB", `Saved profile "${profile.name}" with ${profile.locations.length} coordinates to Firebase Firestore database.`);
      alert(`Successfully synced suspect target "${profile.name}" to Cloud Database!`);
      fetchCloudProfilesOnly();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `profiles/${profileId}`);
    } finally {
      setDbSaving(false);
    }
  };

  // Save selected local profiles to Cloud database in bulk
  const saveSelectedProfilesToCloud = async () => {
    if (selectedLocalProfileIdsToSave.length === 0) {
      alert("Please check at least one local target profile from the list to save to the cloud.");
      return;
    }
    setDbSaving(true);
    let successCount = 0;
    try {
      for (const id of selectedLocalProfileIdsToSave) {
        const colVal = profiles[id];
        if (colVal) {
          const serializedProfile = JSON.parse(JSON.stringify(colVal));
          await setDoc(doc(db, "profiles", id), serializedProfile);
          successCount++;
        }
      }
      onAddHistory("Bulk Cloud Upload", `Saved ${successCount} profiles successfully in bulk to Cloud Firestore.`);
      alert(`Saved ${successCount} targets to Cloud successfully!`);
      setSelectedLocalProfileIdsToSave([]);
      fetchCloudProfilesOnly();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "profiles_bulk_save");
    } finally {
      setDbSaving(false);
    }
  };

  // Load specific profiles selected from Cloud list into local workspace session
  const loadSelectedProfilesFromCloud = async () => {
    if (selectedCloudProfileIds.length === 0) {
      alert("Please click checkbox on at least one Cloud target profile from list to import.");
      return;
    }
    setDbLoading(true);
    let successCount = 0;
    try {
      const loadedToMerge: { [key: string]: TargetProfile } = {};
      selectedCloudProfileIds.forEach(id => {
        const itemCloud = cloudProfiles[id];
        if (itemCloud) {
          loadedToMerge[id] = itemCloud;
          successCount++;
        }
      });

      setProfiles(prev => ({
        ...prev,
        ...loadedToMerge
      }));

      setMergedTargets(prev => {
        const combined = Array.from(new Set([...prev, ...selectedCloudProfileIds]));
        return combined;
      });

      if (selectedCloudProfileIds.length > 0) {
        setSelectedProfileId(selectedCloudProfileIds[0]);
      }

      onAddHistory("Bulk Cloud Import", `Imported ${successCount} targets from Cloud Firestore successfully.`);
      alert(`Loaded & merged ${successCount} target profiles from Firebase Cloud into workspace!`);
      setSelectedCloudProfileIds([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, "profiles_import_bulk");
    } finally {
      setDbLoading(false);
    }
  };

  // Delete profile from Cloud Firestore permanently
  const deleteProfileFromCloud = async (cloudId: string) => {
    if (!window.confirm("Permanently delete this target profile from Cloud database? (Local copy remains untouched)")) {
      return;
    }
    setDbSaving(true);
    try {
      await deleteDoc(doc(db, "profiles", cloudId));
      onAddHistory("Cloud profile deleted", `Target with Cloud ID: ${cloudId} removed from remote DB.`);
      alert("Successfully deleted target from cloud storage.");
      fetchCloudProfilesOnly();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `profiles/${cloudId}`);
    } finally {
      setDbSaving(false);
    }
  };

  // --- REAL-TIME OPERATOR GEOLOCATION TRACING SYSTEM ---
  const toggleRealTimeGpsTracking = () => {
    if (isTrackingUser) {
      if (watchPositionIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchPositionIdRef.current);
        watchPositionIdRef.current = null;
      }
      setIsTrackingUser(false);
      setUserCurrentLocation(null);
      onAddHistory("GPS Trace Off", "Stopped tracking user real-time position on GIS overlays.");
    } else {
      if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser environment.");
        return;
      }
      setIsTrackingUser(true);
      
      const success = (position: GeolocationPosition) => {
        const { latitude, longitude } = position.coords;
        setUserCurrentLocation({ lat: latitude, lng: longitude });
      };

      const error = (err: GeolocationPositionError) => {
        console.warn("Geolocation tracking error:", err);
        alert(`Could not retrieve geolocation data: ${err.message}. Please check browser permissions.`);
        setIsTrackingUser(false);
      };

      watchPositionIdRef.current = navigator.geolocation.watchPosition(success, error, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });

      onAddHistory("GPS Trace Handshake", "Initiated real-time continuous browser GIS positioning.");
    }
  };

  const handleCenterOnUser = () => {
    if (!leafletMapRef.current || !userCurrentLocation) return;
    leafletMapRef.current.setView([userCurrentLocation.lat, userCurrentLocation.lng], 15);
  };

  // Cleanup geolocation watch on component unmounted
  useEffect(() => {
    return () => {
      if (watchPositionIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchPositionIdRef.current);
      }
    };
  }, []);

  const saveRouteToFirebase = async (route: any) => {
    setDbSaving(true);
    try {
      await setDoc(doc(db, "routes", route.id), route);
      onAddHistory("Route Saved to DB", `Saved AI traced route "${route.name}" to Firebase Firestore database.`);
      alert(`Successfully saved AI Traced Route "${route.name}" to Cloud Database!`);
      loadRoutesFromFirebase();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `routes/${route.id}`);
    } finally {
      setDbSaving(false);
    }
  };

  const loadRoutesFromFirebase = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "routes"));
      const loaded: any[] = [];
      querySnapshot.forEach((doc) => {
        loaded.push(doc.data());
      });
      setSavedRoutes(loaded);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, "routes");
    }
  };

  // Initial synchronization
  useEffect(() => {
    loadProfilesFromFirebase();
    loadRoutesFromFirebase();
  }, []);

  const handleAddManualCoordinate = () => {
    if (!selectedProfileId) {
      alert("Please select or create an active suspect profile in the registry first.");
      return;
    }
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
      alert("Please provide valid geographic coordinate parameters (Lat: -90 to 90, Lng: -180 to 180).");
      return;
    }

    const currentProfile = profiles[selectedProfileId];
    if (!currentProfile) return;

    let absoluteTimestamp = Date.now();
    try {
      const parsedTime = manualTime.length === 5 ? `${manualTime}:00` : manualTime;
      absoluteTimestamp = Date.parse(`${manualDate}T${parsedTime}`);
      if (isNaN(absoluteTimestamp)) {
        absoluteTimestamp = Date.now();
      }
    } catch {
      absoluteTimestamp = Date.now();
    }

    const finalTime = manualTime.length === 5 ? `${manualTime}:00` : manualTime;

    const newFix: LocationFix = {
      id: `loc_manual_${Date.now()}`,
      lat,
      lng,
      date: manualDate,
      time: finalTime,
      timestamp: absoluteTimestamp,
      rawSnippet: `Manual Operator Entry [Label: ${manualDetails || "unassigned"}]`,
      details: manualDetails.trim()
    };

    setProfiles(prev => {
      const target = prev[selectedProfileId];
      const combined = [...target.locations, newFix];
      combined.sort((a, b) => a.timestamp - b.timestamp);

      return {
        ...prev,
        [selectedProfileId]: {
          ...target,
          locations: combined
        }
      };
    });

    onAddHistory("Manual Coordinate Plotted", `Inserted coordinates (${lat.toFixed(5)}, ${lng.toFixed(5)}) labeled "${manualDetails || "None"}" into suspect "${currentProfile.name}".`);
    alert(`Successfully plotted Manual Location Fix with label "${manualDetails || "None"}"!`);
    
    // reset coordinate fields
    setManualLat("");
    setManualLng("");
    setManualDetails("");
  };

  const handleUpdateCoordinateDetails = (profileId: string, fixId: string, value: string) => {
    setProfiles(prev => {
      const target = prev[profileId];
      if (!target) return prev;
      const updated = target.locations.map(loc => {
        if (loc.id === fixId) {
          return { ...loc, details: value };
        }
        return loc;
      });
      return {
        ...prev,
        [profileId]: {
          ...target,
          locations: updated
        }
      };
    });
  };

  const handleTraceRouteWithAI = async () => {
    if (!selectedProfileId) {
      alert("Please select or create an active suspect profile in the registry first.");
      return;
    }
    const currentProfile = profiles[selectedProfileId];
    if (!currentProfile || currentProfile.locations.length < 2) {
      alert("Suspect profile needs at least 2 checkpoints (coordinates) to trace a route.");
      return;
    }

    setAiTracingLoading(true);
    setActiveTracedRoute(null);
    try {
      const sparsePoints = currentProfile.locations.map(l => ({
        lat: l.lat,
        lng: l.lng,
        date: l.date,
        time: l.time,
        details: l.details || ""
      }));

      const res = await fetch("/api/trace-route-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: sparsePoints })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to communicate with AI routing engine.");
      }

      const data = await res.json();
      
      const newRoute = {
        id: `route_${Date.now()}`,
        profileId: selectedProfileId,
        name: customRouteName.trim() || `Route for ${currentProfile.name} (${new Date().toLocaleDateString()})`,
        routePoints: data.routePoints,
        summaryText: data.summaryText,
        createdAt: new Date().toISOString()
      };

      setActiveTracedRoute(newRoute);
      onAddHistory("AI Route Tracing Success", `Traced actual street-snapped route with ${data.routePoints.length} steps: "${newRoute.name}"`);
      alert(`AI Route Tracing Completed! Snapped ${data.routePoints.length} street tracking points.`);
    } catch (err: any) {
      console.error("AI Route tracing fail:", err);
      alert(`AI Tracking Error: ${err.message || String(err)}`);
    } finally {
      setAiTracingLoading(false);
    }
  };

  // Preset Date and Times for initialization
  useEffect(() => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    setManualDate(dateStr);
    setManualTime(timeStr);
  }, []);

  // Google Places API Autocomplete Search states
  const [poiQuery, setPoiQuery] = useState("");
  const [poiSuggestions, setPoiSuggestions] = useState<any[]>([]);
  const [poiLoading, setPoiLoading] = useState(false);
  const [selectedPoiDetails, setSelectedPoiDetails] = useState<any | null>(null);
  const [poiDetailsLoading, setPoiDetailsLoading] = useState(false);
  const [customPoiDate, setCustomPoiDate] = useState("2026-05-28");
  const [customPoiTime, setCustomPoiTime] = useState("12:00");

  useEffect(() => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    setCustomPoiDate(dateStr);
    setCustomPoiTime(timeStr);
  }, []);

  const handleSearchPoi = async () => {
    if (!poiQuery.trim()) return;
    setPoiLoading(true);
    setPoiSuggestions([]);
    setSelectedPoiDetails(null);

    try {
      let lat = 25.6124;
      let lng = 85.1412;
      if (leafletMapRef.current) {
        const center = leafletMapRef.current.getCenter();
        if (center) {
          lat = center.lat;
          lng = center.lng;
        }
      }

      const response = await fetch("/api/places-autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: poiQuery.trim(),
          latitude: lat,
          longitude: lng
        })
      });

      if (response.ok) {
        const res = await response.json();
        if (res.success && res.data) {
          const suggestions = res.data.suggestions || res.data.predictions || [];
          setPoiSuggestions(suggestions);
          onAddHistory("POI Autocomplete Query", `Queried Places Autocomplete for: "${poiQuery}"`);
        } else {
          console.warn("Places autocomplete failed response:", res);
        }
      } else {
        console.error("Places API status abnormal:", response.status);
      }
    } catch (e) {
      console.error("Failed fetching places autocomplete:", e);
    } finally {
      setPoiLoading(false);
    }
  };

  const handleSelectPoiSuggestion = async (suggestion: any) => {
    let placeId = "";
    let displayName = "";

    if (suggestion.placePrediction) {
      placeId = suggestion.placePrediction.placeId || suggestion.placePrediction.place || "";
      displayName = suggestion.placePrediction.text?.text || "";
    } else {
      placeId = suggestion.place_id || suggestion.place || "";
      displayName = suggestion.description || "";
    }

    if (!placeId) return;

    setPoiDetailsLoading(true);
    setSelectedPoiDetails(null);

    try {
      const response = await fetch("/api/places-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId })
      });

      if (response.ok) {
        const res = await response.json();
        if (res.success && res.data) {
          const detail = res.data;
          const loc = detail.location || {};
          const latitude = loc.latitude || loc.lat;
          const longitude = loc.longitude || loc.lng;

          if (latitude !== undefined && longitude !== undefined) {
            setSelectedPoiDetails({
              id: placeId,
              name: detail.displayName?.text || displayName || "Unknown POI",
              address: detail.formattedAddress || "No physical address provided",
              lat: latitude,
              lng: longitude
            });
            onAddHistory("POI Details Resolved", `Resolved place details for POI: "${displayName}"`);
            
            if (leafletMapRef.current) {
              leafletMapRef.current.setView([latitude, longitude], 15);
            }
          } else {
            alert("This location does not specify accurate coordinates in details directory.");
          }
        }
      }
    } catch (e) {
      console.error("POI Detail Resolve error:", e);
    } finally {
      setPoiDetailsLoading(false);
    }
  };

  const handleAddPoiAsLocationFix = () => {
    if (!selectedPoiDetails) return;
    if (!selectedProfileId) {
      alert("Please select or create an active suspect profile in the registry above first.");
      return;
    }

    const currentProfile = profiles[selectedProfileId];
    if (!currentProfile) return;

    let absoluteTimestamp = Date.now();
    try {
      absoluteTimestamp = Date.parse(`${customPoiDate}T${customPoiTime}:00`);
      if (isNaN(absoluteTimestamp)) {
        absoluteTimestamp = Date.now();
      }
    } catch {
      absoluteTimestamp = Date.now();
    }

    const finalTime = customPoiTime.length === 5 ? `${customPoiTime}:00` : customPoiTime;

    const newFix: LocationFix = {
      id: `loc_poi_${Date.now()}`,
      lat: selectedPoiDetails.lat,
      lng: selectedPoiDetails.lng,
      date: customPoiDate,
      time: finalTime,
      timestamp: absoluteTimestamp,
      rawSnippet: `Google Maps POI: ${selectedPoiDetails.name} (${selectedPoiDetails.address})`,
      details: customPoiDetails.trim()
    };

    setProfiles(prev => {
      const target = prev[selectedProfileId];
      const combined = [...target.locations, newFix];
      combined.sort((a, b) => a.timestamp - b.timestamp);

      return {
        ...prev,
        [selectedProfileId]: {
          ...target,
          locations: combined
        }
      };
    });

    onAddHistory("POI Track Added", `Added POI point "${selectedPoiDetails.name}" to suspect ${currentProfile.name}'s coordinates.`);
    alert(`Success: Linked POI "${selectedPoiDetails.name}" with coordinates (${selectedPoiDetails.lat.toFixed(5)}, ${selectedPoiDetails.lng.toFixed(5)}) to "${currentProfile.name}"!`);
    
    setPoiQuery("");
    setPoiSuggestions([]);
    setSelectedPoiDetails(null);
    setCustomPoiDetails("");
  };

  // Leaflet Map states and refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersLayerGroupRef = useRef<any>(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [tileLayerUrl, setTileLayerUrl] = useState("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"); // Satellite Hybrid
  const [timelineFilter, setTimelineFilter] = useState<"all" | string>("all");

  // Load Leaflet dynamically
  useEffect(() => {
    if ((window as any).L) {
      setLeafletLoaded(true);
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => {
      setLeafletLoaded(true);
    };
    document.head.appendChild(script);
  }, []);

  // Sync state modifications, trails, sequential markers and animated targets on the Leaflet map layer
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    if (!leafletMapRef.current) {
      leafletMapRef.current = L.map(mapContainerRef.current, {
        center: [25.6124, 85.1412],
        zoom: 13,
        zoomControl: false
      });
      L.control.zoom({ position: "bottomright" }).addTo(leafletMapRef.current);
    }

    const map = leafletMapRef.current;

    // Reset base tile layer to switch style smoothly only if it changed to prevent tile flicker
    let hasMatchingTile = false;
    map.eachLayer((layer: any) => {
      if (layer instanceof L.TileLayer) {
        if (layer._url === tileLayerUrl) {
          hasMatchingTile = true;
        } else {
          map.removeLayer(layer);
        }
      }
    });

    if (!hasMatchingTile) {
      L.tileLayer(tileLayerUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 20
      }).addTo(map);
    }

    // Initialize or clear layer group for dynamic markers/polylines
    if (markersLayerGroupRef.current) {
      markersLayerGroupRef.current.clearLayers();
    } else {
      markersLayerGroupRef.current = L.layerGroup().addTo(map);
    }
    const layerGroup = markersLayerGroupRef.current;

    const allVisiblePoints: [number, number][] = [];

    // Draw active suspect trajectories and sequence indices
    profilesArray.forEach(profile => {
      if (!profile.isVisible || !mergedTargets.includes(profile.id)) return;
      const sortedLocs = [...profile.locations].sort((a, b) => a.timestamp - b.timestamp);
      if (sortedLocs.length === 0) return;

      const latlngs: [number, number][] = sortedLocs.map(loc => [loc.lat, loc.lng]);
      allVisiblePoints.push(...latlngs);

      const drawColor = profile.markerColor || "#10b981";

      // Draw dashed trajectory trails
      const polyline = L.polyline(latlngs, {
        color: drawColor,
        dashArray: "6, 6",
        weight: 3.5,
        opacity: 0.85
      }).addTo(layerGroup);

      polyline.bindPopup(`
        <div style="font-family: inherit; font-size: 11px; color:#0f172a;">
          <strong style="color: ${drawColor}">${profile.name}</strong><br/>
          Case Number: <b>${profile.caseNumber}</b><br/>
          Total Trajectory Fixes: <b>${sortedLocs.length}</b>
        </div>
      `);

      // Draw sequencial tracking points
      sortedLocs.forEach((loc, index) => {
        const customIcon = L.divIcon({
          className: "custom-grid-div-icon-marker",
          html: `<div class="w-6 h-6 rounded-full flex items-center justify-center text-white font-extrabold text-xs shadow-lg border-2 border-white transition-all hover:scale-110" style="background-color: ${drawColor}; font-family: monospace;">${index + 1}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const marker = L.marker([loc.lat, loc.lng], { icon: customIcon }).addTo(layerGroup);

        const popupHtml = `
          <div class="p-1 font-mono text-[11px] text-slate-900 leading-normal" style="width: 230px;">
            <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 4px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
              <span style="color: ${drawColor}">${profile.name} (Ref #${index + 1})</span>
              <span class="text-[9px] px-1 bg-gray-100 rounded border border-gray-200 text-gray-700">${profile.caseNumber}</span>
            </div>
            <strong>Fix Time:</strong> ${loc.date} ${loc.time}<br/>
            <strong>Coordinates:</strong> ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}<br/>
            <div style="margin-top: 5px; background-color: #f8fafc; border: 1px solid #f1f5f9; padding: 4px; font-size: 10px; color: #475569; border-radius: 4px; font-style: italic; max-height: 75px; overflow-y: auto;">
              ${loc.rawSnippet || "No raw CDR/cell telecom payload snippet associated with this fix."}
            </div>
          </div>
        `;
        marker.bindPopup(popupHtml);
      });
    });

    // Draw pacing animated radar target ticks & record in carMarkersRef for smooth interpolations
    const newCarMarkers: { [profileId: string]: any } = {};

    Object.keys(activeAnimLocations).forEach(profileId => {
      const animData = activeAnimLocations[profileId];
      const p = profiles[profileId];
      if (animData && p) {
        const { fix, index } = animData;
        const drawColor = p.markerColor || "#10b981";

        const animatedIcon = L.divIcon({
          className: "custom-animated-pulse-icon-layer",
          html: `
            <div class="relative flex items-center justify-center" style="width: 44px; height: 44px;">
              <span class="animate-ping absolute inline-flex h-10 w-10 rounded-full opacity-60" style="background-color: ${drawColor}"></span>
              <div class="relative w-8 h-8 rounded-full flex items-center justify-center text-white border-2 border-slate-950 shadow-2xl font-bold font-mono text-[14px] flex items-center justify-center shadow-lg" style="background-color: ${drawColor}; box-shadow: 0 0 10px ${drawColor}cc;">
                🚗
              </div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22]
        });

        const currentLoc = currentPositions[profileId] || { lat: fix.lat, lng: fix.lng };
        const pulseMarker = L.marker([currentLoc.lat, currentLoc.lng], { icon: animatedIcon }).addTo(layerGroup);
        pulseMarker.bindPopup(`
          <div class="p-1 font-mono text-[11px] text-gray-900 leading-normal" style="width: 220px;">
            <div class="font-bold mb-1 border-b" style="color: ${drawColor}; border-bottom-color: #e2e8f0; padding-bottom: 4px; margin-bottom: 4px;">
              🚨 RADAR RECON PLAYBACK
            </div>
            <strong>Target:</strong> ${p.name}<br/>
            <strong>Index:</strong> Fix #${index + 1}<br/>
            <strong>Lock Date/Time:</strong> ${fix.date} ${fix.time}<br/>
            <strong>Coordinates:</strong> ${fix.lat.toFixed(6)}, ${fix.lng.toFixed(6)}
          </div>
        `);

        newCarMarkers[profileId] = pulseMarker;
      }
    });

    carMarkersRef.current = newCarMarkers;

    // Render AI traced road route if present
    if (activeTracedRoute && activeTracedRoute.routePoints && activeTracedRoute.routePoints.length > 0) {
      const routePoints: [number, number][] = activeTracedRoute.routePoints.map((pt: any) => [pt.lat, pt.lng]);
      allVisiblePoints.push(...routePoints);

      // AI Route outline halo
      L.polyline(routePoints, {
        color: "#22d3ee", // cyan-400 glow
        weight: 8,
        opacity: 0.35
      }).addTo(layerGroup);

      // AI Route solid center line
      const actualRouteLine = L.polyline(routePoints, {
        color: "#0891b2", // cyan-600 core
        weight: 4,
        opacity: 0.9
      }).addTo(layerGroup);

      actualRouteLine.bindPopup(`
        <div style="font-family: inherit; font-size: 11px; color:#0f172a; width: 220px;">
          <strong style="color: #0891b2">🤖 AI STREET TRACED ROUTE</strong><br/>
          <div style="margin-top: 4px; font-size: 10px; color:#475569; font-style: italic; background-color:#f1f5f9; padding: 4px; border-radius: 4px;">
            ${activeTracedRoute.summaryText}
          </div>
          <p style="margin-top: 4px; font-size: 9.5px; color:#475569;">
            Name: <b>${activeTracedRoute.name}</b><br/>
            Street Nodes: <b>${activeTracedRoute.routePoints.length}</b>
          </p>
        </div>
      `);

      // Add indicator circles for street-level nodes
      activeTracedRoute.routePoints.forEach((pt: any, idx: number) => {
        const dotIcon = L.divIcon({
          className: "custom-street-marker-dot",
          html: `<div class="w-3 h-3 rounded-full bg-cyan-400 border border-slate-950 shadow"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        });

        const streetMarker = L.marker([pt.lat, pt.lng], { icon: dotIcon }).addTo(layerGroup);
        streetMarker.bindPopup(`
          <div style="font-family: inherit; font-size: 10px; color:#0f172a;">
            <strong>Street segment #${idx + 1}:</strong><br/>
            <span style="color:#0891b2; font-weight: bold;">${pt.streetName || "Unresolved Road segment"}</span><br/>
            <strong>Coordinates:</strong> ${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}
          </div>
        `);
      });
    }

    // Render user's real-time location marker
    if (userCurrentLocation) {
      const userGpsIcon = L.divIcon({
        className: "custom-user-gps-marker",
        html: `
          <div class="relative flex items-center justify-center w-8 h-8">
            <div class="absolute w-6 h-6 bg-blue-500 rounded-full opacity-40 animate-ping"></div>
            <div class="absolute w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-md"></div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const userGpsMarker = L.marker([userCurrentLocation.lat, userCurrentLocation.lng], { icon: userGpsIcon }).addTo(layerGroup);
      userGpsMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 11px; color:#0f172a; width: 180px;">
          <strong style="color: #2563eb">🔵 MY REAL-TIME POSITION</strong><br/>
          <span style="font-size: 9.5px; color:#475569;">
            Latitude: <b>${userCurrentLocation.lat.toFixed(6)}</b><br/>
            Longitude: <b>${userCurrentLocation.lng.toFixed(6)}</b>
          </span>
          <p style="margin-top: 5px; font-size: 9 px; color:#94a3b8; font-style: italic;">
            Updating continuously via browser GPS telemetry.
          </p>
        </div>
      `);
    }

    // Bounds fitting handling
    if (allVisiblePoints.length > 0) {
      try {
        map.fitBounds(allVisiblePoints, { padding: [40, 40] });
      } catch (e) {
        console.warn("Leaflet fitBounds failed safe handle:", e);
      }
    }
  }, [profiles, mergedTargets, leafletLoaded, animationStep, tileLayerUrl, activeTracedRoute, userCurrentLocation]);

  // Dynamically update animated car marker positions on the map for sub-pixel/smooth rendering without clearing other layers
  useEffect(() => {
    if (!leafletLoaded || !leafletMapRef.current) return;
    Object.keys(currentPositions).forEach(profileId => {
      const pos = currentPositions[profileId];
      const marker = carMarkersRef.current[profileId];
      if (marker && pos) {
        marker.setLatLng([pos.lat, pos.lng]);
      }
    });
  }, [currentPositions, leafletLoaded]);

  // Centering handle on POI details updates
  useEffect(() => {
    if (!leafletMapRef.current || !selectedPoiDetails) return;
    leafletMapRef.current.setView([selectedPoiDetails.lat, selectedPoiDetails.lng], 15);
  }, [selectedPoiDetails]);

  // Recalculate consolidated timeline for animation tracking
  const sortedTimeline = React.useMemo(() => {
    const entries: { profile: TargetProfile; fix: LocationFix; index: number }[] = [];
    profilesArray.forEach(profile => {
      const sortedLocs = [...profile.locations].sort((a, b) => a.timestamp - b.timestamp);
      sortedLocs.forEach((loc, index) => {
        entries.push({
          profile,
          fix: loc,
          index
        });
      });
    });
    return entries.sort((a, b) => a.fix.timestamp - b.fix.timestamp);
  }, [profilesArray]);

  const activeAnimLocations = React.useMemo(() => {
    const anims: { [profileId: string]: { fix: LocationFix; index: number } } = {};
    if (sortedTimeline.length > 0) {
      const currentStepLimit = Math.min(animationStep, sortedTimeline.length - 1);
      for (let i = 0; i <= currentStepLimit; i++) {
        const entry = sortedTimeline[i];
        if (entry && entry.profile && entry.fix && entry.profile.isVisible && mergedTargets.includes(entry.profile.id)) {
          anims[entry.profile.id] = { fix: entry.fix, index: entry.index };
        }
      }
    }
    return anims;
  }, [sortedTimeline, animationStep, mergedTargets]);

  // Handle addition of a Target Profile
  const handleCreateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;

    const id = `target_${Date.now()}`;
    const newProfile: TargetProfile = {
      id,
      name: newProfileName.trim(),
      caseNumber: newProfileCase.trim() || "N/A",
      markerColor: newProfileColor,
      isVisible: true,
      locations: []
    };

    setProfiles(prev => ({
      ...prev,
      [id]: newProfile
    }));
    setMergedTargets(prev => [...prev, id]);
    setSelectedProfileId(id);
    
    // Reset Form
    setNewProfileName("");
    setNewProfileCase("");
    onAddHistory(`Profile Created`, `Target: ${newProfile.name} [${newProfile.caseNumber}]`);
  };

  // Toggle Visibility / Selection check of target trace
  const handleToggleProfileVisibility = (id: string) => {
    setProfiles(prev => {
      const p = prev[id];
      if (!p) return prev;
      return {
        ...prev,
        [id]: { ...p, isVisible: !p.isVisible }
      };
    });
  };

  // Delete profile completely
  const handleDeleteProfile = (id: string) => {
    if (confirm("Are you sure you want to delete this target profile, track mapping, and chronological fixes?")) {
      const { [id]: deleted, ...rest } = profiles;
      setProfiles(rest);
      setMergedTargets(prev => prev.filter(item => item !== id));
      if (selectedProfileId === id) {
        const remainingKeys = Object.keys(rest);
        setSelectedProfileId(remainingKeys[0] || "");
      }
    }
  };

  // Parse raw pasted telecom CDR/SDR logs
  const handleParseLogText = () => {
    if (!rawTextLog.trim()) {
      setParsingResultsLog(["Error: CDR/SDR unstructured box contains no input."]);
      return;
    }

    const currentProfile = profiles[selectedProfileId];
    if (!currentProfile) {
      setParsingResultsLog(["Error: Select or create a target profile to assign extracted track locations to!"]);
      return;
    }

    const lines = rawTextLog.split(/\r?\n/);
    const newFixes: LocationFix[] = [];
    const logs: string[] = [];
    logs.push(`Initializing tactical parsing algorithm across ${lines.length} lines of text...`);

    // Required Regex specifications
    // Coordinates standard and with label prefix
    const coordRegex = /(?:Lat|Latitude|Lat\:)?\s*(-?\d+\.\d+)\s*(?:Lon|Long|Longitude|Lng\:)?\s*,\s*(-?\d+\.\d+)/i;
    // Dates
    const indianDateRegex = /(\d{2})-(\d{2})-(\d{4})/;
    const isoDateRegex = /(\d{4}-\d{2}-\d{2})/;
    // Times
    const timeRegex = /(\d{2}:\d{2}:\d{2})|(\d{2}:\d{2})/;
    // 15-digit IMEI detector
    const imeiRegex = /\b(\d{15})\b/;

    let parsedCount = 0;
    let extractedImei = "";

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Extract IMEI if found in text logs
      const imeiMatch = trimmed.match(imeiRegex);
      if (imeiMatch && !extractedImei) {
        extractedImei = imeiMatch[1];
        logs.push(`[IMEI Detected] Discovered 15-digit cellular IMEI sequence: ${extractedImei}`);
      }

      // Extract coordinates
      const coordMatch = trimmed.match(coordRegex);
      if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);

        // Boundary sanity checks
        if (isNaN(lat) || isNaN(lng) || lat > 90 || lat < -90 || lng > 180 || lng < -188) {
          return;
        }

        // Extract Date (Fallback standard DD-MM-YYYY or ISO)
        let resolvedDate = "";
        const indianDateMatch = trimmed.match(indianDateRegex);
        const isoDateMatch = trimmed.match(isoDateRegex);

        if (isoDateMatch) {
          resolvedDate = isoDateMatch[1];
        } else if (indianDateMatch) {
          // Indian format standard DD-MM-YYYY normalized to YYYY-MM-DD
          resolvedDate = `${indianDateMatch[3]}-${indianDateMatch[2]}-${indianDateMatch[1]}`;
        } else {
          // Fallback to active system date
          const d = new Date();
          resolvedDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }

        // Extract Time
        let resolvedTime = "00:00:00";
        const timeMatch = trimmed.match(timeRegex);
        if (timeMatch) {
          resolvedTime = timeMatch[1] || timeMatch[2];
          if (resolvedTime.length === 5) {
            resolvedTime = `${resolvedTime}:00`;
          }
        } else {
          // Fallback to active system time standard
          const d = new Date();
          resolvedTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
        }

        // Generate absolute Javascript milestone epoch index integer
        let absoluteTimestamp = 0;
        try {
          absoluteTimestamp = Date.parse(`${resolvedDate}T${resolvedTime}`);
          if (isNaN(absoluteTimestamp)) {
            absoluteTimestamp = Date.now();
          }
        } catch {
          absoluteTimestamp = Date.now();
        }

        newFixes.push({
          id: `loc_${Date.now()}_${Math.random()}`,
          lat,
          lng,
          date: resolvedDate,
          time: resolvedTime,
          timestamp: absoluteTimestamp,
          rawSnippet: trimmed.length > 100 ? `${trimmed.substring(0, 97)}...` : trimmed
        });

        parsedCount++;
      }
    });

    if (newFixes.length > 0) {
      // Update targeted profile local locations and sort chronologically
      setProfiles(prev => {
        const target = prev[selectedProfileId];
        const combined = [...target.locations, ...newFixes];
        // Sort chronologically using absolute timestamp
        combined.sort((a, b) => a.timestamp - b.timestamp);

        return {
          ...prev,
          [selectedProfileId]: {
            ...target,
            locations: combined,
            imei: extractedImei || target.imei || ""
          }
        };
      });

      logs.push(`[Ingest Complete] Successfully extracted and normalized ${parsedCount} coordinate timeline fixes to "${currentProfile.name}".`);
      onAddHistory(`GIS Log Extracted`, `Extracted ${parsedCount} location track fixes and linked IMEI parameter to target "${currentProfile.name}".`);
      setRawTextLog("");
    } else {
      logs.push("[Validation Failure] Failed to resolve spatial matches. Check format patterns (Latitude, Longitude separated by a comma).");
    }

    setParsingResultsLog(logs);
  };

  // Checkbox toggle for multi target tracking
  const handleToggleMergedTarget = (id: string) => {
    if (mergedTargets.includes(id)) {
      setMergedTargets(prev => prev.filter(item => item !== id));
    } else {
      setMergedTargets(prev => [...prev, id]);
    }
  };

  // Perform simultaneous display overlay layout
  const handleExecuteMultiTrack = () => {
    // Forces map zoom mapping to bound all checked profiles in state triggers
    // Just a state notification trigger for the user
    const selectedProfiles = profilesArray.filter(p => mergedTargets.includes(p.id) && p.isVisible);
    onAddHistory("Overlay Active", `Checking rendezvous tracking with ${selectedProfiles.length} custom overlapping tracks.`);
    alert(`Tactical GIS Multi-Track Overlay Active: Simulating co-location across ${selectedProfiles.length} suspect spatial paths!`);
  };

  // Generate self-contained sharing link
  const handleShareMap = () => {
    try {
      if (Object.keys(profiles).length === 0) {
        alert("Cannot share: No targets or coordinate sequences defined yet. Please initialize a suspect and plot coordinates first.");
        return;
      }
      const code = compressSharedData(profiles);
      const origin = window.location.origin + window.location.pathname;
      const shareUrl = `${origin}?share=${code}`;

      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(() => {
          setShareStatus("📋 Copied shareable map link to clipboard! Share it with anyone.");
          setTimeout(() => setShareStatus(null), 6000);
        }).catch(() => {
          setShareStatus(null);
          alert(`Link ready! Please copy this sharing URL manually:\n\n${shareUrl}`);
        });
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setShareStatus("📋 Copied shareable map link to clipboard! (fallback)");
        setTimeout(() => setShareStatus(null), 6000);
      }
      onAddHistory("Map Shared", `Generated public shared map link with ${Object.keys(profiles).length} tracks.`);
    } catch (err) {
      console.error(err);
      alert("Error generating shared map link.");
    }
  };

  // JSON Persistence Export
  const handleExportWorkspaceJSON = () => {
    try {
      const stateToExport: CriminalMovementWorkspace = {
        profiles,
        mergedTargets
      };
      const jsonString = JSON.stringify(stateToExport, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = url;
      link.download = `STF-TargetTracker-Workspace-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onAddHistory("Workspace Saved", `JSON serialized layout exported.`);
    } catch (e) {
      alert("Workspace Export State Error.");
    }
  };

  // JSON Persistence Import
  const handleImportWorkspaceJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string) as CriminalMovementWorkspace;
        if (parsed && typeof parsed.profiles === "object") {
          setProfiles(parsed.profiles);
          if (Array.isArray(parsed.mergedTargets)) {
            setMergedTargets(parsed.mergedTargets);
          }
          alert("Workspace schema verified & loaded successfully!");
          onAddHistory("Workspace Loaded", `${Object.keys(parsed.profiles).length} tracks restored.`);
        } else {
          alert("Schema validation failed: Invalid Criminal Tracker layout JSON format specification.");
        }
      } catch (err) {
        alert("File parsing failed: Make sure file has accurate JSON format credentials.");
      }
    };
    reader.readAsText(file);
  };

  // KMZ/KML Export Routine Specification 6B
  const handleExportKML = () => {
    try {
      let placemarksKML = "";
      let linesKML = "";

      profilesArray.forEach(profile => {
        if (profile.locations.length === 0) return;

        const safeName = profile.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const hexColor = (profile.markerColor || "#10b981").replace("#", "");
        // KML formats color as aabbggrr (Alpha, Blue, Green, Red)
        // Red component is first 2 letters, Green is next 2, Blue is next 2. 
        // We can synthesize a fast conversion or default standard opaque green
        const kmlColor = `ff${hexColor.substring(4, 6)}${hexColor.substring(2, 4)}${hexColor.substring(0, 2)}`;

        // Pin Points Placemarks
        profile.locations.forEach((loc, idx) => {
          placemarksKML += `
      <Placemark>
        <name>${safeName} - Fix #${idx + 1}</name>
        <description>Date: ${loc.date} | Time: ${loc.time} | Case: ${profile.caseNumber}</description>
        <Point>
          <coordinates>${loc.lng},${loc.lat},0</coordinates>
        </Point>
      </Placemark>`;
        });

        // Path Trajectory Sequence LineString
        const sorted = [...profile.locations].sort((a, b) => a.timestamp - b.timestamp);
        const coordinateListString = sorted.map(loc => `            ${loc.lng},${loc.lat},0`).join("\n");

        linesKML += `
    <Style id="style_${profile.id}">
      <LineStyle>
        <color>${kmlColor}</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Folder>
      <name>${safeName} Track Sequence</name>
      <Placemark>
        <name>${safeName} Movement Path Route</name>
        <styleUrl>#style_${profile.id}</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>
${coordinateListString}
          </coordinates>
        </LineString>
      </Placemark>
    </Folder>`;
      });

      const fullKML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Criminal Track GIS Exporter - SOG14</name>
    <Folder>
      <name>Target Profiles Collection</name>
${placemarksKML}
    </Folder>
${linesKML}
  </Document>
</kml>`;

      const blob = new Blob([fullKML], { type: "application/vnd.google-earth.kml+xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `STF-Tactical-GIS-KML-Export-${Date.now()}.kml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      onAddHistory("KML Exported", `Saved .kml structural document.`);
    } catch (e) {
      alert("Failed generating KML document schema.");
    }
  };

  // Compile full sorted chronologically timeline entries from visible paths
  const timelineEntries = React.useMemo(() => {
    const entries: { profile: TargetProfile; fix: LocationFix; index: number }[] = [];
    profilesArray.forEach(profile => {
      // Skip if filtered out via secondary timeline selection bar
      if (timelineFilter !== "all" && timelineFilter !== profile.id) return;

      const sortedLocs = [...profile.locations].sort((a, b) => a.timestamp - b.timestamp);
      sortedLocs.forEach((loc, index) => {
        entries.push({
          profile,
          fix: loc,
          index
        });
      });
    });

    // Chronological arrangement layout ranking
    return entries.sort((a, b) => a.fix.timestamp - b.fix.timestamp);
  }, [profiles, timelineFilter]);

  // Delete an individual location fix from a specific profile
  const handleDeleteLocationFix = (profileId: string, fixId: string) => {
    if (confirm("Are you sure you want to delete this specific coordinate fix?")) {
      setProfiles(prev => {
        const target = prev[profileId];
        if (!target) return prev;
        const updatedLocations = target.locations.filter(loc => loc.id !== fixId);
        return {
          ...prev,
          [profileId]: {
            ...target,
            locations: updatedLocations
          }
        };
      });
      onAddHistory("Fix Deleted", `Deleted location fix ${fixId} from target.`);
    }
  };

  // Playback timer and position interpolation loop using requestAnimationFrame
  useEffect(() => {
    if (!isPlaying || timelineEntries.length === 0) {
      return;
    }

    if (animationStep >= timelineEntries.length - 1) {
      setIsPlaying(false);
      return;
    }

    const entry = timelineEntries[animationStep];
    if (!entry) return;

    const profileId = entry.profile.id;
    const endPos = { lat: entry.fix.lat, lng: entry.fix.lng };

    // Find starting position (previous location fix for this profile)
    const sortedLocs = [...entry.profile.locations].sort((a, b) => a.timestamp - b.timestamp);
    const prevFix = entry.index > 0 ? sortedLocs[entry.index - 1] : null;
    const startPos = prevFix ? { lat: prevFix.lat, lng: prevFix.lng } : endPos;

    // Calculate step duration in milliseconds
    let stepDuration = 1500 / animationSpeed;

    if (playMode === "proportional") {
      const nextEntry = timelineEntries[animationStep + 1];
      const diffMs = nextEntry.fix.timestamp - entry.fix.timestamp;
      if (diffMs > 0) {
        const hourMs = 60 * 60 * 1000;
        stepDuration = (diffMs / hourMs) * 2000;
        stepDuration = stepDuration / animationSpeed;
        if (stepDuration < 300) stepDuration = 300;
        if (stepDuration > 6500) stepDuration = 6500;
      } else {
        stepDuration = 400 / animationSpeed;
      }
    } else {
      // playMode === "uniform"
      const distanceKm = getHaversineDistanceKm(startPos.lat, startPos.lng, endPos.lat, endPos.lng);
      if (distanceKm > 0) {
        // Calculate duration based on speed in km/h. High speed = fast, low speed = slow.
        // Formula: hours = distance / speed. Milliseconds = hours * 3,600,000.
        // We divide by 30 to compress time so it's a visible but quick animation on the screen.
        stepDuration = (distanceKm / Math.max(1, uniformSpeedKmH)) * 3600 * 1000 / 30;
        stepDuration = stepDuration / animationSpeed;
        if (stepDuration < 400) stepDuration = 400;
        if (stepDuration > 8000) stepDuration = 8000;
      } else {
        stepDuration = 400 / animationSpeed;
      }
    }

    const startTime = performance.now();
    let frameId: number;

    const updatePosition = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / stepDuration);

      const lat = startPos.lat + (endPos.lat - startPos.lat) * progress;
      const lng = startPos.lng + (endPos.lng - startPos.lng) * progress;

      setCurrentPositions(prev => ({
        ...prev,
        [profileId]: { lat, lng }
      }));

      if (progress < 1) {
        frameId = requestAnimationFrame(updatePosition);
      } else {
        setAnimationStep(prev => prev + 1);
      }
    };

    frameId = requestAnimationFrame(updatePosition);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [isPlaying, animationStep, playMode, animationSpeed, uniformSpeedKmH, timelineEntries]);

  const handleTogglePlay = () => {
    if (timelineEntries.length === 0) {
      alert("No coordinates registered. Ingest CDR/SDR coordinates or select POIs first.");
      return;
    }
    if (animationStep >= timelineEntries.length - 1) {
      setAnimationStep(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleResetAnimation = () => {
    setIsPlaying(false);
    setAnimationStep(0);
    setCurrentPositions({});
  };

  const sharedFromUrl = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("share") !== null;
  const isCurrentlyShared = isSharedView || sharedFromUrl;

  if (isCurrentlyShared) {
    return (
      <div className="bg-[#030712] border border-slate-800 rounded-xl overflow-hidden flex flex-col glow-cyan relative w-full h-[88vh] min-h-[550px] shadow-2xl flex-1">
        {/* HUD NAV FOR SHARED WORKSPACE */}
        <div className="bg-slate-900/90 px-4 py-3.5 border-b border-gray-850 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-brand-cyan animate-spin" style={{ animationDuration: "12s" }} /> 
            <div>
              <span className="text-xs font-extrabold text-white uppercase tracking-wider font-mono block">TACTICAL TELEMETRY PORTAL</span>
              <span className="text-[10px] text-gray-400 block font-sans">Visualizing actual chronological cell tower and suspect route vectors</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
            {/* Play controls */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleTogglePlay}
                className={`px-3 py-1.5 font-bold rounded flex items-center gap-1.5 text-[11px] transition-all cursor-pointer ${isPlaying ? "bg-red-600 text-white animate-pulse" : "bg-brand-cyan text-slate-950 hover:bg-cyan-300"}`}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isPlaying ? "PAUSE FEED" : "PLAY MOVEMENT"}
              </button>

              <button
                type="button"
                onClick={handleResetAnimation}
                className="p-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-gray-300 border border-slate-700 font-extrabold cursor-pointer"
                title="Reset Playback Animation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Play Mode toggle */}
            <div className="flex bg-[#020612] rounded border border-gray-850 p-0.5 gap-0.5" title="Movement Playback Mode">
              <button
                type="button"
                onClick={() => setPlayMode("uniform")}
                className={`px-2 py-1 rounded text-[9px] font-extrabold transition-all cursor-pointer ${playMode === "uniform" ? "bg-brand-cyan text-slate-950 font-black" : "text-gray-400 hover:text-white"}`}
                title="Continuous uniform sequence movement"
              >
                UNIFORM
              </button>
              <button
                type="button"
                onClick={() => setPlayMode("proportional")}
                className={`px-2 py-1 rounded text-[9px] font-extrabold transition-all cursor-pointer ${playMode === "proportional" ? "bg-brand-cyan text-slate-950 font-black" : "text-gray-400 hover:text-white"}`}
                title="Real-time chronological delay based on tower logs"
              >
                TIME LOGS
              </button>
            </div>

            {/* Speed selection */}
            {playMode === "uniform" && (
              <div className="flex items-center gap-1.5 bg-[#020612] border border-gray-800 rounded px-2 py-1" title="Set Car Speed in km/h manually">
                <span className="text-[9px] uppercase font-bold text-gray-400 font-sans">Speed:</span>
                <input
                  type="number"
                  min={10}
                  max={250}
                  step={10}
                  value={uniformSpeedKmH}
                  onChange={e => setUniformSpeedKmH(Math.max(1, parseInt(e.target.value) || 60))}
                  className="w-12 bg-slate-900 border border-slate-750 text-brand-cyan text-right rounded px-1 py-0.5 text-[10px] font-sans font-extrabold focus:outline-none focus:border-brand-cyan"
                />
                <span className="text-[9px] text-gray-500 font-sans">km/h</span>
              </div>
            )}

            <div className="flex items-center gap-1 bg-[#020612] border border-gray-800 rounded p-1">
              {[1, 2, 4].map(speed => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => setAnimationSpeed(speed)}
                  className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold cursor-pointer transition-all ${animationSpeed === speed ? "bg-brand-cyan text-slate-950 font-black" : "text-gray-500 hover:text-white"}`}
                >
                  {speed}x
                </button>
              ))}
            </div>

            {/* Tile Layer Maps selection */}
            <div className="flex bg-[#020612] rounded border border-gray-850 p-0.5 gap-0.5">
              {[
                { name: "STREET", tile: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" },
                { name: "SAT", tile: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" },
                { name: "HYBRID", tile: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" },
                { name: "TERRAIN", tile: "https://mt1.google.com/vt/lyrs=t&x={x}&y={y}&z={z}" }
              ].map(style => (
                <button
                  key={style.name}
                  type="button"
                  onClick={() => setTileLayerUrl(style.tile)}
                  className={`px-2 py-1 rounded text-[9px] font-extrabold transition-all cursor-pointer ${tileLayerUrl === style.tile ? "bg-brand-cyan text-slate-950 font-black" : "text-gray-400 hover:text-white"}`}
                >
                  {style.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Target Profile checklist */}
        <div className="bg-[#050914] px-4 py-2 border-b border-gray-850 flex flex-wrap items-center gap-2 font-mono text-[10.5px]">
          <span className="text-gray-400 flex items-center gap-1 font-bold uppercase"><Layers className="w-3.5 h-3.5 text-brand-cyan" /> Plotted Suspects:</span>
          <div className="flex flex-wrap gap-2">
            {profilesArray.map(profile => (
              <label 
                key={profile.id} 
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border cursor-pointer select-none transition-colors border ${mergedTargets.includes(profile.id) ? "bg-slate-800 border-slate-700 text-white" : "bg-[#030712] border-gray-850 text-gray-500"}`}
              >
                <input
                  type="checkbox"
                  checked={mergedTargets.includes(profile.id)}
                  onChange={() => handleToggleMergedTarget(profile.id)}
                  className="rounded border-gray-300 text-brand-cyan focus:ring-brand-cyan h-3.5 w-3.5 cursor-pointer"
                />
                <span className="font-extrabold font-sans" style={{ color: mergedTargets.includes(profile.id) ? profile.markerColor : "#9ca3af" }}>
                  {profile.name} ({profile.locations.length} Points)
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* INTERACTIVE MAP COMPONENT */}
        <div className="relative flex-1 bg-[#0b0f19] overflow-hidden min-h-[400px]">
          <div ref={mapContainerRef} className="w-full h-full z-10" />

          {!leafletLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 z-25 text-gray-400 font-mono text-xs gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-brand-cyan" />
              <span>LAUNCHING SECURE TACTICAL GIS TELEMETRY PLATFORM...</span>
            </div>
          )}

          {/* Absolute floating tips */}
          <div className="absolute bottom-3 left-3 bg-slate-900/90 border border-slate-800 rounded px-2.5 py-1 z-[1000] font-mono text-[9.5px] text-gray-400 shadow pointer-events-none">
            Selected target paths are actively synchronized chronologically.
          </div>

          {/* Absolute sliding chronological timeline widget */}
          {timelineEntries.length > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/95 border border-slate-800 p-3 rounded-lg shadow-2xl flex items-center gap-3 font-mono text-xs w-full max-w-xl pointer-events-auto">
              <span className="text-gray-400 text-[10px] uppercase font-bold shrink-0">Timeline:</span>
              <input
                type="range"
                min={0}
                max={timelineEntries.length - 1}
                value={animationStep}
                onChange={e => {
                  setIsPlaying(false);
                  setAnimationStep(parseInt(e.target.value));
                }}
                className="flex-1 accent-brand-cyan h-1.5 bg-slate-950 rounded-lg cursor-pointer"
              />
              <div className="shrink-0 text-right text-[10px] bg-slate-950 px-2.5 py-1 rounded font-bold border border-slate-850">
                Fix {animationStep + 1} / {timelineEntries.length} | <span className="text-brand-green font-bold">{timelineEntries[animationStep].profile.name.split(" ")[0]}</span> <span className="text-brand-cyan font-bold">{timelineEntries[animationStep].fix.time}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0b1329] border border-gray-800/80 rounded-2xl p-5 md:p-6 space-y-6 select-text text-left text-gray-100 font-sans">
      
      {/* SECTION CARD TOP BAR */}
      <div className="border-b border-gray-800 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-sm font-bold uppercase text-brand-cyan tracking-widest flex items-center gap-2">
            <Compass className="w-5 h-5 text-brand-cyan shrink-0 animate-spin" style={{ animationDuration: "12s" }} /> 
            TACTICAL GIS TARGET MOVEMENT TRACKER
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Ingest unstructured CDR tower logs, compile suspect pathways, and audit spatial overlap rendezvous.
          </p>
        </div>

        {/* Global Persistence Toolbar Panel Spec 6 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Export JSON */}
          <button
            onClick={handleExportWorkspaceJSON}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all text-gray-200"
            title="Download full operational JSON workspace layout"
          >
            <Download className="w-3.5 h-3.5 text-brand-cyan" /> Export JSON
          </button>

          {/* Import JSON file trigger */}
          <label className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-[11px] font-mono font-bold flex items-center gap-1.5 cursor-pointer transition-all text-gray-200">
            <Upload className="w-3.5 h-3.5 text-brand-yellow" /> Import JSON
            <input 
              type="file" 
              accept=".json" 
              onChange={handleImportWorkspaceJSON} 
              className="hidden" 
            />
          </label>

          {/* Export KML */}
          <button
            onClick={handleExportKML}
            className="px-3 py-1.5 rounded-lg border border-amber-900/35 bg-amber-950/20 hover:bg-amber-900/30 text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all text-amber-400"
            title="Download standard Keyhole Markup Language (.kml) file for rendering directly in external GIS clients like Google Earth"
          >
            <Layers className="w-3.5 h-3.5" /> Export KML
          </button>
        </div>
      </div>

      {/* THREE COLUMN / RESPONSIVE GRIDS DISPATCH */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Suspect Profile Setup & Bulk Parser */}
        <div className="xl:col-span-1 space-y-5">
          
          {/* PROFILE CREATION BLOCK */}
          <div className="bg-[#030712]/50 border border-slate-800 rounded-xl p-4 space-y-4">
            <span className="text-[10px] text-brand-cyan font-bold uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-800/80 pb-1.5">
              <User className="w-3.5 h-3.5" /> Profiles Creation Console
            </span>

            <form onSubmit={handleCreateProfile} className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-gray-400 block mb-1">Suspect Name / Alias:</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={newProfileName}
                    onChange={e => setNewProfileName(e.target.value)}
                    placeholder="e.g. John"
                    className="w-full bg-[#070b14] border border-gray-805 rounded px-2.5 py-1.5 font-sans font-medium text-gray-100 focus:outline-none focus:border-brand-cyan"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-gray-400 block mb-1">Case # / FIR:</label>
                  <input
                    type="text"
                    value={newProfileCase}
                    onChange={e => setNewProfileCase(e.target.value)}
                    placeholder="FIR/102-26"
                    className="w-full bg-[#070b14] border border-gray-800 rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-cyan"
                  />
                </div>
                <div>
                  <label className="text-gray-400 block mb-1">Marker Accent Color:</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="color"
                      value={newProfileColor}
                      onChange={e => setNewProfileColor(e.target.value)}
                      className="w-8 h-8 rounded border border-gray-800 cursor-pointer bg-[#070b14]"
                    />
                    <select
                      value={newProfileColor}
                      onChange={e => setNewProfileColor(e.target.value)}
                      className="flex-1 bg-[#070b14] border border-gray-800 rounded p-1 font-sans text-[11px]"
                    >
                      <option value="#10b981">Emerald Green</option>
                      <option value="#06b6d4">Cyan Spark</option>
                      <option value="#f43f5e">Rose Alert</option>
                      <option value="#eab308">Laser Yellow</option>
                      <option value="#a855f7">Shadow Purple</option>
                      <option value="#f97316">Tangerine</option>
                      <option value="#3b82f6">Sector Blue</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-gray-400 block mb-1">IMEI Code / Device ID (Optional):</label>
                <input
                  type="text"
                  id="target-profile-imei-input"
                  value={newProfileImei}
                  onChange={e => setNewProfileImei(e.target.value)}
                  placeholder="15-digit Device Identifier IMEI"
                  maxLength={15}
                  className="w-full bg-[#070b14] border border-gray-800 rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-cyan"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-brand-cyan hover:bg-brand-cyan/85 font-bold uppercase transition-all duration-150 text-slate-950 flex items-center justify-center gap-1.5 mt-2 shadow-md hover:scale-[1.01] active:translate-y-0 text-[11px]"
              >
                <Plus className="w-4 h-4 shrink-0" /> Initialize New Suspect
              </button>
            </form>
          </div>

          {/* ACTIVE TARGETS SELECTION BOX */}
          <div className="bg-[#030712]/50 border border-slate-800 rounded-xl p-4 space-y-3 font-mono">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center justify-between border-b border-gray-800/80 pb-1.5">
              <span>Managed Targets Registry ({Object.keys(profiles).length})</span>
              <Settings className="w-3.5 h-3.5 text-gray-500 cursor-pointer hover:text-brand-cyan" onClick={() => setShowSettings(!showSettings)} />
            </span>

            <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1">
              {profilesArray.length === 0 ? (
                <div className="p-4 text-center text-[10px] text-gray-500 font-mono italic">
                  No active targets registered. Use the console above to initialize a suspect.
                </div>
              ) : (
                profilesArray.map(profile => {
                  const fixCount = profile.locations.length;
                  return (
                    <div 
                      key={profile.id} 
                      className={`p-2.5 rounded-lg border text-xs relative ${selectedProfileId === profile.id ? "bg-slate-900/60 border-slate-700" : "bg-[#040810]/40 border-gray-850"}`}
                    >
                      <div className="flex justify-between items-start gap-1">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow" 
                            style={{ backgroundColor: profile.markerColor }} 
                          />
                          <button
                            onClick={() => setSelectedProfileId(profile.id)}
                            className="font-bold text-gray-200 hover:text-brand-cyan transition-colors text-left"
                          >
                            {profile.name}
                          </button>
                        </div>
                        
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Cloud Sync individual profile option */}
                          {(() => {
                            const isCloudSynced = cloudProfiles[profile.id] !== undefined;
                            return (
                              <button
                                onClick={() => saveProfileToFirebase(profile.id)}
                                disabled={dbSaving}
                                className={`p-1 rounded transition-all cursor-pointer ${
                                  isCloudSynced 
                                    ? "text-emerald-400 hover:text-emerald-300" 
                                    : "text-gray-500 hover:text-brand-cyan hover:bg-[#070b14]"
                                }`}
                                title={
                                  isCloudSynced 
                                    ? "Synced with Cloud database. Click to update/overwrite cloud backup." 
                                    : "Not synced to Cloud database. Click to upload target to cloud."
                                }
                              >
                                {isCloudSynced ? (
                                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Save className="w-3.5 h-3.5 text-gray-400 hover:text-brand-cyan" />
                                )}
                              </button>
                            );
                          })()}

                          {/* Visibility check */}
                          <button
                            onClick={() => handleToggleProfileVisibility(profile.id)}
                            className={`p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-all`}
                            title="Toggle route vector display layout"
                          >
                            {profile.isVisible ? <Eye className="w-3.5 h-3.5 text-brand-cyan" /> : <EyeOff className="w-3.5 h-3.5 text-gray-650" />}
                          </button>

                          {/* Delete profile option */}
                          <button
                            onClick={() => handleDeleteProfile(profile.id)}
                            className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-all"
                            title="Delete target"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-1.5 flex flex-wrap justify-between items-center gap-1 text-[10px] text-gray-400 font-sans border-t border-gray-850/60 pt-1.5">
                        <span>Case: <strong className="text-gray-300">{profile.caseNumber}</strong></span>
                        {profile.imei && (
                          <span className="text-[9.5px]">IMEI: <strong className="text-gray-300 font-mono">{profile.imei}</strong></span>
                        )}
                        <span className="font-mono text-brand-green bg-brand-green/10 px-1.5 py-0.5 rounded border border-brand-green/20">
                          {fixCount} FIXES
                        </span>
                      </div>

                      {/* Active target selection ribbon */}
                      {selectedProfileId === profile.id && (
                        <span className="absolute top-0 right-0 w-1.5 h-full rounded-r-lg" style={{ backgroundColor: profile.markerColor }} />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* TACTICAL CLOUD REPOSITORY CONTROLLER CARD */}
          <div className="bg-[#030712]/50 border border-slate-800 rounded-xl p-4 space-y-3.5 font-mono">
            <span className="text-[10px] text-brand-cyan font-bold uppercase tracking-widest flex items-center justify-between border-b border-gray-800/80 pb-2">
              <span className="flex items-center gap-1.5 font-sans">
                <Database className="w-3.5 h-3.5 animate-pulse text-brand-cyan" /> Cloud Profile Repository
              </span>
              <button
                type="button"
                onClick={fetchCloudProfilesOnly}
                disabled={dbLoading}
                className="text-[9px] bg-slate-900 hover:bg-slate-800 text-gray-300 px-2 py-0.5 rounded border border-slate-700 font-sans cursor-pointer flex items-center gap-1 transition-all"
              >
                {dbLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : null}
                Refresh Cloud
              </button>
            </span>

            {/* SECTION 1: SAVE / SYNC TARGETS TO CLOUD */}
            <div className="space-y-2">
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center justify-between font-sans">
                <span>↑ Save to Cloud</span>
                <span className="text-[9px] text-gray-500 lowercase">select local profiles to sync</span>
              </div>
              
              {profilesArray.length === 0 ? (
                <div className="p-2 border border-dashed border-slate-800 rounded text-center text-[9.5px] text-gray-650 italic">
                  No local suspect profiles registered to save.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[110px] overflow-y-auto bg-[#040810]/30 border border-slate-850 p-2 rounded">
                  {profilesArray.map(profile => {
                    const isChecked = selectedLocalProfileIdsToSave.includes(profile.id);
                    return (
                      <label 
                        key={profile.id}
                        className="flex items-center justify-between p-1 hover:bg-[#070b14]/80 rounded cursor-pointer text-[10.5px] text-gray-300 select-none"
                      >
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedLocalProfileIdsToSave(prev => 
                                isChecked ? prev.filter(id => id !== profile.id) : [...prev, profile.id]
                              );
                            }}
                            className="rounded accent-brand-cyan bg-[#040810] border-gray-800 focus:ring-0 cursor-pointer"
                          />
                          <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: profile.markerColor }} />
                          <span className="font-sans truncate max-w-[130px]" title={profile.name}>{profile.name}</span>
                        </div>
                        <span className="text-[9px] text-gray-500 font-mono px-1 bg-slate-900 border border-slate-800/80 rounded shrink-0">
                          {profile.locations.length} FIXES
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-1.5 font-sans">
                <button
                  type="button"
                  onClick={() => setSelectedLocalProfileIdsToSave(profilesArray.map(p => p.id))}
                  className="flex-1 py-1 bg-slate-900 hover:bg-slate-800 text-[10px] text-gray-300 rounded border border-slate-700/80 cursor-pointer text-center tracking-tight"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLocalProfileIdsToSave([])}
                  className="flex-1 py-1 bg-slate-900 hover:bg-slate-800 text-[10px] text-gray-300 rounded border border-slate-700/80 cursor-pointer text-center tracking-tight"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={saveSelectedProfilesToCloud}
                  disabled={dbSaving || selectedLocalProfileIdsToSave.length === 0}
                  className="flex-2 py-1 bg-brand-cyan hover:bg-cyan-300 text-slate-950 font-bold rounded text-[10px] cursor-pointer text-center flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {dbSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Checked
                </button>
              </div>
            </div>

            {/* SECTION 2: LOAD / IMPORT TARGETS FROM CLOUD */}
            <div className="space-y-2 border-t border-slate-850 pt-3">
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center justify-between font-sans">
                <span>↓ Load from Cloud</span>
                <span className="text-[9px] text-gray-500 lowercase text-brand-green font-bold">multi-load active</span>
              </div>

              {Object.keys(cloudProfiles).length === 0 ? (
                <div className="p-3 border border-dashed border-slate-800 rounded text-center text-[9.5px] text-gray-650 italic">
                  No profiles saved on the cloud. Try saving a target above first!
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto bg-[#040810]/30 border border-slate-850 p-2 rounded">
                  {Object.values(cloudProfiles).map((cloudProf: any) => {
                    const isChecked = selectedCloudProfileIds.includes(cloudProf.id);
                    const isLocalMatch = profiles[cloudProf.id] !== undefined;
                    return (
                      <div 
                        key={cloudProf.id}
                        className="flex items-center justify-between p-1 hover:bg-[#070b14]/80 rounded text-[10.5px] text-gray-300"
                      >
                        <label className="flex items-center gap-2 flex-1 cursor-pointer select-none">
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedCloudProfileIds(prev => 
                                isChecked ? prev.filter(id => id !== cloudProf.id) : [...prev, cloudProf.id]
                              );
                            }}
                            className="rounded accent-brand-cyan bg-[#040810] border-gray-800 focus:ring-0 cursor-pointer"
                          />
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cloudProf.markerColor || '#10b981' }} />
                          <span className="font-sans truncate max-w-[110px]" title={`${cloudProf.name} (Case: ${cloudProf.caseNumber || 'N/A'})`}>
                            {cloudProf.name}
                          </span>
                          {isLocalMatch && (
                            <span className="text-[8px] bg-brand-cyan/10 border border-cyan-500/35 text-brand-cyan px-1 rounded-sm shrink-0 font-mono">
                              LOCAL
                            </span>
                          )}
                        </label>
                        
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] text-gray-500 font-mono px-1 bg-slate-900 border border-slate-800/80 rounded">
                            {(cloudProf.locations && cloudProf.locations.length) || 0} FIXES
                          </span>
                          <button
                            type="button"
                            onClick={() => deleteProfileFromCloud(cloudProf.id)}
                            className="text-gray-550 hover:text-rose-400 p-0.5 rounded transition-all cursor-pointer"
                            title="Delete this profile track from Firebase cloud permanently"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-1.5 font-sans">
                <button
                  type="button"
                  onClick={() => setSelectedCloudProfileIds(Object.keys(cloudProfiles))}
                  className="flex-1 py-1 bg-slate-900 hover:bg-slate-800 text-[10px] text-gray-300 rounded border border-slate-700/80 cursor-pointer text-center tracking-tight"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCloudProfileIds([])}
                  className="flex-1 py-1 bg-slate-900 hover:bg-slate-800 text-[10px] text-gray-300 rounded border border-slate-700/80 cursor-pointer text-center tracking-tight"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={loadSelectedProfilesFromCloud}
                  disabled={dbLoading || selectedCloudProfileIds.length === 0}
                  className="flex-2 py-1 bg-brand-green hover:bg-emerald-400 text-slate-950 font-bold rounded text-[10px] cursor-pointer text-center flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {dbLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                  Load Checked
                </button>
              </div>
            </div>
          </div>

          {/* GOOGLE MAPS PLACE POI FINDER BLOCK */}
          <div className="bg-[#030712]/50 border border-slate-800 rounded-xl p-4 space-y-3">
            <span className="text-[10px] text-brand-cyan font-bold uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-800/80 pb-1.5">
              <Crosshair className="w-3.5 h-3.5 text-brand-cyan shrink-0" /> Google Maps POI Lookup (RapidAPI)
            </span>

            <div className="space-y-2">
              <p className="text-[10.5px] text-gray-400 leading-normal">
                Query points-of-interest or addresses to quickly extract precise coordinates and link them to suspect pathways:
              </p>
              <div className="flex gap-2 font-mono">
                <input
                  type="text"
                  value={poiQuery}
                  onChange={e => setPoiQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSearchPoi(); }}
                  placeholder="e.g. Hotel, Station, Central Park"
                  className="flex-1 bg-[#040810] border border-gray-850 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-brand-cyan placeholder:text-gray-600"
                />
                <button
                  onClick={handleSearchPoi}
                  disabled={poiLoading || !poiQuery.trim()}
                  className="px-3 rounded bg-brand-cyan hover:bg-brand-cyan/85 text-slate-950 font-bold uppercase text-[10px] flex items-center gap-1 shrink-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {poiLoading ? "Searching..." : "Search"}
                </button>
              </div>
            </div>

            {/* Suggestions list from AutoComplete */}
            {poiSuggestions.length > 0 && (
              <div className="bg-slate-950/70 border border-slate-800 rounded p-1.5 max-h-[140px] overflow-y-auto space-y-1">
                <div className="text-[9px] text-gray-400 font-bold px-1 pb-1 border-b border-gray-850/50 mb-1">Autocomplete Predictions:</div>
                {poiSuggestions.map((sug, i) => {
                  let text = "";
                  if (sug.placePrediction) {
                    text = sug.placePrediction.text?.text || "";
                  } else {
                    text = sug.description || "";
                  }
                  return (
                    <button
                      key={i}
                      onClick={() => handleSelectPoiSuggestion(sug)}
                      className="w-full text-left text-[10px] p-1.5 rounded hover:bg-slate-800/50 transition-colors block text-gray-350 truncate"
                      title={text}
                    >
                      • {text}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Resolved POI coordinates details & Attach options */}
            {poiDetailsLoading && (
              <div className="p-3 text-center text-[10px] text-gray-500 font-mono italic animate-pulse">
                Resolving address landmarks & coordinates...
              </div>
            )}

            {selectedPoiDetails && (
              <div className="bg-slate-950/80 border border-slate-800 rounded p-3 space-y-2.5 font-mono text-[10.5px]">
                <div className="border-b border-gray-850 pb-1.5">
                  <div className="font-bold text-brand-green truncate">{selectedPoiDetails.name}</div>
                  <div className="text-[9.5px] text-gray-400 truncate mt-0.5">{selectedPoiDetails.address}</div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-gray-500 block">Latitude:</span>
                    <span className="text-gray-200 font-bold">{selectedPoiDetails.lat.toFixed(6)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Longitude:</span>
                    <span className="text-gray-200 font-bold">{selectedPoiDetails.lng.toFixed(6)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-gray-850 pt-2 transition-all">
                  <div>
                    <label className="text-gray-500 text-[9px] block mb-1">Fix Date:</label>
                    <input
                      type="date"
                      value={customPoiDate}
                      onChange={e => setCustomPoiDate(e.target.value)}
                      className="w-full bg-[#040810] border border-gray-850 rounded p-1 text-[10px] text-white focus:outline-none focus:border-brand-cyan"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 text-[9px] block mb-1">Fix Time:</label>
                    <input
                      type="time"
                      value={customPoiTime}
                      onChange={e => setCustomPoiTime(e.target.value)}
                      className="w-full bg-[#040810] border border-gray-850 rounded p-1 text-[10px] text-white focus:outline-none focus:border-brand-cyan"
                    />
                  </div>
                </div>

                {/* Landmark Custom Label / Details */}
                <div className="border-t border-gray-850 pt-2 space-y-1">
                  <label className="text-gray-500 text-[9px] block">Landmark Label / Custom Notes (e.g. Home, Office, Safehouse):</label>
                  <input
                    type="text"
                    value={customPoiDetails}
                    onChange={e => setCustomPoiDetails(e.target.value)}
                    placeholder="e.g. Suspect's Office, Night Location..."
                    className="w-full bg-[#040810] border border-gray-850 rounded p-1 text-[10.5px] text-white focus:outline-none focus:border-brand-cyan"
                  />
                </div>

                {/* Suspect Selector for POI */}
                <div className="border-t border-gray-850 pt-2 space-y-1">
                  <label className="text-gray-500 text-[9px] block">Assign Landmark To Target Suspect:</label>
                  <select
                    value={selectedProfileId}
                    onChange={e => setSelectedProfileId(e.target.value)}
                    className="w-full bg-[#040810] border border-gray-850 rounded p-1 text-[11px] text-white focus:outline-none focus:border-brand-cyan font-mono"
                  >
                    <option value="">-- Choose Target Suspect --</option>
                    {profilesArray.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.caseNumber || "Unassigned"})</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleAddPoiAsLocationFix}
                  disabled={!selectedProfileId}
                  className={`w-full py-1.5 text-slate-950 font-bold rounded flex items-center justify-center gap-1 transition-all text-[10px] ${!selectedProfileId ? "bg-gray-800 text-gray-500 cursor-not-allowed" : "bg-[#10b981] hover:bg-emerald-400 cursor-pointer"}`}
                >
                  <Plus className="w-3.5 h-3.5" /> Attach As Track Fix
                </button>
              </div>
            )}
          </div>

          {/* BULK LOGS INGESTION PARSER */}
          <div className="bg-[#030712]/50 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center border-b border-gray-800/80 pb-1.5">
              <span className="text-[10px] text-brand-cyan font-bold uppercase tracking-widest flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-brand-cyan shrink-0" /> Target CDR Ingestion Parser
              </span>
              {selectedProfileId && profiles[selectedProfileId] && (
                <span className="text-[9px] px-2 py-0.5 text-gray-300 font-mono bg-slate-900 border border-slate-700 rounded truncate max-w-[150px]">
                  Target: {profiles[selectedProfileId].name}
                </span>
              )}
            </div>

            {/* Suspect Target Selector Dropdown */}
            <div className="space-y-1.5">
              <label className="text-gray-400 font-bold text-[10px] uppercase font-mono tracking-wider block">Target Suspect Profile:</label>
              <select
                value={selectedProfileId}
                onChange={e => setSelectedProfileId(e.target.value)}
                className="w-full bg-[#020612] border border-gray-800 hover:border-brand-cyan/60 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-brand-cyan font-mono transition-colors"
              >
                <option value="">-- Click to choose or change target suspect --</option>
                {profilesArray.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Case: {p.caseNumber || "Unassigned"}) {p.locations.length > 0 ? `[${p.locations.length} coordinates plotted]` : "[No coordinates]"}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-[10.5px] text-gray-400 leading-normal">
              Paste raw Call Detail Records (CDR), Subscriber Details (SDR), or tower telemetry coordinates here:
            </p>

            <textarea
              rows={4}
              value={rawTextLog}
              onChange={e => setRawTextLog(e.target.value)}
              placeholder="Example CDR entries:&#10;Lat: 25.6124, Lon: 85.1412 | India Fixed | 28-05-2026 14:30&#10;Triangulated 25.6234, 85.1525 (15:45:10, 2026-05-28)&#10;CDR ping: 25.6412,85.1788"
              className="w-full bg-[#040810] border border-gray-850 rounded p-2 text-[11px] font-mono leading-normal text-white focus:outline-none focus:border-brand-cyan placeholder:text-gray-650"
            />

            <button
              onClick={handleParseLogText}
              disabled={!selectedProfileId}
              className={`w-full py-2 rounded-lg font-bold uppercase text-[11px] font-mono transition-all flex items-center justify-center gap-1.5 ${(!selectedProfileId) ? "bg-gray-800 text-gray-500 cursor-not-allowed" : "bg-[#10b981] text-slate-950 hover:bg-emerald-400 shadow-md transform hover:scale-[1.01]"}`}
            >
              <Zap className="w-4 h-4" /> Extract & Plot Coordinates
            </button>

            {/* InGEST RESULTS LOGS */}
            {parsingResultsLog.length > 0 && (
              <div className="bg-[#020612] rounded p-2 text-[9.5px] font-mono text-gray-400 max-h-[85px] overflow-y-auto border border-slate-800/60 leading-normal">
                {parsingResultsLog.map((log, idx) => (
                  <div key={idx} className={log.startsWith("Error") ? "text-rose-400" : log.startsWith("[Ingest") ? "text-emerald-400 font-bold" : "text-gray-400"}>
                    » {log}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* CENTER / RIGHT GENERAL PANEL: Visual Interactive Map & Target Intersection Filters */}
        <div className="xl:col-span-2 space-y-6">
          
          {/* Share Status Banner */}
          {shareStatus && (
            <div className="bg-brand-cyan/15 border border-brand-cyan/35 text-brand-cyan text-xs font-mono font-bold rounded-lg p-3.5 mb-2 flex items-center justify-between shadow-lg">
              <span className="flex items-center gap-1.5">
                <Compass className="w-4 h-4 animate-spin shrink-0" />
                {shareStatus}
              </span>
              <button onClick={() => setShareStatus(null)} className="text-[10px] text-gray-400 hover:text-white border border-gray-800 px-2 py-0.5 rounded leading-none transition-colors">Dismiss</button>
            </div>
          )}

          {/* MAP CANVAS PANEL CARD */}
          <div className="bg-[#030712]/55 border border-slate-800/80 rounded-xl overflow-hidden flex flex-col glow-cyan relative">
            
            {/* Map Accents Top Header Tab */}
            <div className="bg-slate-900/85 px-4 py-3 border-b border-gray-800/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div className="flex items-center gap-2">
                <LucideMap className="w-4 h-4 text-brand-cyan animate-pulse" />
                <span className="text-xs font-bold text-gray-200 uppercase tracking-wider font-mono">Operations Tracking GIS Canvas</span>
              </div>

              {/* Cross-Target Overlaps selection bar */}
              <div className="flex flex-wrap items-center gap-3 font-mono text-[10.5px]">
                <span className="text-gray-400 flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> Overlap Overlay:</span>
                
                <div className="flex flex-wrap gap-2">
                  {profilesArray.map(profile => (
                    <label 
                      key={profile.id} 
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border cursor-pointer select-none transition-colors ${mergedTargets.includes(profile.id) ? "bg-slate-800 border-slate-700 text-white" : "bg-[#030712] border-gray-850 text-gray-400"}`}
                    >
                      <input
                        type="checkbox"
                        checked={mergedTargets.includes(profile.id)}
                        onChange={() => handleToggleMergedTarget(profile.id)}
                        className="rounded border-gray-300 text-brand-cyan focus:ring-brand-cyan h-3 w-3"
                      />
                      <span className="font-bold font-sans" style={{ color: mergedTargets.includes(profile.id) ? profile.markerColor : "#9ca3af" }}>{profile.name.split(" ")[0]}</span>
                    </label>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleExecuteMultiTrack}
                    className="px-2.5 py-1 rounded bg-[#2563eb] text-white hover:bg-blue-500 font-bold active:scale-95 transition-all shadow-md text-[10px]"
                  >
                    Execute Multi-Track
                  </button>

                  <button
                    onClick={handleShareMap}
                    className="px-2.5 py-1 rounded bg-brand-cyan text-slate-950 hover:bg-cyan-300 font-bold active:scale-95 transition-all shadow-md text-[10px] flex items-center gap-1"
                    title="Generate Shareable telemetry links"
                  >
                    🚀 Share Map Link
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive Raw Map Container */}
            <div className={isFullScreen ? "fixed inset-0 z-[5000] bg-slate-950 flex flex-col pointer-events-auto" : "relative w-full h-[400px] bg-[#0b0f19] border border-gray-800 rounded overflow-hidden"}>
              
              {/* Top-Left GPS Tracking Panel (Minimised Mode Only) */}
              {!isFullScreen && (
                <div className="absolute top-4 left-4 z-[1000] bg-slate-900/95 border border-slate-800 p-1.5 rounded-lg shadow-xl flex items-center gap-1.5 font-mono pointer-events-auto">
                  <button
                    type="button"
                    onClick={toggleRealTimeGpsTracking}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      isTrackingUser 
                        ? "bg-blue-600 text-white" 
                        : "bg-[#030712] text-gray-450 hover:text-white hover:bg-slate-800 border border-slate-850"
                    }`}
                    title="Toggle display of your real-time geographic position"
                  >
                    <div className={`w-2 h-2 rounded-full ${isTrackingUser ? "bg-white animate-ping" : "bg-blue-500"}`} />
                    {isTrackingUser ? "LIVE GPS: ON" : "TRACK ACCESS ROUTE"}
                  </button>

                  {userCurrentLocation && (
                    <button
                      type="button"
                      onClick={handleCenterOnUser}
                      className="px-1.5 py-0.5 bg-[#040810]/70 border border-slate-800 text-brand-cyan hover:bg-slate-800 rounded text-[10px] lowercase font-mono cursor-pointer transition-all flex items-center gap-1"
                      title="Pan map to your current real-time GPS coordinates"
                    >
                      <span>center:</span>
                      <span className="text-gray-300 font-bold">
                        {userCurrentLocation.lat.toFixed(4)}, {userCurrentLocation.lng.toFixed(4)}
                      </span>
                    </button>
                  )}
                </div>
              )}

              {/* Fullscreen control overlay HUD layout */}
              {isFullScreen && (
                <div className="absolute top-4 left-4 right-4 z-[9999] bg-slate-900/95 border border-slate-800 p-3 rounded-lg shadow-2xl flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
                  {/* Select target checklists inside maximized full screen */}
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-bold text-[10.5px] uppercase flex items-center gap-1"><Layers className="w-3.5 h-3.5 text-brand-cyan" /> Targets Checklist:</span>
                    <div className="flex flex-wrap gap-1.5 bg-[#020612] p-1 rounded border border-gray-800">
                      {profilesArray.map(profile => (
                        <label 
                          key={profile.id} 
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer select-none transition-colors border ${mergedTargets.includes(profile.id) ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-950 border-gray-850 text-gray-500"}`}
                        >
                          <input
                            type="checkbox"
                            checked={mergedTargets.includes(profile.id)}
                            onChange={() => handleToggleMergedTarget(profile.id)}
                            className="rounded border-gray-300 text-brand-cyan focus:ring-brand-cyan h-3 w-3"
                          />
                          <span className="font-bold text-[10px] font-sans" style={{ color: mergedTargets.includes(profile.id) ? profile.markerColor : "#6b7280" }}>{profile.name.split(" ")[0]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Flight/Movement playback and styles Controls */}
                  <div className="flex items-center gap-3">
                    {/* Play controls */}
                    <button
                      type="button"
                      onClick={handleTogglePlay}
                      className={`px-3 py-1 font-bold rounded flex items-center gap-1.5 text-[11px] transition-all cursor-pointer ${isPlaying ? "bg-red-600 text-white" : "bg-brand-cyan text-slate-950 hover:bg-cyan-300"}`}
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5 animate-pulse" /> : <Play className="w-3.5 h-3.5" />}
                      {isPlaying ? "PAUSE FEED" : "PLAY MOVEMENT"}
                    </button>

                    <button
                      type="button"
                      onClick={handleResetAnimation}
                      className="p-1 px-2 bg-slate-800 hover:bg-slate-700 rounded text-gray-300 border border-slate-700 font-extrabold cursor-pointer"
                      title="Reset Playback Animation"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>

                     {/* Play Mode toggle */}
                     <div className="flex bg-[#020612] border border-gray-800 rounded p-0.5 gap-0.5" title="Movement Playback Mode">
                       <button
                         type="button"
                         onClick={() => setPlayMode("uniform")}
                         className={`px-2 py-0.5 rounded text-[9px] font-sans font-bold transition-all cursor-pointer ${playMode === "uniform" ? "bg-brand-cyan text-slate-950 font-black" : "text-gray-400 hover:text-white"}`}
                         title="Continuous uniform sequence movement"
                       >
                         UNIFORM
                       </button>
                       <button
                         type="button"
                         onClick={() => setPlayMode("proportional")}
                         className={`px-2 py-0.5 rounded text-[9px] font-sans font-bold transition-all cursor-pointer ${playMode === "proportional" ? "bg-brand-cyan text-slate-950 font-black" : "text-gray-400 hover:text-white"}`}
                         title="Real-time chronological delay based on tower logs"
                       >
                         TIME LOGS
                       </button>
                     </div>
 
                     {/* Custom Speed Selection (Uniform Mode) */}
                     {playMode === "uniform" && (
                       <div className="flex items-center gap-1 bg-[#020612] border border-gray-800 rounded p-0.5 flex-nowrap" title="Set Car Speed in km/h manually">
                         <span className="text-[9px] uppercase font-bold text-gray-400 font-sans pl-1">Speed:</span>
                         <input
                           type="number"
                           min={10}
                           max={250}
                           step={10}
                           value={uniformSpeedKmH}
                           onChange={e => setUniformSpeedKmH(Math.max(1, parseInt(e.target.value) || 60))}
                           className="w-12 bg-slate-900 border border-slate-750 text-brand-cyan text-right rounded px-1 text-[10px] font-sans font-extrabold focus:outline-none focus:border-brand-cyan"
                         />
                         <span className="text-[9px] text-gray-500 font-sans pr-1">km/h</span>
                       </div>
                     )}
 
                     {/* Speed Controls */}
                     <div className="flex items-center gap-1 bg-[#020612] border border-gray-800 rounded p-0.5">
                      {[1, 2, 4].map(speed => (
                        <button
                          key={speed}
                          type="button"
                          onClick={() => setAnimationSpeed(speed)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold cursor-pointer transition-all ${animationSpeed === speed ? "bg-brand-cyan text-slate-950 font-black" : "text-gray-500 hover:text-white"}`}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>

                    {/* Tile layer selections */}
                    <div className="flex bg-[#020612] rounded border border-gray-800 p-0.5 gap-0.5">
                      {[
                        { name: "STREET", tile: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" },
                        { name: "SAT", tile: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" },
                        { name: "HYBRID", tile: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" },
                        { name: "TERRAIN", tile: "https://mt1.google.com/vt/lyrs=t&x={x}&y={y}&z={z}" }
                      ].map(style => (
                        <button
                          key={style.name}
                          type="button"
                          onClick={() => setTileLayerUrl(style.tile)}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold transition-all cursor-pointer ${tileLayerUrl === style.tile ? "bg-brand-cyan text-slate-950 font-black" : "text-gray-400 hover:text-white"}`}
                        >
                          {style.name}
                        </button>
                      ))}
                    </div>

                    {/* GPS Tracker Option inside Fullscreen HUD */}
                    <div className="flex bg-[#020612] border border-gray-800 rounded p-0.5 gap-0.5" title="Operator Real-time GPS Tracker">
                      <button
                        type="button"
                        onClick={toggleRealTimeGpsTracking}
                        className={`px-2 py-0.5 rounded text-[9px] font-sans font-[900] transition-all cursor-pointer flex items-center gap-1 shrink-0 ${isTrackingUser ? "bg-blue-600 text-white animate-pulse" : "text-gray-400 hover:text-white"}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isTrackingUser ? 'bg-white animate-ping' : 'bg-blue-500'}`} />
                        GPS: {isTrackingUser ? "ON" : "OFF"}
                      </button>
                      {userCurrentLocation && (
                        <button
                          type="button"
                          onClick={handleCenterOnUser}
                          className="px-1.5 py-0.5 bg-slate-900 border border-slate-850 text-brand-cyan hover:bg-slate-800 rounded text-[9px] font-mono cursor-pointer shrink-0"
                          title="Center map on live GPS coords"
                        >
                          🎯 {userCurrentLocation.lat.toFixed(3)}, {userCurrentLocation.lng.toFixed(3)}
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => setIsFullScreen(false)}
                      className="bg-red-600 hover:bg-red-500 text-white font-bold px-3 py-1 rounded text-[11px] uppercase transition-colors"
                    >
                      Exit Fullscreen
                    </button>
                  </div>
                </div>
              )}

              {/* Leaflet instance element container */}
              <div ref={mapContainerRef} className="w-full h-full z-10" />

              {!leafletLoaded && (
                <div className="absolute inset-0 bg-[#020617]/85 flex flex-col items-center justify-center text-gray-300 z-30 space-y-2">
                  <Loader2 className="w-8 h-8 text-brand-cyan animate-spin" />
                  <p className="font-mono text-xs">Booting Decrypted GIS Mapping System...</p>
                </div>
              )}

              {/* Leaflet Map Style Selector Widget Overlay (Minimised Mode Only) */}
              {!isFullScreen && (
                <div className="absolute top-4 right-4 z-[1000] bg-slate-900/95 border border-slate-800 p-1 rounded shadow-xl flex items-center gap-1 font-mono text-[9px] pointer-events-auto">
                  <span className="text-gray-400 font-bold uppercase px-1 text-[8.5px]">Style:</span>
                  {[
                    { name: "STREET", tile: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" },
                    { name: "SAT", tile: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" },
                    { name: "HYBRID", tile: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" },
                    { name: "TERRAIN", tile: "https://mt1.google.com/vt/lyrs=t&x={x}&y={y}&z={z}" }
                  ].map(style => (
                    <button
                      key={style.name}
                      type="button"
                      onClick={() => setTileLayerUrl(style.tile)}
                      className={`px-1.5 py-0.5 rounded font-extrabold transition-all cursor-pointer ${tileLayerUrl === style.tile ? "bg-brand-cyan text-slate-950 font-black" : "bg-slate-950 text-gray-400 hover:text-white hover:bg-slate-800 border border-slate-850"}`}
                    >
                      {style.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Float Map Quick Tips (Minimised Mode Only) */}
              {!isFullScreen && (
                <div className="absolute bottom-3 left-3 bg-slate-900/90 border border-slate-800 rounded px-2 py-1 z-[1000] font-mono text-[9.5px] text-gray-400 shadow pointer-events-none">
                  Sequence Numbers (1, 2, 3...) indicate Chronological Trajectory Fixes.
                </div>
              )}

              {/* Fullscreen Chronological slider widget overlay */}
              {isFullScreen && timelineEntries.length > 0 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[9999] bg-slate-900/95 border border-slate-800 p-3 rounded-lg shadow-2xl flex items-center gap-3 font-mono text-xs w-full max-w-xl">
                  <span className="text-gray-400 text-[10px] uppercase font-bold shrink-0">Chronology slider:</span>
                  <input
                    type="range"
                    min={0}
                    max={timelineEntries.length - 1}
                    value={animationStep}
                    onChange={e => {
                      setIsPlaying(false);
                      setAnimationStep(parseInt(e.target.value));
                    }}
                    className="flex-1 accent-brand-cyan h-1.5 bg-slate-950 rounded-lg cursor-pointer"
                  />
                  <div className="shrink-0 text-right text-[10px] bg-slate-950 px-2.5 py-1 rounded font-bold border border-slate-850">
                    Fix {animationStep + 1} / {timelineEntries.length} | <span className="text-brand-green font-bold">{timelineEntries[animationStep].profile.name.split(" ")[0]}</span> <span className="text-brand-cyan font-bold">{timelineEntries[animationStep].fix.time}</span>
                  </div>
                </div>
              )}

              {/* Floating Maximize Control Trigger */}
              {!isFullScreen && (
                <button
                  onClick={() => setIsFullScreen(true)}
                  className="absolute bottom-3 right-3 z-[1000] bg-slate-900 border border-slate-800 text-brand-cyan font-bold py-1.5 px-3 rounded hover:bg-slate-800 hover:text-white text-[10px] uppercase font-mono shadow-2xl flex items-center gap-1.5 cursor-pointer leading-none transition-all active:scale-95"
                >
                  <Compass className="w-3.5 h-3.5 text-brand-cyan animate-spin" /> Maximize GIS View
                </button>
              )}
            </div>

            {/* Playback Simulation Control Bar */}
            <div className="bg-slate-950/90 border-t border-slate-800/80 p-3 flex flex-wrap items-center justify-between gap-3 font-mono text-xs z-20">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className={`px-3 py-1.5 rounded font-bold flex items-center gap-1.5 transition-all cursor-pointer ${isPlaying ? "bg-red-600 hover:bg-red-500 text-white" : "bg-brand-cyan hover:bg-brand-cyan/85 text-slate-950"}`}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {isPlaying ? "PAUSE FEED" : "PLAY MOVEMENT"}
                </button>
                <button
                  type="button"
                  onClick={handleResetAnimation}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-gray-300 cursor-pointer transition-colors"
                  title="Reset Playback Animation"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {/* Playback Mode Toggles */}
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">Mode:</span>
                <div className="flex bg-[#020612] rounded border border-slate-800 p-0.5 gap-0.5" title="Movement Playback Mode">
                  <button
                    key="uniform"
                    type="button"
                    onClick={() => setPlayMode("uniform")}
                    className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold transition-all cursor-pointer ${playMode === "uniform" ? "bg-brand-cyan text-slate-950 font-black" : "text-slate-400 hover:text-white"}`}
                    title="Continuous uniform sequence movement"
                  >
                    UNIFORM
                  </button>
                  <button
                    key="proportional"
                    type="button"
                    onClick={() => setPlayMode("proportional")}
                    className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold transition-all cursor-pointer ${playMode === "proportional" ? "bg-brand-cyan text-slate-950 font-black" : "text-slate-400 hover:text-white"}`}
                    title="Real-time chronological delay based on tower logs"
                  >
                    TIME LOGS
                  </button>
                </div>
              </div>

               {/* Playback Speed Multipliers */}
               {playMode === "uniform" && (
                 <div className="flex items-center gap-1.5 bg-[#020612] border border-slate-850 rounded px-2 py-0.5" title="Set Car Speed in km/h manually">
                   <span className="text-[10px] uppercase font-bold text-gray-400 font-sans">Speed:</span>
                   <input
                     type="number"
                     min={10}
                     max={250}
                     step={10}
                     value={uniformSpeedKmH}
                     onChange={e => setUniformSpeedKmH(Math.max(1, parseInt(e.target.value) || 60))}
                     className="w-12 bg-slate-900 border border-slate-750 text-brand-cyan text-right rounded px-1 text-[10px] font-sans font-extrabold focus:outline-none focus:border-brand-cyan"
                   />
                   <span className="text-[9px] text-gray-500 font-sans">km/h</span>
                 </div>
               )}

               <div className="flex items-center gap-1.5">
                 <span className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">Mult:</span>
                 {[1, 2, 4].map(speed => (
                   <button
                     key={speed}
                     type="button"
                     onClick={() => setAnimationSpeed(speed)}
                     className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border transition-all cursor-pointer ${animationSpeed === speed ? "bg-brand-cyan border-brand-cyan text-slate-950" : "bg-slate-900 border-slate-800 text-gray-400 hover:text-white"}`}
                   >
                     {speed}x
                   </button>
                 ))}
               </div>

              {/* Timeline Progress Scrubber */}
              {timelineEntries.length > 0 && (
                <div className="flex-1 min-w-[150px] flex items-center gap-2">
                  <span className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">Step:</span>
                  <input
                    type="range"
                    min={0}
                    max={timelineEntries.length - 1}
                    value={animationStep}
                    onChange={e => {
                      setIsPlaying(false);
                      setAnimationStep(parseInt(e.target.value));
                    }}
                    className="flex-1 accent-brand-cyan h-1.5 bg-slate-900 rounded-lg cursor-pointer"
                  />
                  <span className="text-gray-300 text-[10.5px] w-12 text-right font-bold">
                    {animationStep + 1} / {timelineEntries.length}
                  </span>
                </div>
              )}

              {/* Active Animated Spot Indicator */}
              {timelineEntries.length > 0 && timelineEntries[animationStep] && (
                <div className="text-right text-[11px] bg-[#070b14] border border-slate-800/80 rounded px-2.5 py-1">
                  <span className="text-brand-green font-bold">{timelineEntries[animationStep].profile.name.split(" ")[0]}</span>
                  <span className="text-gray-500 mx-1.5">|</span>
                  <span className="text-gray-300 font-sans">{timelineEntries[animationStep].fix.date}</span>
                  <span className="text-gray-500 mx-1.5">|</span>
                  <span className="text-brand-cyan font-bold">{timelineEntries[animationStep].fix.time}</span>
                </div>
              )}
            </div>
          </div>

          {/* ADVANCED CLOUD SYNC & AI CO-LOCATION ROUTING PANELS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* PANEL A: QUICK MANUAL GPS INSERTION & DB CLOUD PERSISTENCE */}
            <div className="bg-[#030712]/50 border border-slate-800 rounded-xl p-4 space-y-4 flex flex-col">
              <span className="text-[10px] text-brand-cyan font-bold uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-850 pb-1.5 shrink-0">
                <Database className="w-4 h-4 text-brand-cyan shrink-0" /> Cloud Sync & Manual Coordinates Plotter
              </span>

              {/* Db synchronization toolbar buttons */}
              <div className="bg-[#040810]/60 border border-slate-850 p-2.5 rounded-lg space-y-2 font-sans">
                <div className="text-[10px] text-gray-400 leading-normal mb-1.5">
                  Synchronize active tracking profiles, labels, and telemetry directories securely with the live Firestore Cloud database.
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={loadProfilesFromFirebase}
                    disabled={dbLoading}
                    className="flex-1 min-w-[124px] bg-slate-850 hover:bg-slate-750 text-white font-bold p-1.5 rounded text-[10.5px] border border-slate-700 flex items-center justify-center gap-1 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {dbLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-cyan" /> : <Database className="w-3.5 h-3.5 text-brand-cyan" />}
                    Load Cloud Profiles
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedProfileId) {
                        alert("Select a suspect from the profile console first!");
                        return;
                      }
                      saveProfileToFirebase(selectedProfileId);
                    }}
                    disabled={dbSaving || !selectedProfileId}
                    className="flex-1 min-w-[124px] bg-brand-cyan hover:bg-cyan-300 text-slate-950 font-bold p-1.5 rounded text-[10.5px] flex items-center justify-center gap-1 cursor-pointer transition-all disabled:opacity-50"
                    title="Push current active profile coordinates and details to Firebase database"
                  >
                    {dbSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Sync Selected Target
                  </button>
                </div>
              </div>

              {/* Manual Coordinate Insertion */}
              <div className="space-y-2.5 font-mono text-[11px] pt-1">
                <div className="text-[10px] text-brand-cyan font-bold uppercase tracking-wider">
                  Quick Manual coordinates entry
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-gray-400 text-[9.5px] block mb-0.5">Latitude:</label>
                    <input
                      type="text"
                      placeholder="e.g. 25.6124"
                      value={manualLat}
                      onChange={e => setManualLat(e.target.value)}
                      className="w-full bg-[#040810] border border-gray-850 rounded p-1 text-[10.5px] text-white focus:ring-1 focus:ring-brand-cyan focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-[9.5px] block mb-0.5">Longitude:</label>
                    <input
                      type="text"
                      placeholder="e.g. 85.1412"
                      value={manualLng}
                      onChange={e => setManualLng(e.target.value)}
                      className="w-full bg-[#040810] border border-gray-850 rounded p-1 text-[10.5px] text-white focus:ring-1 focus:ring-brand-cyan focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-gray-400 text-[9.5px] block mb-0.5">Location details / label:</label>
                  <input
                    type="text"
                    placeholder="e.g. Home, Office, Suspect Safehouse, Night Location"
                    value={manualDetails}
                    onChange={e => setManualDetails(e.target.value)}
                    className="w-full bg-[#040810] border border-gray-850 rounded p-1 text-[10.5px] text-white focus:ring-1 focus:ring-brand-cyan focus:outline-none font-sans"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-gray-400 text-[9.5px] block mb-0.5">Date:</label>
                    <input
                      type="date"
                      value={manualDate}
                      onChange={e => setManualDate(e.target.value)}
                      className="w-full bg-[#040810] border border-gray-850 rounded p-1 text-[10px] text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-[9.5px] block mb-0.5">Time:</label>
                    <input
                      type="time"
                      value={manualTime}
                      onChange={e => setManualTime(e.target.value)}
                      className="w-full bg-[#040810] border border-gray-850 rounded p-1 text-[10px] text-white focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  onClick={handleAddManualCoordinate}
                  className="w-full py-1.5 bg-brand-green hover:bg-emerald-400 text-slate-950 font-black rounded text-[10px] flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Interpolate Manual Coordinate
                </button>
              </div>
            </div>

            {/* PANEL B: AI STREET ROUTE TRACING & SAVING ENGINE */}
            <div className="bg-[#030712]/50 border border-slate-800 rounded-xl p-4 space-y-4 flex flex-col">
              <span className="text-[10px] text-brand-cyan font-bold uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-850 pb-1.5 shrink-0">
                <Sparkles className="w-4 h-4 text-brand-cyan shrink-0 animate-pulse" /> AI Road & Street routing Engine (Gemini)
              </span>

              <div className="text-[10px] text-gray-400 leading-normal font-sans">
                Analyze plotted signal tower locations through the server-side Gemini AI. It will snap positions onto actual roadways, generating a smooth vector path representing driving turns on real city streets.
              </div>

              <div className="space-y-3 font-mono text-[11px] flex-1 flex flex-col">
                <div>
                  <label className="text-gray-400 text-[9.5px] block mb-0.5">Route Profile Custom Name:</label>
                  <input
                    type="text"
                    placeholder="e.g. Evening Escape Route, Commute Path"
                    value={customRouteName}
                    onChange={e => setCustomRouteName(e.target.value)}
                    className="w-full bg-[#040810] border border-gray-850 rounded p-1 text-[10.5px] text-white focus:outline-none focus:ring-1 focus:ring-brand-cyan font-sans"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleTraceRouteWithAI}
                    disabled={aiTracingLoading || !selectedProfileId}
                    className="flex-1 py-1.5 bg-[#4f46e5] hover:bg-indigo-500 text-white font-black rounded text-[10.5px] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all"
                  >
                    {aiTracingLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-yellow-300 animate-pulse" />
                    )}
                    Trace Route using AI
                  </button>

                  {activeTracedRoute && (
                    <button
                      onClick={() => {
                        saveRouteToFirebase(activeTracedRoute);
                      }}
                      disabled={dbSaving}
                      className="px-3 bg-brand-cyan hover:bg-cyan-300 text-slate-950 font-bold rounded text-[10.5px] flex items-center gap-1 cursor-pointer transition-all"
                      title="Save AI-Traced route segment to Cloud database"
                    >
                      <Save className="w-3.5 h-3.5" /> Save Route
                    </button>
                  )}
                </div>

                {/* Render active AI traced route analysis summary details */}
                {activeTracedRoute && (
                  <div className="bg-slate-950/80 border border-cyan-900/35 p-3 rounded-lg text-left space-y-1.5 mt-1 animate-fade-in flex-1">
                    <div className="text-[10px] text-brand-cyan font-black flex items-center justify-between">
                      <span>✓ AI ROUTE RESOLVED</span>
                      <button
                        onClick={() => setActiveTracedRoute(null)}
                        className="text-[9px] text-gray-500 hover:text-white underline"
                      >
                        Clear Route Overlay
                      </button>
                    </div>
                    <div className="font-sans text-[10.5px] text-gray-200 leading-relaxed max-h-[80px] overflow-y-auto">
                      {activeTracedRoute.summaryText}
                    </div>
                    <div className="text-[9.5px] text-gray-400 font-mono">
                      Plotted Nodes: <span className="text-white font-bold">{activeTracedRoute.routePoints.length} street-snaps</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* CHRONOLOGICAL MULTI-TARGET FEED TIMELINE BLOCK */}
          <div className="bg-[#030712]/50 border border-slate-800 rounded-xl p-4 space-y-4">
            
            {/* Header timeline metrics */}
            <div className="border-b border-gray-850/80 pb-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="space-y-0.5">
                <span className="text-[10px] text-brand-cyan font-bold uppercase tracking-widest block">
                  Chronological Suspect Trajectory timeline ledger
                </span>
                <p className="text-[10px] text-gray-400 font-sans leading-none">
                  Consolidated GPS sequence listings derived recursively.
                </p>
              </div>

              {/* Timeline segment selection filter */}
              <div className="flex items-center gap-1.5 font-mono text-[10.5px]">
                <span className="text-gray-400">Target Segment Filter:</span>
                <select
                  value={timelineFilter}
                  onChange={e => setTimelineFilter(e.target.value)}
                  className="bg-[#070b14] border border-gray-800 text-gray-100 rounded px-2 py-0.5"
                >
                  <option value="all">Display All Sequences</option>
                  {profilesArray.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Log Entries Chronology Feed Scroller */}
            {timelineEntries.length === 0 ? (
              <div className="p-8 text-center bg-[#040810]/30 border border-transparent rounded-lg text-gray-500 font-mono text-xs italic">
                No telemetry locations resolved yet or match selection index. Use Ingestion Parser to upload track CDR telemetry.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {timelineEntries.map((entry, index) => {
                  const locColor = entry.profile.markerColor || "#10b981";
                  return (
                    <div 
                      key={entry.fix.id} 
                      className="group flex gap-3 text-xs leading-normal bg-[#040810]/40 hover:bg-slate-900/40 p-2.5 rounded-lg border border-gray-850/50 transition-all font-mono"
                    >
                      {/* Left color chron lock circle */}
                      <div className="flex flex-col items-center shrink-0">
                        <span 
                          className="w-5 h-5 rounded-full flex items-center justify-center text-white/90 text-[9.5px] font-extrabold shadow"
                          style={{ backgroundColor: locColor }}
                        >
                          {entry.index + 1}
                        </span>
                        {index < timelineEntries.length - 1 && (
                          <div className="w-0.5 flex-1 bg-slate-800 mt-1" />
                        )}
                      </div>

                      {/* Right Detail parameters */}
                      <div className="flex-1 space-y-1 text-left">
                        <div className="flex flex-wrap justify-between items-center gap-2">
                          <div className="flex items-center gap-2">
                            <strong style={{ color: locColor }}>{entry.profile.name}</strong>
                            <span className="text-[9.5px] text-gray-400 bg-slate-900 border border-gray-800 px-1 py-0.2 rounded font-sans">
                              Case: {entry.profile.caseNumber}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-gray-400 text-[10px]">
                            <span className="flex items-center gap-1 text-brand-green">
                              <Calendar className="w-3 h-3" /> {entry.fix.date}
                            </span>
                            <span className="flex items-center gap-1 text-brand-yellow">
                              <Clock className="w-3 h-3" /> {entry.fix.time}
                            </span>
                            {/* Individual Delete Fix button */}
                            <button
                              onClick={() => handleDeleteLocationFix(entry.profile.id, entry.fix.id)}
                              className="p-1 rounded text-gray-550 hover:text-red-400 hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
                              title="Delete this coordinate fix"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-gray-300 text-[10.5px]">
                          <span className="bg-slate-900 font-bold border border-gray-850 rounded px-1.5 py-0.5 text-ellipsis overflow-hidden">
                            Fix Track Lat/Lng: {entry.fix.lat.toFixed(6)}, {entry.fix.lng.toFixed(6)}
                          </span>
                        </div>

                        {/* Inline Label/Details editor */}
                        <div className="flex items-center gap-1.5 mt-1 bg-[#02050c]/80 border border-slate-900 rounded p-1">
                          <span className="text-[9.5px] text-gray-500 font-bold uppercase tracking-wider shrink-0 font-sans">Label / Details:</span>
                          <input
                            type="text"
                            placeholder="e.g. Home, Office, Suspect's Safehouse, Night Location..."
                            value={entry.fix.details || ""}
                            onChange={(e) => handleUpdateCoordinateDetails(entry.profile.id, entry.fix.id, e.target.value)}
                            className="flex-1 bg-slate-950/80 border border-slate-800 rounded px-2 py-0.5 text-[10.5px] text-brand-cyan focus:outline-none focus:border-cyan-400 font-mono"
                          />
                        </div>

                        <div className="text-[10px] text-gray-500 italic bg-slate-950/40 p-1.5 rounded border border-slate-900/50 mt-1 truncate group-hover:text-gray-400" title={entry.fix.rawSnippet}>
                          Raw Text CDR Source Snippet: "{entry.fix.rawSnippet}"
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
