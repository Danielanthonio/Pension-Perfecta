"use client";

// El sello de coincidencia con GoHighLevel.
//
// GHL es donde se agenda al cliente y donde el equipo deja sus notas, pero los
// dos sistemas no comparten identificador. Lo único cruzable son los tres datos
// que teclea un humano —correo, teléfono y nombre—, así que en vez de afirmar
// «es el mismo cliente» se enseña CON QUÉ CONFIANZA lo es. La regla vive en
// `@/utils/ghlMatch`, que es código puro y sin red; aquí solo se pinta.
//
// El sello NO se calcula aquí. Lo escribe el servidor en `prospect_ghl_cotejo`
// —el barrido nocturno y el botón— y esto lo lee del contexto. Antes se
// calculaba al vuelo y moría al recargar la página, que lo dejaba inservible
// para lo que más valía: entrar por la mañana y ver de un vistazo qué
// expedientes tienen mal el correo o el teléfono.

import React, { useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";
import { COTEJO_NO_CREADO, SELLOS, type ClaveSello } from "@/utils/ghlMatch";
import type { CotejoGhlResumen } from "@/utils/context/AppContext";

// ─────────────────────────────────────────────────────────────────────────────
// El enganche que pide traer las notas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tope del lote que acepta la ruta. DEBE seguir al de
 * `src/app/api/ghl/sincronizar/route.ts`, que es quien manda: allá está la razón
 * (el límite de 100 peticiones por 10 s de toda la sub-cuenta de GHL).
 */
export const TOPE_LOTE = 12;

/**
 * Trae las notas de un puñado de clientes, a petición.
 *
 * Existe para el caso urgente —acabas de dar de alta a alguien y quieres su
 * seguimiento ya—, no para mantener la cartera al día: de eso se encarga el
 * barrido nocturno (`.github/workflows/sincronizar-ghl.yml`).
 */
export function useGhlCotejo() {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Cuántas notas se trajeron en la última pulsación. null = todavía ninguna. */
  const [traidas, setTraidas] = useState<number | null>(null);

  const cotejar = useCallback(async (prospectIds: string[], alTerminar?: () => Promise<void>) => {
    const ids = [...new Set(prospectIds)].slice(0, TOPE_LOTE);
    if (ids.length === 0) return;
    setCargando(true);
    setError(null);
    setTraidas(null);
    try {
      // La barra final NO es cosmética: `next.config.js` fija `trailingSlash:
      // true`, así que sin ella la ruta contesta un 308 y el POST se repite
      // entero —cuerpo incluido— en un segundo viaje.
      const r = await fetch("/api/ghl/sincronizar/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectIds: ids }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j?.error || "No se pudo consultar GoHighLevel.");
        return;
      }
      if (j.aviso) setError(j.aviso);
      const total = Object.values(j.importadas || {}).reduce((a: number, b) => a + (Number(b) || 0), 0);
      setTraidas(total);
      // Los sellos y las notas los escribió el SERVIDOR, así que el navegador no
      // se ha enterado de nada: hay que volver a pedirlos o la pantalla seguiría
      // enseñando el estado de antes de pulsar.
      await alTerminar?.();
    } catch {
      setError("No se pudo consultar GoHighLevel. Revisa la conexión.");
    } finally {
      setCargando(false);
    }
  }, []);

  return { cargando, error, traidas, cotejar };
}

// ─────────────────────────────────────────────────────────────────────────────
// El sello
// ─────────────────────────────────────────────────────────────────────────────

function cuandoSeCotejo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const horas = Math.floor((Date.now() - d.getTime()) / 3_600_000);
  if (horas < 1) return "comprobado hace un momento";
  if (horas < 24) return `comprobado hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `comprobado hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

/**
 * El chip de color junto al nombre del cliente.
 *
 * Tres estados, y la diferencia entre los dos primeros importa:
 *   · `undefined`      → nunca se ha cotejado. No pinta NADA: un sello gris en
 *                        478 filas es ruido, no dato.
 *   · `sello: null`    → se buscó y NO está creado en GoHighLevel. Chip ROJO,
 *                        «No creado»: no es una ausencia neutra que anotar, es
 *                        trabajo pendiente —un cliente que no existe allá no se
 *                        puede agendar ni recibir seguimiento— y tiene que
 *                        saltar a la vista como salta un error.
 *   · un sello         → verde / azul / amarillo / ámbar.
 */
export function GhlSello({
  resumen,
  onClick,
  className = "",
}: {
  resumen?: CotejoGhlResumen;
  onClick?: () => void;
  className?: string;
}) {
  if (!resumen) return null;

  if (!resumen.sello) {
    // El rojo sale de `COTEJO_NO_CREADO`, no de aquí: el reporte de sellos pinta
    // este mismo renglón y los dos colores tienen que ser el mismo color.
    return (
      <span
        title={`Este cliente NO está creado en GoHighLevel: ningún contacto de allá coincide con el expediente (${cuandoSeCotejo(resumen.cotejadoAt)}). Créalo para poder agendarlo y darle seguimiento.`}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide border ${COTEJO_NO_CREADO.badge} whitespace-nowrap ${className}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${COTEJO_NO_CREADO.punto}`} />
        {COTEJO_NO_CREADO.label}
      </span>
    );
  }

  const sello = SELLOS[resumen.sello as ClaveSello];
  if (!sello) return null;

  const contenido = (
    <>
      <span className={`h-1.5 w-1.5 rounded-full ${sello.punto}`} />
      {sello.label}
      {/* El «n/3» solo tiene sentido cuando el sello ES el recuento. En «Nombre
          exacto» el dato que manda no es cuántos cuadran, sino CUÁL. */}
      {sello.clave !== "nombre" && <span className="tabular-nums opacity-60">{resumen.nivel}/3</span>}
    </>
  );

  const clases = `inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide border whitespace-nowrap ${sello.badge} ${className}`;
  const ayuda =
    `${sello.ayuda}\n` +
    (resumen.contactoNombre ? `En GoHighLevel: ${resumen.contactoNombre}\n` : "") +
    cuandoSeCotejo(resumen.cotejadoAt);

  if (!onClick) {
    return (
      <span className={clases} title={ayuda}>
        {contenido}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`${ayuda}\n\nClic para ver el cotejo y las notas.`}
      className={`${clases} hover:brightness-95 dark:hover:brightness-125 focus:outline-none focus:ring-2 focus:ring-slate-400/30 transition-all cursor-pointer`}
    >
      {contenido}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// El cotejo, campo por campo — dentro del cajón de notas
// ─────────────────────────────────────────────────────────────────────────────

/** Normalizaciones mínimas, solo para decidir si pintar un campo en desacuerdo. */
const igualCorreo = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
const diezDigitos = (v?: string | null) => {
  const d = (v || "").replace(/\D+/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
};
const igualTelefono = (a?: string | null, b?: string | null) => {
  const x = diezDigitos(a), y = diezDigitos(b);
  return !!x && x === y;
};

function Discrepancia({ etiqueta, aqui, alla }: { etiqueta: string; aqui: string; alla: string }) {
  return (
    <li className="flex items-start gap-2 py-1">
      <span className="text-[9px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500 w-[52px] shrink-0 pt-0.5">
        {etiqueta}
      </span>
      <span className="min-w-0 flex-1 text-[11px] leading-snug">
        <span className="block font-bold text-slate-700 dark:text-slate-200 truncate">{aqui || "vacío"}</span>
        <span className="block font-semibold text-amber-600 dark:text-amber-400 truncate">GHL: {alla || "vacío"}</span>
      </span>
    </li>
  );
}

/**
 * Bloque de cotejo que se pinta en la cabecera del cajón de notas.
 *
 * Enseña SOLO lo que no cuadra. Repetir un correo idéntico a ambos lados no
 * informa de nada y alarga el panel; lo que difiere es justamente el dato que
 * hay que corregir en uno de los dos sistemas, y verlo con el valor de allá al
 * lado convierte «algo no cuadra» en «cambia esta letra».
 */
export function CotejoGhlPanel({
  resumen,
  email,
  phone,
}: {
  resumen?: CotejoGhlResumen;
  email?: string | null;
  phone?: string | null;
}) {
  if (!resumen) return null;

  if (!resumen.sello) {
    return (
      <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
        <GhlSello resumen={resumen} />
        <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">
          Este cliente no está creado en GoHighLevel.
        </span>
      </div>
    );
  }

  const correoCuadra = igualCorreo(email, resumen.contactoCorreo);
  const telCuadra = igualTelefono(phone, resumen.contactoTelefono);
  const discrepancias: React.ReactNode[] = [];
  if (!correoCuadra) {
    discrepancias.push(
      <Discrepancia key="c" etiqueta="Correo" aqui={email || ""} alla={resumen.contactoCorreo || ""} />
    );
  }
  if (!telCuadra) {
    discrepancias.push(
      <Discrepancia key="t" etiqueta="Teléfono" aqui={phone || ""} alla={resumen.contactoTelefono || ""} />
    );
  }

  return (
    <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-2 flex-wrap">
        <GhlSello resumen={resumen} />
        {resumen.contactoNombre && (
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate">
            = {resumen.contactoNombre}
          </span>
        )}
        <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 ml-auto">
          {cuandoSeCotejo(resumen.cotejadoAt)}
        </span>
      </div>
      {discrepancias.length > 0 && (
        <>
          <ul className="mt-1.5 mb-0.5">{discrepancias}</ul>
          <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 leading-snug">
            Corrige el dato en el sistema donde esté mal y el sello subirá solo en el siguiente sincronizado.
          </p>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// El botón del listado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Botón «Traer notas de GHL».
 *
 * Dice de cuántos clientes va a preguntar, porque el lote está topado y en una
 * cartera larga mirará solo los primeros: mejor que se lea en el botón a que el
 * usuario crea que ya repasó toda la tabla.
 */
export function GhlCotejarBoton({
  total,
  cargando,
  error,
  traidas,
  onCotejar,
  className = "",
}: {
  total: number;
  cargando: boolean;
  error: string | null;
  traidas: number | null;
  onCotejar: () => void;
  className?: string;
}) {
  const cuantos = Math.min(total, TOPE_LOTE);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={onCotejar}
        disabled={cargando || cuantos === 0}
        title={
          total > TOPE_LOTE
            ? `Buscará en GoHighLevel los primeros ${TOPE_LOTE} clientes del listado (de ${total}) y traerá sus notas. Toda la cartera se sincroniza sola cada madrugada.`
            : `Buscará ${cuantos} ${cuantos === 1 ? "cliente" : "clientes"} en GoHighLevel y traerá sus notas.`
        }
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-850 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-800 dark:hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} />
        {cargando ? "Buscando en GHL…" : `Traer notas de GHL${cuantos > 0 ? ` (${cuantos})` : ""}`}
      </button>
      {error ? (
        <span className="text-[10px] font-bold text-red-600 dark:text-red-400 max-w-[260px] leading-tight">{error}</span>
      ) : (
        // Decir «0 notas nuevas» importa tanto como decir «12»: es la diferencia
        // entre «ya estaban todas» y «no encontré a nadie», y sin el aviso el
        // botón parecería no haber hecho nada.
        traidas !== null && (
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-tight">
            {traidas === 0 ? "Sin notas nuevas que traer." : `${traidas} ${traidas === 1 ? "nota traída" : "notas traídas"}.`}
          </span>
        )
      )}
    </div>
  );
}
