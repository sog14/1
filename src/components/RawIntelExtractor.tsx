import React, { useState } from "react";
import { FileSearch, Zap, ArrowRight, Loader, Sparkles, Check } from "lucide-react";

interface ExtractedIntel {
  phones?: string[];
  vehicles?: string[];
  pins?: string[];
  places?: string[];
  imeis?: string[];
  names?: { name: string; father?: string }[];
  ips?: string[];
}

interface RawIntelExtractorProps {
  onDispatchQuery: (type: "phone" | "vehicle" | "pin" | "place" | "imei" | "name" | "ip", value: string, extra?: { name: string; father: string }) => void;
}

export default function RawIntelExtractor({ onDispatchQuery }: RawIntelExtractorProps) {
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractedIntel | null>(null);
  const [dispatchedKeys, setDispatchedKeys] = useState<string[]>([]);

  const handleExtract = async () => {
    if (!rawText.trim()) return;
    setLoading(true);
    setResult(null);
    setDispatchedKeys([]);

    try {
      const response = await fetch("/api/extract-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText })
      });
      if (!response.ok) throw new Error("Parsing failure.");
      const data = await response.json();
      setResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const dispatch = (type: "phone" | "vehicle" | "pin" | "place" | "imei" | "name" | "ip", value: string, logIndex: string, extra?: { name: string; father: string }) => {
    onDispatchQuery(type, value, extra);
    setDispatchedKeys(p => [...p, logIndex]);
  };

  const hasResults = result && (
    (result.phones?.length || 0) > 0 ||
    (result.vehicles?.length || 0) > 0 ||
    (result.pins?.length || 0) > 0 ||
    (result.places?.length || 0) > 0 ||
    (result.imeis?.length || 0) > 0 ||
    (result.names?.length || 0) > 0 ||
    (result.ips?.length || 0) > 0
  );

  return (
    <div className="bg-[#0f172a] rounded-xl border border-gray-800 p-5 glow-pink space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-brand-pink" /> 
        <h2 className="text-sm font-semibold text-brand-pink tracking-wider uppercase font-mono">
          AI Copy-Paste Intelligence Extractor
        </h2>
      </div>
      <p className="text-xs text-gray-400 font-sans leading-relaxed">
        Dump unstructured text here (field notes, SDR extracts, chat printouts, surveillance logs). Gemini AI will extract all target indicators (Numbers, Vehicles, PINs, IMEIs, Names) and let you dispatch them instantly to active tabs!
      </p>

      <textarea
        placeholder="Paste unstructured raw intel data, logs, transcripts or chat dumps here..."
        value={rawText}
        onChange={e => setRawText(e.target.value)}
        rows={4}
        className="w-full bg-[#020617] text-white p-3 rounded-lg border border-gray-800 text-xs font-mono focus:border-brand-pink focus:ring-1 focus:ring-brand-pink/25 resize-none placeholder-gray-600"
      />

      <button
        onClick={handleExtract}
        disabled={loading || !rawText.trim()}
        className="w-full bg-brand-pink/15 border border-brand-pink/30 hover:border-brand-pink text-brand-pink hover:bg-brand-pink hover:text-black font-semibold font-mono transition-all text-xs tracking-wider uppercase py-2.5 rounded-lg flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader className="w-4 h-4 animate-spin" /> Mining Intel Elements...
          </>
        ) : (
          <>
            <Zap className="w-4 h-4" /> Extract Intelligence Targets
          </>
        )}
      </button>

      {result && (
        <div className="bg-black/30 rounded-lg border border-gray-850 p-4 space-y-4 font-mono text-xs">
          <div className="text-xs font-bold text-gray-400 border-b border-gray-800 pb-1.5 uppercase tracking-widest">
            AI Extracted Variables ({hasResults ? "Targets Found" : "No targets resolved"})
          </div>

          {!hasResults && (
            <div className="text-gray-500 italic py-2 text-center">
              No phone numbers, vehicles, pins, IMEIs, or name nodes were discovered.
            </div>
          )}

          {hasResults && (
            <div className="space-y-3.5 max-h-[250px] overflow-y-auto pr-1">
              {/* Phones Section */}
              {result.phones && result.phones.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] text-brand-cyan uppercase tracking-wider font-bold">Mobile Vectors:</div>
                  <div className="flex flex-wrap gap-2">
                    {result.phones.map((phone, i) => {
                      const logKey = `phone-${phone}-${i}`;
                      const done = dispatchedKeys.includes(logKey);
                      return (
                        <button
                          key={logKey}
                          onClick={() => dispatch("phone", phone, logKey)}
                          disabled={done}
                          className={`px-2 py-1 rounded text-[10px] flex items-center gap-1.5 border transition-all ${done ? "bg-gray-800/40 text-gray-500 border-gray-800 cursor-default" : "bg-[#090f1c] text-white border-brand-cyan/25 hover:border-brand-cyan hover:bg-brand-cyan/15"}`}
                        >
                          {done ? <Check className="w-3 h-3 text-brand-green" /> : <ArrowRight className="w-3 h-3 text-brand-cyan" />}
                          +91 {phone}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Vehicles Section */}
              {result.vehicles && result.vehicles.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] text-brand-yellow uppercase tracking-wider font-bold font-mono">Vehicles / license plates:</div>
                  <div className="flex flex-wrap gap-2">
                    {result.vehicles.map((v, i) => {
                      const logKey = `veh-${v}-${i}`;
                      const done = dispatchedKeys.includes(logKey);
                      return (
                        <button
                          key={logKey}
                          onClick={() => dispatch("vehicle", v, logKey)}
                          disabled={done}
                          className={`px-2 py-1 rounded text-[10px] flex items-center gap-1.5 border transition-all ${done ? "bg-gray-800/40 text-gray-500 border-gray-800 cursor-default" : "bg-[#090f1c] text-white border-brand-yellow/25 hover:border-brand-yellow hover:bg-brand-yellow/15"}`}
                        >
                          {done ? <Check className="w-3 h-3 text-brand-green" /> : <ArrowRight className="w-3 h-3 text-brand-yellow" />}
                          {v.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* IMEIs Section */}
              {result.imeis && result.imeis.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] text-brand-purple uppercase tracking-wider font-bold">IMEI Serial Signatures:</div>
                  <div className="flex flex-wrap gap-2">
                    {result.imeis.map((imei, i) => {
                      const logKey = `imei-${imei}-${i}`;
                      const done = dispatchedKeys.includes(logKey);
                      return (
                        <button
                          key={logKey}
                          onClick={() => dispatch("imei", imei, logKey)}
                          disabled={done}
                          className={`px-2 py-1 rounded text-[10px] flex items-center gap-1.5 border transition-all ${done ? "bg-gray-800/40 text-gray-500 border-gray-800 cursor-default" : "bg-[#090f1c] text-white border-brand-purple/25 hover:border-brand-purple hover:bg-brand-purple/15"}`}
                        >
                          {done ? <Check className="w-3 h-3 text-brand-green" /> : <ArrowRight className="w-3 h-3 text-brand-purple" />}
                          {imei}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* PIN Code / ZIP codes */}
              {((result.pins?.length || 0) > 0 || (result.places?.length || 0) > 0) && (
                <div className="space-y-1.5">
                  <div className="text-[10px] text-brand-green uppercase tracking-wider font-bold">Postal Coordinates:</div>
                  <div className="flex flex-wrap gap-2">
                    {/* PINs */}
                    {result.pins?.map((p, i) => {
                      const logKey = `pin-${p}-${i}`;
                      const done = dispatchedKeys.includes(logKey);
                      return (
                        <button
                          key={logKey}
                          onClick={() => dispatch("pin", p, logKey)}
                          disabled={done}
                          className={`px-2 py-1 rounded text-[10px] flex items-center gap-1.5 border transition-all ${done ? "bg-gray-800/40 text-gray-500 border-gray-800 cursor-default" : "bg-[#090f1c] text-white border-brand-green/25 hover:border-brand-green hover:bg-brand-green/15"}`}
                        >
                          {done ? <Check className="w-3 h-3 text-brand-green" /> : <ArrowRight className="w-3 h-3 text-brand-green" />}
                          PIN: {p}
                        </button>
                      );
                    })}
                    {/* Places */}
                    {result.places?.map((pl, i) => {
                      const logKey = `pl-${pl}-${i}`;
                      const done = dispatchedKeys.includes(logKey);
                      return (
                        <button
                          key={logKey}
                          onClick={() => dispatch("place", pl, logKey)}
                          disabled={done}
                          className={`px-2 py-1 rounded text-[10px] flex items-center gap-1.5 border transition-all ${done ? "bg-gray-800/40 text-gray-500 border-gray-800 cursor-default" : "bg-[#090f1c] text-white border-brand-green/25 hover:border-brand-green hover:bg-brand-green/15"}`}
                        >
                          {done ? <Check className="w-3 h-3 text-brand-green" /> : <ArrowRight className="w-3 h-3 text-brand-green" />}
                          Place: {pl}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* IP Addresses Section */}
              {result.ips && result.ips.length > 0 && (
                <div className="space-y-1.5 text-left">
                  <div className="text-[10px] text-brand-orange uppercase tracking-wider font-bold">IP Vectors / Traced Hosts:</div>
                  <div className="flex flex-wrap gap-2">
                    {result.ips.map((ip, i) => {
                      const logKey = `ip-${ip}-${i}`;
                      const done = dispatchedKeys.includes(logKey);
                      return (
                        <button
                          key={logKey}
                          onClick={() => dispatch("ip", ip, logKey)}
                          disabled={done}
                          className={`px-2 py-1 rounded text-[10px] flex items-center gap-1.5 border transition-all ${done ? "bg-gray-800/40 text-gray-500 border-gray-800 cursor-default" : "bg-[#090f1c] text-white border-brand-orange/25 hover:border-brand-orange hover:bg-brand-orange/15"}`}
                        >
                          {done ? <Check className="w-3 h-3 text-brand-green" /> : <ArrowRight className="w-3 h-3 text-brand-orange" />}
                          IP: {ip}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Names Section */}
              {result.names && result.names.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] text-brand-yellow uppercase tracking-wider font-bold">Candidate Targets:</div>
                  <div className="flex flex-col gap-1.5">
                    {result.names.map((n, i) => {
                      const logKey = `name-${n.name}-${i}`;
                      const done = dispatchedKeys.includes(logKey);
                      return (
                        <div key={logKey} className="flex justify-between items-center bg-[#090f1c] border border-gray-800 p-2 rounded">
                          <div>
                            <span className="font-semibold text-white">{n.name}</span>
                            {n.father && <span className="text-gray-400 text-[10px] block">Father: {n.father}</span>}
                          </div>
                          <button
                            onClick={() => dispatch("name", n.name, logKey, { name: n.name, father: n.father || "" })}
                            disabled={done}
                            className={`px-2.5 py-1 rounded text-[10px] font-bold border flex items-center gap-1 transition-all ${done ? "bg-gray-850 text-gray-500 border-gray-800" : "bg-brand-yellow/10 border-brand-yellow text-brand-yellow hover:bg-brand-yellow hover:text-black"}`}
                          >
                            {done ? "Dispatched" : "Dispatch"} <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
