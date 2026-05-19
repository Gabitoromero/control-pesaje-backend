# Control de Pesaje — Visión General

## ¿Qué es este proyecto?

Sistema digital de control de pesaje en planta industrial, desarrollado para **MaciaSoft**. Reemplaza el proceso manual basado en registros en papel por una solución automatizada con captura de pesos en tiempo real desde balanzas físicas via Raspberry Pi.

## Problema que resuelve

El proceso actual requiere que un operario recorra las etapas de producción cada ~1 hora, pese muestras manualmente, calcule promedios a mano y registre todo en papel. Esto genera:

- Errores en la entrada manual de datos
- Posibilidad de manipulación de datos
- Sin visibilidad en tiempo real del proceso productivo
- Sin trazabilidad confiable
- Acumulación de papel

## Solución propuesta

Una web app que:
- Captura pesos automáticamente desde balanzas via Raspberry Pi (sin tipeo manual)
- Registra cada muestra con trazabilidad completa (usuario, hora, etapa, pasada, línea)
- Muestra información en tiempo real a operarios (tablet) y supervisores (dashboard web)
- Genera reportes exportables en Excel para análisis y auditoría

## Contexto del cliente

- Planta industrial con ~13 líneas de producción (9 operan constantemente)
- Cada línea tiene una balanza KRETZ y una Raspberry Pi asociadas de forma fija
- Los operarios usan tablets en planta
- Jefes y gerentes acceden al dashboard desde cualquier dispositivo web
- Sistema 100% online, sin soporte offline

## Alcance definido

✅ Incluido:
- Captura de pesos via Raspberry Pi
- Interfaz de operario (tablet)
- Dashboard de monitoreo en tiempo real
- Reportes Excel
- ABM de entidades (usuarios, artículos, etapas, líneas, rutas)
- Gestión de roles y permisos

❌ No incluido:
- Operación offline
- Mantenimiento físico de hardware
- Integración con sistemas externos (ERP, etc.)
- Soporte operativo post-implementación
- Garantía ante fallas eléctricas o de red

## Estimación

- **Duración:** 6 a 8 semanas
- **Esfuerzo:** 250 horas distribuidas en 6 fases
