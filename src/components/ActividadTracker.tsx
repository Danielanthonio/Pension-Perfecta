"use client";

// Vigilante de actividad del Account Manager.
//
// Hace dos cosas y ninguna se ve en pantalla:
//
//   1. LATE cada minuto mientras la pestaña esté visible. El servidor suma el
//      hueco desde el latido anterior (tope 3 min) y así se mide el tiempo dentro
//      de la plataforma sin que el navegador envíe nunca una duración.
//   2. GRABA en qué está: la URL dice si entró a un módulo o abrió el expediente
//      de un cliente, así que ninguna pantalla tiene que acordarse de avisar. Las
//      acciones que cambian datos las registra AppContext desde dentro de cada
//      operación, cuando ya se sabe que salió bien.
//
// Se monta en el layout raíz, junto a los demás satélites del provider. Para
// cualquiera que no sea account_manager —o en modo demo— las dos llamadas del
// contexto son no-ops, así que el componente se queda montado sin hacer nada.
//
// «Activo» ≠ «presente»: presente es tener la pestaña delante; activo es además
// haber tocado el ratón o el teclado hace menos de dos minutos. El dato de
// interacción sale del MISMO timestamp que mantiene el cierre por inactividad
// (IDLE_ACTIVITY_KEY, compartido entre pestañas por localStorage): montar un
// segundo detector de eventos para lo mismo sobraría.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useApp, IDLE_ACTIVITY_KEY } from "@/utils/context/AppContext";
import { actividadDeRuta } from "@/utils/actividad";

/** Cada cuánto se avisa de que seguimos aquí. */
const LATIDO_MS = 60_000;

/**
 * Cuánto vale un toque de ratón o teclado. Dos minutos porque el latido va cada
 * uno: leer un expediente durante minuto y medio sin tocar nada sigue siendo
 * trabajo, y sería absurdo descontarlo por no mover el ratón.
 */
const VENTANA_ACTIVO_MS = 2 * 60_000;

export default function ActividadTracker() {
  const { user, isDemoMode, isProvisionalSession, registrarActividad, latidoActividad } = useApp();
  const pathname = usePathname();

  // Las funciones del contexto se recrean en cada render (no son useCallback), así
  // que si los efectos dependieran de ellas el temporizador se reiniciaría sin
  // parar y no llegaría a latir nunca. Se guardan en una ref, como hace el
  // vigilante de inactividad con `logout`.
  const fns = useRef({ registrarActividad, latidoActividad });
  fns.current = { registrarActividad, latidoActividad };

  // Único disparador de los efectos. El contexto normaliza 'admin' a 'director',
  // así que aquí `account_manager` es exactamente el rol que se mide; la base lo
  // vuelve a comprobar de todos modos.
  const activo = !isDemoMode && !isProvisionalSession && user?.role === "account_manager";

  // ── Latido ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activo || typeof window === "undefined") return;

    const late = () => {
      // Pestaña de fondo = no está trabajando aquí. No se late, así que el hueco
      // se pierde solo: al volver, el servidor decide si fue una pausa corta
      // (sigue el tramo) o una ausencia (tramo nuevo).
      if (document.visibilityState !== "visible") return;
      let ultimoToque = 0;
      try {
        ultimoToque = Number(localStorage.getItem(IDLE_ACTIVITY_KEY) || "0");
      } catch {
        /* localStorage bloqueado: cuenta como presencia sin interacción */
      }
      fns.current.latidoActividad(ultimoToque > 0 && Date.now() - ultimoToque <= VENTANA_ACTIVO_MS);
    };

    late();
    const intervalo = window.setInterval(late, LATIDO_MS);
    // Volver a la pestaña late de inmediato: si no, el primer minuto de vuelta
    // caería fuera de la gracia y se abriría un tramo de más.
    const alVolver = () => {
      if (document.visibilityState === "visible") late();
    };
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [activo]);

  // ── Dónde está ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activo || !pathname) return;
    const acto = actividadDeRuta(pathname);
    if (!acto) return;
    fns.current.registrarActividad(acto.tipo, acto.detalle ?? null, acto.entidadId ?? null);
  }, [activo, pathname]);

  return null;
}
