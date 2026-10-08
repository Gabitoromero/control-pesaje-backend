import { describe, it, expect, vi } from 'vitest';
import { reporteService } from './reporte.service.js';

type AnyRecord = Record<string, any>;

const SHEET1_HEADERS = [
  'ID Ruta',
  'Ruta',
  'Descripción Ruta',
  'Ruta Activa',
  'ID Ruta-Etapa',
  'Orden',
  'ID Etapa',
  'Etapa',
  'Descripción Etapa',
  'Etapa Activa',
  'Peso Ideal (kg)',
  'Peso Mínimo (kg)',
  'Peso Máximo (kg)',
  'Muestras Requeridas',
];

const SHEET2_HEADERS = [
  'ID Ruta',
  'Ruta',
  'Ruta Activa',
  'ID Artículo',
  'Código',
  'Artículo',
  'Descripción Artículo',
  'Artículo Activo',
];

function makeEtapa(id: number, nombre: string, activo = true, descripcion: string | null = null): AnyRecord {
  return { id, nombre, descripcion, activo };
}

function makeRpe(id: number, orden: number, etapa: AnyRecord, extra: AnyRecord = {}): AnyRecord {
  return {
    id,
    orden,
    etapa,
    pesoIdeal: '12.5000',
    pesoMinimo: '10.0000',
    pesoMaximo: '15.0000',
    cantidadMuestrasRequeridas: 3,
    ...extra,
  };
}

function makeRuta(id: number, nombre: string, etapas: AnyRecord[] = [], extra: AnyRecord = {}): AnyRecord {
  return { id, nombre, descripcion: null, activo: true, etapas, ...extra };
}

function makeAsignacion(id: number, ruta: AnyRecord, articulo: AnyRecord): AnyRecord {
  return { id, rutaPasada: { id: ruta.id }, articulo };
}

function makeArticulo(id: number, codigo: string, extra: AnyRecord = {}): AnyRecord {
  return { id, codigo, nombre: `Art ${codigo}`, descripcion: null, activo: true, ...extra };
}

function makeEm(rutas: AnyRecord[], asignaciones: AnyRecord[] = []) {
  const find = vi.fn().mockImplementation((entityClass: { name: string }) => {
    if (entityClass.name === 'RutaPasada') return Promise.resolve(rutas);
    if (entityClass.name === 'ArticuloRutaPasada') return Promise.resolve(asignaciones);
    return Promise.resolve([]);
  });
  return { find } as any;
}

function rowValues(sheet: any, n: number): any[] {
  const values = sheet.getRow(n).values as any[];
  return values.slice(1);
}

describe('reporteService.generateReporteRutasPasada', () => {
  it('creates the two sheets in order with bold headers', async () => {
    const wb = await reporteService.generateReporteRutasPasada(makeEm([]));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Rutas y etapas', 'Articulos']);
    for (const ws of wb.worksheets) {
      expect(ws.getRow(1).font?.bold).toBe(true);
    }
  });

  it('writes 14 and 8 headers in the expected order', async () => {
    const wb = await reporteService.generateReporteRutasPasada(makeEm([]));
    expect(rowValues(wb.getWorksheet('Rutas y etapas')!, 1)).toEqual(SHEET1_HEADERS);
    expect(rowValues(wb.getWorksheet('Articulos')!, 1)).toEqual(SHEET2_HEADERS);
  });

  it('emits header-only sheets when there are no rutas', async () => {
    const wb = await reporteService.generateReporteRutasPasada(makeEm([]));
    expect(wb.getWorksheet('Rutas y etapas')!.rowCount).toBe(1);
    expect(wb.getWorksheet('Articulos')!.rowCount).toBe(1);
  });

  it('writes one row per (ruta, etapa) including ruta_etapa_id and Sí/No flags', async () => {
    const ruta = makeRuta(1, 'Ruta A', [makeRpe(77, 1, makeEtapa(5, 'Etapa 5', true, 'desc etapa'))], {
      descripcion: 'desc ruta',
    });
    const wb = await reporteService.generateReporteRutasPasada(makeEm([ruta]));
    const sheet = wb.getWorksheet('Rutas y etapas')!;
    expect(sheet.rowCount).toBe(2);
    expect(rowValues(sheet, 2)).toEqual([1, 'Ruta A', 'desc ruta', 'Sí', 77, 1, 5, 'Etapa 5', 'desc etapa', 'Sí', 12.5, 10, 15, 3]);
  });

  it('sorts rutas by nombre with accent-insensitive collation and etapas by orden', async () => {
    const e1 = makeEtapa(1, 'E1');
    const e2 = makeEtapa(2, 'E2');
    const rutas = [
      makeRuta(1, 'zeta'),
      makeRuta(2, 'Base'),
      makeRuta(3, 'Ámbar', [makeRpe(31, 2, e2), makeRpe(30, 1, e1)]),
    ];
    const wb = await reporteService.generateReporteRutasPasada(makeEm(rutas));
    const sheet = wb.getWorksheet('Rutas y etapas')!;
    const names = [2, 3, 4, 5].map((n) => rowValues(sheet, n)[1]);
    expect(names).toEqual(['Ámbar', 'Ámbar', 'Base', 'zeta']);
    expect([2, 3].map((n) => rowValues(sheet, n)[5])).toEqual([1, 2]);
  });

  it('writes a single row with empty etapa cells for a ruta without etapas', async () => {
    const wb = await reporteService.generateReporteRutasPasada(makeEm([makeRuta(9, 'Sola')]));
    const sheet = wb.getWorksheet('Rutas y etapas')!;
    expect(sheet.rowCount).toBe(2);
    const row = sheet.getRow(2);
    expect(row.getCell(1).value).toBe(9);
    expect(row.getCell(2).value).toBe('Sola');
    expect(row.getCell(4).value).toBe('Sí');
    for (let c = 5; c <= 14; c++) {
      expect(row.getCell(c).value).toBeNull();
    }
  });

  it('includes inactive rutas and etapas flagged with No', async () => {
    const ruta = makeRuta(1, 'Inactiva', [makeRpe(1, 1, makeEtapa(2, 'E', false))], { activo: false });
    const wb = await reporteService.generateReporteRutasPasada(makeEm([ruta]));
    const row = rowValues(wb.getWorksheet('Rutas y etapas')!, 2);
    expect(row[3]).toBe('No');
    expect(row[9]).toBe('No');
  });

  it('converts weights to numbers with the peso number format', async () => {
    const ruta = makeRuta(1, 'R', [makeRpe(1, 1, makeEtapa(2, 'E'), { pesoIdeal: '12.500', pesoMinimo: '1.2500', pesoMaximo: '99.9999' })]);
    const wb = await reporteService.generateReporteRutasPasada(makeEm([ruta]));
    const row = wb.getWorksheet('Rutas y etapas')!.getRow(2);
    for (const c of [11, 12, 13]) {
      expect(typeof row.getCell(c).value).toBe('number');
      expect(row.getCell(c).numFmt).toBe('0.0000');
    }
    expect(row.getCell(11).value).toBe(12.5);
    expect(row.getCell(12).value).toBe(1.25);
    expect(row.getCell(13).value).toBe(99.9999);
  });

  it('leaves null descripcion cells empty', async () => {
    const ruta = makeRuta(1, 'R', [makeRpe(1, 1, makeEtapa(2, 'E'))]);
    const wb = await reporteService.generateReporteRutasPasada(makeEm([ruta]));
    const row = wb.getWorksheet('Rutas y etapas')!.getRow(2);
    expect(row.getCell(3).value).toBeNull();
    expect(row.getCell(9).value).toBeNull();
  });

  it('groups articulos per ruta ordered by codigo with numeric collation', async () => {
    const ruta = makeRuta(1, 'R');
    const asignaciones = [
      makeAsignacion(1, ruta, makeArticulo(10, 'Z9')),
      makeAsignacion(2, ruta, makeArticulo(11, 'A10')),
      makeAsignacion(3, ruta, makeArticulo(12, 'A2', { activo: false, descripcion: 'd' })),
    ];
    const wb = await reporteService.generateReporteRutasPasada(makeEm([ruta], asignaciones));
    const sheet = wb.getWorksheet('Articulos')!;
    expect(sheet.rowCount).toBe(4);
    expect([2, 3, 4].map((n) => rowValues(sheet, n)[4])).toEqual(['A2', 'A10', 'Z9']);
    expect(rowValues(sheet, 2)).toEqual([1, 'R', 'Sí', 12, 'A2', 'Art A2', 'd', 'No']);
  });

  it('writes one row with empty articulo cells for a ruta without articulos', async () => {
    const wb = await reporteService.generateReporteRutasPasada(makeEm([makeRuta(4, 'Vacia')]));
    const sheet = wb.getWorksheet('Articulos')!;
    expect(sheet.rowCount).toBe(2);
    const row = sheet.getRow(2);
    expect(row.getCell(1).value).toBe(4);
    expect(row.getCell(2).value).toBe('Vacia');
    expect(row.getCell(3).value).toBe('Sí');
    for (let c = 4; c <= 8; c++) {
      expect(row.getCell(c).value).toBeNull();
    }
  });

  it('lists an articulo once per ruta it belongs to', async () => {
    const r1 = makeRuta(1, 'A');
    const r2 = makeRuta(2, 'B');
    const art = makeArticulo(10, 'X1');
    const wb = await reporteService.generateReporteRutasPasada(
      makeEm([r1, r2], [makeAsignacion(1, r1, art), makeAsignacion(2, r2, art)]),
    );
    const sheet = wb.getWorksheet('Articulos')!;
    expect(sheet.rowCount).toBe(3);
    expect([2, 3].map((n) => rowValues(sheet, n)[1])).toEqual(['A', 'B']);
  });

  it('queries the database exactly twice', async () => {
    const em = makeEm([makeRuta(1, 'A'), makeRuta(2, 'B')]);
    await reporteService.generateReporteRutasPasada(em);
    expect(em.find).toHaveBeenCalledTimes(2);
  });
});
