"use client";

// Módulo de Finanzas y Comisiones — pantalla principal.
//
// Seis pestañas que recorren el ciclo completo del brief:
//
//   Resumen       §8   qué se generó y qué falta por pagar
//   Liquidaciones §9   quién cobra cuánto, y por qué (§10)
//   Cortes        §11  generar → aprobar → enviar a Finanzas → depositar
//   Producción    §8.4 los hechos comerciales que sostienen los importes
//   Tarifas       §16  los montos, versionados por vigencia
//   Bitácora      §20  quién hizo cada cosa
//
// El filtro de período es común a todas y vive en la URL, así que la Dirección
// puede compartir el enlace exacto de lo que está mirando.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  History,
  Loader2,
  RefreshCw,
  Tag,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useApp } from "@/utils/context/AppContext";
import { CLOSER_VIZ_STYLE } from "@/components/closers/CloserChart";
import { Notificacion, pastilla, segmentado } from "./FinanzasUI";
import { useFinanzas } from "./useFinanzas";
import { useFinanzasFilters, type PestanaFinanzas } from "./finanzasFilters";
import { ResumenPanel, type VistaGrafico } from "./ResumenPanel";
import { LiquidacionesPanel } from "./LiquidacionesPanel";
import { CortesPanel } from "./CortesPanel";
import { ProduccionPanel } from "./ProduccionPanel";
import { TarifasPanel } from "./TarifasPanel";
import { BitacoraPanel } from "./BitacoraPanel";
import {
  type RangoPreset,
  RANGO_LABEL,
  ROL_LABEL,
  fmtFecha,
  fmtMonedaCorta,
  resolveRango,
  tipoCorteDePreset,
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

const PESTANAS: { id: PestanaFinanzas; label: string; Icono: typeof BarChart3 }[] = [
  { id: "resumen", label: "Resumen", Icono: BarChart3 },
  { id: "liquidaciones", label: "Liquidaciones", Icono: Users },
  { id: "cortes", label: "Cortes y pagos", Icono: CalendarRange },
  { id: "produccion", label: "Producción", Icono: TrendingUp },
  { id: "tarifas", label: "Tarifas", Icono: Tag },
  { id: "bitacora", label: "Bitácora", Icono: History },
];

export default function FinanzasOverview() {
  const { profiles } = useApp();
  const { filters, setFilters } = useFinanzasFilters();
  const [vistaGrafico, setVistaGrafico] = useState<VistaGrafico>("rol");
  const [seriesOcultas, setSeriesOcultas] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState<{ mensaje: string; tono: "ok" | "error" } | null>(null);
  const [rangoAbierto, setRangoAbierto] = useState(filters.preset === "personalizado");

  const fin = useFinanzas({
    desde: filters.desde,
    hasta: filters.hasta,
    grano: filters.grano,
    rol: filters.rol,
    estado: filters.estado,
    dimension: filters.dimension,
  });

  const notificar = useCallback((mensaje: string, tono: "ok" | "error") => setAviso({ mensaje, tono }), []);

  // Al entrar al módulo se reconcilia el devengo una vez. Es lo que hace que
  // para el usuario funcione "solo": abre Finanzas y las comisiones de los
  // financiamientos cerrados desde la última visita ya están ahí. Se dispara una
  // sola vez por montaje, no en cada cambio de filtro (sería recalcular de más).
  const [sincronizado, setSincronizado] = useState(false);
  useEffect(() => {
    // Sin acceso no se dispara: la RPC lo rechazaría igual, pero avisar de un
    // error a quien no debería estar aquí solo genera ruido.
    if (sincronizado || fin.loading || fin.autorizado !== true) return;
    setSincronizado(true);
    fin
      .sincronizar()
      .then((m) => {
        // Solo se avisa si de verdad cambió algo: un "todo al día" cada vez que
        // se entra es ruido.
        if (!m.startsWith("Todo estaba al día")) notificar(m, "ok");
      })
      .catch((e) => notificar(e?.message || "No se pudo recalcular el devengo.", "error"));
  }, [sincronizado, fin, notificar]);

  const periodoTexto = useMemo(() => {
    if (!filters.desde && !filters.hasta) return "Histórico completo";
    return `${fmtFecha(filters.desde)} – ${fmtFecha(filters.hasta)}`;
  }, [filters.desde, filters.hasta]);

  // Quién puede recibir un ajuste manual: cualquiera que cobre en el sistema.
  const beneficiarios = useMemo(
    () =>
      profiles
        .filter((p) => ["director", "account_manager", "closer", "aliado"].includes(p.role))
        .map((p) => ({
          id: p.id,
          nombre: p.full_name,
          rol: ROL_LABEL[(p.role === "director" ? "director" : p.role) as keyof typeof ROL_LABEL] || p.role,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [profiles]
  );

  // Cuentas que pueden ser el beneficiario de las comisiones de Dirección.
  const directores = useMemo(
    () =>
      profiles
        .filter((p) => p.role === "director")
        .map((p) => ({ id: p.id, nombre: p.full_name }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [profiles]
  );

  const toggleSerie = (id: string) => {
    const s = new Set(seriesOcultas);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSeriesOcultas(s);
  };

  const recalcular = async () => {
    try {
      notificar(await fin.sincronizar(), "ok");
    } catch (e: any) {
      notificar(e?.message || "No se pudo recalcular el devengo.", "error");
    }
  };

  // Tener rol de dirección ya no basta: hay que estar en la lista de acceso del
  // módulo (20260802000003). El libro mayor expone los sueldos y los datos
  // bancarios de todo el equipo, así que se cierra por lista, no por rol.
  if (fin.autorizado === false) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm px-6 py-14 text-center">
        <span className="mx-auto mb-3 h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
          <Wallet className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          No tienes acceso al módulo de Finanzas y Comisiones.
        </p>
        <p className="mt-1.5 text-[12px] text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
          Este módulo contiene los sueldos y los datos bancarios de todo el equipo, así que el acceso se concede cuenta
          por cuenta. Si necesitas consultarlo, pídeselo a la Dirección.
        </p>
      </div>
    );
  }

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
            Finanzas y Comisiones
          </h1>
          <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
            Cada peso de esta pantalla viene de un evento con su operación de origen. Revisa, aprueba, envía a Finanzas
            y confirma los depósitos sin perder la trazabilidad de ninguno.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {fin.isLocal && (
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
              Previsualización local
            </span>
          )}
          <button
            onClick={recalcular}
            disabled={fin.sincronizando}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors active:scale-95 disabled:opacity-50"
          >
            {fin.sincronizando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.4} />
            )}
            Recalcular devengo
          </button>
        </div>
      </header>

      {/* ── Filtro de período ─────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm shadow-slate-200/40 dark:shadow-none px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={segmentado}>
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setFilters({ preset: p });
                    setRangoAbierto(false);
                  }}
                  className={pastilla(filters.preset === p)}
                >
                  {RANGO_LABEL[p]}
                </button>
              ))}
              <button
                onClick={() => {
                  const r = resolveRango("mes_actual", new Date());
                  setFilters({ preset: "personalizado", desde: filters.desde || r.desde, hasta: filters.hasta || r.hasta });
                  setRangoAbierto(true);
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
            <strong className="text-slate-900 dark:text-white tabular-nums">
              {fmtMonedaCorta(fin.resumen.total_generado)}
            </strong>
          </span>
        </div>

        {rangoAbierto && filters.preset === "personalizado" && (
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

      {/* ── Pestañas ──────────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-slate-200/70 dark:border-slate-800">
        {PESTANAS.map(({ id, label, Icono }) => {
          const activa = filters.pestana === id;
          const badge =
            id === "resumen" && fin.resumen.eventos_observados > 0
              ? fin.resumen.eventos_observados
              : id === "cortes" && fin.cortes.filter((c) => c.estado === "borrador").length > 0
                ? fin.cortes.filter((c) => c.estado === "borrador").length
                : 0;
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
              {badge > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Contenido ─────────────────────────────────────────────────────── */}
      {fin.error ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/40 px-6 py-10 text-center">
          <p className="text-[12px] font-bold text-rose-700 dark:text-rose-300">{fin.error}</p>
          <button
            onClick={fin.reload}
            className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold text-white bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </button>
        </div>
      ) : fin.loading ? (
        <div className="py-20 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-[12px] text-slate-400 dark:text-slate-500">Cargando el libro mayor…</p>
        </div>
      ) : (
        <>
          {filters.pestana === "resumen" && (
            <ResumenPanel
              resumen={fin.resumen}
              serie={fin.serie}
              liquidaciones={fin.liquidaciones}
              inconsistencias={fin.inconsistencias}
              grano={filters.grano}
              tipoGrafico={filters.tipoGrafico}
              vistaGrafico={vistaGrafico}
              desde={filters.desde}
              hasta={filters.hasta}
              seriesOcultas={seriesOcultas}
              onToggleSerie={toggleSerie}
              onCambiarGrano={(g) => setFilters({ grano: g })}
              onCambiarTipo={(t) => setFilters({ tipoGrafico: t })}
              onCambiarVista={(v) => {
                setVistaGrafico(v);
                setSeriesOcultas(new Set());
              }}
              onVerObservadas={() => setFilters({ pestana: "liquidaciones", estado: "observado" })}
            />
          )}

          {filters.pestana === "liquidaciones" && (
            <LiquidacionesPanel
              liquidaciones={fin.liquidaciones}
              periodoTexto={periodoTexto}
              desde={filters.desde}
              hasta={filters.hasta}
              rol={filters.rol}
              estado={filters.estado}
              personaAbierta={filters.persona}
              onCambiarRol={(r) => setFilters({ rol: r })}
              onCambiarEstado={(e) => setFilters({ estado: e })}
              onAbrirPersona={(id) => setFilters({ persona: id })}
              fetchEventos={fin.fetchEventos}
              setEstadoEventos={fin.setEstadoEventos}
              crearAjuste={fin.crearAjuste}
              revertirEvento={fin.revertirEvento}
              beneficiariosDisponibles={beneficiarios}
              onAviso={notificar}
            />
          )}

          {filters.pestana === "cortes" && (
            <CortesPanel
              cortes={fin.cortes}
              desde={filters.desde}
              hasta={filters.hasta}
              tipoSugerido={tipoCorteDePreset(filters.preset)}
              corteAbierto={filters.corte}
              onAbrirCorte={(id) => setFilters({ corte: id })}
              generarCorte={fin.generarCorte}
              accionCorte={fin.accionCorte}
              registrarPago={fin.registrarPago}
              fetchEventos={fin.fetchEventos}
              fetchPagos={fin.fetchPagos}
              onAviso={notificar}
            />
          )}

          {filters.pestana === "produccion" && (
            <ProduccionPanel
              produccion={fin.produccion}
              dimension={filters.dimension}
              periodoTexto={periodoTexto}
              onCambiarDimension={(d) => setFilters({ dimension: d })}
            />
          )}

          {filters.pestana === "tarifas" && (
            <TarifasPanel
              tarifas={fin.tarifas}
              config={fin.config}
              directores={directores}
              isLocal={fin.isLocal}
              guardarTarifa={fin.guardarTarifa}
              cerrarTarifa={fin.cerrarTarifa}
              guardarConfig={fin.guardarConfig}
              restaurarTarifas={fin.restaurarTarifas}
              onAviso={notificar}
            />
          )}

          {filters.pestana === "bitacora" && <BitacoraPanel fetchAuditoria={fin.fetchAuditoria} onAviso={notificar} />}
        </>
      )}

      {aviso && <Notificacion mensaje={aviso.mensaje} tono={aviso.tono} onCerrar={() => setAviso(null)} />}
    </div>
  );
}
