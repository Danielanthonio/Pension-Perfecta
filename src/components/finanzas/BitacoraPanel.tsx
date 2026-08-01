"use client";

// Pestaña "Bitácora" (§20): quién revisó, quién aprobó, quién envió y quién
// confirmó cada pago, con su fecha, los estados de antes y después y los montos
// implicados.
//
// Es una tabla append-only: no hay forma de editar ni de borrar una línea desde
// ninguna parte de la aplicación —tampoco para la Dirección—, porque la tabla no
// tiene políticas de UPDATE ni de DELETE. Auditar algo que se puede reescribir no
// sirve de nada.

import React, { useEffect, useMemo, useState } from "react";
import { Download, History, Loader2, Search } from "lucide-react";
import { Panel, Vacio, inputBase, pastilla, segmentado } from "./FinanzasUI";
import { exportarCsv } from "./finanzasExport";
import { type AuditoriaRow, ESTADO_LABEL, fmtFechaHora, fmtMoneda } from "./finanzasTypes";

const ENTIDADES = [
  { id: "", label: "Todo" },
  { id: "evento", label: "Comisiones" },
  { id: "corte", label: "Cortes" },
  { id: "pago", label: "Pagos" },
  { id: "tarifa", label: "Tarifas" },
  { id: "config", label: "Configuración" },
];

const ACCION_LABEL: Record<string, string> = {
  aprobacion: "Aprobó",
  observacion: "Observó",
  reapertura: "Devolvió a revisión",
  ajuste_manual: "Registró un ajuste",
  reversion_manual: "Revirtió",
  reversion_automatica: "Reversión automática",
  sincronizacion: "Recalculó el devengo",
  generacion: "Generó el corte",
  aprobar: "Aprobó el corte",
  enviar: "Envió a Finanzas",
  anular: "Anuló el corte",
  anulacion: "Anuló el corte",
  envio_finanzas: "Envió a Finanzas",
  registro_pago: "Confirmó un depósito",
  alta_tarifa: "Dio de alta una tarifa",
  cierre_vigencia: "Cerró una vigencia",
  configuracion: "Cambió la configuración",
};

/** Etiqueta legible de un estado, venga del catálogo de comisiones o del de cortes. */
const estadoTexto = (v: string | null): string | null => {
  if (!v) return null;
  return (ESTADO_LABEL as Record<string, string>)[v] || v.replace(/_/g, " ");
};

export function BitacoraPanel({
  fetchAuditoria,
  onAviso,
}: {
  fetchAuditoria: (entidad?: string, entidadId?: string) => Promise<AuditoriaRow[]>;
  onAviso: (mensaje: string, tono: "ok" | "error") => void;
}) {
  const [entidad, setEntidad] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filas, setFilas] = useState<AuditoriaRow[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    fetchAuditoria(entidad || undefined)
      .then((r) => {
        if (vivo) setFilas(r);
      })
      .catch(() => {
        if (vivo) onAviso("No se pudo cargar la bitácora.", "error");
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [entidad, fetchAuditoria, onAviso]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter(
      (f) =>
        f.actor_nombre.toLowerCase().includes(q) ||
        (f.comentario || "").toLowerCase().includes(q) ||
        (ACCION_LABEL[f.accion] || f.accion).toLowerCase().includes(q)
    );
  }, [filas, busqueda]);

  const exportar = () => {
    exportarCsv("bitacora-comisiones", [
      ["Fecha y hora", "Usuario", "Acción", "Entidad", "Estado anterior", "Estado nuevo", "Monto anterior", "Monto nuevo", "Comentario"],
      ...visibles.map((f) => [
        fmtFechaHora(f.created_at),
        f.actor_nombre,
        ACCION_LABEL[f.accion] || f.accion,
        f.entidad,
        estadoTexto(f.estado_anterior) || "",
        estadoTexto(f.estado_nuevo) || "",
        f.monto_anterior !== null ? fmtMoneda(f.monto_anterior) : "",
        f.monto_nuevo !== null ? fmtMoneda(f.monto_nuevo) : "",
        f.comentario || "",
      ]),
    ]);
  };

  return (
    <Panel
      titulo="Bitácora de auditoría"
      descripcion="Toda acción sobre una comisión, un corte, un pago o una tarifa queda registrada. No se puede editar ni borrar."
      icono={History}
      acciones={
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar…"
              className={`${inputBase} pl-9 w-44`}
            />
          </div>
          <div className={segmentado}>
            {ENTIDADES.map((e) => (
              <button key={e.id || "todo"} onClick={() => setEntidad(e.id)} className={pastilla(entidad === e.id)}>
                {e.label}
              </button>
            ))}
          </div>
          <button onClick={exportar} className={pastilla(false)} title="Exportar CSV">
            <Download className="h-3.5 w-3.5" />
          </button>
        </>
      }
    >
      {cargando ? (
        <div className="py-14 text-center">
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-300 dark:text-slate-600" />
        </div>
      ) : visibles.length === 0 ? (
        <Vacio
          mensaje="Todavía no hay movimientos registrados."
          hint="La bitácora empieza a llenarse con la primera revisión o el primer corte."
        />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[560px] overflow-y-auto">
          {visibles.map((f) => {
            const anterior = estadoTexto(f.estado_anterior);
            const nuevo = estadoTexto(f.estado_nuevo);
            return (
              <li key={f.id} className="px-5 py-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-slate-700 dark:text-slate-200 leading-snug">
                    <strong className="font-bold">{f.actor_nombre}</strong>{" "}
                    <span className="text-slate-500 dark:text-slate-400">
                      {(ACCION_LABEL[f.accion] || f.accion).toLowerCase()}
                    </span>
                    {anterior && nuevo && (
                      <span className="text-slate-400 dark:text-slate-500">
                        {" "}
                        · {anterior} → <strong className="text-slate-600 dark:text-slate-300">{nuevo}</strong>
                      </span>
                    )}
                  </p>
                  {f.comentario && (
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{f.comentario}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {f.monto_nuevo !== null && (
                    <p
                      className={`text-[12px] font-bold tabular-nums ${
                        f.monto_nuevo < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {fmtMoneda(f.monto_nuevo)}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                    {fmtFechaHora(f.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
