# ZonaWa - AI Coding Rules

## Purpose
Establecer las reglas y el modo obligatorio de trabajo para la Inteligencia Artificial cuando realiza tareas de programación, modificación o extensión del código del proyecto ZonaWa.

## 1. Antes de escribir código:

1. Lee primero la estructura existente del proyecto.
2. No crees columnas, tablas, migraciones, servicios, rutas ni componentes nuevos sin permiso explícito.
3. Si necesitas un dato que no existe, detente y pregunta.
4. Usa únicamente columnas ya existentes en el esquema actual.
5. Usa helpers, servicios, tipos y componentes ya creados antes de crear nuevos.
6. No propongas soluciones paralelas si existe una estructura previa.
7. Antes de modificar algo, enumera qué archivos existentes vas a usar y por qué.
8. Si no estás seguro de una columna, función o tipo, búscalo en el repo. No lo inventes.
9. Prohibido crear migraciones nuevas salvo que yo diga literalmente: “crea una migración”.
10. Prohibido crear tablas nuevas salvo aprobación explícita.

## 2. Reglas obligatorias del proyecto:

- OpenSpec es la fuente de verdad. Antes de implementar, lee la spec afectada en `openspec/specs/`.
- No crear migraciones nuevas sin change proposal aprobado.
- No crear columnas nuevas sin revisar primero las specs y el schema existente.
- No usar `DELETE FROM` en tablas de negocio. Usar soft delete con `is_active = false`.
- No insertar directo en `audit_logs`. Usar `createAuditLog`.
- No importar entre módulos `modules/A` -> `modules/B`.
- Usar UUIDs para relaciones y queries. `short_id` es solo visual.
- UI con Tailwind Slate + Emerald. No MUI, Ant Design ni Chakra.

## 3. Modo obligatorio de trabajo:

### Paso 1: Inspección
- Busca archivos, tipos, tablas, servicios y componentes existentes relacionados.
- Resume qué existe actualmente.
- **No escribas código todavía.**

### Paso 2: Plan
- Propón cambios usando solo estructuras existentes.
- Indica si necesitas algo que no existe.
- Si necesitas schema nuevo, detente y pide aprobación.

### Paso 3: Implementación
- Edita solo los archivos necesarios.
- No crees migraciones.
- No crees columnas/tablas.

## Requirements
### Requirement: Reglas de Programación de la IA
El agente de IA que programe en ZonaWa SHALL seguir las reglas obligatorias y el modo de trabajo de tres pasos (Inspección, Plan, Implementación).

#### Scenario: Programación de tareas por la IA
- **WHEN** El agente de IA inicia cualquier cambio de código o tarea
- **THEN** Sigue los tres pasos obligatorios y cumple las reglas de programación y del proyecto.
