// Bitácora INVENTADA para el reporte de seguimiento en modo demo.
//
// Mismo motivo que `actividadDemo`: sin esto la pestaña SEGUIMIENTO sale en
// blanco en la previsualización local, porque la bitácora de demo solo tiene lo
// que uno haya tecleado a mano en la sesión. Con el panel vacío no se puede
// revisar el informe antes de publicarlo.
//
// Es DETERMINISTA: el mismo proyecto genera siempre las mismas notas, así que
// recargar la página no cambia las cifras y dos capturas de pantalla del mismo
// día son comparables. La semilla sale del id del proyecto.
//
// El panel marca estos datos como «Datos de ejemplo» de forma bien visible.
// Nadie puede confundirlos con una medición.

import type { CotejoGhlResumen, Prospect } from "@/utils/context/AppContext";
import type { NotaDia, SeguimientoProyecto } from "./useSeguimiento";

/** FNV-1a. Una semilla estable por proyecto, sin dependencias. */
function semilla(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const diaMenos = (hoy: Date, dias: number): string => {
  const d = new Date(hoy.getTime() - dias * 86400000);
  return d.toISOString().substring(0, 10);
};

/** Instante a mediodía del día indicado: la hora exacta no la usa ningún panel. */
const instante = (dia: string): string => `${dia}T18:00:00.000Z`;

/**
 * El sello de cotejo que le toca a un proyecto en modo demo.
 *
 * Vive aquí y no dentro de `cotejosDemo` porque las notas de GoHighLevel TIENEN
 * que respetarlo: de un cotejo «Nombre exacto», de uno «Por revisar» o de uno
 * que no está en GHL no se traen notas (`SELLOS[...].copia === false`). Si cada función inventara por su
 * cuenta, la previsualización enseñaría un 75 % de cobertura en un renglón que
 * el propio informe marca como «sin importación», y quien la revisara pensaría
 * que la tabla está mal.
 */
function selloDemo(id: string): { clave: "verificado" | "probable" | "nombre" | "revisar" | null; cotejado: boolean } {
  const h = semilla(`${id}·sello`) % 100;
  // 7 de cada 100 no se han cotejado nunca: eso es distinto de «se buscó y no
  // está en GoHighLevel», que es `clave: null`.
  if (h >= 93) return { clave: null, cotejado: false };
  if (h < 45) return { clave: "verificado", cotejado: true };
  if (h < 67) return { clave: "probable", cotejado: true };
  if (h < 75) return { clave: "nombre", cotejado: true };
  if (h < 84) return { clave: "revisar", cotejado: true };
  return { clave: null, cotejado: true };
}

/** De estos dos sellos —y solo de estos— la importación copia notas. */
const COPIA_NOTAS = new Set(["verificado", "probable"]);

export interface NotaDemo {
  prospectId: string;
  dia: string;
  origen: "plataforma" | "ghl";
  rol: string;
  autorId: string | null;
  autorNombre: string;
}

/**
 * Reparto buscado, parecido al de producción el día que se midió:
 * algo más de la mitad de la cartera con seguimiento propio, dos tercios con
 * rastro en GoHighLevel y un resto sin nada en ningún sitio.
 */
export function seguimientoDemo(
  prospects: Prospect[],
  nombreDe: (id: string | null | undefined) => string,
  // Las notas que uno haya TECLEADO durante la sesión de demo. Se suman a las
  // inventadas para que escribir un seguimiento y verlo aparecer en el reporte
  // funcione igual que con sesión real; si no, la previsualización mentiría
  // sobre lo único que sí se puede probar de verdad.
  tecleadas: NotaDemo[] = []
): { porProyecto: Record<string, SeguimientoProyecto>; porDia: NotaDia[] } {
  const hoy = new Date();
  const notas: NotaDemo[] = [...tecleadas];

  for (const p of prospects) {
    const h1 = semilla(p.id);
    const h2 = semilla(`${p.id}·ghl`);

    // Quién escribe aquí: el account manager del proyecto casi siempre, el
    // aliado de vez en cuando. Sin AM (mesa de dirección) firma la dirección.
    const amId = p.account_manager_id || null;
    const escribeAliado = h1 % 10 < 3;
    const autorId = escribeAliado ? p.aliado_id : amId;
    const rol = escribeAliado ? "aliado" : amId ? "account_manager" : "director";

    if (h1 % 100 < 58) {
      const cuantas = 1 + (h1 % 6);
      const ultima = h1 % 26; // 0–25 días sin tocarlo
      const cada = 1 + (h1 % 5);
      for (let i = 0; i < cuantas; i++) {
        notas.push({
          prospectId: p.id,
          dia: diaMenos(hoy, ultima + i * cada),
          origen: "plataforma",
          rol,
          autorId: autorId || null,
          autorNombre: nombreDe(autorId),
        });
      }
    }

    // Solo hay notas de GHL donde el cotejo permite traerlas.
    if (COPIA_NOTAS.has(selloDemo(p.id).clave || "") && h2 % 100 < 78) {
      const cuantas = 1 + (h2 % 5);
      const ultima = h2 % 40;
      const cada = 2 + (h2 % 6);
      for (let i = 0; i < cuantas; i++) {
        notas.push({
          prospectId: p.id,
          dia: diaMenos(hoy, ultima + i * cada),
          origen: "ghl",
          rol: "ghl",
          autorId: null,
          autorNombre: "GoHighLevel",
        });
      }
    }
  }

  return agregaDemo(notas);
}

/** Convierte la lista de notas inventadas en las dos vistas que usa el reporte. */
function agregaDemo(notas: NotaDemo[]): {
  porProyecto: Record<string, SeguimientoProyecto>;
  porDia: NotaDia[];
} {
  const porProyecto: Record<string, SeguimientoProyecto> = {};
  const dias = new Map<string, NotaDia & { _proyectos: Set<string> }>();

  for (const n of notas) {
    const at = instante(n.dia);

    const acc =
      porProyecto[n.prospectId] ||
      (porProyecto[n.prospectId] = {
        notasPlataforma: 0,
        notasGhl: 0,
        notasAliado: 0,
        notasAm: 0,
        notasDireccion: 0,
        diasConNota: 0,
        primeraAt: null,
        ultimaPlataformaAt: null,
        ultimaGhlAt: null,
        ultimoAutorPlataforma: null,
      });

    if (!acc.primeraAt || at < acc.primeraAt) acc.primeraAt = at;

    if (n.origen === "ghl") {
      acc.notasGhl++;
      if (!acc.ultimaGhlAt || at > acc.ultimaGhlAt) acc.ultimaGhlAt = at;
    } else {
      acc.notasPlataforma++;
      if (n.rol === "aliado") acc.notasAliado++;
      else if (n.rol === "account_manager") acc.notasAm++;
      else acc.notasDireccion++;
      if (!acc.ultimaPlataformaAt || at > acc.ultimaPlataformaAt) {
        acc.ultimaPlataformaAt = at;
        acc.ultimoAutorPlataforma = n.autorNombre;
      }
    }

    const clave = `${n.dia}|${n.origen}|${n.autorId || "-"}`;
    const fila =
      dias.get(clave) ||
      (dias
        .set(clave, {
          dia: n.dia,
          origen: n.origen,
          rol: n.rol,
          autorId: n.autorId,
          autorNombre: n.autorNombre,
          notas: 0,
          proyectos: 0,
          _proyectos: new Set<string>(),
        })
        .get(clave) as NotaDia & { _proyectos: Set<string> });
    fila.notas++;
    fila._proyectos.add(n.prospectId);
  }

  // `diasConNota` se cuenta aparte: son días DISTINTOS con nota de plataforma.
  const diasPorProyecto = new Map<string, Set<string>>();
  for (const n of notas) {
    if (n.origen !== "plataforma") continue;
    const set = diasPorProyecto.get(n.prospectId) || new Set<string>();
    set.add(n.dia);
    diasPorProyecto.set(n.prospectId, set);
  }
  diasPorProyecto.forEach((set, id) => {
    if (porProyecto[id]) porProyecto[id].diasConNota = set.size;
  });

  const porDia = Array.from(dias.values()).map(({ _proyectos, ...fila }) => ({
    ...fila,
    proyectos: _proyectos.size,
  }));

  return { porProyecto, porDia };
}

/**
 * Sellos de cotejo con GoHighLevel INVENTADOS, para que el apartado de GHL del
 * reporte también se pueda revisar en local.
 *
 * En modo demo `AppContext` deja `cotejosGhl` vacío —no hay barrido nocturno que
 * los escriba—, así que sin esto el apartado enseñaría un único renglón «Nunca
 * cotejado» y no se vería si la tabla está bien. Mismo criterio y misma semilla
 * determinista que las notas de arriba.
 */
/**
 * Un correo con una errata, que es lo que de verdad separa a un expediente de su
 * contacto: `escobedo@` contra `ecobedo@`. Se le quita la segunda letra.
 */
const correoConErrata = (correo: string): string => correo.replace(/^(.)./, "$1");

/** El mismo teléfono con el último dígito cambiado. */
const telefonoConErrata = (tel: string): string => {
  const d = (tel || "").replace(/\D+/g, "");
  if (d.length < 10) return tel;
  return d.slice(0, -1) + String((Number(d.slice(-1)) + 1) % 10);
};

/** El nombre recortado: así se ve un contacto de GHL que NO es esta persona. */
const nombreDistinto = (nombre: string): string => nombre.split(/\s+/).slice(0, 2).join(" ") || nombre;

/**
 * El contacto de GoHighLevel que le toca a cada sello.
 *
 * No basta con inventar el sello: el reporte enseña el correo y el teléfono de
 * ALLÁ al lado de los de aquí, y si el de allá viniera vacío en todo lo que no
 * es «Verificado», la previsualización enseñaría una columna en blanco justo en
 * los renglones que ese panel existe para trabajar. Cada sello trae el contacto
 * que lo justifica: en «Probable» cuadra uno de los dos datos, en «Nombre
 * exacto» ninguno, y en «Por revisar» cuadra un dato suelto de alguien que se
 * llama de otra manera.
 */
function contactoDemo(p: Prospect, sello: string | null, h: number) {
  if (!sello) return { nombre: null, correo: null, telefono: null };
  if (sello === "verificado") return { nombre: p.full_name, correo: p.email, telefono: p.phone };
  if (sello === "probable") {
    // Alterna cuál es el dato que no cuadra: si siempre fallara el correo, la
    // tabla parecería un problema de correos y no lo es.
    return h % 2 === 0
      ? { nombre: p.full_name, correo: p.email, telefono: telefonoConErrata(p.phone) }
      : { nombre: p.full_name, correo: correoConErrata(p.email), telefono: p.phone };
  }
  if (sello === "nombre") {
    return { nombre: p.full_name, correo: correoConErrata(p.email), telefono: telefonoConErrata(p.phone) };
  }
  // «Por revisar»: cuadra un dato suelto y el nombre es de otro.
  return h % 2 === 0
    ? { nombre: nombreDistinto(p.full_name), correo: null, telefono: p.phone }
    : { nombre: nombreDistinto(p.full_name), correo: p.email, telefono: null };
}

export function cotejosDemo(prospects: Prospect[]): Record<string, CotejoGhlResumen> {
  const out: Record<string, CotejoGhlResumen> = {};
  const hoy = new Date();
  for (const p of prospects) {
    const { clave: sello, cotejado } = selloDemo(p.id);
    // Los que no se han cotejado nunca no están en el mapa: es distinto de
    // estar con `sello: null`, que significa «se buscó y no está allá».
    if (!cotejado) continue;
    const h = semilla(`${p.id}·sello`) % 100;
    const contacto = contactoDemo(p, sello, h);
    out[p.id] = {
      sello,
      nivel: sello === "verificado" ? 3 : sello === "probable" ? 2 : sello ? 1 : 0,
      contactoNombre: contacto.nombre,
      contactoCorreo: contacto.correo,
      contactoTelefono: contacto.telefono,
      cotejadoAt: instante(diaMenos(hoy, h % 5)),
    };
  }
  return out;
}
