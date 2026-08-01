"use client";

// Reasignación de un aliado a otro closer.
//
// Regla de negocio que la UI tiene que dejar clarísima (§23): reasignar mueve al
// closer ACTUAL —quién acompaña al aliado de aquí en adelante— pero NO toca al
// closer de ORIGEN. El mérito por haber cerrado a ese aliado, y todas las
// métricas históricas que dependen de él, se quedan donde estaban. Si esto no se
// explica en pantalla, la Dirección asume que está moviendo los números.

import React, { useState } from "react";
import { AlertTriangle, ArrowRightLeft, Loader2, X } from "lucide-react";
import type { CloserAliadoRow } from "./closerTypes";

export function ReasignarCloser({
  aliado,
  closerActualId,
  closers,
  onCerrar,
  onConfirmar,
}: {
  aliado: CloserAliadoRow;
  closerActualId: string;
  closers: { id: string; nombre: string }[];
  onCerrar: () => void;
  onConfirmar: (nuevoCloserId: string, motivo: string) => Promise<void>;
}) {
  const [nuevoCloserId, setNuevoCloserId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // §40: el nuevo closer debe existir y ser DISTINTO del actual, y el motivo es
  // obligatorio (es lo único que explica el movimiento dentro de seis meses).
  const disponibles = closers.filter((c) => c.id !== closerActualId);
  const puedeGuardar = !!nuevoCloserId && motivo.trim().length >= 3 && !guardando;

  const confirmar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setErrorMsg("");
    try {
      await onConfirmar(nuevoCloserId, motivo.trim());
    } catch (e: any) {
      console.error("Error reasignando aliado:", e);
      setErrorMsg("No se pudo reasignar el aliado. Inténtalo de nuevo en unos segundos.");
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 flex items-center justify-center shrink-0">
              <ArrowRightLeft className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">Reasignar aliado</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{aliado.aliado_nombre}</p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
              Esto cambia quién <strong>acompaña</strong> al aliado de aquí en adelante. El closer que lo{" "}
              <strong>incorporó</strong> no cambia, y sus métricas históricas —aliados cerrados, clientes y
              ventas generados— se quedan atribuidas a él.
            </p>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Nuevo closer responsable
            </span>
            <select
              value={nuevoCloserId}
              onChange={(e) => setNuevoCloserId(e.target.value)}
              className="px-3 py-2 rounded-lg text-xs bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
            >
              <option value="">Selecciona un closer…</option>
              {disponibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            {disponibles.length === 0 && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400">
                No hay otro closer al que reasignar. Crea uno en Gestión de Usuarios.
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Motivo <span className="text-rose-500">*</span>
            </span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Ej.: reorganización comercial de la zona norte"
              className="px-3 py-2 rounded-lg text-xs bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500 resize-none"
            />
          </label>

          {errorMsg && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errorMsg}</p>}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
          <button
            onClick={onCerrar}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors active:scale-95"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!puedeGuardar}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" strokeWidth={2.4} />}
            Confirmar reasignación
          </button>
        </div>
      </div>
    </div>
  );
}
