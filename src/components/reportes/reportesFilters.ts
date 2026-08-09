"use client";

// Estado de los filtros del módulo Reportes, sincronizado con la URL.
//
// Va en la URL por lo mismo que en Closers: el botón "atrás" funciona, Dirección
// puede pegar el link de una vista concreta y el período sobrevive al cambio de
// pestaña.
//
// ⚠️ Los nombres de parámetro están elegidos para CONVIVIR con `useCloserFilters`:
// la pestaña CLOSER embebe el módulo Closers, que lee de la misma URL. Se comparten
// a propósito `rango`, `desde`, `hasta` y `grano` —misma semántica, así que el
// período se arrastra de una pestaña a otra— y se evitan `tipo`, `estado`, `chart`,
// `closers` y `consolidado`, que allí significan otra cosa.

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type FinFiltro,
  type Grano,
  type MetricaId,
  type RangoPreset,
  type RolReporte,
  type SegmentoAliado,
  type TipoGrafico,
  resolveRango,
} from "./reportesTypes";

const ROLES: RolReporte[] = ["general", "aliados", "account_managers", "closers"];
const GRANOS: Grano[] = ["dia", "semana", "mes", "anio"];
const PRESETS: RangoPreset[] = [
  "hoy",
  "7d",
  "30d",
  "mes_actual",
  "mes_a_la_fecha",
  "mes_anterior",
  "anio_actual",
  "anio_anterior",
  "todo",
  "personalizado",
];
const FINS: FinFiltro[] = ["todos", "modalidad_10", "modalidad_40", "credito_nomina"];
const SEGMENTOS: SegmentoAliado[] = ["todos", "independiente", "empresa"];
const METRICAS: MetricaId[] = [
  "proyectos",
  "evaluados",
  "aprobados",
  "condicionados",
  "otorgados",
  "perdidos",
  "agenda_futura",
  "rechazados",
];

export interface ReportesFilters {
  rol: RolReporte;
  preset: RangoPreset;
  desde: string;
  hasta: string;
  grano: Grano;
  tipoGrafico: TipoGrafico;
  fin: FinFiltro;
  segmento: SegmentoAliado;
  /** Métrica que ordena los rankings y decide la altura de las barras. */
  metrica: MetricaId;
  /**
   * Métrica del panel «AM · Agenda», INDEPENDIENTE de la del ranking.
   *
   * Iban juntas y era un error: cada métrica guarda su propia meta, así que
   * mover el ranking cambiaba en silencio el juego de objetivos que se estaba
   * mirando, y dos personas con la misma pantalla veían cifras distintas sin
   * pista de por qué (2026-08-09).
   */
  metricaObjetivo: MetricaId;
  /** Curva de total corrido en vez de cantidad del período. */
  acumulado: boolean;
  /** Entidades seleccionadas en el reporte activo (aliados o AM). Vacío = todas. */
  entidades: string[];
}

export function useReportesFilters(rolPorDefecto: RolReporte = "general") {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo<ReportesFilters>(() => {
    const leer = <T extends string>(key: string, validos: T[], fallback: T): T => {
      const raw = searchParams.get(key) as T | null;
      return raw && validos.includes(raw) ? raw : fallback;
    };

    let desde = searchParams.get("desde") || "";
    let hasta = searchParams.get("hasta") || "";

    // El sidebar del área admin escribe `desde`/`hasta` en la URL sin poner
    // `rango` (su botonera de meses vive en el Dashboard y en Gestión de
    // Clientes, y el período viaja pegado al enlace). Si aquí se ignorara, entrar
    // en Reportes con «Agosto» elegido enseñaría el año entero y nadie entendería
    // por qué. Un rango que llega solo se lee como personalizado; en cuanto el
    // usuario toca un preset de esta pantalla, manda el preset.
    const rawPreset = searchParams.get("rango") as RangoPreset | null;
    const preset: RangoPreset =
      rawPreset && PRESETS.includes(rawPreset) ? rawPreset : desde || hasta ? "personalizado" : "todo";

    if (preset !== "personalizado") {
      const r = resolveRango(preset, new Date());
      desde = r.desde;
      hasta = r.hasta;
    }

    const rawEntidades = searchParams.get("ent") || "";

    return {
      rol: leer<RolReporte>("rol", ROLES, rolPorDefecto),
      preset,
      desde,
      hasta,
      grano: leer<Grano>("grano", GRANOS, "mes"),
      tipoGrafico: searchParams.get("g") === "barras" ? "barras" : "lineas",
      fin: leer<FinFiltro>("fin", FINS, "todos"),
      segmento: leer<SegmentoAliado>("seg", SEGMENTOS, "todos"),
      metrica: leer<MetricaId>("met", METRICAS, "proyectos"),
      metricaObjetivo: leer<MetricaId>("mob", METRICAS, "proyectos"),
      // `acum` ausente = false. El boceto de AM pide expresamente la cantidad del
      // período, así que acumular es una elección explícita, no el arranque.
      acumulado: searchParams.get("acum") === "1",
      entidades: rawEntidades ? rawEntidades.split(",").filter(Boolean) : [],
    };
  }, [searchParams, rolPorDefecto]);

  const setFilters = useCallback(
    (patch: Partial<ReportesFilters>) => {
      const p = new URLSearchParams(searchParams.toString());
      const put = (key: string, value: string, vacio: string) => {
        if (!value || value === vacio) p.delete(key);
        else p.set(key, value);
      };

      if (patch.rol !== undefined) {
        put("rol", patch.rol, rolPorDefecto);
        // La selección de entidades no significa lo mismo entre pestañas: unos ids
        // son aliados y otros account managers. Arrastrarla dejaría el reporte
        // vacío sin explicar por qué.
        if (patch.entidades === undefined) p.delete("ent");
      }
      if (patch.preset !== undefined) {
        // "todo" (histórico) es el arranque: sin rango, el panel GENERAL enseña
        // exactamente lo que enseñaba antes de existir esta botonera.
        put("rango", patch.preset, "todo");
        if (patch.preset !== "personalizado") {
          p.delete("desde");
          p.delete("hasta");
        }
      }
      if (patch.desde !== undefined) put("desde", patch.desde, "");
      if (patch.hasta !== undefined) put("hasta", patch.hasta, "");
      if (patch.grano !== undefined) put("grano", patch.grano, "mes");
      if (patch.tipoGrafico !== undefined) put("g", patch.tipoGrafico, "lineas");
      if (patch.fin !== undefined) put("fin", patch.fin, "todos");
      if (patch.segmento !== undefined) put("seg", patch.segmento, "todos");
      if (patch.metrica !== undefined) put("met", patch.metrica, "proyectos");
      if (patch.metricaObjetivo !== undefined) put("mob", patch.metricaObjetivo, "proyectos");
      if (patch.acumulado !== undefined) put("acum", patch.acumulado ? "1" : "", "");
      if (patch.entidades !== undefined) put("ent", patch.entidades.join(","), "");

      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname, rolPorDefecto]
  );

  /** Querystring vigente, para que los enlaces internos conserven la vista. */
  const qs = useMemo(() => {
    const s = searchParams.toString();
    return s ? `?${s}` : "";
  }, [searchParams]);

  return { filters, setFilters, qs };
}
