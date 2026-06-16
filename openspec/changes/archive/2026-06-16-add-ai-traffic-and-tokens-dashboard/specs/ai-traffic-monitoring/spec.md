## ADDED Requirements

### Requirement: Inspector Visual de Tránsito de IA
El frontend SHALL proveer un panel de visualización e inspección de peticiones enviadas y recibidas de la IA.

#### Scenario: Visualizar detalles de una petición de IA
- **WHEN** El usuario ingresa a la pestaña de "Consumo" y selecciona una petición del historial
- **THEN** El sistema muestra el prompt enviado (incluyendo el contexto del historial y reglas de comportamiento), la respuesta de la IA, el proveedor, el modelo, los tokens consumidos y el costo estimado.

### Requirement: Consumo de Tokens por Proveedor y Modelo
El panel SHALL agregar y desglosar el consumo de tokens y costos asociados por cada proveedor y modelo de IA.

#### Scenario: Visualizar estadísticas de tokens
- **WHEN** El usuario visualiza la sección de estadísticas
- **THEN** Se muestran gráficos o resúmenes de consumo que agrupan los tokens de entrada, salida y totales consumidos por cada modelo de IA seleccionado (e.g. gpt-4o-mini, claude-3-5-sonnet, gemini-1.5-flash).
