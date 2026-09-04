"use client";

// Módulo "Asignación AM" — la mesa de trabajo de la Dirección para repartir los
// aliados entre los Account Managers.
//
// QUÉ HACE Y QUÉ NO, que es lo que importa aquí (20260904000000):
//   · Asignar un aliado a un AM decide a quién le NACEN los proyectos que ese
//     aliado capture A PARTIR DE AHORA.
//   · NO mueve ni un solo proyecto de los que ya existen. Ninguno cambia de
//     dueño, ni las métricas, ni las comisiones. El AM de un proyecto concreto
//     se sigue cambiando uno por uno desde Gestión de Clientes.
//   · Un aliado sin AM no se queda en el aire: lo que capture lo reparte la
//     ruleta de siempre entre los AM que la tengan encendida.
//
// Es exactamente el modelo que se revirtió el 2026-09-02, pero solo hacia
// adelante: sin backfill y sin cascada, que fue lo que allí hizo daño.
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
  Dices,
  Loader2,
  Search,
  ShieldCheck,
  Target,
  UserCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useApp } from "@/utils/context/AppContext";
import { StatCard } from "@/components/ui/StatCard";
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
const SIN_AM = "__ruleta__";

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
  const [guardandoFila, setGuardandoFila] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const accountManagers = useMemo(
    () =>
      profiles
        .filter((p) => p.role === "account_manager" && p.is_active !== false)
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [profiles]
  );
  const nombrePorId = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles]);
  const empresaPorId = useMemo(() => new Map(empresasMultialiado.map((e) => [e.id, e.nombre])), [empresasMultialiado]);

  // Los AM que de verdad entran al sorteo: encendidos Y activos, el mismo
  // criterio que el trigger de la base. Es la red que recoge a los aliados que
  // todavía no tienen cartera asignada.
  const enRuleta = useMemo(
    () => accountManagers.filter((am) => am.auto_assign_enabled === true),
    [accountManagers]
  );

  const aliados = useMemo(() => profiles.filter((p) => p.role === "aliado"), [profiles]);

  // Proyectos vivos por aliado, y cuántos de ellos están YA con el AM al que
  // pertenece ese aliado. La diferencia entre las dos cifras es el reparto
  // histórico que esta pantalla deliberadamente NO toca.
  const cargaPorAliado = useMemo(() => {
    const amDeAliado = new Map(aliados.map((a) => [a.id, a.account_manager_id || null]));
    const map = new Map<string, { total: number; conSuAm: number }>();
    for (const p of activeProspects(prospects)) {
      const acc = map.get(p.aliado_id) || { total: 0, conSuAm: 0 };
      acc.total += 1;
      const suAm = amDeAliado.get(p.aliado_id) || null;
      if (suAm && (p.account_manager_id || null) === suAm) acc.conSuAm += 1;
      map.set(p.aliado_id, acc);
    }
    return map;
  }, [prospects, aliados]);

  const sinAm = useMemo(() => aliados.filter((a) => !a.account_manager_id), [aliados]);
  const cobertura = aliados.length > 0 ? ((aliados.length - sinAm.length) / aliados.length) * 100 : null;

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

  // Lo que va a pasar de verdad. La cifra importante es la que NO se mueve: es
  // la pregunta que hace todo el mundo antes de tocar el botón.
  const impacto = useMemo(() => {
    let cambian = 0;
    let proyectosIntactos = 0;
    for (const a of elegidos) {
      if ((a.account_manager_id || null) === destinoId) continue;
      cambian += 1;
      proyectosIntactos += cargaPorAliado.get(a.id)?.total || 0;
    }
    return { cambian, proyectosIntactos };
  }, [elegidos, destinoId, cargaPorAliado]);

  const puedeGuardar = elegidos.length > 0 && amDestino !== "" && !guardando;

  // Asignación de UNA fila, desde el propio selector de la tabla. Con 200
  // aliados pendientes, obligar a marcar-elegir-guardar por cada uno es un
  // castigo: la vía de lote es para repartos grandes, no para el caso normal.
  const asignarFila = async (aliadoId: string, amId: string | null, nombre: string) => {
    setGuardandoFila(aliadoId);
    setErrorMsg("");
    setOkMsg("");
    try {
      await assignAccountManager([aliadoId], amId, null);
      const destino = amId ? nombrePorId.get(amId) || "su Account Manager" : "la ruleta";
      setOkMsg(`${nombre} → ${destino}. Aplica a lo que capture desde ahora; sus proyectos actuales no se movieron.`);
    } catch (e: any) {
      console.error("Error asignando Account Manager:", e);
      setErrorMsg(e?.message || "No se pudo asignar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setGuardandoFila(null);
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
        setOkMsg("No había nada que cambiar: esos aliados ya estaban así.");
      } else {
        const destino = destinoId ? nombrePorId.get(destinoId) || "el Account Manager" : "la ruleta";
        setOkMsg(
          `${n} aliado(s) asignado(s) a ${destino}. Aplica a los proyectos que capturen desde ahora; los ${impacto.proyectosIntactos} que ya tenían no se movieron.`
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
    // Sin `animate-fade-in`: esa clase deja un `transform` puesto y un ancestro
    // con transform se vuelve el bloque contenedor de sus descendientes
    // `fixed`, que es lo que dejó inservible esta barra la primera vez.
    <div
      className={`space-y-5 text-slate-800 dark:text-slate-100 ${seleccion.size > 0 ? "pb-32" : ""}`}
    >
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white leading-tight flex items-center gap-2">
            <UserCog className="h-5 w-5 text-emerald-600 dark:text-emerald-400" strokeWidth={2.2} />
            Asignación AM
          </h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            Cada aliado tiene un Account Manager. Los proyectos que capture nacen con él.
          </p>
        </div>
      </div>

      {/* Lo primero que hay que entender de esta pantalla: no mueve el pasado. */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-5 py-3.5 flex items-start gap-3">
        <ShieldCheck className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500 mt-0.5" />
        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          Asignar aquí <strong>no mueve ningún proyecto de los que ya existen</strong>. Solo decide a
          quién le llegan los que ese aliado capture <strong>a partir de ahora</strong>. Los proyectos en
          curso —y con ellos las métricas y las comisiones— se quedan con el Account Manager que los
          trabaja, y ese se cambia uno por uno en{" "}
          <Link href="/admin/clientes" className="underline font-semibold">
            Gestión de Clientes
          </Link>
          .
        </p>
      </div>

      {/* Estado de cobertura */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Aliados" value={aliados.length} icon={Users} tone="slate" />
        <StatCard label="Con AM" value={aliados.length - sinAm.length} icon={UserCheck} tone="emerald" />
        <StatCard
          label="Sin AM"
          value={sinAm.length}
          sub={sinAm.length > 0 ? "los reparte la ruleta" : "ninguno"}
          icon={AlertTriangle}
          tone={sinAm.length > 0 ? "amber" : "emerald"}
        />
        <StatCard label="Cobertura" value={fmtPct(cobertura, 0)} icon={Target} tone="teal" />
      </div>

      {sinAm.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 px-5 py-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <p className="text-[12px] text-emerald-800 dark:text-emerald-200 leading-relaxed">
            <strong>Todos los aliados tienen Account Manager.</strong> Ningún proyecto nuevo va a
            depender del sorteo.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-5 py-4 flex items-start gap-3">
          <Dices className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="text-[12px] text-amber-800 dark:text-amber-200 leading-relaxed">
            <strong>{sinAm.length} aliado(s) todavía sin Account Manager.</strong> Nada se queda sin
            dueño: lo que capturen lo sortea la ruleta entre los{" "}
            <strong>{enRuleta.length} AM que la tienen encendida</strong>
            {enRuleta.length === 0 ? (
              <>
                {" "}
                —y ahora mismo no hay ninguno, así que caerían en la mesa de dirección—
              </>
            ) : null}
            . Asígnalos desde el selector de su fila —o marca varios y usa la barra de abajo— para que
            dejen de depender del azar.
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
                  {["Aliado", "Tipo", "Empresa", "Alta", "Account Manager", "Proyectos", "Con su AM"].map((h, i) => (
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
                      <td className="px-3 py-2.5">
                        {/* Selector en la propia fila: es la vía rápida. El
                            stopPropagation evita que elegir aquí marque de paso
                            la casilla de la fila. */}
                        <div className="relative inline-flex items-center" onClick={(ev) => ev.stopPropagation()}>
                          <select
                            value={a.account_manager_id || ""}
                            disabled={guardandoFila === a.id}
                            onChange={(ev) => {
                              const v = ev.target.value || null;
                              if ((a.account_manager_id || null) === v) return;
                              void asignarFila(a.id, v, a.full_name);
                            }}
                            title={am ? `Gestiona ${am}` : "Sin Account Manager: lo que capture lo sortea la ruleta"}
                            className={`appearance-none pl-5 pr-6 py-1 rounded-lg text-[11px] font-semibold border outline-none transition-colors max-w-[190px] truncate cursor-pointer ${
                              am
                                ? "bg-white dark:bg-slate-950/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:border-emerald-500"
                                : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 focus:border-amber-500"
                            } ${guardandoFila === a.id ? "opacity-50 cursor-wait" : ""}`}
                          >
                            <option value="">Sin AM · a la ruleta</option>
                            {accountManagers.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.full_name}
                              </option>
                            ))}
                          </select>
                          <span className="absolute left-1.5 pointer-events-none">
                            {guardandoFila === a.id ? (
                              <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                            ) : am ? (
                              <span className="block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            ) : (
                              <Dices className="h-3 w-3 text-amber-500" />
                            )}
                          </span>
                          <ChevronDown className="h-3 w-3 absolute right-1.5 text-slate-400 pointer-events-none" />
                        </div>
                      </td>
                      <td
                        className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-700 dark:text-slate-200"
                        title="Proyectos vivos de este aliado. Ninguno cambia de Account Manager al asignar aquí."
                      >
                        {carga?.total || 0}
                      </td>
                      <td
                        className="px-3 pr-5 py-2.5 text-right tabular-nums text-slate-400 dark:text-slate-500"
                        title="De esos proyectos, los que ya está gestionando el Account Manager de este aliado. El resto son del reparto anterior y se quedan donde están."
                      >
                        {a.account_manager_id ? carga?.conSuAm || 0 : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Barra de acción: solo aparece cuando hay algo seleccionado.
          Va `fixed` y no `sticky` a propósito: dentro de /admin el contenedor
          del layout lleva `overflow-hidden`, así que `sticky` no se pega nunca
          y la barra se queda al final de una tabla de 200 filas, fuera de la
          vista. Con `fixed` + `pb-32` en la raíz siempre está a mano. */}
      {seleccion.size > 0 && (
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
                    {am.auto_assign_enabled === true ? " · en la ruleta" : ""}
                  </option>
                ))}
                <option value={SIN_AM}>Quitar el AM (vuelve a la ruleta)</option>
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
              <strong>{impacto.cambian}</strong> aliado(s) cambian de Account Manager, y aplica solo a lo
              que capturen desde ahora ·{" "}
              <strong>{impacto.proyectosIntactos}</strong> proyecto(s) en curso{" "}
              <strong>NO se mueven</strong>: siguen con quien los gestiona hoy.
            </p>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
        Aquí se decide con qué Account Manager <strong>nacen</strong> los proyectos. El de un proyecto
        que ya existe se cambia en{" "}
        <Link href="/admin/clientes" className="underline font-semibold">
          Gestión de Clientes
        </Link>
        .
      </p>
    </div>
  );
}
