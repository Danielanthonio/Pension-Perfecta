"use client";

// Estado de los filtros del módulo Closers, sincronizado con la URL.
//
// Va en la URL a propósito: así el enlace a la ficha de un closer arrastra el
// período elegido, el botón "atrás" del navegador funciona y la Dirección puede
// compartir una vista concreta pegando el link.

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type EstadoAliadoFiltro,
  type Grano,
  type RangoPreset,
  type TipoAliadoFiltro,
  type TipoGrafico,
  resolveRango,
} from "./closerTypes";

const GRANOS: Grano[] = ["dia", "semana", "mes", "anio"];
const PRESETS: RangoPreset[] = [
  "hoy",
  "7d",
  "30d",
  "mes_actual",
  "mes_anterior",
  "anio_actual",
  "anio_anterior",
  "todo",
  "personalizado",
];

export interface CloserFilters {
  preset: RangoPreset;
  desde: string;
  hasta: string;
  grano: Grano;
  tipoGrafico: TipoGrafico;
  tipoAliado: TipoAliadoFiltro;
  estadoAliado: EstadoAliadoFiltro;
  /** Closers seleccionados. Vacío = todos. */
  closers: string[];
  consolidado: boolean;
}

export function useCloserFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo<CloserFilters>(() => {
    const rawPreset = searchParams.get("rango") as RangoPreset | null;
    const preset: RangoPreset = rawPreset && PRESETS.includes(rawPreset) ? rawPreset : "anio_actual";

    let desde = searchParams.get("desde") || "";
    let hasta = searchParams.get("hasta") || "";
    if (preset !== "personalizado") {
      const r = resolveRango(preset, new Date());
      desde = r.desde;
      hasta = r.hasta;
    }

    const rawGrano = searchParams.get("grano") as Grano | null;
    const rawClosers = searchParams.get("closers") || "";

    return {
      preset,
      desde,
      hasta,
      grano: rawGrano && GRANOS.includes(rawGrano) ? rawGrano : "mes",
      tipoGrafico: searchParams.get("chart") === "lineas" ? "lineas" : "barras",
      tipoAliado: (searchParams.get("tipo") as TipoAliadoFiltro) || "todos",
      estadoAliado: (searchParams.get("estado") as EstadoAliadoFiltro) || "todos",
      closers: rawClosers ? rawClosers.split(",").filter(Boolean) : [],
      consolidado: searchParams.get("consolidado") === "1",
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<CloserFilters>) => {
      const p = new URLSearchParams(searchParams.toString());
      const put = (key: string, value: string, vacio: string) => {
        if (!value || value === vacio) p.delete(key);
        else p.set(key, value);
      };

      if (patch.preset !== undefined) {
        put("rango", patch.preset, "anio_actual");
        if (patch.preset !== "personalizado") {
          p.delete("desde");
          p.delete("hasta");
        }
      }
      if (patch.desde !== undefined) put("desde", patch.desde, "");
      if (patch.hasta !== undefined) put("hasta", patch.hasta, "");
      if (patch.grano !== undefined) put("grano", patch.grano, "mes");
      if (patch.tipoGrafico !== undefined) put("chart", patch.tipoGrafico, "barras");
      if (patch.tipoAliado !== undefined) put("tipo", patch.tipoAliado, "todos");
      if (patch.estadoAliado !== undefined) put("estado", patch.estadoAliado, "todos");
      if (patch.closers !== undefined) put("closers", patch.closers.join(","), "");
      if (patch.consolidado !== undefined) put("consolidado", patch.consolidado ? "1" : "", "");

      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  /** Querystring vigente, para que los enlaces internos conserven el período. */
  const qs = useMemo(() => {
    const s = searchParams.toString();
    return s ? `?${s}` : "";
  }, [searchParams]);

  return { filters, setFilters, qs };
}
