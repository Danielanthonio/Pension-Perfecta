"use client";

import { Suspense } from "react";
import { useApp } from "@/utils/context/AppContext";
import AsignacionAmModule from "@/components/am/AsignacionAmModule";

// Solo Dirección. Mover a un aliado de Account Manager arrastra todos sus
// proyectos en curso —y con ellos las métricas y las comisiones de gestión de
// dos personas—, así que no se delega. El límite real lo impone la base dentro
// de `asigna_am_a_aliado` (20260831000001); esta pantalla solo evita el intento.
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
          Cambiar el Account Manager de un aliado mueve su cartera entera de proyectos, así que no se delega.
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
