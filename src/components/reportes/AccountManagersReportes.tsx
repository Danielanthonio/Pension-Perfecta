"use client";

// Pestaña ACCOUNT MANAGER del módulo Reportes.
//
// Los reportes del boceto:
//   1. Productividad diaria  — 6 series, cantidad DEL PERÍODO (no acumulada).
//   2. Ranking AM            — barras + tasas generales.
//   3. Estados por AM        — línea de tiempo clicable arriba, barras abajo.
//   4. AM x Estados (grupo)  — barras agrupadas, todas las métricas a la vez.
//   5. AM «Agendas»          — asesorías del mes contra la meta que fija Dirección.
//   6. Cierre de agendas     — financiamientos otorgados contra las agendas del rango.
//   7. Sub estados           — panel compartido con la pestaña ALIADOS.
//   8. Actividad             — tiempo dentro de la plataforma y qué hace ahí.
//
// El AM del proyecto se lee de `prospects.account_manager_id`, que desde
// 20260831000001 es el espejo del AM del ALIADO dueño. Un proyecto sin AM es de un
// aliado sin asignar (mesa de dirección) y se cuenta como una columna más:
// esconderlo haría que las barras no sumaran el total.

import React, { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarCheck,
  Download,
  Handshake,
  LineChart as LineChartIcon,
  Layers3,
  Route,
  Trophy,
  TrendingUp,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useApp } from "@/utils/context/AppContext";
import { StatCard } from "@/components/ui/StatCard";
import { STEP_DEFS, STEP_STATUSES } from "@/components/ui/projectStepper";
import {
  AvanceObjetivoChart,
  ChipTasa,
  ConversionChart,
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
  VIZ_TRACK_VAR,
} from "./ReportesCharts";
import { getCreadorMeta, CREADOR_SIN_REGISTRO } from "@/components/ui/creadorProyecto";
import { SubEstadosPanel } from "./SubEstadosPanel";
import { ActividadAMPanel } from "./ActividadAMPanel";
import { useObjetivosAM } from "./useObjetivosAM";
import type { ReportesFilters } from "./reportesFilters";
import {
  type Grano,
  GRANO_LABEL,
  METRICAS,
  METRICAS_RANKING,
  SERIES_AM,
  agendaEnRango,
  agrupaPor,
  aplicaFiltros,
  calcTasas,
  construyeCubos,
  diaDeCita,
  diaLabel,
  esFinOtorgado,
  fmtNum,
  fmtPct,
  mesDe,
  mesLabel,
  objetivoEnVentana,
  rangoDeAgendas,
  serieDe,
  ventanaDelMes,
} from "./reportesTypes";

const GRANOS: Grano[] = ["dia", "semana", "mes", "anio"];
const SIN_AM = "__sin__";

// Colores del origen del alta: los mismos que la dona del panel GENERAL, para que
// «creado por el aliado» sea del mismo verde en todo el módulo.
const C_ALIADO = getCreadorMeta("aliado")?.color ?? "#059669";
const C_AM = getCreadorMeta("account_manager")?.color ?? "#2a78d6";
const C_OTROS = CREADOR_SIN_REGISTRO.color;

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

  // ── 2.5 · Origen del alta: de la cartera de cada AM, ¿quién la capturó? ────
  // Tres cubetas por AM, excluyentes y que suman el total de su cartera:
  //   · El aliado   — `created_by_role === 'aliado'`: el aliado entró a la
  //                   plataforma y subió su proyecto. Esto es lo que debe crecer.
  //   · Él mismo    — lo tecleó el AM que hoy lo gestiona (`created_by === g.id`).
  //   · Otros       — Dirección, o un AM distinto del que hoy lo lleva (pasa tras
  //                   una reasignación). Al 2026-08-24 son casos contados, pero
  //                   sumarlos a «él mismo» le colgaría a un AM trabajo ajeno.
  // Un proyecto sin autoría registrada no entra en ninguna: se cuenta aparte para
  // que los porcentajes no mientan.
  const origenPorAM = useMemo(() => {
    const filas = grupos
      .map((g) => {
        let aliado = 0;
        let propio = 0;
        let otros = 0;
        let sinDato = 0;
        for (const p of g.items) {
          if (!p.created_by_role) sinDato++;
          else if (p.created_by_role === "aliado") aliado++;
          else if (p.created_by && p.created_by === g.id) propio++;
          else otros++;
        }
        const base = aliado + propio + otros;
        const pct = (n: number) => (base > 0 ? (n / base) * 100 : 0);
        return {
          id: g.id,
          nombre: g.nombre,
          aliado,
          propio,
          otros,
          sinDato,
          base,
          total: g.items.length,
          pctAliado: pct(aliado),
          pctPropio: pct(propio),
          pctOtros: pct(otros),
        };
      })
      .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));

    const sum = (k: "aliado" | "propio" | "otros" | "sinDato" | "base") => filas.reduce((acc, f) => acc + f[k], 0);
    const base = sum("base");
    const total = { aliado: sum("aliado"), propio: sum("propio"), otros: sum("otros"), sinDato: sum("sinDato"), base };
    const pct = (n: number) => (base > 0 ? (n / base) * 100 : 0);
    return { filas, total, pctAliado: pct(total.aliado), pctPropio: pct(total.propio), pctOtros: pct(total.otros) };
  }, [grupos]);

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
  // Este panel mide AGENDAS y solo agendas: cuántas asesorías tiene el AM en el
  // mes contra las que Dirección le puso de meta. No lleva selector de métrica —
  // llegó a tenerlo y era ruido: la meta de agenda es una sola cosa.
  const { objetivos, error: errorObjetivos, puedeEditar, guardar } = useObjetivosAM(periodo, "agenda");

  // Qué trozo del mes pide el informe. Se cuentan SOLO las agendas de esa
  // ventana y la meta mensual se prorratea a ella: pedir «Mes a la fecha» tiene
  // que enseñar las agendas de esos días contra la parte de meta que les toca,
  // no el mes entero. La ventana se topa en hoy porque una reunión agendada para
  // dentro de dos semanas todavía no está conseguida.
  const ventana = useMemo(() => ventanaDelMes(periodo, filters.desde, filters.hasta), [periodo, filters.desde, filters.hasta]);

  // ⚠️ Las agendas NO pueden salir de `grupos`, que está acotado al rango de la
  // pestaña por `created_at`. Una asesoría de agosto puede ser de un cliente
  // capturado en junio, y con «Mes a la fecha» ese proyecto ni siquiera estaría
  // en la lista: se perderían agendas reales. Este panel parte de la cartera
  // ENTERA (con los filtros de producto, segmento y AM, pero sin fecha) y se
  // acota él mismo por la fecha de la REUNIÓN.
  const gruposAgenda = useMemo(() => {
    const vivos = prospects.filter((p) => !isProspectDeleted(p) && !isProspectPurged(p));
    const porSeleccion =
      filters.entidades.length === 0
        ? vivos
        : vivos.filter((p) => filters.entidades.includes(p.account_manager_id || SIN_AM));
    const sinFecha = aplicaFiltros(porSeleccion, { ...filters, desde: "", hasta: "" }, perfilPorId);
    return agrupaPor(
      sinFecha,
      (p) => p.account_manager_id || null,
      (id) => perfilPorId.get(id)?.full_name || "Account Manager",
      "Mesa de dirección"
    );
  }, [prospects, filters, perfilPorId, isProspectDeleted, isProspectPurged]);

  // Solo los AM de verdad llevan meta: a la mesa de dirección no se le pone
  // objetivo de agenda, así que se queda fuera de este gráfico.
  //
  // Una agenda cuenta el día de la REUNIÓN (`asesoria_at`), no el de la captura.
  // Y cuenta aunque el proyecto ya haya avanzado: la fecha no se borra al pasar
  // a Firma o a Fin. Otorgado, así que la asesoría celebrada sigue sumando en su
  // día en vez de desaparecer del histórico.
  const filasAgenda = useMemo(
    () =>
      gruposAgenda
        .filter((g) => g.id !== SIN_AM)
        .map((g) => {
          const objetivo = objetivos.get(g.id) ?? 0;
          return {
            id: g.id,
            nombre: g.nombre,
            objetivo,
            esperado: objetivoEnVentana(objetivo, ventana),
            real:
              ventana.dias === 0
                ? 0
                : g.items.filter((p) => {
                    const d = diaDeCita(p.asesoria_at);
                    return d !== null && d >= ventana.desde && d <= ventana.hasta;
                  }).length,
          };
        })
        // Se ordena por PORCENTAJE, que es lo que dibuja la barra: por cantidad,
        // quien no tiene meta se colaba por delante de quien sí la tiene y va
        // corto, y la lectura de izquierda a derecha dejaba de significar nada.
        // Sin objetivo va al final (−1), no primero.
        .sort((a, b) => {
          const pa = a.esperado > 0 ? a.real / a.esperado : -1;
          const pb = b.esperado > 0 ? b.real / b.esperado : -1;
          return pb - pa || b.real - a.real;
        }),
    [gruposAgenda, objetivos, ventana]
  );

  // El CSV lee de aquí y no recalcula: si divergieran, el archivo diría una cosa
  // y la pantalla otra.
  const agendasPorAM = useMemo(() => new Map(filasAgenda.map((f) => [f.id, f.real])), [filasAgenda]);
  const esperadoPorAM = useMemo(() => new Map(filasAgenda.map((f) => [f.id, f.esperado])), [filasAgenda]);

  // Totales, no promedios: el promedio de una meta ("100" cuando la suma es 500)
  // se lee como si esa fuera la meta y descuadra contra la tabla de abajo.
  const totObjetivo = filasAgenda.reduce((s, f) => s + f.objetivo, 0);
  const totEsperado = filasAgenda.reduce((s, f) => s + f.esperado, 0);
  const totReal = filasAgenda.reduce((s, f) => s + f.real, 0);
  const avanceGlobal = totEsperado > 0 ? (totReal / totEsperado) * 100 : null;
  // La vara es siempre el objetivo A LA FECHA: con el mes cerrado vale lo mismo
  // que la meta entera, así que no hace falta distinguir los dos casos.
  const cumplen = filasAgenda.filter((f) => f.esperado > 0 && f.real >= f.esperado).length;
  const conObjetivo = filasAgenda.filter((f) => f.objetivo > 0).length;

  // ── 6 · Cierre de agendas ──────────────────────────────────────────────────
  // Mismo universo que el panel de arriba —la cartera entera acotada por la fecha
  // de la REUNIÓN, no por la de captura—, pero sin el corsé del mes: aquí no hay
  // meta mensual que prorratear, así que se mide el rango entero que pide el
  // informe. Con «Histórico» salen todas las asesorías celebradas.
  //
  // Ojo a la cifra: este panel cuenta las agendas del rango COMPLETO y el de
  // arriba solo el trozo que cae en el mes de la meta. Con «Mes a la fecha» dicen
  // lo mismo; con «Año actual», no, y por eso cada uno rotula su ventana.
  const rangoCierre = useMemo(() => rangoDeAgendas(filters.desde, filters.hasta), [filters.desde, filters.hasta]);

  // Se incluye la mesa de dirección: sus agendas también se cierran, y esconderlas
  // haría que la tasa global no cuadrara con la suma de las barras. Solo se cae
  // del gráfico quien no tenga NINGUNA agenda en el rango — una barra a cero no
  // dice «cierra mal», dice «no tenía nada que cerrar».
  // ⚠️ Los dos lados de la comparación NO salen de la misma lista, y es a
  // propósito:
  //
  //   · Las AGENDAS salen de la cartera entera acotada por la fecha de la
  //     REUNIÓN (`gruposAgenda`), igual que el panel de arriba.
  //   · Los OTORGADOS salen de `grupos`, o sea de la misma lista y con la misma
  //     regla de fecha que el resto de la pestaña. Es, cifra por cifra, la
  //     tarjeta «Fin. Otorgado» de la cabecera.
  //
  // Exigir que el otorgado viniera de una agenda del rango era lo que rompía el
  // número: de los 10 otorgados de producción, 8 no tienen asesoría registrada
  // —el campo es de finales de julio de 2026 y casi ningún expediente pasó por
  // él—, así que el panel enseñaba 2. Dirección mide el financiamiento otorgado
  // contra las agendas, no el subconjunto que casualmente tiene las dos cosas.
  //
  // Consecuencia asumida: la tasa puede pasar del 100 % cuando un AM otorga más
  // de lo que registró en agenda. El rótulo lo dice y la nota del panel lo
  // explica; taparlo escondería justo lo que hay que arreglar en la captura.
  const filasCierre = useMemo(() => {
    const agendasPorAM = new Map(
      gruposAgenda.map((g) => [g.id, { nombre: g.nombre, n: g.items.filter((p) => agendaEnRango(p, rangoCierre)).length }])
    );
    const otorgadosPorAM = new Map(
      grupos.map((g) => [g.id, { nombre: g.nombre, n: g.items.filter(esFinOtorgado).length }])
    );
    // Unión de las dos listas: un AM con otorgados y sin agendas registradas
    // tiene que salir igual — es precisamente el caso que hay que ver.
    const ids = new Set([...agendasPorAM.keys(), ...otorgadosPorAM.keys()]);
    return Array.from(ids)
      .map((id) => ({
        id,
        nombre: agendasPorAM.get(id)?.nombre || otorgadosPorAM.get(id)?.nombre || "Account Manager",
        base: agendasPorAM.get(id)?.n ?? 0,
        logrado: otorgadosPorAM.get(id)?.n ?? 0,
      }))
      .filter((f) => f.base > 0 || f.logrado > 0)
      // Por TASA, que es lo que dibuja el relleno de la barra. Sin agendas no hay
      // tasa que ordenar (−1): esas filas van al final. El empate lo rompe el
      // volumen de agendas.
      .sort((a, b) => {
        const ta = a.base > 0 ? a.logrado / a.base : -1;
        const tb = b.base > 0 ? b.logrado / b.base : -1;
        return tb - ta || b.base - a.base;
      });
  }, [gruposAgenda, grupos, rangoCierre]);

  // El CSV lee de aquí y no recalcula, igual que en el panel de agendas.
  const cierrePorAM = useMemo(() => new Map(filasCierre.map((f) => [f.id, f])), [filasCierre]);

  const totAgendasCierre = filasCierre.reduce((s, f) => s + f.base, 0);
  const totOtorgados = filasCierre.reduce((s, f) => s + f.logrado, 0);
  const tasaCierreAgendas = totAgendasCierre > 0 ? (totOtorgados / totAgendasCierre) * 100 : null;

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
        `Meta de agendas ${periodo}`,
        "Objetivo de agendas a la fecha",
        `Agendas del ${ventana.desde} al ${ventana.hasta}`,
        // El otorgado ya va arriba, en las columnas del ranking: repetirlo aquí
        // solo invitaría a que alguien encontrara dos cifras y dudara de las dos.
        `Agendas del rango (${rangoCierre.desde || "inicio"} al ${rangoCierre.hasta})`,
        "Tasa de cierre de agendas %",
        "Altas del aliado",
        "Altas del aliado %",
        "Altas del AM",
        "Altas del AM %",
        "Altas de otros",
        "Sin autoría registrada",
      ],
    ];
    const origenPorId = new Map(origenPorAM.filas.map((f) => [f.id, f]));
    ranking.forEach((r) => {
      const g = grupos.find((x) => x.id === r.id);
      const list = g?.items || [];
      const t = calcTasas(list);
      const c = cierrePorAM.get(r.id);
      rows.push([
        r.nombre,
        ...METRICAS_RANKING.map((id) => list.filter(METRICAS[id].match).length),
        list.filter(METRICAS.perdidos.match).length,
        list.filter(METRICAS.agenda_futura.match).length,
        (t.aprobacion ?? 0).toFixed(1),
        (t.condicionamiento ?? 0).toFixed(1),
        (t.cierre ?? 0).toFixed(1),
        objetivos.get(r.id) ?? 0,
        esperadoPorAM.get(r.id) ?? 0,
        agendasPorAM.get(r.id) ?? 0,
        c?.base ?? 0,
        // Sin agendas no hay tasa: un 0,0 se leería como "no otorgó nada".
        c && c.base > 0 ? ((c.logrado / c.base) * 100).toFixed(1) : "",
        origenPorId.get(r.id)?.aliado ?? 0,
        // Sin autoría registrada no hay porcentaje que reportar (mismo criterio).
        (origenPorId.get(r.id)?.base ?? 0) > 0 ? (origenPorId.get(r.id)!.pctAliado).toFixed(1) : "",
        origenPorId.get(r.id)?.propio ?? 0,
        (origenPorId.get(r.id)?.base ?? 0) > 0 ? (origenPorId.get(r.id)!.pctPropio).toFixed(1) : "",
        origenPorId.get(r.id)?.otros ?? 0,
        origenPorId.get(r.id)?.sinDato ?? 0,
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

      {/* ── 2.5 · Origen del alta ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
        <PanelHeader
          icon={UserRoundCheck}
          tone="emerald"
          title="Origen del alta por Account Manager"
          subtitle="De los proyectos que gestiona cada AM, cuántos los capturó el aliado en la plataforma y cuántos los tecleó él."
        />

        {origenPorAM.total.base === 0 ? (
          <Vacio>Sin proyectos con autoría registrada en el período.</Vacio>
        ) : (
          <>
            {/* Resumen del conjunto seleccionado */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: "Los creó el aliado", n: origenPorAM.total.aliado, pct: origenPorAM.pctAliado, color: C_ALIADO, nota: "uso real de la plataforma" },
                { label: "Los creó el Account Manager", n: origenPorAM.total.propio, pct: origenPorAM.pctPropio, color: C_AM, nota: "altas que la plataforma hace por ellos" },
                { label: "Otros (Dirección u otro AM)", n: origenPorAM.total.otros, pct: origenPorAM.pctOtros, color: C_OTROS, nota: "incluye proyectos reasignados" },
              ].map((c) => (
                <div key={c.label} className="rounded-2xl border border-slate-150 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/30 p-4">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-400 dark:text-slate-500 leading-tight">{c.label}</span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-2xl font-bold tabular-nums tracking-tight leading-none" style={{ color: c.color }}>{c.pct.toFixed(0)}%</span>
                    <span className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">{fmtNum(c.n)}</span>
                    <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">de {fmtNum(origenPorAM.total.base)}</span>
                  </div>
                  <p className="mt-1.5 text-[10px] font-medium text-slate-400 dark:text-slate-500">{c.nota}</p>
                </div>
              ))}
            </div>

            {/* Barra apilada del conjunto */}
            <div className="flex h-3 rounded-full overflow-hidden bg-slate-150 dark:bg-slate-800">
              {[
                { k: "a", pct: origenPorAM.pctAliado, color: C_ALIADO, label: `Aliado: ${origenPorAM.total.aliado}` },
                { k: "m", pct: origenPorAM.pctPropio, color: C_AM, label: `Account Manager: ${origenPorAM.total.propio}` },
                { k: "o", pct: origenPorAM.pctOtros, color: C_OTROS, label: `Otros: ${origenPorAM.total.otros}` },
              ].map((seg) => (
                <div key={seg.k} style={{ width: `${seg.pct}%`, background: seg.color }} title={seg.label} />
              ))}
            </div>
            {origenPorAM.total.sinDato > 0 && (
              <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                {fmtNum(origenPorAM.total.sinDato)} proyecto(s) sin autoría registrada quedan fuera del porcentaje: no se reparten para no inflar ninguno de los lados.
              </p>
            )}

            {/* Detalle por AM */}
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-xs min-w-[720px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                    {["Account Manager", "Distribución", "Los creó el aliado", "Los creó el AM", "Otros", "Total"].map((h, i) => (
                      <th
                        key={h}
                        className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 ${i > 1 ? "text-right" : ""}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {origenPorAM.filas.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-3 py-2">
                        <span className="font-bold text-slate-800 dark:text-slate-200 truncate block max-w-[200px]" title={f.nombre}>
                          {f.nombre}
                        </span>
                      </td>
                      <td className="px-3 py-2 w-[220px]">
                        {f.base === 0 ? (
                          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">Sin autoría registrada</span>
                        ) : (
                          <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-150 dark:bg-slate-800 min-w-[160px]">
                            <div style={{ width: `${f.pctAliado}%`, background: C_ALIADO }} title={`Aliado: ${f.aliado}`} />
                            <div style={{ width: `${f.pctPropio}%`, background: C_AM }} title={`Él mismo: ${f.propio}`} />
                            <div style={{ width: `${f.pctOtros}%`, background: C_OTROS }} title={`Otros: ${f.otros}`} />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className="font-bold" style={{ color: f.aliado > 0 ? C_ALIADO : undefined }}>{f.aliado}</span>
                        <span className="text-slate-400 dark:text-slate-500 font-medium"> · {f.base > 0 ? `${f.pctAliado.toFixed(0)}%` : "—"}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className="font-bold" style={{ color: f.propio > 0 ? C_AM : undefined }}>{f.propio}</span>
                        <span className="text-slate-400 dark:text-slate-500 font-medium"> · {f.base > 0 ? `${f.pctPropio.toFixed(0)}%` : "—"}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                        <span className="font-bold">{f.otros}</span>
                        <span className="text-slate-400 dark:text-slate-500 font-medium"> · {f.base > 0 ? `${f.pctOtros.toFixed(0)}%` : "—"}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-700 dark:text-slate-200">
                        {f.total}
                        {f.sinDato > 0 && (
                          <span className="text-slate-400 dark:text-slate-500 font-medium" title="Sin autoría registrada"> · {f.sinDato} s/r</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
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
          title="Agendas · avance contra el objetivo"
          subtitle={
            ventana.dias === 0 ? (
              <>
                El rango elegido no toca ningún día ya transcurrido de <strong>{mesLabel(periodo)}</strong>.
              </>
            ) : (
              <>
                Asesorías con reunión del <strong>{diaLabel(ventana.desde)}</strong> al{" "}
                <strong>{diaLabel(ventana.hasta)}</strong> · {ventana.dias} de {ventana.diasMes} días de{" "}
                {mesLabel(periodo)}.{" "}
                {ventana.parcial
                  ? "La meta del mes la fija Dirección y aquí va prorrateada a esos días."
                  : "Se compara contra la meta completa del mes, que fija Dirección."}
              </>
            )
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <ChipTasa label="Meta del mes" value={fmtNum(totObjetivo, 0)} tone="sky" />
            <ChipTasa label="Objetivo a la fecha" value={fmtNum(totEsperado, 0)} tone="amber" />
            <ChipTasa label="Llevan" value={fmtNum(totReal, 0)} tone="teal" />
            <ChipTasa label="Avance" value={avanceGlobal === null ? "—" : `${Math.round(avanceGlobal)} %`} tone="teal" />
            <ChipTasa label="Van al ritmo" value={conObjetivo > 0 ? `${cumplen} / ${conObjetivo}` : "—"} tone="amber" />
          </div>
        </PanelHeader>

        {errorObjetivos && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
            <p className="text-[11px] text-amber-800 dark:text-amber-300">{errorObjetivos}</p>
          </div>
        )}

        {filasAgenda.length === 0 ? (
          <Vacio>No hay account managers a los que medir agendas.</Vacio>
        ) : (
          <>
            <AvanceObjetivoChart filas={filasAgenda} />
            <Leyenda
              series={[
                { id: "meta", label: "Objetivo a la fecha (la barra entera)", color: VIZ_TRACK_VAR },
                { id: "ok", label: "Al día (100 % o más)", color: "var(--rp-6)" },
                { id: "cerca", label: "Por debajo (70–99 %)", color: "var(--rp-4)" },
                { id: "lejos", label: "Muy por debajo (menos de 70 %)", color: "var(--rp-8)" },
                { id: "sin", label: "Sin objetivo puesto", color: VIZ_MUTED_VAR },
              ]}
            />
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Cada barra es el objetivo a la fecha —la meta del mes repartida entre los días del rango, con su cantidad
              rotulada encima— y se va llenando con las agendas conseguidas. El color dice el ritmo y el porcentaje va
              dentro. Una agenda cuenta el día de la reunión y sigue contando aunque el proyecto ya haya avanzado; lo
              agendado para más adelante no cuenta todavía como conseguido.
            </p>

            {puedeEditar && (
              <div className="rounded-xl border border-slate-200/70 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                  <h4 className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                    Objetivo de agendas · {mesLabel(periodo)}
                  </h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    Se guarda al salir del campo. Cada mes lleva su propia meta y queda histórica.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[620px]">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                        {["Account Manager", "Meta del mes", "Objetivo a la fecha", "Llevan", "Avance"].map((h, i) => (
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
                        <FilaObjetivo key={f.id} fila={f} onGuardar={(v) => guardar(f.id, v)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 6 · Cierre de agendas ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-4">
        <PanelHeader
          icon={Handshake}
          tone="sky"
          title="Cierre de agendas"
          subtitle={
            rangoCierre.vacio ? (
              <>El rango elegido empieza después de hoy: todavía no hay asesorías celebradas que medir.</>
            ) : rangoCierre.desde ? (
              <>
                Financiamientos otorgados contra las asesorías celebradas del{" "}
                <strong>{diaLabel(rangoCierre.desde)}</strong> al <strong>{diaLabel(rangoCierre.hasta)}</strong>.
              </>
            ) : (
              <>
                Financiamientos otorgados contra todas las asesorías celebradas hasta el{" "}
                <strong>{diaLabel(rangoCierre.hasta)}</strong>.
              </>
            )
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <ChipTasa label="Agendas" value={fmtNum(totAgendasCierre, 0)} tone="sky" />
            <ChipTasa label="Fin. Otorgado" value={fmtNum(totOtorgados, 0)} tone="teal" />
            <ChipTasa
              label="Tasa de cierre"
              value={tasaCierreAgendas === null ? "—" : `${Math.round(tasaCierreAgendas)} %`}
              tone="teal"
            />
          </div>
        </PanelHeader>

        {filasCierre.length === 0 ? (
          <Vacio>No hay asesorías celebradas ni financiamientos otorgados en el rango con los filtros activos.</Vacio>
        ) : (
          <>
            <ConversionChart
              filas={filasCierre}
              baseLabel="Agendas del rango"
              logradoLabel="Fin. Otorgado"
              unidadLograda="otorgados"
            />
            <Leyenda
              series={[
                { id: "agendas", label: "Agendas del rango (la barra entera)", color: VIZ_TRACK_VAR, total: totAgendasCierre },
                { id: "otorgados", label: "Financiamiento otorgado", color: "var(--rp-6)", total: totOtorgados },
              ]}
            />
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              La barra entera son las agendas del rango —su cantidad va rotulada encima— y el relleno, los
              financiamientos otorgados; dentro va la tasa. Otorgado son «Cerrada Ganada» y «Pagada Cerrada», los dos
              estados de esa etapa: la segunda es el paso siguiente al cierre, no otra cosa. La agenda cuenta por el día
              de la reunión y el otorgado por la misma regla de fecha que el resto de la pestaña, así que un AM puede
              pasar del 100 %: significa que otorgó más de lo que tiene registrado en agenda.
            </p>

            <div className="rounded-xl border border-slate-200/70 dark:border-slate-800 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                <h4 className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                  Cierre de agendas por Account Manager
                </h4>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  «Fin. Otorgado» es la misma cifra que la tarjeta de la cabecera, repartida por Account Manager.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[520px]">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                      {["Account Manager", "Agendas", "Fin. Otorgado", "Tasa de cierre"].map((h, i) => (
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
                    {filasCierre.map((f) => {
                      const tasa = f.base > 0 ? (f.logrado / f.base) * 100 : null;
                      return (
                        <tr key={f.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors">
                          <td className="px-4 py-2 font-bold text-slate-800 dark:text-slate-200 truncate max-w-[220px]">
                            {f.nombre}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{f.base}</td>
                          <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                            {f.logrado}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {tasa === null ? (
                              <span className="text-slate-400 dark:text-slate-500">Sin agendas</span>
                            ) : (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tabular-nums ${
                                  tasa > 100
                                    ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400"
                                    : "bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400"
                                }`}
                                title={
                                  tasa > 100
                                    ? `${f.logrado} otorgados sobre ${f.base} agendas registradas: hay otorgados sin asesoría capturada`
                                    : `${f.logrado} de ${f.base} agendas`
                                }
                              >
                                {tasa.toFixed(0)} %
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Los totales van aquí y no en otro chip de cabecera: es donde se
                      comprueba que la tasa global sale de estas dos columnas. */}
                  <tfoot>
                    <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 font-bold text-slate-700 dark:text-slate-200">
                      <td className="px-4 py-2">Total</td>
                      <td className="px-4 py-2 text-right tabular-nums">{totAgendasCierre}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{totOtorgados}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {tasaCierreAgendas === null ? "—" : `${tasaCierreAgendas.toFixed(0)} %`}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── 7 · Sub estados ───────────────────────────────────────────────── */}
      <SubEstadosPanel
        items={items}
        profiles={profiles}
        subtitulo="Dónde están parados los proyectos de estos account managers. Toca una subetapa para desplegarlos."
      />

      {/* ── 8 · Actividad en plataforma ───────────────────────────────────── */}
      {/* Va al final y no arriba a propósito: todo lo anterior mide RESULTADO
          (proyectos, agendas, cierres) y esto mide ESFUERZO. Puesto debajo, se
          lee como la explicación de lo de arriba — por qué un AM cierra poco —
          y no como un indicador de gestión por sí solo. */}
      <ActividadAMPanel filters={filters} />
    </div>
  );
}

/**
 * Un renglón editable de la meta. Guarda al perder el foco (no en cada tecla):
 * si no, teclear "40" dispararía un UPSERT con "4" por el camino.
 */
function FilaObjetivo({
  fila,
  onGuardar,
}: {
  fila: { id: string; nombre: string; objetivo: number; real: number; esperado: number };
  onGuardar: (valor: number) => void;
}) {
  const [borrador, setBorrador] = useState(String(fila.objetivo));

  // Si la meta cambia por fuera (otro mes, recarga), el campo sigue.
  React.useEffect(() => {
    setBorrador(String(fila.objetivo));
  }, [fila.objetivo]);

  // Siempre contra el objetivo A LA FECHA: con el mes ya cerrado ese objetivo es
  // la meta entera, así que la misma fórmula sirve para las dos situaciones.
  const avance = fila.esperado > 0 ? (fila.real / fila.esperado) * 100 : null;

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
      <td className="px-4 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
        {fila.objetivo > 0 ? fila.esperado : "—"}
      </td>
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
            title={`${fila.real} de ${fila.esperado} a la fecha (meta del mes: ${fila.objetivo})`}
          >
            {avance.toFixed(0)} %
          </span>
        )}
      </td>
    </tr>
  );
}
