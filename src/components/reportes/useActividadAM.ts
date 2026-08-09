"use client";

// Carga de la actividad de los Account Managers (migración 20260809000000).
//
// Mismo patrón que `useObjetivosAM` y `useClosers`: no pasa por AppContext y en
// modo demo sirve un juego de datos de EJEMPLO (`actividadDemo`) en vez de tocar
// la base. Es la única forma de ver el panel antes de que exista histórico: la
// actividad no se puede backfillear, así que sin esto la previsualización local
// —y producción el primer día— saldría en blanco. El panel marca esos datos como
// ejemplo de forma bien visible; nadie puede confundirlos con una medición.
//
// Las TRES lecturas van agregadas en Postgres, no aquí: la bitácora puede tener
// decenas de miles de renglones al mes y bajarla al navegador para contarla
// sería descargar el libro entero para sumar una columna. Van en paralelo porque
// son independientes; una que falle no deja al panel sin las otras dos.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/utils/context/AppContext";
import { createClient } from "@/utils/supabase/client";
import { actividadDemoData } from "./actividadDemo";

export interface ResumenActividadAM {
  amId: string;
  nombre: string;
  segundos: number;
  segundosActivos: number;
  diasActivos: number;
  tramos: number;
  eventos: number;
  primerDia: string | null;
  ultimoDia: string | null;
  ultimaConexion: string | null;
}

export interface DiaActividadAM {
  amId: string;
  dia: string;
  segundos: number;
  segundosActivos: number;
  tramos: number;
  eventos: number;
}

export interface TipoActividadAM {
  amId: string;
  tipo: string;
  eventos: number;
  ultimaAt: string | null;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

export function useActividadAM(desde: string, hasta: string) {
  const { isDemoMode, isProvisionalSession } = useApp();

  const supabase = useMemo(() => {
    if (isDemoMode || isProvisionalSession) return null;
    return createClient();
  }, [isDemoMode, isProvisionalSession]);

  const demo = isDemoMode || isProvisionalSession || !supabase;

  const [resumen, setResumen] = useState<ResumenActividadAM[]>([]);
  const [porDia, setPorDia] = useState<DiaActividadAM[]>([]);
  const [porTipo, setPorTipo] = useState<TipoActividadAM[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (demo) {
      const ejemplo = actividadDemoData(desde, hasta);
      setResumen(ejemplo.resumen);
      setPorDia(ejemplo.porDia);
      setPorTipo(ejemplo.porTipo);
      setCargando(false);
      setError(null);
      return;
    }

    setCargando(true);
    setError(null);

    // Rango vacío = histórico completo. Las funciones aceptan NULL en los dos
    // extremos y lo interpretan igual que el resto del módulo.
    const args = { p_desde: desde || null, p_hasta: hasta || null };

    try {
      const [r1, r2, r3] = await Promise.all([
        supabase!.rpc("actividad_resumen", args),
        supabase!.rpc("actividad_por_dia", args),
        supabase!.rpc("actividad_por_tipo", args),
      ]);
      const fallo = r1.error || r2.error || r3.error;
      if (fallo) throw fallo;

      setResumen(
        (r1.data || []).map((f: any) => ({
          amId: f.am_id as string,
          nombre: (f.am_nombre as string) || "Account Manager",
          segundos: num(f.segundos),
          segundosActivos: num(f.segundos_activos),
          diasActivos: num(f.dias_activos),
          tramos: num(f.tramos),
          eventos: num(f.eventos),
          primerDia: (f.primer_dia as string) || null,
          ultimoDia: (f.ultimo_dia as string) || null,
          ultimaConexion: (f.ultima_conexion as string) || null,
        }))
      );
      setPorDia(
        (r2.data || []).map((f: any) => ({
          amId: f.am_id as string,
          dia: f.dia as string,
          segundos: num(f.segundos),
          segundosActivos: num(f.segundos_activos),
          tramos: num(f.tramos),
          eventos: num(f.eventos),
        }))
      );
      setPorTipo(
        (r3.data || []).map((f: any) => ({
          amId: f.am_id as string,
          tipo: f.tipo as string,
          eventos: num(f.eventos),
          ultimaAt: (f.ultima_at as string) || null,
        }))
      );
    } catch (e) {
      console.error("Error cargando la actividad de los account managers:", e);
      // Nunca se enseña el error crudo de Supabase al usuario final.
      setError("No se pudo cargar la actividad en plataforma. Vuelve a intentarlo en un momento.");
      setResumen([]);
      setPorDia([]);
      setPorTipo([]);
    } finally {
      setCargando(false);
    }
  }, [demo, supabase, desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { resumen, porDia, porTipo, cargando, error, demo, recargar: cargar };
}
