import React, { useState, useRef, useEffect } from "react";
import { 
  ShieldAlert, Activity, LayoutGrid, Square, History, 
  Workflow, Car, MapPin, Cpu, BookOpen, Printer, PlusCircle, CheckCircle,
  Globe, Radio, Compass, Sun, Moon
} from "lucide-react";
import TargetTab from "./components/TargetTab";
import VehicleTab from "./components/VehicleTab";
import PincodeTab from "./components/PincodeTab";
import ImeiTab from "./components/ImeiTab";
import RawIntelExtractor from "./components/RawIntelExtractor";
import IpLookupTab from "./components/IpLookupTab";
import CgiTerminalTab from "./components/CgiTerminalTab";
import CriminalMovementTab from "./components/CriminalMovementTab";

interface HistoryItem {
  id: string;
  title: string;
  query: string;
  timestamp: string;
}

// Declare global properties for TypeScript compiler
declare global {
  interface Window {
    activeTaskRunningState: {
      phone: boolean;
      vehicle: boolean;
      pincode: boolean;
      imei: boolean;
    };
    queryCapturedRecords: any[];
  }
}

// Safe initializers for background caches
if (typeof window !== "undefined") {
  window.activeTaskRunningState = window.activeTaskRunningState || {
    phone: false,
    vehicle: false,
    pincode: false,
    imei: false
  };
  window.queryCapturedRecords = window.queryCapturedRecords || [];
}

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("theme") as "dark" | "light") || "dark";
    }
    return "dark";
  });

  const [activeTab, setActiveTab ] = useState<"target" | "vehicle" | "pin" | "imei" | "iplookup" | "extractor" | "cgi" | "movement">("target");
  const [layoutMode, setLayoutMode] = useState<"tab" | "grid">("tab");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isSharedMode, setIsSharedMode] = useState(false);

  useEffect(() => {
    const root = document.body;
    if (theme === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("share")) {
      setIsSharedMode(true);
      setActiveTab("movement");
      setLayoutMode("tab");
    }
  }, []);

  // Create refs to simulate dispatching to specific input fields in target children
  const [dispatchedQuery, setDispatchedQuery] = useState<{
    type: string;
    value: string;
    extra?: { name: string; father: string };
  } | null>(null);

  // Synchronizer for real-time manifest updates
  const handleIntelParsed = () => {};

  const handleAddHistory = (title: string, query: string) => {
    const newItem: HistoryItem = {
      id: `${Date.now()}-${Math.random()}`,
      title,
      query,
      timestamp: new Date().toLocaleTimeString()
    };
    setHistory(prev => [newItem, ...prev].slice(0, 15));
  };

  const handleDispatch = (
    type: "phone" | "vehicle" | "pin" | "place" | "imei" | "name" | "ip", 
    value: string,
    extra?: { name: string; father: string }
  ) => {
    // If dispatched, we toggle the corresponding tab and pass down the queries to run simultaneously
    if (type === "phone" || type === "name") {
      setActiveTab("target");
    } else if (type === "vehicle") {
      setActiveTab("vehicle");
    } else if (type === "pin" || type === "place") {
      setActiveTab("pin");
    } else if (type === "imei") {
      setActiveTab("imei");
    } else if (type === "ip") {
      setActiveTab("iplookup");
    }
    
    // Alert the user via a clean LEO dashboard notification
    handleAddHistory(`Automated AI Dispatch [${type.toUpperCase()}]`, value);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#030712] text-gray-100 flex flex-col font-sans transition-all selection:bg-brand-cyan/30">
      
      {/* HEADER SECTION */}
      {!isSharedMode && (
        <header className="no-print border-b border-gray-800/80 bg-[#070b14] px-6 py-4 sticky top-0 z-40 backdrop-blur-md">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-cyan/15 border border-brand-cyan/30 flex items-center justify-center animate-pulse glow-cyan">
                <Activity className="w-5 h-5 text-brand-cyan" />
              </div>
              <div>
                <h1 className="text-md font-bold tracking-wider text-white uppercase font-mono flex items-center gap-2">
                  SOG14 OSINT Suite{" "}
                  <span className="text-[10px] text-brand-cyan font-bold bg-brand-cyan/10 border border-brand-cyan/20 px-2 py-0.5 rounded">
                    CONCURRENT CONSOLE
                  </span>
                </h1>
                <p className="text-xs text-gray-400 mt-0.5 font-sans">
                  Multi-Tab Simultaneous Intelligence & AI Kinship System
                </p>
              </div>
            </div>

            {/* Quick Control Actions */}
            <div className="flex items-center gap-3">
              <div className="flex bg-[#020617] rounded-lg border border-gray-800 p-0.5 font-mono text-xs">
                <button
                  onClick={() => setLayoutMode("tab")}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${layoutMode === "tab" ? "bg-gray-800 text-white font-bold" : "text-gray-400 hover:text-white"}`}
                  title="Tab Navigation"
                >
                  <Square className="w-3.5 h-3.5" /> Tabs
                </button>
                <button
                  onClick={() => setLayoutMode("grid")}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${layoutMode === "grid" ? "bg-gray-800 text-white font-bold" : "text-gray-400 hover:text-white"}`}
                  title="Simultaneous Grid View Workspace"
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> Split Grid
                </button>
              </div>

              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="bg-gray-800 hover:bg-gray-700 text-white text-xs font-mono font-bold uppercase py-2 px-3 rounded-lg border border-gray-700 transition-all flex items-center gap-1.5 cursor-pointer"
                title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
                id="theme-toggle-btn"
              >
                {theme === "dark" ? <Sun className="w-3.5 h-3.5 text-brand-cyan" /> : <Moon className="w-3.5 h-3.5 text-brand-purple" />}
                {theme === "dark" ? "Light" : "Dark"}
              </button>

              <button
                onClick={handlePrint}
                className="bg-gray-800 hover:bg-gray-700 text-white text-xs font-mono font-bold uppercase py-2 px-3 rounded-lg border border-gray-700 transition-all flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>
          </div>
        </header>
      )}

      {/* CORE WORKSPACE */}
      <main className={`flex-1 w-full mx-auto ${isSharedMode ? "max-w-none px-0 py-0 block" : "max-w-7xl px-4 py-6 md:py-8 grid grid-cols-1 lg:grid-cols-4 gap-6"}`}>
        
        {/* Left Side: Navigation Links & Active Lookup History */}
        {!isSharedMode && (
          <aside className="no-print lg:col-span-1 space-y-6">
          
          {/* Main Navigation Sidebar */}
          {layoutMode === "tab" && (
            <div className="bg-[#0f172a] rounded-xl border border-gray-800 p-4 space-y-2">
              <span className="text-[10px] text-gray-500 font-mono font-bold uppercase tracking-widest block px-2 mb-3">CONSOLES</span>
              <button 
                onClick={() => setActiveTab("target")}
                className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 text-xs font-semibold uppercase tracking-wider transition-all border ${activeTab === "target" ? "bg-brand-cyan/15 text-brand-cyan border-brand-cyan/20" : "text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800/40"}`}
              >
                <Workflow className="w-4 h-4 text-brand-cyan" /> Target Matrix
              </button>
              <button 
                onClick={() => setActiveTab("vehicle")}
                className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 text-xs font-semibold uppercase tracking-wider transition-all border ${activeTab === "vehicle" ? "bg-brand-yellow/15 text-brand-yellow border-brand-yellow/20" : "text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800/40"}`}
              >
                <Car className="w-4 h-4 text-brand-yellow" /> Vehicle RC
              </button>
              <button 
                onClick={() => setActiveTab("pin")}
                className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 text-xs font-semibold uppercase tracking-wider transition-all border ${activeTab === "pin" ? "bg-brand-green/15 text-brand-green border-brand-green/20" : "text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800/40"}`}
              >
                <MapPin className="w-4 h-4 text-brand-green" /> PIN / Postal
              </button>
              <button 
                onClick={() => setActiveTab("imei")}
                className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 text-xs font-semibold uppercase tracking-wider transition-all border ${activeTab === "imei" ? "bg-brand-purple/15 text-brand-purple border-brand-purple/20" : "text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800/40"}`}
              >
                <Cpu className="w-4 h-4 text-brand-purple" /> IMEI Terminal
              </button>
              <button 
                onClick={() => setActiveTab("iplookup")}
                className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 text-xs font-semibold uppercase tracking-wider transition-all border ${activeTab === "iplookup" ? "bg-brand-orange/15 text-brand-orange border-brand-orange/20" : "text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800/40"}`}
              >
                <Globe className="w-4 h-4 text-brand-orange" /> IP Lookup
              </button>
              <button 
                onClick={() => setActiveTab("cgi")}
                className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 text-xs font-semibold uppercase tracking-wider transition-all border ${activeTab === "cgi" ? "bg-orange-500/15 text-orange-400 border-orange-500/20" : "text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800/40"}`}
              >
                <Radio className="w-4 h-4 text-orange-400" /> CGI & Tower Dump
              </button>
              <button 
                onClick={() => setActiveTab("movement")}
                className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 text-xs font-semibold uppercase tracking-wider transition-all border ${activeTab === "movement" ? "bg-brand-cyan/15 text-brand-cyan border-brand-cyan/20 font-bold" : "text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800/40"}`}
              >
                <Compass className="w-4 h-4 text-brand-cyan shrink-0" /> Criminal Movement
              </button>
              <button 
                onClick={() => setActiveTab("extractor")}
                className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 text-xs font-semibold uppercase tracking-wider transition-all border ${activeTab === "extractor" ? "bg-brand-pink/15 text-brand-pink border-brand-pink/20" : "text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800/40"}`}
              >
                <BookOpen className="w-4 h-4 text-brand-pink" /> AI Extractor
              </button>
            </div>
          )}

          {/* AI Unstructured Text Extractor (Always visible as reference on Grid layout mode) */}
          {layoutMode === "grid" && (
            <RawIntelExtractor onDispatchQuery={handleDispatch} />
          )}

          {/* Realtime Lookup History */}
          <div className="bg-[#0f172a] rounded-xl border border-gray-800 p-4 space-y-3 font-mono">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block px-1.5 flex items-center gap-1">
              <History className="w-3.5 h-3.5 text-gray-400" /> ACTIVE CONSOLE LOGS
            </span>
            
            {history.length === 0 ? (
              <div className="text-[10px] text-gray-500 italic p-3 text-center">
                Wait for actions. History index empty.
              </div>
            ) : (
              <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                {history.map((h) => (
                  <div key={h.id} className="p-1.5 rounded bg-[#020617] border border-gray-800/60 space-y-1">
                    <div className="flex justify-between items-center text-[9px] text-gray-400">
                      <span className="font-bold text-gray-300">{h.title}</span>
                      <span>{h.timestamp}</span>
                    </div>
                    <div className="text-[11px] text-brand-cyan text-ellipsis overflow-hidden whitespace-nowrap font-semibold">
                      {h.query}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Guidelines Compliance Note */}
          <div className="bg-[#090f1c]/80 border border-gray-800 rounded-xl p-4 space-y-2 text-xs text-gray-400">
            <span className="font-bold text-gray-300 text-[10px] uppercase font-mono tracking-wider flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-red-400" /> SYSTEM POLICIES
            </span>
            <p className="leading-relaxed font-sans text-[11px]">
              This analytical system operates recursively with target profiles. Private or secured Indian database contents (SDR, Aadhar, etc.) are simulated for analytical demonstration purposes.
            </p>
          </div>
        </aside>
        )}

        {/* Right Side: Interactive Active Panel Workspaces */}
        <section className={isSharedMode ? "w-full space-y-6" : "lg:col-span-3 space-y-6"}>
          
          {layoutMode === "tab" ? (
            /* Tabbed navigation layout where panels remain mounted in background, retaining their operations */
            <div>
              <div style={{ display: activeTab === "target" ? "block" : "none" }}>
                <TargetTab 
                  onAddHistory={handleAddHistory} 
                  onLinkDetected={() => {}} 
                  onIntelParsed={handleIntelParsed}
                />
              </div>
              <div style={{ display: activeTab === "vehicle" ? "block" : "none" }}>
                <VehicleTab 
                  onAddHistory={handleAddHistory} 
                  onIntelParsed={handleIntelParsed}
                />
              </div>
              <div style={{ display: activeTab === "pin" ? "block" : "none" }}>
                <PincodeTab 
                  onAddHistory={handleAddHistory} 
                  onIntelParsed={handleIntelParsed}
                />
              </div>
              <div style={{ display: activeTab === "imei" ? "block" : "none" }}>
                <ImeiTab 
                  onAddHistory={handleAddHistory} 
                />
              </div>
              <div style={{ display: activeTab === "iplookup" ? "block" : "none" }}>
                <IpLookupTab 
                  onAddHistory={handleAddHistory} 
                />
              </div>
              <div style={{ display: activeTab === "cgi" ? "block" : "none" }}>
                <CgiTerminalTab 
                  onAddHistory={handleAddHistory} 
                  onIntelParsed={handleIntelParsed}
                />
              </div>
              <div style={{ display: activeTab === "movement" ? "block" : "none" }}>
                <CriminalMovementTab 
                  onAddHistory={handleAddHistory} 
                  isSharedView={isSharedMode}
                />
              </div>
              <div style={{ display: activeTab === "extractor" ? "block" : "none" }}>
                <RawIntelExtractor 
                  onDispatchQuery={handleDispatch} 
                />
              </div>
            </div>
          ) : (
            /* SPLIT WORKSPACE GRID MODE: All modules render simultaneously, fully stateful and independently queried! */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#020617]/40 border border-gray-850 p-1.5 rounded-xl space-y-2 col-span-1 md:col-span-2">
                <TargetTab 
                  onAddHistory={handleAddHistory} 
                  onLinkDetected={() => {}} 
                  onIntelParsed={handleIntelParsed}
                />
              </div>
              <div className="bg-[#020617]/40 border border-gray-850 p-1.5 rounded-xl space-y-2">
                <IpLookupTab 
                  onAddHistory={handleAddHistory} 
                />
              </div>
              <div className="bg-[#020617]/40 border border-gray-850 p-1.5 rounded-xl space-y-2">
                <VehicleTab 
                  onAddHistory={handleAddHistory} 
                  onIntelParsed={handleIntelParsed}
                />
              </div>
              <div className="bg-[#020617]/40 border border-gray-850 p-1.5 rounded-xl space-y-2">
                <PincodeTab 
                  onAddHistory={handleAddHistory} 
                  onIntelParsed={handleIntelParsed}
                />
              </div>
              <div className="bg-[#020617]/40 border border-gray-850 p-1.5 rounded-xl space-y-2">
                <ImeiTab 
                  onAddHistory={handleAddHistory} 
                />
              </div>
            </div>
          )}

          {/* Legal Footers / Prints Section */}
          {!isSharedMode && (
            <div className="border border-red-500/10 bg-[#1e1b1b]/10 rounded-xl p-5 text-xs text-gray-400 space-y-3 font-mono leading-relaxed mt-6">
              <div className="border-b border-gray-800 pb-2">
                <strong className="text-red-400 block tracking-wider uppercase">REGULATORY COMPLIANCE EX PARTE</strong>
              </div>
              <p className="text-[11px] leading-relaxed text-gray-500">
                SOG14 OSINT acts as an intelligence aggregator interface. Information is fetched, processed, and evaluated under lawful investigative guidelines for authorized law enforcement agencies only. This service contains no storage or replication of illicit materials.
              </p>
            </div>
          )}
        </section>
      </main>

    </div>
  );
}

