-- Importación de rutas de producción (ruta_pasada + ruta_pasada_etapa) desde
-- la planilla "Importacion de datos - Controlador Pesaje - Rutas.csv"
-- (versión corregida por el cliente: ya no tiene etapas repetidas dentro de
-- una misma ruta).
--
-- Requiere haber corrido ANTES import-etapas-cliente.sql y
-- import-etapa-peso-spray.sql (agregan las etapas nuevas que usa esta
-- importación, incluida 'PESO SPRAY' para CONO AMERICANA ARTI).
--
-- La columna "RANGO TOLERANCIA ACEPTABLE" (siempre 10%) no se persiste: no
-- existe una columna equivalente en el schema.
--
-- UNIDADES: la planilla trae todos los valores en GRAMOS (incluidas las
-- etapas que conceptualmente son cm/ml: ALTURA CREMA, ALTURA TOTAL,
-- VOLUMEN (ML)), pero el sistema persiste y compara todo en KILOGRAMOS. El
-- modelo Muestra tiene un único campo numérico, pesoNeto (Muestra.ts), que
-- siempre viene de la balanza normalizada a kg vía toKilogramos
-- (balanza.handler.ts) — no hay ningún canal separado para cm/ml. Por eso
-- TODAS las filas de ruta_pasada_etapa de este script están cargadas en kg
-- (÷1000 respecto del valor de la planilla), sin excepción.
--
-- EXCLUIDAS (9 rutas que ya existen en producción — las administra el
-- cliente directamente, NO se insertan ni se editan acá):
--   - PALITERA (SUMMUN/ZUM/DUCCI/DIA)
--   - PALITERA ( P.MUNDIAL-DUOMO-PIACEPIU)
--   - PESO BOMBON CORAZON( PISTACHO)
--   - PESOS CONO 85GR (CARREFOUR/TUO/DORET/BLANCO ARTI/DIA)
--   - CONO BOLA
--   - CONO COOKIES
--   - CONTROL PESOS BARRAS (ALMENDRADA LM)
--   - CONTROL PESOS BARRAS (FRUTILLA CON MERENGUES LM/DUCCI))
--   - POTE 3L CON GRANIZADO (ya existe en producción, id=9; no está en esta planilla)

BEGIN;

-- ==== RUTAS (64) ====
INSERT INTO ruta_pasada (nombre, descripcion) VALUES
  ('CONTROL CON COBERTURA (OUCH)', 'OUCH'),
  ('CON COBERTURA (P.BOMBON LM-CC-AM-DUOMO-DUCCI)', 'P.BOMBON LM-CC-AM-DUOMO-DUCCI'),
  ('CON COBERTURA (P.BOMBON MDL)', 'P.BOMBON MD'),
  ('CON COBERTURA(CUORE BLANCO/DUCCI/DIA CUORE/TEN ALM/DUCCI/DIA)', '(CUORE BLANCO/DUCCI/DIA)(CUORE/TEN ALM/DUCCI/DIA)'),
  ('CON COBERTURA (CROC LM)', NULL),
  ('CON COBERTURA(B. SUIZO CC/LM)', NULL),
  ('CON COBERTURA (P.BOMBON AMOROSO)', NULL),
  ('CON COBERTURA (OUCH PARTY)', NULL),
  ('CON COBERTURA (P.GRANIZADO)', NULL),
  ('POTES PREMIUN X1L LM(CHOCO SUPER TORTA)', NULL),
  ('POTE PREMIUN X1L (CHOCOLATE SHOCK)', NULL),
  ('POTE PREMIUN X1L(SUPER DDL CON MERENGUE)', NULL),
  ('POTE PREMIUN X1L (COOKIES AND CREAM)', NULL),
  ('POTE PREMIUN X1L ROGEL CON DDL', NULL),
  ('PESO BUGY KIDS', NULL),
  ('PESO PALITO X LA VIDA', NULL),
  ('PESOS POSTRE 3 LECHES', NULL),
  ('PESO POSTRE RED VELVET', NULL),
  ('PESO VOLCAN DE CHOCOLATE', NULL),
  ('PALITERA (P.PEÑA)', NULL),
  ('PALITERA (P.AMOROSO)', NULL),
  ('PALITERA ( POPUOP CC-UPMONT LM)', NULL),
  ('PALITERA(DUO CC/ DOS LM)', NULL),
  ('PALITERA ( P.CREMA / GABITOS)', NULL),
  ('PESO CONTROL ALMENDRADO LM', NULL),
  ('PESO CONTROL ALMENDRADO DUOMO', NULL),
  ('SIN COBERTURA (P.CHOCOLATADA CC)', NULL),
  ('SIN COBERTURA (P.CREMA-CABITOS-AMOROSOS)', NULL),
  ('SIN CONERTURA (GOL ARGENTINA)', NULL),
  ('SIN COBERTURA (FANTI)', NULL),
  ('SIN COBERTURA (MIXTO LM/CC)', NULL),
  ('SIN COBERTURA(MIXTO ARTI)', NULL),
  ('SIN COBERTURA AMERICANA CATERING', NULL),
  ('SIN COBERTURA FRUTIS', NULL),
  ('CONTROL COPITAS (MIDI/JAMAICA)', NULL),
  ('CONTROL COPAS (GRAN COM FANOCHE)', 'LOS PARAMETROS DE PESO NO CONTEMPLA PESO DEL ENVASE'),
  ('CONTROL COPAS (NAPOLITANO)', NULL),
  ('CONTROL COPAS CHOCOLATE (COPA LM-COMCOM-CARREFOUR)', NULL),
  ('CONTROL COPAS DDL Y FRUTILLA ( LM- COMCOM-CARREFOUR-ARTI)', NULL),
  ('CONTROL BOMBON ESCOSES', 'B. ESCOCES-LM-CC-DUOMO-PIACEPIU-ARTI'),
  ('PESOS BOMBON CORAZON (DDL)', 'EL PESO MINIMO ES EL PESO LEGAL- CADA ENVASE DEBE CONTENER 15 BOMBONES'),
  ('PESO ALFAJOR HELADO (FANTOCHE CC-DUCCI)', NULL),
  ('PESO ALFAJOR HELADO (FANTOCHE BLANCO CC)', NULL),
  ('PESO ALFAJOR HELADO (LM-DUOMO-DIA)', NULL),
  ('PESOS TORTAS (TORTA BOMBA DDL)', NULL),
  ('PESO TORTA (FRUTOS DEL BOSQUE)', 'LLEVA PIONONO'),
  ('PESO PALITO TWIST-REMIX (CARAMEL)', NULL),
  ('PESO PALITO TWIST-REMIX(TRIPLE CHOCO)', NULL),
  ('PESO PINTA (DDL GRANIZADO)', NULL),
  ('PESO PINTA ( SUPER FLAN)', NULL),
  ('PESO PINTA (COKIE CON DDL )', NULL),
  ('PESO PINTA (CHOCOLATE ALPINO)', NULL),
  ('PESO PINTA FRUTILLA', NULL),
  ('PESO BALDES LISOS', NULL),
  ('PESO BALDES LISOS AL AGUA', NULL),
  ('PESOS BALDE 1 SIEMBRA (FRUTOS SECOS)', NULL),
  ('PESOS BALDE 1 SIEMBRA (FRUTAS-SALSAS/VARIEGATTO-MANTECOL-NUTELLINA-BORRACHA)', NULL),
  ('PESOS BALDE 1 SIEMBRA (VARIEGATTO LIMON- PISTACHO CRANCH)', NULL),
  ('PESOS BALDE 1 SIEMBRA (DDL-MARROC)', NULL),
  ('PESOS BALDE 1 SIEMBRA (DDL SUPER DDL- GRANIZADO-COOKIES)', NULL),
  ('PESOS BALDE 1 SIEMBRA (CHOCOLATE BLANCO)', NULL),
  ('CONO AMERICANA ARTI', 'CONO AMERIANA 95gr ARTI'),
  ('CONTROL PESOS BARRAS (CHOCOBARRA LM-DIA%/DUCCI)', NULL),
  ('CONTROL PESOS BARRAS (CHOCOLATE INTENSO LM/DIA%)', NULL);

-- ==== RUTA_PASADA_ETAPA ====

-- CONTROL CON COBERTURA (OUCH)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL CON COBERTURA (OUCH)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.073, 0.075, 0.077, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL CON COBERTURA (OUCH)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.059, 0.06, 0.061, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL CON COBERTURA (OUCH)'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 3, 0.014, 0.015, 0.016, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL CON COBERTURA (OUCH)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 4, 0.0015, 0.0019, 0.0022, 1;

-- CON COBERTURA (P.BOMBON LM-CC-AM-DUOMO-DUCCI)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (P.BOMBON LM-CC-AM-DUOMO-DUCCI)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.048, 0.05, 0.052, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (P.BOMBON LM-CC-AM-DUOMO-DUCCI)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.041, 0.042, 0.043, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (P.BOMBON LM-CC-AM-DUOMO-DUCCI)'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 3, 0.007, 0.008, 0.009, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (P.BOMBON LM-CC-AM-DUOMO-DUCCI)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 4, 0.0015, 0.0021, 0.0022, 1;

-- CON COBERTURA (P.BOMBON MDL)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (P.BOMBON MDL)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.035, 0.037, 0.039, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (P.BOMBON MDL)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.03, 0.031, 0.032, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (P.BOMBON MDL)'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 3, 0.005, 0.006, 0.007, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (P.BOMBON MDL)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 4, 0.0015, 0.0021, 0.0025, 1;

-- CON COBERTURA(CUORE BLANCO/DUCCI/DIA CUORE/TEN ALM/DUCCI/DIA)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA(CUORE BLANCO/DUCCI/DIA CUORE/TEN ALM/DUCCI/DIA)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.073, 0.075, 0.077, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA(CUORE BLANCO/DUCCI/DIA CUORE/TEN ALM/DUCCI/DIA)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.049, 0.05, 0.051, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA(CUORE BLANCO/DUCCI/DIA CUORE/TEN ALM/DUCCI/DIA)'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 3, 0.021, 0.025, 0.026, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA(CUORE BLANCO/DUCCI/DIA CUORE/TEN ALM/DUCCI/DIA)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 4, 0.0015, 0.0021, 0.0025, 1;

-- CON COBERTURA (CROC LM)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (CROC LM)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.047, 0.05, 0.053, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (CROC LM)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.038, 0.039, 0.04, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (CROC LM)'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 3, 0.008, 0.009, 0.01, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (CROC LM)'), (SELECT id FROM etapa WHERE nombre = 'PESO CROCANTE'), 4, 0.001, 0.002, 0.003, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (CROC LM)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 5, 0.0015, 0.0018, 0.002, 1;

-- CON COBERTURA(B. SUIZO CC/LM)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA(B. SUIZO CC/LM)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.093, 0.095, 0.097, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA(B. SUIZO CC/LM)'), (SELECT id FROM etapa WHERE nombre = 'PESO MIX'), 2, 0.08, 0.081, 0.082, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA(B. SUIZO CC/LM)'), (SELECT id FROM etapa WHERE nombre = 'PESO BAÑO'), 3, 0.013, 0.014, 0.015, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA(B. SUIZO CC/LM)'), (SELECT id FROM etapa WHERE nombre = 'PESO ESTUCHE'), 4, 0.002, 0.0022, 0.0025, 3;

-- CON COBERTURA (P.BOMBON AMOROSO)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (P.BOMBON AMOROSO)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.028, 0.03, 0.032, 4
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (P.BOMBON AMOROSO)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.023, 0.024, 0.025, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (P.BOMBON AMOROSO)'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 3, 0.005, 0.006, 0.007, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (P.BOMBON AMOROSO)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 4, 0.001, 0.0015, 0.002, 1;

-- CON COBERTURA (OUCH PARTY)
-- REVISAR: PESO CREMA — ideal = max = 59g en la planilla. Se carga literal.
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (OUCH PARTY)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.072, 0.075, 0.078, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (OUCH PARTY)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.057, 0.059, 0.059, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (OUCH PARTY)'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA + GRANA'), 3, 0.015, 0.017, 0.019, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (OUCH PARTY)'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 4, 0.013, 0.014, 0.015, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (OUCH PARTY)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 5, 0.002, 0.003, 0.004, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (OUCH PARTY)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 6, 0.0005, 0.001, 0.002, 1;

-- CON COBERTURA (P.GRANIZADO)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (P.GRANIZADO)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.046, 0.048, 0.05, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (P.GRANIZADO)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.042, 0.043, 0.044, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (P.GRANIZADO)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 3, 0.004, 0.005, 0.006, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CON COBERTURA (P.GRANIZADO)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 4, 0.0015, 0.002, 0.0021, 1;

-- POTES PREMIUN X1L LM(CHOCO SUPER TORTA)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTES PREMIUN X1L LM(CHOCO SUPER TORTA)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.497, 0.5, 0.503, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTES PREMIUN X1L LM(CHOCO SUPER TORTA)'), (SELECT id FROM etapa WHERE nombre = 'PESO MIX'), 2, 0.399, 0.4, 0.401, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTES PREMIUN X1L LM(CHOCO SUPER TORTA)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.049, 0.05, 0.051, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTES PREMIUN X1L LM(CHOCO SUPER TORTA)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 4, 0.049, 0.05, 0.051, 3;

-- POTE PREMIUN X1L (CHOCOLATE SHOCK)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTE PREMIUN X1L (CHOCOLATE SHOCK)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.497, 0.5, 0.503, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTE PREMIUN X1L (CHOCOLATE SHOCK)'), (SELECT id FROM etapa WHERE nombre = 'PESO MIX'), 2, 0.399, 0.4, 0.401, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTE PREMIUN X1L (CHOCOLATE SHOCK)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.039, 0.04, 0.041, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTE PREMIUN X1L (CHOCOLATE SHOCK)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 4, 0.059, 0.06, 0.061, 3;

-- POTE PREMIUN X1L(SUPER DDL CON MERENGUE)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTE PREMIUN X1L(SUPER DDL CON MERENGUE)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.497, 0.5, 0.503, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTE PREMIUN X1L(SUPER DDL CON MERENGUE)'), (SELECT id FROM etapa WHERE nombre = 'PESO MIX'), 2, 0.399, 0.4, 0.401, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTE PREMIUN X1L(SUPER DDL CON MERENGUE)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.059, 0.06, 0.061, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTE PREMIUN X1L(SUPER DDL CON MERENGUE)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 4, 0.039, 0.04, 0.041, 3;

-- POTE PREMIUN X1L (COOKIES AND CREAM)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTE PREMIUN X1L (COOKIES AND CREAM)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.497, 0.5, 0.503, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTE PREMIUN X1L (COOKIES AND CREAM)'), (SELECT id FROM etapa WHERE nombre = 'PESO MIX'), 2, 0.389, 0.39, 0.391, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTE PREMIUN X1L (COOKIES AND CREAM)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.059, 0.06, 0.061, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTE PREMIUN X1L (COOKIES AND CREAM)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 4, 0.049, 0.05, 0.051, 3;

-- POTE PREMIUN X1L ROGEL CON DDL
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTE PREMIUN X1L ROGEL CON DDL'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.496, 0.5, 0.504, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTE PREMIUN X1L ROGEL CON DDL'), (SELECT id FROM etapa WHERE nombre = 'PESO MIX'), 2, 0.378, 0.38, 0.382, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTE PREMIUN X1L ROGEL CON DDL'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.059, 0.06, 0.061, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'POTE PREMIUN X1L ROGEL CON DDL'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 4, 0.059, 0.06, 0.061, 3;

-- PESO BUGY KIDS
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO BUGY KIDS'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.064, 0.065, 0.066, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO BUGY KIDS'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 2, 0.0015, 0.0025, 0.003, 1;

-- PESO PALITO X LA VIDA
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PALITO X LA VIDA'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.073, 0.075, 0.077, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PALITO X LA VIDA'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.057, 0.058, 0.059, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PALITO X LA VIDA'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 3, 0.016, 0.017, 0.018, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PALITO X LA VIDA'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 4, 0.002, 0.0021, 0.0025, 1;

-- PESOS POSTRE 3 LECHES
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS POSTRE 3 LECHES'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.09, 0.092, 0.094, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS POSTRE 3 LECHES'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA AMERICANA'), 2, 0.0325, 0.033, 0.0335, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS POSTRE 3 LECHES'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA DDL'), 3, 0.0245, 0.025, 0.0255, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS POSTRE 3 LECHES'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA CONDENSADA'), 4, 0.0245, 0.025, 0.0255, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS POSTRE 3 LECHES'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 5, 0.0085, 0.009, 0.0095, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS POSTRE 3 LECHES'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 6, 0.003, 0.0035, 0.004, 1;

-- PESO POSTRE RED VELVET
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO POSTRE RED VELVET'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.084, 0.085, 0.087, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO POSTRE RED VELVET'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.058, 0.059, 0.06, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO POSTRE RED VELVET'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.0055, 0.006, 0.0065, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO POSTRE RED VELVET'), (SELECT id FROM etapa WHERE nombre = 'PESO GALLETITA'), 4, 0.0195, 0.02, 0.0205, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO POSTRE RED VELVET'), (SELECT id FROM etapa WHERE nombre = 'ALTURA CREMA'), 5, 0.002, 0.0025, 0.003, 1
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO POSTRE RED VELVET'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 6, 0.003, 0.0037, 0.004, 1;

-- PESO VOLCAN DE CHOCOLATE
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO VOLCAN DE CHOCOLATE'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.083, 0.085, 0.087, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO VOLCAN DE CHOCOLATE'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.059, 0.06, 0.061, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO VOLCAN DE CHOCOLATE'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.0095, 0.01, 0.0105, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO VOLCAN DE CHOCOLATE'), (SELECT id FROM etapa WHERE nombre = 'PESO GALLETITA'), 4, 0.01, 0.01, 0.01, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO VOLCAN DE CHOCOLATE'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 5, 0.0045, 0.005, 0.0055, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO VOLCAN DE CHOCOLATE'), (SELECT id FROM etapa WHERE nombre = 'ALTURA CREMA'), 6, 0.004, 0.0041, 0.005, 1
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO VOLCAN DE CHOCOLATE'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 7, 0.004, 0.0047, 0.005, 1;

-- PALITERA (P.PEÑA)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PALITERA (P.PEÑA)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.062, 0.064, 0.066, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PALITERA (P.PEÑA)'), (SELECT id FROM etapa WHERE nombre = 'VOLUMEN (ML)'), 2, 0.06, 0.065, 0.07, 3;

-- PALITERA (P.AMOROSO)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PALITERA (P.AMOROSO)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.053, 0.055, 0.057, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PALITERA (P.AMOROSO)'), (SELECT id FROM etapa WHERE nombre = 'VOLUMEN (ML)'), 2, 0.05, 0.055, 0.06, 3;

-- PALITERA ( POPUOP CC-UPMONT LM)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PALITERA ( POPUOP CC-UPMONT LM)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.053, 0.055, 0.057, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PALITERA ( POPUOP CC-UPMONT LM)'), (SELECT id FROM etapa WHERE nombre = 'VOLUMEN (ML)'), 2, 0.05, 0.055, 0.06, 3;

-- PALITERA(DUO CC/ DOS LM)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PALITERA(DUO CC/ DOS LM)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.043, 0.045, 0.047, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PALITERA(DUO CC/ DOS LM)'), (SELECT id FROM etapa WHERE nombre = 'VOLUMEN (ML)'), 2, 0.05, 0.055, 0.06, 3;

-- PALITERA ( P.CREMA / GABITOS)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PALITERA ( P.CREMA / GABITOS)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.046, 0.048, 0.05, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PALITERA ( P.CREMA / GABITOS)'), (SELECT id FROM etapa WHERE nombre = 'VOLUMEN (ML)'), 2, 0.065, 0.07, 0.075, 3;

-- PESO CONTROL ALMENDRADO LM
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO CONTROL ALMENDRADO LM'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.096, 0.098, 0.1, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO CONTROL ALMENDRADO LM'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.089, 0.09, 0.091, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO CONTROL ALMENDRADO LM'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 3, 0.007, 0.008, 0.009, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO CONTROL ALMENDRADO LM'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 4, 0.001, 0.0015, 0.002, 1;

-- PESO CONTROL ALMENDRADO DUOMO
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO CONTROL ALMENDRADO DUOMO'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.088, 0.09, 0.092, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO CONTROL ALMENDRADO DUOMO'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.081, 0.082, 0.083, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO CONTROL ALMENDRADO DUOMO'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 3, 0.007, 0.008, 0.009, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO CONTROL ALMENDRADO DUOMO'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 4, 0.002, 0.002, 0.0025, 1;

-- SIN COBERTURA (P.CHOCOLATADA CC)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'SIN COBERTURA (P.CHOCOLATADA CC)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.033, 0.035, 0.037, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'SIN COBERTURA (P.CHOCOLATADA CC)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 2, 0.002, 0.0023, 0.0025, 1;

-- SIN COBERTURA (P.CREMA-CABITOS-AMOROSOS)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'SIN COBERTURA (P.CREMA-CABITOS-AMOROSOS)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.046, 0.048, 0.05, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'SIN COBERTURA (P.CREMA-CABITOS-AMOROSOS)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 2, 0.002, 0.0021, 0.0025, 1;

-- SIN CONERTURA (GOL ARGENTINA)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'SIN CONERTURA (GOL ARGENTINA)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.056, 0.058, 0.06, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'SIN CONERTURA (GOL ARGENTINA)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 2, 0.001, 0.002, 0.0025, 1;

-- SIN COBERTURA (FANTI)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'SIN COBERTURA (FANTI)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.058, 0.06, 0.062, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'SIN COBERTURA (FANTI)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 2, 0.001, 0.002, 0.0025, 1;

-- SIN COBERTURA (MIXTO LM/CC)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'SIN COBERTURA (MIXTO LM/CC)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.076, 0.078, 0.08, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'SIN COBERTURA (MIXTO LM/CC)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 2, 0.002, 0.0021, 0.0025, 1;

-- SIN COBERTURA(MIXTO ARTI)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'SIN COBERTURA(MIXTO ARTI)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.083, 0.085, 0.087, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'SIN COBERTURA(MIXTO ARTI)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 2, 0.0019, 0.0021, 0.0025, 1;

-- SIN COBERTURA AMERICANA CATERING
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'SIN COBERTURA AMERICANA CATERING'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.048, 0.05, 0.052, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'SIN COBERTURA AMERICANA CATERING'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 2, 0.003, 0.0035, 0.004, 1;

-- SIN COBERTURA FRUTIS
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'SIN COBERTURA FRUTIS'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.098, 0.1, 0.102, 3;

-- CONTROL COPITAS (MIDI/JAMAICA)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL COPITAS (MIDI/JAMAICA)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.078, 0.08, 0.082, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL COPITAS (MIDI/JAMAICA)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 1, 0.066, 0.067, 0.068, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL COPITAS (MIDI/JAMAICA)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 2, 0.012, 0.013, 0.014, 3;

-- CONTROL COPAS (GRAN COM FANOCHE)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL COPAS (GRAN COM FANOCHE)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.117, 0.12, 0.123, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL COPAS (GRAN COM FANOCHE)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.089, 0.09, 0.091, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL COPAS (GRAN COM FANOCHE)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANIZADO'), 3, 0.006, 0.007, 0.008, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL COPAS (GRAN COM FANOCHE)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 4, 0.009, 0.01, 0.011, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL COPAS (GRAN COM FANOCHE)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 5, 0.01, 0.013, 0.015, 3;

-- CONTROL COPAS (NAPOLITANO)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL COPAS (NAPOLITANO)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.148, 0.15, 0.152, 3;

-- CONTROL COPAS CHOCOLATE (COPA LM-COMCOM-CARREFOUR)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL COPAS CHOCOLATE (COPA LM-COMCOM-CARREFOUR)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.118, 0.12, 0.122, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL COPAS CHOCOLATE (COPA LM-COMCOM-CARREFOUR)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.104, 0.105, 0.106, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL COPAS CHOCOLATE (COPA LM-COMCOM-CARREFOUR)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.0125, 0.013, 0.0135, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL COPAS CHOCOLATE (COPA LM-COMCOM-CARREFOUR)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 4, 0.0015, 0.002, 0.0025, 3;

-- CONTROL COPAS DDL Y FRUTILLA ( LM- COMCOM-CARREFOUR-ARTI)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL COPAS DDL Y FRUTILLA ( LM- COMCOM-CARREFOUR-ARTI)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.118, 0.12, 0.122, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL COPAS DDL Y FRUTILLA ( LM- COMCOM-CARREFOUR-ARTI)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.106, 0.107, 0.108, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL COPAS DDL Y FRUTILLA ( LM- COMCOM-CARREFOUR-ARTI)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.012, 0.013, 0.014, 3;

-- CONTROL BOMBON ESCOSES
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL BOMBON ESCOSES'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.0855, 0.09, 0.0945, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL BOMBON ESCOSES'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.063, 0.065, 0.067, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL BOMBON ESCOSES'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.008, 0.009, 0.01, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL BOMBON ESCOSES'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 4, 0.0015, 0.002, 0.0025, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL BOMBON ESCOSES'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 5, 0.013, 0.014, 0.015, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL BOMBON ESCOSES'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 6, 0.003, 0.0035, 0.004, 1;

-- PESOS BOMBON CORAZON (DDL)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BOMBON CORAZON (DDL)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL BOMBON'), 1, 0.012, 0.013, 0.014, 4
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BOMBON CORAZON (DDL)'), (SELECT id FROM etapa WHERE nombre = 'PESO MIX'), 2, 0.0095, 0.01, 0.0105, 4
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BOMBON CORAZON (DDL)'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 3, 0.0025, 0.003, 0.0035, 4
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BOMBON CORAZON (DDL)'), (SELECT id FROM etapa WHERE nombre = 'PESO ESTUCHE'), 4, 0.18, 0.195, 0.21, 4
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BOMBON CORAZON (DDL)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA CREMA'), 5, 0.001, 0.0013, 0.0015, 1
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BOMBON CORAZON (DDL)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 6, 0.001, 0.0015, 0.002, 1;

-- PESO ALFAJOR HELADO (FANTOCHE CC-DUCCI)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (FANTOCHE CC-DUCCI)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.082, 0.085, 0.088, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (FANTOCHE CC-DUCCI)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.024, 0.025, 0.026, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (FANTOCHE CC-DUCCI)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.003, 0.004, 0.005, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (FANTOCHE CC-DUCCI)'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 4, 0.01, 0.011, 0.012, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (FANTOCHE CC-DUCCI)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA CREMA'), 5, 0.001, 0.0013, 0.0015, 1
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (FANTOCHE CC-DUCCI)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 6, 0.003, 0.0034, 0.004, 1
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (FANTOCHE CC-DUCCI)'), (SELECT id FROM etapa WHERE nombre = 'VOLUMEN (ML)'), 7, 0.1, 0.106, 0.11, 3;

-- PESO ALFAJOR HELADO (FANTOCHE BLANCO CC)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (FANTOCHE BLANCO CC)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.082, 0.085, 0.088, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (FANTOCHE BLANCO CC)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.024, 0.025, 0.026, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (FANTOCHE BLANCO CC)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.003, 0.004, 0.005, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (FANTOCHE BLANCO CC)'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 4, 0.012, 0.013, 0.014, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (FANTOCHE BLANCO CC)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA CREMA'), 5, 0.001, 0.0013, 0.0015, 1
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (FANTOCHE BLANCO CC)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 6, 0.003, 0.0035, 0.004, 1
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (FANTOCHE BLANCO CC)'), (SELECT id FROM etapa WHERE nombre = 'VOLUMEN (ML)'), 7, 0.1, 0.103, 0.108, 3;

-- PESO ALFAJOR HELADO (LM-DUOMO-DIA)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (LM-DUOMO-DIA)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.092, 0.095, 0.098, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (LM-DUOMO-DIA)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.06, 0.061, 0.062, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (LM-DUOMO-DIA)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.008, 0.009, 0.01, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (LM-DUOMO-DIA)'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 4, 0.014, 0.015, 0.016, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (LM-DUOMO-DIA)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA CREMA'), 5, 0.002, 0.0026, 0.003, 1
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (LM-DUOMO-DIA)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 6, 0.003, 0.0033, 0.0035, 1
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO ALFAJOR HELADO (LM-DUOMO-DIA)'), (SELECT id FROM etapa WHERE nombre = 'VOLUMEN (ML)'), 7, 0.14, 0.142, 0.15, 3;

-- PESOS TORTAS (TORTA BOMBA DDL)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS TORTAS (TORTA BOMBA DDL)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.75, 0.8, 0.85, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS TORTAS (TORTA BOMBA DDL)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA AMERICANA'), 2, 0.16, 0.17, 0.18, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS TORTAS (TORTA BOMBA DDL)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA DDL'), 3, 0.5, 0.51, 0.52, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS TORTAS (TORTA BOMBA DDL)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 4, 0.08, 0.1, 0.12, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS TORTAS (TORTA BOMBA DDL)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 5, 0.01, 0.02, 0.03, 3;

-- PESO TORTA (FRUTOS DEL BOSQUE)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO TORTA (FRUTOS DEL BOSQUE)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.75, 0.8, 0.85, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO TORTA (FRUTOS DEL BOSQUE)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA AMERICANA'), 2, 0.16, 0.17, 0.18, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO TORTA (FRUTOS DEL BOSQUE)'), (SELECT id FROM etapa WHERE nombre = 'PESO CHOCO'), 3, 0.436, 0.446, 0.456, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO TORTA (FRUTOS DEL BOSQUE)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 4, 0.01, 0.02, 0.03, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO TORTA (FRUTOS DEL BOSQUE)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 5, 0.08, 0.1, 0.12, 3;

-- PESO PALITO TWIST-REMIX (CARAMEL)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PALITO TWIST-REMIX (CARAMEL)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.072, 0.075, 0.078, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PALITO TWIST-REMIX (CARAMEL)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.051, 0.053, 0.055, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PALITO TWIST-REMIX (CARAMEL)'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 3, 0.021, 0.022, 0.023, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PALITO TWIST-REMIX (CARAMEL)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 4, 0.0019, 0.0021, 0.0025, 1;

-- PESO PALITO TWIST-REMIX(TRIPLE CHOCO)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PALITO TWIST-REMIX(TRIPLE CHOCO)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.071, 0.075, 0.079, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PALITO TWIST-REMIX(TRIPLE CHOCO)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.048, 0.05, 0.052, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PALITO TWIST-REMIX(TRIPLE CHOCO)'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 3, 0.021, 0.022, 0.023, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PALITO TWIST-REMIX(TRIPLE CHOCO)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 4, 0.002, 0.003, 0.004, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PALITO TWIST-REMIX(TRIPLE CHOCO)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 5, 0.0019, 0.0021, 0.0025, 1;

-- PESO PINTA (DDL GRANIZADO)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA (DDL GRANIZADO)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.297, 0.3, 0.303, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA (DDL GRANIZADO)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.209, 0.21, 0.211, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA (DDL GRANIZADO)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.059, 0.06, 0.061, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA (DDL GRANIZADO)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANIZADO'), 4, 0.029, 0.03, 0.031, 3;

-- PESO PINTA ( SUPER FLAN)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA ( SUPER FLAN)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.297, 0.3, 0.303, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA ( SUPER FLAN)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.224, 0.225, 0.226, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA ( SUPER FLAN)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.014, 0.015, 0.016, 3;

-- PESO PINTA (COKIE CON DDL )
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA (COKIE CON DDL )'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.297, 0.3, 0.303, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA (COKIE CON DDL )'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.219, 0.22, 0.221, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA (COKIE CON DDL )'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.059, 0.06, 0.061, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA (COKIE CON DDL )'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 4, 0.019, 0.02, 0.021, 3;

-- PESO PINTA (CHOCOLATE ALPINO)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA (CHOCOLATE ALPINO)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.297, 0.3, 0.303, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA (CHOCOLATE ALPINO)'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.209, 0.21, 0.211, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA (CHOCOLATE ALPINO)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.059, 0.06, 0.061, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA (CHOCOLATE ALPINO)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANIZADO'), 4, 0.029, 0.03, 0.031, 3;

-- PESO PINTA FRUTILLA
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA FRUTILLA'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.297, 0.3, 0.303, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA FRUTILLA'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.209, 0.21, 0.211, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA FRUTILLA'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 3, 0.044, 0.045, 0.046, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO PINTA FRUTILLA'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANIZADO'), 4, 0.044, 0.045, 0.046, 3;

-- PESO BALDES LISOS
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO BALDES LISOS'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 4.9, 5, 5.1, 4;

-- PESO BALDES LISOS AL AGUA
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESO BALDES LISOS AL AGUA'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 5.09, 5.19, 5.29, 4;

-- PESOS BALDE 1 SIEMBRA (FRUTOS SECOS)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BALDE 1 SIEMBRA (FRUTOS SECOS)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 5.09, 5.19, 5.29, 4
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BALDE 1 SIEMBRA (FRUTOS SECOS)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 2, 0.35, 0.375, 0.4, 4;

-- PESOS BALDE 1 SIEMBRA (FRUTAS-SALSAS/VARIEGATTO-MANTECOL-NUTELLINA-BORRACHA)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BALDE 1 SIEMBRA (FRUTAS-SALSAS/VARIEGATTO-MANTECOL-NUTELLINA-BORRACHA)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 5.09, 5.19, 5.29, 4
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BALDE 1 SIEMBRA (FRUTAS-SALSAS/VARIEGATTO-MANTECOL-NUTELLINA-BORRACHA)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 2, 0.4, 0.45, 0.5, 4;

-- PESOS BALDE 1 SIEMBRA (VARIEGATTO LIMON- PISTACHO CRANCH)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BALDE 1 SIEMBRA (VARIEGATTO LIMON- PISTACHO CRANCH)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 5.09, 5.19, 5.29, 4
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BALDE 1 SIEMBRA (VARIEGATTO LIMON- PISTACHO CRANCH)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 2, 0.45, 0.5, 0.55, 4;

-- PESOS BALDE 1 SIEMBRA (DDL-MARROC)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BALDE 1 SIEMBRA (DDL-MARROC)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 5.09, 5.19, 5.29, 4
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BALDE 1 SIEMBRA (DDL-MARROC)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 2, 0.5, 0.55, 0.6, 4;

-- PESOS BALDE 1 SIEMBRA (DDL SUPER DDL- GRANIZADO-COOKIES)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BALDE 1 SIEMBRA (DDL SUPER DDL- GRANIZADO-COOKIES)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 5.09, 5.19, 5.29, 4
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BALDE 1 SIEMBRA (DDL SUPER DDL- GRANIZADO-COOKIES)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 2, 0.35, 0.4, 0.45, 4;

-- PESOS BALDE 1 SIEMBRA (CHOCOLATE BLANCO)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BALDE 1 SIEMBRA (CHOCOLATE BLANCO)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 5.09, 5.19, 5.29, 4
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'PESOS BALDE 1 SIEMBRA (CHOCOLATE BLANCO)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 2, 0.3, 0.325, 0.35, 4;

-- CONO AMERICANA ARTI
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONO AMERICANA ARTI'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 1, 0.092, 0.095, 0.099, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONO AMERICANA ARTI'), (SELECT id FROM etapa WHERE nombre = 'PESO CREMA'), 2, 0.064, 0.0655, 0.067, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONO AMERICANA ARTI'), (SELECT id FROM etapa WHERE nombre = 'PESO SPRAY'), 3, 0.0035, 0.004, 0.0045, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONO AMERICANA ARTI'), (SELECT id FROM etapa WHERE nombre = 'PESO COBERTURA'), 4, 0.007, 0.0105, 0.0115, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONO AMERICANA ARTI'), (SELECT id FROM etapa WHERE nombre = 'PESO CONO'), 5, 0.013, 0.015, 0.017, 3;

-- CONTROL PESOS BARRAS (CHOCOBARRA LM-DIA%/DUCCI)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL PESOS BARRAS (CHOCOBARRA LM-DIA%/DUCCI)'), (SELECT id FROM etapa WHERE nombre = 'PESO MIX'), 1, 0.472, 0.516, 0.56, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL PESOS BARRAS (CHOCOBARRA LM-DIA%/DUCCI)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 2, 0.028, 0.03, 0.032, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL PESOS BARRAS (CHOCOBARRA LM-DIA%/DUCCI)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 3, 0.05, 0.054, 0.058, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL PESOS BARRAS (CHOCOBARRA LM-DIA%/DUCCI)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 4, 0.55, 0.6, 0.65, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL PESOS BARRAS (CHOCOBARRA LM-DIA%/DUCCI)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 5, 0.004, 0.0045, 0.005, 1;

-- CONTROL PESOS BARRAS (CHOCOLATE INTENSO LM/DIA%)
INSERT INTO ruta_pasada_etapa (ruta_pasada_id, etapa_id, orden, peso_minimo, peso_ideal, peso_maximo, cantidad_muestras_requeridas)
SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL PESOS BARRAS (CHOCOLATE INTENSO LM/DIA%)'), (SELECT id FROM etapa WHERE nombre = 'PESO MIX'), 1, 0.505, 0.548, 0.591, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL PESOS BARRAS (CHOCOLATE INTENSO LM/DIA%)'), (SELECT id FROM etapa WHERE nombre = 'PESO SIEMBRA'), 2, 0.025, 0.03, 0.035, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL PESOS BARRAS (CHOCOLATE INTENSO LM/DIA%)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANIZADO'), 3, 0.008, 0.009, 0.01, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL PESOS BARRAS (CHOCOLATE INTENSO LM/DIA%)'), (SELECT id FROM etapa WHERE nombre = 'PESO GRANA'), 4, 0.012, 0.013, 0.014, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL PESOS BARRAS (CHOCOLATE INTENSO LM/DIA%)'), (SELECT id FROM etapa WHERE nombre = 'PESO FINAL'), 5, 0.55, 0.6, 0.65, 3
UNION ALL SELECT (SELECT id FROM ruta_pasada WHERE nombre = 'CONTROL PESOS BARRAS (CHOCOLATE INTENSO LM/DIA%)'), (SELECT id FROM etapa WHERE nombre = 'ALTURA TOTAL'), 6, 0.004, 0.0045, 0.005, 1;

COMMIT;

