## ADDED Requirements

### Requirement: Almacenamiento de Tráfico y Metadatos de IA
La tabla `usage_logs` SHALL almacenar la información detallada del tráfico de IA, incluyendo el modelo utilizado, el prompt y la respuesta.

#### Scenario: Inserción de un log de consumo con detalles de tráfico de IA
- **WHEN** El webhook de WhatsApp realiza una llamada exitosa a un LLM
- **THEN** Se inserta una fila en `usage_logs` conteniendo `provider`, `model_name`, `prompt_text`, `response_text`, tokens e `estimated_cost`.
