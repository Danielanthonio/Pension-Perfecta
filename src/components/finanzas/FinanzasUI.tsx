"use client";

// Piezas de interfaz compartidas por las seis pestañas del módulo.
//
// Viven aquí y no en `src/components/ui` porque son específicas de Finanzas: un
// chip de estado de comisión o un diálogo que exige motivo no tienen sentido
// fuera de este módulo. El lenguaje visual sí es el mismo del resto de la app
// (superficies slate, esquinas 2xl, hairlines, acento esmeralda).

import React, { useEffect, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  type EstadoComision,
  type EstadoCorte,
  ESTADO_CORTE_LABEL,
  ESTADO_LABEL,
  estadoChip,
} from "./finanzasTypes";

// ---------------------------------------------------------------------------
// Chips y contenedores
// ---------------------------------------------------------------------------

export function EstadoChip({ estado, corte }: { estado: EstadoComision | EstadoCorte; corte?: boolean }) {
  const label = corte
    ? ESTADO_CORTE_LABEL[estado as EstadoCorte]
    : ESTADO_LABEL[estado as EstadoComision] ?? ESTADO_CORTE_LABEL[estado as EstadoCorte];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ring-1 ring-inset whitespace-nowrap ${estadoChip(estado)}`}
    >
      {label}
    </span>
  );
}

export function Panel({
  titulo,
  descripcion,
  icono: Icono,
  acciones,
  children,
  className = "",
}: {
  titulo: string;
  descripcion?: string;
  icono?: LucideIcon;
  acciones?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm shadow-slate-200/40 dark:shadow-none overflow-hidden ${className}`}
    >
      <header className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5 min-w-0">
          {Icono && (
            <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 flex items-center justify-center shrink-0">
              <Icono className="h-3.5 w-3.5" strokeWidth={2.2} />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-[13px] font-bold text-slate-800 dark:text-white leading-tight">{titulo}</h2>
            {descripcion && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug mt-0.5">{descripcion}</p>
            )}
          </div>
        </div>
        {acciones && <div className="flex items-center gap-2 flex-wrap">{acciones}</div>}
      </header>
      {children}
    </section>
  );
}

export function Vacio({ mensaje, hint }: { mensaje: string; hint?: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">{mensaje}</p>
      {hint && <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

export const btnPrimario =
  "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";

export const btnSecundario =
  "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed";

export const btnPeligro =
  "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm shadow-rose-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed";

export const inputBase =
  "w-full px-3 py-2 rounded-lg text-xs bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500 transition-colors";

export const segmentado =
  "flex items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 p-0.5 ring-1 ring-inset ring-slate-200/70 dark:ring-slate-700/50";

export const pastilla = (activa: boolean) =>
  `px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
    activa
      ? "bg-emerald-600 text-white shadow-sm"
      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
  }`;

export function Campo({
  etiqueta,
  requerido,
  hint,
  children,
}: {
  etiqueta: string;
  requerido?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {etiqueta} {requerido && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-snug">{hint}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({
  titulo,
  subtitulo,
  icono: Icono,
  ancho = "max-w-lg",
  onCerrar,
  children,
  pie,
}: {
  titulo: string;
  subtitulo?: string;
  icono?: LucideIcon;
  ancho?: string;
  onCerrar: () => void;
  children: React.ReactNode;
  pie?: React.ReactNode;
}) {
  // Escape cierra: en un módulo donde cada diálogo puede mover dinero, salir
  // tiene que ser siempre lo más fácil.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCerrar} />
      <div
        className={`relative w-full ${ancho} max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden`}
      >
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icono && (
              <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 flex items-center justify-center shrink-0">
                <Icono className="h-4 w-4" strokeWidth={2.2} />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{titulo}</h3>
              {subtitulo && <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{subtitulo}</p>}
            </div>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">{children}</div>

        {pie && (
          <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5 shrink-0">
            {pie}
          </div>
        )}
      </div>
    </div>
  );
}

export function Aviso({
  tono = "amber",
  children,
}: {
  tono?: "amber" | "rose" | "slate" | "emerald";
  children: React.ReactNode;
}) {
  const clases = {
    amber: "border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200",
    rose: "border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-200",
    slate: "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-slate-600 dark:text-slate-300",
    emerald:
      "border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200",
  }[tono];

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-start gap-2.5 ${clases}`}>
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 opacity-80" />
      <div className="text-[11px] leading-relaxed">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diálogo de confirmación con motivo obligatorio
// ---------------------------------------------------------------------------
// Todo lo que revierte, anula u observa exige explicación: sin el motivo, la
// bitácora del §20 registra el "quién" pero no el "por qué", que es lo que hace
// falta seis meses después.

export function DialogoMotivo({
  titulo,
  subtitulo,
  icono,
  descripcion,
  etiquetaBoton,
  placeholder,
  peligro,
  onCerrar,
  onConfirmar,
}: {
  titulo: string;
  subtitulo?: string;
  icono?: LucideIcon;
  descripcion: React.ReactNode;
  etiquetaBoton: string;
  placeholder?: string;
  peligro?: boolean;
  onCerrar: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const confirmar = async () => {
    if (!motivo.trim()) return;
    setGuardando(true);
    setErrorMsg("");
    try {
      await onConfirmar(motivo.trim());
    } catch (e: any) {
      setErrorMsg(e?.message || "No se pudo completar la operación.");
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo={titulo}
      subtitulo={subtitulo}
      icono={icono}
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar} className={btnSecundario}>
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!motivo.trim() || guardando}
            className={peligro ? btnPeligro : btnPrimario}
          >
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {etiquetaBoton}
          </button>
        </>
      }
    >
      <Aviso tono={peligro ? "rose" : "amber"}>{descripcion}</Aviso>
      <Campo etiqueta="Motivo" requerido hint="Queda en la bitácora y se muestra junto al movimiento.">
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          autoFocus
          placeholder={placeholder || "Explica qué pasó…"}
          className={`${inputBase} resize-none`}
        />
      </Campo>
      {errorMsg && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errorMsg}</p>}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Aviso flotante
// ---------------------------------------------------------------------------

export function Notificacion({
  mensaje,
  tono,
  onCerrar,
}: {
  mensaje: string;
  tono: "ok" | "error";
  onCerrar: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onCerrar, tono === "error" ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [onCerrar, tono]);

  return (
    <div
      role="status"
      className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl px-4 py-3 shadow-lg text-[11px] font-semibold leading-relaxed animate-fade-in ${
        tono === "ok"
          ? "bg-emerald-600 text-white shadow-emerald-600/25"
          : "bg-rose-600 text-white shadow-rose-600/25"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex-1">{mensaje}</span>
        <button onClick={onCerrar} aria-label="Cerrar aviso" className="opacity-70 hover:opacity-100 shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
