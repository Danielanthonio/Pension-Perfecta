"use client";

// El sello de coincidencia con GoHighLevel, y el cajón que enseña lo que hay
// allá del cliente.
//
// GHL es donde se agenda al cliente y donde el equipo deja sus notas, pero los
// dos sistemas no comparten identificador. Lo único cruzable son los tres datos
// que un humano teclea en ambos lados —correo, teléfono y nombre—, así que en
// vez de afirmar «es el mismo cliente» se enseña CON QUÉ CONFIANZA lo es:
//
//   🟢 3 de 3 → verificado
//   🔵 2 de 3 → probable, un dato no cuadra
//   🟡 1 de 3 → por revisar, hay que mirarlo a ojo
//
// La regla de qué cuenta como coincidencia vive en `@/utils/ghlMatch` (que es
// código puro y sin red); aquí solo se pinta.

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink, RefreshCw, StickyNote, CalendarClock, Link2, ShieldQuestion } from "lucide-react";
import { selloDe, type ResultadoCotejo } from "@/utils/ghlMatch";

// ─────────────────────────────────────────────────────────────────────────────
// Lo que devuelve /api/ghl/sincronizar
// ─────────────────────────────────────────────────────────────────────────────

export interface GhlContacto {
  id: string;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  origen: string | null;
  creado: string | null;
}
export interface GhlNota {
  id: string;
  texto: string;
  fecha: string | null;
}
export interface GhlCita {
  id: string;
  titulo: string | null;
  inicio: string | null;
  estado: string | null;
  liga: string | null;
  notas: string | null;
}
export interface GhlCotejo {
  cotejo: ResultadoCotejo;
  contacto: GhlContacto;
  notas: GhlNota[];
  citas: GhlCita[];
}

/** `undefined` = todavía no se ha buscado. `null` = se buscó y no está en GHL. */
export type MapaCotejos = Record<string, GhlCotejo | null>;

// ─────────────────────────────────────────────────────────────────────────────
// El enganche que pide el cotejo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tope del lote que acepta la ruta. Aquí se respeta para no pedir un 400.
 * DEBE seguir al de `src/app/api/ghl/sincronizar/route.ts`, que es quien manda: allá
 * está la razón (el límite de 100 peticiones por 10 s de toda la sub-cuenta).
 */
export const TOPE_LOTE = 12;

/**
 * Pide a GHL el cotejo de un puñado de clientes.
 *
 * NO se dispara solo al montar la tabla, y es a propósito: cada cliente cuesta
 * hasta 4 búsquedas en GHL, y la cartera completa serían ~1 900 peticiones por
 * cada vez que alguien abre el listado. Se cotejan los que se piden, cuando se
 * piden.
 */
export function useGhlCotejo() {
  const [cotejos, setCotejos] = useState<MapaCotejos>({});
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
      // entero —cuerpo incluido— en un segundo viaje. Es la misma convención
      // que ya usa `/api/admin/delete-user/`.
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
      // Se ACUMULA en vez de reemplazar: cotejar el siguiente lote no debe
      // borrar los sellos que ya están pintados en pantalla.
      setCotejos((previo) => ({ ...previo, ...(j.cotejos || {}) }));
      // Un aviso del servidor (p. ej. la migración sin aplicar) NO invalida los
      // sellos, que se calculan sin tocar la base. Se enseña como error visible
      // pero los cotejos se pintan igual.
      if (j.aviso) setError(j.aviso);
      const total = Object.values(j.importadas || {}).reduce((a: number, b) => a + (Number(b) || 0), 0);
      setTraidas(total);
      // Las notas entraron por el servidor, así que el resumen que alimenta la
      // columna «Último seguimiento» está viejo: hay que volver a pedirlo o la
      // fila seguiría diciendo «Sin notas» con las notas ya dentro.
      if (total > 0) await alTerminar?.();
    } catch {
      setError("No se pudo consultar GoHighLevel. Revisa la conexión.");
    } finally {
      setCargando(false);
    }
  }, []);

  return { cotejos, cargando, error, traidas, cotejar };
}

// ─────────────────────────────────────────────────────────────────────────────
// El sello
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El chip de color junto al nombre del cliente.
 *
 * Si `onClick` viene, es un botón que abre el cajón. Sin cotejo todavía no
 * pinta NADA: un sello gris de «sin buscar» en 476 filas es ruido, no dato.
 */
export function GhlSello({
  cotejo,
  onClick,
  className = "",
}: {
  cotejo?: GhlCotejo | null;
  onClick?: () => void;
  className?: string;
}) {
  // `undefined` → no se ha cotejado. `null` → se cotejó y no está allá.
  if (cotejo === undefined) return null;

  if (cotejo === null) {
    return (
      <span
        title="Se buscó en GoHighLevel y no hay ningún contacto que coincida ni en un solo dato."
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 whitespace-nowrap ${className}`}
      >
        <ShieldQuestion className="h-2.5 w-2.5" />
        Sin GHL
      </span>
    );
  }

  const sello = selloDe(cotejo.cotejo);
  if (!sello) return null;

  const contenido = (
    <>
      <span className={`h-1.5 w-1.5 rounded-full ${sello.punto}`} />
      {sello.label}
      {/* El «n/3» solo tiene sentido cuando el sello ES el recuento. En
          «Nombre exacto» el dato que manda no es cuántos cuadran, sino CUÁL. */}
      {sello.clave !== "nombre" && <span className="tabular-nums opacity-60">{cotejo.cotejo.nivel}/3</span>}
    </>
  );

  const clases = `inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide border whitespace-nowrap ${sello.badge} ${className}`;
  const ayuda = `${sello.ayuda}\nCoincide: ${cotejo.cotejo.camposCoincididos.join(", ")}\nEn GHL: ${cotejo.contacto.nombre}`;

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
      title={`${ayuda}\n\nClic para ver sus notas y citas de GoHighLevel.`}
      className={`${clases} hover:brightness-95 dark:hover:brightness-125 focus:outline-none focus:ring-2 focus:ring-slate-400/30 transition-all cursor-pointer`}
    >
      {contenido}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// El cajón
// ─────────────────────────────────────────────────────────────────────────────

/** «2026-08-25T20:46:11.831Z» / «2026-08-26 18:00:00» → «25 ago 2026, 14:46». */
function fechaLegible(valor: string | null): string {
  if (!valor) return "—";
  // GHL devuelve las citas SIN zona («2026-08-26 18:00:00», ya en la del
  // calendario) y las notas en UTC con Z. Si a la primera forma se le deja el
  // espacio, Safari la rechaza; con la T la interpreta como hora local, que es
  // justo lo que es.
  const d = new Date(valor.includes("T") ? valor : valor.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return valor;
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TONO_CITA: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  showed: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  noshow: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-850 dark:text-slate-400 dark:border-slate-750",
  invalid: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-850 dark:text-slate-400 dark:border-slate-750",
};

function Fila({ etiqueta, nuestro, alla, coincide }: { etiqueta: string; nuestro: string; alla: string; coincide: boolean }) {
  return (
    <div className="grid grid-cols-[62px_1fr] gap-2 items-start py-1.5 border-b border-slate-100 dark:border-slate-800/70 last:border-0">
      <span className="text-[9px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500 pt-0.5">{etiqueta}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full shrink-0 ${coincide ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
            title={coincide ? "Coincide" : "No coincide"}
          />
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">{nuestro || "—"}</span>
        </div>
        {/* Solo se enseña el valor de GHL cuando DIFIERE: repetirlo idéntico no
            informa de nada y alarga el panel. Cuando difiere es justamente el
            dato que hay que corregir en uno de los dos sistemas. */}
        {!coincide && (
          <div className="flex items-center gap-1.5 mt-0.5 pl-3">
            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 truncate">
              GHL: {alla || "vacío"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Panel lateral con lo que GHL sabe del cliente: el contacto con el que se
 * cotejó, sus citas y las notas que el equipo fue dejando en ese portal.
 *
 * Las notas son de SOLO LECTURA. Escribir en GHL desde aquí sería una vía de
 * ida sin vuelta —la bitácora del proyecto vive en `prospect_notas`, con su
 * autor y su hora selladas por trigger— y mezclar las dos dejaría dos verdades
 * sobre el mismo cliente sin forma de saber cuál manda.
 */
export function GhlDrawer({
  cotejo,
  prospectName,
  prospectEmail,
  prospectPhone,
  open,
  onClose,
}: {
  cotejo: GhlCotejo | null;
  prospectName?: string | null;
  /** Los datos de NUESTRO expediente. Son la mitad izquierda del cotejo: sin
      ellos el panel enseñaría los de GHL a ambos lados y siempre cuadraría. */
  prospectEmail?: string | null;
  prospectPhone?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  // Portal sobre `document.body` por la misma razón que el cajón de notas: los
  // listados cuelgan de contenedores con `transform`, y un ancestro
  // transformado se vuelve el bloque contenedor de todo `position: fixed`, con
  // lo que el panel se recortaría a la caja de la tabla.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (!open) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [open, onClose]);

  if (!open || !cotejo || !montado) return null;

  const sello = selloDe(cotejo.cotejo);
  const { contacto, notas, citas } = cotejo;
  const fiable = !!sello?.copia;

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full sm:w-[440px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-drawer-in">
        {/* Encabezado */}
        <div className="px-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex items-start gap-2 flex-shrink-0">
          <Link2 className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
              GoHighLevel
            </span>
            {prospectName && (
              <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {prospectName}
              </span>
            )}
          </div>
          {sello && <GhlSello cotejo={cotejo} className="mt-0.5" />}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mt-1 -mr-1 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            title="Cerrar (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-4">
          {/* Con qué contacto se cotejó y en qué cuadra */}
          <section>
            <h3 className="text-[9px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
              Cotejo · {cotejo.cotejo.nivel} de 3
              {cotejo.cotejo.nombreExacto && cotejo.cotejo.nivel < 2 && " · nombre completo idéntico"}
            </h3>
            <div className="rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 px-3 py-1.5">
              <Fila etiqueta="Nombre" nuestro={prospectName || "—"} alla={contacto.nombre} coincide={cotejo.cotejo.nombre} />
              <Fila etiqueta="Correo" nuestro={prospectEmail || "—"} alla={contacto.correo || ""} coincide={cotejo.cotejo.correo} />
              <Fila etiqueta="Teléfono" nuestro={prospectPhone || "—"} alla={contacto.telefono || ""} coincide={cotejo.cotejo.telefono} />
            </div>
            {contacto.origen && (
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-1.5 truncate" title={contacto.origen}>
                Origen del lead: {contacto.origen}
              </p>
            )}
          </section>

          {/* Con 1 de 3 no se bajan notas ni citas: el contacto es una conjetura
              y enseñar la conversación de otra persona en la ficha de este
              cliente es peor que no enseñar nada. */}
          {!fiable ? (
            <div className="rounded-xl border border-dashed border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-3">
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 leading-relaxed">
                Solo cuadra un dato suelto.
              </p>
              <p className="text-[10px] font-medium text-amber-600/90 dark:text-amber-400/80 leading-relaxed mt-1">
                No se traen las notas ni las citas: puede ser un homónimo parcial o un teléfono reciclado, y
                serían las de otra persona. Revísalo a ojo y corrige el dato que falte en el sistema donde
                esté mal — si el nombre completo cuadrara entero, sus notas entrarían solas.
              </p>
            </div>
          ) : (
            <>
              {/* Citas */}
              <section>
                <h3 className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                  <CalendarClock className="h-3 w-3" />
                  Agenda en GHL {citas.length > 0 && <span className="tabular-nums">({citas.length})</span>}
                </h3>
                {citas.length === 0 ? (
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">Sin citas registradas allá.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {citas.map((c) => (
                      <li key={c.id} className="rounded-xl border border-slate-150 dark:border-slate-800 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">
                            {c.titulo || "Cita"}
                          </span>
                          {c.estado && (
                            <span
                              className={`shrink-0 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wide border ${
                                TONO_CITA[c.estado] || TONO_CITA.cancelled
                              }`}
                            >
                              {c.estado}
                            </span>
                          )}
                        </div>
                        <span className="block text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
                          {fechaLegible(c.inicio)}
                        </span>
                        {c.liga && (
                          <a
                            href={c.liga}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline mt-1"
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                            Liga de la reunión
                          </a>
                        )}
                        {c.notas && (
                          <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 whitespace-pre-wrap mt-1 leading-relaxed">
                            {c.notas.trim()}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Notas */}
              <section>
                <h3 className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                  <StickyNote className="h-3 w-3" />
                  Notas del portal {notas.length > 0 && <span className="tabular-nums">({notas.length})</span>}
                </h3>
                {notas.length === 0 ? (
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">Sin notas en GoHighLevel.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {notas.map((n) => (
                      <li key={n.id} className="rounded-xl border border-slate-150 dark:border-slate-800 px-3 py-2">
                        {/* Solo la fecha: el autor NO se puede resolver. La nota
                            trae un `userId`, pero el token de la integración no
                            tiene el scope View Users (401). Añadirlo en GHL →
                            Settings → Private Integrations pondría el nombre. */}
                        <span className="block text-[9px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500 tabular-nums">
                          {fechaLegible(n.fecha)}
                        </span>
                        <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 whitespace-pre-wrap mt-1 leading-relaxed break-words">
                          {n.texto || "(nota vacía)"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}

          <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 leading-relaxed pt-1">
            Solo lectura. La bitácora del proyecto se escribe en «Último seguimiento»; esto es lo que hay del
            otro lado, en GoHighLevel.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// El botón que dispara el cotejo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Botón «Traer notas de GHL» del listado.
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
            ? `Buscará en GoHighLevel los primeros ${TOPE_LOTE} clientes del listado (de ${total}) y traerá sus notas a la bitácora. Filtra para revisar el resto.`
            : `Buscará ${cuantos} ${cuantos === 1 ? "cliente" : "clientes"} en GoHighLevel y traerá sus notas a la bitácora.`
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
            {traidas === 0
              ? "Sin notas nuevas que traer."
              : `${traidas} ${traidas === 1 ? "nota traída" : "notas traídas"} a la bitácora.`}
          </span>
        )
      )}
    </div>
  );
}
