"use client";

// Pestaña "Resumen": las tarjetas del §8.1, el gráfico de pagos del §8.2, la
// distribución por rol del §8.3 y las validaciones obligatorias del §18.
//
// Ninguna cifra se calcula aquí: llega ya agregada de Postgres (o del motor
// local en modo demo). Esta pantalla solo elige cómo mostrarla.

import React, { useMemo } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Banknote,
  ClipboardCheck,
  Coins,
  LineChart as LineChartIcon,
  Send,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import {
  CloserChart,
  CloserChartLegend,
  CLOSER_MUTED_VAR,
  CLOSER_SERIES_VARS,
  type ChartBucket,
  type ChartSeries,
} from "@/components/closers/CloserChart";
import { Panel, Vacio, pastilla, segmentado } from "./FinanzasUI";
import {
  type FinanzasResumen,
  type Grano,
  type InconsistenciaRow,
  type LiquidacionRow,
  type RolBeneficiario,
  type SeriePoint,
  ROL_LABEL,
  bucketFullLabel,
  bucketLabel,
  fmtFecha,
  fmtMoneda,
  fmtMonedaCorta,
  fmtNumero,
  nextBucket,
} from "./finanzasTypes";

/** El color sigue al ROL, siempre el mismo en todo el módulo. */
const COLOR_ROL: Record<RolBeneficiario, string> = {
  director: CLOSER_SERIES_VARS[0],
  account_manager: CLOSER_SERIES_VARS[2],
  closer: CLOSER_SERIES_VARS[1],
  aliado: CLOSER_SERIES_VARS[3],
};

const ROLES: RolBeneficiario[] = ["director", "account_manager", "closer", "aliado"];

export type VistaGrafico = "rol" | "pago";

export function ResumenPanel({
  resumen,
  serie,
  liquidaciones,
  inconsistencias,
  grano,
  tipoGrafico,
  vistaGrafico,
  desde,
  hasta,
  seriesOcultas,
  onToggleSerie,
  onCambiarGrano,
  onCambiarTipo,
  onCambiarVista,
  onVerObservadas,
}: {
  resumen: FinanzasResumen;
  serie: SeriePoint[];
  liquidaciones: LiquidacionRow[];
  inconsistencias: InconsistenciaRow[];
  grano: Grano;
  tipoGrafico: "barras" | "lineas";
  vistaGrafico: VistaGrafico;
  desde: string;
  hasta: string;
  seriesOcultas: Set<string>;
  onToggleSerie: (id: string) => void;
  onCambiarGrano: (g: Grano) => void;
  onCambiarTipo: (t: "barras" | "lineas") => void;
  onCambiarVista: (v: VistaGrafico) => void;
  onVerObservadas: () => void;
}) {
  // ── Cubos del gráfico ──────────────────────────────────────────────────────
  // Se rellenan los períodos SIN movimiento: un hueco en el eje no es lo mismo
  // que un cero, y en un gráfico de pagos esa diferencia importa.
  const buckets = useMemo<ChartBucket[]>(() => {
    const presentes = [...new Set(serie.map((s) => s.periodo))].sort();
    if (presentes.length === 0) return [];
    const out: string[] = [];
    let cursor = presentes[0];
    const fin = presentes[presentes.length - 1];
    let guarda = 0;
    while (cursor <= fin && guarda < 400) {
      out.push(cursor);
      cursor = nextBucket(cursor, grano);
      guarda += 1;
    }
    return out.map((iso) => ({ iso, label: bucketLabel(iso, grano), full: bucketFullLabel(iso, grano) }));
  }, [serie, grano]);

  const series = useMemo<ChartSeries[]>(() => {
    if (buckets.length === 0) return [];
    const indice = new Map(buckets.map((b, i) => [b.iso, i]));

    if (vistaGrafico === "pago") {
      const pagado = new Array(buckets.length).fill(0);
      const pendiente = new Array(buckets.length).fill(0);
      for (const s of serie) {
        const i = indice.get(s.periodo);
        if (i === undefined) continue;
        pagado[i] += s.pagado;
        pendiente[i] += s.pendiente;
      }
      return [
        { id: "pagado", label: "Pagado", color: CLOSER_SERIES_VARS[2], values: pagado },
        { id: "pendiente", label: "Pendiente", color: CLOSER_SERIES_VARS[3], values: pendiente },
      ].filter((s) => !seriesOcultas.has(s.id));
    }

    return ROLES.map((rol) => {
      const values = new Array(buckets.length).fill(0);
      for (const s of serie) {
        if (s.rol !== rol) continue;
        const i = indice.get(s.periodo);
        if (i !== undefined) values[i] += s.generado;
      }
      return { id: rol, label: ROL_LABEL[rol], color: COLOR_ROL[rol] ?? CLOSER_MUTED_VAR, values };
    })
      .filter((s) => s.values.some((v) => v !== 0))
      .filter((s) => !seriesOcultas.has(s.id));
  }, [buckets, serie, vistaGrafico, seriesOcultas]);

  const leyenda = useMemo(() => {
    if (vistaGrafico === "pago") {
      const pagado = serie.reduce((s, x) => s + x.pagado, 0);
      const pendiente = serie.reduce((s, x) => s + x.pendiente, 0);
      return [
        { id: "pagado", label: "Pagado", color: CLOSER_SERIES_VARS[2], total: Math.round(pagado) },
        { id: "pendiente", label: "Pendiente", color: CLOSER_SERIES_VARS[3], total: Math.round(pendiente) },
      ];
    }
    return ROLES.map((rol) => ({
      id: rol,
      label: ROL_LABEL[rol],
      color: COLOR_ROL[rol],
      total: Math.round(serie.filter((s) => s.rol === rol).reduce((a, s) => a + s.generado, 0)),
    })).filter((l) => l.total !== 0);
  }, [serie, vistaGrafico]);

  // ── Distribución por rol (§8.3) ────────────────────────────────────────────
  const porRol = useMemo(() => {
    const filas = ROLES.map((rol) => {
      const del = liquidaciones.filter((l) => l.rol_beneficiario === rol);
      return {
        rol,
        personas: del.length,
        total: del.reduce((s, l) => s + l.total_a_pagar, 0),
        pagado: del.reduce((s, l) => s + l.total_pagado, 0),
        pendiente: del.reduce((s, l) => s + l.total_pendiente, 0),
      };
    }).filter((f) => f.personas > 0 || f.total !== 0);
    const mayor = Math.max(1, ...filas.map((f) => Math.abs(f.total)));
    return { filas, mayor };
  }, [liquidaciones]);

  const altas = inconsistencias.filter((i) => i.severidad === "alta");

  return (
    <div className="space-y-5">
      {/* ── §8.1 Tarjetas superiores ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Producción del periodo"
          value={fmtNumero(resumen.produccion_financiamientos)}
          sub="financiamientos"
          tone="slate"
          icon={TrendingUp}
        />
        <StatCard
          label="Comisiones generadas"
          value={fmtMonedaCorta(resumen.total_generado)}
          sub={`${fmtNumero(resumen.eventos_total)} eventos`}
          tone="indigo"
          icon={Coins}
        />
        <StatCard
          label="Pendiente de revisión"
          value={fmtMonedaCorta(resumen.total_pendiente_revision)}
          tone="slate"
          icon={ClipboardCheck}
        />
        <StatCard label="Aprobado" value={fmtMonedaCorta(resumen.total_aprobado)} tone="blue" icon={BadgeCheck} />
        <StatCard
          label="Enviado a Finanzas"
          value={fmtMonedaCorta(resumen.total_enviado_finanzas)}
          tone="cyan"
          icon={Send}
        />
        <StatCard
          label="Pendiente de pago"
          value={fmtMonedaCorta(resumen.total_pendiente_pago)}
          sub={`${fmtNumero(resumen.beneficiarios)} personas`}
          tone="amber"
          icon={Wallet}
        />
        <StatCard label="Pagado" value={fmtMonedaCorta(resumen.total_pagado)} tone="emerald" icon={Banknote} />
        <StatCard
          label="Ajustes y reversiones"
          value={fmtMonedaCorta(resumen.total_ajustes)}
          sub={resumen.total_observado ? `${fmtMonedaCorta(resumen.total_observado)} observado` : undefined}
          tone={resumen.total_ajustes < 0 ? "rose" : "slate"}
          icon={AlertTriangle}
        />
      </div>

      {/* ── §18 Validaciones obligatorias ──────────────────────────────────── */}
      {inconsistencias.length > 0 && (
        <Panel
          titulo="Antes de aprobar"
          descripcion="Operaciones que el sistema no puede calcular solo. Nada de esto entra a un corte hasta resolverse."
          icono={ShieldAlert}
          acciones={
            resumen.eventos_observados > 0 ? (
              <button onClick={onVerObservadas} className={pastilla(false)}>
                Ver las {resumen.eventos_observados} observadas →
              </button>
            ) : null
          }
        >
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
            {inconsistencias.slice(0, 40).map((i, idx) => (
              <li key={`${i.tipo}-${i.prospecto_id || i.aliado_id || idx}`} className="px-5 py-3 flex items-start gap-3">
                <span
                  className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${
                    i.severidad === "alta" ? "bg-rose-500" : "bg-amber-500"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-slate-700 dark:text-slate-200 leading-tight">{i.titulo}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">{i.detalle}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[180px]">
                    {i.referencia || "—"}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{fmtFecha(i.fecha)}</p>
                </div>
              </li>
            ))}
          </ul>
          {inconsistencias.length > 40 && (
            <p className="px-5 py-2.5 text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
              Se muestran las 40 primeras de {fmtNumero(inconsistencias.length)}. Hay {altas.length} de severidad alta.
            </p>
          )}
        </Panel>
      )}

      {/* ── §8.2 Gráfico de pagos ──────────────────────────────────────────── */}
      <Panel
        titulo="Evolución de las comisiones"
        descripcion={
          vistaGrafico === "pago"
            ? "Lo depositado frente a lo que sigue debiéndose, período a período."
            : "Cuánto genera cada rol en cada período."
        }
        icono={BarChart3}
        acciones={
          <>
            <div className={segmentado}>
              <button onClick={() => onCambiarVista("rol")} className={pastilla(vistaGrafico === "rol")}>
                Por rol
              </button>
              <button onClick={() => onCambiarVista("pago")} className={pastilla(vistaGrafico === "pago")}>
                Pagado vs pendiente
              </button>
            </div>
            <div className={segmentado}>
              {(["dia", "semana", "mes", "trimestre", "anio"] as Grano[]).map((g) => (
                <button key={g} onClick={() => onCambiarGrano(g)} className={pastilla(grano === g)}>
                  {{ dia: "Día", semana: "Semana", mes: "Mes", trimestre: "Trim.", anio: "Año" }[g]}
                </button>
              ))}
            </div>
            <div className={segmentado}>
              <button
                onClick={() => onCambiarTipo("barras")}
                className={pastilla(tipoGrafico === "barras")}
                title="Barras apiladas"
              >
                <BarChart3 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onCambiarTipo("lineas")}
                className={pastilla(tipoGrafico === "lineas")}
                title="Líneas"
              >
                <LineChartIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        }
      >
        <div className="px-4 pt-4 pb-3">
          {buckets.length === 0 ? (
            <Vacio
              mensaje="Todavía no hay comisiones devengadas en este período."
              hint="Usa «Recalcular devengo» si acabas de cerrar financiamientos."
            />
          ) : (
            <>
              <CloserChart buckets={buckets} series={series} tipo={tipoGrafico} />
              <div className="px-1">
                <CloserChartLegend series={leyenda} onToggle={onToggleSerie} hidden={seriesOcultas} />
              </div>
            </>
          )}
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── §8.3 Distribución por rol ────────────────────────────────────── */}
        <Panel
          titulo="Distribución por rol"
          descripcion="Cuánto le corresponde a cada figura del equipo en el período."
          icono={Coins}
        >
          {porRol.filas.length === 0 ? (
            <Vacio mensaje="Sin comisiones que repartir en este período." />
          ) : (
            <ul className="px-5 py-4 space-y-3.5">
              {porRol.filas.map((f) => (
                <li key={f.rol}>
                  <div className="flex items-baseline justify-between gap-3 mb-1.5">
                    <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200">
                      {ROL_LABEL[f.rol]}
                      <span className="ml-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                        {f.personas} {f.personas === 1 ? "persona" : "personas"}
                      </span>
                    </span>
                    <span className="text-[12px] font-bold tabular-nums text-slate-900 dark:text-white">
                      {fmtMoneda(f.total)}
                    </span>
                  </div>
                  {/* La barra se parte en pagado / pendiente para que el reparto y
                      el avance de pago se lean de un vistazo. */}
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                    <span
                      className="h-full"
                      style={{
                        width: `${(Math.max(0, f.pagado) / porRol.mayor) * 100}%`,
                        background: COLOR_ROL[f.rol],
                      }}
                    />
                    <span
                      className="h-full opacity-30"
                      style={{
                        width: `${(Math.max(0, f.pendiente) / porRol.mayor) * 100}%`,
                        background: COLOR_ROL[f.rol],
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    <span>Pagado {fmtMoneda(f.pagado)}</span>
                    <span>·</span>
                    <span>Pendiente {fmtMoneda(f.pendiente)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ── §8.4 Producción que respalda las comisiones ──────────────────── */}
        <Panel
          titulo="Producción del periodo"
          descripcion="Los hechos comerciales que sostienen cada peso de la tabla."
          icono={TrendingUp}
        >
          <dl className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-4">
            {[
              { t: "Financiamientos cerrados", v: resumen.produccion_financiamientos },
              { t: "Aliados cerrados", v: resumen.produccion_aliados },
              { t: "Primeros financiamientos", v: resumen.produccion_primeros },
              { t: "Beneficiarios con saldo", v: resumen.beneficiarios },
            ].map((x) => (
              <div key={x.t}>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                  {x.t}
                </dt>
                <dd className="mt-0.5 text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {fmtNumero(x.v)}
                </dd>
              </div>
            ))}
          </dl>
          <div className="px-5 pb-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 px-4 py-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Un mismo financiamiento genera hasta cuatro comisiones —Dirección, Account Manager, Closer y
                Aliado—, así que el número de eventos siempre es mayor que el de operaciones. El desglose completo
                está en la pestaña <strong>Producción</strong>.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
