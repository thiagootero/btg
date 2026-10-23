export const PROJECT_AREAS = [
  "EDUCACAO",
  "CULTURA",
  "ESPORTE",
  "MEIO_AMBIENTE",
  "INCLUSAO_PRODUTIVA",
  "OUTRA",
] as const;

export type ProjectAreaKey = (typeof PROJECT_AREAS)[number];

export const AREA_LABELS: Record<ProjectAreaKey, string> = {
  EDUCACAO: "Educação",
  CULTURA: "Cultura",
  ESPORTE: "Esporte",
  MEIO_AMBIENTE: "Meio ambiente",
  INCLUSAO_PRODUTIVA: "Inclusão produtiva",
  OUTRA: "Outra",
};

export function areaLabel(area: ProjectAreaKey, other?: string | null): string {
  return area === "OUTRA" && other ? other : AREA_LABELS[area];
}

export const BRAZILIAN_STATES = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"],
  ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"], ["GO", "Goiás"],
  ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"],
  ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"], ["PE", "Pernambuco"], ["PI", "Piauí"],
  ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"], ["RS", "Rio Grande do Sul"],
  ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"],
  ["SE", "Sergipe"], ["TO", "Tocantins"],
] as const;

export type StateCode = (typeof BRAZILIAN_STATES)[number][0];

export const STATE_CODES = BRAZILIAN_STATES.map(([code]) => code) as [StateCode, ...StateCode[]];

export const STATE_NAMES: Record<string, string> = Object.fromEntries(BRAZILIAN_STATES);
