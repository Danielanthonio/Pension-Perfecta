"use client";

// Pestaña "Liquidaciones": la tabla del §9 y el detalle por persona del §10.
//
// Una fila por beneficiario, con lo que se le debe partido en comisión base,
// bonos, salario y ajustes. Al abrir a alguien se ve su desglose por concepto, y
// cada concepto se despliega hasta las operaciones concretas que lo originaron —
// que es la trazabilidad que pide el §21: poder bajar del total a cada venta.

import React, { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  Coins,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Undo2,
  Users,
} from "lucide-react";
import {
  Aviso,
  Campo,
  DialogoMotivo,
  EstadoChip,
  Modal,
  Panel,
  Vacio,
  btnPrimario,
  btnSecundario,
  inputBase,
  pastilla,
  segmentado,
} from "./FinanzasUI";
import { exportarCsv, exportarExcel, exportarPdf, filasEventos, filasLiquidaciones } from "./finanzasExport";
import {
  type EstadoComision,
  type EventoRow,
  type LiquidacionRow,
  type RolBeneficiario,
  type TipoEvento,
  ESTADO_LABEL,
  PRODUCTO_LABEL,
  ROL_LABEL,
  TIPOS_AJUSTE,
  TIPOS_BONO,
  TIPOS_COMISION,
  TIPOS_SALARIO,
  TIPO_EVENTO_LABEL,
  datosDeCobro,
  fmtFecha,
  fmtMoneda,
  fmtNumero,
} from "./finanzasTypes";

type Orden = "total" | "pendiente" | "produccion" | "nombre" | "estado";

const ROLES: RolBeneficiario[] = ["director", "account_manager", "closer", "aliado"];
const ESTADOS: EstadoComision[] = ["pendiente_revision", "aprobado", "enviado_finanzas", "pagado", "observado"];

export function LiquidacionesPanel({
  liquidaciones,
  periodoTexto,
  desde,
  hasta,
  rol,
  estado,
  personaAbierta,
  onCambiarRol,
  onCambiarEstado,
  onAbrirPersona,
  fetchEventos,
  setEstadoEventos,
  crearAjuste,
  revertirEvento,
  beneficiariosDisponibles,
  onAviso,
}: {
  liquidaciones: LiquidacionRow[];
  periodoTexto: string;
  desde: string;
  hasta: string;
  rol: RolBeneficiario | null;
  estado: EstadoComision | null;
  personaAbierta: string | null;
  onCambiarRol: (r: RolBeneficiario | null) => void;
  onCambiarEstado: (e: EstadoComision | null) => void;
  onAbrirPersona: (id: string | null) => void;
  fetchEventos: (f: { usuarioId?: string | null; limite?: number }) => Promise<EventoRow[]>;
  setEstadoEventos: (ids: string[], estado: EstadoComision, comentario?: string) => Promise<number>;
  crearAjuste: (usuarioId: string, monto: number, motivo: string, fecha?: string) => Promise<void>;
  revertirEvento: (id: string, motivo: string) => Promise<void>;
  beneficiariosDisponibles: { id: string; nombre: string; rol: string }[];
  onAviso: (mensaje: string, tono: "ok" | "error") => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<Orden>("total");
  const [ajusteAbierto, setAjusteAbierto] = useState(false);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtradas = q
      ? liquidaciones.filter(
          (l) => l.usuario_nombre.toLowerCase().includes(q) || ROL_LABEL[l.rol_beneficiario].toLowerCase().includes(q)
        )
      : liquidaciones;

    const pesoEstado: Record<EstadoComision, number> = {
      observado: 0,
      pendiente_revision: 1,
      aprobado: 2,
      enviado_finanzas: 3,
      pagado: 4,
      revertido: 5,
    };

    return [...filtradas].sort((a, b) => {
      switch (orden) {
        case "pendiente":
          return b.total_pendiente - a.total_pendiente;
        case "produccion":
          return b.produccion - a.produccion;
        case "nombre":
          return a.usuario_nombre.localeCompare(b.usuario_nombre);
        case "estado":
          return pesoEstado[a.estado_resumen] - pesoEstado[b.estado_resumen];
        default:
          return b.total_a_pagar - a.total_a_pagar;
      }
    });
  }, [liquidaciones, busqueda, orden]);

  const totales = useMemo(
    () => ({
      comision: filas.reduce((s, r) => s + r.comision_base, 0),
      bonos: filas.reduce((s, r) => s + r.bonos, 0),
      salario: filas.reduce((s, r) => s + r.salario, 0),
      ajustes: filas.reduce((s, r) => s + r.ajustes, 0),
      total: filas.reduce((s, r) => s + r.total_a_pagar, 0),
      pagado: filas.reduce((s, r) => s + r.total_pagado, 0),
      pendiente: filas.reduce((s, r) => s + r.total_pendiente, 0),
    }),
    [filas]
  );

  const exportar = (formato: "csv" | "excel" | "pdf") => {
    const datos = filasLiquidaciones(filas, periodoTexto);
    if (formato === "csv") exportarCsv("liquidaciones", datos);
    else if (formato === "excel") exportarExcel("liquidaciones", `Liquidaciones · ${periodoTexto}`, datos);
    else if (!exportarPdf("Liquidaciones de comisiones", periodoTexto, datos)) {
      onAviso("El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para exportar a PDF.", "error");
    }
  };

  return (
    <div className="space-y-5">
      <Panel
        titulo="Liquidaciones del periodo"
        descripcion={`${fmtNumero(filas.length)} beneficiario(s) · ${periodoTexto}`}
        icono={Users}
        acciones={
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar persona…"
                className={`${inputBase} pl-9 w-48`}
              />
            </div>
            <div className={segmentado}>
              <button onClick={() => onCambiarRol(null)} className={pastilla(rol === null)}>
                Todos
              </button>
              {ROLES.map((r) => (
                <button key={r} onClick={() => onCambiarRol(r)} className={pastilla(rol === r)}>
                  {r === "account_manager" ? "AM" : ROL_LABEL[r]}
                </button>
              ))}
            </div>
            <select
              value={estado || ""}
              onChange={(e) => onCambiarEstado((e.target.value || null) as EstadoComision | null)}
              className={`${inputBase} w-auto`}
              aria-label="Filtrar por estado"
            >
              <option value="">Cualquier estado</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {ESTADO_LABEL[e]}
                </option>
              ))}
            </select>
            <select
              value={orden}
              onChange={(e) => setOrden(e.target.value as Orden)}
              className={`${inputBase} w-auto`}
              aria-label="Ordenar"
            >
              <option value="total">Mayor total</option>
              <option value="pendiente">Mayor pendiente</option>
              <option value="produccion">Mayor producción</option>
              <option value="estado">Lo que falta por hacer</option>
              <option value="nombre">Nombre</option>
            </select>
            <button onClick={() => setAjusteAbierto(true)} className={btnSecundario}>
              <Plus className="h-3.5 w-3.5" /> Ajuste
            </button>
            <div className={segmentado}>
              <button onClick={() => exportar("csv")} className={pastilla(false)} title="Exportar CSV">
                <Download className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => exportar("excel")} className={pastilla(false)} title="Exportar a Excel">
                <FileSpreadsheet className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => exportar("pdf")} className={pastilla(false)} title="Exportar a PDF">
                <FileText className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        }
      >
        {filas.length === 0 ? (
          <Vacio
            mensaje="No hay liquidaciones que mostrar con estos filtros."
            hint="Prueba a ampliar el período o a quitar el filtro de estado."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/30">
                  {[
                    "Beneficiario", "Rol", "Producción", "Comisión base", "Bonos", "Salario",
                    "Ajustes", "Total a pagar", "Estado", "Pago", "",
                  ].map((h, i) => (
                    <th
                      key={h || i}
                      className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500 ${
                        i >= 2 && i <= 7 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filas.map((r) => {
                  const cobro = datosDeCobro(r);
                  return (
                    <tr
                      key={`${r.usuario_id}-${r.rol_beneficiario}`}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                      onClick={() => onAbrirPersona(r.usuario_id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0 overflow-hidden flex items-center justify-center">
                            {r.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400">
                                {r.usuario_nombre.substring(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100 truncate">
                              {r.usuario_nombre}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                              {cobro.valor ? `${cobro.etiqueta} ${cobro.valor}` : `Sin ${cobro.etiqueta} registrada`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {ROL_LABEL[r.rol_beneficiario]}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                        {fmtNumero(r.produccion)}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums text-slate-600 dark:text-slate-300">
                        {fmtMoneda(r.comision_base)}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums text-slate-600 dark:text-slate-300">
                        {r.bonos ? fmtMoneda(r.bonos) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums text-slate-600 dark:text-slate-300">
                        {r.salario ? fmtMoneda(r.salario) : "—"}
                      </td>
                      <td
                        className={`px-4 py-3 text-right text-[12px] tabular-nums ${
                          r.ajustes < 0 ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {r.ajustes ? fmtMoneda(r.ajustes) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] font-bold tabular-nums text-slate-900 dark:text-white">
                        {fmtMoneda(r.total_a_pagar)}
                      </td>
                      <td className="px-4 py-3">
                        <EstadoChip estado={r.estado_resumen} />
                        {r.eventos_observados > 0 && (
                          <p className="mt-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                            {r.eventos_observados} observada(s)
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        {r.total_pagado > 0 ? (
                          <>
                            <span className="block font-semibold text-emerald-600 dark:text-emerald-400">
                              {fmtMoneda(r.total_pagado)}
                            </span>
                            {fmtFecha(r.fecha_pago)}
                          </>
                        ) : (
                          "Sin depósitos"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                          <Eye className="h-3.5 w-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-950/40">
                  <td colSpan={3} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Total del periodo
                  </td>
                  <td className="px-4 py-3 text-right text-[12px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                    {fmtMoneda(totales.comision)}
                  </td>
                  <td className="px-4 py-3 text-right text-[12px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                    {fmtMoneda(totales.bonos)}
                  </td>
                  <td className="px-4 py-3 text-right text-[12px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                    {fmtMoneda(totales.salario)}
                  </td>
                  <td className="px-4 py-3 text-right text-[12px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                    {fmtMoneda(totales.ajustes)}
                  </td>
                  <td className="px-4 py-3 text-right text-[13px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {fmtMoneda(totales.total)}
                  </td>
                  <td colSpan={3} className="px-4 py-3 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                    Pendiente {fmtMoneda(totales.pendiente)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      {personaAbierta && (
        <DetallePersona
          usuarioId={personaAbierta}
          fila={liquidaciones.find((l) => l.usuario_id === personaAbierta) || null}
          periodoTexto={periodoTexto}
          onCerrar={() => onAbrirPersona(null)}
          fetchEventos={fetchEventos}
          setEstadoEventos={setEstadoEventos}
          revertirEvento={revertirEvento}
          onAviso={onAviso}
        />
      )}

      {ajusteAbierto && (
        <DialogoAjuste
          beneficiarios={beneficiariosDisponibles}
          onCerrar={() => setAjusteAbierto(false)}
          onGuardar={async (usuarioId, monto, motivo, fecha) => {
            await crearAjuste(usuarioId, monto, motivo, fecha);
            setAjusteAbierto(false);
            onAviso("Ajuste registrado. Entra al periodo como un movimiento más, pendiente de revisión.", "ok");
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// §10 · Detalle por persona
// ---------------------------------------------------------------------------
// Cada concepto se despliega hasta las operaciones que lo originaron. Es la
// vista con la que la Dirección valida el origen de una comisión antes de
// aprobarla: nombre del cliente, producto, fecha de cierre y quién gestionó.
//
// Las casillas hacen doble trabajo. Además de elegir sobre qué movimientos cae
// la acción masiva, son el cuadre: las tarjetas de arriba suman SOLO lo marcado.
// Todo entra marcado —así el total abre igual que la fila de la tabla— y al
// desmarcar un movimiento su importe sale del concepto y del total. Es la forma
// de contestar "¿cuánto le toca a esta persona si esta comisión no cuenta?" sin
// tener que revertir nada ni sacar la calculadora.

const BONOS_Y_SALARIO: TipoEvento[] = [...TIPOS_BONO, ...TIPOS_SALARIO];

const sumar = (xs: EventoRow[]) => xs.reduce((s, e) => s + (Number(e.monto) || 0), 0);
const deFamilia = (xs: EventoRow[], tipos: TipoEvento[]) => xs.filter((e) => tipos.includes(e.tipo_evento));

function DetallePersona({
  usuarioId,
  fila,
  periodoTexto,
  onCerrar,
  fetchEventos,
  setEstadoEventos,
  revertirEvento,
  onAviso,
}: {
  usuarioId: string;
  fila: LiquidacionRow | null;
  periodoTexto: string;
  onCerrar: () => void;
  fetchEventos: (f: { usuarioId?: string | null; limite?: number }) => Promise<EventoRow[]>;
  setEstadoEventos: (ids: string[], estado: EstadoComision, comentario?: string) => Promise<number>;
  revertirEvento: (id: string, motivo: string) => Promise<void>;
  onAviso: (mensaje: string, tono: "ok" | "error") => void;
}) {
  const [eventos, setEventos] = useState<EventoRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abiertos, setAbiertos] = useState<Set<TipoEvento>>(new Set());
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [trabajando, setTrabajando] = useState(false);
  const [observando, setObservando] = useState(false);
  const [revirtiendo, setRevirtiendo] = useState<EventoRow | null>(null);

  // Qué movimientos ya habíamos visto. Al recargar (tras aprobar, observar o
  // revertir) se respeta lo que el usuario había desmarcado y solo se marca
  // solo lo que aparece por primera vez —incluida la contrapartida negativa de
  // una reversión, que sí debe entrar en el cuadre.
  const conocidos = React.useRef<Set<string>>(new Set());

  const cargar = React.useCallback(async () => {
    setCargando(true);
    try {
      const nuevos = await fetchEventos({ usuarioId, limite: 1000 });
      const vistos = conocidos.current;
      conocidos.current = new Set(nuevos.map((e) => e.id));
      setEventos(nuevos);
      setSeleccion((prev) => {
        const s = new Set<string>();
        for (const e of nuevos) if (!vistos.has(e.id) || prev.has(e.id)) s.add(e.id);
        return s;
      });
    } catch (e: any) {
      onAviso(e?.message || "No se pudo cargar el detalle.", "error");
    } finally {
      setCargando(false);
    }
  }, [fetchEventos, usuarioId, onAviso]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const grupos = useMemo(() => {
    const mapa = new Map<TipoEvento, EventoRow[]>();
    for (const e of eventos) mapa.set(e.tipo_evento, [...(mapa.get(e.tipo_evento) || []), e]);
    return [...mapa.entries()].sort((a, b) => {
      const total = (xs: EventoRow[]) => Math.abs(xs.reduce((s, x) => s + x.monto, 0));
      return total(b[1]) - total(a[1]);
    });
  }, [eventos]);

  const toggleGrupo = (t: TipoEvento) => {
    const s = new Set(abiertos);
    if (s.has(t)) s.delete(t);
    else s.add(t);
    setAbiertos(s);
  };

  const toggleSel = (id: string) => {
    const s = new Set(seleccion);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSeleccion(s);
  };

  /** Marca o desmarca un concepto entero: si ya estaba completo, lo vacía. */
  const toggleGrupoSel = (evs: EventoRow[]) => {
    const s = new Set(seleccion);
    const completo = evs.every((e) => s.has(e.id));
    for (const e of evs) {
      if (completo) s.delete(e.id);
      else s.add(e.id);
    }
    setSeleccion(s);
  };

  const revisables = eventos.filter((e) => e.estado !== "pagado" && !e.anulado_at);
  const seleccionados = [...seleccion].filter((id) => revisables.some((e) => e.id === id));

  const aplicar = async (nuevo: EstadoComision, comentario?: string) => {
    if (seleccionados.length === 0) return;
    setTrabajando(true);
    try {
      const n = await setEstadoEventos(seleccionados, nuevo, comentario);
      // La selección NO se limpia: es el cuadre del pago, no un paso del flujo.
      await cargar();
      onAviso(`${n} comisión(es) ${nuevo === "aprobado" ? "aprobada(s)" : nuevo === "observado" ? "observada(s)" : "devuelta(s) a revisión"}.`, "ok");
    } catch (e: any) {
      onAviso(e?.message || "No se pudo aplicar el cambio.", "error");
    } finally {
      setTrabajando(false);
      setObservando(false);
    }
  };

  // Lo marcado manda: cada tarjeta suma su familia dentro de la selección y
  // guarda aparte el total del período para poder decir de cuánto se recortó.
  const marcados = useMemo(() => eventos.filter((e) => seleccion.has(e.id)), [eventos, seleccion]);
  const totalPeriodo = sumar(eventos);
  const total = sumar(marcados);
  const pagado = sumar(eventos.filter((e) => e.estado === "pagado"));
  const ajustesPeriodo = sumar(deFamilia(eventos, TIPOS_AJUSTE));

  const tarjetas = [
    { t: "Total seleccionado", sel: total, todo: totalPeriodo, c: "text-slate-900 dark:text-white" },
    {
      t: "Comisiones",
      sel: sumar(deFamilia(marcados, TIPOS_COMISION)),
      todo: sumar(deFamilia(eventos, TIPOS_COMISION)),
      c: "text-slate-700 dark:text-slate-200",
    },
    {
      t: "Bonos y salario",
      sel: sumar(deFamilia(marcados, BONOS_Y_SALARIO)),
      todo: sumar(deFamilia(eventos, BONOS_Y_SALARIO)),
      c: "text-slate-700 dark:text-slate-200",
    },
    // Los ajustes solo ocupan sitio cuando existen; si no, las tres tarjetas de
    // arriba ya suman el total y una casilla en cero solo despista.
    ...(ajustesPeriodo !== 0
      ? [
          {
            t: "Ajustes",
            sel: sumar(deFamilia(marcados, TIPOS_AJUSTE)),
            todo: ajustesPeriodo,
            c: "text-rose-600 dark:text-rose-400",
          },
        ]
      : []),
    { t: "Pagado", sel: pagado, todo: pagado, c: "text-emerald-600 dark:text-emerald-400" },
  ];

  return (
    <>
      <Modal
        titulo={fila?.usuario_nombre || "Detalle de comisiones"}
        subtitulo={`${fila ? ROL_LABEL[fila.rol_beneficiario] : ""} · ${periodoTexto}`}
        icono={Coins}
        ancho="max-w-4xl"
        onCerrar={onCerrar}
        pie={
          <>
            <button
              onClick={() => {
                const datos = filasEventos(marcados.length > 0 ? marcados : eventos);
                exportarCsv(`detalle-${(fila?.usuario_nombre || "persona").toLowerCase().replace(/\s+/g, "-")}`, datos);
              }}
              className={btnSecundario}
            >
              <Download className="h-3.5 w-3.5" />{" "}
              {marcados.length > 0 && marcados.length < eventos.length
                ? `Exportar ${marcados.length} ${marcados.length === 1 ? "marcado" : "marcados"}`
                : "Exportar detalle"}
            </button>
            <button onClick={onCerrar} className={btnSecundario}>
              Cerrar
            </button>
          </>
        }
      >
        {/* Cabecera de totales — refleja lo marcado, no el período entero */}
        <div className={`grid grid-cols-2 gap-3 ${tarjetas.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
          {tarjetas.map((x) => (
            <div key={x.t} className="rounded-xl border border-slate-200/70 dark:border-slate-800 px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">{x.t}</p>
              <p className={`mt-0.5 text-[15px] font-bold tabular-nums ${x.c}`}>{fmtMoneda(x.sel)}</p>
              {x.sel !== x.todo && (
                <p className="mt-0.5 text-[9px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">
                  de {fmtMoneda(x.todo)} del periodo
                </p>
              )}
            </div>
          ))}
        </div>

        {fila && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400">
            <strong className="text-slate-700 dark:text-slate-200">Cómo se le paga:</strong>{" "}
            {(() => {
              const c = datosDeCobro(fila);
              return c.valor
                ? `${c.etiqueta} ${c.valor}${fila.titular_cuenta ? ` · ${fila.titular_cuenta}` : ""}${fila.banco ? ` · ${fila.banco}` : ""}`
                : `Todavía no ha registrado su ${c.etiqueta}. Finanzas no podrá depositarle hasta que la capture en su perfil.`;
            })()}
          </div>
        )}

        {/* Barra de cuadre y revisión */}
        {eventos.length > 0 && (
          <div
            className={`sticky top-0 z-10 rounded-xl border px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap ${
              marcados.length === eventos.length
                ? "border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20"
                : "border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20"
            }`}
          >
            <div className="min-w-0">
              <p
                className={`text-[11px] font-bold ${
                  marcados.length === eventos.length
                    ? "text-emerald-800 dark:text-emerald-200"
                    : "text-amber-800 dark:text-amber-200"
                }`}
              >
                {marcados.length} de {eventos.length} movimiento(s) · {fmtMoneda(total)}
              </p>
              {seleccionados.length !== marcados.length && (
                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Las acciones solo alcanzan a {seleccionados.length} movimiento(s): el resto ya está pagado o anulado.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className={segmentado}>
                <button onClick={() => setSeleccion(new Set(eventos.map((e) => e.id)))} className={pastilla(false)}>
                  Todos
                </button>
                <button onClick={() => setSeleccion(new Set())} className={pastilla(false)}>
                  Ninguno
                </button>
              </div>
              <button
                onClick={() => aplicar("aprobado")}
                disabled={trabajando || seleccionados.length === 0}
                className={btnPrimario}
              >
                {trabajando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />}
                Aprobar
              </button>
              <button
                onClick={() => setObservando(true)}
                disabled={trabajando || seleccionados.length === 0}
                className={btnSecundario}
              >
                Observar
              </button>
              <button
                onClick={() => aplicar("pendiente_revision")}
                disabled={trabajando || seleccionados.length === 0}
                className={btnSecundario}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reabrir
              </button>
            </div>
          </div>
        )}

        {cargando ? (
          <div className="py-10 text-center text-[12px] text-slate-400">Cargando el desglose…</div>
        ) : grupos.length === 0 ? (
          <Vacio mensaje="Esta persona no tiene comisiones en el período seleccionado." />
        ) : (
          <ul className="space-y-2">
            {grupos.map(([tipo, evs]) => {
              const abierto = abiertos.has(tipo);
              const subtotal = sumar(evs);
              const marcadosGrupo = evs.filter((e) => seleccion.has(e.id));
              const subtotalSel = sumar(marcadosGrupo);
              return (
                <li
                  key={tipo}
                  className="rounded-xl border border-slate-200/70 dark:border-slate-800 overflow-hidden"
                >
                  <div className="w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <input
                      type="checkbox"
                      checked={marcadosGrupo.length === evs.length}
                      ref={(el) => {
                        if (el) el.indeterminate = marcadosGrupo.length > 0 && marcadosGrupo.length < evs.length;
                      }}
                      onChange={() => toggleGrupoSel(evs)}
                      aria-label={`Marcar todo el concepto ${TIPO_EVENTO_LABEL[tipo]}`}
                      className="h-3.5 w-3.5 rounded accent-emerald-600 shrink-0"
                    />
                    <button
                      onClick={() => toggleGrupo(tipo)}
                      className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {abierto ? (
                          <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200 truncate">
                          {TIPO_EVENTO_LABEL[tipo]}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 shrink-0">
                          {marcadosGrupo.length < evs.length
                            ? `${marcadosGrupo.length} de ${evs.length} movimientos`
                            : `${evs.length} ${evs.length === 1 ? "movimiento" : "movimientos"}`}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span
                          className={`block text-[13px] font-bold tabular-nums ${
                            subtotalSel < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"
                          }`}
                        >
                          {fmtMoneda(subtotalSel)}
                        </span>
                        {subtotalSel !== subtotal && (
                          <span className="block text-[9px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">
                            de {fmtMoneda(subtotal)}
                          </span>
                        )}
                      </span>
                    </button>
                  </div>

                  {abierto && (
                    <div className="border-t border-slate-100 dark:border-slate-800 overflow-x-auto">
                      <table className="w-full min-w-[680px] text-left">
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {evs.map((e) => {
                            const bloqueado = e.estado === "pagado" || !!e.anulado_at;
                            return (
                              <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                <td className="pl-4 pr-2 py-2 w-8">
                                  {/* Se puede desmarcar cualquier movimiento —también uno
                                      pagado— porque la casilla cuadra el importe; que la
                                      acción masiva no le llegue lo resuelve `seleccionados`. */}
                                  <input
                                    type="checkbox"
                                    checked={seleccion.has(e.id)}
                                    onChange={() => toggleSel(e.id)}
                                    aria-label={`Contar la comisión de ${fmtMoneda(e.monto)} en el total`}
                                    className="h-3.5 w-3.5 rounded accent-emerald-600"
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[220px]">
                                    {e.cliente_nombre || e.aliado_nombre || TIPO_EVENTO_LABEL[e.tipo_evento]}
                                  </p>
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[220px]">
                                    {e.tipo_producto
                                      ? PRODUCTO_LABEL[e.tipo_producto]
                                      : e.produccion !== null
                                        ? `${fmtNumero(e.produccion)} financiamientos · ${e.periodo_corte}`
                                        : e.periodo_corte}
                                  </p>
                                </td>
                                <td className="px-2 py-2 text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                                  {e.account_manager || "—"}
                                </td>
                                <td className="px-2 py-2 text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                                  {fmtFecha(e.fecha_devengo)}
                                </td>
                                <td
                                  className={`px-2 py-2 text-right text-[12px] font-bold tabular-nums whitespace-nowrap ${
                                    e.monto < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-800 dark:text-slate-100"
                                  }`}
                                >
                                  {fmtMoneda(e.monto)}
                                </td>
                                <td className="px-2 py-2">
                                  <EstadoChip estado={e.estado} />
                                  {e.motivo_observacion && (
                                    <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400 max-w-[220px] leading-snug">
                                      {e.motivo_observacion}
                                    </p>
                                  )}
                                  {e.anulado_at && (
                                    <p className="mt-1 text-[10px] text-rose-500 dark:text-rose-400">
                                      Anulada · descuento en el corte siguiente
                                    </p>
                                  )}
                                </td>
                                <td className="pr-4 pl-2 py-2 text-right">
                                  {!bloqueado && e.estado !== "revertido" && (
                                    <button
                                      onClick={() => setRevirtiendo(e)}
                                      title="Revertir esta comisión"
                                      className="p-1 rounded-md text-slate-300 hover:text-rose-600 dark:text-slate-600 dark:hover:text-rose-400 transition-colors"
                                    >
                                      <Undo2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      {observando && (
        <DialogoMotivo
          titulo="Observar comisiones"
          subtitulo={`${seleccionados.length} seleccionada(s)`}
          descripcion="Una comisión observada queda fuera de cualquier corte hasta que se resuelva. Escribe qué hay que revisar."
          etiquetaBoton="Marcar como observadas"
          placeholder="Ej.: el proyecto no tiene modalidad asignada"
          onCerrar={() => setObservando(false)}
          onConfirmar={async (motivo) => aplicar("observado", motivo)}
        />
      )}

      {revirtiendo && (
        <DialogoMotivo
          titulo="Revertir comisión"
          subtitulo={`${fmtMoneda(revirtiendo.monto)} · ${TIPO_EVENTO_LABEL[revirtiendo.tipo_evento]}`}
          peligro
          descripcion={
            revirtiendo.estado === "enviado_finanzas" || revirtiendo.estado === "pagado"
              ? "Esta comisión ya salió a Finanzas: no se toca. Se generará un movimiento negativo por el mismo importe que se descontará en el corte siguiente."
              : "La comisión quedará revertida y saldrá del período. La fila no se borra: queda con su motivo en el libro mayor."
          }
          etiquetaBoton="Revertir"
          placeholder="Ej.: el financiamiento se canceló antes de ejecutarse"
          onCerrar={() => setRevirtiendo(null)}
          onConfirmar={async (motivo) => {
            await revertirEvento(revirtiendo.id, motivo);
            setRevirtiendo(null);
            await cargar();
            onAviso("Reversión registrada.", "ok");
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Ajuste manual
// ---------------------------------------------------------------------------

function DialogoAjuste({
  beneficiarios,
  onCerrar,
  onGuardar,
}: {
  beneficiarios: { id: string; nombre: string; rol: string }[];
  onCerrar: () => void;
  onGuardar: (usuarioId: string, monto: number, motivo: string, fecha?: string) => Promise<void>;
}) {
  const [usuarioId, setUsuarioId] = useState("");
  const [signo, setSigno] = useState<"+" | "-">("+");
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().substring(0, 10));
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const valor = Number(monto.replace(/,/g, ""));
  const puede = usuarioId && isFinite(valor) && valor > 0 && motivo.trim().length > 0;

  const guardar = async () => {
    if (!puede) return;
    setGuardando(true);
    setErrorMsg("");
    try {
      await onGuardar(usuarioId, signo === "-" ? -valor : valor, motivo.trim(), fecha);
    } catch (e: any) {
      setErrorMsg(e?.message || "No se pudo registrar el ajuste.");
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo="Ajuste manual"
      subtitulo="Corrige un importe sin tocar el histórico"
      icono={Plus}
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar} className={btnSecundario}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={!puede || guardando} className={btnPrimario}>
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Registrar ajuste
          </button>
        </>
      }
    >
      <Aviso tono="slate">
        Un ajuste nunca edita una comisión existente: entra como un movimiento propio, positivo o negativo, con su
        motivo. Así el total cambia y el histórico se queda intacto.
      </Aviso>

      <Campo etiqueta="Beneficiario" requerido>
        <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} className={inputBase}>
          <option value="">Selecciona a quién…</option>
          {beneficiarios.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nombre} · {b.rol}
            </option>
          ))}
        </select>
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Importe" requerido>
          <div className="flex items-stretch gap-1.5">
            <div className={segmentado}>
              <button type="button" onClick={() => setSigno("+")} className={pastilla(signo === "+")}>
                A favor
              </button>
              <button type="button" onClick={() => setSigno("-")} className={pastilla(signo === "-")}>
                En contra
              </button>
            </div>
            <input
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className={`${inputBase} text-right tabular-nums`}
            />
          </div>
        </Campo>
        <Campo etiqueta="Fecha de devengo" hint="Determina en qué corte cae.">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputBase} />
        </Campo>
      </div>

      <Campo etiqueta="Motivo" requerido hint="Finanzas lo leerá para justificar el cargo o el abono.">
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          placeholder="Ej.: descuento acordado por el retraso en la entrega del expediente"
          className={`${inputBase} resize-none`}
        />
      </Campo>

      {errorMsg && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errorMsg}</p>}
    </Modal>
  );
}
