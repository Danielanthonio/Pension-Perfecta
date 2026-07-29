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

// ---------------------------------------------------------------------------
// Reloj de 12 horas
// ---------------------------------------------------------------------------
// El <input type="time"> del navegador se pinta en 12 o 24 horas según el idioma
// de la máquina, así que no se puede garantizar AM/PM. Este selector propio sí:
// por fuera sigue hablando en "HH:MM" de 24 horas (lo que espera la base), pero
// por dentro y en pantalla siempre es 12 horas con AM/PM.

const MINUTOS = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

type Meridiano = "" | "AM" | "PM";

// "14:30" -> { hora: "2", minuto: "30", meridiano: "PM" }
function split12h(t: string): { hora: string; minuto: string; meridiano: Meridiano } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
  if (!m) return { hora: "", minuto: "00", meridiano: "" };
  const h24 = Number(m[1]);
  if (h24 > 23) return { hora: "", minuto: "00", meridiano: "" };
  return {
    hora: String(h24 % 12 === 0 ? 12 : h24 % 12),
    minuto: m[2],
    meridiano: h24 >= 12 ? "PM" : "AM",
  };
}

// { 2, "30", "PM" } -> "14:30". Sin hora o sin AM/PM todavía no hay valor válido.
function join24h(hora: string, minuto: string, meridiano: Meridiano): string {
  if (!hora || !meridiano) return "";
  const h = (Number(hora) % 12) + (meridiano === "PM" ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${minuto || "00"}`;
}

function TimePicker12h({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [hora, setHora] = useState("");
  const [minuto, setMinuto] = useState("00");
  const [meridiano, setMeridiano] = useState<Meridiano>("");

  // Solo se resincroniza cuando el valor viene de fuera (al abrir el modal con una
  // cita ya grabada). Mientras el usuario está a medio elegir, el valor de fuera es
  // "" y hay que conservar lo que ya escogió.
  useEffect(() => {
    if (join24h(hora, minuto, meridiano) === value) return;
    const p = split12h(value);
    setHora(p.hora);
    setMinuto(p.minuto);
    setMeridiano(p.meridiano);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emitir = (h: string, m: string, mer: Meridiano) => {
    setHora(h);
    setMinuto(m);
    setMeridiano(mer);
    onChange(join24h(h, m, mer));
  };

  // Una cita vieja pudo grabarse en un minuto fuera de la rejilla (p. ej. 11:47);
  // se agrega a la lista para no perderlo al reabrir el modal.
  const minutos = MINUTOS.includes(minuto) ? MINUTOS : [...MINUTOS, minuto].sort();

  const selectCls =
    "bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 focus:border-emerald-500 outline-none rounded-xl px-2.5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer tabular-nums";

  return (
    // `items-stretch` para que AM/PM tengan exactamente el alto de los selectores.
    <div className="flex items-stretch gap-2">
      <select
        value={hora}
        onChange={(e) => {
          const h = e.target.value;
          // Al elegir la hora sin haber tocado AM/PM se propone el turno más
          // probable (8–11 por la mañana, el resto por la tarde). Queda marcado a
          // la vista y se cambia con un clic.
          const mer: Meridiano = meridiano || (Number(h) >= 8 && Number(h) <= 11 ? "AM" : "PM");
          emitir(h, minuto, h ? mer : "");
        }}
        className={selectCls}
        aria-label="Hora"
      >
        <option value="">--</option>
        {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="flex items-center text-sm font-black text-slate-400 dark:text-slate-500">:</span>
      <select
        value={minuto}
        onChange={(e) => emitir(hora, e.target.value, meridiano)}
        className={selectCls}
        aria-label="Minutos"
      >
        {minutos.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1 ml-1">
        {(["AM", "PM"] as const).map((op) => (
          <button
            key={op}
            type="button"
            onClick={() => emitir(hora, minuto, op)}
            className={`px-3 rounded-xl text-[11px] font-black border transition-all active:scale-95 ${
              meridiano === op
                ? "bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-500/20"
                : "bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-750 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            {op}
          </button>
        ))}
      </div>
    </div>
  );
}

// Lo que va a quedar grabado, en palabras, para que un AM/PM mal elegido salte a
// la vista antes de confirmar. Se ancla a CDMX igual que al guardar.
function previewCita(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00-06:00`);
  if (isNaN(d.getTime())) return null;
  const tz = { timeZone: "America/Mexico_City" } as const;
  const dia = d.toLocaleDateString("es-MX", { ...tz, weekday: "long", day: "numeric", month: "long" });
  const hora = d.toLocaleTimeString("es-MX", { ...tz, hour: "numeric", minute: "2-digit", hour12: true });
  return `${dia} a las ${hora}`;
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
  const preview = previewCita(date, time);

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

        <div className="space-y-3">
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
            <TimePicker12h value={time} onChange={setTime} />
          </div>
          {preview && (
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Quedará agendada el{" "}
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{preview}</span>
            </p>
          )}
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
