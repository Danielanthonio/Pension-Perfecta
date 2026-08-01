"use client";

// Estado de los filtros del módulo de Finanzas, sincronizado con la URL.
//
// Va en la URL a propósito, igual que en Closers: el botón "atrás" funciona, el
// enlace al detalle de una persona arrastra el período elegido, y la Dirección
// puede pegarle a Finanzas el link exacto de lo que está mirando.

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type EstadoComision,
  type Grano,
  type RangoPreset,
  type RolBeneficiario,
  type TipoEvento,
  resolveRango,
} from "./finanzasTypes";

const GRANOS: Grano[] = ["dia", "semana", "mes", "trimestre", "anio"];
const PRESETS: RangoPreset[] = [
  "semana_actual",
  "semana_anterior",
  "mes_actual",
  "mes_anterior",
  "trimestre_actual",
  "anio_actual",
  "todo",
  "personalizado",
];
const ROLES: RolBeneficiario[] = ["director", "account_manager", "closer", "aliado"];
const ESTADOS: EstadoComision[] = [
  "pendiente_revision",
  "aprobado",
  "enviado_finanzas",
  "pagado",
  "observado",
  "revertido",
];

export type PestanaFinanzas = "resumen" | "liquidaciones" | "cortes" | "produccion" | "tarifas" | "bitacora";

const PESTANAS: PestanaFinanzas[] = ["resumen", "liquidaciones", "cortes", "produccion", "tarifas", "bitacora"];

export interface FinanzasFilters {
  pestana: PestanaFinanzas;
  preset: RangoPreset;
  desde: string;
  hasta: string;
  grano: Grano;
  tipoGrafico: "barras" | "lineas";
  /** Rol del beneficiario. `null` = todos. */
  rol: RolBeneficiario | null;
  estado: EstadoComision | null;
  tipoEvento: TipoEvento | null;
  /** Persona abierta en el detalle (§10). */
  persona: string | null;
  /** Corte abierto en el panel de cortes. */
  corte: string | null;
  /** Dimensión de la vista de producción (§8.4). */
  dimension: "producto" | "account_manager" | "closer" | "aliado";
}

/** El mes en curso es el encuadre natural: es el ciclo de la nómina y los bonos. */
const PRESET_POR_DEFECTO: RangoPreset = "mes_actual";
const GRANO_POR_DEFECTO: Grano = "semana";

export function useFinanzasFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo<FinanzasFilters>(() => {
    const rawPreset = searchParams.get("rango") as RangoPreset | null;
    const preset: RangoPreset = rawPreset && PRESETS.includes(rawPreset) ? rawPreset : PRESET_POR_DEFECTO;

    let desde = searchParams.get("desde") || "";
    let hasta = searchParams.get("hasta") || "";
    if (preset !== "personalizado") {
      const r = resolveRango(preset, new Date());
      desde = r.desde;
      hasta = r.hasta;
    }

    const rawGrano = searchParams.get("grano") as Grano | null;
    const rawPestana = searchParams.get("tab") as PestanaFinanzas | null;
    const rawRol = searchParams.get("rol") as RolBeneficiario | null;
    const rawEstado = searchParams.get("estado") as EstadoComision | null;
    const rawDim = searchParams.get("dim");

    return {
      pestana: rawPestana && PESTANAS.includes(rawPestana) ? rawPestana : "resumen",
      preset,
      desde,
      hasta,
      grano: rawGrano && GRANOS.includes(rawGrano) ? rawGrano : GRANO_POR_DEFECTO,
      tipoGrafico: searchParams.get("chart") === "lineas" ? "lineas" : "barras",
      rol: rawRol && ROLES.includes(rawRol) ? rawRol : null,
      estado: rawEstado && ESTADOS.includes(rawEstado) ? rawEstado : null,
      tipoEvento: (searchParams.get("tipo") as TipoEvento | null) || null,
      persona: searchParams.get("persona") || null,
      corte: searchParams.get("corte") || null,
      dimension:
        rawDim === "account_manager" || rawDim === "closer" || rawDim === "aliado"
          ? rawDim
          : "producto",
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<FinanzasFilters>) => {
      const p = new URLSearchParams(searchParams.toString());
      const put = (key: string, value: string | null, vacio: string) => {
        if (!value || value === vacio) p.delete(key);
        else p.set(key, value);
      };

      if (patch.pestana !== undefined) put("tab", patch.pestana, "resumen");
      if (patch.preset !== undefined) {
        put("rango", patch.preset, PRESET_POR_DEFECTO);
        if (patch.preset !== "personalizado") {
          p.delete("desde");
          p.delete("hasta");
        }
      }
      if (patch.desde !== undefined) put("desde", patch.desde, "");
      if (patch.hasta !== undefined) put("hasta", patch.hasta, "");
      if (patch.grano !== undefined) put("grano", patch.grano, GRANO_POR_DEFECTO);
      if (patch.tipoGrafico !== undefined) put("chart", patch.tipoGrafico, "barras");
      if (patch.rol !== undefined) put("rol", patch.rol, "");
      if (patch.estado !== undefined) put("estado", patch.estado, "");
      if (patch.tipoEvento !== undefined) put("tipo", patch.tipoEvento, "");
      if (patch.persona !== undefined) put("persona", patch.persona, "");
      if (patch.corte !== undefined) put("corte", patch.corte, "");
      if (patch.dimension !== undefined) put("dim", patch.dimension, "producto");

      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  return { filters, setFilters };
}
