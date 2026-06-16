# ZonaWa - Product Blueprint

## Purpose
Detallar los módulos funcionales del producto (autenticación, dashboard, administrador de números de WhatsApp, credenciales de IA, prompting de agentes, bandeja de entrada con handoff).

## 1. Módulos del Producto

### A. Módulo de Autenticación
* **Registro de Usuario:** Captura nombre, correo y contraseña. Genera automáticamente un registro en la tabla `profiles`.
* **Inicio de Sesión (Login):** Autenticación mediante correo y contraseña administrada por Supabase Auth.
* **Control de Sesión:** Persistencia de estado y redirección automática para proteger las rutas internas de la aplicación.

### B. Dashboard Principal
* **Consumo de IA:** Widget que muestra el costo total acumulado del mes actual en USD, calculado a partir de la suma de `usage_logs.estimated_cost`.
* **Mensajes Procesados:** Estadísticas en tiempo real de mensajes procesados hoy vs. el día anterior.
* **Bots Activos:** Indicador dinámico del número de bots encendidos (ej: `3 de 5 activos`).
* **Feed de Actividad Reciente:** Tabla que muestra los últimos 5 mensajes respondidos por los bots del usuario, mostrando el número, cliente y fecha.

### C. Módulo de Números (Administrador de WhatsApp)
* **Visualización:** Grid de tarjetas que representan los números de WhatsApp registrados (máximo 6).
* **Estados Visuales de Conexión:**
  * `CONNECTED`: Botón en verde, indicando que el WebSocket está en línea.
  * `WAITING_QR`: Muestra un botón para "Ver Código QR" en un modal.
  * `DISCONNECTED` / `ERROR`: Muestra un estado de advertencia y opción de reconexión.
* **Acciones:**
  * **Agregar Número:** Botón que abre un modal, solicita un "Nombre de Instancia", e invoca el API para generar un código QR nuevo.
  * **Eliminar Número:** Elimina la sesión de WhatsApp en Evolution API y borra la fila en Supabase (cascada elimina la configuración).
  * **Interruptor de Bot (Switch):** Switch rápido para activar/desactivar el agente en ese número (valida el límite de 5 activos).

### D. Módulo de Conexiones (Credenciales de IA)
* **Proveedores Soportados:** OpenAI, Gemini, Claude, Groq.
* **Formulario de Registro:**
  * Selector del proveedor de IA.
  * Nickname (apodo para identificar la conexión en caso de tener múltiples cuentas).
  * API Key (campo enmascarado de contraseña).
* **Gestión:** Tabla simple que lista las conexiones, indicando si están activas y permitiendo eliminarlas.

### E. Módulo de Configuración de Agentes (Mapeo y Prompting)
* **Configuración Individual:** Permite mapear un número de WhatsApp específico con:
  * El proveedor/conexión de IA a utilizar.
  * El prompt de rol/sistema que define la personalidad y objetivos del bot.
  * Configuración de Temperatura (0.0 a 1.2) para controlar la aleatoriedad de las respuestas.
  * Límite de tokens máximos por respuesta (`max_tokens`).
  * Configuración de Triggers (activadores por palabras clave).

### F. Módulo de Perfil de Cliente
* Formulario para actualizar datos personales del cliente: Nombre, Apellido, Teléfono, Zona Horaria (afecta la lógica de horarios del bot) y Nombre de la Empresa.
* El campo de Correo Electrónico es de lectura únicamente.

### G. Módulo de Chats y Handoff (Intervención Humana)
* **Historial de Conversaciones:** Visualización de chats activos organizados por número de WhatsApp.
* **Control de Handoff:** Botón de "Pausar Bot" o toggle `BOT / HUMANO` para cada conversación individual.
  * Si está en modo **BOT**, el webhook de orquestación de la IA procesa y responde automáticamente.
  * Si se cambia a modo **HUMANO**, el bot se detiene para ese cliente en específico, permitiendo al operador responder manualmente desde WhatsApp o la plataforma sin interferencia de la IA.
* **Bandeja de Entrada Multicanal:** Lista rápida de chats pendientes de atención humana.

---

## 2. Experiencia de Usuario ante Límites del Sistema

* **Intento de registrar un 7mo número:**
  * El frontend debe bloquear la acción mostrando una alerta: *"Has alcanzado el límite máximo de 6 números de WhatsApp. Elimina un número existente para poder registrar uno nuevo."* El backend lo bloqueará a través del trigger `tr_check_max_whatsapp_numbers` si el cliente intenta burlar la UI.
* **Intento de activar un 6to bot:**
  * El switch se desactivará automáticamente mostrando un Toast de error: *"Límite excedido: Solo puedes tener un máximo de 5 bots activos simultáneamente. Desactiva otro bot primero."* Esto está protegido a nivel transaccional en Supabase por el trigger `tr_check_max_active_bots`.

## Requirements
### Requirement: Control de Handoff para Intervención Humana
La plataforma SHALL proveer una interfaz para alternar una conversación entre modo bot y modo humano (handoff).

#### Scenario: Activación de Handoff Humano
- **WHEN** El usuario cambia el estado de una conversación a "HUMANO" desde la interfaz de chats
- **THEN** El bot de IA se desactiva temporalmente para esa conversación en específico.
