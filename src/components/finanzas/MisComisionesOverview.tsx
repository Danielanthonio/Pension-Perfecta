"use client";

// «Mis comisiones» — lo que ve de Finanzas quien COBRA.
//
// Misma ruta que el módulo de Dirección (`/admin/finanzas`) y mismo filtro de
// período, pero otro contenido: aquí no hay libro mayor, ni cortes, ni tarifas
// de otros roles, ni un solo importe que no sea del propio usuario. El recorte
// no lo hace esta pantalla: lo hacen las RPC `mis_comisiones_*`, que filtran por
// `auth.uid()` y ni siquiera aceptan un parámetro de usuario (20260810000000).
//
// Cuatro pestañas, en el orden en que se preguntan las cosas:
//
//   Resumen      cuánto llevo y de qué se compone
//   Movimientos  peso a peso, con la operación que lo generó
//   Depósitos    qué me han pagado ya, con su referencia
//   Mis tarifas  con qué importes se me calcula
//
// El filtro de período vive en la URL igual que en la vista de Dirección, así
// que un AM puede guardarse el enlace de «mi mes anterior».

import React, { useMemo } from "react";
import {
  BarChart3,
  Coins,
  Loader2,
  Receipt,
  RefreshCw,
  Tag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { CLOSER_VIZ_STYLE } from "@/components/closers/CloserChart";
import { Aviso, Panel, Vacio, pastilla, segmentado } from "./FinanzasUI";
import { useMisComisiones } from "./useMisComisiones";
import { useMisComisionesFilters, type PestanaMisComisiones } from "./finanzasFilters";
import { MisDepositosPanel, MisMovimientosPanel, MisTarifasPanel } from "./MisComisionesPaneles";
import {
  type Grano,
  type RangoPreset,
  GRANO_LABEL,
  PRODUCTO_CORTO,
  RANGO_LABEL,
  TIPO_EVENTO_LABEL,
  bucketLabel,
  fmtFecha,
  fmtMoneda,
  fmtMonedaCorta,
  fmtNumero,
  resolveRango,
} from "./finanzasTypes";

const PRESETS: RangoPreset[] = [
  "semana_actual",
  "semana_anterior",
  "mes_actual",
  "mes_anterior",
  "trimestre_actual",
  "anio_actual",
  "todo",
];

const GRANOS: Grano[] = ["dia", "semana", "mes"];

const PESTANAS: { id: PestanaMisComisiones; label: string; Icono: typeof BarChart3 }[] = [
  { id: "resumen", label: "Resumen", Icono: BarChart3 },
  { id: "movimientos", label: "Movimientos", Icono: Coins },
  { id: "depositos", label: "Depósitos", Icono: Receipt },
  { id: "tarifas", label: "Mis tarifas", Icono: Tag },
];

export default function MisComisionesOverview() {
  const { filters, setFilters } = useMisComisionesFilters();

  const mis = useMisComisiones({
    desde: filters.desde,
    hasta: filters.hasta,
    grano: filters.grano,
    estado: filters.estado,
  });

  const periodoTexto = useMemo(() => {
    if (!filters.desde && !filters.hasta) return "Histórico completo";
    return `${fmtFecha(filters.desde)} – ${fmtFecha(filters.hasta)}`;
  }, [filters.desde, filters.hasta]);

  const r = mis.resumen;

  return (
    <div className="closers-viz space-y-5 animate-fade-in">
      <style>{CLOSER_VIZ_STYLE}</style>

      {/* ── Encabezado ────────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white flex items-center justify-center shrink-0">
              <Wallet className="h-4 w-4" strokeWidth={2.4} />
            </span>
            Mis Comisiones
          </h1>
          <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
            Lo que has generado, en qué punto va cada pago y las tarifas con las que se calcula. Solo tu información:
            esta pantalla no muestra importes de nadie más.
          </p>
        </div>
        {mis.isLocal && (
          <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
            Previsualización local
          </span>
        )}
      </header>

      {/* ── Filtro de período ─────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm shadow-slate-200/40 dark:shadow-none px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={segmentado}>
              {PRESETS.map((p) => (
                <button key={p} onClick={() => setFilters({ preset: p })} className={pastilla(filters.preset === p)}>
                  {RANGO_LABEL[p]}
                </button>
              ))}
              <button
                onClick={() => {
                  const rango = resolveRango("mes_actual", new Date());
                  setFilters({
                    preset: "personalizado",
                    desde: filters.desde || rango.desde,
                    hasta: filters.hasta || rango.hasta,
                  });
                }}
                className={pastilla(filters.preset === "personalizado")}
              >
                {RANGO_LABEL.personalizado}
              </button>
            </div>
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">{periodoTexto}</span>
          </div>

          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Total del periodo{" "}
            <strong className="text-slate-900 dark:text-white tabular-nums">{fmtMonedaCorta(r.total_generado)}</strong>
          </span>
        </div>

        {filters.preset === "personalizado" && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-end gap-3 flex-wrap">
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Desde</span>
              <input
                type="date"
                value={filters.desde}
                onChange={(e) => setFilters({ desde: e.target.value })}
                className="px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Hasta</span>
              <input
                type="date"
                value={filters.hasta}
                onChange={(e) => setFilters({ hasta: e.target.value })}
                className="px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
              />
            </label>
          </div>
        )}
      </div>

      {/* ── Tarjetas ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta
          etiqueta="Generado en el período"
          valor={fmtMoneda(r.total_generado)}
          nota={`${fmtNumero(r.eventos)} movimiento(s)`}
        />
        <Tarjeta
          etiqueta="Ya depositado"
          valor={fmtMoneda(r.total_pagado)}
          nota={r.ultimo_pago ? `Último: ${fmtFecha(r.ultimo_pago)}` : "Sin depósitos todavía"}
          tono="emerald"
        />
        <Tarjeta
          etiqueta="Por cobrar"
          valor={fmtMoneda(r.total_pendiente_pago)}
          nota={r.total_observado > 0 ? `${fmtMoneda(r.total_observado)} en revisión` : "Todo en curso"}
          tono={r.total_observado > 0 ? "amber" : "slate"}
        />
        <Tarjeta
          etiqueta="Operaciones"
          valor={fmtNumero(r.operaciones)}
          nota="Clientes y aliados que respaldan tus comisiones"
        />
      </div>

      {/* ── Pestañas ──────────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-slate-200/70 dark:border-slate-800">
        {PESTANAS.map(({ id, label, Icono }) => {
          const activa = filters.pestana === id;
          return (
            <button
              key={id}
              onClick={() => setFilters({ pestana: id })}
              className={`relative inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[12px] font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                activa
                  ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              }`}
            >
              <Icono className="h-3.5 w-3.5" strokeWidth={2.2} />
              {label}
              {id === "movimientos" && r.eventos_observados > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                  {r.eventos_observados}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Contenido ─────────────────────────────────────────────────────── */}
      {mis.error ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/40 px-6 py-10 text-center">
          <p className="text-[12px] font-bold text-rose-700 dark:text-rose-300">{mis.error}</p>
          <button
            onClick={mis.reload}
            className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold text-white bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </button>
        </div>
      ) : mis.loading ? (
        <div className="py-20 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-[12px] text-slate-400 dark:text-slate-500">Cargando tus comisiones…</p>
        </div>
      ) : (
        <>
          {filters.pestana === "resumen" && (
            <div className="space-y-4">
              {/* Lo primero que hay que entender de esta pantalla: un importe
                  pendiente de revisión todavía puede moverse. Decirlo aquí evita
                  la conversación de «tu sistema me prometió otra cosa». */}
              {r.total_pendiente_revision > 0 && (
                <Aviso tono="amber">
                  <strong>{fmtMoneda(r.total_pendiente_revision)}</strong> están pendientes de revisión por la
                  Dirección. Mientras no se aprueben, ese importe puede cambiar: aquí ves lo que el sistema ha calculado,
                  no un pago comprometido.
                </Aviso>
              )}

              <EstadoDelCobro resumen={r} />

              <Panel
                titulo="De qué se compone"
                descripcion={`Tus conceptos en ${periodoTexto.toLowerCase()}`}
                icono={Coins}
              >
                {mis.conceptos.length === 0 ? (
                  <Vacio
                    mensaje="No has devengado nada en este período."
                    hint="Cambia el rango de arriba o prueba con «Histórico»."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                          {["Concepto", "Veces", "Generado", "Cobrado"].map((h, i) => (
                            <th
                              key={h}
                              className={`px-5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 ${
                                i > 0 ? "text-right" : ""
                              }`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mis.conceptos.map((c) => (
                          <tr
                            key={`${c.tipo_evento}-${c.tipo_producto ?? ""}`}
                            className="border-b border-slate-50 dark:border-slate-800/60 last:border-0"
                          >
                            <td className="px-5 py-3">
                              <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200">
                                {TIPO_EVENTO_LABEL[c.tipo_evento] || c.tipo_evento}
                              </span>
                              {c.tipo_producto && (
                                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  {PRODUCTO_CORTO[c.tipo_producto]}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-right text-[12px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {fmtNumero(c.eventos)}
                            </td>
                            <td className="px-5 py-3 text-right text-[12px] font-bold text-slate-800 dark:text-white tabular-nums whitespace-nowrap">
                              {fmtMoneda(c.monto)}
                            </td>
                            <td className="px-5 py-3 text-right text-[12px] text-emerald-700 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                              {fmtMoneda(c.pagado)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Evolucion
                serie={mis.serie}
                grano={filters.grano}
                onCambiarGrano={(g) => setFilters({ grano: g })}
              />
            </div>
          )}

          {filters.pestana === "movimientos" && (
            <MisMovimientosPanel
              eventos={mis.eventos}
              periodoTexto={periodoTexto}
              estado={filters.estado}
              onCambiarEstado={(e) => setFilters({ estado: e })}
            />
          )}

          {filters.pestana === "depositos" && <MisDepositosPanel pagos={mis.pagos} periodoTexto={periodoTexto} />}

          {filters.pestana === "tarifas" && <MisTarifasPanel tarifas={mis.tarifas} />}
        </>
      )}

      <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
        Si algo no cuadra, escríbele a la Dirección con la fecha y el cliente del movimiento: cada importe de esta
        pantalla sale de un evento con su operación de origen, así que siempre se puede rastrear.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Piezas locales
// ---------------------------------------------------------------------------

function Tarjeta({
  etiqueta,
  valor,
  nota,
  tono = "slate",
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  tono?: "slate" | "emerald" | "amber";
}) {
  const color = {
    slate: "text-slate-900 dark:text-white",
    emerald: "text-emerald-700 dark:text-emerald-400",
    amber: "text-amber-700 dark:text-amber-400",
  }[tono];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm shadow-slate-200/40 dark:shadow-none px-4 py-3.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{etiqueta}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums leading-tight ${color}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500 leading-snug">{nota}</p>}
    </div>
  );
}

/**
 * En qué punto del circuito está cada peso. Es la pregunta que de verdad trae a
 * un AM a esta pantalla —«¿por qué no me han pagado?»— y se responde con la
 * barra: lo que falta no es un misterio, es una etapa concreta.
 */
function EstadoDelCobro({ resumen }: { resumen: ReturnType<typeof useMisComisiones>["resumen"] }) {
  const tramos = [
    { clave: "pagado", label: "Depositado", monto: resumen.total_pagado, barra: "bg-emerald-500", texto: "text-emerald-700 dark:text-emerald-400" },
    { clave: "enviado", label: "En Finanzas", monto: resumen.total_enviado_finanzas, barra: "bg-indigo-500", texto: "text-indigo-700 dark:text-indigo-400" },
    { clave: "aprobado", label: "Aprobado", monto: resumen.total_aprobado, barra: "bg-blue-500", texto: "text-blue-700 dark:text-blue-400" },
    { clave: "pendiente", label: "Por revisar", monto: resumen.total_pendiente_revision, barra: "bg-slate-400", texto: "text-slate-600 dark:text-slate-300" },
    { clave: "observado", label: "Observado", monto: resumen.total_observado, barra: "bg-amber-500", texto: "text-amber-700 dark:text-amber-400" },
  ];
  const total = resumen.total_generado;

  return (
    <Panel
      titulo="Cómo va tu cobro"
      descripcion="El camino de una comisión: se revisa, se aprueba, se manda a Finanzas y se deposita"
      icono={TrendingUp}
    >
      <div className="px-5 py-4">
        {total <= 0 ? (
          <p className="text-[12px] text-slate-400 dark:text-slate-500">
            Sin importes en este período: no hay nada que seguir.
          </p>
        ) : (
          <>
            <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
              {tramos
                .filter((t) => t.monto > 0)
                .map((t) => (
                  <div
                    key={t.clave}
                    className={t.barra}
                    style={{ width: `${(t.monto / total) * 100}%` }}
                    title={`${t.label}: ${fmtMoneda(t.monto)}`}
                  />
                ))}
            </div>
            <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {tramos.map((t) => (
                <div key={t.clave} className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${t.barra}`} />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 truncate">
                      {t.label}
                    </span>
                  </div>
                  <p className={`mt-0.5 text-[12px] font-bold tabular-nums ${t.texto}`}>{fmtMoneda(t.monto)}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

/**
 * Evolución del período, en barras horizontales.
 *
 * A propósito con `div`s y no con el SVG de los otros gráficos del módulo: aquí
 * hay una sola serie y un puñado de barras, y una tabla con barra se lee igual
 * de bien sin arrastrar el aparato de ejes, tooltips y leyenda.
 */
function Evolucion({
  serie,
  grano,
  onCambiarGrano,
}: {
  serie: { periodo: string; generado: number; pagado: number; pendiente: number }[];
  grano: Grano;
  onCambiarGrano: (g: Grano) => void;
}) {
  const maximo = Math.max(1, ...serie.map((s) => s.generado));

  return (
    <Panel
      titulo="Tu evolución"
      descripcion="Cuánto generaste en cada tramo del período"
      icono={BarChart3}
      acciones={
        <div className={segmentado}>
          {GRANOS.map((g) => (
            <button key={g} onClick={() => onCambiarGrano(g)} className={pastilla(grano === g)}>
              {GRANO_LABEL[g]}
            </button>
          ))}
        </div>
      }
    >
      {serie.length === 0 ? (
        <Vacio mensaje="Nada que dibujar en este período." />
      ) : (
        <div className="px-5 py-4 space-y-2.5">
          {serie.map((s) => (
            <div key={s.periodo} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-[10px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">
                {bucketLabel(s.periodo, grano)}
              </span>
              <div className="flex-1 h-4 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                {/* Dentro de cada barra, la parte ya cobrada va sólida y lo que
                    falta va translúcido: una sola barra dice las dos cosas. */}
                <div
                  className="bg-emerald-500 h-full"
                  style={{ width: `${(s.pagado / maximo) * 100}%` }}
                  title={`Cobrado: ${fmtMoneda(s.pagado)}`}
                />
                <div
                  className="bg-emerald-500/35 h-full"
                  style={{ width: `${(s.pendiente / maximo) * 100}%` }}
                  title={`Por cobrar: ${fmtMoneda(s.pendiente)}`}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-[11px] font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                {fmtMonedaCorta(s.generado)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
