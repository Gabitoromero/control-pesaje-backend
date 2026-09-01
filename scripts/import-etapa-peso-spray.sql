-- Agrega la etapa "PESO SPRAY" (genérica, sin sufijo 1-2 / 3-4), usada por la
-- ruta CONO AMERICANA ARTI. Complementa a import-etapas-cliente.sql (ya
-- ejecutado) — correr esto una sola vez antes de import-rutas-cliente.sql.

BEGIN;

INSERT INTO etapa (nombre, descripcion) VALUES
  ('PESO SPRAY', NULL);

COMMIT;
