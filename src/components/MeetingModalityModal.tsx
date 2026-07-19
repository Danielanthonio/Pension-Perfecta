"use client";
import React from "react";
import { useApp } from "@/utils/context/AppContext";
import { Calendar, X, ArrowUpRight } from "lucide-react";

interface MeetingModalityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Selector de modalidad antes de abrir la agenda de asesoría. El link de cada
// modalidad lo administra la Dirección desde Gestión de Usuarios (appSettings).
export default function MeetingModalityModal({ isOpen, onClose }: MeetingModalityModalProps) {
  const { appSettings } = useApp();

  if (!isOpen) return null;

  const openLink = (modality: "40" | "10") => {
    const url =
      modality === "40" ? appSettings.meeting_link_m40 : appSettings.meeting_link_m10;
    if (!url || !url.trim()) {
      alert(`El director aún no ha configurado el link de Modalidad ${modality}. Solicítalo a Dirección.`);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm">
              <Calendar className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-white tracking-tight">Agendar Asesoría</h3>
              <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Elige la modalidad
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
            ¿Para qué modalidad deseas agendar la reunión? Se abrirá la agenda oficial correspondiente.
          </p>

          <button
            onClick={() => openLink("40")}
            className="group w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold text-sm transition-all shadow-md shadow-blue-500/10 hover:scale-[1.01]"
          >
            <span className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-xl bg-white/20 flex items-center justify-center text-xs font-black">40</span>
              Modalidad 40
            </span>
            <ArrowUpRight className="h-4 w-4 opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </button>

          <button
            onClick={() => openLink("10")}
            className="group w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm transition-all shadow-md shadow-emerald-500/10 hover:scale-[1.01]"
          >
            <span className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-xl bg-white/20 flex items-center justify-center text-xs font-black">10</span>
              Modalidad 10
            </span>
            <ArrowUpRight className="h-4 w-4 opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
