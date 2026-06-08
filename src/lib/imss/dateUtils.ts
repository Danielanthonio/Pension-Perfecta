import { parse, format, differenceInDays } from 'date-fns';

/**
 * Parses date string in DD/MM/YYYY or YYYY-MM-DD format
 */
export function parseImssDate(dateStr: string): Date {
  let date: Date;
  if (dateStr.includes('-')) {
    date = parse(dateStr, 'yyyy-MM-dd', new Date());
  } else {
    date = parse(dateStr, 'dd/MM/yyyy', new Date());
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Formats a Date object to DD/MM/YYYY
 */
export function formatImssDate(date: Date): string {
  return format(date, 'dd/MM/yyyy');
}

/**
 * Returns inclusive days between two dates (baja - alta + 1)
 */
export function getInclusiveDays(altaStr: string, bajaStr: string, referenceDate: Date = new Date()): number {
  const alta = parseImssDate(altaStr);
  const baja = bajaStr === 'Vigente' ? referenceDate : parseImssDate(bajaStr);
  
  if (baja < alta) {
    return 0; // Guard against negative ranges
  }
  
  return differenceInDays(baja, alta) + 1;
}

/**
 * Sorts labor blocks by baja date descending (most recent first).
 * Active "Vigente" blocks are treated as the most recent.
 */
export function sortBlocksDescending(blocks: Array<{ fechaBaja: string; fechaAlta: string }>): void {
  blocks.sort((a, b) => {
    if (a.fechaBaja === 'Vigente' && b.fechaBaja === 'Vigente') {
      return parseImssDate(b.fechaAlta).getTime() - parseImssDate(a.fechaAlta).getTime();
    }
    if (a.fechaBaja === 'Vigente') return -1;
    if (b.fechaBaja === 'Vigente') return 1;
    
    const dateA = parseImssDate(a.fechaBaja).getTime();
    const dateB = parseImssDate(b.fechaBaja).getTime();
    
    if (dateB !== dateA) {
      return dateB - dateA;
    }
    
    // Tie breaker: sort by alta date descending
    return parseImssDate(b.fechaAlta).getTime() - parseImssDate(a.fechaAlta).getTime();
  });
}
