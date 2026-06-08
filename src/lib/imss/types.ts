export interface LaborBlock {
  patron: string;
  registroPatronal: string;
  entidadFederativa: string;
  fechaAlta: string; // YYYY-MM-DD
  fechaBaja: string; // YYYY-MM-DD or "Vigente"
  salarioDiario: number;
}

export interface ImssPdfData {
  nombre: string;
  nss: string;
  curp: string;
  fechaEmision: string; // YYYY-MM-DD or DD/MM/YYYY
  totalSemanasCotizadas: number;
  semanasImss: number;
  semanasDescontadas: number;
  semanasReintegradas: number;
  laborBlocks: LaborBlock[];
}

export interface CalculationRow {
  index: number;
  inicio: string; // DD/MM/YYYY for UI
  termino: string; // DD/MM/YYYY for UI
  salarioDiario: number;
  semanasTotales: number;
  semanasContadas: number;
  resultado: number;
  recortado: boolean;
  overlapDaysDeducted?: number;
}

export interface CalculationResult {
  promedioDiario: number;
  promedioMensual: number;
  semanasContadas: number;
  totalResultado: number;
  rows: CalculationRow[];
}

export type OverlapStrategy = 'sequential' | 'block_subtraction' | 'higher_salary_priority';
