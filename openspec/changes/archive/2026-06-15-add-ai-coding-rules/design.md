## Context

Los asistentes de programación basados en Inteligencia Artificial requieren instrucciones explícitas sobre las restricciones estructurales del proyecto para evitar generar código redundante, crear migraciones y tablas de base de datos sin autorización, e implementar soluciones paralelas en lugar de usar componentes y servicios existentes.

## Goals / Non-Goals

**Goals:**
- Proporcionar directrices a la IA antes de programar en el repositorio.
- Restringir la creación automática de esquemas, migraciones y tablas de base de datos.
- Imponer un ciclo de trabajo de 3 pasos (Inspección, Plan e Implementación).
- Establecer reglas específicas de ZonaWa (soft delete, importaciones entre módulos, uso de Tailwind, etc.).

**Non-Goals:**
- Automatizar la verificación por script de que la IA cumpla las reglas.
- Modificar el comportamiento de la base de datos a nivel de base.

## Decisions

- **Crear `CANON/12_AI_CODING_RULES.md`**: Para mantener la consistencia con las especificaciones canónicas numeradas del proyecto.
- **Crear `.cursorrules` en la raíz**: Para asegurar la carga directa y automática en asistentes de codificación de IA modernos.

## Risks / Trade-offs

- **Riesgo**: Que los agentes de IA ignoren el archivo si no lo leen de manera explícita.
- **Mitigación**: El archivo `.cursorrules` es leído de manera predeterminada en herramientas como Cursor, Windsurf y Cline, y el agente Antigravity tiene instrucciones de leer las especificaciones de OpenSpec.
