"use client";

// Panel «Actividad en plataforma» — último bloque de la pestaña ACCOUNT MANAGER.
//
// LA PREGUNTA QUE RESPONDE
// Un AM que cierra poco puede estar en dos situaciones opuestas: no le entran
// clientes, o no trabaja los que tiene. El resto de la pestaña mide RESULTADO y
// no sabe distinguirlas. Este panel mide ESFUERZO —cuánto tiempo está dentro y
// qué hace mientras— y, puesto al lado del ranking de cierres, separa «no tuvo
// con qué» de «no le dio seguimiento».
//
// LOS CUATRO BLOQUES
//   1. Tarjetas   — totales del rango: tiempo, tiempo activo, densidad, acciones.
//   2. Ranking    — quién está más tiempo dentro, con el trozo activo marcado.
//   3. Evolución  — tiempo (o acciones) por período, del tirón o acumulado.
//   4. Qué hacen  — ranking de actividades, clicable: al elegir una, el ranking
//                   de AM de la derecha se reordena por esa actividad.
//
// DE DÓNDE SALEN LOS DATOS
// De `useActividadAM`, que agrega en Postgres. NO se cruzan con `prospects`: el
// resto de la pestaña filtra por producto y segmento del proyecto, y el tiempo
// de una persona no se puede repartir entre modalidades de financiamiento. Los
// únicos filtros que aplican aquí son los que tienen sentido —el PERÍODO, el AM
// seleccionado y el grano—, y el subtítulo lo dice para que nadie espere que
// «Mod. 40» recorte las horas.

import React, { useMemo, useState } from "react";
import { Activity, Clock, Download, ListOrdered, Timer, TrendingUp, Users } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import {
  Leyenda,
  PanelHeader,
  SerieChart,
  Vacio,
  VIZ_MUTED_VAR,
  colorMapEstable,
  pill,
  segmented,
} from "./ReportesCharts";
import { useActividadAM, type ResumenActividadAM } from "./useActividadAM";
import type { ReportesFilters } from "./reportesFilters";
import {
  type Grano,
  GRANO_LABEL,
  bucketStart,
  construyeCubos,
  diaLabel,
  fmtPct,
} from "./reportesTypes";
import {
  ayudaTipo,
  etiquetaTipo,
  etiquetaTipoCorta,
  fechaHoraMx,
  formatDuracion,
  horasDecimales,
  ordenTipo,
} from "@/utils/actividad";

const GRANOS: Grano[] = ["dia", "semana", "mes", "anio"];

/** Qué dibuja la curva de evolución. */
type Magnitud = "tiempo" | "acciones";

export function ActividadAMPanel({ filters }: { filters: ReportesFilters }) {
  const { resumen, porDia, porTipo, cargando, error, demo } = useActividadAM(filters.desde, filters.hasta);

  const [magnitud, setMagnitud] = useState<Magnitud>("tiempo");
  // Grano PROPIO, y arranca en día. El de la pestaña vale «mes» por defecto, que
  // en los otros paneles está bien (un mes tiene proyectos de sobra) pero aquí
  // aplasta el reporte: la pregunta es el ritmo DIARIO de cada persona, y con
  // cubos mensuales un rango de 30 días se dibuja con dos puntos. Cada botonera
  // vive dentro del panel que gobierna, así que no se pisan.
  const [grano, setGrano] = useState<Grano>("dia");
  const [acumulado, setAcumulado] = useState(false);
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  /** Actividad elegida en el ranking de la izquierda. `null` = todas. */
  const [tipoSel, setTipoSel] = useState<string | null>(null);

  // La selección de AM de la pestaña se respeta, con una salvedad: «Mesa de
  // dirección» no es una persona y no tiene tiempo que medir, así que si es lo
  // único elegido este panel enseña a todos en vez de quedarse en blanco sin
  // explicar por qué.
  const seleccion = useMemo(() => filters.entidades.filter((id) => id !== "__sin__"), [filters.entidades]);

  const filas = useMemo(
    () => (seleccion.length === 0 ? resumen : resumen.filter((r) => seleccion.includes(r.amId))),
    [resumen, seleccion]
  );
  const visibles = useMemo(() => new Set(filas.map((f) => f.amId)), [filas]);

  // Color por AM, estable: se asigna por el orden alfabético del nombre y NO por
  // la posición en el ranking, para que reordenar la tabla no repinte las líneas.
  const colorPorAM = useMemo(
    () =>
      colorMapEstable(
        resumen
          .slice()
          .sort((a, b) => a.nombre.localeCompare(b.nombre) || a.amId.localeCompare(b.amId))
          .map((r) => r.amId)
      ),
    [resumen]
  );

  // ── 1 · Totales ────────────────────────────────────────────────────────────
  const tot = useMemo(() => {
    const segundos = filas.reduce((s, f) => s + f.segundos, 0);
    const activos = filas.reduce((s, f) => s + f.segundosActivos, 0);
    const eventos = filas.reduce((s, f) => s + f.eventos, 0);
    const dias = filas.reduce((s, f) => s + f.diasActivos, 0);
    return {
      segundos,
      activos,
      eventos,
      dias,
      // Densidad: qué parte del tiempo delante de la pantalla fue con las manos
      // encima. Es lo que separa «estuvo conectado» de «estuvo trabajando».
      densidad: segundos > 0 ? (activos / segundos) * 100 : null,
      // Acciones por hora: el ritmo. Un AM con muchas horas y pocas acciones tiene
      // la plataforma abierta de fondo; uno con pocas horas y muchas acciones
      // entra a rematar cosas.
      ritmo: segundos > 0 ? eventos / (segundos / 3600) : null,
    };
  }, [filas]);

  // Primer día con registro: el reporte no puede enseñar nada anterior al día en
  // que se encendió la medición, y decirlo evita leer un mes vacío como un mes
  // sin trabajo.
  const primerRegistro = useMemo(() => {
    const dias = resumen.map((r) => r.primerDia).filter(Boolean) as string[];
    return dias.length ? dias.sort()[0] : null;
  }, [resumen]);

  // ── 2 · Ranking de tiempo ──────────────────────────────────────────────────
  const ranking = useMemo(() => [...filas].sort((a, b) => b.segundos - a.segundos), [filas]);
  const maxSegundos = Math.max(1, ...ranking.map((r) => r.segundos));

  // ── 3 · Evolución ──────────────────────────────────────────────────────────
  const diasFiltrados = useMemo(() => porDia.filter((d) => visibles.has(d.amId)), [porDia, visibles]);

  const cubos = useMemo(
    () => construyeCubos(diasFiltrados.map((d) => d.dia), filters.desde, filters.hasta, grano),
    [diasFiltrados, filters.desde, filters.hasta, grano]
  );

  const series = useMemo(() => {
    const idx = new Map(cubos.map((c, i) => [c.iso, i]));
    const porAM = new Map<string, number[]>();
    for (const d of diasFiltrados) {
      const i = idx.get(bucketStart(`${d.dia}T00:00:00Z`, grano));
      if (i === undefined) continue;
      let vals = porAM.get(d.amId);
      if (!vals) {
        vals = new Array(cubos.length).fill(0);
        porAM.set(d.amId, vals);
      }
      // El tiempo se dibuja en MINUTOS: en segundos el eje son números de cinco
      // cifras que nadie lee, y en horas los días flojos se aplastan contra el cero.
      vals[i] += magnitud === "tiempo" ? d.segundos / 60 : d.eventos;
    }
    return Array.from(porAM.entries())
      .map(([amId, vals]) => {
        const crudos = vals.map((v) => Math.round(v));
        let acc = 0;
        return {
          id: amId,
          label: filas.find((f) => f.amId === amId)?.nombre || "Account Manager",
          color: colorPorAM.get(amId) || VIZ_MUTED_VAR,
          values: acumulado ? crudos.map((v) => (acc += v)) : crudos,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [diasFiltrados, cubos, grano, magnitud, acumulado, filas, colorPorAM]);

  const leyenda = series.map((s) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    total: acumulado ? s.values[s.values.length - 1] ?? 0 : s.values.reduce((a, b) => a + b, 0),
  }));

  // ── 4 · Qué hacen ──────────────────────────────────────────────────────────
  const tiposFiltrados = useMemo(() => porTipo.filter((t) => visibles.has(t.amId)), [porTipo, visibles]);

  /** Ranking de actividades: cuántas veces se hizo cada cosa, de más a menos. */
  const rankingTipos = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tiposFiltrados) map.set(t.tipo, (map.get(t.tipo) || 0) + t.eventos);
    return Array.from(map.entries())
      .map(([tipo, eventos]) => ({ tipo, eventos }))
      // Por frecuencia, que es la pregunta («cuáles hacen más»); el empate lo
      // rompe el orden del catálogo para que la lista no baile entre recargas.
      .sort((a, b) => b.eventos - a.eventos || ordenTipo(a.tipo) - ordenTipo(b.tipo));
  }, [tiposFiltrados]);

  const maxTipo = Math.max(1, ...rankingTipos.map((t) => t.eventos));
  const totalAcciones = rankingTipos.reduce((s, t) => s + t.eventos, 0);

  /** Ranking de AM por la actividad elegida (o por el total, si no hay ninguna). */
  const rankingPorTipo = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tiposFiltrados) {
      if (tipoSel && t.tipo !== tipoSel) continue;
      map.set(t.amId, (map.get(t.amId) || 0) + t.eventos);
    }
    return filas
      .map((f) => ({ id: f.amId, nombre: f.nombre, valor: map.get(f.amId) || 0, segundos: f.segundos }))
      .sort((a, b) => b.valor - a.valor || b.segundos - a.segundos);
  }, [tiposFiltrados, tipoSel, filas]);

  const maxPorTipo = Math.max(1, ...rankingPorTipo.map((r) => r.valor));

  // ── CSV ────────────────────────────────────────────────────────────────────
  // Una fila por AM con todo lo del panel, más una columna por actividad: es el
  // formato con el que Dirección puede ordenar y comparar fuera de la pantalla.
  const exportCsv = () => {
    const esc = (v: string | number) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const tipos = rankingTipos.map((t) => t.tipo);
    const porAMyTipo = new Map<string, number>();
    tiposFiltrados.forEach((t) => porAMyTipo.set(`${t.amId}|${t.tipo}`, t.eventos));

    const rows: (string | number)[][] = [
      [
        "Account Manager",
        "Horas en plataforma",
        "Horas activas",
        "Densidad %",
        "Días con actividad",
        "Horas por día activo",
        "Conexiones",
        "Acciones",
        "Acciones por hora",
        "Última conexión",
        ...tipos.map((t) => etiquetaTipo(t)),
      ],
    ];
    ranking.forEach((r) => {
      const horas = r.segundos / 3600;
      rows.push([
        r.nombre,
        horasDecimales(r.segundos),
        horasDecimales(r.segundosActivos),
        r.segundos > 0 ? ((r.segundosActivos / r.segundos) * 100).toFixed(1) : "",
        r.diasActivos,
        r.diasActivos > 0 ? (horas / r.diasActivos).toFixed(2) : "",
        r.tramos,
        r.eventos,
        horas > 0 ? (r.eventos / horas).toFixed(1) : "",
        fechaHoraMx(r.ultimaConexion),
        ...tipos.map((t) => porAMyTipo.get(`${r.amId}|${t}`) || 0),
      ]);
    });

    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `actividad-account-managers-${new Date().toISOString().substring(0, 10)}.csv`;
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

  const rangoLabel = filters.desde
    ? `${diaLabel(filters.desde)} — ${filters.hasta ? diaLabel(filters.hasta) : "hoy"}`
    : "histórico completo";

  const subtitulo = (
    <>
      Tiempo con la plataforma abierta y qué se hace dentro · {filas.length} account manager
      {filas.length === 1 ? "" : "s"} · {rangoLabel}. Solo responde al período y al account manager
      elegidos: el producto y el segmento no recortan horas de nadie.
    </>
  );

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-5">
      <PanelHeader icon={Activity} tone="violet" title="Actividad en plataforma" subtitle={subtitulo}>
        {demo && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-[0.06em] bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 ring-1 ring-inset ring-amber-500/30">
            Datos de ejemplo
          </span>
        )}
        {filas.length > 0 && (
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all active:scale-95"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2.4} /> CSV
          </button>
        )}
      </PanelHeader>

      {error && (
        <p className="rounded-xl bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {demo && (
        <p className="rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          Estás en modo demo: las horas y las acciones de abajo son inventadas y sirven para ver cómo
          queda el informe. Con sesión real, este panel solo enseña lo que se ha medido de verdad.
        </p>
      )}

      {cargando ? (
        <Vacio>Cargando la actividad…</Vacio>
      ) : filas.length === 0 ? (
        <Vacio>
          Todavía no hay actividad registrada en este período. El registro empieza el día que se
          publica esta versión: los períodos anteriores no tienen histórico que enseñar.
        </Vacio>
      ) : (
        <>
          {/* ── 1 · Totales ─────────────────────────────────────────────── */}
          {/* `size="sm"` y `Nw` no son cosmética: «297 h 37 m» a tamaño grande se
              parte en dos renglones dentro de la tarjeta, y partido se lee como
              dos cifras distintas. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Las dos primeras van SIN `sub`: la duración ya ocupa el ancho de la
                tarjeta y el texto de al lado se cortaba a media palabra. Lo que
                significa cada una se explica en la nota de debajo. */}
            <StatCard
              label="Tiempo en plataforma"
              value={<Nw>{formatDuracion(tot.segundos)}</Nw>}
              icon={Clock}
              tone="indigo"
              size="sm"
            />
            <StatCard
              label="Tiempo activo"
              value={<Nw>{formatDuracion(tot.activos)}</Nw>}
              icon={Timer}
              tone="emerald"
              size="sm"
            />
            <StatCard
              label="Densidad"
              value={<Nw>{fmtPct(tot.densidad, 0)}</Nw>}
              sub="del tiempo, trabajando"
              tone={tot.densidad !== null && tot.densidad < 50 ? "amber" : "slate"}
              size="sm"
            />
            <StatCard label="Acciones" value={tot.eventos} sub="registradas" icon={Activity} tone="blue" size="sm" />
            <StatCard
              label="Acciones por hora"
              value={tot.ritmo === null ? "—" : tot.ritmo.toFixed(1)}
              sub="ritmo medio"
              tone="slate"
              size="sm"
            />
            <StatCard label="Días con actividad" value={tot.dias} sub="suma de todos" tone="slate" size="sm" />
          </div>

          <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
            <strong className="font-semibold">Tiempo en plataforma</strong> es el rato con la pantalla
            delante; <strong className="font-semibold">tiempo activo</strong> es la parte de ese rato
            con el ratón o el teclado en marcha, y su cociente es la{" "}
            <strong className="font-semibold">densidad</strong>. Un descanso de más de tres minutos no
            cuenta como tiempo.
            {primerRegistro && (
              <>
                {" "}Hay registro desde el {diaLabel(primerRegistro)}: antes de esa fecha no se medía,
                así que un período anterior sale vacío aunque se trabajara.
              </>
            )}
          </p>

          {/* ── 2 · Ranking de tiempo ───────────────────────────────────── */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                Quién está más tiempo dentro
              </h4>
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                La parte llena es el tiempo activo
              </span>
            </div>
            {ranking.map((r) => {
              const pct = (r.segundos / maxSegundos) * 100;
              const pctActivo = r.segundos > 0 ? (r.segundosActivos / r.segundos) * 100 : 0;
              return (
                <div key={r.amId} className="flex items-center gap-3">
                  <span
                    className="w-32 sm:w-40 shrink-0 text-[11px] font-semibold text-slate-600 dark:text-slate-300 truncate"
                    title={r.nombre}
                  >
                    {r.nombre}
                  </span>
                  {/* Las dos barras son HERMANAS, no una dentro de otra: `opacity`
                      se hereda, así que un hijo sólido dentro de un padre al 35 %
                      salía igual de pálido que el padre y el tiempo activo no se
                      distinguía. */}
                  <div
                    className="relative flex-1 h-5 rounded-md bg-slate-100 dark:bg-slate-800/50 overflow-hidden min-w-0"
                    title={`${r.nombre}: ${formatDuracion(r.segundos)} en plataforma, ${formatDuracion(
                      r.segundosActivos
                    )} activo`}
                  >
                    <span
                      className="absolute inset-y-0 left-0 rounded-md transition-all duration-500"
                      style={{
                        width: `${Math.max(pct, 2)}%`,
                        background: colorPorAM.get(r.amId) || VIZ_MUTED_VAR,
                        opacity: 0.28,
                      }}
                    />
                    <span
                      className="absolute inset-y-0 left-0 rounded-md transition-all duration-500"
                      style={{
                        width: `${(Math.max(pct, 2) * pctActivo) / 100}%`,
                        background: colorPorAM.get(r.amId) || VIZ_MUTED_VAR,
                      }}
                    />
                  </div>
                  <span className="w-20 text-right text-[11px] font-bold tabular-nums text-slate-900 dark:text-white shrink-0">
                    {formatDuracion(r.segundos)}
                  </span>
                  <span className="w-24 text-right text-[10px] tabular-nums text-slate-400 dark:text-slate-500 shrink-0 hidden sm:block">
                    {r.eventos} acciones
                  </span>
                </div>
              );
            })}
          </div>

          {/* ── 3 · Evolución ───────────────────────────────────────────── */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <PanelHeader
              icon={TrendingUp}
              tone="sky"
              title={magnitud === "tiempo" ? "Tiempo por período" : "Acciones por período"}
              subtitle={`Agrupado por ${GRANO_LABEL[grano].toLowerCase()} · ${
                acumulado ? "total corrido" : "cantidad del período"
              }${magnitud === "tiempo" ? " · en minutos" : ""}.`}
            >
              <div className={segmented}>
                <button onClick={() => setMagnitud("tiempo")} className={pill(magnitud === "tiempo")}>
                  Tiempo
                </button>
                <button onClick={() => setMagnitud("acciones")} className={pill(magnitud === "acciones")}>
                  Acciones
                </button>
              </div>
              <div className={segmented}>
                {GRANOS.map((g) => (
                  <button key={g} onClick={() => setGrano(g)} className={pill(grano === g)}>
                    {GRANO_LABEL[g]}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setAcumulado((v) => !v)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all border ${
                  acumulado
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                Acumulado
              </button>
            </PanelHeader>

            <SerieChart
              cubos={cubos}
              series={series.filter((s) => !ocultas.has(s.id))}
              tipo={filters.tipoGrafico}
              unidad={magnitud === "tiempo" ? "minuto(s)" : "acciones"}
            />
            <Leyenda
              series={leyenda}
              onToggle={toggleSerie}
              ocultas={ocultas}
              sufijo={magnitud === "tiempo" ? " min" : ""}
            />
          </div>

          {/* ── 4 · Qué hacen ───────────────────────────────────────────── */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <PanelHeader
              icon={ListOrdered}
              tone="amber"
              title="Qué hacen dentro"
              subtitle={
                totalAcciones === 0
                  ? "Sin acciones registradas en el período."
                  : `${totalAcciones} acciones en ${rankingTipos.length} tipo(s) de actividad. Toca una para ver quién la hace más.`
              }
            >
              {tipoSel && (
                <button onClick={() => setTipoSel(null)} className={pill(false)}>
                  Ver todas
                </button>
              )}
            </PanelHeader>

            {rankingTipos.length === 0 ? (
              <Vacio>Sin acciones registradas en el período.</Vacio>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Ranking de actividades (clicable) */}
                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                    Actividades más frecuentes
                  </h4>
                  {rankingTipos.map((t) => {
                    const on = tipoSel === t.tipo;
                    return (
                      <button
                        key={t.tipo}
                        type="button"
                        onClick={() => setTipoSel(on ? null : t.tipo)}
                        title={ayudaTipo(t.tipo)}
                        aria-pressed={on}
                        className={`w-full flex items-center gap-3 rounded-lg px-2 py-1 transition-colors ${
                          on ? "bg-amber-50 dark:bg-amber-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        }`}
                      >
                        <span
                          className={`w-36 sm:w-44 shrink-0 text-left text-[11px] truncate ${
                            on
                              ? "font-bold text-amber-700 dark:text-amber-300"
                              : "font-semibold text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {etiquetaTipo(t.tipo)}
                        </span>
                        <div className="flex-1 h-4 rounded-md bg-slate-100 dark:bg-slate-800/50 overflow-hidden min-w-0">
                          <div
                            className={`h-full rounded-md transition-all duration-500 ${
                              on ? "bg-amber-500" : "bg-violet-500"
                            }`}
                            style={{ width: `${Math.max((t.eventos / maxTipo) * 100, 3)}%` }}
                          />
                        </div>
                        <span className="w-14 text-right text-[11px] font-bold tabular-nums text-slate-900 dark:text-white shrink-0">
                          {t.eventos}
                        </span>
                        <span className="w-12 text-right text-[10px] tabular-nums text-slate-400 dark:text-slate-500 shrink-0 hidden sm:block">
                          {totalAcciones > 0 ? `${Math.round((t.eventos / totalAcciones) * 100)}%` : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Quién la hace más */}
                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                    {tipoSel ? `Quién: ${etiquetaTipoCorta(tipoSel).toLowerCase()}` : "Quién hace más acciones"}
                  </h4>
                  {rankingPorTipo.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 px-2 py-1">
                      <span
                        className="w-32 sm:w-40 shrink-0 text-[11px] font-semibold text-slate-600 dark:text-slate-300 truncate"
                        title={r.nombre}
                      >
                        {r.nombre}
                      </span>
                      <div className="flex-1 h-4 rounded-md bg-slate-100 dark:bg-slate-800/50 overflow-hidden min-w-0">
                        <div
                          className="h-full rounded-md transition-all duration-500"
                          style={{
                            width: `${r.valor > 0 ? Math.max((r.valor / maxPorTipo) * 100, 3) : 0}%`,
                            background: colorPorAM.get(r.id) || VIZ_MUTED_VAR,
                          }}
                        />
                      </div>
                      <span className="w-14 text-right text-[11px] font-bold tabular-nums text-slate-900 dark:text-white shrink-0">
                        {r.valor}
                      </span>
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-1">
                    Un cero aquí con horas en el ranking de arriba es el caso que hay que mirar: está
                    dentro y no toca nada.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Tabla de detalle ────────────────────────────────────────── */}
          <div className="overflow-x-auto pt-2 border-t border-slate-100 dark:border-slate-800">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                  <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                    <Users className="h-3 w-3 inline -mt-0.5 mr-1" />
                    Account Manager
                  </th>
                  <Th>En plataforma</Th>
                  <Th>Activo</Th>
                  <Th title="Qué parte del tiempo delante de la pantalla fue con interacción.">Densidad</Th>
                  <Th>Días</Th>
                  <Th title="Tiempo en plataforma dividido entre los días en que hubo actividad.">Por día</Th>
                  <Th title="Cuántas veces entró: cada regreso tras más de 3 minutos fuera abre una conexión nueva.">
                    Conexiones
                  </Th>
                  <Th>Acciones</Th>
                  <Th title="Acciones registradas por cada hora dentro de la plataforma.">Por hora</Th>
                  <Th>Última conexión</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {ranking.map((r) => (
                  <FilaDetalle key={r.amId} r={r} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/** Valor que no se puede partir en dos renglones. */
function Nw({ children }: { children: React.ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>;
}

function Th({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <th
      title={title}
      className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 whitespace-nowrap"
    >
      {children}
    </th>
  );
}

function FilaDetalle({ r }: { r: ResumenActividadAM }) {
  const horas = r.segundos / 3600;
  const densidad = r.segundos > 0 ? (r.segundosActivos / r.segundos) * 100 : null;
  const porDia = r.diasActivos > 0 ? r.segundos / r.diasActivos : 0;
  const ritmo = horas > 0 ? r.eventos / horas : null;

  return (
    <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors">
      <td className="px-4 py-2 font-bold text-slate-800 dark:text-slate-200 truncate max-w-[220px]">{r.nombre}</td>
      <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
        {formatDuracion(r.segundos)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
        {formatDuracion(r.segundosActivos)}
      </td>
      <td className="px-4 py-2 text-right">
        {densidad === null ? (
          <span className="text-slate-400 dark:text-slate-500">—</span>
        ) : (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tabular-nums ${
              densidad >= 75
                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                : densidad >= 50
                  ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400"
                  : "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400"
            }`}
          >
            {densidad.toFixed(0)} %
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{r.diasActivos}</td>
      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
        {formatDuracion(porDia)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{r.tramos}</td>
      <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-900 dark:text-white">{r.eventos}</td>
      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
        {ritmo === null ? "—" : ritmo.toFixed(1)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-slate-400 dark:text-slate-500 whitespace-nowrap">
        {fechaHoraMx(r.ultimaConexion)}
      </td>
    </tr>
  );
}
