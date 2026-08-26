"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  StickyNote,
  Send,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  AlertTriangle,
  Clock,
  Plus,
} from "lucide-react";
import { useApp, type ProspectNota, type NotasResumen } from "@/utils/context/AppContext";
import { getCreadorMeta, CREADOR_SIN_REGISTRO } from "@/components/ui/creadorProyecto";
import {
  diasDesde,
  etiquetaDias,
  fechaCortaLocal,
  fechaHoraLocal,
  inicialesAutor,
  puedeEscribirNotas,
  tonoSeguimiento,
  CLASES_TONO,
} from "@/utils/notas";

/**
 * NOTAS DE SEGUIMIENTO del proyecto (estilo Go High Level).
 *
 * Una bitácora en la que caben todas las notas que hagan falta. **La unidad es
 * la NOTA, no el día**: si alguien escribe dos el mismo martes, son dos notas, y
 * cada una lleva su fecha y su hora completas. Antes se agrupaban bajo una
 * cabecera de día y eso hacía parecer que dos seguimientos eran uno solo.
 *
 * Las horas se rotulan en el huso de QUIEN MIRA (ver `utils/notas`): la base
 * guarda el instante en UTC y cada quien lo lee con su reloj.
 *
 * Escriben aliado, account manager y dirección; leen todos los que ya pueden ver
 * el proyecto. Corregir y borrar, solo la nota propia (dirección puede borrar
 * cualquiera). Todo eso lo impone la base — aquí solo se esconden los botones
 * que la base rechazaría.
 *
 * Este fichero exporta cuatro piezas sobre el mismo cuerpo compartido:
 *   · `NotasSeguimiento` — la tarjeta que vive dentro del expediente.
 *   · `NotasDrawer`      — el cajón lateral que se abre DESDE los listados, para
 *                          dar seguimiento sin entrar al expediente.
 *   · `SeguimientoCell`  — la celda «Último seguimiento» de las tablas, que es
 *                          el botón que abre el cajón.
 *   · `NotasCuerpo`      — el cuerpo común (resumen + redactor + lista).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Datos: una sola bitácora, tres presentaciones
// ─────────────────────────────────────────────────────────────────────────────
function useNotas(prospectId: string, activo: boolean) {
  const { fetchProspectNotas } = useApp();
  const [notas, setNotas] = useState<ProspectNota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!prospectId || !activo) return;
    setCargando(true);
    setError(null);
    try {
      setNotas(await fetchProspectNotas(prospectId));
    } catch (e: any) {
      setError(e?.message || "No se pudieron cargar las notas.");
    } finally {
      setCargando(false);
    }
    // `fetchProspectNotas` se recrea en cada render del provider; meterlo en las
    // dependencias volvería a pedir la bitácora en bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospectId, activo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { notas, setNotas, cargando, error, setError };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cuerpo compartido
// ─────────────────────────────────────────────────────────────────────────────
export function NotasCuerpo({
  prospectId,
  activo = true,
  autoFoco = false,
}: {
  prospectId: string;
  /** false mientras el cajón está cerrado: no se pide la bitácora de balde. */
  activo?: boolean;
  /** El cajón enfoca el redactor al abrirse; la tarjeta de la ficha no. */
  autoFoco?: boolean;
}) {
  const { user, addProspectNota, updateProspectNota, deleteProspectNota } = useApp();
  const { notas, setNotas, cargando, error, setError } = useNotas(prospectId, activo);

  const [borrador, setBorrador] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEditado, setTextoEditado] = useState("");
  const [ocupadaId, setOcupadaId] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState<string | null>(null);

  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  const puedeEscribir = puedeEscribirNotas(user?.role);
  const esDireccion = user?.role === "director";

  useEffect(() => {
    if (autoFoco && activo && !cargando) areaRef.current?.focus();
  }, [autoFoco, activo, cargando]);

  // Resumen de la cabecera. Se calcula de las notas que ya están en pantalla y
  // no del resumen agregado del contexto: aquí las tenemos todas, así el
  // contador se mueve en el acto al escribir o borrar una.
  const total = notas.length;
  const ultima = notas[0]?.created_at || null;
  const diasSinTocar = useMemo(() => diasDesde(ultima), [ultima]);
  const tono = CLASES_TONO[tonoSeguimiento(diasSinTocar)];

  const guardar = async () => {
    const texto = borrador.trim();
    if (!texto || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const nota = await addProspectNota(prospectId, texto);
      setNotas((prev) => [nota, ...prev]);
      setBorrador("");
      areaRef.current?.focus();
    } catch (e: any) {
      setError(e?.message || "No se pudo guardar la nota.");
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEdicion = async (nota: ProspectNota) => {
    const texto = textoEditado.trim();
    if (!texto) return;
    if (texto === nota.texto) {
      setEditandoId(null);
      return;
    }
    setOcupadaId(nota.id);
    setError(null);
    try {
      await updateProspectNota(nota.id, texto);
      setNotas((prev) =>
        prev.map((n) => (n.id === nota.id ? { ...n, texto, edited_at: new Date().toISOString() } : n))
      );
      setEditandoId(null);
    } catch (e: any) {
      setError(e?.message || "No se pudo corregir la nota.");
    } finally {
      setOcupadaId(null);
    }
  };

  const borrar = async (nota: ProspectNota) => {
    setOcupadaId(nota.id);
    setError(null);
    try {
      await deleteProspectNota(nota.id, prospectId);
      setNotas((prev) => prev.filter((n) => n.id !== nota.id));
      setConfirmandoBorrado(null);
    } catch (e: any) {
      setError(e?.message || "No se pudo borrar la nota.");
    } finally {
      setOcupadaId(null);
    }
  };

  return (
    <>
      {/* Resumen */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-900/50">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <StickyNote className="h-2.5 w-2.5" />
            Notas registradas
          </span>
          <span className="block text-lg font-black text-slate-800 dark:text-white tabular-nums leading-tight mt-0.5">
            {total}
          </span>
        </div>
        <div className={`rounded-2xl border px-3 py-2 ${tono}`}>
          <span className="text-[8px] font-black uppercase tracking-widest opacity-70 flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            Último contacto
          </span>
          <span className="block text-sm font-black leading-tight mt-1">{etiquetaDias(diasSinTocar)}</span>
        </div>
      </div>

      {/* Redactor. Solo para quien la base deja escribir. */}
      {puedeEscribir && (
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 bg-white dark:bg-slate-900">
          <textarea
            ref={areaRef}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              // Enter hace párrafo; Ctrl/⌘+Enter guarda. Una nota de seguimiento
              // suele llevar varias líneas y perderlas por un Enter de más sería
              // el peor bug posible de esta pantalla.
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void guardar();
              }
            }}
            rows={3}
            maxLength={4000}
            placeholder="¿Qué pasó con este cliente? Llamada, respuesta, acuerdo, siguiente paso…"
            className="w-full resize-none rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 px-3.5 py-2.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
          />
          <div className="flex items-center justify-between gap-2 mt-2">
            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {borrador.length > 0 ? `${borrador.length}/4000 · ⌘/Ctrl + Enter` : "La fecha y la hora las pone el sistema"}
            </span>
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={!borrador.trim() || guardando}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-300 disabled:to-slate-300 dark:disabled:from-slate-800 dark:disabled:to-slate-800 disabled:text-slate-500 text-white text-[10px] font-black uppercase tracking-wide shadow-sm transition-all disabled:cursor-not-allowed"
            >
              {guardando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              {guardando ? "Guardando" : "Agregar nota"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-[10px] font-semibold text-rose-700 dark:text-rose-300 flex-shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      {/* La bitácora: una tarjeta por nota, de la más nueva a la más vieja. */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 bg-slate-50/50 dark:bg-slate-950/20">
        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-10 text-slate-400 dark:text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Cargando bitácora</span>
          </div>
        ) : notas.length === 0 ? (
          <div className="text-center py-10 px-4">
            <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400 dark:text-slate-500 shadow-inner">
              <StickyNote className="h-5 w-5" />
            </div>
            <h4 className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide mt-3">
              Sin seguimiento todavía
            </h4>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold leading-relaxed mt-1.5 max-w-[240px] mx-auto">
              {puedeEscribir
                ? "Cada nota queda con su fecha, su hora y su autor. Es el historial que después dice cómo se ha trabajado este cliente."
                : "Cuando el aliado, su account manager o la dirección anoten algo, aparecerá aquí."}
            </p>
          </div>
        ) : (
          notas.map((nota) => {
            const meta = getCreadorMeta(nota.autor_rol) ?? CREADOR_SIN_REGISTRO;
            const Icono = meta.Icon;
            const esMia = !!user?.id && nota.autor_id === user.id;
            const editando = editandoId === nota.id;
            const ocupada = ocupadaId === nota.id;

            return (
              <div
                key={nota.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-sm"
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${meta.wrap}`}
                    title={meta.label}
                  >
                    {inicialesAutor(nota.autor_nombre)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-black text-slate-800 dark:text-white truncate max-w-[150px]">
                        {nota.autor_nombre}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wide border ${meta.badge}`}
                      >
                        <Icono className="h-2.5 w-2.5 shrink-0" />
                        {meta.label}
                      </span>
                    </div>

                    {/* Fecha y hora COMPLETAS en cada nota: es lo que la
                        distingue de la de al lado cuando son del mismo día. */}
                    <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 tabular-nums mt-0.5">
                      {fechaHoraLocal(nota.created_at)}
                      {nota.edited_at && <span className="ml-1 italic font-semibold">· editada</span>}
                    </span>

                    {editando ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={textoEditado}
                          onChange={(e) => setTextoEditado(e.target.value)}
                          rows={3}
                          maxLength={4000}
                          className="w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 px-3 py-2 text-[11px] font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void confirmarEdicion(nota)}
                            disabled={ocupada || !textoEditado.trim()}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white text-[9px] font-black uppercase tracking-wide transition-all"
                          >
                            {ocupada ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Check className="h-2.5 w-2.5" />}
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditandoId(null)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[9px] font-black uppercase tracking-wide hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                          >
                            <X className="h-2.5 w-2.5" />
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                        {nota.texto}
                      </p>
                    )}

                    {/* Corregir / borrar. Solo lo propio; dirección además borra cualquiera. */}
                    {!editando && (esMia || esDireccion) && (
                      <div className="flex items-center gap-3 mt-2">
                        {esMia && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditandoId(nota.id);
                              setTextoEditado(nota.texto);
                              setConfirmandoBorrado(null);
                            }}
                            className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                          >
                            <Pencil className="h-2.5 w-2.5" />
                            Corregir
                          </button>
                        )}
                        {confirmandoBorrado === nota.id ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wide">
                              ¿Seguro?
                            </span>
                            <button
                              type="button"
                              onClick={() => void borrar(nota)}
                              disabled={ocupada}
                              className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-rose-600 dark:text-rose-400 hover:underline"
                            >
                              {ocupada ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Check className="h-2.5 w-2.5" />}
                              Sí, borrar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmandoBorrado(null)}
                              className="text-[9px] font-bold uppercase tracking-wide text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmandoBorrado(nota.id)}
                            className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                            Borrar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// La tarjeta del expediente
// ─────────────────────────────────────────────────────────────────────────────
export default function NotasSeguimiento({
  prospectId,
  className = "",
  alto = "lg:h-[800px]",
}: {
  prospectId: string;
  className?: string;
  /** Alto del panel en escritorio. La ficha de dirección alinea con sus columnas. */
  alto?: string;
}) {
  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col ${alto} ${className}`}
    >
      <div className="flex items-center gap-2 px-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
        <StickyNote className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
        <span className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
          Notas de seguimiento
        </span>
      </div>
      <NotasCuerpo prospectId={prospectId} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// El cajón lateral de los listados
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Seguimiento SIN entrar al expediente.
 *
 * Es la diferencia entre anotar una llamada en tres segundos o abandonar la
 * tabla, cargar la ficha entera del cliente y volver. Se abre desde la celda
 * «Último seguimiento» de cualquiera de los listados y monta el mismo cuerpo que
 * la tarjeta del expediente, así que lo que se escriba aquí está allá y al revés.
 */
export function NotasDrawer({
  prospectId,
  prospectName,
  open,
  onClose,
}: {
  prospectId: string | null;
  prospectName?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  // ⚠️ Se pinta con un PORTAL sobre `document.body`, no donde se declara. Los
  // listados viven dentro de contenedores con `transform` / `backdrop-filter`
  // (las animaciones de entrada, la barra lateral), y un ancestro transformado
  // se convierte en el bloque contenedor de todo `position: fixed` que cuelgue
  // de él: sin el portal, el cajón se recortaba a la caja de la tabla en vez de
  // ocupar la pantalla.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  // Escape cierra. Es un panel que se abre y se cierra muchas veces seguidas
  // mientras se recorre la cartera; obligar a apuntar a la X lo haría lento.
  useEffect(() => {
    if (!open) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [open, onClose]);

  if (!open || !prospectId || !montado) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full sm:w-[440px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-drawer-in">
        <div className="px-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex items-start gap-2 flex-shrink-0">
          <StickyNote className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
              Notas de seguimiento
            </span>
            {prospectName && (
              <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {prospectName}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mt-1 -mr-1 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            title="Cerrar (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <NotasCuerpo prospectId={prospectId} activo={open} autoFoco />
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// La celda de los listados — y el botón que abre el cajón
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Celda «Último seguimiento».
 *
 * Contesta de un vistazo cuánto lleva el proyecto sin que nadie lo toque (el
 * chip, ámbar a los 4 días y rojo a los 8) y cuántas notas lleva. Y es un botón:
 * al pulsarla se abre el cajón para leer y escribir sin salir de la tabla.
 *
 * Recibe el resumen ya calculado por la base (`notasResumen` del contexto): la
 * tabla NO se baja las notas para contarlas.
 */
export function SeguimientoCell({
  resumen,
  onClick,
  className = "",
}: {
  resumen?: NotasResumen | null;
  onClick?: () => void;
  className?: string;
}) {
  const ultima = resumen?.ultimaAt || null;
  const dias = diasDesde(ultima);
  const tono = CLASES_TONO[tonoSeguimiento(dias)];
  const vacio = !resumen || !ultima;

  const detalle = vacio
    ? "Sin notas todavía · clic para agregar la primera"
    : `Última nota: ${fechaCortaLocal(ultima)}${resumen?.ultimoAutor ? ` · ${resumen.ultimoAutor}` : ""} · clic para ver o agregar`;

  const contenido = vacio ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 group-hover/nota:border-emerald-300 group-hover/nota:text-emerald-600 dark:group-hover/nota:border-emerald-800 dark:group-hover/nota:text-emerald-400 transition-colors">
      <Plus className="h-2.5 w-2.5" />
      Sin notas
    </span>
  ) : (
    <>
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide border whitespace-nowrap ${tono}`}
      >
        {etiquetaDias(dias)}
      </span>
      <span className="block text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-1 whitespace-nowrap tabular-nums group-hover/nota:text-slate-600 dark:group-hover/nota:text-slate-300 transition-colors">
        {resumen!.total} {resumen!.total === 1 ? "nota" : "notas"}
      </span>
    </>
  );

  if (!onClick) {
    return (
      <div className={className} title={detalle}>
        {contenido}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={detalle}
      className={`group/nota text-left rounded-xl -mx-1.5 px-1.5 py-1 hover:bg-slate-100 dark:hover:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-colors ${className}`}
    >
      {contenido}
    </button>
  );
}
