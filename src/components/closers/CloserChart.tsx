"use client";

// Gráfico del módulo Closers: aliados incorporados por período.
//
// SVG a mano, como el resto de los gráficos de la app (Reportes, Agenda Futura):
// el proyecto no tiene librería de charts y no se añade una por esto.
//
// Paleta: las mismas ocho categóricas validadas del sistema de diseño, en ORDEN
// FIJO. Los cuatro primeros tonos son exactamente los que ya usa Reportes
// (`--cat-1..4`), así que un closer no cambia de color al pasar de un módulo a
// otro. Ambos juegos —claro y oscuro— pasan las comprobaciones de daltonismo y
// de contraste contra sus respectivas superficies (blanco y slate-900).
//
// El color sigue a la ENTIDAD, nunca a su posición en el ranking: el slot se
// asigna por antigüedad del closer (ver `colorMapFor`), así que filtrar o
// reordenar la tabla no repinta a los que quedan.

import React from "react";
import type { TipoGrafico } from "./closerTypes";

// ---------------------------------------------------------------------------
// Paleta
// ---------------------------------------------------------------------------

/** Ocho slots categóricos en orden fijo. El 9.º no existe: se pliega en "Otros". */
export const CLOSER_SERIES_VARS = [
  "var(--cl-1)",
  "var(--cl-2)",
  "var(--cl-3)",
  "var(--cl-4)",
  "var(--cl-5)",
  "var(--cl-6)",
  "var(--cl-7)",
  "var(--cl-8)",
];
export const CLOSER_MUTED_VAR = "var(--cl-muted)";
export const MAX_SERIES = CLOSER_SERIES_VARS.length;

/** Estilos de la paleta. Se inyecta una vez por página con `<style>`. */
export const CLOSER_VIZ_STYLE = `
.closers-viz{
  --cl-1:#2a78d6; --cl-2:#eb6834; --cl-3:#1baf7a; --cl-4:#eda100;
  --cl-5:#e87ba4; --cl-6:#008300; --cl-7:#4a3aa7; --cl-8:#e34948;
  --cl-muted:#94a3b8;
}
.dark .closers-viz{
  --cl-1:#3987e5; --cl-2:#d95926; --cl-3:#199e70; --cl-4:#c98500;
  --cl-5:#d55181; --cl-6:#008300; --cl-7:#9085e9; --cl-8:#e66767;
  --cl-muted:#64748b;
}
`;

/**
 * Mapa estable entidad → color. La clave es que el orden de entrada NO sea el
 * ranking: se espera la lista de closers ordenada por antigüedad, que no cambia
 * al aplicar filtros.
 */
export function colorMapFor(closerIdsPorAntiguedad: string[]): Map<string, string> {
  const map = new Map<string, string>();
  closerIdsPorAntiguedad.forEach((id, i) => {
    map.set(id, i < MAX_SERIES ? CLOSER_SERIES_VARS[i] : CLOSER_MUTED_VAR);
  });
  return map;
}

// ---------------------------------------------------------------------------
// Gráfico
// ---------------------------------------------------------------------------

export interface ChartBucket {
  iso: string;
  label: string;
  full: string;
}

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  /** Un valor por cubo, en el mismo orden que `buckets`. */
  values: number[];
}

const W = 880;
const H = 300;
const PAD_L = 44;
const PAD_R = 16;
const PAD_T = 18;
const PAD_B = 34;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const GAP = 2; // hueco de superficie entre rellenos (no borde)

export function CloserChart({
  buckets,
  series,
  tipo,
  onBucketClick,
}: {
  buckets: ChartBucket[];
  series: ChartSeries[];
  tipo: TipoGrafico;
  onBucketClick?: (iso: string) => void;
}) {
  const n = buckets.length;

  if (n === 0 || series.length === 0) {
    return (
      <div className="py-16 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">
        No existen resultados para el período seleccionado.
      </div>
    );
  }

  const totalPorCubo = buckets.map((_, i) => series.reduce((s, se) => s + (se.values[i] || 0), 0));
  // En barras apiladas el techo es el total del cubo; en líneas, la serie más alta.
  const maxV = Math.max(
    1,
    tipo === "barras" ? Math.max(...totalPorCubo) : Math.max(...series.flatMap((s) => s.values))
  );

  const yFor = (v: number) => PAD_T + PLOT_H - (v / maxV) * PLOT_H;
  const baseline = PAD_T + PLOT_H;
  const bandW = PLOT_W / n;
  const barW = Math.min(38, Math.max(6, bandW * 0.6));
  const xCenter = (i: number) => PAD_L + bandW * i + bandW / 2;
  const xLine = (i: number) => (n <= 1 ? PAD_L + PLOT_W / 2 : PAD_L + (i / (n - 1)) * PLOT_W);

  // Rejilla: hairlines sólidas, un tono por encima de la superficie.
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((g) => Math.round(maxV * g));
  const gridUnicos = Array.from(new Set(gridVals));

  const tickEvery = Math.max(1, Math.ceil(n / 12));
  // Etiquetar directamente el total solo cuando cabe; si no, lo lleva el tooltip
  // y la tabla de rendimiento de abajo (que es la vista tabular del gráfico).
  const mostrarTotales = tipo === "barras" && n <= 14;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet" role="img">
      {/* Rejilla + eje Y */}
      {gridUnicos.map((v) => {
        const yy = yFor(v);
        return (
          <g key={v}>
            <line
              x1={PAD_L}
              y1={yy}
              x2={W - PAD_R}
              y2={yy}
              className="stroke-slate-100 dark:stroke-slate-800"
              strokeWidth="1"
            />
            <text
              x={PAD_L - 8}
              y={yy + 3}
              textAnchor="end"
              className="fill-slate-400 dark:fill-slate-500 tabular-nums"
              style={{ fontSize: 9 }}
            >
              {v}
            </text>
          </g>
        );
      })}

      {tipo === "barras" ? (
        <>
          {buckets.map((b, i) => {
            let acc = 0;
            const x = xCenter(i) - barW / 2;
            return (
              <g key={b.iso}>
                {series.map((s) => {
                  const v = s.values[i] || 0;
                  if (v <= 0) return null;
                  const alturaBruta = (v / maxV) * PLOT_H;
                  const y = baseline - acc - alturaBruta;
                  acc += alturaBruta;
                  // Se recorta GAP px de alto para dejar hueco de superficie entre
                  // segmentos, en vez de dibujarles un borde.
                  const h = Math.max(alturaBruta - GAP, 1.5);
                  return (
                    <rect
                      key={s.id}
                      x={x}
                      y={y}
                      width={barW}
                      height={h}
                      rx={3}
                      fill={s.color}
                    >
                      <title>{`${b.full} · ${s.label}: ${v} aliado(s)`}</title>
                    </rect>
                  );
                })}
                {mostrarTotales && totalPorCubo[i] > 0 && (
                  <text
                    x={xCenter(i)}
                    y={baseline - acc - 6}
                    textAnchor="middle"
                    className="fill-slate-500 dark:fill-slate-400 tabular-nums"
                    style={{ fontSize: 10, fontWeight: 700 }}
                  >
                    {totalPorCubo[i]}
                  </text>
                )}
                {/* Zona de impacto ancha: el cubo entero, no solo la barra. */}
                <rect
                  x={PAD_L + bandW * i}
                  y={PAD_T}
                  width={bandW}
                  height={PLOT_H}
                  fill="transparent"
                  className={onBucketClick ? "cursor-pointer" : undefined}
                  onClick={onBucketClick ? () => onBucketClick(b.iso) : undefined}
                >
                  <title>
                    {`${b.full}\n${series
                      .map((s) => `${s.label}: ${s.values[i] || 0}`)
                      .join("\n")}\nTotal: ${totalPorCubo[i]}`}
                  </title>
                </rect>
              </g>
            );
          })}
        </>
      ) : (
        <>
          {series.map((s) => {
            const d = s.values
              .map((v, i) => `${i === 0 ? "M" : "L"} ${xLine(i).toFixed(1)} ${yFor(v).toFixed(1)}`)
              .join(" ");
            return (
              <g key={s.id}>
                <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {n <= 40 &&
                  s.values.map((v, i) => (
                    <circle
                      key={i}
                      cx={xLine(i)}
                      cy={yFor(v)}
                      r={4}
                      fill={s.color}
                      // Anillo de superficie de 2px sobre marcas superpuestas.
                      className="stroke-white dark:stroke-slate-900"
                      strokeWidth="2"
                    >
                      <title>{`${buckets[i].full} · ${s.label}: ${v} aliado(s)`}</title>
                    </circle>
                  ))}
              </g>
            );
          })}
          {/* Etiqueta directa del extremo, solo con pocas series. */}
          {series.length <= 4 &&
            series.map((s) => {
              const last = s.values.length - 1;
              if (last < 0) return null;
              return (
                <text
                  key={`lbl-${s.id}`}
                  x={xLine(last)}
                  y={yFor(s.values[last]) - 9}
                  textAnchor="end"
                  className="fill-slate-500 dark:fill-slate-400 tabular-nums"
                  style={{ fontSize: 10, fontWeight: 700 }}
                >
                  {s.values[last]}
                </text>
              );
            })}
          {onBucketClick &&
            buckets.map((b, i) => (
              <rect
                key={`hit-${b.iso}`}
                x={xLine(i) - bandW / 2}
                y={PAD_T}
                width={bandW}
                height={PLOT_H}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => onBucketClick(b.iso)}
              >
                <title>
                  {`${b.full}\n${series.map((s) => `${s.label}: ${s.values[i] || 0}`).join("\n")}`}
                </title>
              </rect>
            ))}
        </>
      )}

      {/* Eje X */}
      {buckets.map((b, i) =>
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

/**
 * Leyenda. Obligatoria con 2+ series: la identidad nunca puede depender solo del
 * color. El texto va con tokens de texto, no con el color de la serie; el punto
 * de color es el que carga la identidad.
 */
export function CloserChartLegend({
  series,
  onToggle,
  hidden,
}: {
  series: { id: string; label: string; color: string; total: number }[];
  onToggle?: (id: string) => void;
  hidden?: Set<string>;
}) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
      {series.map((s) => {
        const off = hidden?.has(s.id);
        const cls = `flex items-center gap-1.5 text-[11px] transition-opacity ${
          onToggle ? "hover:opacity-70 active:scale-95" : ""
        } ${off ? "opacity-40" : ""}`;
        const inner = (
          <>
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="font-medium text-slate-600 dark:text-slate-300">{s.label}</span>
            <span className="font-bold tabular-nums text-slate-800 dark:text-slate-100">{s.total}</span>
          </>
        );
        return (
          <li key={s.id}>
            {onToggle ? (
              <button
                type="button"
                onClick={() => onToggle(s.id)}
                className={cls}
                title={off ? `Mostrar ${s.label}` : `Ocultar ${s.label}`}
              >
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
