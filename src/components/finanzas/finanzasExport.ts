"use client";

// Exportaciones del módulo (§19): CSV, Excel y PDF.
//
// SIN LIBRERÍAS. El proyecto no tiene ninguna de hojas de cálculo ni de PDF y no
// se añade una por esto (el mismo criterio con el que los gráficos son SVG a
// mano). Las tres salidas usan capacidades del navegador:
//
//   · CSV   → texto plano con BOM, para que Excel respete los acentos.
//   · Excel → una tabla HTML servida como `application/vnd.ms-excel`. Excel,
//             Numbers y Google Sheets la abren como hoja con formato; es el
//             formato "Excel" real de toda la vida (SpreadsheetML de 1997) y no
//             requiere dependencias.
//   · PDF   → se abre el reporte maquetado en una ventana y se dispara la
//             impresión; el usuario elige "Guardar como PDF". Es el diálogo
//             nativo del sistema, así que sale con la calidad del navegador.
//
// El REPORTE PARA FINANZAS es el importante: lleva exactamente las columnas del
// §19 más el dato de cobro de cada persona, para que quien deposita no tenga que
// buscarlo en otra pantalla.

import {
  type CorteRow,
  type EventoRow,
  type LiquidacionRow,
  ESTADO_LABEL,
  METODO_PAGO_LABEL,
  PRODUCTO_LABEL,
  ROL_LABEL,
  TIPO_EVENTO_LABEL,
  datosDeCobro,
  fmtFecha,
  fmtMoneda,
} from "./finanzasTypes";

type Celda = string | number | null | undefined;

const hoy = () => new Date().toISOString().substring(0, 10);

function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function exportarCsv(nombre: string, filas: Celda[][]): void {
  const esc = (v: Celda) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = filas.map((f) => f.map(esc).join(",")).join("\n");
  // El BOM es lo que hace que Excel en Windows lea los acentos correctamente.
  descargar(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }), `${nombre}-${hoy()}.csv`);
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

const escHtml = (v: Celda) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export function exportarExcel(nombre: string, titulo: string, filas: Celda[][]): void {
  const [encabezado, ...cuerpo] = filas;
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>${escHtml(titulo).substring(0, 30)}</x:Name>
<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
 table{border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt}
 th{background:#0f172a;color:#fff;font-weight:700;text-align:left;padding:6px 10px;border:1px solid #334155}
 td{padding:5px 10px;border:1px solid #cbd5e1}
 caption{font-size:14pt;font-weight:700;text-align:left;padding:8px 0}
</style></head><body>
<table><caption>${escHtml(titulo)}</caption>
<thead><tr>${(encabezado || []).map((c) => `<th>${escHtml(c)}</th>`).join("")}</tr></thead>
<tbody>${cuerpo
    .map((f) => `<tr>${f.map((c) => `<td>${escHtml(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></body></html>`;

  descargar(
    new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8;" }),
    `${nombre}-${hoy()}.xls`
  );
}

// ---------------------------------------------------------------------------
// PDF (vía impresión del navegador)
// ---------------------------------------------------------------------------

export function exportarPdf(titulo: string, subtitulo: string, filas: Celda[][], pie?: string): boolean {
  const [encabezado, ...cuerpo] = filas;
  const ventana = window.open("", "_blank", "width=1100,height=800");
  // Los bloqueadores de ventanas emergentes pueden impedirlo: se avisa arriba.
  if (!ventana) return false;

  ventana.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${escHtml(titulo)}</title>
<style>
 @page{size:A4 landscape;margin:14mm}
 *{box-sizing:border-box}
 body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0f172a;margin:0;padding:0}
 h1{font-size:17px;margin:0 0 2px}
 .sub{font-size:11px;color:#64748b;margin:0 0 14px}
 table{width:100%;border-collapse:collapse;font-size:10px}
 th{background:#0f172a;color:#fff;text-align:left;padding:6px 8px;font-weight:700}
 td{padding:5px 8px;border-bottom:1px solid #e2e8f0}
 tr:nth-child(even) td{background:#f8fafc}
 .num{text-align:right;font-variant-numeric:tabular-nums}
 footer{margin-top:16px;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px}
</style></head><body>
<h1>${escHtml(titulo)}</h1>
<p class="sub">${escHtml(subtitulo)}</p>
<table><thead><tr>${(encabezado || []).map((c) => `<th>${escHtml(c)}</th>`).join("")}</tr></thead>
<tbody>${cuerpo
    .map(
      (f) =>
        `<tr>${f
          .map((c, i) => `<td class="${i > 1 && typeof c === "string" && /^\$|^-\$/.test(c) ? "num" : ""}">${escHtml(c)}</td>`)
          .join("")}</tr>`
    )
    .join("")}</tbody></table>
<footer>${escHtml(pie || "")}Documento generado por PensiónFlow el ${new Date().toLocaleString("es-MX")}.</footer>
<script>window.onload=function(){window.print()}</script>
</body></html>`);
  ventana.document.close();
  return true;
}

// ---------------------------------------------------------------------------
// Juegos de datos
// ---------------------------------------------------------------------------

/** Reporte de liquidaciones: una fila por beneficiario (§9). */
export function filasLiquidaciones(filas: LiquidacionRow[], periodo: string): Celda[][] {
  const out: Celda[][] = [
    [
      "Beneficiario", "Rol", "Periodo", "Producción", "Comisión base", "Bonos", "Salario fijo",
      "Ajustes", "Total a pagar", "Pagado", "Pendiente", "Estado", "Medio de cobro", "Dato de cobro",
      "Fecha de envío", "Fecha de pago",
    ],
  ];
  for (const r of filas) {
    const cobro = datosDeCobro(r);
    out.push([
      r.usuario_nombre,
      ROL_LABEL[r.rol_beneficiario],
      periodo,
      r.produccion,
      fmtMoneda(r.comision_base),
      fmtMoneda(r.bonos),
      fmtMoneda(r.salario),
      fmtMoneda(r.ajustes),
      fmtMoneda(r.total_a_pagar),
      fmtMoneda(r.total_pagado),
      fmtMoneda(r.total_pendiente),
      ESTADO_LABEL[r.estado_resumen],
      cobro.etiqueta,
      cobro.valor || "SIN REGISTRAR",
      fmtFecha(r.fecha_envio),
      fmtFecha(r.fecha_pago),
    ]);
  }
  return out;
}

/** Detalle a nivel de evento: cada peso con la operación que lo originó (§13). */
export function filasEventos(eventos: EventoRow[]): Celda[][] {
  const out: Celda[][] = [
    [
      "Beneficiario", "Rol", "Concepto", "Producto", "Cliente / Aliado", "Account Manager",
      "Producción", "Importe", "Periodo", "Fecha de devengo", "Estado", "Observación",
      "Fecha de pago", "Referencia de pago",
    ],
  ];
  for (const e of eventos) {
    out.push([
      e.usuario_nombre,
      ROL_LABEL[e.rol_beneficiario],
      TIPO_EVENTO_LABEL[e.tipo_evento],
      e.tipo_producto ? PRODUCTO_LABEL[e.tipo_producto] : "—",
      e.cliente_nombre || e.aliado_nombre || "—",
      e.account_manager || "—",
      e.produccion ?? "",
      fmtMoneda(e.monto),
      e.periodo_corte,
      fmtFecha(e.fecha_devengo),
      ESTADO_LABEL[e.estado],
      e.motivo_observacion || e.observaciones || "",
      fmtFecha(e.fecha_pago),
      e.referencia_pago || "",
    ]);
  }
  return out;
}

/**
 * Reporte oficial para Finanzas (§19). Va aparte del de liquidaciones porque es
 * un documento de PAGO: incluye la referencia del corte y el dato bancario, y
 * omite todo lo que no sirva para depositar.
 */
export function filasReporteFinanzas(corte: CorteRow, filas: LiquidacionRow[]): Celda[][] {
  const periodo = `${fmtFecha(corte.fecha_inicio)} – ${fmtFecha(corte.fecha_fin)}`;
  const out: Celda[][] = [
    [
      "Referencia del corte", "Beneficiario", "Rol", "Periodo", "Conceptos", "Cantidades",
      "Comisiones", "Bonos", "Salario", "Ajustes", "Total a pagar", "Estado",
      "Medio de cobro", "Dato de cobro", "Titular",
    ],
  ];
  for (const r of filas) {
    const cobro = datosDeCobro(r);
    const conceptos: string[] = [];
    if (r.comision_base) conceptos.push("Comisiones");
    if (r.bonos) conceptos.push("Bonos");
    if (r.salario) conceptos.push("Salario fijo");
    if (r.ajustes) conceptos.push("Ajustes");
    out.push([
      corte.id.substring(0, 8).toUpperCase(),
      r.usuario_nombre,
      ROL_LABEL[r.rol_beneficiario],
      periodo,
      conceptos.join(" + ") || "—",
      r.eventos,
      fmtMoneda(r.comision_base),
      fmtMoneda(r.bonos),
      fmtMoneda(r.salario),
      fmtMoneda(r.ajustes),
      fmtMoneda(r.total_a_pagar),
      ESTADO_LABEL[r.estado_resumen],
      cobro.etiqueta,
      cobro.valor || "SIN REGISTRAR",
      r.titular_cuenta || r.usuario_nombre,
    ]);
  }
  out.push([
    "", "TOTAL DEL CORTE", "", periodo, "", filas.reduce((s, r) => s + r.eventos, 0),
    fmtMoneda(filas.reduce((s, r) => s + r.comision_base, 0)),
    fmtMoneda(filas.reduce((s, r) => s + r.bonos, 0)),
    fmtMoneda(filas.reduce((s, r) => s + r.salario, 0)),
    fmtMoneda(filas.reduce((s, r) => s + r.ajustes, 0)),
    fmtMoneda(corte.total_a_pagar),
    "", "", "", "",
  ]);
  return out;
}

export function filasPagos(
  pagos: { usuario_nombre: string; monto_pagado: number; fecha_pago: string; metodo_pago: keyof typeof METODO_PAGO_LABEL; referencia_bancaria: string | null; observaciones: string | null; registrado_por_nombre: string | null }[]
): Celda[][] {
  const out: Celda[][] = [
    ["Beneficiario", "Importe", "Fecha de pago", "Método", "Referencia bancaria", "Observaciones", "Registró"],
  ];
  for (const p of pagos) {
    out.push([
      p.usuario_nombre,
      fmtMoneda(p.monto_pagado),
      fmtFecha(p.fecha_pago),
      METODO_PAGO_LABEL[p.metodo_pago],
      p.referencia_bancaria || "",
      p.observaciones || "",
      p.registrado_por_nombre || "",
    ]);
  }
  return out;
}
