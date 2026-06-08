import type { LaborBlock, CalculationRow, CalculationResult, OverlapStrategy } from './types';
import { parseImssDate, getInclusiveDays, sortBlocksDescending, formatImssDate } from './dateUtils';
import { addDays, differenceInDays } from 'date-fns';

interface CalculationOptions {
  strategy?: OverlapStrategy;
  referenceDate?: Date;
}

export function calculateLast250WeeksAverage(
  laborBlocks: LaborBlock[],
  options: CalculationOptions = {}
): CalculationResult {
  const strategy = options.strategy || 'higher_salary_priority';
  const referenceDate = options.referenceDate || new Date();

  // Create a deep copy of blocks and sort them descending
  const sortedBlocks = [...laborBlocks];
  sortBlocksDescending(sortedBlocks);

  if (strategy === 'sequential') {
    return calculateSequential(sortedBlocks, referenceDate);
  } else if (strategy === 'block_subtraction') {
    return calculateBlockSubtraction(sortedBlocks, referenceDate);
  } else {
    return calculateSalaryStacking(sortedBlocks, referenceDate);
  }
}

/**
 * Strategy A: Simple Sequential (ignores overlaps, just counts weeks from most recent to oldest)
 */
function calculateSequential(blocks: LaborBlock[], referenceDate: Date): CalculationResult {
  let totalWeeks = 0;
  let totalResultado = 0;
  const rows: CalculationRow[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const days = getInclusiveDays(block.fechaAlta, block.fechaBaja, referenceDate);
    const weeksTot = days / 7;

    let weeksCounted = 0;
    let recortado = false;

    if (totalWeeks < 250) {
      const weeksNeeded = 250 - totalWeeks;
      if (weeksTot >= weeksNeeded) {
        weeksCounted = weeksNeeded;
        recortado = true;
        totalWeeks = 250;
      } else {
        weeksCounted = weeksTot;
        totalWeeks += weeksTot;
      }
    }

    const resultado = block.salarioDiario * weeksCounted;
    totalResultado += resultado;

    const formattedAlta = formatImssDate(parseImssDate(block.fechaAlta));
    const formattedBaja = block.fechaBaja === 'Vigente' 
      ? 'Vigente' 
      : formatImssDate(parseImssDate(block.fechaBaja));

    rows.push({
      index: i + 1,
      inicio: formattedAlta,
      termino: formattedBaja,
      salarioDiario: block.salarioDiario,
      semanasTotales: weeksTot,
      semanasContadas: weeksCounted,
      resultado: resultado,
      recortado: recortado
    });
  }

  const promedioDiario = totalResultado / 250;
  const promedioMensual = promedioDiario * 30.4;

  return {
    promedioDiario,
    promedioMensual,
    semanasContadas: Math.min(totalWeeks, 250),
    totalResultado,
    rows
  };
}

/**
 * Strategy B: Block-by-block subtraction (chronological overlap resolution)
 * We go from most recent to oldest, keeping track of dates covered.
 */
function calculateBlockSubtraction(blocks: LaborBlock[], referenceDate: Date): CalculationResult {
  const coveredDates = new Set<string>();
  const totalDaysNeeded = 1750; // 250 weeks * 7 days
  let totalDaysCollected = 0;
  let totalResultado = 0;
  const rows: CalculationRow[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const alta = parseImssDate(block.fechaAlta);
    const baja = block.fechaBaja === 'Vigente' ? referenceDate : parseImssDate(block.fechaBaja);
    
    // Total days in this block (for display of weeksTot)
    const blockDaysTotal = getInclusiveDays(block.fechaAlta, block.fechaBaja, referenceDate);
    const weeksTot = blockDaysTotal / 7;

    // Generate all dates in this block
    const allBlockDates: Date[] = [];
    if (baja >= alta) {
      const daysDiff = differenceInDays(baja, alta);
      for (let d = 0; d <= daysDiff; d++) {
        allBlockDates.push(addDays(alta, d));
      }
    }

    // Filter to uncovered dates
    const uncoveredDates = allBlockDates.filter(d => {
      const key = formatImssDate(d);
      return !coveredDates.has(key);
    });

    // Sort uncovered dates descending so we take the most recent ones first
    uncoveredDates.sort((a, b) => b.getTime() - a.getTime());

    // We count how many days we can actually take
    const daysAvailable = uncoveredDates.length;
    const daysToTake = Math.min(daysAvailable, totalDaysNeeded - totalDaysCollected);

    let weeksCounted = 0;
    let recortado = false;

    if (daysToTake > 0) {
      const taken = uncoveredDates.slice(0, daysToTake);
      for (const d of taken) {
        coveredDates.add(formatImssDate(d));
      }
      
      weeksCounted = daysToTake / 7;
      totalDaysCollected += daysToTake;
      
      if (totalDaysCollected === totalDaysNeeded && daysAvailable > daysToTake) {
        recortado = true;
      }
    }

    const resultado = block.salarioDiario * weeksCounted;
    totalResultado += resultado;

    const formattedAlta = formatImssDate(alta);
    const formattedBaja = block.fechaBaja === 'Vigente' ? 'Vigente' : formatImssDate(baja);
    const overlapDays = blockDaysTotal - daysAvailable;

    rows.push({
      index: i + 1,
      inicio: formattedAlta,
      termino: formattedBaja,
      salarioDiario: block.salarioDiario,
      semanasTotales: weeksTot,
      semanasContadas: weeksCounted,
      resultado: resultado,
      recortado: recortado,
      overlapDaysDeducted: overlapDays
    });
  }

  const promedioDiario = totalResultado / 250;
  const promedioMensual = promedioDiario * 30.4;

  return {
    promedioDiario,
    promedioMensual,
    semanasContadas: totalDaysCollected / 7,
    totalResultado,
    rows
  };
}

/**
 * Strategy C: Salary Stacking (Creditia-style)
 * 
 * Splits overlapping blocks into non-overlapping sub-intervals.
 * For each sub-interval where multiple blocks are active, their salaries are SUMMED.
 * Sub-intervals are then sorted from most recent to oldest and accumulated until 250 weeks.
 */
function calculateSalaryStacking(blocks: LaborBlock[], referenceDate: Date): CalculationResult {
  // 1. Convert blocks to date ranges
  interface DateRange {
    alta: Date;
    baja: Date;
    salary: number;
  }

  const ranges: DateRange[] = blocks.map(b => ({
    alta: parseImssDate(b.fechaAlta),
    baja: b.fechaBaja === 'Vigente' ? referenceDate : parseImssDate(b.fechaBaja),
    salary: b.salarioDiario
  }));

  // 2. Collect all unique boundary dates
  //    We use the day AFTER each baja as a boundary to properly split intervals
  const boundarySet = new Set<number>();
  for (const r of ranges) {
    boundarySet.add(r.alta.getTime());
    // Add day after baja as boundary (exclusive end)
    boundarySet.add(addDays(r.baja, 1).getTime());
  }

  // 3. Sort boundaries chronologically
  const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

  // 4. Create sub-intervals between consecutive boundaries
  interface SubInterval {
    start: Date;
    end: Date;      // inclusive end (last day of this sub-interval)
    salary: number;  // summed salary of all active blocks
    days: number;    // number of days in this sub-interval
  }

  const subIntervals: SubInterval[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const intervalStart = new Date(boundaries[i]);
    const intervalExclusiveEnd = new Date(boundaries[i + 1]);
    const intervalInclusiveEnd = addDays(intervalExclusiveEnd, -1);

    // Sum salaries of all blocks that are active during this sub-interval
    // A block is active if: block.alta <= intervalStart AND intervalInclusiveEnd <= block.baja
    let totalSalary = 0;
    let activeCount = 0;

    for (const r of ranges) {
      if (r.alta <= intervalStart && intervalInclusiveEnd <= r.baja) {
        totalSalary += r.salary;
        activeCount++;
      }
    }

    if (activeCount > 0) {
      const days = differenceInDays(intervalExclusiveEnd, intervalStart); // exclusive = end - start
      if (days > 0) {
        subIntervals.push({
          start: intervalStart,
          end: intervalInclusiveEnd,
          salary: totalSalary,
          days
        });
      }
    }
  }

  // 5. Sort sub-intervals by start date DESCENDING (most recent first)
  subIntervals.sort((a, b) => b.start.getTime() - a.start.getTime());

  // Match Creditia's behavior: the very first (most recent) interval is inclusive,
  // while all subsequent intervals are exclusive (1 day less than inclusive).
  for (let i = 1; i < subIntervals.length; i++) {
    subIntervals[i].days = Math.max(0, subIntervals[i].days - 1);
  }

  // Filter out any sub-intervals that ended up with 0 days after subtraction
  const validSubIntervals = subIntervals.filter(si => si.days > 0);

  // 6. Accumulate weeks until 250
  const totalDaysNeeded = 1750; // 250 * 7
  let totalDaysCollected = 0;
  let totalResultado = 0;
  const rows: CalculationRow[] = [];

  for (let i = 0; i < validSubIntervals.length; i++) {
    const interval = validSubIntervals[i];
    const weeksTot = interval.days / 7;

    let daysCounted = 0;
    let recortado = false;

    if (totalDaysCollected < totalDaysNeeded) {
      const daysNeeded = totalDaysNeeded - totalDaysCollected;
      if (interval.days >= daysNeeded) {
        daysCounted = daysNeeded;
        recortado = true;
        totalDaysCollected = totalDaysNeeded;
      } else {
        daysCounted = interval.days;
        totalDaysCollected += interval.days;
      }
    }

    const weeksCounted = daysCounted / 7;
    const resultado = interval.salary * weeksCounted;
    totalResultado += resultado;

    rows.push({
      index: i + 1,
      inicio: formatImssDate(interval.start),
      termino: formatImssDate(interval.end),
      salarioDiario: interval.salary,
      semanasTotales: weeksTot,
      semanasContadas: weeksCounted,
      resultado,
      recortado
    });
  }

  const semanasContadas = totalDaysCollected / 7;
  const promedioDiario = semanasContadas > 0 ? totalResultado / semanasContadas : 0;
  const promedioMensual = promedioDiario * 30.4;

  return {
    promedioDiario,
    promedioMensual,
    semanasContadas,
    totalResultado,
    rows
  };
}
