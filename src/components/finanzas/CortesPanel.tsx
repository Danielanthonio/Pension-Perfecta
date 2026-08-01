"use client";

// Pestaña "Cortes y pagos": el ciclo completo del §6.3 al §6.5 y del §11 al §15.
//
//   Generar corte → Aprobar → Enviar a Finanzas → Registrar depósitos
//
// Cada paso es irreversible hacia atrás una vez que hay dinero de por medio: un
// corte con depósitos ya no se puede anular, y una comisión pagada queda
// bloqueada. Las correcciones viajan siempre por ajuste o reversión.

import React, { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CalendarRange,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Receipt,
  Send,
  Trash2,
} from "lucide-react";
import {
  Aviso,
  Campo,
  DialogoMotivo,
  EstadoChip,
  Modal,
  Panel,
  Vacio,
  btnPeligro,
  btnPrimario,
  btnSecundario,
  inputBase,
  pastilla,
  segmentado,
} from "./FinanzasUI";
import { exportarCsv, exportarExcel, exportarPdf, filasPagos, filasReporteFinanzas } from "./finanzasExport";
import {
  type CorteRow,
  type EventoRow,
  type LiquidacionRow,
  type MetodoPago,
  type PagoRow,
  type TipoCorte,
  METODO_PAGO_LABEL,
  ROL_LABEL,
  datosDeCobro,
  fmtFecha,
  fmtFechaHora,
  fmtMoneda,
  fmtNumero,
  medioDeCobro,
} from "./finanzasTypes";

const TIPOS: TipoCorte[] = ["semanal", "mensual", "trimestral", "personalizado"];
const TIPO_LABEL: Record<TipoCorte, string> = {
  semanal: "Semanal",
  mensual: "Mensual",
  trimestral: "Trimestral",
  personalizado: "Personalizado",
};

export function CortesPanel({
  cortes,
  desde,
  hasta,
  tipoSugerido,
  corteAbierto,
  onAbrirCorte,
  generarCorte,
  accionCorte,
  registrarPago,
  fetchEventos,
  fetchPagos,
  onAviso,
}: {
  cortes: CorteRow[];
  desde: string;
  hasta: string;
  tipoSugerido: TipoCorte;
  corteAbierto: string | null;
  onAbrirCorte: (id: string | null) => void;
  generarCorte: (tipo: TipoCorte, desde: string, hasta: string, obs?: string) => Promise<string>;
  accionCorte: (id: string, accion: "aprobar" | "enviar" | "anular", motivo?: string) => Promise<void>;
  registrarPago: (args: {
    corteId: string;
    usuarioId: string;
    monto: number;
    fecha: string;
    metodo: MetodoPago;
    referencia?: string;
    comprobanteUrl?: string;
    observaciones?: string;
  }) => Promise<void>;
  fetchEventos: (f: { corteId?: string | null; desde?: string; hasta?: string; limite?: number }) => Promise<EventoRow[]>;
  fetchPagos: (corteId?: string, usuarioId?: string) => Promise<PagoRow[]>;
  onAviso: (mensaje: string, tono: "ok" | "error") => void;
}) {
  const [generando, setGenerando] = useState(false);
  const [anulando, setAnulando] = useState<CorteRow | null>(null);

  const abierto = useMemo(() => cortes.find((c) => c.id === corteAbierto) || null, [cortes, corteAbierto]);

  return (
    <div className="space-y-5">
      <Panel
        titulo="Cortes de pago"
        descripcion="Las comisiones se cortan de lunes a domingo; los salarios y bonos, al cierre de mes y de trimestre."
        icono={CalendarRange}
        acciones={
          <button onClick={() => setGenerando(true)} className={btnPrimario}>
            <Plus className="h-3.5 w-3.5" /> Generar corte
          </button>
        }
      >
        {cortes.length === 0 ? (
          <Vacio
            mensaje="Todavía no se ha generado ningún corte."
            hint="Un corte congela qué comisiones entran y cuánto suman; a partir de ahí los totales ya no se recalculan."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/30">
                  {["Periodo", "Tipo", "Personas", "Comisiones", "Bonos", "Salarios", "Ajustes", "Total", "Pagado", "Estado", ""].map(
                    (h, i) => (
                      <th
                        key={h || i}
                        className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500 ${
                          i >= 2 && i <= 8 ? "text-right" : ""
                        }`}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {cortes.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => onAbrirCorte(c.id)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                        {fmtFecha(c.fecha_inicio)} – {fmtFecha(c.fecha_fin)}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">
                        {c.id.substring(0, 8).toUpperCase()} · {fmtNumero(c.eventos)} movimientos
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {TIPO_LABEL[c.tipo_corte]}
                    </td>
                    <td className="px-4 py-3 text-right text-[12px] tabular-nums text-slate-600 dark:text-slate-300">
                      {fmtNumero(c.beneficiarios)}
                    </td>
                    <td className="px-4 py-3 text-right text-[12px] tabular-nums text-slate-600 dark:text-slate-300">
                      {fmtMoneda(c.total_comisiones)}
                    </td>
                    <td className="px-4 py-3 text-right text-[12px] tabular-nums text-slate-600 dark:text-slate-300">
                      {c.total_bonos ? fmtMoneda(c.total_bonos) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-[12px] tabular-nums text-slate-600 dark:text-slate-300">
                      {c.total_salarios ? fmtMoneda(c.total_salarios) : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right text-[12px] tabular-nums ${
                        c.total_ajustes < 0 ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {c.total_ajustes ? fmtMoneda(c.total_ajustes) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-bold tabular-nums text-slate-900 dark:text-white">
                      {fmtMoneda(c.total_a_pagar)}
                    </td>
                    <td className="px-4 py-3 text-right text-[12px] tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                      {c.total_pagado ? fmtMoneda(c.total_pagado) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoChip estado={c.estado} corte />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {["borrador", "en_revision", "aprobado", "enviado_finanzas"].includes(c.estado) && (
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setAnulando(c);
                          }}
                          title="Anular el corte"
                          className="p-1 rounded-md text-slate-300 hover:text-rose-600 dark:text-slate-600 dark:hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {generando && (
        <DialogoGenerarCorte
          desdeSugerido={desde}
          hastaSugerido={hasta}
          tipoSugerido={tipoSugerido}
          onCerrar={() => setGenerando(false)}
          onGenerar={async (tipo, d, h, obs) => {
            const id = await generarCorte(tipo, d, h, obs);
            setGenerando(false);
            onAviso("Corte generado. Revísalo y apruébalo antes de enviarlo a Finanzas.", "ok");
            if (id) onAbrirCorte(id);
          }}
        />
      )}

      {abierto && (
        <DetalleCorte
          corte={abierto}
          onCerrar={() => onAbrirCorte(null)}
          accionCorte={accionCorte}
          registrarPago={registrarPago}
          fetchEventos={fetchEventos}
          fetchPagos={fetchPagos}
          onAviso={onAviso}
        />
      )}

      {anulando && (
        <DialogoMotivo
          titulo="Anular corte"
          subtitulo={`${fmtFecha(anulando.fecha_inicio)} – ${fmtFecha(anulando.fecha_fin)}`}
          peligro
          descripcion="Las comisiones vuelven al pool como pendientes de revisión y podrás rehacer el corte. El corte anulado se conserva en el histórico."
          etiquetaBoton="Anular corte"
          placeholder="Ej.: faltaba incluir los financiamientos del viernes"
          onCerrar={() => setAnulando(null)}
          onConfirmar={async (motivo) => {
            await accionCorte(anulando.id, "anular", motivo);
            setAnulando(null);
            onAviso("Corte anulado. Sus comisiones volvieron a estar disponibles.", "ok");
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generar corte
// ---------------------------------------------------------------------------

function DialogoGenerarCorte({
  desdeSugerido,
  hastaSugerido,
  tipoSugerido,
  onCerrar,
  onGenerar,
}: {
  desdeSugerido: string;
  hastaSugerido: string;
  tipoSugerido: TipoCorte;
  onCerrar: () => void;
  onGenerar: (tipo: TipoCorte, desde: string, hasta: string, obs?: string) => Promise<void>;
}) {
  const [tipo, setTipo] = useState<TipoCorte>(tipoSugerido);
  const [d, setD] = useState(desdeSugerido);
  const [h, setH] = useState(hastaSugerido);
  const [obs, setObs] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const puede = !!d && !!h && h >= d;

  const generar = async () => {
    if (!puede) return;
    setGuardando(true);
    setErrorMsg("");
    try {
      await onGenerar(tipo, d, h, obs.trim() || undefined);
    } catch (e: any) {
      setErrorMsg(e?.message || "No se pudo generar el corte.");
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo="Generar corte"
      subtitulo="Congela qué comisiones entran y cuánto suman"
      icono={CalendarRange}
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar} className={btnSecundario}>
            Cancelar
          </button>
          <button onClick={generar} disabled={!puede || guardando} className={btnPrimario}>
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Generar
          </button>
        </>
      }
    >
      <Aviso tono="slate">
        Entran las comisiones del período que todavía no pertenecen a ningún corte. Las <strong>observadas</strong> se
        quedan fuera a propósito: primero hay que resolver su inconsistencia. Después de generarlo, los totales del
        corte ya no se recalculan solos.
      </Aviso>

      <Campo etiqueta="Tipo de corte">
        <div className={segmentado}>
          {TIPOS.map((t) => (
            <button key={t} type="button" onClick={() => setTipo(t)} className={pastilla(tipo === t)}>
              {TIPO_LABEL[t]}
            </button>
          ))}
        </div>
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Desde" requerido>
          <input type="date" value={d} onChange={(e) => setD(e.target.value)} className={inputBase} />
        </Campo>
        <Campo etiqueta="Hasta" requerido>
          <input type="date" value={h} onChange={(e) => setH(e.target.value)} className={inputBase} />
        </Campo>
      </div>

      <Campo etiqueta="Nota interna" hint="Opcional. Queda visible en el corte y en la bitácora.">
        <textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          rows={2}
          placeholder="Ej.: corte semanal ordinario"
          className={`${inputBase} resize-none`}
        />
      </Campo>

      {errorMsg && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errorMsg}</p>}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Detalle del corte: aprobar, enviar y registrar depósitos
// ---------------------------------------------------------------------------

function DetalleCorte({
  corte,
  onCerrar,
  accionCorte,
  registrarPago,
  fetchEventos,
  fetchPagos,
  onAviso,
}: {
  corte: CorteRow;
  onCerrar: () => void;
  accionCorte: (id: string, accion: "aprobar" | "enviar" | "anular", motivo?: string) => Promise<void>;
  registrarPago: (args: {
    corteId: string;
    usuarioId: string;
    monto: number;
    fecha: string;
    metodo: MetodoPago;
    referencia?: string;
    comprobanteUrl?: string;
    observaciones?: string;
  }) => Promise<void>;
  fetchEventos: (f: { corteId?: string | null; limite?: number }) => Promise<EventoRow[]>;
  fetchPagos: (corteId?: string, usuarioId?: string) => Promise<PagoRow[]>;
  onAviso: (mensaje: string, tono: "ok" | "error") => void;
}) {
  const [eventos, setEventos] = useState<EventoRow[]>([]);
  const [pagos, setPagos] = useState<PagoRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [pagando, setPagando] = useState<{ usuarioId: string; nombre: string; rol: string; saldo: number } | null>(null);

  const cargar = React.useCallback(async () => {
    setCargando(true);
    try {
      const [evs, pgs] = await Promise.all([fetchEventos({ corteId: corte.id, limite: 2000 }), fetchPagos(corte.id)]);
      setEventos(evs);
      setPagos(pgs);
    } catch {
      onAviso("No se pudo cargar el detalle del corte.", "error");
    } finally {
      setCargando(false);
    }
  }, [fetchEventos, fetchPagos, corte.id, onAviso]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Una fila por beneficiario dentro del corte, con lo depositado y su saldo.
  const beneficiarios = useMemo<(LiquidacionRow & { saldo: number })[]>(() => {
    const mapa = new Map<string, LiquidacionRow & { saldo: number }>();
    for (const e of eventos) {
      if (e.estado === "revertido") continue;
      const prev =
        mapa.get(e.usuario_id) ||
        ({
          usuario_id: e.usuario_id,
          usuario_nombre: e.usuario_nombre,
          rol_beneficiario: e.rol_beneficiario,
          avatar_url: null,
          produccion: 0,
          comision_base: 0,
          bonos: 0,
          salario: 0,
          ajustes: 0,
          total_a_pagar: 0,
          total_pagado: 0,
          total_pendiente: 0,
          eventos: 0,
          eventos_observados: 0,
          estado_resumen: "pendiente_revision",
          fecha_envio: null,
          fecha_pago: null,
          clabe: null,
          banco: null,
          titular_cuenta: null,
          binance_id: null,
          saldo: 0,
        } as LiquidacionRow & { saldo: number });

      if (e.tipo_evento.startsWith("comision_")) prev.comision_base += e.monto;
      else if (e.tipo_evento.startsWith("bono_")) prev.bonos += e.monto;
      else if (e.tipo_evento === "salario_fijo") prev.salario += e.monto;
      else prev.ajustes += e.monto;

      prev.total_a_pagar += e.monto;
      prev.eventos += 1;
      if (e.estado === "pagado") prev.total_pagado += e.monto;
      mapa.set(e.usuario_id, prev);
    }

    for (const fila of mapa.values()) {
      const depositado = pagos.filter((p) => p.usuario_id === fila.usuario_id).reduce((s, p) => s + p.monto_pagado, 0);
      fila.total_pagado = depositado;
      fila.saldo = fila.total_a_pagar - depositado;
      fila.estado_resumen = fila.saldo <= 0 && fila.total_a_pagar > 0 ? "pagado" : (corte.estado === "enviado_finanzas" ? "enviado_finanzas" : "aprobado");
    }

    return [...mapa.values()].sort((a, b) => b.total_a_pagar - a.total_a_pagar);
  }, [eventos, pagos, corte.estado]);

  const puedeAprobar = ["borrador", "en_revision"].includes(corte.estado);
  const puedeEnviar = corte.estado === "aprobado";
  const puedePagar = ["aprobado", "enviado_finanzas", "pagado_parcial"].includes(corte.estado);
  const observadas = eventos.filter((e) => e.estado === "observado").length;

  // Los totales del corte se congelan al generarlo y NO se recalculan solos: el
  // §6.3 prohíbe que un importe cambie en silencio después de la revisión. Pero
  // una reversión posterior sí puede sacar comisiones de dentro, y entonces el
  // total congelado deja de cuadrar con lo que hay. En vez de recalcular por
  // detrás —que sería justo lo prohibido— se avisa, y la Dirección decide si
  // rehace el corte.
  const totalVivo = useMemo(
    () => eventos.filter((e) => e.estado !== "revertido" && !e.anulado_at).reduce((s, e) => s + e.monto, 0),
    [eventos]
  );
  const desfase = totalVivo - corte.total_a_pagar;
  const hayDesfase = !cargando && Math.abs(desfase) > 0.005;

  const periodo = `${fmtFecha(corte.fecha_inicio)} – ${fmtFecha(corte.fecha_fin)}`;

  const exportarReporte = (formato: "csv" | "excel" | "pdf") => {
    const datos = filasReporteFinanzas(corte, beneficiarios);
    const nombre = `reporte-finanzas-${corte.fecha_inicio}`;
    if (formato === "csv") exportarCsv(nombre, datos);
    else if (formato === "excel") exportarExcel(nombre, `Reporte para Finanzas · ${periodo}`, datos);
    else if (
      !exportarPdf(
        "Reporte de comisiones para Finanzas",
        `Corte ${corte.id.substring(0, 8).toUpperCase()} · ${periodo} · Total ${fmtMoneda(corte.total_a_pagar)}`,
        datos,
        `Estado del corte: ${corte.estado}. `
      )
    ) {
      onAviso("El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para exportar a PDF.", "error");
    }
  };

  const ejecutar = async (accion: "aprobar" | "enviar") => {
    setTrabajando(true);
    try {
      await accionCorte(corte.id, accion);
      await cargar();
      onAviso(
        accion === "aprobar"
          ? "Corte aprobado. Ya se puede enviar a Finanzas."
          : "Corte enviado a Finanzas. Descarga el reporte para hacérselo llegar.",
        "ok"
      );
    } catch (e: any) {
      onAviso(e?.message || "No se pudo completar la operación.", "error");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <>
      <Modal
        titulo={`Corte ${corte.id.substring(0, 8).toUpperCase()}`}
        subtitulo={`${TIPO_LABEL[corte.tipo_corte]} · ${periodo}`}
        icono={Receipt}
        ancho="max-w-5xl"
        onCerrar={onCerrar}
        pie={
          <>
            <div className={segmentado}>
              <button onClick={() => exportarReporte("csv")} className={pastilla(false)} title="Reporte CSV">
                <Download className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => exportarReporte("excel")} className={pastilla(false)} title="Reporte Excel">
                <FileSpreadsheet className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => exportarReporte("pdf")} className={pastilla(false)} title="Reporte PDF">
                <FileText className="h-3.5 w-3.5" />
              </button>
            </div>
            <span className="flex-1" />
            {puedeAprobar && (
              <button onClick={() => ejecutar("aprobar")} disabled={trabajando} className={btnPrimario}>
                {trabajando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Aprobar corte
              </button>
            )}
            {puedeEnviar && (
              <button onClick={() => ejecutar("enviar")} disabled={trabajando} className={btnPrimario}>
                {trabajando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Enviar a Finanzas
              </button>
            )}
            <button onClick={onCerrar} className={btnSecundario}>
              Cerrar
            </button>
          </>
        }
      >
        {/* Estado y totales */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <EstadoChip estado={corte.estado} corte />
          <div className="flex items-center gap-4 text-[10px] text-slate-400 dark:text-slate-500">
            {corte.aprobado_por_nombre && (
              <span>
                Aprobó <strong className="text-slate-600 dark:text-slate-300">{corte.aprobado_por_nombre}</strong> ·{" "}
                {fmtFechaHora(corte.fecha_aprobacion)}
              </span>
            )}
            {corte.enviado_por_nombre && (
              <span>
                Envió <strong className="text-slate-600 dark:text-slate-300">{corte.enviado_por_nombre}</strong> ·{" "}
                {fmtFechaHora(corte.fecha_envio_finanzas)}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { t: "Comisiones", v: corte.total_comisiones },
            { t: "Bonos", v: corte.total_bonos },
            { t: "Salarios", v: corte.total_salarios },
            { t: "Ajustes", v: corte.total_ajustes },
            { t: "Total a pagar", v: corte.total_a_pagar },
          ].map((x, i) => (
            <div
              key={x.t}
              className={`rounded-xl border px-3 py-2.5 ${
                i === 4
                  ? "border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20"
                  : "border-slate-200/70 dark:border-slate-800"
              }`}
            >
              <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">{x.t}</p>
              <p
                className={`mt-0.5 text-[14px] font-bold tabular-nums ${
                  i === 4 ? "text-emerald-700 dark:text-emerald-400" : "text-slate-800 dark:text-slate-100"
                }`}
              >
                {fmtMoneda(x.v)}
              </p>
            </div>
          ))}
        </div>

        {observadas > 0 && (
          <Aviso>
            Este corte contiene {observadas} comisión(es) observada(s). No se puede aprobar hasta resolverlas o sacarlas
            del corte.
          </Aviso>
        )}

        {hayDesfase && (
          <Aviso tono="rose">
            El total congelado de este corte ({fmtMoneda(corte.total_a_pagar)}) ya no coincide con sus comisiones vivas
            ({fmtMoneda(totalVivo)}, {desfase > 0 ? "+" : ""}
            {fmtMoneda(desfase)}). Alguna se revirtió después de generarlo. Los totales no se recalculan solos a
            propósito;{" "}
            {["pagado", "pagado_parcial"].includes(corte.estado)
              ? "como ya hay depósitos registrados, la diferencia debe corregirse con un ajuste en el corte siguiente."
              : "anula este corte y vuelve a generarlo para que cuadre."}
          </Aviso>
        )}

        {!puedePagar && corte.estado !== "anulado" && (
          <Aviso tono="slate">
            Los depósitos solo se pueden registrar después de aprobar el corte. Es la validación del §18: nada se marca
            como pagado sin aprobación previa.
          </Aviso>
        )}

        {/* Beneficiarios del corte */}
        {cargando ? (
          <div className="py-10 text-center text-[12px] text-slate-400">Cargando el detalle del corte…</div>
        ) : (
          <div className="rounded-xl border border-slate-200/70 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/30">
                    {["Beneficiario", "Rol", "Movimientos", "Total", "Depositado", "Saldo", ""].map((h, i) => (
                      <th
                        key={h || i}
                        className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500 ${
                          i >= 2 && i <= 5 ? "text-right" : ""
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {beneficiarios.map((b) => {
                    const cobro = datosDeCobro(b);
                    return (
                      <tr key={b.usuario_id}>
                        <td className="px-4 py-2.5">
                          <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100">{b.usuario_nombre}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            {cobro.valor ? `${cobro.etiqueta} ${cobro.valor}` : `Sin ${cobro.etiqueta}`}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {ROL_LABEL[b.rol_beneficiario]}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[12px] tabular-nums text-slate-600 dark:text-slate-300">
                          {fmtNumero(b.eventos)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[12px] font-bold tabular-nums text-slate-900 dark:text-white">
                          {fmtMoneda(b.total_a_pagar)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[12px] tabular-nums text-emerald-600 dark:text-emerald-400">
                          {b.total_pagado ? fmtMoneda(b.total_pagado) : "—"}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right text-[12px] font-semibold tabular-nums ${
                            b.saldo <= 0 ? "text-slate-300 dark:text-slate-600" : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {fmtMoneda(b.saldo)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {puedePagar && b.saldo > 0 && (
                            <button
                              onClick={() =>
                                setPagando({
                                  usuarioId: b.usuario_id,
                                  nombre: b.usuario_nombre,
                                  rol: b.rol_beneficiario,
                                  saldo: b.saldo,
                                })
                              }
                              className={btnSecundario}
                            >
                              <Banknote className="h-3.5 w-3.5" /> Depósito
                            </button>
                          )}
                          {b.saldo <= 0 && b.total_a_pagar > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Pagado
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Depósitos registrados */}
        {pagos.length > 0 && (
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Depósitos registrados
              </h4>
              <button onClick={() => exportarCsv(`pagos-${corte.fecha_inicio}`, filasPagos(pagos))} className={pastilla(false)}>
                <Download className="h-3.5 w-3.5" /> Exportar
              </button>
            </div>
            <ul className="rounded-xl border border-slate-200/70 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {pagos.map((p) => (
                <li key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{p.usuario_nombre}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      {fmtFecha(p.fecha_pago)} · {METODO_PAGO_LABEL[p.metodo_pago]}
                      {p.referencia_bancaria ? ` · Folio ${p.referencia_bancaria}` : ""}
                      {p.registrado_por_nombre ? ` · Registró ${p.registrado_por_nombre}` : ""}
                    </p>
                  </div>
                  <span className="text-[12px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {fmtMoneda(p.monto_pagado)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>

      {pagando && (
        <DialogoPago
          corteId={corte.id}
          beneficiario={pagando}
          onCerrar={() => setPagando(null)}
          onRegistrar={async (args) => {
            await registrarPago(args);
            setPagando(null);
            await cargar();
            onAviso("Depósito registrado. Al cubrirse el saldo, las comisiones de esa persona quedan bloqueadas.", "ok");
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// §6.5 · Confirmación manual del depósito
// ---------------------------------------------------------------------------

function DialogoPago({
  corteId,
  beneficiario,
  onCerrar,
  onRegistrar,
}: {
  corteId: string;
  beneficiario: { usuarioId: string; nombre: string; rol: string; saldo: number };
  onCerrar: () => void;
  onRegistrar: (args: {
    corteId: string;
    usuarioId: string;
    monto: number;
    fecha: string;
    metodo: MetodoPago;
    referencia?: string;
    comprobanteUrl?: string;
    observaciones?: string;
  }) => Promise<void>;
}) {
  const [monto, setMonto] = useState(beneficiario.saldo.toFixed(2));
  const [fecha, setFecha] = useState(new Date().toISOString().substring(0, 10));
  // Se propone el medio que corresponde al rol: el aliado cobra por
  // transferencia y la Dirección y los AM por Binance (20260731000000).
  const [metodo, setMetodo] = useState<MetodoPago>(medioDeCobro(beneficiario.rol as any));
  const [referencia, setReferencia] = useState("");
  const [comprobante, setComprobante] = useState("");
  const [obs, setObs] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const valor = Number(monto.replace(/,/g, ""));
  const excede = isFinite(valor) && valor > beneficiario.saldo + 0.001;
  const puede = isFinite(valor) && valor > 0 && !excede && !!fecha;

  const registrar = async () => {
    if (!puede) return;
    setGuardando(true);
    setErrorMsg("");
    try {
      await onRegistrar({
        corteId,
        usuarioId: beneficiario.usuarioId,
        monto: valor,
        fecha,
        metodo,
        referencia: referencia.trim() || undefined,
        comprobanteUrl: comprobante.trim() || undefined,
        observaciones: obs.trim() || undefined,
      });
    } catch (e: any) {
      setErrorMsg(e?.message || "No se pudo registrar el depósito.");
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo="Confirmar depósito"
      subtitulo={`${beneficiario.nombre} · saldo ${fmtMoneda(beneficiario.saldo)}`}
      icono={Banknote}
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar} className={btnSecundario}>
            Cancelar
          </button>
          <button onClick={registrar} disabled={!puede || guardando} className={btnPrimario}>
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Marcar como pagado
          </button>
        </>
      }
    >
      <Aviso>
        Una vez cubierto el saldo, las comisiones de esta persona en el corte quedan <strong>bloqueadas</strong>: ya no
        se pueden editar. Cualquier corrección posterior tendrá que hacerse con un ajuste o una reversión.
      </Aviso>

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Importe depositado" requerido hint={`Máximo ${fmtMoneda(beneficiario.saldo)}`}>
          <input
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
            className={`${inputBase} text-right tabular-nums`}
          />
        </Campo>
        <Campo etiqueta="Fecha de pago" requerido>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputBase} />
        </Campo>
      </div>

      {excede && (
        <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
          El importe supera el saldo pendiente de esta persona en el corte.
        </p>
      )}

      <Campo etiqueta="Método de pago" requerido>
        <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)} className={inputBase}>
          {(Object.keys(METODO_PAGO_LABEL) as MetodoPago[]).map((m) => (
            <option key={m} value={m}>
              {METODO_PAGO_LABEL[m]}
            </option>
          ))}
        </select>
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Referencia o folio" hint="Opcional. El folio bancario del SPEI o de Binance.">
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className={inputBase} />
        </Campo>
        <Campo etiqueta="Comprobante (enlace)" hint="Opcional. Enlace al comprobante en Drive.">
          <input
            value={comprobante}
            onChange={(e) => setComprobante(e.target.value)}
            placeholder="https://…"
            className={inputBase}
          />
        </Campo>
      </div>

      <Campo etiqueta="Observación" hint="Opcional.">
        <textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          rows={2}
          className={`${inputBase} resize-none`}
        />
      </Campo>

      {errorMsg && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errorMsg}</p>}
    </Modal>
  );
}
