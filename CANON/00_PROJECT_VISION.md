# ZonaWa - 00_PROJECT_VISION.md

## 1. Visión General del Proyecto
**ZonaWa** es una plataforma SaaS multi-tenant diseñada para automatizar y administrar la atención al cliente en WhatsApp utilizando múltiples proveedores de Inteligencia Artificial (IA). 

La plataforma permite a los usuarios conectar sus propios números de WhatsApp (a través de Evolution API) y asociar cada número a un agente de IA personalizado, configurado con prompts de sistema, roles de negocio y disparadores específicos.

## 2. Objetivos Estratégicos
* **Automatización Inteligente:** Responder a consultas frecuentes de forma natural, contextual y con memoria de conversación.
* **Control Multi-Agente:** Permitir que cada número trabaje con un proveedor y modelo de IA diferente, o compartan la misma configuración si es necesario.
* **SaaS Multi-tenant:** Escalabilidad nativa para múltiples clientes con almacenamiento seguro y aislamiento estricto de datos.
* **Control de Consumo:** Panel detallado en tiempo real para visualizar el gasto de tokens e historial financiero derivado del uso de la IA.

## 3. Limitaciones y Reglas de Negocio (Límites de Uso)
Para garantizar la estabilidad y proteger los recursos del sistema, se establecen las siguientes restricciones estrictas por cuenta de usuario:
* **Límite de Registro:** Máximo **6 números de WhatsApp** guardados en base de datos.
* **Límite de Operación:** Máximo **5 bots activos simultáneamente** procesando chats con IA.
* **Autonomía del Usuario:** Capacidad de activar/desactivar bots instantáneamente y registrar/actualizar credenciales de IA de manera independiente.
