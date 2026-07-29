"use client";

import React, { useEffect, useState } from "react";
import { Calendar, ExternalLink } from "lucide-react";
import { Prospect } from "@/utils/context/AppContext";
import { formatCita, citaInputs } from "./projectStepper";

// Con qué valores abre el modal: la cita grabada en `asesoria_at` y, como respaldo
// para los proyectos anteriores a esa columna, el texto de la nota ("Asesoría
// agendada para el día AAAA-MM-DD a las HH:MM hrs."). Si no hay ninguna de las dos
// (o se agendó vía LeadConnector), abre en blanco.
export function agendaInputsFor(p: Prospect): { date: string; time: string } {
  const grabada = citaInputs(p.asesoria_at);
  if (grabada) return grabada;
  const m = p.notes_aliado?.match(/día (\d{4}-\d{2}-\d{2}) a las (\d{1,2}:\d{2})/);
  return m ? { date: m[1], time: m[2].padStart(5, "0") } : { date: "", time: "" };
}

interface AgendaAsesoriaModalProps {
  /** Proyecto a agendar; null cierra el modal. */
  prospect: Prospect | null;
  /** Link de la agenda de su modalidad, si está configurado. */
  meetingLink?: string | null;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (date: string, time: string) => void;
}

// Única pantalla para grabar la fecha de la asesoría: la usan el portal del aliado
// y Gestión de Clientes (director / account manager), así que los tres roles ven y
// hacen exactamente lo mismo. Grabar aquí es el ÚNICO camino al hito "Agenda de
// Asesoría": la subetapa no se puede elegir a mano.
export function AgendaAsesoriaModal({
  prospect,
  meetingLink,
  saving = false,
  onClose,
  onConfirm,
}: AgendaAsesoriaModalProps) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  // Al abrir con otro proyecto, precargar su cita (reagendar, no recapturar).
  useEffect(() => {
    if (!prospect) return;
    const previa = agendaInputsFor(prospect);
    setDate(previa.date);
    setTime(previa.time);
  }, [prospect]);

  if (!prospect) return null;

  const citaActual = formatCita(prospect.asesoria_at);

  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-slate-200 dark:border-slate-800 mx-4 animate-scale-up">
        <div className="flex items-center gap-3 border-b border-slate-150 dark:border-slate-800 pb-4">
          <div className="h-11 w-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 dark:text-emerald-400 flex items-center justify-center border border-emerald-150 dark:border-emerald-800/40">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">
              {citaActual ? "Cambiar fecha de la asesoría" : "Agendar asesoría"}
            </h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
              Es la fecha de la reunión con el cliente: la misma que aparece en la línea de tiempo.
            </p>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-bold">
              {prospect.full_name.charAt(0)}
            </div>
            <div className="min-w-0">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block truncate">{prospect.full_name}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tabular-nums">
                NSS: {prospect.nss} · Aliado: {prospect.aliado_name || "Asesor Comercial"}
              </span>
              {citaActual && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block mt-0.5">
                  Cita actual: {citaActual}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Fecha
            </label>
            {/* Sin fecha mínima a propósito: también se registran reuniones que ya
                ocurrieron y nadie alcanzó a capturar. */}
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 focus:border-emerald-500 outline-none rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Hora
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 focus:border-emerald-500 outline-none rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
            />
          </div>
        </div>

        {meetingLink ? (
          <a
            href={meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir agenda de Modalidad {prospect.modalidad}
          </a>
        ) : (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
            {prospect.modalidad
              ? `Falta configurar el link de reunión de Modalidad ${prospect.modalidad}.`
              : "Este proyecto aún no tiene modalidad definida, así que no hay link de reunión que abrir."}
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-all active:scale-95 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(date, time)}
            disabled={!date || !time || saving}
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs shadow-sm shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5"
          >
            <Calendar className="h-3.5 w-3.5" />
            {saving ? "Guardando..." : "Confirmar agenda"}
          </button>
        </div>
      </div>
    </div>
  );
}
