# CitaFácil — Documentación Técnica Completa

Sistema de gestión y reserva de citas médicas integrado con **DriCloud** para la clínica **Centro Creciendo Mirasierra**.

> **Última actualización:** 17 de junio de 2026
> **Estado:** En producción con datos reales de DriCloud (`isDemoMode: false`).

---

## Índice

1. [Resumen del Proyecto](#1-resumen-del-proyecto)
2. [Arquitectura General](#2-arquitectura-general)
3. [Estructura de Carpetas](#3-estructura-de-carpetas)
4. [Modelo de Datos](#4-modelo-de-datos)
5. [Capa de Almacenamiento](#5-capa-de-almacenamiento)
6. [Integración DriCloud](#6-integración-dricloud)
7. [Endpoints de DriCloud (API externa)](#7-endpoints-de-dricloud-api-externa)
8. [Endpoints Internos de la API](#8-endpoints-internos-de-la-api)
9. [Mapa de Especialidades y Categorización de Doctores](#9-mapa-de-especialidades-y-categorización-de-doctores)
10. [Frontend — Flujo de Usuario](#10-frontend--flujo-de-usuario)
11. [Componentes del Frontend](#11-componentes-del-frontend)
12. [Hooks de React Query](#12-hooks-de-react-query)
13. [Diseño (UI/UX)](#13-diseño-uiux)
14. [Configuración, Secretos y Desarrollo](#14-configuración-secretos-y-desarrollo)
15. [Modo Demostración (Fallback)](#15-modo-demostración-fallback)

---

## 1. Resumen del Proyecto

**CitaFácil** es un sistema integral de reserva de citas médicas que permite a los pacientes **reservar, modificar y cancelar** citas, sincronizando todos los datos en tiempo real con la plataforma externa **DriCloud** (sistema de gestión médica de la clínica).

**Características principales:**

- Reserva de citas seleccionando especialidad, doctor, fecha y franja horaria.
- Modificación y cancelación de citas existentes (búsqueda por paciente).
- Sincronización en tiempo real con DriCloud (8 doctores reales, especialidades derivadas).
- Modo demostración automático como fallback si DriCloud no responde.
- Diseño responsivo con tema turquesa, soporte de modo claro/oscuro.

**Clínica:** Centro Creciendo Mirasierra
**Doctores reales activos:** 8 (Pediatría, Ginecología, Otorrinolaringología, Dermatología, Matrona y Lactancia).

---

## 2. Arquitectura General

El sistema sigue una arquitectura **cliente-servidor full-stack en TypeScript**, con un frontend SPA en React y un backend ligero en Express que actúa como capa de integración y persistencia.

### Frontend (React + TypeScript)

| Aspecto | Tecnología |
|---------|-----------|
| Framework | React 18 con Vite |
| Routing | Wouter |
| Componentes UI | shadcn/ui (sobre Radix UI) |
| Estilos | Tailwind CSS (tema personalizado turquesa) |
| Estado de servidor | TanStack Query (React Query v5) |
| Formularios | React Hook Form + Zod |
| Iconos | lucide-react |

### Backend (Express + TypeScript)

| Aspecto | Tecnología |
|---------|-----------|
| Framework | Express.js |
| Almacenamiento | En memoria (`MemStorage`) |
| Integración externa | DriCloud (autenticación MD5, mutex de login, caché de token) |
| Sistema externo | Webhook opcional de citas (configurable) |

### Principios de diseño de la arquitectura

- **Lógica en el frontend**: la mayor parte de la lógica de UI vive en el cliente; el backend se limita a persistir datos y orquestar las llamadas a DriCloud.
- **Capa de integración aislada**: todo lo relativo a DriCloud está encapsulado en `server/dricloud/`.
- **Tipos compartidos**: el modelo de datos vive en `shared/schema.ts` y es usado tanto por frontend como por backend.
- **Servidor único**: Express sirve la API y, en producción, el frontend compilado por Vite (mismo puerto, `http://localhost:5000`).

---

## 3. Estructura de Carpetas

```
.
├── client/                       # Frontend React
│   └── src/
│       ├── App.tsx               # Root: QueryClientProvider, rutas Wouter
│       ├── main.tsx              # Punto de entrada
│       ├── index.css             # Variables de tema (light/dark) + utilidades elevate
│       ├── pages/
│       │   ├── Home.tsx          # Página principal (dashboard de citas)
│       │   └── not-found.tsx     # 404
│       ├── components/
│       │   ├── AppointmentBooking.tsx       # Contenedor/máquina de estados
│       │   ├── AppointmentCalendar.tsx      # Calendario y selección de franja
│       │   ├── AppointmentConfirmation.tsx  # Pantalla de confirmación
│       │   ├── PatientForm.tsx              # Formulario del paciente
│       │   ├── ModifyAppointment.tsx        # Modificar cita
│       │   ├── CancelAppointment.tsx        # Cancelar cita
│       │   ├── DoctorCard.tsx               # Tarjeta de doctor
│       │   ├── TimeSlot.tsx                 # Franja horaria
│       │   ├── DemoModeBanner.tsx           # Banner de estado de conexión
│       │   ├── examples/                    # Ejemplos de uso de componentes
│       │   └── ui/                          # Componentes shadcn/ui
│       ├── hooks/
│       │   ├── use-dricloud.ts   # Hooks React Query para DriCloud
│       │   ├── use-mobile.tsx    # Detección de viewport móvil
│       │   └── use-toast.ts      # Hook de notificaciones
│       └── lib/
│           ├── queryClient.ts    # Configuración de React Query + apiRequest
│           └── utils.ts          # Utilidades (cn, etc.)
│
├── server/                       # Backend Express
│   ├── index.ts                  # Bootstrap del servidor
│   ├── routes.ts                 # Registro de rutas base
│   ├── storage.ts                # MemStorage (IStorage) + webhook externo
│   ├── vite.ts                   # Integración Vite (NO MODIFICAR)
│   ├── config/
│   │   └── external-system.config.js
│   ├── dricloud/
│   │   ├── auth.ts               # Autenticación MD5, mutex, token, errores
│   │   ├── services.ts           # Servicios de la API DriCloud
│   │   ├── mapper.ts             # Mapeo y formateo de datos
│   │   └── mock-data.ts          # Datos de demostración (fallback)
│   └── routes/
│       └── dricloud.routes.ts    # Rutas /api/dricloud/*
│
├── shared/
│   └── schema.ts                 # Modelo de datos + tipos (Drizzle + Zod)
│
├── design_guidelines.md          # Guía de diseño
├── replit.md                     # README del proyecto
└── DOCUMENTACION.md              # Este documento
```

---

## 4. Modelo de Datos

Definido en `shared/schema.ts` mediante Drizzle ORM (`pgTable`) y validación con `drizzle-zod`. Aunque el almacenamiento en runtime es en memoria, el esquema define los tipos compartidos entre frontend y backend.

### Tabla `users`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | varchar (PK) | UUID autogenerado |
| `username` | text | Único, obligatorio |
| `password` | text | Obligatorio |

### Tabla `doctors`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | varchar (PK) | UUID autogenerado |
| `name` | text | Obligatorio |
| `specialty` | text | `'pediatric'` \| `'adult'` \| `'family'` |
| `photoUrl` | text | Opcional |
| `email` | text | Obligatorio |
| `phone` | text | Opcional |

### Tabla `appointments`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | varchar (PK) | UUID autogenerado |
| `doctorId` | varchar | Referencia al doctor |
| `patientName` | text | Obligatorio |
| `patientEmail` | text | Obligatorio |
| `patientPhone` | text | Obligatorio |
| `patientAge` | integer | Obligatorio |
| `appointmentDate` | timestamp | Obligatorio |
| `duration` | integer | Por defecto `30` (minutos) |
| `notes` | text | Opcional |
| `status` | text | `'scheduled'` \| `'completed'` \| `'cancelled'` (por defecto `scheduled`) |

### Schemas y Tipos

- **Insert schemas** (con `createInsertSchema` + `.omit`/`.pick`):
  - `insertUserSchema`, `insertDoctorSchema`, `insertAppointmentSchema`
- **Tipos inferidos**:
  - `InsertUser`, `User`
  - `InsertDoctor`, `Doctor`
  - `InsertAppointment`, `Appointment`
  - `AppointmentWithDoctor` = `Appointment & { doctor: Doctor }`

---

## 5. Capa de Almacenamiento

Definida en `server/storage.ts`. Implementa la interfaz `IStorage` mediante la clase `MemStorage` (almacenamiento en memoria con `Map`).

### Interfaz `IStorage`

```ts
// Usuarios
getUser(id): Promise<User | undefined>
getUserByUsername(username): Promise<User | undefined>
createUser(user): Promise<User>

// Doctores
getDoctors(): Promise<Doctor[]>
getDoctor(id): Promise<Doctor | undefined>
createDoctor(doctor): Promise<Doctor>

// Citas
getAppointments(): Promise<AppointmentWithDoctor[]>
getAppointmentsByDate(date): Promise<AppointmentWithDoctor[]>
getAppointmentsByDoctor(doctorId): Promise<AppointmentWithDoctor[]>
createAppointment(appointment): Promise<Appointment>
cancelAppointment(id): Promise<boolean>
```

### Características

- **Inicialización**: `MemStorage` arranca con un conjunto de doctores de ejemplo (datos locales). Los datos reales se sirven directamente desde DriCloud a través de `dricloud.routes.ts`.
- **Cancelación**: `cancelAppointment` cambia el `status` a `'cancelled'` (no elimina el registro).
- **Webhook a sistema externo**: al crear una cita, `MemStorage` puede enviarla de forma asíncrona (`setImmediate`, sin bloquear) a un sistema externo configurable mediante la variable `EXTERNAL_BOOKING_WEBHOOK`. Si la llamada falla, se registra el error pero **no** afecta a la creación local de la cita.

---

## 6. Integración DriCloud

Toda la lógica está encapsulada en `server/dricloud/`. Esta es la parte más crítica y delicada del sistema.

### Archivos clave

| Archivo | Responsabilidad |
|---------|----------------|
| `auth.ts` | Autenticación MD5, mutex de login, gestión/caché de token, `DriCloudSubscriptionError` |
| `services.ts` | Funciones que llaman a los endpoints de DriCloud |
| `mapper.ts` | Mapeo de datos entre sistemas, formato de fechas, parseo de disponibilidad |
| `mock-data.ts` | Datos de demostración (fallback) |

### Autenticación

DriCloud usa autenticación basada en un token derivado de un hash MD5:

```
token_hash = MD5(userName + MD5(password) + timeSpanString + salt)  → en MAYÚSCULAS
```

**Detalles críticos:**

- **MD5 en MAYÚSCULAS**:
  `crypto.createHash('md5').update(input, 'utf8').digest('hex').toUpperCase()`
- **`timeSpanString`** generado en zona horaria **`Europe/Madrid`** (DriCloud valida contra el reloj español):
  `Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', ... }).formatToParts()`
- **`userName`** = `WebAPI`.
- **`idClinica`** = `20627` (5 dígitos) en el cuerpo del login — **NO** el número completo de 8 dígitos.
- **URL de clínica** = `Dricloud_creciendomirasierra_20627620` (con la capitalización exacta, D mayúscula).
- El login devuelve el token en `body.Data.USU_APITOKEN`.
- Las llamadas posteriores envían el token en la cabecera `USU_APITOKEN`.

### Mutex de login y caché de token

- **Mutex de login**: evita que llamadas paralelas generen tokens distintos que se invaliden mutuamente. Si ya hay un login en curso, las demás peticiones esperan a que termine.
- **Caché de token**: el token se cachea **23 horas** para minimizar reautenticaciones.

### Formato de respuestas

Todas las respuestas de DriCloud vienen envueltas:

```json
{
  "Successful": true,
  "Html": "...",
  "Data": { ... },
  "ErrorMessage": "..."
}
```

- `GetDoctores` devuelve `Data.Doctores[]` (no `Data[]` directamente).
- `GetEspecialidades` devuelve `Data.Especialidades[]` — **vacío** para esta clínica, por lo que las especialidades se **derivan** del campo `CITA_ONLINE_MAS_INFO` de los doctores.

### Manejo de errores de suscripción

Si la suscripción de DriCloud no está activa, se lanza un `DriCloudSubscriptionError`, que el sistema detecta (helper `isSubscriptionErr`) y activa el **modo demostración** automáticamente.

---

## 7. Endpoints de DriCloud (API externa)

URL base de la clínica:

```
https://apidricloud.dricloud.net/Dricloud_creciendomirasierra_20627620/api/APIWeb/<Endpoint>
```

| Operación | Endpoint DriCloud | Función interna (`services.ts`) |
|-----------|-------------------|---------------------------------|
| Listar doctores | `GetDoctores` | `getDoctores()` |
| Listar especialidades | `GetEspecialidades` | `getEspecialidades()` |
| Disponibilidad de agenda | (agenda/disponibilidad) | `getAgendaDisponibilidad()` |
| Buscar pacientes por teléfono | (pacientes) | `getPacientesPorTelefono()` |
| Buscar paciente por nombre+teléfono | (pacientes) | `getPacientePorNombreTelefono()` |
| Buscar paciente por NIF | (pacientes) | `getPacienteByNIF()` |
| Crear paciente | `PostCreatePaciente` | `createPaciente()` |
| **Crear cita** | `PostCitaPaciente` | `createCita()` |
| Modificar cita | `PostUpdateCitaPaciente` | `updateCita()` |
| Cancelar/eliminar cita | `PostDeleteCitaPaciente` | `deleteCita()` |
| Recuperar citas por NIF | `GetPacienteCitasByNIF` | `getCitasByNIF()` |
| Recuperar citas (rango) | `GetCitasPacientes` | `getCitasPacientes()` |
| Listar despachos | (despachos) | `getDespachos()` |

### Variables para crear una cita (`PostCitaPaciente`)

| Variable DriCloud | Origen | Obligatorio |
|-------------------|--------|-------------|
| `USU_ID` | ID del doctor | ✅ |
| `fechaInicioCitaString` | Fecha/hora en formato `yyyyMMddHHmm` | ✅ |
| `PAC_ID` | ID del paciente (encontrado o creado automáticamente) | ✅ |
| `CLI_ID` | `DRICLOUD_CONFIG.clinicaId` (20627) | ✅ |
| `TCI_ID` | Tipo de cita | ⬜ |
| `DES_ID` | Despacho/sala | ⬜ |
| `observaciones` | Notas | ⬜ |

> El `PAC_ID` no lo envía el frontend: el backend busca al paciente por nombre + teléfono y, si no existe, lo crea con `PostCreatePaciente` antes de crear la cita.

---

## 8. Endpoints Internos de la API

Definidos en `server/routes/dricloud.routes.ts`. Todas las rutas bajo `/api/dricloud` aplican cabeceras anti-caché (`no-store`).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/dricloud/status` | Estado de conexión (`isDemoMode`, mensaje) |
| GET | `/api/dricloud/diagnostico` | Diagnóstico de conexión (doctores/especialidades obtenidos, endpoint usado) |
| POST | `/api/dricloud/refresh` | Fuerza reconexión limpiando la caché de token |
| GET | `/api/dricloud/specialties` | Lista de especialidades |
| GET | `/api/dricloud/doctors?especialidadId=X` | Lista de doctores (filtrable por especialidad) |
| GET | `/api/dricloud/availability?doctorId=X&fecha=yyyyMMdd` | Disponibilidad de un doctor |
| POST | `/api/dricloud/appointments` | Crear cita |
| PUT | `/api/dricloud/appointments/:id` | Modificar cita |
| POST | `/api/dricloud/appointments/:id/cancel` | Cancelar cita |
| GET | `/api/dricloud/appointments?nif=X&fechaInicio=yyyyMMdd&fechaFin=yyyyMMdd` | Citas de un paciente |
| GET | `/api/dricloud/patients?telefono=X` | Buscar pacientes por teléfono |

### Cuerpo de `POST /api/dricloud/appointments`

| Campo | Obligatorio | Descripción |
|-------|-------------|-------------|
| `doctorId` | ✅ | ID del doctor (USU_ID) |
| `patientName` | ✅ | Nombre completo (se divide en nombre + apellidos) |
| `patientPhone` | ✅ | Teléfono del paciente |
| `appointmentDate` | ✅ | Fecha y hora de la cita |
| `patientEmail` | ⬜ | Email |
| `patientAge` | ⬜ | Edad (por defecto 30) |
| `specialtyName` | ⬜ | Nombre de la especialidad (usado en modo demo) |
| `notes` | ⬜ | Observaciones |
| `tciId` | ⬜ | Tipo de cita |
| `desId` | ⬜ | Despacho/sala |

Si faltan los 4 campos obligatorios, devuelve **`400`**. Si la suscripción de DriCloud no está activa, la cita se crea en **modo demostración** (`isDemoMode: true`).

---

## 9. Mapa de Especialidades y Categorización de Doctores

### Mapa ESP_ID → Nombre

Derivado del campo `CITA_ONLINE_MAS_INFO` de los doctores reales (`ESP_ID_NAMES` en `dricloud.routes.ts`):

| ESP_ID | Especialidad |
|--------|--------------|
| 5 | Pediatría |
| 4 | Ginecología |
| 19, 41 | Otorrinolaringología |
| 11 | Dermatología |
| 30, 45, 23 | Matrona y Lactancia |
| 8, 44, 53 | Medicina General |

### Categorización de doctores

La función `categorizeDoctor(especialidadIds, infoHtml)` clasifica a cada doctor en `'pediatric'`, `'adult'` o `'family'` combinando los nombres de especialidad y el texto del HTML descriptivo (`stripHtml`):

1. Si el texto contiene **"adultos y niños"** → `adult` (los ORL que atienden ambos públicos).
2. Si contiene `pediatr`, `neonat`, `matrona` o `lactancia` → `pediatric`.
3. Si contiene `famil` o `medicina general` → `family`.
4. En cualquier otro caso → `adult`.

### Doctores reales (Centro Creciendo Mirasierra)

| Doctor/a | Especialidad | Categoría |
|----------|--------------|-----------|
| Dra. Gema Tesorero Carcedo | Pediatría | pediatric |
| Dra. María Cormenzana Carpio | Pediatría | pediatric |
| Dr. Javier Hernández Calvín | Otorrinolaringología | adult |
| Dr. Marcial Sánchez Potenciano | Otorrinolaringología | adult |
| Dr. Fernando Mera | Otorrinolaringología | adult |
| Dra. Miriam de la Puente Yagüe | Ginecología | adult |
| María Loreto Carrasco Santos | Dermatología | adult |
| Mónica González Rincón | Matrona y Lactancia | pediatric |

---

## 10. Frontend — Flujo de Usuario

La página principal (`Home.tsx`) muestra un panel con tres acciones principales, orquestadas por `AppointmentBooking`, que actúa como máquina de estados.

### Flujo de Reserva (Booking)

1. **Selección (`calendar`)** — El usuario ve `AppointmentCalendar`, filtra por especialidad (Pediatría, Adultos, Familia) o por doctor concreto, navega por la semana, selecciona un día y hace clic en una franja (`TimeSlot`).
2. **Información (`form`)** — Se muestra `PatientForm`: nombre, edad, email, teléfono y notas opcionales.
3. **Proceso** — Al pulsar "Confirmar Cita" se ejecuta la mutación hacia el backend.
4. **Confirmación (`confirmation`)** — Si tiene éxito, se renderiza `AppointmentConfirmation` con el ID de la cita, los datos del doctor y el resumen del paciente.

### Flujo de Modificación (Modify)

1. El usuario pulsa "Modifica Cita".
2. `ModifyAppointment` muestra un campo de búsqueda.
3. El usuario introduce su email para localizar sus citas programadas.
4. Desde la lista puede "Modificar" (actualmente sugiere cancelar y volver a reservar) o "Cancelar".

### Flujo de Cancelación (Cancel)

1. El usuario pulsa "Cancela Cita".
2. `CancelAppointment` muestra un campo de búsqueda.
3. El usuario introduce su email para recuperar sus citas.
4. Aparece la lista de citas programadas. Al pulsar "Cancelar Cita" se abre un `AlertDialog` de confirmación.
5. Al confirmar, se ejecuta `cancelMutation` y el estado de la cita se actualiza.

---

## 11. Componentes del Frontend

| Componente | Propósito | Props principales | Renderiza |
|------------|-----------|-------------------|-----------|
| `AppointmentBooking` | Contenedor y gestor de estados para reservar/modificar/cancelar | `doctors: Doctor[]` | Cabecera de navegación, `DemoModeBanner` y la vista/paso actual |
| `AppointmentCalendar` | Selección de fecha y franja horaria | `doctors`, `onSlotSelect`, `selectedDate` | Filtros de especialidad/doctor, navegación semanal, botones de día y lista de `TimeSlot` |
| `PatientForm` | Captura de datos del paciente (validado con Zod) | `doctor`, `appointmentTime`, `onSubmit`, `onCancel` | Campos (Nombre, Edad, Email, Teléfono, Notas) y resumen de la cita |
| `AppointmentConfirmation` | Estado de éxito tras reservar | `doctor`, `patientData`, `appointmentTime`, `appointmentId` | Icono de éxito, badge de ID, tarjeta del doctor, resumen del paciente y acciones (Descargar/Compartir/Nueva) |
| `CancelAppointment` | Búsqueda y cancelación de citas | `onBack` | Input de email, lista de citas con botón "Cancelar" y diálogo de confirmación |
| `ModifyAppointment` | Búsqueda e interfaz de modificación | `onBack` | Input de email, lista de citas con botones "Modificar" y "Cancelar" |
| `DoctorCard` | Resumen del perfil de un doctor | `doctor`, `isSelected`, `onSelect` | Avatar, nombre y badge de especialidad |
| `TimeSlot` | Botón clicable de una franja horaria | `time`, `doctor`, `isAvailable`, `isSelected` | Hora, doctor/especialidad y badge de duración (ej. "30 min") |
| `DemoModeBanner` | Estado de conexión del sistema | — | Banner que indica si está en "Modo Demo" o conectado a DriCloud |

> La carpeta `client/src/components/examples/` contiene ejemplos de uso aislado de los componentes principales.

---

## 12. Hooks de React Query

Definidos en `client/src/hooks/use-dricloud.ts`. Gestionan toda la comunicación con la capa de integración DriCloud.

| Hook | Tipo | Query Key / Invalida | Descripción |
|------|------|----------------------|-------------|
| `useDriCloudDoctors` | Query | `['/api/dricloud/doctors']` | Lista de doctores. `staleTime: 0` (siempre fresco) |
| `useDriCloudStatus` | Query | `['/api/dricloud/status']` | Estado demo/producción. Refetch cada 60 s |
| `useDriCloudAvailability` | Query | `['/api/dricloud/availability', doctorId, fecha]` | Franjas disponibles de un doctor en una fecha |
| `useRefreshDriCloud` | Mutation | Invalida `['/api/dricloud']` | Fuerza reconexión/refresco de la integración |
| `useCreateDriCloudAppointment` | Mutation | Invalida `['/api/dricloud/availability']` | Envía los datos de reserva a DriCloud |
| `useCancelDriCloudAppointment` | Mutation | Invalida `['/api/dricloud/availability']` | Cancela una cita existente |

> Las queries usan el fetcher por defecto de `queryClient`; las mutaciones usan `apiRequest` desde `@/lib/queryClient`.

---

## 13. Diseño (UI/UX)

### Enfoque

Diseño **basado en referencias**, inspirado en plataformas sanitarias modernas (Zocdoc, Calendly) combinadas con estéticas de interfaces médicas limpias. Prioriza la **usabilidad** y la **generación de confianza** en un contexto médico.

### Paleta de Colores

Las variables de tema viven en `client/src/index.css` (formato HSL `H S% L%`, sin envolver en `hsl()`).

**Modo claro (`:root`):**

| Token | Valor (HSL) | Uso |
|-------|-------------|-----|
| `--primary` | `185 85% 35%` | Turquesa principal (acciones, marca) |
| `--accent` | `150 60% 55%` | Verde (bienestar, secundario) |
| `--background` | `0 0% 98%` | Fondo |
| `--foreground` | `220 15% 25%` | Texto principal |
| `--card` | `0 0% 100%` | Superficie de tarjetas |
| `--muted-foreground` | `220 10% 50%` | Texto secundario |
| `--destructive` | `0 84% 60%` | Acciones destructivas |
| `--pediatric` | `280 70% 70%` | Acento pediátrico (morado suave) |
| `--adult` | `210 50% 60%` | Acento adulto (azul) |
| `--warning` | `25 90% 60%` | Franjas urgentes |
| `--success` | `140 60% 50%` | Estados de confirmación |

**Modo oscuro (`.dark`):** mismas tonalidades de marca (`--primary` se mantiene en `185 85% 35%`), con fondos oscuros (`--background: 220 15% 8%`, `--card: 220 12% 12%`) y texto claro (`--foreground: 220 5% 90%`). Los colores médicos (pediátrico, adulto, warning, success) se mantienen consistentes.

**Charts:** 5 colores definidos (`--chart-1` … `--chart-5`) tanto en claro como en oscuro.

### Tipografía

| Rol | Fuente |
|-----|--------|
| Sans (principal) | **Inter** |
| Serif | Georgia |
| Mono | Menlo |

- **Encabezados**: peso 600–700, tamaños de `text-lg` a `text-3xl`.
- **Cuerpo**: peso 400–500, de `text-sm` a `text-base`.
- **Elementos de UI**: peso 500 para botones y etiquetas.

### Layout y Espaciado

- **Unidades de espaciado**: Tailwind 2, 4, 6, 8 y 12 (ajustado, medio y grande).
- **Radio de borde**: `--radius: 0.5rem` (8px), `rounded-md` por defecto.
- **Sombras**: escala de `shadow-2xs` a `shadow-2xl`, suaves, usadas con moderación.

### Sistema de Interacciones (Elevate)

`index.css` define utilidades propias para hover/active que respetan el modo claro/oscuro automáticamente:

- `hover-elevate`, `active-elevate-2` — elevación sutil al pasar el cursor / pulsar.
- `toggle-elevate` + `toggle-elevated` — estado activado para toggles.
- `--elevate-1` / `--elevate-2` — intensidades de superposición.
- No funcionan con `overflow-hidden`/`overflow-scroll`.

### Componentes (guía de diseño)

- **Calendario**: rejilla semana/mes con franjas grandes y clicables; estados de disponibilidad (disponible, parcialmente reservado, no disponible).
- **Tarjetas de doctor**: avatar, nombre, badge de especialidad.
- **Formularios**: esquinas redondeadas suaves, padding generoso, validación en tiempo real.
- **Botones**: primario (relleno), secundario (outline con blur sobre imágenes), ghost para acciones sutiles.
- **Confirmación**: tarjetas-resumen con todos los detalles de la reserva.

### Responsive y Accesibilidad

- **Mobile-first**: el calendario pasa a vista de lista con scroll vertical en móvil.
- **Touch-friendly**: objetivos táctiles mínimos de 44px.
- **Desktop**: vistas de doctor y calendario en paralelo en pantallas grandes.
- **Contraste alto**: cumplimiento WCAG AA en texto y elementos interactivos.
- **Prevención de errores**: actualización de disponibilidad en tiempo real y mensajes de validación claros.

---

## 14. Configuración, Secretos y Desarrollo

### Secretos (Replit Secrets)

Se almacenan de forma cifrada en el gestor de secretos de Replit (**nunca** en el código). El código accede a ellos vía `process.env.*`.

| Secreto | Descripción |
|---------|-------------|
| `DRICLOUD_URL_CLINICA` | Segmento URL completo: `Dricloud_creciendomirasierra_20627620` |
| `DRICLOUD_CLINICA_ID` | `idClinica` del body del login (5 dígitos): `20627` |
| `DRICLOUD_API_PASSWORD` | Contraseña del usuario WebAPI |
| `SESSION_SECRET` | Secreto de sesión de Express |

Variables opcionales para el webhook de sistema externo:

| Variable | Descripción |
|----------|-------------|
| `EXTERNAL_BOOKING_WEBHOOK` | URL del sistema externo al que se envían las citas creadas |
| `EXTERNAL_SYSTEM_TOKEN` | Token de autenticación (opcional, comentado por defecto) |

### Comandos de Desarrollo

```bash
npm run dev   # Inicia Express + Vite en http://localhost:5000
```

El workflow **"Start application"** ejecuta `npm run dev` automáticamente y se reinicia tras cada edición.

---

## 15. Modo Demostración (Fallback)

Si DriCloud no responde o la suscripción no está activa, el sistema activa automáticamente el **modo demostración**:

- Los datos provienen de `server/dricloud/mock-data.ts` (`mockEspecialidades`, `mockDoctores`, `generateMockAvailability`, `createMockAppointment`, `createMockPatient`).
- El endpoint `/api/dricloud/status` devuelve `isDemoMode: true`.
- El componente `DemoModeBanner` muestra un banner informativo en la interfaz.
- Se ofrece un botón de reconexión (`POST /api/dricloud/refresh`) que limpia la caché de token e intenta reconectar con DriCloud.

En condiciones normales de producción, el sistema opera con **`isDemoMode: false`** y datos reales.

---

*Documento generado para el proyecto CitaFácil — Centro Creciendo Mirasierra.*
