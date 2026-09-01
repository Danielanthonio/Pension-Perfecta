"use client";

// Módulo "Asignación AM" — la mesa de trabajo de la Dirección para que NINGÚN
// aliado se quede sin Account Manager.
//
// Desde 20260831000001 el AM se asigna al ALIADO y no al proyecto: lo que un
// aliado produzca —ahora y después— es de su AM. Esta pantalla es la ÚNICA vía
// para cambiarlo; en Gestión de Clientes y en Agenda Futura la columna Account
// Manager pasó a ser de solo lectura.
//
// Regla que hay que tener a la vista al usarla: al mover un aliado de AM se
// arrastran todos sus proyectos EN CURSO, pero las VENTAS se quedan con el AM
// que las gestionó. Si cambiaran de dueño, el devengo de Finanzas revertiría la
// comisión del AM anterior —o emitiría un cargo negativo si ya se pagó— y le
// nacería otra al nuevo. Una venta la gestionó quien la gestionó.
//
// Se trabaja sobre `assignmentProfiles` y `prospects`, que la Dirección ya tiene
// cargados en el contexto: es una pantalla de gestión, no un tablero de métricas.

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Lock,
  Search,
  Target,
  UserCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useApp, type UserProfile } from "@/utils/context/AppContext";
import { StatCard } from "@/components/ui/StatCard";
import { FIN_OTORGADO_STAGE } from "@/app/admin/_pipelineBuckets";
import { activeProspects, tipoDeAliado } from "@/components/closers/closerMetrics";
import { fmtFecha, fmtPct } from "@/components/closers/closerTypes";

type Filtro = "todos" | "sin" | "con";

const TIPO_LABEL: Record<"independiente" | "empresa" | "lider", string> = {
  independiente: "Independiente",
  empresa: "Empresa",
  lider: "Líder",
};

// Centinela del selector de destino: "" es "no has elegido nada" y no puede
// significar a la vez "quítale el AM", que sí es una acción deliberada.
const SIN_AM = "__mesa__";

const pill = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
    active
      ? "bg-emerald-600 text-white shadow-sm"
      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
  }`;

const segmented =
  "flex items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 p-0.5 ring-1 ring-inset ring-slate-200/70 dark:ring-slate-700/50";

export default function AsignacionAmModule() {
  const { assignmentProfiles: profiles, prospects, empresasMultialiado, assignAccountManager } = useApp();

  const [filtro, setFiltro] = useState<Filtro>("sin");
  const [amFiltro, setAmFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const [amDestino, setAmDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  // Asignación de UNA fila: el camino normal para un aliado suelto. Pasa por un
  // modal de confirmación porque mover a un aliado le mueve la cartera entera de
  // proyectos al AM nuevo, y eso conviene verlo antes de soltarlo.
  const [confirmando, setConfirmando] = useState<{ aliado: UserProfile; amId: string | null } | null>(null);
  const [confirmandoGuardar, setConfirmandoGuardar] = useState(false);
  const [toast, setToast] = useState<string>("");

  const mostrarToast = (texto: string) => {
    setToast(texto);
    window.setTimeout(() => setToast(""), 5000);
  };

  const accountManagers = useMemo(
    () =>
      profiles
        .filter((p) => p.role === "account_manager" && p.is_active !== false)
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [profiles]
  );
  const nombrePorId = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles]);
  const empresaPorId = useMemo(() => new Map(empresasMultialiado.map((e) => [e.id, e.nombre])), [empresasMultialiado]);

  // Proyectos vivos por aliado, separando los que SÍ se moverían de las ventas,
  // que no. Una sola pasada sobre los prospects.
  const cargaPorAliado = useMemo(() => {
    const map = new Map<string, { enCurso: number; ventas: number }>();
    for (const p of activeProspects(prospects)) {
      const acc = map.get(p.aliado_id) || { enCurso: 0, ventas: 0 };
      if (FIN_OTORGADO_STAGE.includes(p.status)) acc.ventas += 1;
      else acc.enCurso += 1;
      map.set(p.aliado_id, acc);
    }
    return map;
  }, [prospects]);

  const aliados = useMemo(() => profiles.filter((p) => p.role === "aliado"), [profiles]);
  const sinAm = useMemo(() => aliados.filter((a) => !a.account_manager_id), [aliados]);
  const cobertura = aliados.length > 0 ? ((aliados.length - sinAm.length) / aliados.length) * 100 : null;

  // Proyectos que hoy no tienen quién los gestione porque su aliado no tiene AM:
  // el costo real de dejar el hueco abierto.
  const proyectosHuerfanos = useMemo(
    () => sinAm.reduce((n, a) => n + (cargaPorAliado.get(a.id)?.enCurso || 0), 0),
    [sinAm, cargaPorAliado]
  );

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return aliados
      .filter((a) => (filtro === "sin" ? !a.account_manager_id : filtro === "con" ? !!a.account_manager_id : true))
      .filter((a) => !amFiltro || a.account_manager_id === amFiltro)
      .filter((a) => {
        if (!q) return true;
        const empresa = a.empresa_multialiado_id ? empresaPorId.get(a.empresa_multialiado_id) || "" : "";
        const amNombre = a.account_manager_id ? nombrePorId.get(a.account_manager_id) || "" : "";
        return (
          a.full_name.toLowerCase().includes(q) ||
          (a.email || "").toLowerCase().includes(q) ||
          empresa.toLowerCase().includes(q) ||
          amNombre.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Los que faltan van primero: son la fila accionable.
        const fa = a.account_manager_id ? 1 : 0;
        const fb = b.account_manager_id ? 1 : 0;
        if (fa !== fb) return fa - fb;
        return a.full_name.localeCompare(b.full_name);
      });
  }, [aliados, filtro, amFiltro, busqueda, empresaPorId, nombrePorId]);

  const todosVisiblesMarcados = visibles.length > 0 && visibles.every((a) => seleccion.has(a.id));

  const toggle = (id: string) =>
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleTodos = () =>
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (todosVisiblesMarcados) visibles.forEach((a) => next.delete(a.id));
      else visibles.forEach((a) => next.add(a.id));
      return next;
    });

  const elegidos = useMemo(() => aliados.filter((a) => seleccion.has(a.id)), [aliados, seleccion]);
  const destinoId = amDestino === SIN_AM ? null : amDestino || null;

  // Lo que va a MOVERSE de verdad, para poder decirlo antes de tocar el botón.
  const impacto = useMemo(() => {
    let enCurso = 0;
    let ventas = 0;
    let reasignados = 0;
    for (const a of elegidos) {
      if ((a.account_manager_id || null) === destinoId) continue;
      const carga = cargaPorAliado.get(a.id);
      enCurso += carga?.enCurso || 0;
      if (a.account_manager_id) {
        reasignados += 1;
        ventas += carga?.ventas || 0;
      }
    }
    return { enCurso, ventas, reasignados };
  }, [elegidos, destinoId, cargaPorAliado]);

  const puedeGuardar = elegidos.length > 0 && amDestino !== "" && !guardando;

  // Impacto de mover a UN aliado, para el modal de la fila.
  const impactoDe = (a: UserProfile) => cargaPorAliado.get(a.id) || { enCurso: 0, ventas: 0 };

  const confirmarFila = async () => {
    if (!confirmando) return;
    setConfirmandoGuardar(true);
    setErrorMsg("");
    try {
      await assignAccountManager([confirmando.aliado.id], confirmando.amId, null);
      const destino = confirmando.amId
        ? nombrePorId.get(confirmando.amId) || "el Account Manager"
        : "la mesa de dirección";
      mostrarToast(`${confirmando.aliado.full_name} pasa a ${destino}.`);
      setConfirmando(null);
    } catch (e: any) {
      console.error("Error asignando Account Manager:", e);
      setErrorMsg(e?.message || "No se pudo asignar el Account Manager.");
      setConfirmando(null);
    } finally {
      setConfirmandoGuardar(false);
    }
  };

  const asignar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setErrorMsg("");
    setOkMsg("");
    try {
      const n = await assignAccountManager(
        elegidos.map((a) => a.id),
        destinoId,
        motivo.trim() || null
      );
      if (n === 0) {
        setOkMsg("No había nada que cambiar: esos aliados ya tenían ese Account Manager.");
      } else {
        const destino = destinoId ? nombrePorId.get(destinoId) || "el Account Manager" : "la mesa de dirección";
        setOkMsg(
          `${n} aliado(s) asignado(s) a ${destino}` +
            (impacto.enCurso > 0 ? `, con ${impacto.enCurso} proyecto(s) en curso.` : ".")
        );
      }
      setSeleccion(new Set());
      setMotivo("");
    } catch (e: any) {
      console.error("Error asignando Account Manager:", e);
      setErrorMsg(e?.message || "No se pudo completar la asignación. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    // OJO: aquí NO va `animate-fade-in`. Esa clase deja un `transform` puesto, y un
    // ancestro con transform convierte a la barra `sticky` (y a los modales `fixed`)
    // en hijos de ESE bloque, no del viewport: con 202 aliados en la tabla, la barra
    // de acción se quedaba a 11 000 px de scroll y la pantalla parecía no tener
    // ninguna forma de asignar. Verificado en prod el 2026-08-31.
    <div className={`space-y-5 text-slate-800 dark:text-slate-100 ${seleccion.size > 0 ? "pb-32" : ""}`}>
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white leading-tight flex items-center gap-2">
            <UserCog className="h-5 w-5 text-emerald-600 dark:text-emerald-400" strokeWidth={2.2} />
            Asignación AM
          </h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            Cada aliado tiene un Account Manager. Sus proyectos son de ese Account Manager.
          </p>
        </div>
      </div>

      {/* La regla de las ventas, a la vista: es lo único que no se mueve. */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-5 py-3.5 flex items-start gap-3">
        <Lock className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500 mt-0.5" />
        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          Al mover un aliado de Account Manager se llevan con él{" "}
          <strong>todos sus proyectos en curso</strong>. Los que ya son{" "}
          <strong>financiamiento otorgado se quedan con el AM que los gestionó</strong>: esa comisión ya
          está devengada y no se reescribe.
        </p>
      </div>

      {/* Estado de cobertura */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Aliados" value={aliados.length} icon={Users} tone="slate" />
        <StatCard label="Con AM" value={aliados.length - sinAm.length} icon={UserCheck} tone="emerald" />
        <StatCard
          label="Sin AM"
          value={sinAm.length}
          sub={sinAm.length > 0 ? "pendientes" : "ninguno"}
          icon={AlertTriangle}
          tone={sinAm.length > 0 ? "rose" : "emerald"}
        />
        <StatCard label="Cobertura" value={fmtPct(cobertura, 0)} icon={Target} tone="teal" />
      </div>

      {sinAm.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 px-5 py-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <p className="text-[12px] text-emerald-800 dark:text-emerald-200 leading-relaxed">
            <strong>Todos los aliados tienen Account Manager.</strong> Ningún proyecto nuevo va a caer en
            la mesa de dirección.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="text-[12px] text-amber-800 dark:text-amber-200 leading-relaxed">
            <strong>{sinAm.length} aliado(s) sin Account Manager.</strong> Todo lo que capturen cae en la
            mesa de dirección: nadie lo ve en su pipeline y no genera comisión de gestión
            {proyectosHuerfanos > 0 ? (
              <>
                . Ya hay <strong>{proyectosHuerfanos} proyecto(s) en curso</strong> así
              </>
            ) : null}
            . Márcalos abajo y asígnalos.
          </p>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className={segmented}>
          {(["sin", "con", "todos"] as const).map((f) => (
            <button key={f} onClick={() => setFiltro(f)} className={pill(filtro === f)}>
              {f === "sin" ? `Sin AM (${sinAm.length})` : f === "con" ? "Con AM" : `Todos (${aliados.length})`}
            </button>
          ))}
        </div>

        {accountManagers.length > 0 && (
          <div className="relative">
            <select
              value={amFiltro}
              onChange={(e) => setAmFiltro(e.target.value)}
              className="appearance-none pl-3 pr-7 py-1.5 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 outline-none focus:border-emerald-500"
            >
              <option value="">Todos los Account Managers</option>
              {accountManagers.map((am) => (
                <option key={am.id} value={am.id}>
                  {am.full_name}
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
            placeholder="Aliado, correo, empresa o AM…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-[11px] bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
          />
        </div>
      </div>
      {/* Barra de acción: solo aparece cuando hay algo seleccionado */}
      {seleccion.size > 0 && (
        // `fixed`, y no `sticky`. Dentro del área admin `sticky` NO funciona: el
        // envoltorio del layout (`flex-1 … overflow-hidden`) es un contenedor de
        // scroll que nunca scrollea, así que cualquier `sticky` se ancla a él y no
        // llega a engancharse nunca. Con la barra después de una tabla de cientos
        // de filas eso la dejaba a 11 000 px de scroll: existía, pero era
        // imposible de encontrar. Fija al viewport aparece siempre en cuanto hay
        // algo marcado. Requiere además que ningún ancestro tenga `transform`, por
        // eso el contenedor ya no lleva `animate-fade-in`.
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-3rem)] max-w-4xl bg-white dark:bg-slate-900 rounded-2xl border border-emerald-300 dark:border-emerald-800/60 shadow-2xl shadow-emerald-500/20 p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Asignar a
              </span>
              <select
                value={amDestino}
                onChange={(e) => setAmDestino(e.target.value)}
                className="px-3 py-2 rounded-lg text-xs bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500 min-w-[200px]"
              >
                <option value="">Selecciona un Account Manager…</option>
                {accountManagers.map((am) => (
                  <option key={am.id} value={am.id}>
                    {am.full_name}
                  </option>
                ))}
                <option value={SIN_AM}>Quitar el AM (mesa de dirección)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Motivo (opcional)
              </span>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Queda en la auditoría del aliado"
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

          {/* Qué va a pasar exactamente, antes de que toquen el botón. */}
          {amDestino !== "" && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Se moverán <strong>{impacto.enCurso}</strong> proyecto(s) en curso
              {impacto.reasignados > 0 && (
                <>
                  {" "}
                  · <strong>{impacto.reasignados}</strong> aliado(s) cambian de Account Manager
                </>
              )}
              {impacto.ventas > 0 && (
                <>
                  {" "}
                  · <strong>{impacto.ventas}</strong> venta(s) se quedan con su AM actual
                </>
              )}
              .
            </p>
          )}
        </div>
      )}


      {(okMsg || errorMsg) && (
        <div
          className={`rounded-2xl border px-5 py-3.5 text-[12px] font-semibold ${
            errorMsg
              ? "border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300"
              : "border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {errorMsg || okMsg}
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm overflow-hidden">
        {visibles.length === 0 ? (
          <p className="px-5 py-12 text-center text-[12px] font-medium text-slate-400 dark:text-slate-500">
            {aliados.length === 0
              ? "Todavía no hay aliados registrados."
              : filtro === "sin"
                ? "No queda ningún aliado sin Account Manager."
                : "Ningún aliado coincide con los filtros."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[880px]">
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
                  {["Aliado", "Tipo", "Empresa", "Alta", "Account Manager", "En curso", "Ventas"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 ${
                        i >= 5 ? "text-right" : ""
                      } ${i === 6 ? "pr-5" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {visibles.map((a) => {
                  const marcado = seleccion.has(a.id);
                  const am = a.account_manager_id ? nombrePorId.get(a.account_manager_id) : null;
                  const carga = cargaPorAliado.get(a.id);
                  const tipo = tipoDeAliado(a);
                  return (
                    <tr
                      key={a.id}
                      onClick={() => toggle(a.id)}
                      className={`cursor-pointer transition-colors ${
                        marcado
                          ? "bg-emerald-50/70 dark:bg-emerald-950/20"
                          : "hover:bg-slate-50/60 dark:hover:bg-slate-800/20"
                      }`}
                    >
                      <td className="pl-5 pr-2 py-2.5">
                        <span
                          className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                            marcado
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "border-slate-300 dark:border-slate-600"
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
                      <td className="px-3 py-2.5 tabular-nums text-slate-500 dark:text-slate-400">
                        {fmtFecha(a.created_at)}
                      </td>
                      {/* Asignación DIRECTA, fila a fila: es lo primero que busca
                          quien entra a repartir un aliado suelto. La selección en
                          lote de abajo sigue existiendo para repartir de golpe. */}
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <select
                            value={a.account_manager_id || ""}
                            onChange={(e) => setConfirmando({ aliado: a, amId: e.target.value || null })}
                            title={am ? `Lo gestiona ${am}. Cámbialo aquí.` : "Elige quién va a gestionar a este aliado"}
                            className={`appearance-none w-[190px] pl-3 pr-7 py-1.5 rounded-lg border text-[11px] font-semibold outline-none transition-all cursor-pointer truncate focus:border-emerald-500 ${
                              a.account_manager_id
                                ? "bg-white dark:bg-slate-950/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                                : "bg-amber-50 dark:bg-amber-950/20 border-dashed border-amber-300 dark:border-amber-800/60 text-amber-700 dark:text-amber-400"
                            }`}
                          >
                            <option value="">⚠ Sin asignar</option>
                            {accountManagers.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.full_name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                        {carga?.enCurso || 0}
                      </td>
                      <td
                        className="px-3 pr-5 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500"
                        title="Financiamientos otorgados. No cambian de Account Manager al reasignar."
                      >
                        {carga?.ventas || 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>


      <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
        El Account Manager de un proyecto se lee en{" "}
        <Link href="/admin/clientes" className="underline font-semibold">
          Gestión de Clientes
        </Link>
        , pero solo se cambia aquí.
      </p>

      {/* Confirmación de la asignación de una fila. Dice qué se lleva el AM nuevo
          y qué se queda donde está, antes de tocarlo. */}
      {confirmando && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 border-b border-slate-150 dark:border-slate-800 pb-4">
              <div className="h-11 w-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 dark:text-emerald-400 flex items-center justify-center border border-emerald-150 dark:border-emerald-800/40 shrink-0">
                <UserCog className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                  {confirmando.amId ? "Asignar Account Manager" : "Quitar el Account Manager"}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 truncate">
                  {confirmando.aliado.full_name}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-semibold truncate max-w-[42%]">
                  {confirmando.aliado.account_manager_id
                    ? nombrePorId.get(confirmando.aliado.account_manager_id) || "Account Manager"
                    : "Sin asignar"}
                </span>
                <span className="text-slate-400 shrink-0">→</span>
                <span className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400 font-bold truncate max-w-[42%]">
                  {confirmando.amId ? nombrePorId.get(confirmando.amId) || "Account Manager" : "Mesa de dirección"}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                {impactoDe(confirmando.aliado).enCurso > 0 ? (
                  <>
                    Se llevará <strong>{impactoDe(confirmando.aliado).enCurso}</strong> proyecto(s) en curso.
                  </>
                ) : (
                  <>Este aliado no tiene proyectos en curso.</>
                )}
                {impactoDe(confirmando.aliado).ventas > 0 && (
                  <>
                    {" "}
                    Sus <strong>{impactoDe(confirmando.aliado).ventas}</strong> venta(s) se quedan con el
                    Account Manager que las gestionó.
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setConfirmando(null)}
                disabled={confirmandoGuardar}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-all active:scale-95 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarFila}
                disabled={confirmandoGuardar}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs shadow-sm shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {confirmandoGuardar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                {confirmandoGuardar ? "Asignando…" : "Sí, asignar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación de que la acción se logró, arriba y a la vista */}
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[9999] max-w-md w-[calc(100%-2rem)]">
          <div className="flex items-start gap-3 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/50 border-l-4 border-l-emerald-500 rounded-2xl shadow-2xl px-4 py-3.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Asignación exitosa</h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">{toast}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
