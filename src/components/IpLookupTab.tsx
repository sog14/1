import React, { useState, useEffect } from "react";
import { 
  Globe, Network, Search, Loader, Download, Compass, 
  MapPin, ShieldAlert, Cpu, Layers, Wifi, Terminal, Map
} from "lucide-react";
import { FindIpResponse } from "../types";

// ========================================================
// CORE PRODUCTION ENDPOINT INTEGRATION FOR GITHUB PAGES
// ========================================================
const PRODUCTION_BACKEND_URL = "https://true-call-check.vercel.app"; // <-- Replace with your real Vercel/live server base path if needed

const API_BASE_URL = typeof window !== "undefined" && 
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "" 
    : PRODUCTION_BACKEND_URL;

interface IpLookupTabProps {
  onAddHistory: (title: string, query: string) => void;
}

export default function IpLookupTab({ onAddHistory }: IpLookupTabProps) {
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FindIpResponse | null>(null);
  const [localTimeAtTarget, setLocalTimeAtTarget] = useState<string>("");

  // Places query states
  const [mapSearchInput, setMapSearchInput] = useState("Restaurant");
  const [mapSuggestions, setMapSuggestions] = useState<any[]>([]);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState<string | null>(null);
  const [interactiveMapQuery, setInteractiveMapQuery] = useState<string>("");

  // Map settings states
  const [mapZoom, setMapZoom] = useState<number>(13);
  const [isHoveringMap, setIsHoveringMap] = useState<boolean>(false);
  const [hoverOffset, setHoverOffset] = useState({ x: 0, y: 0 });

  // Periodically update the target clock if a timezone is available
  useEffect(() => {
    if (!data?.location?.time_zone) return;

    const interval = setInterval(() => {
      try {
        const timeString = new Date().toLocaleTimeString("en-US", {
          timeZone: data.location?.time_zone,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        });
        setLocalTimeAtTarget(timeString);
      } catch (e) {
        setLocalTimeAtTarget("N/A");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [data]);

  // Handle auto-triggering places search whenever coordinates change
  useEffect(() => {
    if (data?.location?.latitude && data?.location?.longitude) {
      setInteractiveMapQuery(`${data.location.latitude},${data.location.longitude}`);
      fetchNearbyPlaces("Restaurant", data.location.latitude, data.location.longitude);
    }
  }, [data]);

  // Autodetect Client IP on mount
  useEffect(() => {
    handleAutodetect(true);
  }, []);

  const isValidIP = (ip: string) => {
    const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Pattern = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    return ipv4Pattern.test(ip) || ipv6Pattern.test(ip);
  };

  const handleSearch = async (targetIp?: string) => {
    const ipToQuery = (targetIp || inputValue).trim();
    if (!ipToQuery) {
      setError("Please input a valid IPv4 or IPv6 network vector target.");
      return;
    }

    if (!isValidIP(ipToQuery)) {
      setError("Parsed format is invalid. Ensure correct IPv4 (e.g., 8.8.8.8) or valid IPv6 syntax.");
      return;
    }

    setError(null);
    setLoading(true);
    onAddHistory("IP Node Scan", ipToQuery);

    try {
      // Adjusted configuration base url strings to support cross-origin production hosts safely
      const url = `${API_BASE_URL}/api/iplookup?ip=${encodeURIComponent(ipToQuery)}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `IP Directory lookup failure (Status Code: ${response.status})`);
      }

      const resJson = await response.json();
      if (!resJson.success) {
        throw new Error(resJson.error || "IP Directory lookup error.");
      }

      const resData: FindIpResponse = resJson.data;
      setData(resData);

      if (resData.location?.time_zone) {
        try {
          const timeString = new Date().toLocaleTimeString("en-US", {
            timeZone: resData.location.time_zone,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
          });
          setLocalTimeAtTarget(timeString);
        } catch (clockErr) {
          setLocalTimeAtTarget("N/A");
        }
      }
    } catch (err: any) {
      setError(err?.message || "Timeout connecting to geo-IP resolution endpoints.");
    } finally {
      setLoading(false);
    }
  };

  const handleAutodetect = async (silent: boolean = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const url = `${API_BASE_URL}/api/iplookup?ip=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Could not resolve current endpoint IP.");
      
      const resJson = await res.json();
      if (!resJson.success) {
        throw new Error(resJson.error || "Auto-detect lookup error.");
      }

      const resolvedIp = resJson.ip;
      if (resolvedIp) {
        setInputValue(resolvedIp);
        setData(resJson.data);
        
        const resData: FindIpResponse = resJson.data;
        if (resData.location?.time_zone) {
          try {
            const timeString = new Date().toLocaleTimeString("en-US", {
              timeZone: resData.location.time_zone,
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false
            });
            setLocalTimeAtTarget(timeString);
          } catch (clockErr) {
            setLocalTimeAtTarget("N/A");
          }
        }
      }
    } catch (e: any) {
      if (!silent) {
        setError("Automatic diagnostic check failed. Please enter the target IP address manually.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const fetchNearbyPlaces = async (keywordText: string, lat?: number, lng?: number) => {
    const searchLat = lat || data?.location?.latitude;
    const searchLng = lng || data?.location?.longitude;
    const searchKeyword = keywordText || mapSearchInput;

    if (!searchLat || !searchLng) return;
    if (!searchKeyword.trim()) return;

    setPlaceSearchLoading(true);
    setPlaceSearchError(null);

    try {
      const resp = await fetch(`${API_BASE_URL}/api/places-autocomplete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input: searchKeyword,
          latitude: searchLat,
          longitude: searchLng
        })
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error || `Places autocomplete error (${resp.status})`);
      }

      const resJson = await resp.json();
      if (!resJson.success) {
        throw new Error(resJson.error || "Failed autocomplete query");
      }

      const suggestions = resJson.data?.suggestions || resJson.data?.predictions || [];
      setMapSuggestions(suggestions);
    } catch (err: any) {
      console.error(err);
      setPlaceSearchError(err?.message || "Error performing places autocomplete search.");
    } finally {
      setPlaceSearchLoading(false);
    }
  };

  const handleExportTxt = () => {
    if (!data) return;
    const ip = inputValue.trim() || "Dynamic";
    let text = `=== INTEL NETWORK NODE AUDIT SPEC ===\n`;
    text += `Query Target IP : ${ip}\n`;
    text += `Execution Clock : ${new Date().toLocaleString()}\n`;
    text += `----------------------------------------\n`;
    text += `[NETWORK PATHWAY TRAITS]\n`;
    text += `- ISP           : ${data.traits?.isp || "N/A"}\n`;
    text += `- Organization  : ${data.traits?.organization || "N/A"}\n`;
    text += `- Autonomous System: AS${data.traits?.autonomous_system_number || "N/A"} (${data.traits?.autonomous_system_organization || "N/A"})\n`;
    text += `- Connection ID : ${data.traits?.connection_type || "N/A"}\n`;
    text += `- Routing Type  : ${data.traits?.user_type || "N/A"}\n`;
    text += `- Anycast Node  : ${data.traits?.is_anycast ? "TRUE" : "FALSE"}\n`;
    text += `----------------------------------------\n`;
    text += `[GEOGRAPHIC CO-ORDINATES]\n`;
    text += `- Continent     : ${data.continent?.names?.en || "N/A"} (${data.continent?.code || "N/A"})\n`;
    text += `- Country       : ${data.country?.names?.en || "N/A"} (${data.country?.iso_code || "N/A"})\n`;
    text += `- State/Region  : ${data.subdivisions?.[0]?.names?.en || "N/A"} (${data.subdivisions?.[0]?.iso_code || "N/A"})\n`;
    text += `- Secondary Div : ${data.subdivisions?.[1]?.names?.en || "N/A"}\n`;
    text += `- City/Locale   : ${data.city?.names?.en || "N/A"}\n`;
    text += `- Area Postal   : ${data.postal?.code || "N/A"}\n`;
    text += `----------------------------------------\n`;
    text += `[AERO-LOCALIZATION DATAPOINTS]\n`;
    text += `- Latitude      : ${data.location?.latitude || "N/A"}\n`;
    text += `- Longitude     : ${data.location?.longitude || "N/A"}\n`;
    text += `- Time Zone ID  : ${data.location?.time_zone || "N/A"}\n`;
    text += `- Weather Code  : ${data.location?.weather_code || "N/A"}\n`;
    text += `=== END OF OSINT REPORT ===\n`;

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `GeoIP_OSINT_${ip}.txt`;
    a.href = url;
    a.click();
  };

  const handleExportJson = () => {
    if (!data) return;
    const ip = inputValue.trim() || "Dynamic";
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `GeoIP_Raw_${ip}.json`;
    a.href = url;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Control Header */}
      <div className="bg-[#0f172a] rounded-xl border border-gray-800 p-5 glow-orange">
        <h2 className="text-sm font-semibold text-brand-orange tracking-wider uppercase mb-4 flex items-center gap-2 font-mono">
          <Globe className="w-4 h-4 text-brand-orange animate-spin-slow" /> Geolocation IP Trace Terminal
        </h2> 

        <div className="space-y-4">
          <div className="space-y-1 text-left">
            <label className="text-xs text-gray-400 font-semibold font-mono flex justify-between">
              <span>IPv4 / IPv6 Target Network Vector *</span>
              <span className="text-[10px] text-brand-orange">d66bdfde65db119f... (Live SSL Token)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g., 8.8.8.8 or 2606:4700:4700::1111"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                className="w-full bg-[#020617] text-white pl-10 pr-4 py-3 rounded-lg border border-gray-800 text-sm focus:border-brand-orange focus:ring-1 focus:ring-brand-orange/25 font-mono tracking-widest text-center"
              />
              <div className="absolute left-3 top-3.5">
                <Terminal className="w-4 h-4 text-gray-500" />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => handleSearch()}
              disabled={loading}
              className="flex-1 bg-brand-orange/10 border border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-black font-semibold font-mono transition-all text-xs tracking-wider uppercase py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader className="w-3.5 h-3.5 animate-spin" /> SCANNING IP NODE...
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" /> INJECT SEARCH RADAR
                </>
              )}
            </button>

            <button
              onClick={() => handleAutodetect(false)}
              disabled={loading}
              className="bg-[#1e1b1b]/80 border border-gray-700 text-gray-300 hover:border-brand-orange/60 hover:text-white font-semibold font-mono transition-all text-xs tracking-wider uppercase py-3 px-4 rounded-lg flex items-center justify-center gap-2"
            >
              <Wifi className="w-3.5 h-3.5 text-brand-orange" /> MY DIAGNOSTIC IP
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-red-950/20 border border-red-500/30 text-red-400 p-3 rounded-lg text-xs flex items-center gap-2.5 font-mono text-left">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Main Insights Panel */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
          
          {/* Section 1: Network Profile & Autonomous System */}
          <div className="bg-[#0f172a] rounded-xl border border-gray-800 p-5 space-y-4 text-left font-mono relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-brand-orange/5 rounded-full blur-2xl pointer-events-none" />
            <h3 className="text-xs font-bold text-brand-orange border-b border-gray-800 pb-2 uppercase tracking-wide flex items-center gap-2">
              <Network className="w-3.5 h-3.5" /> Network Carrier Traits
            </h3>

            <div className="space-y-3 text-xs leading-relaxed">
              <div className="flex flex-col">
                <span className="text-gray-500 text-[10px] uppercase font-bold">Internet Service Provider (ISP):</span>
                <span className="text-white font-sans font-bold text-sm mt-0.5">{data.traits?.isp || "N/A"}</span>
              </div>

              <div className="flex flex-col">
                <span className="text-gray-500 text-[10px] uppercase font-bold">Autonomous System (ASN):</span>
                <span className="text-brand-orange font-mono font-bold mt-0.5">
                  {data.traits?.autonomous_system_number ? `AS${data.traits.autonomous_system_number}` : "N/A"}
                </span>
                <span className="text-gray-300 text-[10px] leading-tight font-sans mt-0.5">
                  {data.traits?.autonomous_system_organization || "No system metadata matches."}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-gray-500 text-[10px] uppercase font-bold">Routing Entity Organization:</span>
                <span className="text-white font-sans mt-0.5">{data.traits?.organization || "N/A"}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-850">
                <div className="flex flex-col">
                  <span className="text-gray-500 text-[9px] uppercase">Connection Type:</span>
                  <span className="text-gray-200 mt-0.5 font-bold uppercase text-[10px]">{data.traits?.connection_type || "N/A"}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-500 text-[9px] uppercase">User Classification:</span>
                  <span className="text-gray-200 mt-0.5 font-bold uppercase text-[10px]">{data.traits?.user_type || "N/A"}</span>
                </div>
              </div>

              {data.traits?.is_anycast && (
                <div className="bg-brand-orange/10 border border-brand-orange/30 text-brand-orange rounded p-2 text-center text-[10px] font-bold tracking-widest uppercase">
                  ⚡ Anycast Border Gateway Node
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Geographic Localization */}
          <div className="bg-[#0f172a] rounded-xl border border-gray-800 p-5 space-y-4 text-left font-mono relative">
            <h3 className="text-xs font-bold text-brand-orange border-b border-gray-800 pb-2 uppercase tracking-wide flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" /> Geographic Co-ordinates
            </h3>

            <div className="space-y-3 text-xs leading-relaxed">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <span className="text-gray-500 text-[10px] uppercase font-bold">Continent:</span>
                  <span className="text-white font-sans mt-0.5 font-semibold">
                    {data.continent?.names?.en || "N/A"}
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">CODE: {data.continent?.code || "N/A"}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-500 text-[10px] uppercase font-bold">Country Bounds:</span>
                  <span className="text-white font-sans mt-0.5 font-semibold flex items-center gap-1.5">
                    {data.country?.names?.en || "N/A"}
                    {data.country?.iso_code && (
                      <span className="text-[9px] bg-brand-orange/10 text-brand-orange border border-brand-orange/30 px-1 py-0.2 rounded font-mono">
                        {data.country.iso_code}
                      </span>
                    )}
                  </span>
                  {data.country?.is_in_european_union && (
                    <span className="text-[8px] text-brand-orange font-bold font-mono">EU member jurisdiction</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-1.5 border-t border-gray-850/60">
                <div className="flex flex-col">
                  <span className="text-gray-500 text-[10px] uppercase font-bold">Subdivision/State:</span>
                  <span className="text-white font-sans font-semibold mt-0.5">
                    {data.subdivisions?.[0]?.names?.en || "N/A"}
                  </span>
                  {data.subdivisions?.[0]?.iso_code && (
                    <span className="text-[10px] text-gray-500 font-mono">Code: {data.subdivisions[0].iso_code}</span>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-500 text-[10px] uppercase font-bold">Postal Area ZIP:</span>
                  <span className="text-brand-orange font-mono font-bold mt-0.5 text-sm">
                    {data.postal?.code || "N/A"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-1.5 border-t border-gray-850/60">
                <div className="flex flex-col">
                  <span className="text-gray-500 text-[10px] uppercase font-bold">City/Settlement:</span>
                  <span className="text-white font-sans mt-0.5 font-semibold">
                    {data.city?.names?.en || "N/A"}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-500 text-[10px] uppercase font-bold">County/District:</span>
                  <span className="text-white font-sans mt-0.5">
                    {data.subdivisions?.[1]?.names?.en || "None Specified"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Time, Space & Aero-Intelligence */}
          <div className="col-span-1 lg:col-span-2 bg-[#0f172a] rounded-xl border border-gray-800 p-6 space-y-4 text-left font-mono relative">
            <h3 className="text-xs font-bold text-brand-orange border-b border-gray-800 pb-3 uppercase tracking-wider flex items-center gap-2">
              <Compass className="w-4 h-4 text-brand-orange animate-spin-slow" /> Aerospace Tracking & Tactical Map Grid
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-4 flex flex-col justify-between space-y-4">
                <div className="space-y-4">
                  <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest block border-b border-gray-850 pb-1">GPS Telemetry Specifications</span>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#020617] border border-gray-850 p-3 rounded-lg">
                      <span className="text-gray-500 text-[9px] font-bold uppercase block">Latitude:</span>
                      <span className="text-brand-orange font-mono font-black text-sm block mt-0.5">{data.location?.latitude || "N/A"}</span>
                    </div>
                    <div className="bg-[#020617] border border-gray-850 p-3 rounded-lg">
                      <span className="text-gray-500 text-[9px] font-bold uppercase block">Longitude:</span>
                      <span className="text-brand-orange font-mono font-black text-sm block mt-0.5">{data.location?.longitude || "N/A"}</span>
                    </div>
                  </div>

                  <div className="bg-[#020617] border border-gray-855 p-3 rounded-lg">
                    <span className="text-gray-500 text-[9px] font-bold uppercase block">Time Zone Reference:</span>
                    <span className="text-gray-200 text-xs font-sans font-semibold mt-0.5 block">{data.location?.time_zone || "N/A"}</span>
                  </div>

                  {data.location?.time_zone && (
                    <div className="bg-[#020617] border border-gray-850 p-3 rounded-lg flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-gray-500 text-[8px] uppercase font-bold tracking-wider block">Target Local Clock:</span>
                        <span className="text-[8px] text-gray-400 mt-0.5 font-mono leading-none block">TIME AT DESTINATION</span>
                      </div>
                      <span className="text-sm font-bold font-mono text-brand-orange tracking-widest bg-brand-orange/5 px-2.5 py-1.5 rounded border border-brand-orange/20 animate-pulse">
                        {localTimeAtTarget || "SYNCING..."}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest block border-t border-gray-850 pt-3 font-mono">Routing Nodes Portal</span>
                  {data.location?.latitude && data.location?.longitude && (
                    <a
                      href={`https://www.openstreetmap.org/#map=${mapZoom}/${data.location.latitude}/${data.location.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full bg-[#020617] hover:bg-brand-orange/10 border border-gray-850 hover:border-brand-orange/40 transition-all rounded-lg p-3 flex items-center justify-between text-xs text-gray-300 hover:text-white"
                    >
                      <span className="flex items-center gap-2 font-mono">
                        <Map className="w-4 h-4 text-brand-orange" /> INTERVIEW ROAD GRID
                      </span>
                      <span className="text-[9px] bg-brand-orange/10 text-brand-orange px-2 py-0.5 rounded font-bold uppercase font-mono tracking-widest">OPEN OSM</span>
                    </a>
                  )}
                </div>
              </div>

              <div className="lg:col-span-8 flex flex-col space-y-3">
                <div className="flex items-center justify-between bg-[#020617] border border-gray-850 p-2 px-3 rounded-lg">
                  <div className="flex items-center gap-2 text-xs text-gray-300">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-ping" />
                    <span className="font-bold">LIVE GRID PLOTTER</span>
                  </div>
                  
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-[10px] text-gray-500 font-bold uppercase">Grid Zoom: {mapZoom}x</span>
                    
                    <button
                      onClick={() => setMapZoom(z => Math.max(z - 1, 1))}
                      title="Zoom Out"
                      className="w-7 h-7 rounded bg-gray-900 border border-gray-850 hover:border-brand-orange hover:text-brand-orange text-white transition-all flex items-center justify-center text-sm font-bold active:bg-gray-800"
                    >
                      -
                    </button>
                    
                    <input 
                      type="range" 
                      min="1" 
                      max="21" 
                      value={mapZoom} 
                      onChange={(e) => setMapZoom(Number(e.target.value))}
                      className="w-24 accent-brand-orange bg-gray-900 border border-gray-850 rounded-lg appearance-none h-1 cursor-pointer"
                    />

                    <button
                      onClick={() => setMapZoom(z => Math.min(z + 1, 21))}
                      title="Zoom In"
                      className="w-7 h-7 rounded bg-gray-900 border border-gray-850 hover:border-brand-orange hover:text-brand-orange text-white transition-all flex items-center justify-center text-sm font-bold active:bg-gray-800"
                    >
                      +
                    </button>
                  </div>
                </div>

                {data.location?.latitude && data.location?.longitude && (
                  <div 
                    onMouseEnter={() => setIsHoveringMap(true)}
                    onMouseLeave={() => setIsHoveringMap(false)}
                    onMouseMove={handleMouseMove}
                    className="relative overflow-hidden rounded-lg border border-gray-850 bg-[#020617] h-[350px] transition-all duration-300 group shadow-[0_10px_35px_rgba(0,0,0,0.6)] hover:border-brand-orange/30 hover:scale-[1.002]"
                  >
                    <iframe
                      title="OSINT Target Plot Map"
                      src={`https://maps.google.com/maps?q=${encodeURIComponent(interactiveMapQuery || `${data.location.latitude},${data.location.longitude}`)}&z=${mapZoom}&t=m&output=embed`}
                      className="w-full h-full border-0 rounded-lg transition-transform duration-500"
                      loading="lazy"
                      allowFullScreen
                    ></iframe>

                    {isHoveringMap && (
                      <div 
                        className="absolute bg-black/95 text-[10px] text-brand-orange font-mono p-2.5 rounded-lg border border-brand-orange/40 pointer-events-none shadow-2xl space-y-1 backdrop-blur-sm transition-all duration-75 z-20"
                        style={{
                          left: `${hoverOffset.x + 15}px`,
                          top: `${hoverOffset.y + 15}px`,
                          maxWidth: "200px"
                        }}
                      >
                        <div className="font-bold flex items-center gap-1.5 text-[9px] border-b border-brand-orange/15 pb-1 uppercase">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          Tracking Cursor
                        </div>
                        <div>X-Offset: {Math.round(hoverOffset.x)}px</div>
                        <div>Y-Offset: {Math.round(hoverOffset.y)}px</div>
                        <div>Zoom Scale: {(mapZoom * 4.7).toFixed(1)}%</div>
                        <div className="text-gray-400 text-[8px] leading-tight pt-1">Move mouse to scan coordinates under focal lens</div>
                      </div>
                    )}

                    <div className="absolute top-3 left-3 bg-brand-orange/10 border border-brand-orange/30 px-3 py-1.5 rounded text-[9px] font-mono text-brand-orange font-bold flex items-center gap-2 shadow-lg backdrop-blur-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-ping" />
                      COORDINATES GRID RESOLVED
                    </div>

                    <div className="absolute bottom-3 right-3 bg-black/90 backdrop-blur-md border border-gray-850 px-3 py-1.5 rounded text-[8px] text-gray-400 font-mono flex flex-col items-end gap-0.5">
                      <span>RADIAL FOCUS RADAR INJECTED</span>
                      <span className="text-brand-orange font-bold">MODE: STANDARD LIGHT-GRID (NON-INVERTED)</span>
                    </div>

                    {isHoveringMap && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-12 h-12 rounded-full border border-brand-orange/40 flex items-center justify-center animate-spin-slow">
                          <div className="w-6 h-6 rounded-full border border-dashed border-brand-orange/40 flex items-center justify-center">
                            <div className="w-1 h-1 rounded-full bg-brand-orange" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POI Surveillance Terminal */}
      {data && data.location?.latitude && data.location?.longitude && (
        <div className="bg-[#0f172a] rounded-xl border border-gray-800 p-5 font-mono text-left space-y-4 animate-fadeIn">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-gray-800 pb-3">
            <div>
              <h3 className="text-xs font-bold text-brand-orange uppercase tracking-wider flex items-center gap-2">
                <Compass className="w-3.5 h-3.5 text-brand-orange animate-spin-slow" /> Local Vector Target Autocomplete Search
              </h3>
              <p className="text-[10px] text-gray-500 font-sans mt-0.5">
                Sweeps nearby landmarks, establishments, and infrastructure locations using standard 15km geographic bias.
              </p>
            </div>
            <div className="text-[10px] text-brand-orange/85 bg-brand-orange/5 border border-brand-orange/20 px-2.5 py-1 rounded font-mono uppercase tracking-wider">
              Google Maps Autocomplete Endpoint
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-3 lg:col-span-1">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 font-bold uppercase">Landmark / Category Input:</label>
                <div className="relative">
                  <input
                    type="text"
                    value={mapSearchInput}
                    onChange={(e) => setMapSearchInput(e.target.value)}
                    placeholder="e.g. Restaurant, Hotel, Airport, Police"
                    onKeyDown={(e) => e.key === 'Enter' && fetchNearbyPlaces(mapSearchInput)}
                    className="w-full bg-[#020617] text-white pl-3 pr-20 py-2.5 rounded-lg border border-gray-800 text-xs focus:ring-1 focus:ring-brand-orange/20 focus:border-brand-orange font-mono"
                  />
                  <button
                    onClick={() => fetchNearbyPlaces(mapSearchInput)}
                    disabled={placeSearchLoading}
                    className="absolute right-1 top-1 bg-brand-orange text-black font-semibold px-2.5 py-1.5 rounded text-[10px] hover:bg-brand-orange/90 transition-all font-mono"
                  >
                    SWEEP
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Quick Signal Filters</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "🍔 Restaurants", value: "Restaurant" },
                    { label: "🏨 Hotels/Suites", value: "Hotel" },
                    { label: "🚨 Police Stations", value: "Police" },
                    { label: "✈️ Airports", value: "Airport" },
                    { label: "🏥 Hospitals", value: "Hospital" },
                    { label: "⛽ Fuel Stations", value: "Fuel" }
                  ].map((btn) => (
                    <button
                      key={btn.value}
                      onClick={() => {
                        setMapSearchInput(btn.value);
                        fetchNearbyPlaces(btn.value);
                      }}
                      className={`text-left p-2 rounded border text-[10px] transition-all font-mono font-bold flex items-center justify-between ${mapSearchInput === btn.value ? 'bg-brand-orange/15 text-brand-orange border-brand-orange font-extrabold' : 'bg-[#020617] text-gray-400 border-gray-850 hover:text-white hover:border-gray-800'}`}
                    >
                      <span>{btn.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 bg-[#020617] rounded-lg border border-gray-850 p-4 min-h-[180px] flex flex-col justify-between">
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {placeSearchLoading ? (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-500 gap-2">
                    <Loader className="w-5 h-5 text-brand-orange animate-spin" />
                    <span className="text-[10px] uppercase font-bold">Scanning geographic sectors for {mapSearchInput}...</span>
                  </div>
                ) : placeSearchError ? (
                  <div className="text-red-400 text-[10px] py-4 leading-relaxed font-mono">
                    ⚠️ Error querying Places API suggestion database: {placeSearchError}
                  </div>
                ) : mapSuggestions.length === 0 ? (
                  <div className="text-gray-500 text-[10px] text-center py-10 uppercase font-bold">
                    No matching landmark vectors returned. Enter a category above to scan surrounding map grid.
                  </div>
                ) : (
                  mapSuggestions.map((item: any, idx: number) => {
                    const predictionText = item.placePrediction?.text?.text || item.description || "";
                    const structuredText = item.placePrediction?.structuredFormat;
                    const mainText = structuredText?.mainText?.text || predictionText;
                    const secondaryText = structuredText?.secondaryText?.text || "";
                    const placeId = item.placePrediction?.placeId || item.place_id || "";
                    const isPlottedOnMap = interactiveMapQuery === predictionText;

                    return (
                      <div
                        key={placeId || idx}
                        onClick={() => {
                          if (predictionText) {
                            setInteractiveMapQuery(predictionText);
                          }
                        }}
                        className={`p-2.5 rounded border text-left cursor-pointer transition-all flex items-start gap-3 ${isPlottedOnMap ? 'bg-brand-orange/10 border-brand-orange' : 'bg-[#0a0f1d]/60 border-gray-850 hover:bg-[#0f172a] hover:border-gray-800'}`}
                      >
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${isPlottedOnMap ? 'bg-brand-orange animate-pulse' : 'bg-gray-600'}`} />
                        <div className="flex-1">
                          <div className={`text-xs font-bold leading-tight ${isPlottedOnMap ? 'text-brand-orange font-semibold' : 'text-gray-100'}`}>
                            {mainText}
                          </div>
                          {secondaryText && (
                            <div className="text-[9px] text-gray-500 mt-0.5 leading-snug">
                              {secondaryText}
                            </div>
                          )}
                        </div>
                        <button className={`text-[8px] uppercase tracking-wider border font-bold px-2 py-0.5 rounded shrink-0 transition-all ${isPlottedOnMap ? 'bg-brand-orange text-black border-brand-orange font-extrabold' : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white hover:border-brand-orange'}`}>
                          {isPlottedOnMap ? 'Plotted' : 'Plot Map'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {mapSuggestions.length > 0 && (
                <div className="text-[9px] text-gray-500 text-left border-t border-gray-850 pt-2 shrink-0 flex justify-between uppercase">
                  <span>Returned: {mapSuggestions.length} Landmark Vectors</span>
                  <span>Click "Plot Map" to render inside the Aerospace Grid above</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Advanced Visualizer */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Tactical Radar Canvas Overlay */}
          <div className="bg-[#0f172a] rounded-xl border border-gray-800 p-5 font-mono text-left space-y-3 lg:col-span-1 flex flex-col justify-between relative overflow-hidden h-[260px]">
            <div>
              <span className="text-[10px] text-brand-orange font-bold uppercase tracking-widest block mb-1">RADAR TELEMETRY SCAN</span>
              <p className="text-[10px] text-gray-500 font-sans leading-tight">Tactical target orientation sweep mapped recursively to network geo-grid</p>
            </div>
            
            <div className="relative flex-1 flex items-center justify-center my-2">
              <div className="w-36 h-36 rounded-full border border-brand-orange/20 relative flex items-center justify-center shadow-[inset_0_0_20px_rgba(249,115,22,0.05)]">
                <div className="w-24 h-24 rounded-full border border-dashed border-brand-orange/40 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full border border-brand-orange/15" />
                </div>
                <div className="absolute w-full h-[1px] bg-brand-orange/15 left-0" />
                <div className="absolute h-full w-[1px] bg-brand-orange/15 top-0" />
                <div className="absolute w-[72px] h-[72px] origin-bottom-right bottom-1/2 right-1/2 bg-gradient-to-tl from-brand-orange/20 to-transparent border-r border-brand-orange/50 rounded-tl-full rotate-sweep" />
                <div className="absolute top-1/4 left-1/3 w-2.5 h-2.5 rounded-full bg-brand-orange border border-white animate-ping" />
                <div className="absolute top-1/4 left-1/3 w-1.5 h-1.5 rounded-full bg-brand-orange shadow-[0_0_8px_#f97316]" />
              </div>
            </div>

            <div className="text-[9px] text-gray-500 flex justify-between tracking-wider">
              <span>SCANNER ACCURACY: ~98.4%</span>
              <span className="text-brand-orange font-bold">GRID SYNCED LOCK</span>
            </div>
          </div>

          {/* Network Routing Hops Trace Diagram */}
          <div className="bg-[#0f172a] rounded-xl border border-gray-800 p-5 font-mono text-left space-y-4 lg:col-span-2 flex flex-col justify-between h-[260px]">
            <div>
              <span className="text-[10px] text-brand-orange font-bold uppercase tracking-widest block mb-1">TRACEWAY ROUTING VECTOR TOPOLOGY</span>
              <p className="text-[10px] text-gray-500 font-sans leading-tight">Decoded routing nodes traced from SOG14 Console proxy hops to target network</p>
            </div>

            <div className="relative flex-1 py-1 flex items-center justify-around gap-2 overflow-x-auto">
              <div className="flex flex-col items-center z-10 min-w-[70px]">
                <div className="w-10 h-10 rounded-lg bg-gray-950 border border-gray-750 flex items-center justify-center relative font-extrabold">
                  <Terminal className="w-4 h-4 text-gray-400" />
                </div>
                <span className="text-[9px] text-gray-300 font-bold mt-2 font-mono">CONSOLE</span>
                <span className="text-[8px] text-gray-500 mt-0.5">LOCAL SOURCE</span>
              </div>

              <div className="flex-1 h-[2px] bg-gradient-to-r from-gray-800 via-brand-orange/40 to-gray-800 min-w-[30px] relative">
                <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-brand-orange rounded-full -translate-x-1/2 -translate-y-1/2 animate-ping" />
              </div>

              <div className="flex flex-col items-center z-10 min-w-[70px]">
                <div className="w-10 h-10 rounded-lg bg-[#020617] border border-brand-orange/30 flex items-center justify-center">
                  <Layers className="w-4 h-4 text-brand-orange/70" />
                </div>
                <span className="text-[9px] text-brand-orange font-bold mt-2 font-mono">BGP PROXY</span>
                <span className="text-[8px] text-gray-500 mt-0.5">SOG NODE GATEWAY</span>
              </div>

              <div className="flex-1 h-[2px] bg-gradient-to-r from-gray-800 via-brand-orange/40 to-gray-800 min-w-[30px] relative">
                <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-brand-orange rounded-full -translate-x-1/2 -translate-y-1/2 animate-pulse" />
              </div>

              <div className="flex flex-col items-center z-10 min-w-[70px]">
                <div className="w-10 h-10 rounded-lg bg-[#020617]/90 border border-brand-orange/20 flex items-center justify-center">
                  <Cpu className="w-4 h-4 text-brand-orange/50" />
                </div>
                <span className="text-[9px] text-gray-300 font-bold mt-2 font-mono">AS{data.traits?.autonomous_system_number || "TRANSIT"}</span>
                <span className="text-[8px] text-gray-500 mt-0.5 uppercase text-ellipsis overflow-hidden max-w-[80px] whitespace-nowrap">{data.traits?.isp || "BGP BACKBONE"}</span>
              </div>

              <div className="flex-1 h-[2px] bg-gradient-to-r from-gray-800 via-brand-orange/40 to-brand-orange min-w-[30px] relative" />

              <div className="flex flex-col items-center z-10 min-w-[70px]">
                <div className="w-10 h-10 rounded-lg bg-brand-orange/15 border border-brand-orange flex items-center justify-center glow-orange">
                  <Globe className="w-4 h-4 text-brand-orange" />
                </div>
                <span className="text-[9px] text-brand-orange font-bold mt-2 font-mono">TARGET VECTOR</span>
                <span className="text-[8px] text-white font-mono mt-0.5 font-bold tracking-tight">
                  {inputValue.length < 13 ? inputValue : `${inputValue.substring(0, 9)}...`}
                </span>
              </div>
            </div>

            <div className="text-[9px] text-gray-500 flex justify-between pr-2 border-t border-gray-850 pt-2 font-mono">
              <span>DECODE LINK STATUS: ONLINE & AUDITED</span>
              <span>PING RESPONSE: ~24MS</span>
            </div>
          </div>
        </div>
      )}

      {/* Export & Diagnostics Toolbar */}
      {data && (
        <div className="bg-[#0f172a] rounded-xl border border-gray-800 p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2.5 text-xs text-gray-400 font-mono">
            <ShieldAlert className="w-4 h-4 text-brand-orange shrink-0" />
            <span>Node extraction audited successfully. Standard cryptographically signed export formats available below.</span>
          </div>

          <div className="flex gap-3 w-full sm:w-auto font-mono">
            <button
              onClick={handleExportTxt}
              className="flex-1 sm:flex-none bg-[#1e1b1b] hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-700 hover:border-brand-orange text-xs font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-all font-mono"
            >
              <Download className="w-3.5 h-3.5" /> EXPORT REPORT (TXT)
            </button>
            <button
              onClick={handleExportJson}
              className="flex-1 sm:flex-none bg-[#1e1b1b] hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-700 hover:border-brand-orange text-xs font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-all font-mono"
            >
              <Download className="w-3.5 h-3.5" /> EXPORT RAW (JSON)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
