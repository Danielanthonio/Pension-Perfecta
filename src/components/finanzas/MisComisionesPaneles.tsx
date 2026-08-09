"use client";

// Las tres tablas de «Mis comisiones»: qué he generado, qué me han depositado y
// con qué tarifas se me calcula.
//
// Todas son de SOLO LECTURA. No hay aquí un botón que apruebe, observe, ajuste o
// marque nada: el beneficiario mira su liquidación, no la administra. Lo que
// aparece en pantalla ya viene recortado a `auth.uid()` desde Postgres
// (20260810000000); estos componentes solo lo pintan.

import React, { useMemo, useState } from "react";
import { Coins, Download, FileSpreadsheet, Receipt, Tag } from "lucide-react";
import { EstadoChip, Panel, Vacio, btnSecundario, pastilla, segmentado } from "./FinanzasUI";
import type { MiEvento, MiPago, MiTarifa } from "./useMisComisiones";
import { exportarCsv, exportarExcel } from "./finanzasExport";
import {
  type EstadoComision,
  CONCEPTO_LABEL,
  ESTADO_LABEL,
  METODO_PAGO_LABEL,
  PRODUCTO_CORTO,
  PRODUCTO_LABEL,
  ROL_LABEL,
  TIPO_EVENTO_LABEL,
  fmtFecha,
  fmtFechaHora,
  fmtMoneda,
  fmtNumero,
} from "./finanzasTypes";

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

/**
 * Estados que se ofrecen como filtro. `revertido` no está: los revertidos SÍ
 * salen en la tabla —tachados, para que nadie se pregunte adónde fue un importe
 * que vio ayer— pero pedir «enséñame solo lo que perdiste» no es una pregunta
 * que nadie se haga.
 */
const ESTADOS_FILTRO: EstadoComision[] = [
  "pendiente_revision",
  "aprobado",
  "enviado_finanzas",
  "pagado",
  "observado",
];

/** Qué operación respalda este peso: un cliente, un aliado, o un período. */
function origenDe(e: MiEvento): string {
  if (e.cliente_nombre) return e.cliente_nombre;
  if (e.aliado_nombre) return e.aliado_nombre;
  if (e.tipo_evento === "bono_mensual" || e.tipo_evento === "bono_trimestral" || e.tipo_evento === "salario_fijo") {
    return `Período ${e.periodo_corte}`;
  }
  return "—";
}

export function MisMovimientosPanel({
  eventos,
  periodoTexto,
  estado,
  onCambiarEstado,
}: {
  eventos: MiEvento[];
  periodoTexto: string;
  estado: EstadoComision | null;
  onCambiarEstado: (e: EstadoComision | null) => void;
}) {
  const filas = useMemo(
    () => [
      ["Fecha", "Concepto", "Origen", "Producto", "Importe", "Estado", "Corte", "Depositado el", "Referencia"],
      ...eventos.map((e) => [
        fmtFecha(e.fecha_devengo),
        TIPO_EVENTO_LABEL[e.tipo_evento] || e.tipo_evento,
        origenDe(e),
        e.tipo_producto ? PRODUCTO_LABEL[e.tipo_producto] : "—",
        e.monto,
        e.anulado_at ? "Anulado" : ESTADO_LABEL[e.estado] || e.estado,
        e.periodo_corte,
        fmtFecha(e.fecha_pago),
        e.referencia_pago || "",
      ]),
    ],
    [eventos]
  );

  return (
    <Panel
      titulo="Mis movimientos"
      descripcion={`Cada peso con la operación que lo generó · ${periodoTexto}`}
      icono={Coins}
      acciones={
        eventos.length > 0 ? (
          <>
            <button onClick={() => exportarCsv("mis-comisiones", filas)} className={btnSecundario}>
              <Download className="h-3.5 w-3.5" strokeWidth={2.4} /> CSV
            </button>
            <button
              onClick={() => exportarExcel("mis-comisiones", `Mis comisiones · ${periodoTexto}`, filas)}
              className={btnSecundario}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={2.4} /> Excel
            </button>
          </>
        ) : undefined
      }
    >
      <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 flex-wrap">
        <div className={segmentado}>
          <button onClick={() => onCambiarEstado(null)} className={pastilla(estado === null)}>
            Todos
          </button>
          {ESTADOS_FILTRO.map((e) => (
            <button key={e} onClick={() => onCambiarEstado(e)} className={pastilla(estado === e)}>
              {ESTADO_LABEL[e]}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
          {fmtNumero(eventos.length)} movimiento(s)
        </span>
      </div>

      {eventos.length === 0 ? (
        <Vacio
          mensaje="No hay movimientos en este período."
          hint="Prueba con «Histórico» en el filtro de arriba para ver todo lo que llevas acumulado."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                {["Fecha", "Concepto", "Origen", "Importe", "Estado"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 ${
                      i === 3 ? "text-right" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => {
                // Un movimiento revertido o anulado ya no cuenta para el total.
                // Se enseña igual, apagado, porque su ausencia sin explicación es
                // lo que hace que alguien baje a preguntar.
                const muerto = e.estado === "revertido" || !!e.anulado_at;
                return (
                  <tr
                    key={e.id}
                    className={`border-b border-slate-50 dark:border-slate-800/60 last:border-0 ${
                      muerto ? "opacity-55" : ""
                    }`}
                  >
                    <td className="px-5 py-3 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums align-top">
                      {fmtFecha(e.fecha_devengo)}
                    </td>
                    <td className="px-5 py-3 align-top">
                      <p className="text-[12px] font-bold text-slate-700 dark:text-slate-200 leading-tight">
                        {TIPO_EVENTO_LABEL[e.tipo_evento] || e.tipo_evento}
                      </p>
                      {e.tipo_producto && (
                        <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {PRODUCTO_CORTO[e.tipo_producto]}
                        </span>
                      )}
                      {e.produccion !== null && e.produccion > 0 && (
                        <span className="ml-1 text-[10px] text-slate-400 dark:text-slate-500">
                          · {fmtNumero(e.produccion)} operación(es)
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 align-top">
                      <p className="text-[12px] text-slate-600 dark:text-slate-300 leading-tight">{origenDe(e)}</p>
                      {e.motivo_observacion && (
                        <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400 leading-snug max-w-xs">
                          {e.motivo_observacion}
                        </p>
                      )}
                      {e.observaciones && !e.motivo_observacion && (
                        <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 leading-snug max-w-xs">
                          {e.observaciones}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right align-top">
                      <span
                        className={`text-[12px] font-bold tabular-nums whitespace-nowrap ${
                          e.monto < 0
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-slate-800 dark:text-white"
                        } ${muerto ? "line-through" : ""}`}
                      >
                        {fmtMoneda(e.monto)}
                      </span>
                    </td>
                    <td className="px-5 py-3 align-top">
                      {e.anulado_at ? (
                        <EstadoChip estado="revertido" />
                      ) : (
                        <EstadoChip estado={e.estado} />
                      )}
                      {e.fecha_pago && (
                        <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                          Depositado el {fmtFecha(e.fecha_pago)}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Depósitos
// ---------------------------------------------------------------------------

export function MisDepositosPanel({ pagos, periodoTexto }: { pagos: MiPago[]; periodoTexto: string }) {
  const total = pagos.reduce((s, p) => s + p.monto_pagado, 0);

  return (
    <Panel
      titulo="Mis depósitos"
      // Se dice de frente por qué esta cifra no tiene por qué cuadrar con la de
      // arriba: aquí manda la fecha del DEPÓSITO, y un corte de un mes se paga
      // en el siguiente.
      descripcion={`Lo que se te ha depositado con fecha dentro de ${periodoTexto.toLowerCase()}, aunque se haya generado antes`}
      icono={Receipt}
      acciones={
        pagos.length > 0 ? (
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Total <strong className="text-slate-900 dark:text-white tabular-nums">{fmtMoneda(total)}</strong>
          </span>
        ) : undefined
      }
    >
      {pagos.length === 0 ? (
        <Vacio
          mensaje="Todavía no hay depósitos con fecha en este período."
          hint="Los depósitos los registra Finanzas cuando ejecuta el pago del corte."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                {["Fecha", "Método", "Referencia", "Importe"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 ${
                      i === 3 ? "text-right" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                  <td className="px-5 py-3 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums align-top">
                    {fmtFecha(p.fecha_pago)}
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      Registrado {fmtFechaHora(p.created_at)}
                    </p>
                  </td>
                  <td className="px-5 py-3 text-[12px] text-slate-600 dark:text-slate-300 align-top">
                    {METODO_PAGO_LABEL[p.metodo_pago as keyof typeof METODO_PAGO_LABEL] || p.metodo_pago}
                  </td>
                  <td className="px-5 py-3 align-top">
                    <p className="text-[12px] text-slate-600 dark:text-slate-300 break-all">
                      {p.referencia_bancaria || "—"}
                    </p>
                    {p.observaciones && (
                      <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 leading-snug max-w-xs">
                        {p.observaciones}
                      </p>
                    )}
                    {p.comprobante_url && (
                      <a
                        href={p.comprobante_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-[10px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        Ver comprobante
                      </a>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-[12px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums whitespace-nowrap align-top">
                    {fmtMoneda(p.monto_pagado)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Tarifas
// ---------------------------------------------------------------------------

/**
 * La tabla de tarifas de MI rol. La base no manda ninguna de otro rol
 * (`mis_comisiones_tarifas`), así que aquí no hay nada que ocultar: solo que
 * ordenar.
 *
 * Las vigencias cerradas se guardan detrás de un botón en vez de mezclarse con
 * las vigentes: quien entra quiere saber cuánto le pagan HOY, y el histórico
 * solo hace falta cuando no cuadra una comisión vieja.
 */
export function MisTarifasPanel({ tarifas }: { tarifas: MiTarifa[] }) {
  const [verHistorico, setVerHistorico] = useState(false);

  const vigentes = tarifas.filter((t) => t.vigente_hoy);
  const historicas = tarifas.filter((t) => !t.vigente_hoy);
  const lista = verHistorico ? historicas : vigentes;

  const roles = useMemo(() => [...new Set(tarifas.map((t) => t.rol_beneficiario))], [tarifas]);

  return (
    <Panel
      titulo="Mis tarifas"
      descripcion={
        roles.length > 1
          ? `Los importes con los que se calcula lo tuyo, como ${roles
              .map((r) => ROL_LABEL[r] || r)
              .join(" y ")}`
          : "Los importes con los que se calcula cada una de tus comisiones"
      }
      icono={Tag}
      acciones={
        historicas.length > 0 ? (
          <button onClick={() => setVerHistorico((v) => !v)} className={btnSecundario}>
            {verHistorico ? "Ver las vigentes" : `Ver vigencias anteriores (${historicas.length})`}
          </button>
        ) : undefined
      }
    >
      {lista.length === 0 ? (
        <Vacio
          mensaje={verHistorico ? "No hay vigencias anteriores." : "Todavía no hay tarifas configuradas para tu rol."}
          hint={verHistorico ? undefined : "Las fija la Dirección desde el módulo de Finanzas."}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                {["Concepto", "Aplica a", "Importe", "Vigencia"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 ${
                      i === 2 ? "text-right" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                  <td className="px-5 py-3 align-top">
                    <p className="text-[12px] font-bold text-slate-700 dark:text-slate-200 leading-tight">
                      {CONCEPTO_LABEL[t.concepto as keyof typeof CONCEPTO_LABEL] || t.concepto}
                    </p>
                    {t.notas && (
                      <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 leading-snug max-w-sm">
                        {t.notas}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 align-top text-[11px] text-slate-600 dark:text-slate-300">
                    {t.producto ? PRODUCTO_LABEL[t.producto] : "Cualquier producto"}
                    {/* El umbral es la regla que más se malinterpreta: los tramos
                        no se suman, se cobra solo el más alto que se alcanza. */}
                    {t.umbral_min > 0 && (
                      <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                        Desde {fmtNumero(t.umbral_min)} operaciones en el período
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-[12px] font-bold text-slate-800 dark:text-white tabular-nums whitespace-nowrap align-top">
                    {fmtMoneda(t.monto)}
                  </td>
                  <td className="px-5 py-3 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap align-top tabular-nums">
                    Desde {fmtFecha(t.vigente_desde)}
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      {t.vigente_hasta ? `Hasta ${fmtFecha(t.vigente_hasta)}` : "Sin fecha de término"}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
