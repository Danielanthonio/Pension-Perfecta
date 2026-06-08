import { useState } from 'react';
import { CalendarRange, ClipboardCopy, Check } from 'lucide-react';
import type { CalculationRow } from '../lib/imss/types';
import type { LaborBlock } from '../lib/imss/types';

interface BlockRowData {
  originalIndex: number;
  excluded: boolean;
  row: CalculationRow;
  block: LaborBlock;
}

interface LaborPeriodsTableProps {
  allBlockRows: BlockRowData[];
  onToggleBlock?: (blockIndex: number) => void;
  onExcludeFromHere?: (blockIndex: number) => void;
}

export function LaborPeriodsTable({ allBlockRows }: LaborPeriodsTableProps) {
  const [copied, setCopied] = useState(false);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  const formatWeeks = (val: number) => {
    return new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  // Raw number for clipboard (no $ sign, no comma thousands separator)
  const rawNum = (val: number, decimals: number = 2) => val.toFixed(decimals);

  const handleCopyTable = async () => {
    const rows = allBlockRows
      .filter(item => !item.excluded && item.row.semanasContadas > 0)
      .map(item => {
        const { row } = item;
        return [
          row.index,
          row.inicio,
          row.termino,
          rawNum(row.salarioDiario),
          rawNum(row.semanasTotales),
          rawNum(row.semanasContadas),
          rawNum(row.resultado),
        ].join('\t');
      });

    const tsv = rows.join('\n');

    try {
      await navigator.clipboard.writeText(tsv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = tsv;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="glass-panel rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
          <CalendarRange className="h-4 w-4 text-emerald-500" />
          <span>Detalle de Periodos Laborales (Últimas 250 Semanas)</span>
        </h3>
        <div className="flex items-center space-x-3 no-print">
          <button
            onClick={handleCopyTable}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
              copied
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-slate-50 dark:bg-slate-900 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-emerald-500/30 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                <span>Copiado ✓</span>
              </>
            ) : (
              <>
                <ClipboardCopy className="h-3 w-3" />
                <span>Copiar para Excel</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-4 text-center w-12">#</th>
              <th className="py-3 px-4">Inicio</th>
              <th className="py-3 px-4">Término</th>
              <th className="py-3 px-4 text-right">Salario Diario</th>
              <th className="py-3 px-4 text-right">Semanas Totales</th>
              <th className="py-3 px-4 text-right">Semanas Contadas</th>
              <th className="py-3 px-4 text-right">Resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-150 dark:divide-slate-800/50 text-slate-700 dark:text-slate-350">
            {allBlockRows.map((item) => {
              const { originalIndex, excluded, row } = item;

              if (excluded) return null;

              const isUnused = row.semanasContadas === 0;
              const isRecortado = row.recortado;
              const isFullyUsed = row.semanasContadas > 0 && !row.recortado;

              let rowClass = 'transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/10';
              if (isUnused) {
                rowClass = 'text-slate-400 dark:text-slate-650 bg-slate-50/30 dark:bg-slate-950/20 hover:bg-slate-100/10 opacity-60';
              } else if (isRecortado) {
                rowClass = 'bg-amber-500/5 hover:bg-amber-500/10 text-slate-800 dark:text-slate-200 border-l-2 border-l-amber-500';
              } else if (isFullyUsed) {
                rowClass = 'hover:bg-slate-100/20 text-slate-800 dark:text-slate-200';
              }

              return (
                <tr key={originalIndex} className={rowClass}>
                  {/* Number */}
                  <td className="py-3 px-4 text-center font-semibold text-slate-450 text-[10px]">
                    {row.index}
                  </td>
                  
                  {/* Start Date */}
                  <td className="py-3 px-4 font-medium">
                    {row.inicio}
                  </td>
                  
                  {/* End Date */}
                  <td className="py-3 px-4 font-medium">
                    {row.termino === 'Vigente' ? (
                      <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded text-[10px] border border-emerald-500/20 font-bold">
                        Vigente
                      </span>
                    ) : (
                      row.termino
                    )}
                  </td>
                  
                  {/* Daily Salary */}
                  <td className={`py-3 px-4 text-right font-mono ${isUnused ? 'text-slate-400' : 'text-emerald-600 dark:text-emerald-400 font-semibold'}`}>
                    {formatCurrency(row.salarioDiario)}
                  </td>
                  
                  {/* Total Weeks in Period */}
                  <td className="py-3 px-4 text-right font-mono text-slate-450">
                    {formatWeeks(row.semanasTotales)}
                  </td>
                  
                  {/* Counted Weeks */}
                  <td className={`py-3 px-4 text-right font-mono font-bold ${isUnused ? 'text-slate-450' : 'text-slate-800 dark:text-slate-100'}`}>
                    {formatWeeks(row.semanasContadas)}
                  </td>
                  
                  {/* Result */}
                  <td className={`py-3 px-4 text-right font-mono font-semibold ${isUnused ? 'text-slate-450' : 'text-slate-850 dark:text-slate-100'}`}>
                    {formatCurrency(row.resultado)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
