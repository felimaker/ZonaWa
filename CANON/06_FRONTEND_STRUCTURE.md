# ZonaWa - 06_FRONTEND_STRUCTURE.md

## 1. Estructura Completa de Directorios (React + Vite)

El frontend se organiza siguiendo una estructura modular basada en **features (características)** para mantener el código escalable y fácil de navegar.

```
/src
├── /components              # Componentes comunes e interactivos reutilizables
│   ├── Layout.jsx           # Layout general con barra de navegación lateral (Sidebar)
│   ├── MetricCard.jsx       # Tarjeta para métricas numéricas con micro-animaciones
│   ├── Modal.jsx            # Modal genérico animado
│   └── PrivateRoute.jsx     # Componente protector de rutas privadas
├── /contexts                # Contextos de estado global
│   └── AuthContext.jsx      # Autenticación global y sesión de Supabase
├── /features                # Módulos específicos de la aplicación
│   ├── /auth                # Registro, Login y Recuperación de Contraseña
│   │   ├── AuthForm.jsx
│   │   └── ResetPassword.jsx
│   ├── /dashboard           # Dashboard principal y analíticas
│   │   ├── DashboardStats.jsx
│   │   ├── UsageChart.jsx
│   │   └── RecentActivity.jsx
│   ├── /numbers             # Gestión de instancias de WhatsApp
│   │   ├── NumberGrid.jsx
│   │   ├── NumberCard.jsx
│   │   └── QRModal.jsx
│   ├── /connections         # Panel de credenciales de IA
│   │   ├── ConnectionForm.jsx
│   │   └── ConnectionList.jsx
│   ├── /settings            # Configuración de agentes y prompts
│   │   └── AgentConfigForm.jsx
│   └── /profile             # Perfil personal y configuración de cuenta
│       └── ProfileForm.jsx
├── /lib                     # Clientes de servicios externos y utilidades
│   ├── supabase.js          # Configuración e inicialización del cliente de Supabase
│   └── evolution.js         # Funciones HTTP para comunicarse con Evolution API
├── /styles                  # Estilos globales y temas
│   └── index.css            # Estilo premium en modo oscuro con variables CSS
├── App.jsx                  # Enrutador y rutas protegidas (React Router v6)
└── main.jsx                 # Punto de entrada de React
```

---

## 2. Sistema de Diseño Premium (index.css)

Para lograr una interfaz sofisticada, se utiliza un tema puramente oscuro basado en una paleta de color pizarra con acentos de color índigo y esmeralda, empleando efectos de vidrio (glassmorphism) y bordes translúcidos.

```css
/* Custom CSS Variables */
:root {
  --bg-main: #0b0f19;         /* Pizarra muy oscuro */
  --bg-card: rgba(17, 24, 39, 0.7); /* Gris oscuro con transparencia */
  --border-glass: rgba(255, 255, 255, 0.08);
  --text-primary: #f3f4f6;
  --text-secondary: #9ca3af;
  --color-primary: #6366f1;   /* Índigo */
  --color-success: #10b981;   /* Esmeralda */
  --color-warning: #f59e0b;   /* Ámbar */
  --color-danger: #ef4444;    /* Rojo */
  --transition-smooth: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

body {
  background-color: var(--bg-main);
  color: var(--text-primary);
  font-family: 'Inter', system-ui, sans-serif;
  margin: 0;
}

/* Efecto Glassmorphic para Tarjetas */
.glass-card {
  background: var(--bg-card);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-glass);
  border-radius: 16px;
  padding: 24px;
  transition: var(--transition-smooth);
}

.glass-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
  border-color: rgba(99, 102, 241, 0.2);
}

/* Animaciones e interacciones */
.btn-primary {
  background-color: var(--color-primary);
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  transition: var(--transition-smooth);
}

.btn-primary:hover {
  opacity: 0.9;
  box-shadow: 0 0 15px rgba(99, 102, 241, 0.4);
}
```

---

## 3. Comportamiento y Flujo de los Componentes Clave

### A. AuthContext.jsx
Mapea la sesión activa de Supabase:
* Provee la función `signUp`, `signIn` y `signOut`.
* Suscribe un listener a `supabase.auth.onAuthStateChange` para reaccionar inmediatamente a los cambios de token o sesiones expiradas.

### B. NumberCard.jsx (Administrador de Números)
* **Switch del Bot:** Al presionar el interruptor, realiza una mutación directa en la tabla `whatsapp_numbers` actualizando `bot_enabled`. Si el trigger de la base de datos falla (por exceder 5 bots), la UI revierte el switch y despliega la alerta del trigger de PostgreSQL.
* **Sincronización de Estado en Tiempo Real (Supabase Realtime):**
  Para evitar polling innecesario de red en la UI, el componente se suscribe a los cambios de la tabla `whatsapp_numbers` usando el SDK de Supabase:
  ```javascript
  const channel = supabase
    .channel('whatsapp-status-changes')
    .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'whatsapp_numbers',
      filter: `user_id=eq.${user.id}`
    }, (payload) => {
      // Actualiza el estado visual del número, del QR o cierra el modal si cambia a CONNECTED
      updateNumberInState(payload.new);
    })
    .subscribe();
  ```
  Esto permite que cuando el webhook de Evolution API actualiza el estado de conexión del número en Supabase, la interfaz del usuario actualice el estado QR o de conexión de inmediato de forma reactiva.
* **Acceso QR:** Si el estado es `WAITING_QR`, renderiza un componente `QRCode` usando el string base64 obtenido. El código QR se actualiza reactivamente por base de datos (vía webhooks de Evolution API que reportan `qr.updated` a la base de datos, propagándose al cliente en tiempo real).

---

## 4. Mandato de Diseño Responsivo y Multipantalla

Para garantizar una experiencia de usuario excepcional y consistente tanto en dispositivos móviles como en pantallas de escritorio, la interfaz de ZonaWa debe cumplir de manera estricta con las siguientes directrices de diseño responsivo:

### A. Puntos de Interrupción (Breakpoints)
El diseño debe adaptarse de forma fluida basándose en las siguientes dimensiones:
- **Mobile (<640px):** Dispositivos móviles pequeños y grandes (vista vertical).
- **Tablet (640px - 1024px):** Dispositivos tipo tableta o pantallas de escritorio pequeñas.
- **Desktop (>1024px):** Pantallas de escritorio medianas y grandes.

### B. Distribución del Layout y Navegación
- **Mobile (<640px):**
  - La barra lateral de navegación (`.sidebar`) debe ocultarse por completo (`display: none;`).
  - Se debe mostrar una barra de navegación inferior fija (`.mobile-nav`) que flote o se fije al fondo de la pantalla. Debe contener los iconos principales y un texto identificador corto para un acceso rápido con una mano.
  - El contenido principal (`.main-content`) no tendrá margen izquierdo (`margin-left: 0;`) y debe incluir un relleno inferior (`padding-bottom: 72px;`) para evitar que el contenido sea tapado por la barra de navegación móvil.
  - Todas las cuadrículas de datos (como la lista de números de WhatsApp o las estadísticas del dashboard) deben colapsar a **1 sola columna**.
- **Tablet (640px - 1024px):**
  - La barra lateral se contrae de forma compacta (ancho fijo de `64px`), mostrando únicamente los iconos de las herramientas sin texto para maximizar el área útil de trabajo.
  - La alineación de los elementos de navegación en la barra lateral se centra y se eliminan las descripciones textuales.
- **Desktop (>1024px):**
  - La barra lateral se muestra expandida con su ancho estándar (`240px`), incluyendo iconos, nombres de las secciones, información del usuario autenticado y su plan.

### C. Elementos Táctiles y Flexibilidad
- **Áreas de Interacción:** Todos los botones, enlaces e interruptores en versión móvil deben tener un tamaño objetivo mínimo de **44px x 44px** para facilitar la pulsación táctil (evitando clics accidentales).
- **Diseño Elástico:** Se debe priorizar el uso de Flexbox y CSS Grid con unidades relativas (`em`, `rem`, `%`, `vh`, `vw`) en lugar de anchos fijos de píxeles, logrando que los componentes y tarjetas (`.glass-card`) se estiren de manera natural en cualquier ancho de pantalla.
- **Bandeja de Entrada Adaptable (Chats):** En móviles, la bandeja de chats ocupará el 100% de la pantalla y el visor del chat activo se abrirá en una vista superpuesta o apilada (utilizando navegación o estados condicionales en React) en lugar del diseño de dos columnas lado a lado típico de pantallas de escritorio.

