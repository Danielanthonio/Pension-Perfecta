"use client";

// Módulo "Asignación Closer" — la mesa de trabajo de la Dirección para que NINGÚN
// aliado se quede sin closer.
//
// Por qué existe un módulo aparte y no basta con el campo del alta:
//   · Los aliados que ya existían nacieron antes de que hubiera closers.
//   · Un aliado puede AUTO-REGISTRARSE con un código de invitación
//     (`registerAliado`), y en ese camino nadie elige quién lo cerró.
// Así que la regla "todo aliado tiene closer" no se puede imponer solo en el
// formulario: hace falta un sitio donde ver el hueco y cerrarlo.
//
// Se trabaja sobre `profiles` y `prospects`, que la Dirección ya tiene cargados
// en el contexto: esto es una pantalla de gestión, no un tablero de métricas, así
// que no gasta llamadas a las RPC agregadas.

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  History,
  Link2,
  Loader2,
  Search,
  Target,
  UserCheck,
  Users,
} from "lucide-react";
import { useApp, type UserProfile } from "@/utils/context/AppContext";
import { StatCard } from "@/components/ui/StatCard";
import { activeProspects, tipoDeAliado } from "./closerMetrics";
import { ReasignarCloser } from "./ReasignarCloser";
import { useClosers } from "./useClosers";
import { type CloserAliadoRow, type CloserAsignacion, fmtFecha, fmtPct } from "./closerTypes";

type Filtro = "todos" | "sin" | "con";

const TIPO_LABEL: Record<"independiente" | "empresa" | "lider", string> = {
  independiente: "Independiente",
  empresa: "Empresa",
  lider: "Líder",
};

const pill = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
    active
      ? "bg-emerald-600 text-white shadow-sm"
      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
  }`;

const segmented =
  "flex items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 p-0.5 ring-1 ring-inset ring-slate-200/70 dark:ring-slate-700/50";

export default function AsignacionCloserModule() {
  // `assignmentProfiles` es el `profiles` CRUDO, sin el recorte por rol que hace
  // el contexto. Aquí es imprescindible: a un Account Manager el recorte le deja
  // solo los aliados de sus proyectos, y esta pantalla existe justamente para
  // atribuir los que NO tienen closer —que casi nunca son suyos—. Con el
  // filtrado, el módulo le salía prácticamente vacío. El alcance real lo pone el
  // RLS, que ya le deja leer los aliados y los closers; ver
  // [[project-am-asigna-cualquier-aliado]], que resolvió lo mismo para el
  // asignador de AMs.
  const { user, assignmentProfiles: profiles, prospects, empresasMultialiado, assignCloser } = useApp();
  // Dirección hace todo. El Account Manager solo cierra huecos: puede atribuir a
  // un aliado que NO tiene closer, y ahí se acaba su alcance. Reescribir una
  // atribución existente mueve métricas históricas y comisiones, así que ni
  // reasigna ni toca a los ya atribuidos. La base impone lo mismo dentro de
  // `asigna_closer_a_aliado` (20260803000000): esto solo evita el intento.
  const soloAtribucionInicial = user?.role === "account_manager";
  // Un aliado ya atribuido no es seleccionable para el AM: marcarlo solo llevaría
  // a un error de la base al guardar.
  const seleccionable = (a: UserProfile) => !soloAtribucionInicial || !a.closer_origen_id;
  // Solo se usa el lector de historial; las métricas de esta pantalla salen del
  // contexto, que la Dirección ya tiene en memoria.
  const { fetchHistorial } = useClosers({ desde: "", hasta: "", grano: "mes", tipoAliado: "todos", estadoAliado: "todos" });

  const [filtro, setFiltro] = useState<Filtro>("sin");
  const [closerFiltro, setCloserFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [reasignando, setReasignando] = useState<CloserAliadoRow | null>(null);
  const [historial, setHistorial] = useState<CloserAsignacion[]>([]);
  const [verHistorial, setVerHistorial] = useState(false);

  // Formulario de la barra de acción.
  const [closerDestino, setCloserDestino] = useState("");
  const [usarFechaAlta, setUsarFechaAlta] = useState(true);
  const [fechaFija, setFechaFija] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const closers = useMemo(
    () => profiles.filter((p) => p.role === "closer").sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [profiles]
  );
  const nombrePorId = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles]);
  const empresaPorId = useMemo(() => new Map(empresasMultialiado.map((e) => [e.id, e.nombre])), [empresasMultialiado]);

  // Clientes vivos por aliado, de una sola pasada.
  const clientesPorAliado = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of activeProspects(prospects)) {
      map.set(p.aliado_id, (map.get(p.aliado_id) || 0) + 1);
    }
    return map;
  }, [prospects]);

  const aliados = useMemo(() => profiles.filter((p) => p.role === "aliado"), [profiles]);
  const sinCloser = useMemo(() => aliados.filter((a) => !a.closer_origen_id), [aliados]);
  const cobertura = aliados.length > 0 ? ((aliados.length - sinCloser.length) / aliados.length) * 100 : null;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return aliados
      .filter((a) => (filtro === "sin" ? !a.closer_origen_id : filtro === "con" ? !!a.closer_origen_id : true))
      .filter((a) => !closerFiltro || a.closer_origen_id === closerFiltro)
      .filter((a) => {
        if (!q) return true;
        const empresa = a.empresa_multialiado_id ? empresaPorId.get(a.empresa_multialiado_id) || "" : "";
        const closerNombre = a.closer_origen_id ? nombrePorId.get(a.closer_origen_id) || "" : "";
        return (
          a.full_name.toLowerCase().includes(q) ||
          (a.email || "").toLowerCase().includes(q) ||
          empresa.toLowerCase().includes(q) ||
          closerNombre.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Los que faltan van primero: son la única fila accionable.
        const fa = a.closer_origen_id ? 1 : 0;
        const fb = b.closer_origen_id ? 1 : 0;
        if (fa !== fb) return fa - fb;
        return a.full_name.localeCompare(b.full_name);
      });
  }, [aliados, filtro, closerFiltro, busqueda, empresaPorId, nombrePorId]);

  // "Todos" significa "todos los que este usuario puede tocar".
  const marcables = useMemo(() => visibles.filter(seleccionable), [visibles, soloAtribucionInicial]);
  const todosVisiblesMarcados = marcables.length > 0 && marcables.every((a) => seleccion.has(a.id));

  const toggle = (id: string) => {
    const a = profiles.find((p) => p.id === id);
    if (a && !seleccionable(a)) return;
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTodos = () =>
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (todosVisiblesMarcados) marcables.forEach((a) => next.delete(a.id));
      else marcables.forEach((a) => next.add(a.id));
      return next;
    });

  const elegidos = useMemo(() => aliados.filter((a) => seleccion.has(a.id)), [aliados, seleccion]);
  // Si en la selección hay alguno que YA tiene closer, esto es una reatribución
  // del ORIGEN, no un alta: hay que avisarlo antes de que toquen el botón.
  const conCloserEnSeleccion = elegidos.filter((a) => !!a.closer_origen_id).length;
  const puedeGuardar = elegidos.length > 0 && !!closerDestino && (usarFechaAlta || !!fechaFija) && !guardando;

  const asignar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setErrorMsg("");
    setOkMsg("");
    try {
      const razon = motivo.trim() || "Asignación manual desde el módulo Asignación Closer";
      if (usarFechaAlta) {
        // Una llamada por aliado: cada uno conserva SU fecha de alta como fecha de
        // incorporación. Si se usara hoy para todos, el gráfico de captación
        // mostraría un pico falso el día del backfill.
        for (const a of elegidos) {
          await assignCloser([a.id], closerDestino, {
            tipo: "backfill",
            motivo: razon,
            fechaIncorporacion: a.created_at,
          });
        }
      } else {
        await assignCloser(
          elegidos.map((a) => a.id),
          closerDestino,
          { tipo: "backfill", motivo: razon, fechaIncorporacion: new Date(`${fechaFija}T12:00:00Z`).toISOString() }
        );
      }
      setOkMsg(`${elegidos.length} aliado(s) atribuido(s) a ${nombrePorId.get(closerDestino) || "el closer"}.`);
      setSeleccion(new Set());
      setMotivo("");
    } catch (e) {
      console.error("Error asignando closer:", e);
      setErrorMsg("No se pudo completar la asignación. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const abrirHistorial = async () => {
    setVerHistorial((v) => !v);
    if (historial.length === 0) setHistorial(await fetchHistorial());
  };

  // Fila mínima que espera el modal de reasignación.
  const filaParaModal = (a: UserProfile): CloserAliadoRow => ({
    aliado_id: a.id,
    aliado_nombre: a.full_name,
    aliado_email: a.email || null,
    aliado_tipo: a.aliado_tipo === "lider" ? "lider" : "aliado",
    empresa_id: a.empresa_multialiado_id || null,
    empresa_nombre: a.empresa_multialiado_id ? empresaPorId.get(a.empresa_multialiado_id) || null : null,
    fecha_incorporacion: a.fecha_incorporacion_closer || null,
    es_closer_actual: true,
    creado_por: a.created_by || null,
    // Este modal solo reasigna; nadie administra al aliado desde aquí, así que
    // la autoría se pasa tal cual y "lo creé yo" no aplica.
    creado_por_mi: false,
    clientes_total: clientesPorAliado.get(a.id) || 0,
    clientes_periodo: 0,
    clientes_en_proceso: 0,
    clientes_aprobados: 0,
    ventas: 0,
    clientes_90d: 0,
    ultimo_cliente_at: null,
  });

  return (
    <div className="space-y-5 animate-fade-in text-slate-800 dark:text-slate-100">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white leading-tight flex items-center gap-2">
            <Link2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" strokeWidth={2.2} />
            Asignación Closer
          </h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            Todo aliado debe tener un closer responsable. Aquí se cierra el hueco.
          </p>
        </div>
        <button
          onClick={abrirHistorial}
          className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
        >
          <History className="h-4 w-4" strokeWidth={2.4} /> Historial
        </button>
      </div>

      {/* El AM tiene que saber dónde termina su alcance ANTES de intentar algo. */}
      {soloAtribucionInicial && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-5 py-3.5 flex items-start gap-3">
          <UserCheck className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500 mt-0.5" />
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            Puedes atribuir los aliados que <strong>todavía no tienen closer</strong>. Los que ya lo tienen
            aparecen en gris: cambiar una atribución existente mueve métricas históricas y comisiones, así que
            eso lo hace Dirección.
          </p>
        </div>
      )}

      {/* Estado de cobertura */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Aliados" value={aliados.length} icon={Users} tone="slate" />
        <StatCard label="Con closer" value={aliados.length - sinCloser.length} icon={UserCheck} tone="emerald" />
        <StatCard
          label="Sin closer"
          value={sinCloser.length}
          sub={sinCloser.length > 0 ? "pendientes" : "ninguno"}
          icon={AlertTriangle}
          tone={sinCloser.length > 0 ? "rose" : "emerald"}
        />
        <StatCard label="Cobertura" value={fmtPct(cobertura, 0)} icon={Target} tone="teal" />
      </div>

      {sinCloser.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 px-5 py-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <p className="text-[12px] text-emerald-800 dark:text-emerald-200 leading-relaxed">
            <strong>Todos los aliados tienen closer atribuido.</strong> Las métricas del módulo Closers
            cubren el 100 % de la operación.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="text-[12px] text-amber-800 dark:text-amber-200 leading-relaxed">
            <strong>{sinCloser.length} aliado(s) sin closer.</strong> Todo lo que produzcan —clientes,
            aprobaciones y ventas— queda fuera de las métricas de{" "}
            <Link href="/admin/closers" className="underline font-bold">
              Closers
            </Link>
            , porque no hay a quién atribuírselo. Márcalos abajo y asígnalos.
          </p>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className={segmented}>
          {(["sin", "con", "todos"] as const).map((f) => (
            <button key={f} onClick={() => setFiltro(f)} className={pill(filtro === f)}>
              {f === "sin" ? `Sin closer (${sinCloser.length})` : f === "con" ? "Con closer" : `Todos (${aliados.length})`}
            </button>
          ))}
        </div>

        {closers.length > 0 && (
          <div className="relative">
            <select
              value={closerFiltro}
              onChange={(e) => setCloserFiltro(e.target.value)}
              className="appearance-none pl-3 pr-7 py-1.5 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 outline-none focus:border-emerald-500"
            >
              <option value="">Todos los closers</option>
              {closers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
            <ChevronDown className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        )}

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Aliado, correo, empresa o closer…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-[11px] bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm overflow-hidden">
        {visibles.length === 0 ? (
          <p className="px-5 py-12 text-center text-[12px] font-medium text-slate-400 dark:text-slate-500">
            {aliados.length === 0
              ? "Todavía no hay aliados registrados."
              : filtro === "sin"
                ? "No queda ningún aliado sin closer."
                : "Ningún aliado coincide con los filtros."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                  <th className="pl-5 pr-2 py-2.5 w-8">
                    <button
                      onClick={toggleTodos}
                      className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                        todosVisiblesMarcados
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "border-slate-300 dark:border-slate-600"
                      }`}
                      title={todosVisiblesMarcados ? "Quitar selección" : "Seleccionar los visibles"}
                    >
                      {todosVisiblesMarcados && <Check className="h-3 w-3" strokeWidth={3} />}
                    </button>
                  </th>
                  {["Aliado", "Tipo", "Empresa", "Alta", "Closer de origen", "Closer actual", "Clientes", ""].map((h, i) => (
                    <th
                      key={h + i}
                      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 ${
                        i === 6 ? "text-right" : ""
                      } ${i === 7 ? "pr-5 text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {visibles.map((a) => {
                  const marcado = seleccion.has(a.id);
                  const puedeMarcarse = seleccionable(a);
                  const origen = a.closer_origen_id ? nombrePorId.get(a.closer_origen_id) : null;
                  const actual = a.closer_actual_id ? nombrePorId.get(a.closer_actual_id) : null;
                  const tipo = tipoDeAliado(a);
                  return (
                    <tr
                      key={a.id}
                      onClick={() => toggle(a.id)}
                      title={puedeMarcarse ? undefined : "Ya tiene closer de origen: cambiarlo es cosa de Dirección."}
                      className={`transition-colors ${
                        !puedeMarcarse
                          ? "cursor-not-allowed opacity-60"
                          : marcado
                            ? "cursor-pointer bg-emerald-50/70 dark:bg-emerald-950/20"
                            : "cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/20"
                      }`}
                    >
                      <td className="pl-5 pr-2 py-2.5">
                        <span
                          className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                            marcado
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : puedeMarcarse
                                ? "border-slate-300 dark:border-slate-600"
                                : "border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
                          }`}
                        >
                          {marcado && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block font-bold text-slate-800 dark:text-slate-200 truncate max-w-[190px]">
                          {a.full_name}
                        </span>
                        <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[190px]">
                          {a.email || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{TIPO_LABEL[tipo]}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 truncate max-w-[130px]">
                        {a.empresa_multialiado_id ? empresaPorId.get(a.empresa_multialiado_id) || "—" : "—"}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-500 dark:text-slate-400">{fmtFecha(a.created_at)}</td>
                      <td className="px-3 py-2.5">
                        {origen ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                            <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[130px]">{origen}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400">
                            Sin asignar
                          </span>
                        )}
                        {a.fecha_incorporacion_closer && (
                          <span className="block text-[10px] text-slate-400 dark:text-slate-500 tabular-nums mt-0.5">
                            {fmtFecha(a.fecha_incorporacion_closer)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 truncate max-w-[130px]">
                        {actual && actual !== origen ? (
                          <span className="font-semibold text-indigo-600 dark:text-indigo-400">{actual}</span>
                        ) : actual ? (
                          <span className="text-slate-400 dark:text-slate-500">= origen</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-800 dark:text-slate-100">
                        {clientesPorAliado.get(a.id) || 0}
                      </td>
                      <td className="pl-3 pr-5 py-2.5 text-right">
                        {a.closer_origen_id && !soloAtribucionInicial && (
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setReasignando(filaParaModal(a));
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors active:scale-95"
                            title="Cambiar el closer que lo acompaña (el de origen no cambia)"
                          >
                            <ArrowRightLeft className="h-3 w-3" /> Reasignar
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
      </div>

      {/* Barra de acción: solo aparece cuando hay algo seleccionado */}
      {seleccion.size > 0 && (
        <div className="sticky bottom-4 z-20 bg-white dark:bg-slate-900 rounded-2xl border border-emerald-300 dark:border-emerald-800/60 shadow-lg shadow-emerald-500/10 p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Asignar a
              </span>
              <select
                value={closerDestino}
                onChange={(e) => setCloserDestino(e.target.value)}
                className="px-3 py-2 rounded-lg text-xs bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500 min-w-[180px]"
              >
                <option value="">Selecciona un closer…</option>
                {closers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Fecha de incorporación
              </span>
              <div className="flex items-center gap-2">
                <div className={segmented}>
                  <button onClick={() => setUsarFechaAlta(true)} className={pill(usarFechaAlta)}>
                    Alta de cada aliado
                  </button>
                  <button onClick={() => setUsarFechaAlta(false)} className={pill(!usarFechaAlta)}>
                    Una fecha
                  </button>
                </div>
                {!usarFechaAlta && (
                  <input
                    type="date"
                    value={fechaFija}
                    onChange={(e) => setFechaFija(e.target.value)}
                    className="px-3 py-2 rounded-lg text-xs bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Motivo (opcional)
              </span>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Queda en el historial"
                className="px-3 py-2 rounded-lg text-xs bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
              />
            </div>

            <button
              onClick={asignar}
              disabled={!puedeGuardar}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" strokeWidth={2.4} />}
              Asignar {seleccion.size}
            </button>

            <button
              onClick={() => setSeleccion(new Set())}
              className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              Limpiar
            </button>
          </div>

          {/* Esto cambia el MÉRITO histórico, no solo la gestión: hay que decirlo. */}
          {conCloserEnSeleccion > 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {conCloserEnSeleccion} de los seleccionados <strong>ya tiene closer de origen</strong>. Continuar
              reescribe a quién se le atribuye haberlos captado, junto con sus clientes y ventas. Para un cambio
              solo operativo usa <strong>Reasignar</strong> en la fila.
            </p>
          )}
          {errorMsg && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errorMsg}</p>}
          {okMsg && (
            <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> {okMsg}
            </p>
          )}
        </div>
      )}

      {okMsg && seleccion.size === 0 && (
        <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> {okMsg}
        </p>
      )}

      {/* Historial */}
      {verHistorial && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
              <History className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">Historial de asignaciones</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">
                Registro completo e inmodificable: quién, cuándo y por qué.
              </p>
            </div>
          </div>
          {historial.length === 0 ? (
            <p className="px-5 py-8 text-center text-[11px] text-slate-400 dark:text-slate-500">
              Todavía no hay movimientos registrados.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/70 max-h-80 overflow-y-auto">
              {historial.map((h) => (
                <li key={h.id} className="px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                  <span className="tabular-nums text-slate-400 dark:text-slate-500 w-20 shrink-0">
                    {fmtFecha(h.fecha_asignacion)}
                  </span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">
                    {nombrePorId.get(h.aliado_id) || "Aliado"}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {h.tipo_movimiento === "reasignacion"
                      ? `${nombrePorId.get(h.closer_anterior_id || "") || "Sin closer"} → ${nombrePorId.get(h.closer_nuevo_id || "") || "Sin closer"}`
                      : h.tipo_movimiento === "backfill"
                        ? `Atribución manual → ${nombrePorId.get(h.closer_nuevo_id || "") || "—"}`
                        : h.tipo_movimiento === "desasignacion"
                          ? "Desasignado"
                          : `Alta → ${nombrePorId.get(h.closer_nuevo_id || "") || "—"}`}
                  </span>
                  {h.motivo && <span className="text-slate-400 dark:text-slate-500 italic truncate">{h.motivo}</span>}
                  <span className="ml-auto text-slate-400 dark:text-slate-500 shrink-0">
                    {nombrePorId.get(h.asignado_por || "") || "Sistema"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {reasignando && (
        <ReasignarCloser
          aliado={reasignando}
          closerActualId={
            aliados.find((a) => a.id === reasignando.aliado_id)?.closer_actual_id ||
            aliados.find((a) => a.id === reasignando.aliado_id)?.closer_origen_id ||
            ""
          }
          closers={closers.map((c) => ({ id: c.id, nombre: c.full_name }))}
          onCerrar={() => setReasignando(null)}
          onConfirmar={async (nuevoCloserId, razon) => {
            await assignCloser([reasignando.aliado_id], nuevoCloserId, { tipo: "reasignacion", motivo: razon });
            setReasignando(null);
            setHistorial(await fetchHistorial());
          }}
        />
      )}
    </div>
  );
}
