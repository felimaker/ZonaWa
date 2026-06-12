import { useState } from 'react'
import { 
  HelpCircle, Bot, Plug, Sparkles, Smartphone, MessageSquare, 
  ChevronDown, ExternalLink, Key, ShieldAlert, Cpu
} from 'lucide-react'

export default function Help() {
  const [openSection, setOpenSection] = useState('how-to-setup')

  const toggleSection = (sectionId) => {
    setOpenSection(openSection === sectionId ? null : sectionId)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Centro de Ayuda</h1>
          <p className="page-subtitle">Guías interactivas para configurar tu entorno e Inteligencia Artificial</p>
        </div>
      </div>

      <div className="help-container">
        <div className="help-accordions">
          
          {/* SECCIÓN 1: CONFIGURAR IA PASO A PASO */}
          <div className={`help-accordion-item ${openSection === 'how-to-setup' ? 'open' : ''}`}>
            <button className="help-accordion-header" onClick={() => toggleSection('how-to-setup')}>
              <span className="help-accordion-title">
                <Cpu size={18} className="help-accordion-icon" />
                Guía Paso a Paso: Cómo Agregar y Configurar una IA
              </span>
              <ChevronDown size={18} className="help-accordion-chevron" />
            </button>
            
            {openSection === 'how-to-setup' && (
              <div className="help-accordion-content">
                <div className="help-steps">
                  
                  {/* PASO 1 */}
                  <div className="help-step-item">
                    <div className="help-step-number">1</div>
                    <div className="help-step-body">
                      <h4 className="help-step-title">Obtener tu API Key</h4>
                      <p className="help-step-text">
                        Necesitas una API Key del proveedor de Inteligencia Artificial que prefieras. A continuación tienes los enlaces directos y recomendaciones de saldo para cada uno:
                      </p>
                      
                      <div className="provider-info-grid">
                        <div className="provider-info-card">
                          <h5>
                            <span className="model-rate-provider provider-openai">OpenAI</span>
                          </h5>
                          <p style={{ marginBottom: '6px' }}>
                            Accede a <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer">platform.openai.com <ExternalLink size={10} style={{ display: 'inline' }} /></a>, crea una cuenta y genera una Key en <strong>API Keys</strong>.
                          </p>
                          <p className="warn-text" style={{ fontSize: '0.72rem', display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                            <ShieldAlert size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
                            Requiere cargar saldo de prepago (mínimo $5 USD) en la sección Billing para que funcione.
                          </p>
                        </div>

                        <div className="provider-info-card">
                          <h5>
                            <span className="model-rate-provider provider-anthropic">Anthropic</span>
                          </h5>
                          <p style={{ marginBottom: '6px' }}>
                            Accede a <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer">console.anthropic.com <ExternalLink size={10} style={{ display: 'inline' }} /></a> para obtener claves de Claude.
                          </p>
                          <p className="warn-text" style={{ fontSize: '0.72rem', display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                            <ShieldAlert size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
                            Requiere cargar créditos prepago en tu cuenta para habilitar el consumo de tokens.
                          </p>
                        </div>

                        <div className="provider-info-card">
                          <h5>
                            <span className="model-rate-provider provider-google">Google Gemini</span>
                          </h5>
                          <p style={{ marginBottom: '6px' }}>
                            Accede a <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer">aistudio.google.com <ExternalLink size={10} style={{ display: 'inline' }} /></a> para obtener una API Key.
                          </p>
                          <p style={{ fontSize: '0.72rem', color: 'var(--success)' }}>
                            Google ofrece un plan gratuito con límites de uso estándar ideales para pruebas de desarrollo.
                          </p>
                        </div>

                        <div className="provider-info-card">
                          <h5>
                            <span className="model-rate-provider provider-groq">Groq (Llama 3)</span>
                          </h5>
                          <p style={{ marginBottom: '6px' }}>
                            Accede a <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer">console.groq.com <ExternalLink size={10} style={{ display: 'inline' }} /></a> para generar tu clave.
                          </p>
                          <p style={{ fontSize: '0.72rem', color: 'var(--success)' }}>
                            Groq ofrece APIs de Llama 3 sumamente veloces y gratuitas con límites por minuto generosos.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* PASO 2 */}
                  <div className="help-step-item">
                    <div className="help-step-number">2</div>
                    <div className="help-step-body">
                      <h4 className="help-step-title">Registrar la Conexión de IA</h4>
                      <p className="help-step-text">
                        Ve a la pestaña <strong>Conexiones IA</strong> en el panel lateral, haz clic en "Agregar Conexión", selecciona tu proveedor, escribe un alias representativo y pega tu clave API. Guarda los cambios.
                      </p>
                    </div>
                  </div>

                  {/* PASO 3 */}
                  <div className="help-step-item">
                    <div className="help-step-number">3</div>
                    <div className="help-step-body">
                      <h4 className="help-step-title">Crear un Estilo de IA (Personalidad)</h4>
                      <p className="help-step-text">
                        Ve a la pestaña <strong>Estilos IA</strong>. Un estilo define el comportamiento del bot. Configura el prompt de sistema (ej: "Eres un vendedor amable de café..."), ajusta la temperatura y selecciona las reglas de comportamiento preestablecidas.
                      </p>
                    </div>
                  </div>

                  {/* PASO 4 */}
                  <div className="help-step-item">
                    <div className="help-step-number">4</div>
                    <div className="help-step-body">
                      <h4 className="help-step-title">Vincular tu Número y Completar Onboarding</h4>
                      <p className="help-step-text">
                        En la sección <strong>Números</strong>, pulsa en "Configurar" sobre tu número conectado a WhatsApp. El asistente te guiará para asociarle un estilo único de IA, activar el bot y configurar las palabras clave o disparadores que encenderán tu asistente.
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>

          {/* SECCIÓN 2: HANDOFF Y REANUDACIÓN AUTOMÁTICA */}
          <div className={`help-accordion-item ${openSection === 'handoff-guide' ? 'open' : ''}`}>
            <button className="help-accordion-header" onClick={() => toggleSection('handoff-guide')}>
              <span className="help-accordion-title">
                <MessageSquare size={18} className="help-accordion-icon" />
                Guía de Handoff: Control Manual vs Respuestas de Bot
              </span>
              <ChevronDown size={18} className="help-accordion-chevron" />
            </button>
            
            {openSection === 'handoff-guide' && (
              <div className="help-accordion-content">
                <div className="help-steps">
                  <div className="help-step-item">
                    <div className="help-step-number">A</div>
                    <div className="help-step-body">
                      <h4 className="help-step-title">¿Qué es el Handoff?</h4>
                      <p className="help-step-text">
                        El handoff es la transferencia del control de un chat desde la IA hacia un operador humano. Cuando el bot detecta que el cliente necesita soporte humano o cuando tú respondes manualmente, la IA se detiene para no interferir en la conversación.
                      </p>
                    </div>
                  </div>

                  <div className="help-step-item">
                    <div className="help-step-number">B</div>
                    <div className="help-step-body">
                      <h4 className="help-step-title">Pausar el Bot Automáticamente</h4>
                      <p className="help-step-text">
                        Si respondes manualmente a un cliente desde el panel de <strong>Chats</strong> o directamente desde tu aplicación de WhatsApp móvil/web vinculada, el sistema detecta que has tomado el control y cambia automáticamente la conversación a <strong>Modo Humano</strong> (pausando la IA).
                      </p>
                    </div>
                  </div>

                  <div className="help-step-item">
                    <div className="help-step-number">C</div>
                    <div className="help-step-body">
                      <h4 className="help-step-title">Reanudación Automática de la IA</h4>
                      <p className="help-step-text">
                        En la configuración de Onboarding de tu número, puedes activar la opción <strong>"Continuar IA tras mensaje manual"</strong>.
                      </p>
                      <ul style={{ fontSize: '0.82rem', color: 'var(--text-2)', paddingLeft: '20px', marginTop: '6px', listStyleType: 'disc' }}>
                        <li><strong>Activada:</strong> Tras enviar una respuesta manual, la conversación permanece en Modo Bot y la IA responderá el siguiente mensaje entrante del cliente.</li>
                        <li><strong>Desactivada (Recomendado):</strong> La conversación se bloquea en Modo Humano. Tendrás que pulsar el botón "Reactivar Bot" manualmente desde el módulo de Chats cuando desees que la IA retome el control.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECCIÓN 3: PREGUNTAS FRECUENTES (FAQ) */}
          <div className={`help-accordion-item ${openSection === 'faq' ? 'open' : ''}`}>
            <button className="help-accordion-header" onClick={() => toggleSection('faq')}>
              <span className="help-accordion-title">
                <HelpCircle size={18} className="help-accordion-icon" />
                Preguntas Frecuentes (FAQ)
              </span>
              <ChevronDown size={18} className="help-accordion-chevron" />
            </button>
            
            {openSection === 'faq' && (
              <div className="help-accordion-content">
                <div className="help-faq">
                  <div className="faq-item">
                    <h4>¿Por qué la IA no responde a las consultas?</h4>
                    <p>
                      Comprueba los siguientes puntos en orden:
                    </p>
                    <ol style={{ fontSize: '0.8rem', color: 'var(--text-2)', paddingLeft: '20px', marginTop: '4px', listStyleType: 'decimal' }}>
                      <li>Verifica que la clave API cargada en <strong>Conexiones IA</strong> sea correcta y tenga saldo prepago cargado en el proveedor (OpenAI/Anthropic).</li>
                      <li>Asegúrate de que el estado del Bot en el número correspondiente esté marcado como <strong>Activo</strong>.</li>
                      <li>Confirma que el número en la sección "Números" figure como <strong>CONNECTED</strong> (conectado). Si dice DISCONNECTED, vuelve a escanear el código QR.</li>
                      <li>Revisa si la conversación está bloqueada en <strong>Modo Humano</strong> (Handoff activo) en la sección de Chats. Si es así, reactiva el bot.</li>
                    </ol>
                  </div>

                  <div className="faq-item">
                    <h4>¿Cómo funciona el límite de contexto de 10 mensajes?</h4>
                    <p>
                      Para evitar consumos exagerados de saldo, ZonaWa carga únicamente los últimos 10 mensajes de la conversación actual al generar la respuesta de la IA. Esto mantiene el contexto conversacional reciente (los últimos 5 turnos de pregunta/respuesta) sin arrastrar todo el historial histórico del cliente.
                    </p>
                  </div>

                  <div className="faq-item">
                    <h4>¿El costo detallado en "Consumo" es el costo real?</h4>
                    <p>
                      Sí. El costo reportado en dólares es calculado por el backend a nivel de centavos, multiplicando los tokens reales consumidos (de entrada y salida) informados por OpenAI/Claude/Gemini por las tarifas oficiales vigentes de cada modelo de IA.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
