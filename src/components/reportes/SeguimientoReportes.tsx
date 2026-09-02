"use client";

// Pestaña SEGUIMIENTO del módulo Reportes.
//
// QUÉ CONTESTA
// El account manager es el responsable del seguimiento del proyecto. Este
// tablero mide eso y nada más:
//
//   1. Estado de la cartera   — de todo lo que hay vivo, cuánto está atendido,
//                               cuánto se está enfriando y cuánto no lo ha
//                               tocado nadie.
//   2. Por account manager    — el mismo corte, persona por persona.
//   3. Ritmo                  — cuántas notas se escriben cada período y quién
//                               las escribe.
//   4. GoHighLevel            — qué nivel de seguimiento sostiene GHL por su
//                               cuenta, y en cuántos expedientes es lo ÚNICO
//                               que hay.
//   5. Cartera sin tocar      — la lista para ir a trabajarla hoy.
//
// LA SEPARACIÓN QUE LO SOSTIENE TODO
// Una nota traída de GoHighLevel es contacto con el cliente, pero NO es
// seguimiento hecho aquí por el AM responsable. Si las dos se suman en el mismo
// montón, un AM que lleva tres semanas sin abrir un expediente aparece con la
// cartera «al día» porque el barrido nocturno le rellenó la bitácora. Por eso en
// TODO este tablero:
//
//   · «seguimiento propio» = notas con `origen = 'plataforma'`.
//   · lo de GoHighLevel se cuenta aparte y tiene su propio apartado.
//
// LOS CORTES DE TEMPERATURA (3 y 7 días) NO SE REINVENTAN AQUÍ
// Salen de `@/utils/notas`, que es de donde los toma también la columna «Último
// seguimiento» del listado de clientes. Si este panel los calculara por su
// cuenta, la tabla diría «Hace 8 días» y el reporte lo pintaría como tibio.

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Download,
  Flame,
  LineChart as LineChartIcon,
  MessageSquareText,
  PlugZap,
  StickyNote,
  Users,
} from "lucide-react";
import { useApp, isLostStatus, type Prospect } from "@/utils/context/AppContext";
import { StatCard } from "@/components/ui/StatCard";
import { NotasDrawer } from "@/components/ui/notasSeguimiento";
import { FIN_OTORGADO_STAGE } from "@/app/admin/_pipelineBuckets";
import { STEP_DEFS, getActiveStageIndex } from "@/components/ui/projectStepper";
import { SELLOS, type ClaveSello } from "@/utils/ghlMatch";
import { diasDesde, etiquetaDias, fechaCortaLocal } from "@/utils/notas";
import {
  Donut,
  DonutLegend,
  GrupoBarrasChart,
  Leyenda,
  PanelHeader,
  RankingChart,
  SerieChart,
  Vacio,
  VIZ_MUTED_VAR,
  pill,
  segmented,
} from "./ReportesCharts";
import { useSeguimiento, type SeguimientoProyecto } from "./useSeguimiento";
import { cotejosDemo } from "./seguimientoDemo";
import type { ReportesFilters } from "./reportesFilters";
import { type Grano, GRANO_LABEL, aplicaFiltros, bucketStart, construyeCubos, fmtPct } from "./reportesTypes";

const GRANOS: Grano[] = ["dia", "semana", "mes", "anio"];
const SIN_AM = "__sin__";
/** Barras que caben sin que el eje X se vuelva ilegible. El resto se dice, no se esconde. */
const TOPE_RANKING = 20;
/** Renglones de la lista de trabajo. Más que esto no se lee: se filtra. */
const TOPE_LISTA = 60;

// ── Cómo está el seguimiento de UN proyecto ──────────────────────────────────
// Los cinco cubos son una PARTICIÓN: cada proyecto cae en uno y solo uno, así
// que la dona suma siempre el total de la cartera.
type EstadoSeg = "al_dia" | "tibio" | "frio" | "solo_ghl" | "sin_registro";

const ESTADOS: EstadoSeg[] = ["al_dia", "tibio", "frio", "solo_ghl", "sin_registro"];

const LABEL_ESTADO: Record<EstadoSeg, string> = {
  al_dia: "Al día (3 días o menos)",
  tibio: "Tibio (4 a 7 días)",
  frio: "Frío (más de 7 días)",
  solo_ghl: "Solo en GoHighLevel",
  sin_registro: "Sin ningún registro",
};

// Verde / ámbar / rosa son los mismos tonos del chip «Último seguimiento» del
// listado; el azul es el de GoHighLevel en los charts del módulo.
const COLOR_ESTADO: Record<EstadoSeg, string> = {
  al_dia: "#059669",
  tibio: "#d97706",
  frio: "#e11d48",
  solo_ghl: "#2a78d6",
  sin_registro: VIZ_MUTED_VAR,
};

const C_PROPIO = "#059669";
const C_GHL = "#2a78d6";
const C_ALIADO = "#e87ba4";
const C_DIRECCION = "#8b5cf6";

/**
 * Un proyecto RECHAZADO, cerrado perdido o ya otorgado y pagado no necesita
 * seguimiento: contarlo como «sin atender» inflaría el problema con expedientes
 * que están bien como están. Se puede desactivar con el interruptor de arriba,
 * porque para auditar el histórico sí interesa verlo todo.
 */
const necesitaSeguimiento = (p: Prospect) =>
  !isLostStatus(p.status) && p.status !== "rechazado" && !FIN_OTORGADO_STAGE.includes(p.status);

interface FilaProyecto {
  p: Prospect;
  seg: SeguimientoProyecto | undefined;
  estado: EstadoSeg;
  /** Días desde la última nota escrita AQUÍ. `null` si no hay ninguna. */
  diasPropio: number | null;
  diasGhl: number | null;
  amId: string;
}

function clasifica(seg: SeguimientoProyecto | undefined, diasPropio: number | null): EstadoSeg {
  if (seg && seg.notasPlataforma > 0 && diasPropio !== null) {
    if (diasPropio <= 3) return "al_dia";
    if (diasPropio <= 7) return "tibio";
    return "frio";
  }
  if (seg && seg.notasGhl > 0) return "solo_ghl";
  return "sin_registro";
}

const pct = (parte: number, total: number): number | null => (total > 0 ? (parte / total) * 100 : null);

const esc = (v: string | number) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function descargaCsv(nombre: string, filas: (string | number)[][]) {
  const csv = filas.map((f) => f.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type OrdenRanking = "cartera" | "cobertura" | "riesgo";

const ORDEN_LABEL: Record<OrdenRanking, string> = {
  cartera: "Cartera",
  cobertura: "Cobertura",
  riesgo: "En riesgo",
};

export function SeguimientoReportes({
  filters,
  setFilters,
}: {
  filters: ReportesFilters;
  setFilters: (patch: Partial<ReportesFilters>) => void;
}) {
  const { prospects, profiles, cotejosGhl, notasResumen, isProspectDeleted, isProspectPurged } = useApp();
  const { porProyecto, porDia, cargando, error, demo, recargar } = useSeguimiento(filters.desde, filters.hasta);

  // En modo demo no hay barrido nocturno que selle nada, así que `cotejosGhl`
  // llega vacío y el apartado de GoHighLevel no se podría revisar en local.
  const cotejos = useMemo(() => (demo ? cotejosDemo(prospects) : cotejosGhl), [demo, prospects, cotejosGhl]);

  // El cajón de notas de los listados, montado desde la lista de trabajo: leer lo
  // que hay —lo propio y lo de GoHighLevel, cada uno con su sello— y escribir el
  // seguimiento sin abandonar el informe. Es el mismo componente que usa Gestión
  // de Clientes, así que lo que se escriba aquí está en el expediente y al revés.
  const [notasTarget, setNotasTarget] = useState<Prospect | null>(null);
  // Cuántas notas tenía el proyecto al abrir el cajón. Si al cerrarlo hay más, el
  // informe se ha quedado viejo —ese proyecto ya no va en «sin tocar»— y se
  // vuelve a pedir. Comparar en vez de recargar siempre evita dos peticiones por
  // cada expediente que alguien solo abre para leer.
  const [notasAlAbrir, setNotasAlAbrir] = useState<number | null>(null);

  const abrirNotas = (p: Prospect) => {
    setNotasAlAbrir(notasResumen[p.id]?.total ?? 0);
    setNotasTarget(p);
  };

  const cerrarNotas = () => {
    const antes = notasAlAbrir;
    const ahora = notasTarget ? notasResumen[notasTarget.id]?.total ?? 0 : antes;
    setNotasTarget(null);
    setNotasAlAbrir(null);
    if (antes !== null && ahora !== antes) void recargar();
  };

  const [soloActivos, setSoloActivos] = useState(true);
  const [orden, setOrden] = useState<OrdenRanking>("riesgo");
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());

  const perfilPorId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const nombreAm = (id: string) => (id === SIN_AM ? "Mesa de dirección" : perfilPorId.get(id)?.full_name || "Account Manager");

  // ── Universo del reporte ───────────────────────────────────────────────────
  // Mismo colador que el resto del módulo (período por fecha de captura,
  // producto y segmento) más el interruptor de cartera activa.
  const items = useMemo(() => {
    const vivos = prospects.filter((p) => !isProspectDeleted(p) && !isProspectPurged(p));
    const porSeleccion =
      filters.entidades.length === 0
        ? vivos
        : vivos.filter((p) => filters.entidades.includes(p.account_manager_id || SIN_AM));
    const porEstado = soloActivos ? porSeleccion.filter(necesitaSeguimiento) : porSeleccion;
    return aplicaFiltros(porEstado, filters, perfilPorId);
  }, [prospects, filters, perfilPorId, soloActivos, isProspectDeleted, isProspectPurged]);

  // ── Estado de seguimiento de cada proyecto ─────────────────────────────────
  const filas = useMemo<FilaProyecto[]>(
    () =>
      items.map((p) => {
        const seg = porProyecto[p.id];
        const diasPropio = seg?.ultimaPlataformaAt ? diasDesde(seg.ultimaPlataformaAt) : null;
        const diasGhl = seg?.ultimaGhlAt ? diasDesde(seg.ultimaGhlAt) : null;
        return {
          p,
          seg,
          estado: clasifica(seg, diasPropio),
          diasPropio,
          diasGhl,
          amId: p.account_manager_id || SIN_AM,
        };
      }),
    [items, porProyecto]
  );

  const total = filas.length;

  const conteo = useMemo(() => {
    const base: Record<EstadoSeg, number> = { al_dia: 0, tibio: 0, frio: 0, solo_ghl: 0, sin_registro: 0 };
    filas.forEach((f) => base[f.estado]++);
    return base;
  }, [filas]);

  const totales = useMemo(() => {
    let notasPropias = 0;
    let notasGhl = 0;
    let notasAm = 0;
    let notasAliado = 0;
    let notasDireccion = 0;
    let conPropio = 0;
    let conGhl = 0;
    let enAmbos = 0;
    let ultimaGhl: string | null = null;
    filas.forEach(({ seg }) => {
      if (!seg) return;
      notasPropias += seg.notasPlataforma;
      notasGhl += seg.notasGhl;
      notasAm += seg.notasAm;
      notasAliado += seg.notasAliado;
      notasDireccion += seg.notasDireccion;
      if (seg.notasPlataforma > 0) conPropio++;
      if (seg.notasGhl > 0) conGhl++;
      if (seg.notasPlataforma > 0 && seg.notasGhl > 0) enAmbos++;
      if (seg.ultimaGhlAt && (!ultimaGhl || seg.ultimaGhlAt > ultimaGhl)) ultimaGhl = seg.ultimaGhlAt;
    });
    return { notasPropias, notasGhl, notasAm, notasAliado, notasDireccion, conPropio, conGhl, enAmbos, ultimaGhl };
  }, [filas]);

  // ── Agregado por Account Manager ───────────────────────────────────────────
  // El AM del proyecto vive en `prospects.account_manager_id` (ver
  // [[project-am-por-proyecto]]). Un proyecto sin AM es mesa de dirección y se
  // cuenta como una columna más: esconderlo haría que las barras no sumaran.
  interface FilaAm {
    id: string;
    nombre: string;
    proyectos: number;
    estados: Record<EstadoSeg, number>;
    conPropio: number;
    conGhl: number;
    notasPropias: number;
    notasGhl: number;
    ultimaPropia: string | null;
  }

  const porAm = useMemo<FilaAm[]>(() => {
    const mapa = new Map<string, FilaAm>();
    filas.forEach((f) => {
      let fila = mapa.get(f.amId);
      if (!fila) {
        fila = {
          id: f.amId,
          nombre: nombreAm(f.amId),
          proyectos: 0,
          estados: { al_dia: 0, tibio: 0, frio: 0, solo_ghl: 0, sin_registro: 0 },
          conPropio: 0,
          conGhl: 0,
          notasPropias: 0,
          notasGhl: 0,
          ultimaPropia: null,
        };
        mapa.set(f.amId, fila);
      }
      fila.proyectos++;
      fila.estados[f.estado]++;
      if (f.seg) {
        fila.notasPropias += f.seg.notasPlataforma;
        fila.notasGhl += f.seg.notasGhl;
        if (f.seg.notasPlataforma > 0) fila.conPropio++;
        if (f.seg.notasGhl > 0) fila.conGhl++;
        if (f.seg.ultimaPlataformaAt && (!fila.ultimaPropia || f.seg.ultimaPlataformaAt > fila.ultimaPropia)) {
          fila.ultimaPropia = f.seg.ultimaPlataformaAt;
        }
      }
    });
    return Array.from(mapa.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, perfilPorId]);

  /** «En riesgo» = frío + sin ningún registro. Solo-GHL no entra: hay contacto, aunque no sea de aquí. */
  const enRiesgoDe = (f: FilaAm) => f.estados.frio + f.estados.sin_registro;

  const amOrdenados = useMemo(() => {
    const lista = [...porAm];
    lista.sort((a, b) => {
      if (orden === "cobertura") return (pct(b.conPropio, b.proyectos) ?? -1) - (pct(a.conPropio, a.proyectos) ?? -1);
      if (orden === "riesgo") return (pct(enRiesgoDe(b), b.proyectos) ?? -1) - (pct(enRiesgoDe(a), a.proyectos) ?? -1);
      return b.proyectos - a.proyectos;
    });
    return lista;
  }, [porAm, orden]);

  const rankingFilas = useMemo(
    () =>
      amOrdenados.slice(0, TOPE_RANKING).map((f) => ({
        id: f.id,
        nombre: f.nombre,
        color: C_PROPIO,
        valor: f.proyectos,
        tasas: [
          { id: "cob", label: "Con seguimiento propio", color: C_PROPIO, value: pct(f.conPropio, f.proyectos) },
          { id: "riesgo", label: "En riesgo", color: COLOR_ESTADO.frio, value: pct(enRiesgoDe(f), f.proyectos) },
        ],
      })),
    [amOrdenados]
  );

  // ── Ritmo: notas escritas por período ──────────────────────────────────────
  // Atribución por AUTORÍA (quién teclea la nota), que es una pregunta distinta
  // de la cobertura: una nota es trabajo de quien la escribe, aunque caiga en el
  // expediente de otro. Con account managers elegidos arriba, la curva es la de
  // SUS notas; las de GoHighLevel no tienen autor y se enseñan siempre.
  //
  // ⚠️ EL TOTAL DE ESTE PANEL NO CUADRA CON EL DE LA CABECERA, Y ESTÁ BIEN.
  // Arriba se cuentan las notas de los proyectos del UNIVERSO (cartera activa,
  // producto, segmento); aquí se cuentan todas las notas del período, vengan del
  // expediente que vengan. `seguimiento_notas_por_dia` agrega por día y autor, no
  // por proyecto, así que no hay forma de cruzarlo con el universo sin bajarse la
  // bitácora entera — que es justo lo que se evita. Mismo criterio que el panel
  // de actividad del AM, que tampoco responde a producto ni segmento. El
  // subtítulo lo dice en voz alta para que nadie lo lea como un descuadre.
  const diasFiltrados = useMemo(() => {
    const sel = new Set(filters.entidades.filter((e) => e !== SIN_AM));
    if (sel.size === 0) return porDia;
    return porDia.filter((d) => d.origen === "ghl" || (d.autorId && sel.has(d.autorId)));
  }, [porDia, filters.entidades]);

  const cubos = useMemo(
    () => construyeCubos(diasFiltrados.map((d) => d.dia), filters.desde, filters.hasta, filters.grano),
    [diasFiltrados, filters.desde, filters.hasta, filters.grano]
  );

  const SERIES_RITMO = useMemo(
    () => [
      {
        id: "am",
        label: "Account manager",
        color: C_PROPIO,
        match: (d: (typeof porDia)[number]) => d.origen === "plataforma" && d.rol === "account_manager",
      },
      {
        id: "aliado",
        label: "Aliado",
        color: C_ALIADO,
        match: (d: (typeof porDia)[number]) => d.origen === "plataforma" && d.rol === "aliado",
      },
      {
        id: "direccion",
        label: "Dirección",
        color: C_DIRECCION,
        match: (d: (typeof porDia)[number]) =>
          d.origen === "plataforma" && (d.rol === "admin" || d.rol === "director"),
      },
      { id: "ghl", label: "GoHighLevel", color: C_GHL, match: (d: (typeof porDia)[number]) => d.origen === "ghl" },
    ],
    []
  );

  const seriesRitmo = useMemo(() => {
    const idx = new Map(cubos.map((c, i) => [c.iso, i]));
    return SERIES_RITMO.map((s) => {
      const values = new Array(cubos.length).fill(0);
      diasFiltrados.forEach((d) => {
        if (!s.match(d)) return;
        const i = idx.get(bucketStart(`${d.dia}T00:00:00Z`, filters.grano));
        if (i !== undefined) values[i] += d.notas;
      });
      return { id: s.id, label: s.label, color: s.color, values };
    });
  }, [SERIES_RITMO, diasFiltrados, cubos, filters.grano]);

  const seriesVisibles = seriesRitmo.filter((s) => !ocultas.has(s.id));

  const leyendaRitmo = seriesRitmo.map((s) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    total: s.values.reduce((a, b) => a + b, 0),
  }));

  const toggleSerie = (id: string) =>
    setOcultas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── GoHighLevel: qué sostiene por su cuenta ────────────────────────────────
  // Se cruza con el SELLO de cotejo (`prospect_ghl_cotejo`, migración
  // 20260826000002) porque la pregunta correcta no es «cuántos de la cartera
  // tienen nota de GHL» sino «de los que SÍ existen allá, en cuántos hay
  // seguimiento». Un proyecto que no está en GoHighLevel no puede tener notas y
  // contarlo como fallo de GHL sería injusto con el dato.
  const CLAVES_SELLO: ClaveSello[] = ["verificado", "probable", "nombre", "revisar"];

  const porSello = useMemo(() => {
    const base = new Map<string, { label: string; proyectos: number; conNotas: number; notas: number; copia: boolean }>();
    const meter = (clave: string, label: string, copia: boolean, f: FilaProyecto) => {
      const fila = base.get(clave) || { label, proyectos: 0, conNotas: 0, notas: 0, copia };
      fila.proyectos++;
      if (f.seg && f.seg.notasGhl > 0) {
        fila.conNotas++;
        fila.notas += f.seg.notasGhl;
      }
      base.set(clave, fila);
    };
    filas.forEach((f) => {
      const cotejo = cotejos[f.p.id];
      if (!cotejo) return meter("__nunca__", "Nunca cotejado", false, f);
      if (!cotejo.sello) return meter("__fuera__", "No está en GoHighLevel", false, f);
      const sello = SELLOS[cotejo.sello as ClaveSello];
      meter(cotejo.sello, sello?.label || cotejo.sello, sello?.copia ?? false, f);
    });
    const orden = [...CLAVES_SELLO, "__fuera__", "__nunca__"];
    return orden
      .map((clave) => ({ clave, ...(base.get(clave) as any) }))
      .filter((f) => f.proyectos > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, cotejos]);

  /** Están en GoHighLevel con un cotejo que SÍ copia notas, y aun así no hay ni una. */
  const cotejadosSinNota = useMemo(
    () =>
      filas.filter((f) => {
        const cotejo = cotejos[f.p.id];
        if (!cotejo?.sello) return false;
        if (!SELLOS[cotejo.sello as ClaveSello]?.copia) return false;
        return !f.seg || f.seg.notasGhl === 0;
      }).length,
    [filas, cotejos]
  );

  const comparativaGhl = useMemo(() => {
    const top = amOrdenados.slice(0, 12);
    return {
      entidades: top.map((f) => ({ id: f.id, nombre: f.nombre })),
      series: [
        { id: "propio", label: "Con seguimiento propio", color: C_PROPIO, values: top.map((f) => f.conPropio) },
        { id: "ghl", label: "Con notas de GoHighLevel", color: C_GHL, values: top.map((f) => f.conGhl) },
      ],
    };
  }, [amOrdenados]);

  // ── Lista de trabajo ───────────────────────────────────────────────────────
  // Prioriza por lo que más duele: lo que lleva más tiempo sin una nota propia.
  // Un proyecto que NUNCA tuvo una se ordena por su antigüedad, que es
  // exactamente el tiempo que lleva sin atenderse.
  const pendientes = useMemo(() => {
    const espera = (f: FilaProyecto) => f.diasPropio ?? diasDesde(f.p.created_at) ?? 0;
    return filas
      .filter((f) => f.estado === "frio" || f.estado === "solo_ghl" || f.estado === "sin_registro")
      .sort((a, b) => espera(b) - espera(a));
  }, [filas]);

  // ── CSV ────────────────────────────────────────────────────────────────────
  const exportAm = () =>
    descargaCsv("seguimiento-por-account-manager.csv", [
      [
        "Account Manager",
        "Proyectos",
        "Con seguimiento propio",
        "% cobertura propia",
        "Al día",
        "Tibio",
        "Frío",
        "Solo GoHighLevel",
        "Sin ningún registro",
        "% en riesgo",
        "Notas propias",
        "Notas de GoHighLevel",
        "Última nota propia",
      ],
      ...amOrdenados.map((f) => [
        f.nombre,
        f.proyectos,
        f.conPropio,
        pct(f.conPropio, f.proyectos)?.toFixed(1) ?? "",
        f.estados.al_dia,
        f.estados.tibio,
        f.estados.frio,
        f.estados.solo_ghl,
        f.estados.sin_registro,
        pct(enRiesgoDe(f), f.proyectos)?.toFixed(1) ?? "",
        f.notasPropias,
        f.notasGhl,
        f.ultimaPropia ? fechaCortaLocal(f.ultimaPropia) : "",
      ]),
    ]);

  const exportPendientes = () =>
    descargaCsv("cartera-sin-seguimiento.csv", [
      ["Cliente", "NSS", "Aliado", "Account Manager", "Etapa", "Días sin nota propia", "Notas de GoHighLevel", "Última de GoHighLevel"],
      ...pendientes.map((f) => [
        f.p.full_name,
        f.p.nss,
        f.p.aliado_name || "",
        nombreAm(f.amId),
        STEP_DEFS[getActiveStageIndex(f.p.status)]?.label || "",
        f.diasPropio ?? diasDesde(f.p.created_at) ?? "",
        f.seg?.notasGhl ?? 0,
        f.seg?.ultimaGhlAt ? fechaCortaLocal(f.seg.ultimaGhlAt) : "",
      ]),
    ]);

  // ── Selección de AM ────────────────────────────────────────────────────────
  const amDisponibles = useMemo(() => {
    const enDatos = new Set(porAm.map((f) => f.id));
    const lista = profiles
      .filter((p) => p.role === "account_manager")
      .map((p) => ({ id: p.id, nombre: p.full_name }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    return enDatos.has(SIN_AM) || filters.entidades.includes(SIN_AM)
      ? [...lista, { id: SIN_AM, nombre: "Mesa de dirección" }]
      : lista;
  }, [profiles, porAm, filters.entidades]);

  const toggleAM = (id: string) =>
    setFilters({
      entidades: filters.entidades.includes(id) ? filters.entidades.filter((x) => x !== id) : [...filters.entidades, id],
    });

  const donaSegmentos = ESTADOS.map((e) => ({
    label: LABEL_ESTADO[e],
    value: conteo[e],
    color: COLOR_ESTADO[e],
  })).filter((s) => s.value > 0);

  const tarjeta = "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-5 space-y-5";
  const th = "px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500";

  if (cargando) {
    return (
      <div className={tarjeta}>
        <Vacio>Cargando el seguimiento…</Vacio>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {demo && (
        <p className="rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300 print:hidden">
          Estás en modo demo: las notas de este informe son inventadas y sirven para ver cómo queda.
          Con sesión real, aquí solo sale la bitácora de verdad. Ojo con una cosa: el cajón de notas de
          «Cartera sin tocar» lee la bitácora de demo (la que hayas tecleado tú), no las cifras
          inventadas de las tablas, así que ahí verás «Sin notas» aunque el informe cuente seis.
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {/* ── Selección de AM y alcance ─────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 flex flex-wrap items-center gap-x-5 gap-y-3 print:hidden">
        {amDisponibles.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
              <Users className="h-3.5 w-3.5" /> Account Manager
            </span>
            <div className={`${segmented} flex-wrap`}>
              <button onClick={() => setFilters({ entidades: [] })} className={pill(filters.entidades.length === 0)}>
                Todos
              </button>
              {amDisponibles.map((am) => (
                <button key={am.id} onClick={() => toggleAM(am.id)} className={pill(filters.entidades.includes(am.id))}>
                  {/* Al resto se le deja el nombre de pila; «Mesa de dirección» no es
                      una persona y recortada se quedaba en «Mesa». */}
                  {am.id === SIN_AM ? am.nombre : am.nombre.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500"
            title="La cartera activa deja fuera lo rechazado, lo cerrado perdido y lo ya otorgado y pagado: son expedientes que no necesitan seguimiento y contarlos como abandonados inflaría el problema."
          >
            Cartera
          </span>
          <div className={segmented}>
            <button onClick={() => setSoloActivos(true)} className={pill(soloActivos)}>
              Activa
            </button>
            <button onClick={() => setSoloActivos(false)} className={pill(!soloActivos)}>
              Todo
            </button>
          </div>
        </div>
      </div>

      {/* ── 1 · Estado de la cartera ──────────────────────────────────────── */}
      <div className={tarjeta}>
        <PanelHeader
          icon={MessageSquareText}
          tone="emerald"
          title="Estado del seguimiento"
          subtitle={
            <>
              Cómo está HOY cada proyecto de la cartera, según la última nota escrita EN LA PLATAFORMA
              · {total} proyecto{total === 1 ? "" : "s"}. Las notas traídas de GoHighLevel no cuentan
              como seguimiento propio: se miden aparte, más abajo.
            </>
          }
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Proyectos" value={total} sub={soloActivos ? "cartera activa" : "todo, incl. cerrados"} icon={Users} tone="slate" />
          <StatCard
            label="Con seguimiento propio"
            value={totales.conPropio}
            sub={fmtPct(pct(totales.conPropio, total), 0)}
            tone="emerald"
          />
          <StatCard
            label="Solo en GoHighLevel"
            value={conteo.solo_ghl}
            sub={fmtPct(pct(conteo.solo_ghl, total), 0)}
            tone="blue"
          />
          <StatCard
            label="Sin ningún registro"
            value={conteo.sin_registro}
            sub={fmtPct(pct(conteo.sin_registro, total), 0)}
            tone="rose"
          />
          <StatCard label="Notas en plataforma" value={totales.notasPropias} sub="escritas aquí" tone="teal" />
          <StatCard label="Notas de GoHighLevel" value={totales.notasGhl} sub="traídas de allá" tone="indigo" />
        </div>

        {total === 0 ? (
          <Vacio>No hay proyectos en el período y los filtros elegidos.</Vacio>
        ) : (
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <Donut
              segments={donaSegmentos}
              centerTop={fmtPct(pct(conteo.al_dia + conteo.tibio, total), 0)}
              centerBottom="ESTA SEMANA"
            />
            <DonutLegend segments={donaSegmentos} total={total} />
          </div>
        )}

        <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-3">
          Los cinco cubos son excluyentes y suman el total. «Al día», «Tibio» y «Frío» se miden por los
          días transcurridos desde la última nota escrita aquí —los mismos cortes de 3 y 7 días que usa
          la columna «Último seguimiento» del listado de clientes—. «Solo en GoHighLevel» es un
          expediente que jamás se ha tocado en la plataforma pero del que sí llegaron notas de allá.
          {" "}El PERÍODO de la barra de arriba recorta por fecha de CAPTURA del proyecto, no por la
          fecha de las notas: para mirar cobertura lo normal es dejarlo en «Histórico», que es la
          cartera entera. La fecha de las notas es la que manda en el panel de ritmo.
        </p>
      </div>

      {/* ── 2 · Por account manager ───────────────────────────────────────── */}
      <div className={tarjeta}>
        <PanelHeader
          icon={BarChart3}
          tone="sky"
          title="Seguimiento por Account Manager"
          subtitle={
            <>
              Las barras son la cartera de cada uno; las líneas punteadas, el porcentaje con
              seguimiento propio y el porcentaje en riesgo (frío o sin ningún registro)
              {amOrdenados.length > TOPE_RANKING ? ` · se dibujan los ${TOPE_RANKING} primeros de ${amOrdenados.length}` : ""}.
            </>
          }
        >
          <div className={segmented}>
            {(Object.keys(ORDEN_LABEL) as OrdenRanking[]).map((o) => (
              <button key={o} onClick={() => setOrden(o)} className={pill(orden === o)}>
                {ORDEN_LABEL[o]}
              </button>
            ))}
          </div>
          {amOrdenados.length > 0 && (
            <button
              onClick={exportAm}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all active:scale-95"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2.4} /> CSV
            </button>
          )}
        </PanelHeader>

        {amOrdenados.length === 0 ? (
          <Vacio>No hay account managers con cartera en el período.</Vacio>
        ) : (
          <>
            <RankingChart
              filas={rankingFilas}
              metricaLabel="Proyectos"
              onSelect={toggleAM}
              seleccion={filters.entidades}
            />
            <Leyenda
              series={[
                { id: "cob", label: "% con seguimiento propio", color: C_PROPIO },
                { id: "riesgo", label: "% en riesgo", color: COLOR_ESTADO.frio },
              ]}
            />

            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-xs min-w-[1000px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                    <th className={th}>Account Manager</th>
                    <th className={`${th} text-right`}>Proyectos</th>
                    <th className={`${th} text-right`}>Con seguim. propio</th>
                    <th className={`${th} text-right`}>Al día</th>
                    <th className={`${th} text-right`}>Tibio</th>
                    <th className={`${th} text-right`}>Frío</th>
                    <th className={`${th} text-right`}>Solo GHL</th>
                    <th className={`${th} text-right`}>Sin registro</th>
                    <th className={`${th} text-right`}>En riesgo</th>
                    <th className={`${th} text-right`}>Notas propias</th>
                    <th className={`${th} text-right`}>Notas GHL</th>
                    <th className={`${th} text-right`}>Última propia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {amOrdenados.map((f) => {
                    const cobertura = pct(f.conPropio, f.proyectos);
                    const riesgo = pct(enRiesgoDe(f), f.proyectos);
                    return (
                      <tr key={f.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="px-3 py-2.5 font-bold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                          {f.nombre}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                          {f.proyectos}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          <span className="font-bold text-slate-800 dark:text-slate-100">{f.conPropio}</span>{" "}
                          <span
                            className={`text-[10px] font-bold ${
                              (cobertura ?? 0) >= 70
                                ? "text-emerald-600 dark:text-emerald-400"
                                : (cobertura ?? 0) >= 40
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {fmtPct(cobertura, 0)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                          {f.estados.al_dia || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-amber-600 dark:text-amber-400 font-semibold">
                          {f.estados.tibio || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-rose-600 dark:text-rose-400 font-semibold">
                          {f.estados.frio || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-blue-600 dark:text-blue-400 font-semibold">
                          {f.estados.solo_ghl || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400 font-semibold">
                          {f.estados.sin_registro || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              (riesgo ?? 0) >= 50
                                ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                                : (riesgo ?? 0) >= 25
                                ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                                : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                            }`}
                            title="Proyectos fríos o sin ningún registro, sobre el total de su cartera."
                          >
                            {fmtPct(riesgo, 0)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                          {f.notasPropias}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                          {f.notasGhl}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {f.ultimaPropia ? fechaCortaLocal(f.ultimaPropia) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── 3 · Ritmo ─────────────────────────────────────────────────────── */}
      <div className={tarjeta}>
        <PanelHeader
          icon={LineChartIcon}
          tone="violet"
          title="Ritmo de seguimiento"
          subtitle={
            <>
              Notas escritas en cada período, separadas por quién las escribe. Aquí la atribución es
              por AUTORÍA, no por cartera: una nota es trabajo de quien la teclea, aunque caiga en el
              expediente de otro. Con account managers elegidos arriba, la curva es la de sus notas;
              las de GoHighLevel no tienen autor y se enseñan siempre. Este panel cuenta TODAS las
              notas del período —también las de expedientes cerrados, rechazados o ya otorgados— y no
              lo recortan «Cartera activa», Producto ni Segmento, así que su total no tiene por qué
              cuadrar con el de la cabecera.
            </>
          }
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
              Líneas
            </button>
            <button onClick={() => setFilters({ tipoGrafico: "barras" })} className={pill(filters.tipoGrafico === "barras")}>
              Barras
            </button>
          </div>
        </PanelHeader>

        <SerieChart cubos={cubos} series={seriesVisibles} tipo={filters.tipoGrafico} unidad="nota(s)" />
        <Leyenda series={leyendaRitmo} onToggle={toggleSerie} ocultas={ocultas} />
      </div>

      {/* ── 4 · GoHighLevel ───────────────────────────────────────────────── */}
      <div className={tarjeta}>
        <PanelHeader
          icon={PlugZap}
          tone="indigo"
          title="Nivel de seguimiento de GoHighLevel"
          subtitle={
            <>
              Cuánto seguimiento está sosteniendo GoHighLevel por su cuenta. La cifra que importa es la
              tercera: los expedientes donde lo de GHL es lo ÚNICO que hay, porque ahí nadie de la casa
              ha escrito una línea.
            </>
          }
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Con notas de GHL"
            value={totales.conGhl}
            sub={`${fmtPct(pct(totales.conGhl, total), 0)} de la cartera`}
            tone="blue"
          />
          <StatCard label="Notas traídas" value={totales.notasGhl} sub="de GoHighLevel" tone="indigo" />
          <StatCard
            label="GHL es lo único"
            value={conteo.solo_ghl}
            sub={`${fmtPct(pct(conteo.solo_ghl, total), 0)} de la cartera`}
            tone="rose"
          />
          <StatCard
            label="En los dos sitios"
            value={totales.enAmbos}
            sub={fmtPct(pct(totales.enAmbos, total), 0)}
            tone="emerald"
          />
          <StatCard
            label="Cotejados sin nota"
            value={cotejadosSinNota}
            sub="están en GHL, no hay nada"
            tone="amber"
          />
          <StatCard
            label="Última nota traída"
            value={totales.ultimaGhl ? fechaCortaLocal(totales.ultimaGhl) : "—"}
            sub="barrido nocturno"
            tone="slate"
            size="sm"
          />
        </div>

        {comparativaGhl.entidades.length > 0 && (
          <>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
              Cobertura propia contra cobertura de GoHighLevel
            </h4>
            <GrupoBarrasChart entidades={comparativaGhl.entidades} series={comparativaGhl.series} onSelect={toggleAM} />
            <Leyenda series={comparativaGhl.series.map((s) => ({ id: s.id, label: s.label, color: s.color }))} />
          </>
        )}

        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-xs min-w-[620px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                <th className={th}>Cotejo con GoHighLevel</th>
                <th className={`${th} text-right`}>Proyectos</th>
                <th className={`${th} text-right`}>Con notas de GHL</th>
                <th className={`${th} text-right`}>Cobertura</th>
                <th className={`${th} text-right`}>Notas</th>
                <th className={`${th} text-right`}>Notas por proyecto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {porSello.map((f) => (
                <tr key={f.clave} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors">
                  <td className="px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-300">
                    {f.label}
                    {!f.copia && (
                      <span
                        className="ml-1.5 text-[10px] font-medium text-slate-400 dark:text-slate-500"
                        title="De estos expedientes no se traen notas: o no están en GoHighLevel, o el cotejo es demasiado flojo para asegurar que es la misma persona."
                      >
                        · sin importación
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                    {f.proyectos}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-slate-800 dark:text-slate-100">
                    {f.conNotas}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-blue-600 dark:text-blue-400">
                    {fmtPct(pct(f.conNotas, f.proyectos), 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-400">{f.notas}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-500">
                    {f.conNotas > 0 ? (f.notas / f.conNotas).toFixed(1).replace(".", ",") : "—"}
                  </td>
                </tr>
              ))}
              {porSello.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-[11px] text-slate-400 dark:text-slate-500">
                    Todavía no se ha cotejado ningún proyecto contra GoHighLevel.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-3">
          El cotejo lo sella el barrido nocturno (03:17 de México) y se guarda por proyecto. Un
          expediente que no está en GoHighLevel no puede tener notas de allá, así que se cuenta en su
          propio renglón en vez de ensuciar la cobertura. «Cotejados sin nota» son los que sí están
          allá con un cotejo lo bastante firme como para traer notas y aun así no llegó ninguna: o el
          contacto está en blanco en GoHighLevel, o hay que revisarlo.
        </p>
      </div>

      {/* ── 5 · Cartera sin tocar ─────────────────────────────────────────── */}
      <div className={tarjeta}>
        <PanelHeader
          icon={Flame}
          tone="amber"
          title="Cartera sin tocar"
          subtitle={
            <>
              Lo que hay que trabajar hoy: proyectos fríos, con solo rastro de GoHighLevel o sin ningún
              registro, del que lleva más tiempo esperando al que menos · {pendientes.length} de{" "}
              {total}
              {pendientes.length > TOPE_LISTA ? ` · se listan los ${TOPE_LISTA} primeros` : ""}.
            </>
          }
        >
          {pendientes.length > 0 && (
            <button
              onClick={exportPendientes}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all active:scale-95"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2.4} /> CSV completo
            </button>
          )}
        </PanelHeader>

        {pendientes.length === 0 ? (
          <Vacio>
            No hay ni un proyecto sin seguimiento reciente en el período elegido. Eso es exactamente lo
            que este panel quiere enseñar vacío.
          </Vacio>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-xs min-w-[860px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                  <th className={th}>Cliente</th>
                  <th className={th}>Aliado</th>
                  <th className={th}>Account Manager</th>
                  <th className={th}>Etapa</th>
                  <th className={`${th} text-center`}>Sin nota propia</th>
                  <th className={`${th} text-center`}>GoHighLevel</th>
                  <th className={`${th} text-right`}>Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {pendientes.slice(0, TOPE_LISTA).map((f) => {
                  const espera = f.diasPropio ?? diasDesde(f.p.created_at);
                  const nunca = f.diasPropio === null;
                  return (
                    <tr key={f.p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/prospectos/${f.p.id}`}
                          className="font-bold text-slate-800 dark:text-slate-200 hover:underline truncate block max-w-[220px]"
                        >
                          {f.p.full_name}
                        </Link>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">{f.p.nss}</span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-400 truncate max-w-[150px]">
                        {f.p.aliado_name || "Asesor Comercial"}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-400 truncate max-w-[150px]">
                        {nombreAm(f.amId)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                        {STEP_DEFS[getActiveStageIndex(f.p.status)]?.label || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => abrirNotas(f.p)}
                          title={
                            (nunca
                              ? "Nunca se le ha escrito una nota en la plataforma. Los días son los que lleva capturado."
                              : `Última nota propia: ${fechaCortaLocal(f.seg?.ultimaPlataformaAt)}${
                                  f.seg?.ultimoAutorPlataforma ? ` · ${f.seg.ultimoAutorPlataforma}` : ""
                                }`) + " · Clic para leer la bitácora y anotar el seguimiento."
                          }
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tabular-nums ring-1 ring-inset ring-transparent hover:ring-current transition-all active:scale-95 ${
                            nunca
                              ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                              : "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400"
                          }`}
                        >
                          {nunca ? `Nunca · ${espera ?? "—"} d` : etiquetaDias(espera)}
                          <StickyNote className="h-3 w-3 opacity-60" strokeWidth={2.4} />
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        {f.seg && f.seg.notasGhl > 0 ? (
                          <button
                            type="button"
                            onClick={() => abrirNotas(f.p)}
                            title={`${f.seg.notasGhl} nota(s) traída(s) de GoHighLevel · última el ${fechaCortaLocal(
                              f.seg.ultimaGhlAt
                            )} · Clic para leerlas aquí mismo.`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 ring-1 ring-inset ring-transparent hover:ring-current transition-all active:scale-95"
                          >
                            {f.seg.notasGhl} · {f.diasGhl !== null ? etiquetaDias(f.diasGhl) : "—"}
                            <StickyNote className="h-3 w-3 opacity-60" strokeWidth={2.4} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => abrirNotas(f.p)}
                            title="No llegó ninguna nota de GoHighLevel. Clic para ver la bitácora y el cotejo del contacto."
                            className="text-[10px] text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition-colors px-2 py-0.5"
                          >
                            —
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link
                          href={`/prospectos/${f.p.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20 transition-all active:scale-95"
                        >
                          Abrir <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* El cajón de notas: leer la bitácora entera —lo propio y lo de
          GoHighLevel, cada uno con su sello— y anotar el seguimiento sin salir
          del informe. Al cerrarlo, si se escribió algo, el reporte se recarga
          para que ese proyecto deje de figurar como «sin tocar». */}
      <NotasDrawer
        prospectId={notasTarget?.id ?? null}
        prospectName={notasTarget?.full_name}
        cotejoGhl={notasTarget ? cotejos[notasTarget.id] : undefined}
        email={notasTarget?.email}
        phone={notasTarget?.phone}
        open={!!notasTarget}
        onClose={cerrarNotas}
      />
    </div>
  );
}
