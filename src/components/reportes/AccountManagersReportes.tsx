"use client";

// Pestaña ACCOUNT MANAGER del módulo Reportes.
//
// Los reportes del boceto:
//   1. Productividad diaria  — 6 series, cantidad DEL PERÍODO (no acumulada).
//   2. Ranking AM            — barras + tasas generales.
//   3. Estados por AM        — línea de tiempo clicable arriba, barras abajo.
//   4. AM x Estados (grupo)  — barras agrupadas, todas las métricas a la vez.
//   5. AM «Agenda»           — objetivo (lo teclea Dirección) contra real.
//   6. Sub estados           — panel compartido con la pestaña ALIADOS.
//
// El AM del proyecto vive en `prospects.account_manager_id`, no en el aliado
// (ver [[project-am-por-proyecto]]): un proyecto sin AM es mesa de dirección y se
// cuenta como una columna más. Esconderlo haría que las barras no sumaran el total.

import React, { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarCheck,
  Download,
  LineChart as LineChartIcon,
  Layers3,
  Route,
  Trophy,
  TrendingUp,
  Users,
} from "lucide-react";
import { useApp } from "@/utils/context/AppContext";
import { StatCard } from "@/components/ui/StatCard";
import { STEP_DEFS, STEP_STATUSES } from "@/components/ui/projectStepper";
import {
  ChipTasa,
  GrupoBarrasChart,
  Leyenda,
  ObjetivoRealChart,
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
import { useObjetivosAM } from "./useObjetivosAM";
import type { ReportesFilters } from "./reportesFilters";
import {
  type Grano,
  GRANO_LABEL,
  METRICAS,
  METRICAS_RANKING,
  SERIES_AM,
  agrupaPor,
  aplicaFiltros,
  avanceDelMes,
  calcTasas,
  construyeCubos,
  fmtNum,
  fmtPct,
  mesDe,
  mesLabel,
  objetivoALaFecha,
  serieDe,
} from "./reportesTypes";

const GRANOS: Grano[] = ["dia", "semana", "mes", "anio"];
const SIN_AM = "__sin__";

export function AccountManagersReportes({
  filters,
  setFilters,
}: {
  filters: ReportesFilters;
  setFilters: (patch: Partial<ReportesFilters>) => void;
}) {
  const { prospects, profiles, isProspectDeleted, isProspectPurged } = useApp();
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [pasoSel, setPasoSel] = useState<string>(STEP_STATUSES[1]);

  const perfilPorId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const items = useMemo(() => {
    const vivos = prospects.filter((p) => !isProspectDeleted(p) && !isProspectPurged(p));
    const porSeleccion =
      filters.entidades.length === 0
        ? vivos
        : vivos.filter((p) => filters.entidades.includes(p.account_manager_id || SIN_AM));
    return aplicaFiltros(porSeleccion, filters, perfilPorId);
  }, [prospects, filters, perfilPorId, isProspectDeleted, isProspectPurged]);

  const tasas = useMemo(() => calcTasas(items), [items]);

  // ── Agrupación por Account Manager ─────────────────────────────────────────
  const grupos = useMemo(
    () =>
      agrupaPor(
        items,
        (p) => p.account_manager_id || null,
        (id) => perfilPorId.get(id)?.full_name || "Account Manager",
        "Mesa de dirección"
      ),
    [items, perfilPorId]
  );

  const colorPorAM = useMemo(() => {
    const ids = profiles
      .filter((p) => p.role === "account_manager")
      .slice()
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "") || a.id.localeCompare(b.id))
      .map((p) => p.id);
    return colorMapEstable(ids);
  }, [profiles]);

  const metrica = METRICAS[filters.metrica];

  const ranking = useMemo(
    () =>
      grupos
        .map((g) => {
          const t = calcTasas(g.items);
          return {
            id: g.id,
            nombre: g.nombre,
            color: colorPorAM.get(g.id) || VIZ_MUTED_VAR,
            valor: g.items.filter(metrica.match).length,
            proyectos: t.proyectos,
            tasas: [
              { id: "aprob", label: "T. aprobación", color: "var(--rp-2)", value: t.aprobacion },
              { id: "cierre", label: "T. cierre", color: "var(--rp-7)", value: t.cierre },
            ],
          };
        })
        .sort((a, b) => b.valor - a.valor || b.proyectos - a.proyectos),
    [grupos, metrica, colorPorAM]
  );

  // ── 1 · Productividad ──────────────────────────────────────────────────────
  const cubos = useMemo(
    () => construyeCubos(items.map((p) => p.created_at), filters.desde, filters.hasta, filters.grano),
    [items, filters.desde, filters.hasta, filters.grano]
  );

  const seriesTiempo = useMemo(
    () =>
      SERIES_AM.map((id) => {
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
    total: filters.acumulado ? s.values[s.values.length - 1] ?? 0 : s.values.reduce((a, b) => a + b, 0),
  }));

  // ── 3 · Estados por AM (línea de tiempo clicable) ──────────────────────────
  const pasos = useMemo(
    () =>
      STEP_STATUSES.map((status, i) => ({
        status,
        label: STEP_DEFS[i].label,
        count: items.filter((p) => p.status === status).length,
      })),
    [items]
  );

  const barrasPaso = useMemo(
    () =>
      grupos
        .map((g) => ({
          id: g.id,
          nombre: g.nombre,
          color: colorPorAM.get(g.id) || VIZ_MUTED_VAR,
          valor: g.items.filter((p) => p.status === pasoSel).length,
        }))
        .sort((a, b) => b.valor - a.valor),
    [grupos, pasoSel, colorPorAM]
  );
  const etiquetaPaso = STEP_DEFS[STEP_STATUSES.indexOf(pasoSel as (typeof STEP_STATUSES)[number])]?.label ?? "Etapa";

  // ── 5 · Agenda: objetivo vs. real ──────────────────────────────────────────
  // La meta es MENSUAL, así que este panel trabaja en meses aunque el resto de la
  // pestaña esté mirando un rango cualquiera. El mes sale del final del rango
  // elegido, topado en el mes en curso: con «Año actual» el rango termina el 31
  // de diciembre y la meta se leería como la de un mes que aún no ha llegado.
  const periodo = useMemo(() => {
    const mesActual = mesDe(null);
    const pedido = mesDe(filters.hasta || null);
    return pedido > mesActual ? mesActual : pedido;
  }, [filters.hasta]);
  // La métrica del objetivo es la SUYA, no la del ranking. Iban juntas y era un
  // error: cada métrica guarda su propia meta, así que reordenar el ranking
  // cambiaba en silencio el juego de objetivos y dos personas con la misma
  // pantalla veían cifras distintas sin pista de por qué.
  const metricaObj = METRICAS[filters.metricaObjetivo];
  const { objetivos, error: errorObjetivos, puedeEditar, guardar } = useObjetivosAM(periodo, filters.metricaObjetivo);

  // Cuánto del mes va corrido. Un mes cerrado va al 100 %, así que en «Mes
  // anterior» el prorrateo desaparece solo y se compara contra la meta entera.
  const avance = useMemo(() => avanceDelMes(periodo), [periodo]);
  const enCurso = avance.fraccion < 1;

  // Solo los AM de verdad llevan meta: a la mesa de dirección no se le pone
  // objetivo de agenda, así que se queda fuera de este gráfico.
  //
  // El REAL se acota a ese mismo mes, no al rango de la pestaña: enfrentar la
  // producción de un año contra una meta mensual daría un cumplimiento inventado.
  const filasAgenda = useMemo(
    () =>
      grupos
        .filter((g) => g.id !== SIN_AM)
        .map((g) => {
          const objetivo = objetivos.get(g.id) ?? 0;
          return {
            id: g.id,
            nombre: g.nombre,
            objetivo,
            esperado: objetivoALaFecha(objetivo, periodo),
            real: g.items.filter((p) => metricaObj.match(p) && (p.created_at || "").substring(0, 7) === periodo).length,
          };
        })
        .sort((a, b) => b.real - a.real),
    [grupos, objetivos, metricaObj, periodo]
  );

  const promedioReal = filasAgenda.length > 0 ? filasAgenda.reduce((s, f) => s + f.real, 0) / filasAgenda.length : null;
  const objetivoMedio = filasAgenda.length > 0 ? filasAgenda.reduce((s, f) => s + f.objetivo, 0) / filasAgenda.length : null;
  const esperadoMedio = filasAgenda.length > 0 ? filasAgenda.reduce((s, f) => s + f.esperado, 0) / filasAgenda.length : null;
  // "Cumplen" se mide contra la vara que aplica hoy: el mes entero si ya cerró,
  // lo prorrateado si sigue corriendo.
  const cumplen = filasAgenda.filter((f) => f.objetivo > 0 && f.real >= (enCurso ? f.esperado : f.objetivo)).length;
  const conObjetivo = filasAgenda.filter((f) => f.objetivo > 0).length;

  // ── Filtro por AM ──────────────────────────────────────────────────────────
  const amDisponibles = useMemo(() => {
    const enDatos = new Set(grupos.map((g) => g.id));
    const lista = profiles
      .filter((p) => p.role === "account_manager")
      .map((p) => ({ id: p.id, nombre: p.full_name }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    return enDatos.has(SIN_AM) || filters.entidades.includes(SIN_AM)
      ? [...lista, { id: SIN_AM, nombre: "Mesa de dirección" }]
      : lista;
  }, [profiles, grupos, filters.entidades]);

  const toggleAM = (id: string) =>
    setFilters({
      entidades: filters.entidades.includes(id) ? filters.entidades.filter((x) => x !== id) : [...filters.entidades, id],
    });

  const toggleSerie = (id: string) =>
    setOcultas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportCsv = () => {
    const esc = (v: string | number) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows: (string | number)[][] = [
      [
        "Account Manager",
        ...METRICAS_RANKING.map((id) => METRICAS[id].label),
        "Cerrado perdido",
        "Agenda futura",
        "T. aprobación %",
        "T. condicionamiento %",
        "T. cierre %",
        `Objetivo ${periodo} (${METRICAS[filters.metricaObjetivo].label})`,
      ],
    ];
    ranking.forEach((r) => {
      const g = grupos.find((x) => x.id === r.id);
      const list = g?.items || [];
      const t = calcTasas(list);
      rows.push([
        r.nombre,
        ...METRICAS_RANKING.map((id) => list.filter(METRICAS[id].match).length),
        list.filter(METRICAS.perdidos.match).length,
        list.filter(METRICAS.agenda_futura.match).length,
        (t.aprobacion ?? 0).toFixed(1),
        (t.condicionamiento ?? 0).toFixed(1),
        (t.cierre ?? 0).toFixed(1),
        objetivos.get(r.id) ?? 0,
      ]);
    });
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-account-managers-${new Date().toISOString().substring(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* ── Selección de AM ───────────────────────────────────────────────── */}
      {amDisponibles.length > 1 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 flex flex-wrap items-center gap-3 print:hidden">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
            <Users className="h-3.5 w-3.5" /> Account Manager
          </span>
          <div className={`${segmented} flex-wrap`}>
            <button onClick={() => setFilters({ entidades: [] })} className={pill(filters.entidades.length === 0)}>
              Todos
            </button>
            {amDisponibles.map((am) => (
              <button key={am.id} onClick={() => toggleAM(am.id)} className={pill(filters.entidades.includes(am.id))}>
                {am.nombre.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Tarjetas de cabecera ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Proyectos" value={tasas.proyectos} sub="en el período" icon={Users} tone="slate" />
        <StatCard label="Aprobados" value={items.filter(METRICAS.aprobados.match).length} tone="slate" />
        <StatCard label="Condicionados" value={items.filter(METRICAS.condicionados.match).length} tone="slate" />
        <StatCard label="Fin. Otorgado" value={items.filter(METRICAS.otorgados.match).length} tone="slate" />
        <StatCard label="Cerrado perdido" value={items.filter(METRICAS.perdidos.match).length} tone="rose" />
        <StatCard label="Agenda futura" value={items.filter(METRICAS.agenda_futura.match).length} tone="amber" />
      </div>

      {/* ── 1 · Productividad ─────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
        <PanelHeader
          icon={TrendingUp}
          tone="emerald"
          title="Productividad por período"
          subtitle={`Agrupado por ${GRANO_LABEL[filters.grano].toLowerCase()} · ${
            filters.acumulado ? "total corrido" : "cantidad del período, no acumulada"
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
          title="Ranking de Account Managers"
          subtitle={`${ranking.length} con proyectos en el período · ordenado por ${metrica.label.toLowerCase()}.`}
        >
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

        <RankingChart filas={ranking} metricaLabel={metrica.label} />
        <Leyenda
          series={[
            { id: "aprob", label: "T. aprobación (eje derecho)", color: "var(--rp-2)" },
            { id: "cierre", label: "T. cierre (eje derecho)", color: "var(--rp-7)" },
          ]}
        />
      </div>

      {/* ── 3 · Estados por AM ────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
        <PanelHeader
          icon={Route}
          tone="violet"
          title="Estados por Account Manager"
          subtitle={`Toca un hito de la línea de tiempo para ver quién tiene qué. Mostrando «${etiquetaPaso}».`}
        />

        {/* Línea de tiempo clicable: los mismos 8 hitos del expediente. */}
        <div className="overflow-x-auto -mx-5 px-5 print:hidden">
          <div className="flex items-start gap-1 min-w-[760px] pb-1">
            {pasos.map((p, i) => {
              const activo = p.status === pasoSel;
              return (
                <React.Fragment key={p.status}>
                  {i > 0 && <span className="mt-4 h-px flex-1 bg-slate-200 dark:bg-slate-700 shrink" />}
                  <button
                    onClick={() => setPasoSel(p.status)}
                    className="flex flex-col items-center gap-1 w-[86px] shrink-0 group"
                    title={STEP_DEFS[i].desc}
                  >
                    <span
                      className={`h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold tabular-nums transition-all ${
                        activo
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20 scale-110"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-slate-200 dark:group-hover:bg-slate-700"
                      }`}
                    >
                      {p.count}
                    </span>
                    <span
                      className={`text-[9px] leading-tight text-center ${
                        activo ? "font-bold text-slate-800 dark:text-white" : "font-medium text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      {p.label}
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {barrasPaso.every((b) => b.valor === 0) ? (
          <Vacio>Ningún proyecto está en «{etiquetaPaso}» con los filtros activos.</Vacio>
        ) : (
          <RankingChart filas={barrasPaso} metricaLabel={etiquetaPaso} />
        )}
      </div>

      {/* ── 4 · AM x Estados (grupo) ──────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
        <PanelHeader
          icon={Layers3}
          tone="teal"
          title="Account Manager por estados"
          subtitle="Todas las métricas enfrentadas, un grupo de barras por AM."
        />
        <GrupoBarrasChart
          entidades={ranking.map((r) => ({ id: r.id, nombre: r.nombre }))}
          series={[...METRICAS_RANKING.filter((id) => id !== "proyectos"), "agenda_futura" as const].map((id) => ({
            id,
            label: METRICAS[id].label,
            color: colorSlot(METRICAS[id].slot),
            values: ranking.map((r) => (grupos.find((g) => g.id === r.id)?.items || []).filter(METRICAS[id].match).length),
          }))}
        />
        <Leyenda
          series={[...METRICAS_RANKING.filter((id) => id !== "proyectos"), "agenda_futura" as const].map((id) => ({
            id,
            label: METRICAS[id].label,
            color: colorSlot(METRICAS[id].slot),
            total: items.filter(METRICAS[id].match).length,
          }))}
        />
      </div>

      {/* ── 5 · Agenda: objetivo vs. real ─────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
        <PanelHeader
          icon={CalendarCheck}
          tone="amber"
          title="Agenda · objetivo contra real"
          subtitle={
            <>
              <strong>{mesLabel(periodo)}</strong>
              {enCurso ? ` · día ${avance.dia} de ${avance.dias} (${Math.round(avance.fraccion * 100)} % del mes)` : " · mes cerrado"}.
              Panel mensual: el real es solo de ese mes.{" "}
              {enCurso
                ? "Con el mes en curso se compara contra la parte proporcional de la meta, no contra el mes entero."
                : "Se compara contra la meta completa."}
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <ChipTasa label="Objetivo del mes" value={objetivoMedio === null ? "—" : fmtNum(objetivoMedio, 0)} tone="sky" />
            {enCurso && (
              <ChipTasa label="Esperado a la fecha" value={esperadoMedio === null ? "—" : fmtNum(esperadoMedio, 0)} tone="amber" />
            )}
            <ChipTasa label="Promedio real" value={promedioReal === null ? "—" : fmtNum(promedioReal, 0)} tone="teal" />
            <ChipTasa
              label={enCurso ? "Van al ritmo" : "Cumplen la meta"}
              value={conObjetivo > 0 ? `${cumplen} / ${conObjetivo}` : "—"}
              tone="amber"
            />
          </div>
        </PanelHeader>

        {/* Botonera PROPIA del panel: cada métrica lleva su propia meta, así que
            esto no puede colgar del selector del ranking. */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
            Meta medida en
          </span>
          <div className={`${segmented} flex-wrap`}>
            {METRICAS_RANKING.map((id) => (
              <button key={id} onClick={() => setFilters({ metricaObjetivo: id })} className={pill(filters.metricaObjetivo === id)}>
                {METRICAS[id].label}
              </button>
            ))}
          </div>
        </div>

        {errorObjetivos && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
            <p className="text-[11px] text-amber-800 dark:text-amber-300">{errorObjetivos}</p>
          </div>
        )}

        {filasAgenda.length === 0 ? (
          <Vacio>No hay account managers con proyectos en el período.</Vacio>
        ) : (
          <>
            <ObjetivoRealChart filas={filasAgenda} prorrateado={enCurso} />
            <Leyenda
              series={[
                { id: "obj", label: "Objetivo del mes", color: VIZ_MUTED_VAR, total: filasAgenda.reduce((s, f) => s + f.objetivo, 0) },
                ...(enCurso
                  ? [{ id: "esp", label: "Esperado a la fecha (línea)", color: "var(--rp-8)", total: filasAgenda.reduce((s, f) => s + f.esperado, 0) }]
                  : []),
                { id: "real", label: "Real", color: "var(--rp-1)", total: filasAgenda.reduce((s, f) => s + f.real, 0) },
              ]}
            />
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              La barra del real cambia de color según {enCurso ? "el ritmo esperado" : "la meta"}: verde
              {enCurso ? " va al día" : " la alcanza"}, ámbar se queda corto, azul es que todavía no tiene objetivo
              puesto.
            </p>

            {puedeEditar && (
              <div className="rounded-xl border border-slate-200/70 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                  <h4 className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                    Objetivos de {mesLabel(periodo)} · {metricaObj.label}
                  </h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    Se guarda al salir del campo. Cada métrica y cada mes llevan su propia meta.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[620px]">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                        {["Account Manager", "Objetivo del mes", ...(enCurso ? ["Esperado hoy"] : []), "Real", "Avance"].map((h, i) => (
                          <th
                            key={h}
                            className={`px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 ${
                              i > 0 ? "text-right" : ""
                            }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {filasAgenda.map((f) => (
                        <FilaObjetivo key={f.id} fila={f} enCurso={enCurso} onGuardar={(v) => guardar(f.id, v)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 6 · Sub estados ───────────────────────────────────────────────── */}
      <SubEstadosPanel
        items={items}
        profiles={profiles}
        subtitulo="Dónde están parados los proyectos de estos account managers. Toca una subetapa para desplegarlos."
      />
    </div>
  );
}

/**
 * Un renglón editable de la meta. Guarda al perder el foco (no en cada tecla):
 * si no, teclear "40" dispararía un UPSERT con "4" por el camino.
 */
function FilaObjetivo({
  fila,
  enCurso,
  onGuardar,
}: {
  fila: { id: string; nombre: string; objetivo: number; real: number; esperado: number };
  enCurso: boolean;
  onGuardar: (valor: number) => void;
}) {
  const [borrador, setBorrador] = useState(String(fila.objetivo));

  // Si la meta cambia por fuera (otro mes, otra métrica, recarga), el campo sigue.
  React.useEffect(() => {
    setBorrador(String(fila.objetivo));
  }, [fila.objetivo]);

  // Con el mes corriendo se mide el RITMO (real ÷ esperado a la fecha); con el
  // mes cerrado, el cumplimiento (real ÷ meta). Son dos preguntas distintas y la
  // cabecera de la columna cambia con ellas.
  const vara = enCurso ? fila.esperado : fila.objetivo;
  const avance = fila.objetivo > 0 && vara > 0 ? (fila.real / vara) * 100 : fila.objetivo > 0 ? 100 : null;

  return (
    <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors">
      <td className="px-4 py-2 font-bold text-slate-800 dark:text-slate-200 truncate max-w-[220px]">{fila.nombre}</td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          min={0}
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          onBlur={() => {
            const v = Math.max(0, Math.round(Number(borrador) || 0));
            setBorrador(String(v));
            if (v !== fila.objetivo) onGuardar(v);
          }}
          className="w-20 px-2 py-1 rounded-lg text-xs text-right tabular-nums bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
        />
      </td>
      {enCurso && (
        <td className="px-4 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
          {fila.objetivo > 0 ? fila.esperado : "—"}
        </td>
      )}
      <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-900 dark:text-white">{fila.real}</td>
      <td className="px-4 py-2 text-right">
        {avance === null ? (
          <span className="text-slate-400 dark:text-slate-500">Sin meta</span>
        ) : (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tabular-nums ${
              avance >= 100
                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                : avance >= 70
                  ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400"
                  : "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400"
            }`}
            title={enCurso ? `${fila.real} de ${fila.esperado} esperados a la fecha (meta del mes: ${fila.objetivo})` : `${fila.real} de ${fila.objetivo}`}
          >
            {avance.toFixed(0)} %
          </span>
        )}
      </td>
    </tr>
  );
}
