"use client";

// Capa de datos del módulo Closers.
//
// Mismo patrón que useClassroom: no pasa por AppContext (ya carga ~5k líneas y
// todo el estado del pipeline), habla directo con Supabase y cae a un cálculo
// local en modo demo para que la previsualización siga funcionando sin tocar
// producción.
//
// En producción TODA la agregación ocurre en Postgres, vía las RPC de
// 20260801000000_closers.sql. El navegador nunca descarga los proyectos para
// contarlos y una sola llamada resuelve la tabla completa, en vez de una
// consulta por closer. Es también la única fuente que el rol closer puede usar:
// no tiene permiso de lectura sobre `prospects`.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/utils/context/AppContext";
import { createClient } from "@/utils/supabase/client";
import type {
  CloserAliadoRow,
  CloserAsignacion,
  CloserOverviewRow,
  CloserSeriePoint,
  EstadoAliadoFiltro,
  Grano,
  TipoAliadoFiltro,
} from "./closerTypes";
import { buildAliadoRows, buildOverview, buildSerie } from "./closerMetrics";

const CLOSER_ASIGNACIONES_KEY = "pensionflow_closer_asignaciones";

const n = (v: unknown): number => {
  const x = Number(v);
  return isFinite(x) ? x : 0;
};

/** PostgREST puede serializar `bigint` como texto; se normaliza aquí. */
function normalizeOverview(row: any): CloserOverviewRow {
  return {
    closer_id: row.closer_id,
    closer_nombre: row.closer_nombre || "Sin nombre",
    closer_email: row.closer_email ?? null,
    closer_telefono: row.closer_telefono ?? null,
    closer_avatar_url: row.closer_avatar_url ?? null,
    closer_created_at: row.closer_created_at ?? null,
    aliados_total: n(row.aliados_total),
    aliados_periodo: n(row.aliados_periodo),
    aliados_productivos: n(row.aliados_productivos),
    aliados_sin_actividad: n(row.aliados_sin_actividad),
    aliados_activos_90d: n(row.aliados_activos_90d),
    ultimo_aliado_at: row.ultimo_aliado_at ?? null,
    clientes_total: n(row.clientes_total),
    ventas_total: n(row.ventas_total),
    clientes_periodo: n(row.clientes_periodo),
    clientes_evaluados: n(row.clientes_evaluados),
    clientes_aprobados: n(row.clientes_aprobados),
    clientes_condicionados: n(row.clientes_condicionados),
    clientes_rechazados: n(row.clientes_rechazados),
    clientes_perdidos: n(row.clientes_perdidos),
    ventas_periodo: n(row.ventas_periodo),
    ultimo_cliente_at: row.ultimo_cliente_at ?? null,
  };
}

function normalizeAliado(row: any): CloserAliadoRow {
  return {
    aliado_id: row.aliado_id,
    aliado_nombre: row.aliado_nombre || "Sin nombre",
    aliado_email: row.aliado_email ?? null,
    aliado_tipo: row.aliado_tipo === "lider" ? "lider" : "aliado",
    empresa_id: row.empresa_id ?? null,
    empresa_nombre: row.empresa_nombre ?? null,
    fecha_incorporacion: row.fecha_incorporacion ?? null,
    es_closer_actual: row.es_closer_actual === true,
    creado_por: row.creado_por ?? null,
    creado_por_mi: row.creado_por_mi === true,
    clientes_total: n(row.clientes_total),
    clientes_periodo: n(row.clientes_periodo),
    clientes_en_proceso: n(row.clientes_en_proceso),
    clientes_aprobados: n(row.clientes_aprobados),
    ventas: n(row.ventas),
    clientes_90d: n(row.clientes_90d),
    ultimo_cliente_at: row.ultimo_cliente_at ?? null,
  };
}

export interface UseClosersArgs {
  desde: string;
  hasta: string;
  grano: Grano;
  tipoAliado: TipoAliadoFiltro;
  estadoAliado: EstadoAliadoFiltro;
}

export function useClosers({ desde, hasta, grano, tipoAliado, estadoAliado }: UseClosersArgs) {
  const { user, profiles, prospects, isDemoMode, isProvisionalSession, empresasMultialiado } = useApp();

  const supabase = useMemo(() => {
    if (isDemoMode || isProvisionalSession) return null;
    return createClient();
  }, [isDemoMode, isProvisionalSession]);

  const isLocal = isDemoMode || isProvisionalSession || !supabase;

  // Un closer solo puede verse a sí mismo. En producción lo impone la propia RPC;
  // aquí se replica para que el cálculo local del modo demo diga lo mismo.
  const scopeCloserId = user?.role === "closer" ? user.id : null;

  const [overview, setOverview] = useState<CloserOverviewRow[]>([]);
  const [serie, setSerie] = useState<CloserSeriePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (isLocal) {
      const v = { desde, hasta, tipoAliado, estadoAliado };
      setOverview(buildOverview(profiles, prospects, v, scopeCloserId));
      setSerie(buildSerie(profiles, v, grano, scopeCloserId, prospects));
      setLoading(false);
      return;
    }

    try {
      const args = {
        p_desde: desde || null,
        p_hasta: hasta || null,
        p_tipo_aliado: tipoAliado === "todos" ? null : tipoAliado,
        p_estado_aliado: estadoAliado === "todos" ? null : estadoAliado,
      };
      const [ov, sr] = await Promise.all([
        supabase!.rpc("closers_overview", args),
        supabase!.rpc("closers_serie", { ...args, p_grano: grano }),
      ]);

      if (ov.error) throw ov.error;
      if (sr.error) throw sr.error;

      setOverview((ov.data || []).map(normalizeOverview));
      setSerie(
        (sr.data || []).map((r: any) => ({
          closer_id: r.closer_id,
          periodo: String(r.periodo).substring(0, 10),
          aliados: n(r.aliados),
        }))
      );
    } catch (e: any) {
      console.error("Error cargando métricas de closers:", e);
      // Nunca se muestra el error crudo de Supabase al usuario final (§34).
      setError("No se pudieron cargar las métricas de closers. Vuelve a intentarlo en unos segundos.");
      setOverview([]);
      setSerie([]);
    } finally {
      setLoading(false);
    }
    // `profiles`/`prospects` solo importan en la ruta local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocal, supabase, desde, hasta, grano, tipoAliado, estadoAliado, scopeCloserId, profiles, prospects]);

  useEffect(() => {
    load();
  }, [load]);

  /** Aliados de un closer, con la productividad de cada uno (§14). */
  const fetchAliados = useCallback(
    async (closerId: string): Promise<CloserAliadoRow[]> => {
      if (isLocal) {
        // El filtro de tipo/estado NO se aplica aquí a propósito: la tabla de
        // aliados de la ficha los filtra en pantalla, para que el usuario vea
        // cuántos quedaron fuera en vez de que desaparezcan sin explicación.
        return buildAliadoRows(
          profiles,
          prospects,
          closerId,
          { desde, hasta },
          empresasMultialiado.map((e) => ({ id: e.id, nombre: e.nombre }))
        );
      }
      const { data, error: err } = await supabase!.rpc("closer_aliados", {
        p_closer_id: closerId,
        p_desde: desde || null,
        p_hasta: hasta || null,
      });
      if (err) {
        console.error("Error cargando aliados del closer:", err);
        throw new Error("No se pudieron cargar los aliados de este closer.");
      }
      return (data || []).map(normalizeAliado);
    },
    [isLocal, supabase, profiles, prospects, desde, hasta, empresasMultialiado]
  );

  /**
   * Mismo resumen, pero para una ventana distinta de la que está en pantalla.
   * Lo usa la comparativa "período anterior" de la ficha (§13).
   */
  const fetchOverviewEn = useCallback(
    async (d: string, h: string): Promise<CloserOverviewRow[]> => {
      if (isLocal) {
        return buildOverview(profiles, prospects, { desde: d, hasta: h, tipoAliado, estadoAliado }, scopeCloserId);
      }
      const { data, error: err } = await supabase!.rpc("closers_overview", {
        p_desde: d || null,
        p_hasta: h || null,
        p_tipo_aliado: tipoAliado === "todos" ? null : tipoAliado,
        p_estado_aliado: estadoAliado === "todos" ? null : estadoAliado,
      });
      if (err) {
        console.error("Error cargando el período anterior:", err);
        return [];
      }
      return (data || []).map(normalizeOverview);
    },
    [isLocal, supabase, profiles, prospects, tipoAliado, estadoAliado, scopeCloserId]
  );

  /** Historial de atribuciones. Append-only: solo se lee, nunca se corrige. */
  const fetchHistorial = useCallback(
    async (aliadoId?: string): Promise<CloserAsignacion[]> => {
      if (isLocal) {
        if (typeof window === "undefined") return [];
        try {
          const raw = localStorage.getItem(CLOSER_ASIGNACIONES_KEY);
          const list: CloserAsignacion[] = raw ? JSON.parse(raw) : [];
          return list
            .filter((r) => !aliadoId || r.aliado_id === aliadoId)
            .sort((a, b) => (b.fecha_asignacion || "").localeCompare(a.fecha_asignacion || ""));
        } catch {
          return [];
        }
      }
      let q = supabase!
        .from("closer_aliado_asignaciones")
        .select("*")
        .order("fecha_asignacion", { ascending: false })
        .limit(500);
      if (aliadoId) q = q.eq("aliado_id", aliadoId);
      const { data, error: err } = await q;
      if (err) {
        console.error("Error cargando el historial de asignaciones:", err);
        return [];
      }
      return (data || []) as CloserAsignacion[];
    },
    [isLocal, supabase]
  );

  return { overview, serie, loading, error, reload: load, fetchAliados, fetchHistorial, fetchOverviewEn, isLocal };
}
