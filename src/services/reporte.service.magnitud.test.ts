import { describe, it, expect, vi } from 'vitest';
import type { EntityManager } from '@mikro-orm/core';
import type { Worksheet } from 'exceljs';
import { reporteService } from './reporte.service.js';
import { MuestraEstadoValidacion } from '../models/Muestra.js';

type AnyRecord = Record<string, unknown>;

const linea = { id: 1, nombre: 'Linea 1' };
const ruta = { id: 7, nombre: 'Ruta Palito' };
const etapaPeso = { id: 1, nombre: 'Envasado', descripcion: null, activo: true };
const etapaVolumen = { id: 2, nombre: 'Moldeado', descripcion: null, activo: true };
const etapaSinConfig = { id: 3, nombre: 'Retirada', descripcion: null, activo: true };

const pasada: AnyRecord = {
  id: 10,
  lineaProduccion: linea,
  rutaPasada: ruta,
  numero: 'P-001',
  estado: 'completa',
  horaInicio: new Date(2026, 10, 1, 9, 0),
  horaCierre: new Date(2026, 10, 1, 10, 0),
  usuario: { nombreApellido: 'Juan Perez' },
};

const makeMuestra = (etapa: AnyRecord, pesoNeto: string, extra: AnyRecord = {}): AnyRecord => ({
  lineaProduccion: linea,
  rutaPasada: ruta,
  pasada,
  etapa,
  timestamp: new Date(2026, 10, 1, 9, 30),
  pesoNeto,
  pesoMinimo: '0.0550',
  pesoIdeal: '0.0600',
  pesoMaximo: '0.0650',
  estadoValidacion: MuestraEstadoValidacion.OK,
  usuario: { nombreApellido: 'Juan Perez' },
  ...extra,
});

const muestras = [
  makeMuestra(etapaPeso, '0.0850'),
  makeMuestra(etapaVolumen, '0.0600'),
  makeMuestra(etapaVolumen, '0.0620'),
  makeMuestra(etapaSinConfig, '0.0700'),
];

// Current configuration of the ruta: etapaSinConfig is no longer part of it.
const rutaEtapas: AnyRecord[] = [
  { id: 70, orden: 1, rutaPasada: ruta, etapa: etapaPeso, magnitud: 'peso', pesoIdeal: '0.0850', pesoMinimo: '0.0800', pesoMaximo: '0.0900', cantidadMuestrasRequeridas: 3 },
  { id: 71, orden: 2, rutaPasada: ruta, etapa: etapaVolumen, magnitud: 'volumen', pesoIdeal: '0.0600', pesoMinimo: '0.0550', pesoMaximo: '0.0650', cantidadMuestrasRequeridas: 3 },
];

const makeEm = () =>
  ({
    find: vi.fn().mockImplementation((entityClass: { name: string }) => {
      if (entityClass.name === 'Muestra') return Promise.resolve(muestras);
      if (entityClass.name === 'Pasada') return Promise.resolve([pasada]);
      if (entityClass.name === 'RutaPasadaEtapa') return Promise.resolve(rutaEtapas);
      if (entityClass.name === 'RutaPasada') return Promise.resolve([{ ...ruta, descripcion: null, activo: true, etapas: rutaEtapas }]);
      return Promise.resolve([]);
    }),
  }) as unknown as EntityManager;

const headers = (sheet: Worksheet): unknown[] => (sheet.getRow(1).values as unknown[]).slice(1);
const column = (sheet: Worksheet, header: string): unknown[] => {
  const col = headers(sheet).indexOf(header) + 1;
  expect(col).toBeGreaterThan(0);
  const values: unknown[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) values.push(sheet.getRow(r).getCell(col).value);
  return values;
};

describe('reportes — unidad por magnitud de la etapa', () => {
  it('Muestras: neutral headers plus a Unidad column, L for volumen etapas and kg otherwise', async () => {
    const sheet = (await reporteService.generateReporteMuestras(makeEm(), new Date(), new Date())).getWorksheet('Muestras')!;

    expect(headers(sheet).slice(9, 14)).toEqual(['Neto', 'Límite Mín', 'Ideal', 'Límite Máx', 'Unidad']);
    expect(headers(sheet).join('|')).not.toMatch(/\(kg\)/);
    // An etapa that is no longer configured in the ruta falls back to peso.
    expect(column(sheet, 'Unidad')).toEqual(['kg', 'L', 'L', 'kg']);
  });

  it('Muestras: a volumen row keeps the numeric value, with no conversion', async () => {
    const sheet = (await reporteService.generateReporteMuestras(makeEm(), new Date(), new Date())).getWorksheet('Muestras')!;

    expect(column(sheet, 'Neto')).toEqual([0.085, 0.06, 0.062, 0.07]);
    expect(column(sheet, 'Límite Mín')[1]).toBe(0.055);
    expect(column(sheet, 'Ideal')[1]).toBe(0.06);
    expect(column(sheet, 'Límite Máx')[1]).toBe(0.065);
  });

  it('Pasadas: the etapa average carries its own Unidad', async () => {
    const sheet = (await reporteService.generateReportePasadas(makeEm(), new Date(), new Date())).getWorksheet('Linea 1')!;

    expect(headers(sheet).slice(-2)).toEqual(['Promedio Neto Etapa', 'Unidad']);
    expect(column(sheet, 'Etapa')).toEqual(['Envasado', 'Moldeado', 'Retirada']);
    expect(column(sheet, 'Promedio Neto Etapa')).toEqual(['0.0850', '0.0610', '0.0700']);
    expect(column(sheet, 'Unidad')).toEqual(['kg', 'L', 'kg']);
  });

  it('Rutas: each ruta-etapa row states its Unidad next to the configured limits', async () => {
    const sheet = (await reporteService.generateReporteRutasPasada(makeEm())).getWorksheet('Rutas y etapas')!;

    expect(headers(sheet).slice(10)).toEqual(['Ideal', 'Mínimo', 'Máximo', 'Unidad', 'Muestras Requeridas']);
    expect(column(sheet, 'Unidad')).toEqual(['kg', 'L']);
    expect(column(sheet, 'Ideal')).toEqual([0.085, 0.06]);
  });
});
