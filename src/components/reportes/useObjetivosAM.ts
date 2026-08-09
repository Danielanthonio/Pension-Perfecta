"use client";

// Metas mensuales por Account Manager (tabla `am_objetivos`, migración
// 20260808000000).
//
// Mismo patrón que `useClosers`: no pasa por AppContext —que ya carga el pipeline
// entero— y cae a localStorage en modo demo para que la previsualización local
// funcione sin tocar producción.
//
// Quién puede escribir lo decide la RLS, no esta pantalla: la Dirección escribe
// todas las filas y un Account Manager solo LEE la suya. El botón de guardar se
// oculta para quien no es Dirección, pero aunque se forzara, la base rechazaría
// el UPSERT.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/utils/context/AppContext";
import { createClient } from "@/utils/supabase/client";

const STORAGE_KEY = "pensionflow_am_objetivos";

/** Clave local: la misma tripleta que la PK de la tabla. */
const claveLocal = (amId: string, periodo: string, metrica: string) => `${amId}|${periodo}|${metrica}`;

function leeLocal(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function useObjetivosAM(periodo: string, metrica = "agenda") {
  const { user, isDemoMode, isProvisionalSession } = useApp();

  const supabase = useMemo(() => {
    if (isDemoMode || isProvisionalSession) return null;
    return createClient();
  }, [isDemoMode, isProvisionalSession]);

  const isLocal = isDemoMode || isProvisionalSession || !supabase;
  // El contexto normaliza 'admin' a 'director' al cargar el perfil; en la base
  // conviven los dos y la RLS los admite a ambos.
  const puedeEditar = user?.role === "director";

  const [objetivos, setObjetivos] = useState<Map<string, number>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    if (isLocal) {
      const todo = leeLocal();
      const m = new Map<string, number>();
      Object.entries(todo).forEach(([k, v]) => {
        const [amId, per, met] = k.split("|");
        if (per === periodo && met === metrica) m.set(amId, Number(v) || 0);
      });
      setObjetivos(m);
      setCargando(false);
      return;
    }

    try {
      const { data, error: err } = await supabase!
        .from("am_objetivos")
        .select("am_id, objetivo")
        .eq("periodo", periodo)
        .eq("metrica", metrica);
      if (err) throw err;
      setObjetivos(new Map((data || []).map((r: any) => [r.am_id as string, Number(r.objetivo) || 0])));
    } catch (e) {
      console.error("Error cargando los objetivos de los account managers:", e);
      // Nunca se enseña el error crudo de Supabase al usuario final.
      setError("No se pudieron cargar los objetivos. El gráfico muestra solo el dato real.");
      setObjetivos(new Map());
    } finally {
      setCargando(false);
    }
  }, [isLocal, supabase, periodo, metrica]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /**
   * Fija la meta de un AM. Optimista: la barra se mueve al soltar el campo y se
   * revierte sola si la base dice que no, en vez de dejar la pantalla congelada
   * mientras viaja la petición.
   */
  const guardar = useCallback(
    async (amId: string, objetivo: number): Promise<void> => {
      const limpio = Math.max(0, Math.round(objetivo) || 0);
      const previo = objetivos;
      setObjetivos(new Map(previo).set(amId, limpio));

      if (isLocal) {
        const todo = leeLocal();
        todo[claveLocal(amId, periodo, metrica)] = limpio;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(todo));
        } catch {
          /* cuota llena: el objetivo vive solo en memoria hasta recargar */
        }
        return;
      }

      const { error: err } = await supabase!
        .from("am_objetivos")
        .upsert(
          { am_id: amId, periodo, metrica, objetivo: limpio, updated_by: user?.id ?? null },
          { onConflict: "am_id,periodo,metrica" }
        );

      if (err) {
        console.error("Error guardando el objetivo:", err);
        setObjetivos(previo);
        setError("No se pudo guardar el objetivo. Vuelve a intentarlo.");
        return;
      }
      setError(null);
    },
    [isLocal, supabase, objetivos, periodo, metrica, user?.id]
  );

  return { objetivos, cargando, error, puedeEditar, guardar, recargar: cargar };
}
