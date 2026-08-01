"use client";

// Pestaña "Producción" (§8.4): los hechos comerciales que sostienen cada peso.
//
// Mira `prospects` directamente, no el libro mayor. Es a propósito: la producción
// existe aunque todavía no haya devengado comisión — por ejemplo un
// financiamiento sin Account Manager asignado, que produce venta pero no pago.
// Enfrentar las dos cifras es justo lo que hace visible ese hueco.

import React, { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Layers, TrendingUp } from "lucide-react";
import { Panel, Vacio, pastilla, segmentado } from "./FinanzasUI";
import { exportarCsv, exportarExcel } from "./finanzasExport";
import { type ProduccionRow, PRODUCTO_CORTO, fmtNumero } from "./finanzasTypes";

type Dimension = "producto" | "account_manager" | "closer" | "aliado";

const DIMENSIONES: { id: Dimension; label: string }[] = [
  { id: "producto", label: "Por producto" },
  { id: "account_manager", label: "Por Account Manager" },
  { id: "closer", label: "Por Closer" },
  { id: "aliado", label: "Por Aliado" },
];

export function ProduccionPanel({
  produccion,
  dimension,
  periodoTexto,
  onCambiarDimension,
}: {
  produccion: ProduccionRow[];
  dimension: Dimension;
  periodoTexto: string;
  onCambiarDimension: (d: Dimension) => void;
}) {
  const [verTodo, setVerTodo] = useState(false);

  const totales = useMemo(
    () => ({
      financiamientos: produccion.reduce((s, r) => s + r.financiamientos, 0),
      mod_40: produccion.reduce((s, r) => s + r.mod_40, 0),
      mod_10: produccion.reduce((s, r) => s + r.mod_10, 0),
      credito_nomina: produccion.reduce((s, r) => s + r.credito_nomina, 0),
      mayor: Math.max(1, ...produccion.map((r) => r.financiamientos)),
    }),
    [produccion]
  );

  // Un financiamiento sin producto no tiene tarifa que aplicar: se destaca
  // porque es la causa número uno de comisiones observadas.
  const sinProducto = totales.financiamientos - totales.mod_40 - totales.mod_10 - totales.credito_nomina;

  const visibles = verTodo ? produccion : produccion.slice(0, 25);

  const datos = () => {
    const cabecera = ["Concepto", "Financiamientos", "Mod 40", "Mod 10", "Crédito de nómina"];
    return [
      cabecera,
      ...produccion.map((r) => [r.etiqueta, r.financiamientos, r.mod_40, r.mod_10, r.credito_nomina]),
      ["TOTAL", totales.financiamientos, totales.mod_40, totales.mod_10, totales.credito_nomina],
    ];
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { t: "Financiamientos ejecutados", v: totales.financiamientos, c: "text-slate-900 dark:text-white" },
          { t: "Financiamiento Mod 40", v: totales.mod_40, c: "text-blue-600 dark:text-blue-400" },
          { t: "Financiamiento Mod 10", v: totales.mod_10, c: "text-indigo-600 dark:text-indigo-400" },
          { t: "Crédito de nómina", v: totales.credito_nomina, c: "text-teal-600 dark:text-teal-400" },
        ].map((x) => (
          <div
            key={x.t}
            className="rounded-xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-sm shadow-slate-200/40 dark:shadow-none"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 leading-tight">
              {x.t}
            </p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums tracking-tight ${x.c}`}>{fmtNumero(x.v)}</p>
          </div>
        ))}
      </div>

      {sinProducto > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
          <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
            <strong>{fmtNumero(sinProducto)}</strong>{" "}
            {sinProducto === 1 ? "financiamiento no tiene" : "financiamientos no tienen"} producto definido: les falta la
            modalidad (40 / 10) o marcarlos como crédito de nómina. Sin producto no hay tarifa que aplicar, así que sus
            comisiones quedan en cero y observadas.
          </p>
        </div>
      )}

      <Panel
        titulo="Producción del periodo"
        descripcion={periodoTexto}
        icono={TrendingUp}
        acciones={
          <>
            <div className={segmentado}>
              {DIMENSIONES.map((d) => (
                <button key={d.id} onClick={() => onCambiarDimension(d.id)} className={pastilla(dimension === d.id)}>
                  {d.label}
                </button>
              ))}
            </div>
            <div className={segmentado}>
              <button onClick={() => exportarCsv("produccion", datos())} className={pastilla(false)} title="Exportar CSV">
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => exportarExcel("produccion", `Producción · ${periodoTexto}`, datos())}
                className={pastilla(false)}
                title="Exportar a Excel"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        }
      >
        {produccion.length === 0 ? (
          <Vacio
            mensaje="No hay financiamientos ejecutados en este período."
            hint="La producción se cuenta desde que el proyecto entra a «Cerrada Ganada»."
          />
        ) : (
          <>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibles.map((r) => (
                <li key={r.clave} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-3 mb-1.5">
                    <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200 truncate">
                      {r.etiqueta}
                    </span>
                    <span className="text-[13px] font-bold tabular-nums text-slate-900 dark:text-white shrink-0">
                      {fmtNumero(r.financiamientos)}
                    </span>
                  </div>
                  {/* La barra se parte por producto: se ve de un vistazo el mix de
                      cada persona, que es lo que mueve el importe de su comisión. */}
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                    {(
                      [
                        ["mod_40", "#2a78d6"],
                        ["mod_10", "#4a3aa7"],
                        ["credito_nomina", "#1baf7a"],
                      ] as const
                    ).map(([k, color]) => (
                      <span
                        key={k}
                        className="h-full"
                        style={{ width: `${(r[k] / totales.mayor) * 100}%`, background: color }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    <span>{PRODUCTO_CORTO.mod_40} {r.mod_40}</span>
                    <span>·</span>
                    <span>{PRODUCTO_CORTO.mod_10} {r.mod_10}</span>
                    <span>·</span>
                    <span>{PRODUCTO_CORTO.credito_nomina} {r.credito_nomina}</span>
                    {r.financiamientos - r.mod_40 - r.mod_10 - r.credito_nomina > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-amber-600 dark:text-amber-400">
                          Sin producto {r.financiamientos - r.mod_40 - r.mod_10 - r.credito_nomina}
                        </span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {produccion.length > 25 && (
              <button
                onClick={() => setVerTodo((v) => !v)}
                className="w-full px-5 py-2.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 transition-colors"
              >
                <Layers className="h-3.5 w-3.5 inline mr-1.5" />
                {verTodo ? "Ver menos" : `Ver los ${produccion.length - 25} restantes`}
              </button>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
