"use client";

// Pestaña ALIADOS del módulo Reportes.
//
// Los cuatro reportes del boceto:
//   1. Productividad     — proyectos / evaluados / aprobados / otorgado en el tiempo.
//   2. Ranking           — barras por aliado (o por empresa) + tasas superpuestas.
//   3. Sub estados       — panel compartido, clicable hasta el expediente.
//   4. Tipos de financ.  — dona de distribución del producto.
//
// Todo se calcula sobre `prospects` del contexto, que ya viene recortado por rol:
// un Account Manager ve aquí su cartera y la Dirección lo ve todo. No hace falta
// volver a comprobar permisos, pero tampoco se puede asumir que dos roles vean
// el mismo número — y está bien que así sea.

import React, { useMemo, useState } from "react";
import {
  BarChart3,
  Download,
  LineChart as LineChartIcon,
  PieChart as PieIcon,
  Trophy,
  TrendingUp,
  Users,
} from "lucide-react";
import { useApp } from "@/utils/context/AppContext";
import { AliadoPicker, prospectMatchesSelection } from "@/components/ui/AliadoPicker";
import { StatCard } from "@/components/ui/StatCard";
import {
  ChipTasa,
  Donut,
  DonutLegend,
  GrupoBarrasChart,
  Leyenda,
  PanelHeader,
  RankingChart,
  SerieChart,
  Vacio,
  colorMapEstable,
  colorSlot,
  pill,
  segmented,
  VIZ_MUTED_VAR,
} from "./ReportesCharts";
import { SubEstadosPanel } from "./SubEstadosPanel";
import type { ReportesFilters } from "./reportesFilters";
import {
  type Grano,
  GRANO_LABEL,
  METRICAS,
  METRICAS_RANKING,
  SERIES_ALIADOS,
  agrupaPor,
  aplicaFiltros,
  calcTasas,
  construyeCubos,
  finKindOf,
  fmtPct,
  serieDe,
} from "./reportesTypes";

/**
 * El aliado capturó SU PROPIO proyecto: quien lo tecleó (`created_by`) es el
 * mismo aliado dueño y lo hizo con sombrero de aliado. Si lo capturó su Account
 * Manager a su nombre, el proyecto sigue siendo del aliado pero NO cuenta como
 * uso de la plataforma. Los proyectos anteriores a la medición (`created_by` en
 * null) no cuentan: ver 20260824000000_creador_de_proyecto.sql.
 */
const esAltaPropiaDelAliado = (p: { created_by?: string | null; created_by_role?: string | null; aliado_id: string }) =>
  !!p.created_by && p.created_by === p.aliado_id && p.created_by_role === "aliado";

const GRANOS: Grano[] = ["dia", "semana", "mes", "anio"];
/** Barras que caben sin que el eje X se vuelva ilegible. El resto se dice, no se esconde. */
const TOPE_RANKING = 20;

type AgruparPor = "aliado" | "empresa";

export function AliadosReportes({
  filters,
  setFilters,
}: {
  filters: ReportesFilters;
  setFilters: (patch: Partial<ReportesFilters>) => void;
}) {
  const { user, prospects, profiles, empresasMultialiado, isProspectDeleted, isProspectPurged } = useApp();
  const [agrupar, setAgrupar] = useState<AgruparPor>("aliado");
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());

  const perfilPorId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const empresaPorId = useMemo(() => new Map(empresasMultialiado.map((e) => [e.id, e.nombre])), [empresasMultialiado]);

  // ── Universo del reporte ───────────────────────────────────────────────────
  const items = useMemo(() => {
    const vivos = prospects.filter((p) => !isProspectDeleted(p) && !isProspectPurged(p));
    const porSeleccion = vivos.filter((p) => prospectMatchesSelection(p, filters.entidades, profiles));
    return aplicaFiltros(porSeleccion, filters, perfilPorId);
  }, [prospects, profiles, filters, perfilPorId, isProspectDeleted, isProspectPurged]);

  const tasas = useMemo(() => calcTasas(items), [items]);

  // ── 1 · Productividad en el tiempo ─────────────────────────────────────────
  const cubos = useMemo(
    () => construyeCubos(items.map((p) => p.created_at), filters.desde, filters.hasta, filters.grano),
    [items, filters.desde, filters.hasta, filters.grano]
  );

  const seriesTiempo = useMemo(
    () =>
      SERIES_ALIADOS.map((id) => {
        const m = METRICAS[id];
        return {
          id,
          label: m.label,
          color: colorSlot(m.slot),
          values: serieDe(items, cubos, filters.grano, m.match, filters.acumulado),
        };
      }),
    [items, cubos, filters.grano, filters.acumulado]
  );

  const leyendaTiempo = seriesTiempo.map((s) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    // Con curva acumulada el total ya es el último punto; sumar los cubos lo
    // contaría varias veces.
    total: filters.acumulado ? s.values[s.values.length - 1] ?? 0 : s.values.reduce((a, b) => a + b, 0),
  }));

  // ── 2 · Ranking ────────────────────────────────────────────────────────────
  const grupos = useMemo(() => {
    if (agrupar === "empresa") {
      return agrupaPor(
        items,
        (p) => p.empresa_multialiado_id || perfilPorId.get(p.aliado_id)?.empresa_multialiado_id || null,
        (id) => empresaPorId.get(id) || "Empresa",
        "Independientes"
      );
    }
    return agrupaPor(
      items,
      (p) => p.aliado_id || null,
      (id) => perfilPorId.get(id)?.full_name || "Aliado",
      "Sin aliado"
    );
  }, [items, agrupar, perfilPorId, empresaPorId]);

  // El color sigue a la entidad por ANTIGÜEDAD, no por su puesto en el ranking:
  // reordenar por otra métrica no puede repintar las barras.
  const colorPorEntidad = useMemo(() => {
    const ids =
      agrupar === "empresa"
        ? empresasMultialiado.map((e) => e.id)
        : profiles
            .filter((p) => p.role === "aliado")
            .slice()
            .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "") || a.id.localeCompare(b.id))
            .map((p) => p.id);
    return colorMapEstable(ids);
  }, [agrupar, profiles, empresasMultialiado]);

  const metrica = METRICAS[filters.metrica];

  const ranking = useMemo(() => {
    const filas = grupos
      .map((g) => {
        const t = calcTasas(g.items);
        return {
          id: g.id,
          nombre: g.nombre,
          color: colorPorEntidad.get(g.id) || VIZ_MUTED_VAR,
          valor: g.items.filter(metrica.match).length,
          proyectos: t.proyectos,
          tasas: [
            { id: "aprob", label: "T. aprobación", color: "var(--rp-2)", value: t.aprobacion },
            { id: "cierre", label: "T. cierre", color: "var(--rp-7)", value: t.cierre },
          ],
        };
      })
      .sort((a, b) => b.valor - a.valor || b.proyectos - a.proyectos);
    return { filas, visibles: filas.slice(0, TOPE_RANKING) };
  }, [grupos, metrica, colorPorEntidad]);

  // ── 4 · Dona de producto ───────────────────────────────────────────────────
  const dona = useMemo(() => {
    let cn = 0,
      m40 = 0,
      m10 = 0;
    for (const p of items) {
      const k = finKindOf(p);
      if (k === "credito_nomina") cn++;
      else if (k === "modalidad_10") m10++;
      else if (k === "modalidad_40") m40++;
    }
    return [
      { label: "Crédito de nómina", value: cn, color: colorSlot(0) },
      { label: "Modalidad 40", value: m40, color: colorSlot(2) },
      { label: "Modalidad 10", value: m10, color: colorSlot(4) },
    ].filter((s) => s.value > 0);
  }, [items]);
  const donaTotal = dona.reduce((s, x) => s + x.value, 0);

  // ── Exportar el ranking, respetando los filtros ────────────────────────────
  const exportCsv = () => {
    const esc = (v: string | number) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cols = METRICAS_RANKING.map((id) => METRICAS[id].label);
    const rows: (string | number)[][] = [
      [agrupar === "empresa" ? "Empresa" : "Aliado", ...cols, "T. aprobación %", "T. condicionamiento %", "T. cierre %", "Altas propias", "Altas propias %"],
    ];
    grupos
      .slice()
      .sort((a, b) => b.items.filter(metrica.match).length - a.items.filter(metrica.match).length)
      .forEach((g) => {
        const t = calcTasas(g.items);
        rows.push([
          g.nombre,
          ...METRICAS_RANKING.map((id) => g.items.filter(METRICAS[id].match).length),
          (t.aprobacion ?? 0).toFixed(1),
          (t.condicionamiento ?? 0).toFixed(1),
          (t.cierre ?? 0).toFixed(1),
          g.items.filter(esAltaPropiaDelAliado).length,
          g.items.length > 0 ? ((g.items.filter(esAltaPropiaDelAliado).length / g.items.length) * 100).toFixed(1) : "0.0",
        ]);
      });
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-aliados-${new Date().toISOString().substring(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleSerie = (id: string) =>
    setOcultas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // El contexto normaliza 'admin' a 'director' al cargar el perfil, así que aquí
  // solo existe 'director' aunque en la base convivan los dos valores.
  const esDireccion = user?.role === "director";

  return (
    <div className="space-y-5">
      {/* ── Selección de aliados (el «TODOS / FILTROS ALIADO» del boceto) ──── */}
      {esDireccion && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-emerald-500/10">
              <Users className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-slate-800 dark:text-white">Aliados incluidos</h4>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                {filters.entidades.length === 0 ? "Todos los aliados." : `${filters.entidades.length} seleccionado(s).`}
              </p>
            </div>
          </div>
          <AliadoPicker profiles={profiles} selected={filters.entidades} onChange={(sel) => setFilters({ entidades: sel })} accent="emerald" />
        </div>
      )}

      {/* ── Tarjetas de cabecera ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Proyectos" value={tasas.proyectos} sub="en el período" icon={Users} tone="slate" />
        {METRICAS_RANKING.filter((id) => id !== "proyectos").map((id) => (
          <StatCard key={id} label={METRICAS[id].label} value={items.filter(METRICAS[id].match).length} tone="slate" />
        ))}
        <StatCard label="Tasa de cierre" value={fmtPct(tasas.cierre)} sub="otorgados / proyectos" tone="emerald" />
      </div>

      {/* ── 1 · Productividad ─────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
        <PanelHeader
          icon={TrendingUp}
          tone="emerald"
          title="Productividad de aliados"
          subtitle={`Agrupado por ${GRANO_LABEL[filters.grano].toLowerCase()} · ${
            filters.acumulado ? "total corrido" : "cantidad del período"
          }. «Proyectos» incluye los cerrados perdidos.`}
        >
          <div className={segmented}>
            {GRANOS.map((g) => (
              <button key={g} onClick={() => setFilters({ grano: g })} className={pill(filters.grano === g)}>
                {GRANO_LABEL[g]}
              </button>
            ))}
          </div>
          <div className={segmented}>
            <button onClick={() => setFilters({ tipoGrafico: "lineas" })} className={pill(filters.tipoGrafico === "lineas")}>
              <LineChartIcon className="h-3.5 w-3.5 inline -mt-0.5 mr-1" /> Líneas
            </button>
            <button onClick={() => setFilters({ tipoGrafico: "barras" })} className={pill(filters.tipoGrafico === "barras")}>
              <BarChart3 className="h-3.5 w-3.5 inline -mt-0.5 mr-1" /> Barras
            </button>
          </div>
          <button
            onClick={() => setFilters({ acumulado: !filters.acumulado })}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all border ${
              filters.acumulado
                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            Acumulado
          </button>
        </PanelHeader>

        <SerieChart cubos={cubos} series={seriesTiempo.filter((s) => !ocultas.has(s.id))} tipo={filters.tipoGrafico} />
        <Leyenda series={leyendaTiempo} onToggle={toggleSerie} ocultas={ocultas} />
      </div>

      {/* ── 2 · Ranking ───────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
        <PanelHeader
          icon={Trophy}
          tone="indigo"
          title={`Ranking de ${agrupar === "empresa" ? "empresas" : "aliados"}`}
          subtitle={
            ranking.filas.length > TOPE_RANKING
              ? `Mostrando ${TOPE_RANKING} de ${ranking.filas.length}. El CSV los trae todos.`
              : `${ranking.filas.length} ${agrupar === "empresa" ? "empresa(s)" : "aliado(s)"} con proyectos en el período.`
          }
        >
          <div className={segmented}>
            <button onClick={() => setAgrupar("aliado")} className={pill(agrupar === "aliado")}>
              Por aliado
            </button>
            <button onClick={() => setAgrupar("empresa")} className={pill(agrupar === "empresa")}>
              Por empresa
            </button>
          </div>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all active:scale-95"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2.4} /> CSV
          </button>
        </PanelHeader>

        <div className="flex flex-wrap items-center gap-3">
          <div className={`${segmented} flex-wrap`}>
            {METRICAS_RANKING.map((id) => (
              <button key={id} onClick={() => setFilters({ metrica: id })} className={pill(filters.metrica === id)}>
                {METRICAS[id].label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <ChipTasa label="Tasa aprob. general" value={fmtPct(tasas.aprobacion, 0)} tone="sky" />
            <ChipTasa label="Tasa condic. general" value={fmtPct(tasas.condicionamiento, 0)} tone="amber" />
            <ChipTasa label="Tasa cierre general" value={fmtPct(tasas.cierre, 0)} tone="teal" />
          </div>
        </div>

        <RankingChart filas={ranking.visibles} metricaLabel={metrica.label} />
        <Leyenda
          series={[
            { id: "aprob", label: "T. aprobación (eje derecho)", color: "var(--rp-2)" },
            { id: "cierre", label: "T. cierre (eje derecho)", color: "var(--rp-7)" },
          ]}
        />

        {ranking.visibles.length > 0 && (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-xs min-w-[680px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                  {[agrupar === "empresa" ? "Empresa" : "Aliado", ...METRICAS_RANKING.map((id) => METRICAS[id].short), "T. aprob.", "T. cierre", "Altas propias"].map(
                    (h, i) => (
                      <th
                        key={h + i}
                        className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 ${i > 0 ? "text-right" : ""}`}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {ranking.visibles.map((f) => {
                  const g = grupos.find((x) => x.id === f.id);
                  const t = calcTasas(g?.items || []);
                  return (
                    <tr key={f.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: f.color }} />
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[220px]" title={f.nombre}>
                            {f.nombre}
                          </span>
                        </div>
                      </td>
                      {METRICAS_RANKING.map((id) => (
                        <td key={id} className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {(g?.items || []).filter(METRICAS[id].match).length}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-700 dark:text-slate-200">{fmtPct(t.aprobacion)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-700 dark:text-slate-200">{fmtPct(t.cierre)}</td>
                      {/* Adopción: cuántos de esos proyectos los tecleó el propio aliado. */}
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {(() => {
                          const todos = g?.items || [];
                          const propias = todos.filter(esAltaPropiaDelAliado).length;
                          const pct = todos.length > 0 ? (propias / todos.length) * 100 : 0;
                          return (
                            <span className={propias === 0 ? "text-slate-400 dark:text-slate-500" : "text-emerald-600 dark:text-emerald-400"}>
                              {propias}
                              <span className="text-slate-400 dark:text-slate-500 font-medium"> · {pct.toFixed(0)}%</span>
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 3 · Sub estados ───────────────────────────────────────────────── */}
      <SubEstadosPanel
        items={items}
        profiles={profiles}
        subtitulo="Dónde están parados los proyectos de estos aliados. Toca una subetapa para desplegarlos."
      />

      {/* ── 4 · Distribución de producto ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
          <PanelHeader icon={PieIcon} tone="sky" title="Tipos de financiamiento" subtitle="Distribución de los proyectos." />
          {donaTotal === 0 ? (
            <Vacio>Sin proyectos con producto definido en el período.</Vacio>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <Donut segments={dona} centerTop={String(donaTotal)} centerBottom="PROYECTOS" />
              <DonutLegend segments={dona} total={donaTotal} />
            </div>
          )}
        </div>

        {/* Comparativa de estados entre las entidades de cabeza: el mismo dato del
            ranking, pero enfrentando todas las métricas a la vez. */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
          <PanelHeader
            icon={BarChart3}
            tone="teal"
            title={`Estados por ${agrupar === "empresa" ? "empresa" : "aliado"}`}
            subtitle={`Los ${Math.min(8, ranking.filas.length)} primeros por ${metrica.label.toLowerCase()}.`}
          />
          <GrupoBarrasChart
            entidades={ranking.filas.slice(0, 8).map((f) => ({ id: f.id, nombre: f.nombre }))}
            series={METRICAS_RANKING.filter((id) => id !== "proyectos").map((id) => ({
              id,
              label: METRICAS[id].label,
              color: colorSlot(METRICAS[id].slot),
              values: ranking.filas.slice(0, 8).map((f) => (grupos.find((g) => g.id === f.id)?.items || []).filter(METRICAS[id].match).length),
            }))}
          />
          <Leyenda
            series={METRICAS_RANKING.filter((id) => id !== "proyectos").map((id) => ({
              id,
              label: METRICAS[id].label,
              color: colorSlot(METRICAS[id].slot),
              total: items.filter(METRICAS[id].match).length,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
