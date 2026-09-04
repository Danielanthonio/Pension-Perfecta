"use client";

import { Suspense } from "react";
import { useApp } from "@/utils/context/AppContext";
import AsignacionAmModule from "@/components/am/AsignacionAmModule";

// Solo Dirección. Repartir la cartera de aliados decide de quién serán los
// proyectos que entren a partir de ahora —y con ellos la comisión de gestión de
// dos personas—, así que no se delega. El límite real lo impone la base dentro
// de `asigna_am_a_aliado`; esta pantalla solo evita el intento.
function AsignacionAmGate() {
  const { user, isLoading } = useApp();

  if (isLoading || !user) {
    return <div className="p-6 text-sm text-slate-400">Cargando…</div>;
  }

  if (user.role !== "director") {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm px-6 py-14 text-center">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Aquí solo entra Dirección.</p>
        <p className="mt-1.5 text-[12px] text-slate-500 dark:text-slate-400">
          Repartir los aliados entre los Account Managers decide de quién serán los proyectos que
          lleguen, así que no se delega.
        </p>
      </div>
    );
  }

  return <AsignacionAmModule />;
}

export default function AsignacionAmPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Cargando…</div>}>
      <AsignacionAmGate />
    </Suspense>
  );
}
