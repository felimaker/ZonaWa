## ADDED Requirements

### Requirement: Cumplimiento de Reglas del Agente
El agente de IA que programe en ZonaWa SHALL seguir las reglas obligatorias y el modo de trabajo de tres pasos (Inspección, Plan, Implementación).

#### Scenario: Inicio de Programación de Tareas
- **WHEN** El agente de IA inicia cualquier cambio de código o tarea
- **THEN** Se ejecuta el Paso 1 (Inspección), luego el Paso 2 (Plan), y finalmente el Paso 3 (Implementación), respetando todas las restricciones y prohibiciones de creación de base de datos/migraciones sin aprobación.
