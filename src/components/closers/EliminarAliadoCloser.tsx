"use client";

// Baja permanente de un aliado por parte del closer que lo dio de alta (§8).
//
// Es la única acción de este módulo que no se puede deshacer, así que la
// pantalla está hecha para frenar, no para agilizar: obliga a escribir el nombre
// del aliado, pide el motivo y dice en voz alta lo que se lleva por delante.
//
// El permiso NO lo decide esta pantalla. /api/admin/delete-user comprueba con la
// service_role que quien llama sea el creador de esa cuenta y que el aliado no
// tenga clientes registrados; si los tiene, la baja es de Dirección, porque
// mover una cartera es una decisión comercial que no le toca al closer.

import React, { useState } from "react";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { useApp } from "@/utils/context/AppContext";

export function EliminarAliadoCloser({
  aliadoId,
  aliadoNombre,
  clientesTotal,
  onCerrar,
  onEliminado,
}: {
  aliadoId: string;
  aliadoNombre: string;
  clientesTotal: number;
  onCerrar: () => void;
  onEliminado: () => void | Promise<void>;
}) {
  const { deleteProfile } = useApp();

  const [confirmacion, setConfirmacion] = useState("");
  const [motivo, setMotivo] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const normaliza = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const nombreOk = normaliza(confirmacion) === normaliza(aliadoNombre);
  const motivoOk = motivo.trim().length >= 5;
  const tieneClientes = clientesTotal > 0;
  const puedeBorrar = nombreOk && motivoOk && !tieneClientes && !borrando;

  const borrar = async () => {
    if (!puedeBorrar) return;
    setBorrando(true);
    setErrorMsg("");
    try {
      await deleteProfile(aliadoId, { motivo: motivo.trim() });
      await onEliminado();
      onCerrar();
    } catch (err: any) {
      console.error("Error eliminando al aliado:", err);
      setErrorMsg(err?.message || "No se pudo eliminar la cuenta.");
      setBorrando(false);
    }
  };

  const campo =
    "w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-750 rounded-xl text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 transition-all";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Trash2 className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">Eliminar aliado</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{aliadoNombre}</p>
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
          <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-rose-800 dark:text-rose-300">Esto no se puede deshacer.</p>
              <p className="text-[11px] text-rose-700/90 dark:text-rose-400/80 mt-1 leading-relaxed">
                Se borra su cuenta de acceso y su ficha. Deja de contar en tu captación. Queda constancia de
                la baja, con tu nombre y el motivo, en el historial de Dirección.
              </p>
            </div>
          </div>

          {tieneClientes ? (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3">
              <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 leading-relaxed">
                Este aliado tiene {clientesTotal} cliente{clientesTotal === 1 ? "" : "s"} registrado
                {clientesTotal === 1 ? "" : "s"}. No puedes darlo de baja: primero hay que decidir a qué
                aliado pasan esos expedientes, y eso lo hace Dirección.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Motivo de la baja
                </label>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej.: se dio de alta por error, duplicado de otra cuenta…"
                  className={campo}
                />
                {motivo.length > 0 && !motivoOk && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                    Explícalo un poco más: esto es lo que va a leer Dirección.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Escribe <span className="font-bold text-slate-700 dark:text-slate-200">{aliadoNombre}</span> para
                  confirmar
                </label>
                <input
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  placeholder="Nombre completo del aliado"
                  className={campo}
                />
              </div>
            </>
          )}

          {errorMsg && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              <p className="text-[11px] text-rose-700 dark:text-rose-300">{errorMsg}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCerrar}
              className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-all active:scale-95"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={borrar}
              disabled={!puedeBorrar}
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5"
            >
              {borrando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {borrando ? "Eliminando…" : "Eliminar definitivamente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
