"use client";

// Carga del reporte de seguimiento (migración 20260827000000).
//
// Mismo patrón que `useActividadAM` y `useObjetivosAM`: no pasa por AppContext
// —lo que trae solo lo usa esta pestaña— y en modo demo sirve un juego de datos
// de EJEMPLO en vez de tocar la base.
//
// Las DOS lecturas van agregadas en Postgres, no aquí:
//   · `seguimiento_por_proyecto()`   — una fila por proyecto CON notas, con el
//     seguimiento de la plataforma y el de GoHighLevel contados por separado.
//   · `seguimiento_notas_por_dia()`  — el ritmo: cuántas notas se escriben cada
//     día y quién las escribe.
// Bajarse la bitácora entera para contarla en el navegador sería descargar el
// libro para sumar una columna, y crece con cada seguimiento.
//
// ⚠️ SE PAGINA A PROPÓSITO. PostgREST corta la respuesta en 1000 filas y no
// avisa: la lista llega recortada y parece completa. Hoy la cartera cabe de
// sobra en una página, pero el día que no quepa el reporte enseñaría de menos
// sin que nada fallara — que es la peor forma de equivocarse en un informe de
// gestión. Por eso se pide de mil en mil hasta que una página venga corta.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/utils/context/AppContext";
import { createClient } from "@/utils/supabase/client";
import { seguimientoDemo, type NotaDemo } from "./seguimientoDemo";

/** Lo que la base sabe de UN proyecto. Los proyectos sin ninguna nota no salen. */
export interface SeguimientoProyecto {
  /** Notas escritas aquí. Es el seguimiento del que responde el account manager. */
  notasPlataforma: number;
  /** Notas traídas de GoHighLevel. Contacto con el cliente, no trabajo hecho aquí. */
  notasGhl: number;
  notasAliado: number;
  notasAm: number;
  notasDireccion: number;
  /** Días distintos con al menos una nota de plataforma: mide constancia. */
  diasConNota: number;
  primeraAt: string | null;
  ultimaPlataformaAt: string | null;
  ultimaGhlAt: string | null;
  ultimoAutorPlataforma: string | null;
}

/** Una fila del ritmo: (día, origen, autor). El día es el día de México. */
export interface NotaDia {
  dia: string;
  origen: "plataforma" | "ghl";
  rol: string;
  autorId: string | null;
  autorNombre: string;
  notas: number;
  proyectos: number;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

const TAM_PAGINA = 1000;
/** Tope de seguridad: 60 páginas son 60 000 filas. Un bucle que se desboque para. */
const MAX_PAGINAS = 60;

async function traerPaginado<T>(
  pedir: (inicio: number, fin: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const inicio = pagina * TAM_PAGINA;
    const { data, error } = await pedir(inicio, inicio + TAM_PAGINA - 1);
    if (error) throw error;
    const lote = data || [];
    out.push(...lote);
    if (lote.length < TAM_PAGINA) break;
  }
  return out;
}

/** La bitácora del modo demo vive en localStorage; AppContext usa esta misma clave. */
const NOTAS_DEMO_KEY = "pensionflow_notas";

function notasTecleadasEnDemo(): NotaDemo[] {
  try {
    const raw = localStorage.getItem(NOTAS_DEMO_KEY);
    if (!raw) return [];
    const mapa = JSON.parse(raw) as Record<string, any[]>;
    return Object.entries(mapa).flatMap(([prospectId, notas]) =>
      (notas || []).map((n) => ({
        prospectId,
        dia: String(n.created_at || "").substring(0, 10),
        origen: n.origen === "ghl" ? ("ghl" as const) : ("plataforma" as const),
        rol: n.autor_rol || "aliado",
        autorId: n.autor_id ?? null,
        autorNombre: n.autor_nombre || "Usuario",
      }))
    );
  } catch {
    return [];
  }
}

export function useSeguimiento(desde: string, hasta: string) {
  const { isDemoMode, isProvisionalSession, prospects, profiles } = useApp();

  const supabase = useMemo(() => {
    if (isDemoMode || isProvisionalSession) return null;
    return createClient();
  }, [isDemoMode, isProvisionalSession]);

  const demo = isDemoMode || isProvisionalSession || !supabase;

  const [porProyecto, setPorProyecto] = useState<Record<string, SeguimientoProyecto>>({});
  const [porDia, setPorDia] = useState<NotaDia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // En demo el juego de datos depende de la cartera cargada, así que se recalcula
  // cuando cambia. Fuera de demo, `prospects` no interviene en la carga.
  const idsDemo = useMemo(() => (demo ? prospects.map((p) => p.id).join("|") : ""), [demo, prospects]);

  const cargar = useCallback(async () => {
    if (demo) {
      const nombreDe = (id: string | null | undefined) =>
        (id && profiles.find((p) => p.id === id)?.full_name) || "Equipo";
      const ejemplo = seguimientoDemo(prospects, nombreDe, notasTecleadasEnDemo());
      setPorProyecto(ejemplo.porProyecto);
      setPorDia(ejemplo.porDia);
      setCargando(false);
      setError(null);
      return;
    }

    setCargando(true);
    setError(null);

    try {
      // Rango vacío = histórico completo, igual que en el resto del módulo.
      const args = { p_desde: desde || null, p_hasta: hasta || null };

      const [filasProyecto, filasDia] = await Promise.all([
        traerPaginado<any>((a, b) => supabase!.rpc("seguimiento_por_proyecto").range(a, b)),
        traerPaginado<any>((a, b) => supabase!.rpc("seguimiento_notas_por_dia", args).range(a, b)),
      ]);

      const mapa: Record<string, SeguimientoProyecto> = {};
      filasProyecto.forEach((f) => {
        mapa[f.proyecto_id] = {
          notasPlataforma: num(f.notas_plataforma),
          notasGhl: num(f.notas_ghl),
          notasAliado: num(f.notas_aliado),
          notasAm: num(f.notas_am),
          notasDireccion: num(f.notas_direccion),
          diasConNota: num(f.dias_con_nota),
          primeraAt: f.primera_nota_at || null,
          ultimaPlataformaAt: f.ultima_plataforma_at || null,
          ultimaGhlAt: f.ultima_ghl_at || null,
          ultimoAutorPlataforma: f.ultimo_autor_plataforma || null,
        };
      });
      setPorProyecto(mapa);

      setPorDia(
        filasDia.map((f) => ({
          dia: f.dia as string,
          origen: f.origen_nota === "ghl" ? "ghl" : "plataforma",
          rol: (f.rol as string) || "aliado",
          autorId: (f.autor as string) || null,
          autorNombre: (f.autor_nom as string) || "Usuario",
          notas: num(f.notas),
          proyectos: num(f.proyectos),
        }))
      );
    } catch (e) {
      console.error("Error cargando el reporte de seguimiento:", e);
      // Nunca se enseña el error crudo de Supabase al usuario final. El caso más
      // probable con diferencia es que la migración todavía no esté aplicada.
      setError(
        "No se pudo cargar el seguimiento. Si acaba de publicarse esta versión, puede que falte aplicar la migración del reporte en la base."
      );
      setPorProyecto({});
      setPorDia([]);
    } finally {
      setCargando(false);
    }
    // `idsDemo` entra en las dependencias para que el juego de ejemplo se rehaga
    // cuando cambia la cartera de demo; con sesión real no cambia nunca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, supabase, desde, hasta, idsDemo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { porProyecto, porDia, cargando, error, demo, recargar: cargar };
}
