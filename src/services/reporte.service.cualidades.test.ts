import { describe, it, expect, vi } from 'vitest';
import type { EntityManager } from '@mikro-orm/core';
import { reporteService } from './reporte.service.js';

type AnyRecord = Record<string, unknown>;

const linea = { id: 1, nombre: 'L1' };
const pasadaBase = {
  id: 1,
  numero: 1,
  estado: 'completa',
  lineaProduccion: linea,
  rutaPasada: { id: 1, nombre: 'R1' },
  balanza: { nombre: 'B1' },
  articulo: { codigo: 'A1', nombre: 'Art' },
  usuario: { nombreApellido: 'Juan' },
  horaInicio: new Date(2026, 10, 2, 10, 0),
  horaCierre: new Date(2026, 10, 2, 10, 30),
};
const etapa = (id: number, nombre: string) => ({ id, nombre });
const muestra = (pasadaId: number, e: { id: number; nombre: string }, peso = 50) => ({
  pasada: { id: pasadaId },
  etapa: e,
  pesoNeto: peso,
  estadoValidacion: 'ok',
  timestamp: new Date(2026, 10, 2, 10, 5),
});
const valor = (id: number, pasadaId: number, etapaId: number, v: AnyRecord) => ({
  id,
  pasada: { id: pasadaId },
  etapa: { id: etapaId },
  activo: true,
  ...v,
});
const temperatura = (extra: AnyRecord = {}) =>
  valor(1, 1, 10, { nombre: 'Temperatura (°C)', tipo: 'numerico', minimo: 0, maximo: 99, valor: 37.5, estadoValidacion: 'ok', ...extra });
const degustacion = (extra: AnyRecord = {}) =>
  valor(2, 1, 10, { nombre: 'Degustación', tipo: 'aceptado', minimo: 1, maximo: 1, valor: 1, estadoValidacion: 'ok', ...extra });

function makeEm(opts: { pasadas?: AnyRecord[]; muestras?: AnyRecord[]; valores?: AnyRecord[] }) {
  const find = vi.fn().mockImplementation((entityClass: { name: string }) => {
    if (entityClass.name === 'Pasada') return Promise.resolve(opts.pasadas ?? [pasadaBase]);
    if (entityClass.name === 'Muestra') return Promise.resolve(opts.muestras ?? []);
    if (entityClass.name === 'ValorAtributo') return Promise.resolve(opts.valores ?? []);
    return Promise.resolve([]);
  });
  return { find } as unknown as EntityManager;
}

async function sheetOf(em: EntityManager) {
  const wb = await reporteService.generateReportePasadas(em, new Date(0), new Date());
  const ws = wb.getWorksheet('L1')!;
  const header = (ws.getRow(1).values as unknown[]).slice(1) as string[];
  return {
    ws,
    header,
    cell: (row: number, h: string) => ws.getRow(row).getCell(header.indexOf(h) + 1),
  };
}

const RED = 'FFFF0000';
const fillOf = (c: { fill?: unknown }) => (c.fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb;

describe('reporteService.generateReportePasadas — cualidades', () => {
  it('appends two cualidad column groups after the existing columns without moving them', async () => {
    const { header } = await sheetOf(makeEm({ muestras: [muestra(1, etapa(10, 'Relleno'))] }));
    expect(header.slice(18, 22)).toEqual(['Etapa', 'Total Muestras Etapa', 'Promedio Neto Etapa', 'Unidad']);
    expect(header.slice(22)).toEqual([
      'Cualidad 1', 'Valor Cualidad 1', 'Entre valores Cualidad 1',
      'Cualidad 2', 'Valor Cualidad 2', 'Entre valores Cualidad 2',
    ]);
  });

  it('writes a numeric cualidad in range with its name, value and "min-max", not red', async () => {
    const { cell } = await sheetOf(makeEm({ muestras: [muestra(1, etapa(10, 'Relleno'))], valores: [temperatura()] }));
    expect(cell(2, 'Cualidad 1').value).toBe('Temperatura (°C)');
    expect(cell(2, 'Valor Cualidad 1').value).toBe(37.5);
    expect(cell(2, 'Entre valores Cualidad 1').value).toBe('0-99');
    expect(fillOf(cell(2, 'Valor Cualidad 1'))).not.toBe(RED);
  });

  it('marks an out-of-range numeric value in red', async () => {
    const { cell } = await sheetOf(
      makeEm({ muestras: [muestra(1, etapa(10, 'Relleno'))], valores: [temperatura({ valor: 120, estadoValidacion: 'fuera_de_rango' })] }),
    );
    expect(cell(2, 'Valor Cualidad 1').value).toBe(120);
    expect(fillOf(cell(2, 'Valor Cualidad 1'))).toBe(RED);
  });

  it('writes aceptado/no aceptado as text (never 1/0), "Entre valores" reads Aceptado, and only no aceptado is red', async () => {
    const aceptado = await sheetOf(makeEm({ muestras: [muestra(1, etapa(10, 'Relleno'))], valores: [degustacion()] }));
    expect(aceptado.cell(2, 'Valor Cualidad 1').value).toBe('Aceptado');
    expect(aceptado.cell(2, 'Entre valores Cualidad 1').value).toBe('Aceptado');
    expect(fillOf(aceptado.cell(2, 'Valor Cualidad 1'))).not.toBe(RED);

    const no = await sheetOf(
      makeEm({ muestras: [muestra(1, etapa(10, 'Relleno'))], valores: [degustacion({ valor: 0, estadoValidacion: 'fuera_de_rango' })] }),
    );
    expect(no.cell(2, 'Valor Cualidad 1').value).toBe('No aceptado');
    expect(no.cell(2, 'Entre valores Cualidad 1').value).toBe('Aceptado');
    expect(fillOf(no.cell(2, 'Valor Cualidad 1'))).toBe(RED);
  });

  it('puts the two cualidades of an etapa in their two slots, in load order', async () => {
    const { cell } = await sheetOf(
      makeEm({ muestras: [muestra(1, etapa(10, 'Relleno'))], valores: [degustacion(), temperatura()].sort((a, b) => (a.id as number) - (b.id as number)) }),
    );
    expect(cell(2, 'Cualidad 1').value).toBe('Temperatura (°C)');
    expect(cell(2, 'Cualidad 2').value).toBe('Degustación');
    expect(cell(2, 'Valor Cualidad 2').value).toBe('Aceptado');
  });

  it('keeps each cualidad on the row of its own etapa and "-" where there is none', async () => {
    const { cell } = await sheetOf(
      makeEm({
        muestras: [muestra(1, etapa(10, 'Relleno')), muestra(1, etapa(20, 'Cobertura'))],
        valores: [temperatura()],
      }),
    );
    expect(cell(2, 'Etapa').value).toBe('Relleno');
    expect(cell(2, 'Cualidad 1').value).toBe('Temperatura (°C)');
    expect(cell(3, 'Etapa').value).toBe('Cobertura');
    expect(cell(3, 'Cualidad 1').value).toBe('-');
    expect(cell(3, 'Valor Cualidad 1').value).toBe('-');
    expect(cell(3, 'Entre valores Cualidad 2').value).toBe('-');
  });

  it('does not mix cualidades of another pasada', async () => {
    const otra = { ...pasadaBase, id: 2, numero: 2 };
    const { cell } = await sheetOf(
      makeEm({
        pasadas: [pasadaBase, otra],
        muestras: [muestra(1, etapa(10, 'Relleno')), muestra(2, etapa(10, 'Relleno'))],
        valores: [temperatura()],
      }),
    );
    expect(cell(2, 'Cualidad 1').value).toBe('Temperatura (°C)');
    expect(cell(3, 'Cualidad 1').value).toBe('-');
  });

  it('a pasada without muestras keeps its single row with "-" in the cualidad columns', async () => {
    const { ws, cell } = await sheetOf(makeEm({}));
    expect(ws.rowCount).toBe(2);
    expect(cell(2, 'Etapa').value).toBe('-');
    expect(cell(2, 'Cualidad 1').value).toBe('-');
  });

  it('previous behavior: pasada fields and etapa columns are unchanged when no cualidades exist', async () => {
    const { cell } = await sheetOf(makeEm({ muestras: [muestra(1, etapa(10, 'Relleno'), 48)] }));
    expect(cell(2, 'Etapa').value).toBe('Relleno');
    expect(cell(2, 'Total Muestras Etapa').value).toBe(1);
    expect(cell(2, 'Promedio Neto Etapa').value).toBe('48.0000');
    expect(cell(2, 'Cualidad 1').value).toBe('-');
  });
});
