// Datos de EJEMPLO del panel de actividad, solo para el modo demo.
//
// POR QUÉ EXISTE
// La actividad no se puede backfillear: el reporte empieza a tener histórico el
// día que se publica la medición, así que en una previsualización local —y en
// producción el primer día— el panel saldría vacío y no habría forma de juzgar
// el diseño. Estos datos son inventados y el panel lo dice con un distintivo
// bien visible; nunca se usan cuando hay sesión real contra Supabase.
//
// Los tres perfiles están elegidos para que se vean los tres casos que el panel
// tiene que saber distinguir:
//   · Ana   — muchas horas y muchas acciones: trabaja.
//   · Luis  — muchas horas y pocas acciones: la tiene abierta de fondo. ESTE es
//             el caso que motivó el reporte.
//   · Sara  — pocas horas pero densas: entra a rematar y se va.
//
// Determinista a propósito (generador congruencial con semilla fija): si los
// números bailaran en cada render, el gráfico parpadearía y nadie podría
// comparar dos capturas de la misma pantalla.

import type { DiaActividadAM, ResumenActividadAM, TipoActividadAM } from "./useActividadAM";

interface PerfilDemo {
  amId: string;
  nombre: string;
  /** Horas típicas por día laborable. */
  horas: number;
  /** Qué parte de esas horas es tiempo activo. */
  densidad: number;
  /** Acciones por hora dentro de la plataforma. */
  ritmo: number;
  /** Reparto de sus acciones entre tipos de actividad (pesos relativos). */
  mezcla: Record<string, number>;
}

const PERFILES: PerfilDemo[] = [
  {
    amId: "demo-am-ana",
    nombre: "Ana Torres (ejemplo)",
    horas: 6.4,
    densidad: 0.82,
    ritmo: 7.5,
    mezcla: { abre_expediente: 34, vista_modulo: 26, cambia_etapa: 14, agenda_asesoria: 9, simulacion: 7, sube_documento: 5, edita_cliente: 3, modalidad: 2 },
  },
  {
    amId: "demo-am-luis",
    nombre: "Luis Márquez (ejemplo)",
    horas: 5.8,
    densidad: 0.41,
    ritmo: 1.9,
    mezcla: { vista_modulo: 58, abre_expediente: 24, cambia_etapa: 9, agenda_asesoria: 4, simulacion: 3, sube_documento: 2 },
  },
  {
    amId: "demo-am-sara",
    nombre: "Sara Beltrán (ejemplo)",
    horas: 3.1,
    densidad: 0.88,
    ritmo: 9.2,
    mezcla: { abre_expediente: 30, cambia_etapa: 20, vista_modulo: 18, agenda_asesoria: 12, simulacion: 8, sube_documento: 6, papelera: 3, reasigna: 3 },
  },
];

/** Generador congruencial lineal. Misma semilla, misma serie, siempre. */
function aleatorio(semilla: number) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const isoDia = (d: Date) => d.toISOString().substring(0, 10);

/**
 * Genera 60 días hacia atrás desde hoy y recorta al rango pedido. Los fines de
 * semana se saltan casi siempre —un día laborable es lo normal, uno de sábado es
 * la excepción— para que la curva diaria tenga la forma de una semana de verdad.
 */
export function actividadDemoData(desde: string, hasta: string): {
  resumen: ResumenActividadAM[];
  porDia: DiaActividadAM[];
  porTipo: TipoActividadAM[];
} {
  const hoy = new Date();
  const porDia: DiaActividadAM[] = [];
  const acumulado = new Map<string, { seg: number; act: number; dias: number; tramos: number; ev: number; primero: string; ultimo: string }>();
  const tipos = new Map<string, number>();

  PERFILES.forEach((p, idx) => {
    const rnd = aleatorio(7919 + idx * 104729);
    for (let atras = 59; atras >= 0; atras--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - atras);
      const iso = isoDia(d);
      if (desde && iso < desde) continue;
      if (hasta && iso > hasta) continue;

      const finde = d.getDay() === 0 || d.getDay() === 6;
      const trabaja = finde ? rnd() < 0.18 : rnd() < 0.94;
      const factor = finde ? 0.35 : 0.72 + rnd() * 0.56;
      if (!trabaja) {
        // Un día sin actividad no genera renglón, igual que en la tabla real.
        rnd();
        continue;
      }

      const seg = Math.round(p.horas * 3600 * factor);
      const act = Math.round(seg * (p.densidad - 0.06 + rnd() * 0.12));
      const ev = Math.max(1, Math.round((seg / 3600) * p.ritmo * (0.75 + rnd() * 0.5)));
      const tramos = 1 + (rnd() < 0.55 ? 1 : 0) + (rnd() < 0.2 ? 1 : 0);

      porDia.push({ amId: p.amId, dia: iso, segundos: seg, segundosActivos: Math.min(act, seg), tramos, eventos: ev });

      const prev = acumulado.get(p.amId) || { seg: 0, act: 0, dias: 0, tramos: 0, ev: 0, primero: iso, ultimo: iso };
      acumulado.set(p.amId, {
        seg: prev.seg + seg,
        act: prev.act + Math.min(act, seg),
        dias: prev.dias + 1,
        tramos: prev.tramos + tramos,
        ev: prev.ev + ev,
        primero: prev.primero < iso ? prev.primero : iso,
        ultimo: prev.ultimo > iso ? prev.ultimo : iso,
      });

      // Reparto de las acciones del día entre los tipos del perfil. El resto de
      // la división entera va al tipo más frecuente en vez de perderse: si no, la
      // suma del ranking de actividades no cuadraría con la tarjeta «Acciones» y
      // el panel parecería estar contando mal cuando el fallo sería del ejemplo.
      const entradas = Object.entries(p.mezcla).sort((a, b) => b[1] - a[1]);
      const pesoTotal = entradas.reduce((s, [, v]) => s + v, 0);
      let repartido = 0;
      entradas.forEach(([tipo, peso]) => {
        const n = Math.floor((ev * peso) / pesoTotal);
        repartido += n;
        if (n > 0) tipos.set(`${p.amId}|${tipo}`, (tipos.get(`${p.amId}|${tipo}`) || 0) + n);
      });
      // El sobrante de los redondeos va al tipo más frecuente, que es donde menos
      // se nota, y así la suma del ranking cuadra con el total al acción.
      if (repartido < ev) {
        const [principal] = entradas[0];
        tipos.set(`${p.amId}|${principal}`, (tipos.get(`${p.amId}|${principal}`) || 0) + (ev - repartido));
      }
    }
  });

  const resumen: ResumenActividadAM[] = PERFILES.filter((p) => acumulado.has(p.amId)).map((p) => {
    const a = acumulado.get(p.amId)!;
    return {
      amId: p.amId,
      nombre: p.nombre,
      segundos: a.seg,
      segundosActivos: a.act,
      diasActivos: a.dias,
      tramos: a.tramos,
      eventos: a.ev,
      primerDia: a.primero,
      ultimoDia: a.ultimo,
      ultimaConexion: `${a.ultimo}T23:40:00.000Z`,
    };
  });

  const porTipo: TipoActividadAM[] = Array.from(tipos.entries()).map(([clave, eventos]) => {
    const [amId, tipo] = clave.split("|");
    return { amId, tipo, eventos, ultimaAt: `${acumulado.get(amId)?.ultimo ?? isoDia(hoy)}T23:40:00.000Z` };
  });

  return { resumen, porDia, porTipo };
}
