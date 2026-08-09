"use client";

// Gráficos de los reportes por rol.
//
// SVG a mano, como todo lo que dibuja esta app (Reportes, Closers, Agenda Futura):
// el proyecto no tiene librería de charts y no se añade una por esto.
//
// La paleta es la misma de ocho categóricas del módulo Closers, en el mismo orden
// y con el mismo par claro/oscuro: una métrica —o un AM— conserva su color al
// pasar de un módulo a otro. Ambos juegos pasan las comprobaciones de contraste
// contra su superficie y de daltonismo.
//
// Regla que se repite en todos: el color sigue a la ENTIDAD, nunca a su posición
// en el ranking. Reordenar la tabla no puede repintar las barras.

import React from "react";
import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Paleta y primitivas de UI
// ---------------------------------------------------------------------------

export const VIZ_SERIES_VARS = [
  "var(--rp-1)",
  "var(--rp-2)",
  "var(--rp-3)",
  "var(--rp-4)",
  "var(--rp-5)",
  "var(--rp-6)",
  "var(--rp-7)",
  "var(--rp-8)",
];
export const VIZ_MUTED_VAR = "var(--rp-muted)";
export const MAX_SERIES = VIZ_SERIES_VARS.length;

export const REPORTES_VIZ_STYLE = `
.reportes-viz{
  --rp-1:#2a78d6; --rp-2:#eb6834; --rp-3:#1baf7a; --rp-4:#eda100;
  --rp-5:#e87ba4; --rp-6:#008300; --rp-7:#4a3aa7; --rp-8:#e34948;
  --rp-muted:#94a3b8;
}
.dark .reportes-viz{
  --rp-1:#3987e5; --rp-2:#d95926; --rp-3:#199e70; --rp-4:#c98500;
  --rp-5:#d55181; --rp-6:#008300; --rp-7:#9085e9; --rp-8:#e66767;
  --rp-muted:#64748b;
}
`;

export const colorSlot = (i: number) => (i >= 0 && i < MAX_SERIES ? VIZ_SERIES_VARS[i] : VIZ_MUTED_VAR);

/** Mapa estable entidad → color. Se espera la lista en un orden que NO sea el ranking. */
export function colorMapEstable(ids: string[]): Map<string, string> {
  const map = new Map<string, string>();
  ids.forEach((id, i) => map.set(id, colorSlot(i)));
  return map;
}

export const segmented =
  "flex items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 p-0.5 ring-1 ring-inset ring-slate-200/70 dark:ring-slate-700/50";

export const pill = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
    active
      ? "bg-emerald-600 text-white shadow-sm"
      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
  }`;

/** Chip de tasa general (los recuadros azules del boceto). */
export function ChipTasa({ label, value, tone = "sky" }: { label: string; value: string; tone?: "sky" | "amber" | "teal" }) {
  const tones = {
    sky: "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 ring-sky-500/20",
    amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-amber-500/20",
    teal: "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 ring-teal-500/20",
  } as const;
  return (
    <div className={`rounded-xl px-3 py-1.5 ring-1 ring-inset ${tones[tone]}`}>
      <span className="block text-[9px] font-bold uppercase tracking-[0.06em] opacity-80 leading-tight">{label}</span>
      <span className="block text-sm font-bold tabular-nums leading-tight">{value}</span>
    </div>
  );
}

export function PanelHeader({
  icon: Icon,
  title,
  subtitle,
  tone = "emerald",
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: React.ReactNode;
  tone?: "emerald" | "sky" | "indigo" | "violet" | "amber" | "teal";
  children?: React.ReactNode;
}) {
  const tones = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 ring-emerald-500/10",
    sky: "bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 ring-sky-500/10",
    indigo: "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 ring-indigo-500/10",
    violet: "bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 ring-violet-500/10",
    amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 ring-amber-500/10",
    teal: "bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 ring-teal-500/10",
  } as const;
  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-inset ${tones[tone]}`}>
          <Icon className="h-4 w-4" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 print:hidden">{children}</div>}
    </div>
  );
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return <div className="py-16 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">{children}</div>;
}

/** Leyenda clicable. Obligatoria con 2+ series: la identidad nunca es solo el color. */
export function Leyenda({
  series,
  onToggle,
  ocultas,
  sufijo = "",
}: {
  // `total` es opcional: las entradas que solo explican un color (las tasas
  // superpuestas del ranking) no tienen un total que enseñar, y pintarles un 0
  // haría creer que la tasa vale cero.
  series: { id: string; label: string; color: string; total?: number }[];
  onToggle?: (id: string) => void;
  ocultas?: Set<string>;
  sufijo?: string;
}) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
      {series.map((s) => {
        const off = ocultas?.has(s.id);
        const cls = `flex items-center gap-1.5 text-[11px] transition-opacity ${
          onToggle ? "hover:opacity-70 active:scale-95" : ""
        } ${off ? "opacity-40" : ""}`;
        const inner = (
          <>
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="font-medium text-slate-600 dark:text-slate-300">{s.label}</span>
            {typeof s.total === "number" && (
              <span className="font-bold tabular-nums text-slate-800 dark:text-slate-100">
                {s.total}
                {sufijo}
              </span>
            )}
          </>
        );
        return (
          <li key={s.id}>
            {onToggle ? (
              <button type="button" onClick={() => onToggle(s.id)} className={cls} title={off ? `Mostrar ${s.label}` : `Ocultar ${s.label}`}>
                {inner}
              </button>
            ) : (
              <span className={cls}>{inner}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Geometría común
// ---------------------------------------------------------------------------

const W = 880;
const H = 300;
const PAD_T = 18;

interface Ejes {
  padL: number;
  padR: number;
  padB: number;
  plotW: number;
  plotH: number;
  baseline: number;
}

const ejes = (padL: number, padR: number, padB: number): Ejes => ({
  padL,
  padR,
  padB,
  plotW: W - padL - padR,
  plotH: H - PAD_T - padB,
  baseline: PAD_T + (H - PAD_T - padB),
});

function Rejilla({ e, max, ticks = 4, sufijo = "" }: { e: Ejes; max: number; ticks?: number; sufijo?: string }) {
  const vals = Array.from(new Set(Array.from({ length: ticks + 1 }, (_, i) => Math.round((max * i) / ticks))));
  return (
    <>
      {vals.map((v) => {
        const yy = PAD_T + e.plotH - (v / max) * e.plotH;
        return (
          <g key={v}>
            <line x1={e.padL} y1={yy} x2={W - e.padR} y2={yy} className="stroke-slate-100 dark:stroke-slate-800" strokeWidth="1" />
            <text x={e.padL - 8} y={yy + 3} textAnchor="end" className="fill-slate-400 dark:fill-slate-500 tabular-nums" style={{ fontSize: 9 }}>
              {v}
              {sufijo}
            </text>
          </g>
        );
      })}
    </>
  );
}

/** Nombre largo recortado con puntos suspensivos reales (SVG no hace ellipsis). */
const corta = (s: string, n: number) => (s.length > n ? `${s.substring(0, n - 1)}…` : s);

// ---------------------------------------------------------------------------
// 1 · Serie temporal multi-línea (o barras agrupadas por cubo)
// ---------------------------------------------------------------------------

export interface SerieTemporal {
  id: string;
  label: string;
  color: string;
  values: number[];
}

export function SerieChart({
  cubos,
  series,
  tipo,
  unidad = "proyecto(s)",
}: {
  cubos: { iso: string; label: string; full: string }[];
  series: SerieTemporal[];
  tipo: "lineas" | "barras";
  unidad?: string;
}) {
  const n = cubos.length;
  if (n === 0 || series.length === 0) return <Vacio>No existen resultados para el período seleccionado.</Vacio>;

  const e = ejes(46, 16, 34);
  const maxV = Math.max(1, ...series.flatMap((s) => s.values));
  const yFor = (v: number) => PAD_T + e.plotH - (v / maxV) * e.plotH;
  const bandW = e.plotW / n;
  const xCenter = (i: number) => e.padL + bandW * i + bandW / 2;
  const xLine = (i: number) => (n <= 1 ? e.padL + e.plotW / 2 : e.padL + (i / (n - 1)) * e.plotW);
  const tickEvery = Math.max(1, Math.ceil(n / 12));

  // En barras cada serie ocupa su propia columna dentro del cubo: apiladas
  // mentirían, porque "Evaluados" y "Aprobados" son subconjuntos del mismo total
  // y sumarlos contaría dos veces el mismo proyecto.
  const grupoW = Math.min(bandW * 0.78, 56);
  const barW = Math.max(2, grupoW / series.length - 1.5);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet" role="img">
      <Rejilla e={e} max={maxV} />

      {tipo === "barras"
        ? cubos.map((b, i) => (
            <g key={b.iso}>
              {series.map((s, j) => {
                const v = s.values[i] || 0;
                const h = v > 0 ? Math.max((v / maxV) * e.plotH, 1.5) : 0;
                const x = xCenter(i) - grupoW / 2 + j * (grupoW / series.length);
                return h > 0 ? (
                  <rect key={s.id} x={x} y={e.baseline - h} width={barW} height={h} rx={2} fill={s.color}>
                    <title>{`${b.full} · ${s.label}: ${v} ${unidad}`}</title>
                  </rect>
                ) : null;
              })}
              <rect x={e.padL + bandW * i} y={PAD_T} width={bandW} height={e.plotH} fill="transparent">
                <title>{`${b.full}\n${series.map((s) => `${s.label}: ${s.values[i] || 0}`).join("\n")}`}</title>
              </rect>
            </g>
          ))
        : series.map((s) => {
            const d = s.values.map((v, i) => `${i === 0 ? "M" : "L"} ${xLine(i).toFixed(1)} ${yFor(v).toFixed(1)}`).join(" ");
            return (
              <g key={s.id}>
                <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {n <= 40 &&
                  s.values.map((v, i) => (
                    <circle key={i} cx={xLine(i)} cy={yFor(v)} r={3.5} fill={s.color} className="stroke-white dark:stroke-slate-900" strokeWidth="2">
                      <title>{`${cubos[i].full} · ${s.label}: ${v} ${unidad}`}</title>
                    </circle>
                  ))}
              </g>
            );
          })}

      {/* Zona de impacto por cubo: el tooltip da las series de una vez. */}
      {tipo === "lineas" &&
        cubos.map((b, i) => (
          <rect key={`hit-${b.iso}`} x={xLine(i) - bandW / 2} y={PAD_T} width={bandW} height={e.plotH} fill="transparent">
            <title>{`${b.full}\n${series.map((s) => `${s.label}: ${s.values[i] || 0}`).join("\n")}`}</title>
          </rect>
        ))}

      {cubos.map((b, i) =>
        i % tickEvery === 0 || i === n - 1 ? (
          <text
            key={`x-${b.iso}`}
            x={tipo === "barras" ? xCenter(i) : xLine(i)}
            y={H - 12}
            textAnchor="middle"
            className="fill-slate-400 dark:fill-slate-500"
            style={{ fontSize: 9 }}
          >
            {b.label}
          </text>
        ) : null
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 2 · Ranking: barras por entidad + tasas superpuestas
// ---------------------------------------------------------------------------

export interface FilaRanking {
  id: string;
  nombre: string;
  color: string;
  valor: number;
  /** Tasas en %, opcionales. Se dibujan como líneas sobre un eje derecho 0–100. */
  tasas?: { id: string; label: string; color: string; value: number | null }[];
}

export function RankingChart({
  filas,
  metricaLabel,
  onSelect,
  seleccion,
}: {
  filas: FilaRanking[];
  metricaLabel: string;
  onSelect?: (id: string) => void;
  seleccion?: string[];
}) {
  const n = filas.length;
  if (n === 0) return <Vacio>No hay entidades con proyectos en el período.</Vacio>;

  const conTasas = (filas[0].tasas?.length ?? 0) > 0;
  const e = ejes(46, conTasas ? 42 : 16, 62);
  const maxV = Math.max(1, ...filas.map((f) => f.valor));
  const bandW = e.plotW / n;
  const barW = Math.min(44, Math.max(4, bandW * 0.62));
  const xCenter = (i: number) => e.padL + bandW * i + bandW / 2;
  const yFor = (v: number) => PAD_T + e.plotH - (v / maxV) * e.plotH;
  // Eje derecho fijo 0–100: una tasa siempre se lee contra la misma referencia,
  // así que dos capturas del mismo reporte son comparables a ojo.
  const yPct = (v: number) => PAD_T + e.plotH - (v / 100) * e.plotH;

  const lineas = conTasas
    ? (filas[0].tasas || []).map((t, j) => ({
        id: t.id,
        label: t.label,
        color: t.color,
        puntos: filas.map((f, i) => ({ x: xCenter(i), v: f.tasas?.[j]?.value ?? null })),
      }))
    : [];

  const etiquetarValor = n <= 22;
  const rotarNombres = n > 6;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet" role="img">
      <Rejilla e={e} max={maxV} />

      {conTasas && (
        <>
          {[0, 25, 50, 75, 100].map((v) => (
            <text key={v} x={W - e.padR + 6} y={yPct(v) + 3} textAnchor="start" className="fill-slate-400 dark:fill-slate-500 tabular-nums" style={{ fontSize: 9 }}>
              {v}%
            </text>
          ))}
        </>
      )}

      {filas.map((f, i) => {
        const h = f.valor > 0 ? Math.max((f.valor / maxV) * e.plotH, 2) : 0;
        const activa = !seleccion || seleccion.length === 0 || seleccion.includes(f.id);
        return (
          <g key={f.id} className={onSelect ? "cursor-pointer" : undefined} onClick={onSelect ? () => onSelect(f.id) : undefined}>
            <rect x={xCenter(i) - barW / 2} y={e.baseline - h} width={barW} height={h} rx={3} fill={f.color} opacity={activa ? 1 : 0.28}>
              <title>{`${f.nombre}\n${metricaLabel}: ${f.valor}${(f.tasas || []).map((t) => `\n${t.label}: ${t.value === null ? "—" : `${t.value.toFixed(1)} %`}`).join("")}`}</title>
            </rect>
            {etiquetarValor && f.valor > 0 && (
              <text x={xCenter(i)} y={e.baseline - h - 5} textAnchor="middle" className="fill-slate-600 dark:fill-slate-300 tabular-nums" style={{ fontSize: 9, fontWeight: 700 }}>
                {f.valor}
              </text>
            )}
            <text
              x={xCenter(i)}
              y={e.baseline + (rotarNombres ? 12 : 14)}
              textAnchor={rotarNombres ? "end" : "middle"}
              transform={rotarNombres ? `rotate(-38 ${xCenter(i)} ${e.baseline + 12})` : undefined}
              className="fill-slate-500 dark:fill-slate-400"
              style={{ fontSize: 9 }}
            >
              {corta(f.nombre, rotarNombres ? 18 : 14)}
            </text>
          </g>
        );
      })}

      {lineas.map((l) => {
        const pts = l.puntos.filter((p) => p.v !== null);
        if (pts.length === 0) return null;
        const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${yPct(p.v as number).toFixed(1)}`).join(" ");
        return (
          <g key={l.id}>
            <path d={d} fill="none" stroke={l.color} strokeWidth="1.8" strokeDasharray="5 3" strokeLinejoin="round" />
            {n <= 22 &&
              pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={yPct(p.v as number)} r={2.8} fill={l.color} className="stroke-white dark:stroke-slate-900" strokeWidth="1.5">
                  <title>{`${l.label}: ${(p.v as number).toFixed(1)} %`}</title>
                </circle>
              ))}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 3 · Barras agrupadas por entidad (boceto «AM x Estados (grupo)»)
// ---------------------------------------------------------------------------

export function GrupoBarrasChart({
  entidades,
  series,
  onSelect,
}: {
  entidades: { id: string; nombre: string }[];
  /** Una serie por métrica; `values` en el mismo orden que `entidades`. */
  series: { id: string; label: string; color: string; values: number[] }[];
  onSelect?: (id: string) => void;
}) {
  const n = entidades.length;
  if (n === 0 || series.length === 0) return <Vacio>No hay entidades con proyectos en el período.</Vacio>;

  const e = ejes(46, 16, 62);
  const maxV = Math.max(1, ...series.flatMap((s) => s.values));
  const bandW = e.plotW / n;
  const grupoW = Math.min(bandW * 0.8, 120);
  const barW = Math.max(2, grupoW / series.length - 2);
  const xCenter = (i: number) => e.padL + bandW * i + bandW / 2;
  const rotarNombres = n > 6;
  const etiquetar = n * series.length <= 40;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet" role="img">
      <Rejilla e={e} max={maxV} />
      {entidades.map((ent, i) => (
        <g key={ent.id} className={onSelect ? "cursor-pointer" : undefined} onClick={onSelect ? () => onSelect(ent.id) : undefined}>
          {series.map((s, j) => {
            const v = s.values[i] || 0;
            const h = v > 0 ? Math.max((v / maxV) * e.plotH, 1.5) : 0;
            const x = xCenter(i) - grupoW / 2 + j * (grupoW / series.length);
            return (
              <g key={s.id}>
                {h > 0 && (
                  <rect x={x} y={e.baseline - h} width={barW} height={h} rx={2} fill={s.color}>
                    <title>{`${ent.nombre} · ${s.label}: ${v}`}</title>
                  </rect>
                )}
                {etiquetar && v > 0 && (
                  <text x={x + barW / 2} y={e.baseline - h - 4} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400 tabular-nums" style={{ fontSize: 8, fontWeight: 700 }}>
                    {v}
                  </text>
                )}
              </g>
            );
          })}
          <text
            x={xCenter(i)}
            y={e.baseline + (rotarNombres ? 12 : 14)}
            textAnchor={rotarNombres ? "end" : "middle"}
            transform={rotarNombres ? `rotate(-38 ${xCenter(i)} ${e.baseline + 12})` : undefined}
            className="fill-slate-500 dark:fill-slate-400"
            style={{ fontSize: 9 }}
          >
            {corta(ent.nombre, rotarNombres ? 18 : 14)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 4 · Avance contra el objetivo a la fecha (boceto «AM Agenda»)
// ---------------------------------------------------------------------------

export interface FilaAvance {
  id: string;
  nombre: string;
  /** Meta del mes entero, tal como la teclea Dirección. */
  objetivo: number;
  /** Esa meta prorrateada al rango del informe: el objetivo A LA FECHA. */
  esperado: number;
  /** Lo conseguido dentro de ese mismo rango. */
  real: number;
}

/**
 * Una sola barra por entidad: su porcentaje de avance sobre el objetivo a la fecha.
 *
 * Antes iban dos barras enfrentadas —meta y real— y la comparación había que
 * hacerla a ojo, columna contra columna, con el agravante de que un AM con meta
 * 200 parecía peor que uno con meta 20 aunque fuera igual de bien. En porcentaje
 * la referencia es la misma para todos, el 100 % de la rejilla, y quién llega se
 * ve de un golpe. La cantidad no se pierde: va escrita bajo el porcentaje como
 * «conseguidas / objetivo a la fecha».
 */
export function AvanceObjetivoChart({ filas, unidad = "agendas" }: { filas: FilaAvance[]; unidad?: string }) {
  const n = filas.length;
  if (n === 0) return <Vacio>No hay account managers que medir en el período.</Vacio>;

  const e = ejes(46, 16, 62);
  // Sin objetivo a la fecha no hay porcentaje que calcular: dividir por cero
  // daría Infinity y una barra fuera del lienzo.
  const pctDe = (f: FilaAvance) => (f.esperado > 0 ? (f.real / f.esperado) * 100 : null);
  const maxPct = Math.max(0, ...filas.map((f) => pctDe(f) ?? 0));
  // Techo con aire: las dos etiquetas van ENCIMA de la barra y necesitan sitio.
  // Nunca baja de 120 para que la línea del 100 % quede dentro aunque nadie llegue.
  const bruto = Math.max(120, maxPct * 1.18);
  // El techo se redondea a un paso redondo y la rejilla se dibuja con ESE paso:
  // así el eje va de 20 en 20 en vez de soltar 0 · 33 · 65 · 98, y el 100 % —que
  // es la vara— cae siempre justo encima de una línea.
  const paso = bruto <= 200 ? 20 : bruto <= 500 ? 50 : 100;
  const maxV = Math.ceil(bruto / paso) * paso;
  const bandW = e.plotW / n;
  const barW = Math.min(52, Math.max(6, bandW * 0.46));
  const xCenter = (i: number) => e.padL + bandW * i + bandW / 2;
  const yFor = (v: number) => PAD_T + e.plotH - (v / maxV) * e.plotH;
  const rotarNombres = n > 6;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet" role="img">
      <Rejilla e={e} max={maxV} ticks={Math.round(maxV / paso)} sufijo="%" />

      {filas.map((f, i) => {
        const pct = pctDe(f);
        // Sin meta puesta no hay nada que cumplir ni que incumplir: no se pinta
        // barra. Dibujarla a cero diría "va fatal" cuando lo único que pasa es
        // que Dirección todavía no le ha fijado objetivo.
        const h = pct === null || pct <= 0 ? 0 : Math.max((Math.min(pct, maxV) / maxV) * e.plotH, 2);
        const fill = pct === null ? VIZ_MUTED_VAR : pct >= 100 ? "var(--rp-6)" : pct >= 70 ? "var(--rp-4)" : "var(--rp-8)";
        const yTope = e.baseline - h;
        const tip =
          `${f.nombre}\n` +
          `Llevan: ${f.real} ${unidad}\n` +
          `Objetivo a la fecha: ${f.esperado}\n` +
          `Meta del mes: ${f.objetivo}\n` +
          `Avance: ${pct === null ? "sin objetivo" : `${Math.round(pct)} %`}`;
        return (
          <g key={f.id}>
            {/* Zona de impacto a toda altura: el tooltip funciona igual cuando la
                barra es un hilo o cuando no hay barra que señalar. */}
            <rect x={e.padL + bandW * i} y={PAD_T} width={bandW} height={e.plotH} fill="transparent">
              <title>{tip}</title>
            </rect>
            {h > 0 && (
              <rect x={xCenter(i) - barW / 2} y={yTope} width={barW} height={h} rx={3} fill={fill}>
                <title>{tip}</title>
              </rect>
            )}
            <text
              x={xCenter(i)}
              y={yTope - 16}
              textAnchor="middle"
              className="fill-slate-700 dark:fill-slate-200 tabular-nums"
              style={{ fontSize: 11, fontWeight: 700 }}
            >
              {pct === null ? "Sin meta" : `${Math.round(pct)} %`}
            </text>
            <text
              x={xCenter(i)}
              y={yTope - 5}
              textAnchor="middle"
              className="fill-slate-400 dark:fill-slate-500 tabular-nums"
              style={{ fontSize: 9, fontWeight: 600 }}
            >
              {pct === null ? `${f.real} ${unidad}` : `${f.real} / ${f.esperado}`}
            </text>
            <text
              x={xCenter(i)}
              y={e.baseline + (rotarNombres ? 12 : 14)}
              textAnchor={rotarNombres ? "end" : "middle"}
              transform={rotarNombres ? `rotate(-38 ${xCenter(i)} ${e.baseline + 12})` : undefined}
              className="fill-slate-500 dark:fill-slate-400"
              style={{ fontSize: 9 }}
            >
              {corta(f.nombre, rotarNombres ? 18 : 14)}
            </text>
          </g>
        );
      })}

      {/* La meta a la fecha es el 100 %, la misma vara para todos. Va la última
          para que ninguna barra la tape. */}
      <line x1={e.padL} y1={yFor(100)} x2={W - e.padR} y2={yFor(100)} stroke="var(--rp-8)" strokeWidth="1.6" strokeDasharray="5 3" />
      <text x={W - e.padR} y={yFor(100) - 5} textAnchor="end" fill="var(--rp-8)" style={{ fontSize: 9, fontWeight: 700 }}>
        objetivo a la fecha · 100 %
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 5 · Dona
// ---------------------------------------------------------------------------

export interface SegmentoDona {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  segments,
  centerTop,
  centerBottom,
  size = 176,
}: {
  segments: SegmentoDona[];
  centerTop: string;
  centerBottom: string;
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 60;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} className="shrink-0">
      <circle cx="80" cy="80" r={r} fill="none" stroke="currentColor" strokeWidth="20" className="text-slate-100 dark:text-slate-800" />
      {total > 0 &&
        segments.map((s, i) => {
          const frac = s.value / total;
          const visible = Math.max(frac * C - 2, 0.001);
          const el = (
            <circle
              key={i}
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="20"
              strokeDasharray={`${visible} ${C - visible}`}
              strokeDashoffset={-acc * C}
              transform="rotate(-90 80 80)"
              strokeLinecap="butt"
            >
              <title>{`${s.label}: ${s.value} (${(frac * 100).toFixed(1)}%)`}</title>
            </circle>
          );
          acc += frac;
          return el;
        })}
      <text x="80" y="74" textAnchor="middle" className="fill-slate-900 dark:fill-white" style={{ fontSize: 22, fontWeight: 700 }}>
        {centerTop}
      </text>
      <text x="80" y="92" textAnchor="middle" className="fill-slate-400 dark:fill-slate-500" style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.5 }}>
        {centerBottom}
      </text>
    </svg>
  );
}

export function DonutLegend({ segments, total }: { segments: SegmentoDona[]; total: number }) {
  return (
    <ul className="space-y-2 min-w-0 flex-1 w-full">
      {segments.map((s) => (
        <li key={s.label} className="flex items-center gap-2 text-[11px]">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
          <span className="font-medium text-slate-600 dark:text-slate-300 truncate flex-1" title={s.label}>
            {s.label}
          </span>
          <span className="font-bold tabular-nums text-slate-800 dark:text-slate-100">{s.value}</span>
          <span className="tabular-nums text-slate-400 dark:text-slate-500 w-12 text-right">
            {total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0"}%
          </span>
        </li>
      ))}
      {segments.length === 0 && <li className="text-[11px] text-slate-400 dark:text-slate-500">Sin datos.</li>}
    </ul>
  );
}
