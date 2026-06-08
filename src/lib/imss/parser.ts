import type { ImssPdfData, LaborBlock } from './types';

/**
 * Parses the raw text extracted from an IMSS PDF Constancia de Semanas Cotizadas
 * and extracts all metadata and labor history blocks.
 *
 * This parser is designed for the text structure produced by pdfjs-dist,
 * where each text item appears on its own line. Labels and their values
 * are typically on separate lines.
 */
export function parseImssPdfToLaborBlocks(pdfText: string): ImssPdfData {
  // Keep all lines including empty ones to maintain positional relationships
  const rawLines = pdfText.split('\n');
  // Trimmed lines for searching, but preserve index mapping
  const lines = rawLines.map(l => l.trim());

  // 1. Extract Name and NSS
  let nombre = '';
  let nss = '';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === 'NSS:') {
      // In pdfjs output, the structure is:
      //   [total weeks number]
      //   NSS:
      //   [FULL NAME]
      //   [NSS number 11 digits]
      //   [CURP]
      //   CURP:
      // Name is the FIRST non-empty non-numeric line AFTER "NSS:"
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const line = lines[j];
        if (line && !/^\d+$/.test(line) && line !== 'CURP:' && line.length > 3) {
          if (!nombre) {
            nombre = line;
          }
        }
        if (/^\d{10,11}$/.test(line) && !nss) {
          nss = line;
        }
      }
      break;
    }
  }

  // If NSS not found through label, fallback to regex search
  if (!nss) {
    const nssMatch = pdfText.match(/\b(\d{11})\b/);
    if (nssMatch) {
      nss = nssMatch[1];
    }
  }

  // 2. Extract CURP
  let curp = '';
  const curpRegex = /\b([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\b/;
  const curpMatch = pdfText.match(curpRegex);
  if (curpMatch) {
    curp = curpMatch[1];
  } else {
    // Check if it's concatenated with label, e.g. "OOFA660424HVZSRL07CURP:"
    const curpConcatMatch = pdfText.match(/([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)CURP:/);
    if (curpConcatMatch) {
      curp = curpConcatMatch[1];
    }
  }

  // 3. Extract Report Date (Fecha de Emisión)
  let fechaEmision = '';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Fecha de emisión del reporte') || lines[i] === 'Fecha de emisión del reporte') {
      // In pdfjs, the date parts are on separate lines: "26", "/", "04", "/", "2026"
      // Collect the next several non-empty lines to reconstruct the date
      const dateParts: string[] = [];
      for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
        if (lines[j]) {
          dateParts.push(lines[j]);
        }
        // Stop if we've collected enough or hit another section
        if (dateParts.length >= 5) break;
        if (lines[j].includes('Tu historia laboral')) break;
      }
      const joined = dateParts.join('').replace(/\s+/g, '');
      const dateMatch = joined.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (dateMatch) {
        fechaEmision = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
      }
      break;
    }
  }

  // Fallback to metadata at the end of the PDF
  if (!fechaEmision) {
    const metaMatch = pdfText.match(/Fecha:(\d+\s+de\s+[a-z]+\s+\d{4})/i);
    if (metaMatch) {
      fechaEmision = metaMatch[1];
    }
  }

  // 4. Extract Weeks Breakdown
  let semanasImss = 0;
  let semanasDescontadas = 0;
  let semanasReintegradas = 0;
  let totalSemanasCotizadas = 0;

  // In pdfjs, the three numbers (1476, 117, 0) are on separate lines.
  // Look for "Semanas cotizadas IMSS" and scan nearby for standalone numbers
  // In pdfjs output, the weeks section looks like:
  //   Semanas Reintegradas
  //   (+)
  //   Semanas Descontadas
  //   (por disposición de recursos)
  //   (-)
  //   1476        <- semanasImss
  //   117         <- semanasDescontadas
  //   0           <- semanasReintegradas
  //   Semanas cotizadas IMSS
  // So the three numbers appear between the (-) marker and "Semanas cotizadas IMSS"
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === 'Semanas cotizadas IMSS' || lines[i].includes('Semanas cotizadas IMSS')) {
      // Scan backwards for up to 15 lines to find the three standalone numbers
      const numbers: number[] = [];
      for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
        if (/^\d+$/.test(lines[j])) {
          numbers.unshift(parseInt(lines[j], 10)); // unshift to keep order
        }
        // Stop if we hit another label section
        if (lines[j] === 'NSS:' || lines[j] === 'CURP:') break;
      }
      
      // The numbers in order (reading top-to-bottom) are:
      // [totalSemanasCotizadas, semanasImss, semanasDescontadas, semanasReintegradas]
      // Or just [semanasImss, semanasDescontadas, semanasReintegradas] depending on proximity
      if (numbers.length >= 4) {
        // First number is totalSemanasCotizadas (1359), then 1476, 117, 0
        totalSemanasCotizadas = numbers[0];
        semanasImss = numbers[1];
        semanasDescontadas = numbers[2];
        semanasReintegradas = numbers[3];
      } else if (numbers.length === 3) {
        semanasImss = numbers[0];
        semanasDescontadas = numbers[1];
        semanasReintegradas = numbers[2];
      }
      break;
    }
  }

  // Extract total weeks from the footer metadata: "Número total de semanas cotizadas:1359"
  const totalMatch = pdfText.match(/Número total de semanas cotizadas:(\d+)/);
  if (totalMatch) {
    totalSemanasCotizadas = parseInt(totalMatch[1], 10);
  } else if (totalSemanasCotizadas === 0) {
    // Fallback: also look for it in the first line that says "Total de semanas cotizadas"
    // In the pdfjs text the value (1359) appears near that label
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === 'Total de semanas cotizadas' || lines[i].includes('Total de semanas cotizadas')) {
        // The total is likely a number appearing near this label, search backwards
        for (let j = Math.max(0, i - 10); j < i; j++) {
          if (/^\d{3,4}$/.test(lines[j])) {
            totalSemanasCotizadas = parseInt(lines[j], 10);
            break;
          }
        }
        break;
      }
    }
    // Final fallback
    if (totalSemanasCotizadas === 0) {
      totalSemanasCotizadas = semanasImss - semanasDescontadas + semanasReintegradas;
    }
  }

  // 5. Extract Labor Blocks
  // In pdfjs output, each block has this structure (varies slightly but generally):
  //
  // [baja date] (e.g., "05/03/2024")
  // [entidad federativa] (e.g., "SINALOA")
  // "Salario Base de Cotización *"
  // "Fecha de alta"
  // " " or ""
  // "Fecha de baja"
  // [alta date] (e.g., "16/10/2023")
  // "Entidad federativa"
  // "$ 371.32"
  // "Nombre del patrón"
  // " " or ""
  // [PATRON NAME]
  // "Registro Patronal"
  // " " or ""
  // [REGISTRO CODE]
  //
  const laborBlocks: LaborBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === 'Nombre del patrón') {
      // Find the patron name: skip empty lines to get to the actual name
      let patron = '';
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (lines[j] && lines[j] !== 'Registro Patronal') {
          patron = lines[j];
          break;
        }
      }

      // Find Registro Patronal
      let registroPatronal = '';
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        if (lines[j] === 'Registro Patronal') {
          // The code is on the next non-empty line
          for (let k = j + 1; k < Math.min(j + 3, lines.length); k++) {
            if (lines[k]) {
              registroPatronal = lines[k];
              break;
            }
          }
          break;
        }
      }

      // Search backwards for salary, dates, and entity
      let salarioDiario = 0;
      let fechaAlta = '';
      let fechaBaja = '';
      let entidadFederativa = '';

      // Look backward from "Nombre del patrón" line
      // Expected order going backwards:
      // "$ 371.32"           (salary)
      // "Entidad federativa" (label)
      // "16/10/2023"         (alta date)
      // "Fecha de baja"      (label)
      // " "
      // "Fecha de alta"      (label)
      // "Salario Base de Cotización *" (label)
      // "SINALOA"            (entity value)
      // "05/03/2024"         (baja date) or "Vigente"

      for (let k = 1; k <= 15; k++) {
        const currIdx = i - k;
        if (currIdx < 0) break;
        const currLine = lines[currIdx];

        // Parse salary: "$ 371.32"
        if (currLine.startsWith('$') && salarioDiario === 0) {
          const valStr = currLine.replace('$', '').replace(/,/g, '').trim();
          const parsedVal = parseFloat(valStr);
          if (!isNaN(parsedVal)) {
            salarioDiario = parsedVal;
          }
        }

        // Parse alta date: a date that appears after "Fecha de baja" label
        // In pdfjs, the alta date appears on a line just before "Entidad federativa"
        // and after the "Fecha de baja" label line
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(currLine) && !fechaAlta) {
          // Verify this is the alta date by checking if "Entidad federativa" comes after it
          // or "Fecha de baja" comes before it
          let isAltaDate = false;
          // Check lines after this date for "Entidad federativa"
          for (let m = currIdx + 1; m < Math.min(currIdx + 3, lines.length); m++) {
            if (lines[m] === 'Entidad federativa') {
              isAltaDate = true;
              break;
            }
          }
          if (isAltaDate) {
            fechaAlta = currLine;
          }
        }
      }

      // Find baja date: search further back from the alta date position
      // The baja date is above the entity federativa / "Salario Base de Cotización *" label
      if (fechaAlta) {
        // Find where the alta date was in the lines array
        let altaIdx = -1;
        for (let k = 1; k <= 15; k++) {
          const currIdx = i - k;
          if (currIdx < 0) break;
          if (lines[currIdx] === fechaAlta) {
            // Verify it's the right one (near "Entidad federativa")
            for (let m = currIdx + 1; m < Math.min(currIdx + 3, lines.length); m++) {
              if (lines[m] === 'Entidad federativa') {
                altaIdx = currIdx;
                break;
              }
            }
            if (altaIdx >= 0) break;
          }
        }

        if (altaIdx >= 0) {
          // Look further back for "Salario Base de Cotización *" to find the entity and baja date
          for (let k = altaIdx - 1; k >= Math.max(0, altaIdx - 10); k--) {
            if (lines[k] === 'Salario Base de Cotización *' || lines[k].startsWith('Salario Base de Cotización')) {
              // The entity federativa value is the line before "Salario Base de Cotización *"
              if (k - 1 >= 0) {
                entidadFederativa = lines[k - 1];
              }
              // The baja date is the line before the entity
              if (k - 2 >= 0) {
                const candidate = lines[k - 2];
                if (/^\d{2}\/\d{2}\/\d{4}$/.test(candidate)) {
                  fechaBaja = candidate;
                } else if (candidate === 'Vigente') {
                  fechaBaja = 'Vigente';
                }
              }
              break;
            }
          }
        }
      }

      // Convert dates from DD/MM/YYYY to YYYY-MM-DD for internal storage
      const formatToIso = (dateStr: string): string => {
        if (!dateStr || dateStr === 'Vigente') return dateStr;
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dateStr;
      };

      const isoAlta = formatToIso(fechaAlta);
      const isoBaja = formatToIso(fechaBaja);

      // Only add blocks that have at minimum a date
      if (fechaAlta || patron) {
        laborBlocks.push({
          patron: patron || 'Desconocido',
          registroPatronal,
          entidadFederativa,
          fechaAlta: isoAlta,
          fechaBaja: isoBaja,
          salarioDiario
        });
      }
    }
  }

  return {
    nombre,
    nss,
    curp,
    fechaEmision,
    totalSemanasCotizadas,
    semanasImss,
    semanasDescontadas,
    semanasReintegradas,
    laborBlocks
  };
}
