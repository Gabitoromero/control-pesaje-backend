import { describe, it, expect, vi } from 'vitest';
import { reporteService } from './reporte.service.js';
import { MuestraEstadoValidacion } from '../models/Muestra.js';

type AnyRecord = Record<string, any>;

const linea1 = { id: 1, nombre: 'Linea 1' };
const linea2 = { id: 2, nombre: 'Linea 2' };

const pasada1: AnyRecord = {
  id: 10,
  lineaProduccion: linea1,
  rutaPasada: { nombre: 'Ruta 1' },
  balanza: { nombre: 'Balanza 1' },
  numero: 'P-001',
  observacion: 'nota inicio',
  articulo: { codigo: 'A-001', nombre: 'Articulo 1' },
  estado: 'CERRADA',
  horaInicio: new Date(2023, 0, 1, 9, 0),
  horaCierre: new Date(2023, 0, 1, 11, 30),
  usuario: { nombreApellido: 'Juan Perez' },
  motivoCierre: 'Fin de lote',
  observacionCierre: 'nota cierre',
};

const pasada2: AnyRecord = {
  id: 11,
  lineaProduccion: linea2,
  rutaPasada: { nombre: 'Ruta 2' },
  numero: 'P-002',
  estado: 'EN CURSO',
  horaInicio: new Date(2023, 0, 2, 8, 5),
  usuario: { nombreApellido: 'Ana Gomez' },
};

function makeMuestra(extra: AnyRecord): AnyRecord {
  return {
    lineaProduccion: linea1,
    rutaPasada: { nombre: 'Ruta 1' },
    pasada: pasada1,
    etapa: { nombre: 'Etapa A' },
    timestamp: new Date(2023, 0, 1, 10, 0),
    pesoNeto: '100.0000',
    pesoMinimo: '90.0000',
    pesoIdeal: '100.0000',
    pesoMaximo: '110.0000',
    estadoValidacion: MuestraEstadoValidacion.OK,
    observacion: 'ninguna',
    usuario: { nombreApellido: 'Juan Perez' },
    ...extra,
  };
}

const muestras: AnyRecord[] = [
  makeMuestra({}),
  makeMuestra({ pesoNeto: '95.0000', estadoValidacion: MuestraEstadoValidacion.FUERA_DE_RANGO, observacion: undefined, timestamp: new Date(2023, 0, 1, 10, 5) }),
  makeMuestra({ etapa: { nombre: 'Etapa B' }, pesoNeto: '50.0000', timestamp: new Date(2023, 0, 1, 10, 10) }),
  makeMuestra({ pasada: undefined, pesoMinimo: undefined, pesoIdeal: undefined, pesoMaximo: undefined, timestamp: new Date(2023, 0, 1, 12, 0) }),
];

function makeEm(ms: AnyRecord[], ps: AnyRecord[]) {
  return {
    find: vi.fn().mockImplementation((entityClass: { name: string }) => {
      if (entityClass.name === 'Muestra') return Promise.resolve(ms);
      if (entityClass.name === 'Pasada') return Promise.resolve(ps);
      return Promise.resolve([]);
    }),
  } as any;
}

const rowValues = (sheet: any, n: number): any[] => (sheet.getRow(n).values as any[]).slice(1);

const PASADAS_HEADERS = [
  'Línea de Producción', 'Balanza', 'Ruta', 'N° Pasada', 'Observación Pasada', 'Código', 'Artículo', 'Estado Pasada',
  'Inicio', 'Cierre', 'Duración (min)', 'Responsable', 'Total Muestras Pasada', 'Conformes Pasada',
  'Fuera de Rango Pasada', '% Conforme Pasada', 'Motivo de Cierre', 'Observación Cierre',
  'Etapa', 'Total Muestras Etapa', 'Promedio Peso Neto Etapa (kg)',
];
const MUESTRAS_HEADERS = [
  'Línea de Producción', 'Balanza', 'Ruta', 'N° Pasada', 'Estado Pasada', 'Código', 'Artículo', 'Etapa',
  'Fecha/Hora Muestra', 'Peso Neto (kg)', 'Límite Mín (kg)', 'Peso Ideal (kg)', 'Límite Máx (kg)', 'Validación',
  'Observación Muestra', 'Operario',
];

// One sheet per production line that had pasadas in the range, named after the line. Each row is one etapa
// of one pasada; the pasada's own fields repeat on every row of its etapas. The line id is only appended to
// the sheet name when several lines would otherwise get the same name.
describe('reporteService.generateReportePasadas', () => {
  const generate = (ms = muestras, ps = [pasada1, pasada2]) =>
    reporteService.generateReportePasadas(makeEm(ms, ps), new Date(), new Date());

  it('emits one sheet per line with pasadas, in line-name order, with no separate Etapas or Muestras sheet', async () => {
    const wb = await generate();
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Linea 1', 'Linea 2']);
  });

  it('emits only the Sin datos sheet when there are no pasadas in range', async () => {
    const wb = await generate([], []);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Sin datos']);
    expect(wb.getWorksheet('Sin datos')!.getCell('A1').value).toBe('Sin datos para el rango seleccionado');
  });

  it('writes the headers with the pasada and etapa columns told apart', async () => {
    const sheet = (await generate()).getWorksheet('Linea 1')!;
    expect(rowValues(sheet, 1)).toEqual(PASADAS_HEADERS);
    expect(sheet.getRow(1).font?.bold).toBe(true);
  });

  it('writes one row per etapa of the pasada and repeats the pasada fields on every row', async () => {
    const sheet = (await generate()).getWorksheet('Linea 1')!;
    const pasadaFields = [
      'Linea 1', 'Balanza 1', 'Ruta 1', 'P-001', 'nota inicio', 'A-001', 'Articulo 1', 'CERRADA',
      '01/01/2023 09:00', '01/01/2023 11:30', 150, 'Juan Perez', 3, 2, 1, '66.7', 'Fin de lote', 'nota cierre',
    ];
    expect(rowValues(sheet, 2)).toEqual([...pasadaFields, 'Etapa A', 2, '97.5000']);
    expect(rowValues(sheet, 3)).toEqual([...pasadaFields, 'Etapa B', 1, '50.0000']);
    expect(sheet.rowCount).toBe(3);
  });

  it('keeps a pasada without muestras as a single row with "-" in the etapa columns', async () => {
    const sheet = (await generate()).getWorksheet('Linea 2')!;
    expect(rowValues(sheet, 2)).toEqual([
      'Linea 2', '-', 'Ruta 2', 'P-002', '-', '-', '-', 'EN CURSO',
      '02/01/2023 08:05', '-', '-', 'Ana Gomez', 0, 0, 0, '0.0', '-', '-',
      '-', '-', '-',
    ]);
    expect(sheet.rowCount).toBe(2);
  });

  it('puts each pasada under its own line and keeps pasadas in start order', async () => {
    const segunda = { ...pasada1, id: 14, numero: 'P-003', horaInicio: new Date(2023, 0, 1, 15, 0) };
    const ms = [...muestras, makeMuestra({ pasada: segunda, etapa: { nombre: 'Etapa A' } })];
    const sheet = (await generate(ms, [pasada1, segunda, pasada2])).getWorksheet('Linea 1')!;
    const numeros = [2, 3, 4].map((n) => rowValues(sheet, n)[3]);
    expect(numeros).toEqual(['P-001', 'P-001', 'P-003']);
  });

  it('names each sheet after its line, without an id when the name is unique', async () => {
    const wb = await generate();
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Linea 1', 'Linea 2']);
  });

  it('strips the characters Excel forbids and truncates the name to 31 characters', async () => {
    const larga = { id: 3, nombre: 'Linea/de*produccion?con[un]nombre muy largo' };
    const wb = await generate([], [{ ...pasada1, id: 12, lineaProduccion: larga }]);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Lineadeproduccionconunnombre mu']);
    expect(wb.worksheets[0].name.length).toBeLessThanOrEqual(31);
  });

  it('falls back to "Línea {id}" when nothing is left of the name after cleaning it', async () => {
    const wb = await generate([], [{ ...pasada1, id: 12, lineaProduccion: { id: 7, nombre: '???' } }]);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Línea 7']);
  });

  it('adds the line id only to the lines that would share a name (case-insensitively or after truncating)', async () => {
    const lineas = [
      { id: 13, nombre: 'LLENADORA' },
      { id: 26, nombre: 'Llenadora' },
      { id: 19, nombre: 'POTE PREMIUM' },
      { id: 20, nombre: 'POTE PREMIUM' },
      { id: 101, nombre: 'Una linea con un nombre larguisimo A' },
      { id: 102, nombre: 'Una linea con un nombre larguisimo B' },
      { id: 30, nombre: 'Chocobarra' },
    ];
    const ps = lineas.map((l, i) => ({ ...pasada1, id: 500 + i, lineaProduccion: l }));
    const wb = await generate([], ps);

    const names = wb.worksheets.map((w) => w.name);
    expect(names).toHaveLength(7);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(7);
    expect(names).toEqual(expect.arrayContaining(['LLENADORA 13', 'Llenadora 26', 'POTE PREMIUM 19', 'POTE PREMIUM 20', 'Chocobarra']));
    expect(names.every((n) => n.length <= 31)).toBe(true);
  });

  it('still returns unique names when a plain name equals another line\'s name with its id', async () => {
    const lineas = [
      { id: 7, nombre: 'Ana 8' },
      { id: 8, nombre: 'Ana' },
      { id: 9, nombre: 'Ana' },
    ];
    const ps = lineas.map((l, i) => ({ ...pasada1, id: 600 + i, lineaProduccion: l }));
    const names = (await generate([], ps)).worksheets.map((w) => w.name);
    expect(names).toHaveLength(3);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(3);
  });

  it('queries muestras and pasadas once each, filtering pasadas by activo', async () => {
    const em = makeEm(muestras, [pasada1]);
    await reporteService.generateReportePasadas(em, new Date(), new Date());
    expect(em.find).toHaveBeenCalledTimes(2);
    const pasadaCall = em.find.mock.calls.find((c: any[]) => c[0].name === 'Pasada');
    expect(pasadaCall[1]).toMatchObject({ activo: true });
  });

  it('handles a large volume of pasadas and muestras with consistent totals', async () => {
    const PASADAS = 300;
    const POR_PASADA = 40;
    const ETAPAS = 4;
    const lineas = [1, 2, 3].map((id) => ({ id, nombre: `Linea ${id}` }));
    const ps = Array.from({ length: PASADAS }, (_, i) => ({
      ...pasada1,
      id: 1000 + i,
      numero: `P-${i}`,
      lineaProduccion: lineas[i % 3],
    }));
    const ms = ps.flatMap((p) =>
      Array.from({ length: POR_PASADA }, (_, j) =>
        makeMuestra({
          pasada: p,
          lineaProduccion: p.lineaProduccion,
          etapa: { nombre: `Etapa ${j % ETAPAS}` },
          estadoValidacion: j % 5 === 0 ? MuestraEstadoValidacion.FUERA_DE_RANGO : MuestraEstadoValidacion.OK,
        }),
      ),
    );

    const wb = await generate(ms, ps);

    expect(wb.worksheets).toHaveLength(3);
    let pasadasEnHojas = 0;
    for (const l of lineas) {
      const sheet = wb.getWorksheet(l.nombre)!;
      const porLinea = PASADAS / 3;
      expect(sheet.rowCount).toBe(1 + porLinea * ETAPAS);
      expect(rowValues(sheet, 2).slice(12, 16)).toEqual([POR_PASADA, 32, 8, '80.0']);
      expect(rowValues(sheet, 2).slice(19, 21)).toEqual([POR_PASADA / ETAPAS, '100.0000']);
      pasadasEnHojas += (sheet.rowCount - 1) / ETAPAS;
    }
    expect(pasadasEnHojas).toBe(PASADAS);
  });
});

describe('reporteService.generateReporteMuestras', () => {
  const generate = (ms = muestras, ps = [pasada1, pasada2]) =>
    reporteService.generateReporteMuestras(makeEm(ms, ps), new Date(), new Date());

  it('emits a single Muestras sheet with all lines together and the line as a column', async () => {
    const other = makeMuestra({ lineaProduccion: linea2, pasada: pasada2, timestamp: new Date(2023, 0, 2, 9, 0) });
    const wb = await generate([...muestras, other]);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Muestras']);
    const sheet = wb.getWorksheet('Muestras')!;
    expect(sheet.rowCount).toBe(1 + 5);
    expect(rowValues(sheet, 6)[0]).toBe('Linea 2');
  });

  it('writes the headers with balanza, código and artículo, bold', async () => {
    const sheet = (await generate()).getWorksheet('Muestras')!;
    expect(rowValues(sheet, 1)).toEqual(MUESTRAS_HEADERS);
    expect(sheet.getRow(1).font?.bold).toBe(true);
  });

  it('writes balanza, código and artículo from the muestra pasada', async () => {
    const sheet = (await generate()).getWorksheet('Muestras')!;
    expect(rowValues(sheet, 2)).toEqual([
      'Linea 1', 'Balanza 1', 'Ruta 1', 'P-001', 'CERRADA', 'A-001', 'Articulo 1', 'Etapa A',
      '01/01/2023 10:00', 100, 90, 100, 110, 'ok', 'ninguna', 'Juan Perez',
    ]);
  });

  it('keeps validation text, colors and "-" placeholders; muestras without pasada are highlighted', async () => {
    const sheet = (await generate()).getWorksheet('Muestras')!;
    expect(rowValues(sheet, 3)[13]).toBe('fuera de rango');
    expect(rowValues(sheet, 3)[14]).toBe('-');
    expect(sheet.getRow(2).getCell('validacion').fill).toMatchObject({ fgColor: { argb: 'FF92D050' } });
    expect(sheet.getRow(3).getCell('validacion').fill).toMatchObject({ fgColor: { argb: 'FFFF0000' } });
    expect(rowValues(sheet, 5)).toEqual([
      'Linea 1', '-', 'Ruta 1', '-', '-', '-', '-', 'Etapa A',
      '01/01/2023 12:00', 100, '-', '-', '-', 'ok', 'ninguna', 'Juan Perez',
    ]);
    expect(sheet.getRow(5).getCell('linea').fill).toMatchObject({ fgColor: { argb: 'FFFFFF00' } });
  });

  it('writes "-" for balanza, código and artículo when the pasada has none', async () => {
    const sheet = (await generate([makeMuestra({ pasada: pasada2, lineaProduccion: linea2 })])).getWorksheet('Muestras')!;
    expect(rowValues(sheet, 2).slice(1, 7)).toEqual(['-', 'Ruta 1', 'P-002', 'EN CURSO', '-', '-']);
  });

  it('emits only the Sin datos sheet when there are no muestras in range', async () => {
    const wb = await generate([], [pasada1]);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Sin datos']);
  });

  it('queries only muestras, not pasadas', async () => {
    const em = makeEm(muestras, [pasada1]);
    await reporteService.generateReporteMuestras(em, new Date(), new Date());
    expect(em.find).toHaveBeenCalledTimes(1);
    expect(em.find.mock.calls[0][0].name).toBe('Muestra');
  });

  it('handles a large volume of muestras in a single sheet', async () => {
    const N = 10000;
    const ms = Array.from({ length: N }, (_, i) => makeMuestra({ timestamp: new Date(2023, 0, 1, 0, 0, i) }));
    const wb = await generate(ms);
    expect(wb.getWorksheet('Muestras')!.rowCount).toBe(N + 1);
  });
});
