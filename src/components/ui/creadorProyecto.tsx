import React from "react";
import { UserRound, Headset, ShieldCheck, Handshake, Landmark, HelpCircle } from "lucide-react";

/**
 * QUIÉN CAPTURÓ el proyecto — el "Creado por" del reporte de Dirección.
 *
 * Es un dato distinto de los dos que ya vivían en `prospects`:
 *   · `aliado_id`         → de QUIÉN ES el proyecto (el AM puede capturar a nombre de un aliado).
 *   · `account_manager_id`→ quién LO GESTIONA.
 *   · `created_by`        → quién lo TECLEÓ. Esto.
 *
 * El rol es el que tenía el creador en el momento del alta (snapshot en base,
 * ver migración 20260824000000_creador_de_proyecto.sql): si un aliado asciende a
 * AM, sus altas viejas siguen contando como altas de aliado.
 *
 * Sirve para medir la adopción de la plataforma: la meta es que la barra de
 * "creados por el aliado" suba y la de "creados por el Account Manager" baje.
 */
export type CreadorRole =
  | "aliado"
  | "account_manager"
  | "closer"
  | "admin"
  | "director"
  | "finanzas";

export interface CreadorMeta {
  /** Clave agregada para reportes: admin y director colapsan en "direccion". */
  kind: "aliado" | "account_manager" | "closer" | "direccion" | "finanzas";
  label: string;
  short: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Clases del badge (light + dark). */
  badge: string;
  /** Clases del recuadro del icono (cadena comercial de la ficha). */
  wrap: string;
  /** Color sólido para los charts. */
  color: string;
}

const META: Record<CreadorMeta["kind"], CreadorMeta> = {
  aliado: {
    kind: "aliado",
    label: "Aliado",
    short: "Aliado",
    Icon: UserRound,
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50",
    wrap: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400",
    color: "#059669",
  },
  account_manager: {
    kind: "account_manager",
    label: "Account Manager",
    short: "Account Mgr.",
    Icon: Headset,
    badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50",
    wrap: "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400",
    color: "#2a78d6",
  },
  closer: {
    kind: "closer",
    label: "Closer",
    short: "Closer",
    Icon: Handshake,
    badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50",
    wrap: "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400",
    color: "#eda100",
  },
  direccion: {
    kind: "direccion",
    label: "Dirección",
    short: "Dirección",
    Icon: ShieldCheck,
    badge: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900/50",
    wrap: "bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400",
    color: "#7c3aed",
  },
  finanzas: {
    kind: "finanzas",
    label: "Finanzas",
    short: "Finanzas",
    Icon: Landmark,
    badge: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-400 dark:border-cyan-900/50",
    wrap: "bg-cyan-50 dark:bg-cyan-950/30 text-cyan-600 dark:text-cyan-400",
    color: "#0891b2",
  },
};

/** Proyectos anteriores al registro de autoría (o cuyo creador no se pudo reconstruir). */
export const CREADOR_SIN_REGISTRO: CreadorMeta = {
  kind: "aliado", // no se usa: `getCreadorMeta` devuelve null y la UI decide.
  label: "Sin registro",
  short: "Sin registro",
  Icon: HelpCircle,
  badge: "border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-850/40",
  wrap: "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500",
  color: "#94a3b8",
};

/** Meta del rol del creador. `null` cuando el proyecto no tiene autoría registrada. */
export function getCreadorMeta(role: string | null | undefined): CreadorMeta | null {
  if (!role) return null;
  if (role === "admin" || role === "director") return META.direccion;
  return META[role as CreadorMeta["kind"]] ?? null;
}

/** Etiqueta del rol del creador, lista para una celda o un CSV. */
export function getCreadorRoleLabel(role: string | null | undefined): string {
  return getCreadorMeta(role)?.label ?? "Sin registro";
}

/**
 * Celda "Creado por" de las tablas: el nombre de quien capturó y, debajo, el
 * badge de con qué sombrero lo hizo. Sin autoría registrada muestra el estado
 * neutro "Sin registro" — la plataforma no adivina quién dio de alta.
 */
export function CreadorPorCell({
  name,
  role,
  className = "",
}: {
  name?: string | null;
  role?: string | null;
  className?: string;
}) {
  const meta = getCreadorMeta(role);
  if (!meta) {
    return (
      <div className={className}>
        <span className="font-semibold text-slate-400 dark:text-slate-500 block truncate max-w-[150px]">Sin registro</span>
        <span className="text-[10px] text-slate-350 dark:text-slate-600 block mt-0.5">Alta previa a la medición</span>
      </div>
    );
  }
  const { Icon, label, badge } = meta;
  return (
    <div className={className}>
      <span className="font-semibold text-slate-700 dark:text-slate-300 block truncate max-w-[150px]">
        {name || label}
      </span>
      <span className={`inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide border ${badge}`}>
        <Icon className="h-3 w-3 shrink-0" />
        {label}
      </span>
    </div>
  );
}

/** Badge compacto (una línea), para fichas y encabezados. */
export function CreadorBadge({
  name,
  role,
  className = "",
}: {
  name?: string | null;
  role?: string | null;
  className?: string;
}) {
  const meta = getCreadorMeta(role);
  const { Icon, label, badge } = meta ?? CREADOR_SIN_REGISTRO;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold border ${badge} ${className}`}>
      <Icon className="h-3 w-3 shrink-0" />
      {meta ? `${label}${name ? ` · ${name}` : ""}` : "Sin registro"}
    </span>
  );
}
