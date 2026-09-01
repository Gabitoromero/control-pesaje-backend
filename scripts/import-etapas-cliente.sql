-- Alinea el catálogo de etapas con la lista final que envió el cliente
-- (26 etapas totales usadas en las rutas). Correr ANTES de
-- import-rutas-cliente.sql.
--
-- 11 de esas 26 ya existen en producción con el mismo nombre y no se tocan:
-- PESO CONO, PESO MIX, PESO SPRAY, VOLUMEN (renombrada abajo), PESO FINAL,
-- PESO COBERTURA, PESO CREMA, PESO SIEMBRA, PESO FINAL BOMBON, PESO GRANA,
-- PESO GALLETITA (descripción actualizada abajo).
--
-- Las 8 etapas ya existentes que no forman parte de esta lista (Envasado,
-- Control Peso, Detector Metales, Embalaje, Control Peso 5g/10g/20g/30g) no
-- se modifican: son de otro flujo (calibración), no de rutas de producto.

BEGIN;

-- Rename: la etapa "VOLUMEN" (usada en las rutas de Paletera) pasa a
-- llamarse "VOLUMEN (ML)" con descripción "PALITERA", según el catálogo
-- final del cliente.
UPDATE etapa
SET nombre = 'VOLUMEN (ML)', descripcion = 'PALITERA'
WHERE nombre = 'VOLUMEN';

-- La etapa "PESO GALLETITA" ya existe pero sin descripción; el cliente
-- aclaró que corresponde a la ruta Postre Red Velvet.
UPDATE etapa
SET descripcion = 'RED VELVET'
WHERE nombre = 'PESO GALLETITA';

-- ==== ETAPAS NUEVAS (15) ====
INSERT INTO etapa (nombre, descripcion) VALUES
  ('ALTURA CREMA', NULL),
  ('ALTURA TOTAL', NULL),
  ('GALLETITAS MINI OREO', NULL),
  ('PESO BAÑO', NULL),
  ('PESO CHOCO', 'FRUTOS DEL BOSQUE'),
  ('PESO COBERTURA + GRANA', NULL),
  ('PESO CREMA AMERICANA', 'POSTRE 3 LECHES'),
  ('PESO CREMA CONDENSADA', 'POSTRE 3 LECHES'),
  ('PESO CREMA DDL', 'POSTRE 3 LECHES'),
  ('PESO CREMA+DDL', NULL),
  ('PESO CROCANTE', NULL),
  ('PESO ESTUCHE', NULL),
  ('PESO GRANIZADO', NULL),
  ('TEMPERATURA', NULL),
  ('VELOCIDAD', NULL);

COMMIT;
