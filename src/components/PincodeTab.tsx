import React, { useState } from "react";
import { Mail, Search, MapPin, Building, ShieldAlert, ListFilter, Loader, Download } from "lucide-react";
import { PostalOffice } from "../types";

interface PincodeTabProps {
  onAddHistory: (title: string, query: string) => void;
  onIntelParsed?: () => void;
}

export default function PincodeTab({ onAddHistory, onIntelParsed }: PincodeTabProps) {
  const [searchBy, setSearchBy] = useState<"pin" | "place">("pin");
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offices, setOffices] = useState<PostalOffice[]>([]);

  // Spec 3 Requirement: Named lookup processor function
  const performPincodeLookup = async (mode: "pin" | "place", value: string) => {
    const cleanValue = value.trim();
    if (!cleanValue) {
      setError("Search query is required.");
      return;
    }

    if (mode === "pin" && !/^\d{6}$/.test(cleanValue)) {
      setError("PIN Code must be exactly 6 digits.");
      return;
    }

    setError(null);
    setOffices([]);
    setLoading(true);

    // Update global background tracker
    if (typeof window !== "undefined" && window.activeTaskRunningState) {
      window.activeTaskRunningState.pincode = true;
    }
    
    onAddHistory(`PIN query [${mode.toUpperCase()}]`, cleanValue);

    const apiUrl = mode === "pin" 
      ? `https://api.postalpincode.in/pincode/${cleanValue}` 
      : `https://api.postalpincode.in/postoffice/${encodeURIComponent(cleanValue)}`;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error("Government Postal Directory is busy. Please try again later.");
      const data = await response.json();

      if (data && data[0] && data[0].Status === "Success") {
        const postOfficesRaw = data[0].PostOffice || [];
        
        // Handle schema naming differences: office.PINCode vs office.Pincode
        const processedOffices = postOfficesRaw.map((office: any) => {
          const extractedPincode = office.PINCode || office.Pincode || cleanValue;
          return {
            ...office,
            Pincode: extractedPincode // Normalize Pincode key
          };
        });

        setOffices(processedOffices);

        // Auto-stream structural metrics to parent/global captured cache
        if (typeof window !== "undefined" && window.queryCapturedRecords) {
          processedOffices.forEach((o: any) => {
            window.queryCapturedRecords.push({
              name: o.Name,
              address: `${o.Name}, Division: ${o.Division || "N/A"}, Region: ${o.Region || "N/A"}, State: ${o.State || "N/A"} (${o.Pincode})`,
              mobile: "",
              alt_mobile: ""
            });
          });
          
          if (onIntelParsed) {
            onIntelParsed();
          }
        }
      } else {
        setError(data[0]?.Message || "No postal directories matched this footprint.");
      }
    } catch (apiErr: any) {
      setError(apiErr.message || "Network timeout connecting to Postal Services.");
    } finally {
      setLoading(false);
      if (typeof window !== "undefined" && window.activeTaskRunningState) {
        window.activeTaskRunningState.pincode = false;
      }
    }
  };

  const handleSearch = () => {
    performPincodeLookup(searchBy, inputValue);
  };

  const handleExportTxt = () => {
    if (offices.length === 0) return;
    let bodyText = `=== SUB-CONTINENT POSTAL ZIP CODE REPORT ===\n`;
    bodyText += `Query Value: ${inputValue}\n`;
    bodyText += `Matches Found: ${offices.length}\n`;
    bodyText += `===========================================\n\n`;

    offices.forEach((o, index) => {
      bodyText += `[Post Office Match #${index + 1}]\n`;
      bodyText += `- Office Name: ${o.Name}\n`;
      bodyText += `- Branch/type: ${o.BranchType}\n`;
      bodyText += `- PIN Code: ${o.Pincode}\n`;
      bodyText += `- Delivery status: ${o.DeliveryStatus}\n`;
      bodyText += `- District: ${o.District}\n`;
      bodyText += `- Division: ${o.Division}\n`;
      bodyText += `- State: ${o.State}\n`;
      bodyText += `-------------------------------------------\n\n`;
    });

    const blob = new Blob([bodyText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `Postal_OSINT_${searchBy}_${inputValue}.txt`;
    link.href = url;
    link.click();
  };

  return (
    <div className="space-y-6 text-left">
      <div className="bg-[#0f172a] rounded-xl border border-gray-800 p-5 glow-green">
        <h2 className="text-sm font-semibold text-brand-green tracking-wider uppercase mb-4 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-brand-green" /> Postal Directory Lookup
        </h2>

        {/* Toggle Search Mode Sub-option */}
        <div className="flex bg-[#020617] rounded-lg border border-gray-800 p-1 mb-5">
          <button 
            onClick={() => { setSearchBy("pin"); setError(null); }}
            className={`flex-1 text-center py-2 text-xs font-bold font-mono uppercase tracking-wider rounded-md transition-all ${searchBy === "pin" ? "bg-brand-green/25 text-brand-green border border-brand-green/30" : "text-gray-400 hover:text-gray-200"}`}
          >
            Search by PIN Code
          </button>
          <button 
            onClick={() => { setSearchBy("place"); setError(null); }}
            className={`flex-1 text-center py-2 text-xs font-bold font-mono uppercase tracking-wider rounded-md transition-all ${searchBy === "place" ? "bg-brand-green/25 text-brand-green border border-brand-green/30" : "text-gray-400 hover:text-gray-200"}`}
          >
            Search by Place Name
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-semibold font-mono">
              {searchBy === "pin" ? "6-Digit Indian Post PIN Code *" : "Subdivision / Office / Place Name *"}
            </label>
            <input
              type="text"
              placeholder={searchBy === "pin" ? "e.g., 110092" : "e.g., Shakarpur, Mumbai, Vasundhara..."}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              className="w-full bg-[#020617] text-white px-3 py-2.5 rounded-lg border border-gray-800 text-sm focus:border-brand-green focus:ring-1 focus:ring-brand-green/25 font-mono"
            />
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="flex-1 bg-brand-green/10 border border-brand-green text-brand-green hover:bg-brand-green hover:text-black font-semibold font-mono transition-all text-xs tracking-wider uppercase py-3 rounded-lg flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" /> Crawling Postal DB...
                </>
              ) : (
                "Search Postal Directory"
              )}
            </button>
            {offices.length > 0 && (
              <button
                onClick={handleExportTxt}
                className="bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-lg transition-all"
                title="Export Postal Reports"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dynamic ongoing background tracker loader status label */}
      {loading && (
        <div id="loadingText" className="bg-[#0b1329] border border-brand-green/30 rounded-xl p-4 flex items-center gap-3 font-mono text-xs text-brand-green animate-pulse">
          <Loader className="w-4 h-4 animate-spin text-brand-green" />
          <span>[SOG14 ASYNC POSTAL CRITICAL WORKER]: Resolving subdivision nodes for query: {inputValue}...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-950/40 border border-red-900 rounded-lg p-4 text-xs text-red-200 font-mono">
          <strong>! POST OFFICE DIRECTORY REJECT:</strong> {error}
        </div>
      )}

      {offices.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-gray-400 font-mono uppercase tracking-widest flex items-center gap-2">
            <Building className="w-4 h-4 text-brand-green" /> Resolved Post Offices ({offices.length} nodes)
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {offices.map((o, idx) => (
              <div key={idx} className="bg-[#090f1c] border border-gray-805 rounded-xl p-4 space-y-3.5 hover:border-brand-green/40 transition-all">
                <div className="flex justify-between items-center border-b border-gray-850 pb-2">
                  <span className="text-xs font-bold font-mono text-brand-green">{o.Name.toUpperCase()}</span>
                  
                  {/* Suppress original PIN badge when searching directly by PIN */}
                  {searchBy !== "pin" && (
                    <span className="text-[10px] bg-brand-green/20 text-brand-green font-mono px-2 py-0.5 rounded border border-brand-green/35">
                      {o.Pincode}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 text-xs font-mono text-gray-300">
                  <div className="flex justify-between"><span className="text-gray-400">Branch Type:</span> <span>{o.BranchType}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Delivery Status:</span> <span className={o.DeliveryStatus === "Delivery" ? "text-brand-green" : "text-yellow-400"}>{o.DeliveryStatus}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">District:</span> <span className="text-white">{o.District}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Division:</span> <span className="text-white">{o.Division}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">State:</span> <span className="text-white">{o.State}</span></div>
                </div>

                {/* Highlighted resolved PIN row added only when searched by Place */}
                {searchBy === "place" && (
                  <div className="pt-2 border-t border-gray-850/60 mt-2 flex justify-between items-center bg-[#070d1a] px-2 py-1.5 rounded-lg border border-brand-green/15">
                    <span className="text-[9.5px] text-brand-green/85 font-bold tracking-wider font-mono">RESOLVED ZIP-PIN</span>
                    <span className="text-xs text-white font-extrabold bg-[#020617] px-2.5 py-0.5 border border-brand-green/30 rounded font-mono shadow-md">{o.Pincode}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
