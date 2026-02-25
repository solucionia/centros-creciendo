# CitaFacil - Sistema de Gestión de Citas Médicas

## Resumen del Proyecto

CitaFacil es un sistema integral de reserva de citas médicas integrado con DriCloud (sistema de gestión médica externo). La aplicación permite a los pacientes reservar, modificar y cancelar citas médicas, sincronizando todos los datos en tiempo real con la plataforma DriCloud.

## Estado Actual del Sistema

### ✅ **Completado e Implementado:**

1. **Interfaz de Usuario:**
   - Sistema de 3 botones principales: Reserva Cita, Modifica Cita, Cancela Cita
   - Calendario interactivo para selección de citas
   - Formulario de datos del paciente
   - Sistema de confirmación de citas
   - Diseño responsivo con tema turquesa

2. **Integración DriCloud API v2 (reconstruida desde documentación oficial):**
   - Autenticación con MD5 hash: `MD5(userName + MD5(password) + timeSpan + salt)`
   - Estructura de respuesta correcta: `{ Successful, Data: { USU_APITOKEN, ... } }`
   - Gestión automática de tokens (cache de 23 horas)
   - `DriCloudSubscriptionError` tipado para distinguir errores de suscripción
   - Endpoints implementados según docs API v2:
     - `GetEspecialidades` → `/api/dricloud/specialties`
     - `GetDoctores` → `/api/dricloud/doctors`
     - `GetAgendaDisponibilidad` → `/api/dricloud/availability`
     - `PostCitaPaciente` → `POST /api/dricloud/appointments`
     - `PostUpdateCitaPaciente` → `PUT /api/dricloud/appointments/:id`
     - `PostDeleteCitaPaciente` → `POST /api/dricloud/appointments/:id/cancel`
     - `GetPacientePorNombreTelefono` / `PostCreatePaciente` → búsqueda/creación automática
     - `GetCitasByNIF` → `GET /api/dricloud/appointments?nif=X`
     - `GetPacientesPorTelefono` → `GET /api/dricloud/patients?telefono=X`

3. **Modo Demostración:**
   - Sistema de datos de demostración (mock data) funcional
   - Detección automática de `DriCloudSubscriptionError` en cualquier nivel (login/API)
   - Fallback transparente a datos demo cuando DriCloud no está disponible
   - Banner informativo visible para indicar modo demostración

### ⚠️ **Bloqueador Actual:**

**Suscripción DriCloud WebAPI No Activa**

**Error devuelto por DriCloud:** `"Error. Suscripción a WebAPI no activa."`

**Comportamiento actual:**
- ✅ Código de autenticación correcto (hash MD5, estructura `Data.USU_APITOKEN`)
- ✅ DriCloud rechaza el login devolviendo `Successful: false` (problema de cuenta)
- ✅ Sistema detecta el error y usa datos demo automáticamente
- ❌ Requiere activación de suscripción WebAPI en panel DriCloud

**Acción Requerida:**
1. Acceder al panel DriCloud como administrador de la clínica
2. Ir a: **Sistemas → Suscripción**
3. Activar la suscripción WebAPI
4. Una vez activada, el sistema automáticamente usará datos reales sin cambiar código

## Arquitectura del Sistema

### Frontend (React + TypeScript)
- **Framework**: React 18 con Vite
- **Routing**: Wouter
- **UI Components**: shadcn/ui (Radix UI)
- **Styling**: Tailwind CSS con tema personalizado turquesa
- **State Management**: TanStack Query
- **Forms**: React Hook Form + Zod validation

### Backend (Express + TypeScript)
- **Framework**: Express.js
- **Storage**: In-memory storage (MemStorage)
- **DriCloud Integration**: Autenticación MD5, cache de tokens, mapeo de datos, fallback a mock data

### Integración DriCloud

**Archivos Clave:**
- `server/dricloud/auth.ts` — Autenticación, gestión de tokens, `DriCloudSubscriptionError`
- `server/dricloud/services.ts` — Todos los servicios de API DriCloud
- `server/dricloud/mapper.ts` — Mapeo de datos entre sistemas
- `server/dricloud/mock-data.ts` — Datos de demostración
- `server/routes/dricloud.routes.ts` — Rutas de API con fallback automático
- `client/src/hooks/use-dricloud.ts` — Hooks de React para DriCloud

### Credenciales Configuradas (Secrets)
- `DRICLOUD_URL_CLINICA` = `dricloud_creciendomirasierra`
- `DRICLOUD_CLINICA_ID` = `20627620`
- `DRICLOUD_API_PASSWORD` — contraseña de API configurada
- `SESSION_SECRET` — secreto de sesión Express

## Endpoints API Internos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/dricloud/status` | Estado de conexión (demo o real) |
| GET | `/api/dricloud/diagnostico` | Diagnóstico raw DriCloud |
| POST | `/api/dricloud/refresh` | Fuerza reconexión limpiando caché |
| GET | `/api/dricloud/specialties` | Lista de especialidades |
| GET | `/api/dricloud/doctors?especialidadId=X` | Lista de doctores |
| GET | `/api/dricloud/availability?doctorId=X&fecha=yyyyMMdd` | Disponibilidad |
| POST | `/api/dricloud/appointments` | Crear cita |
| PUT | `/api/dricloud/appointments/:id` | Modificar cita |
| POST | `/api/dricloud/appointments/:id/cancel` | Cancelar cita |
| GET | `/api/dricloud/appointments?nif=X` | Citas de un paciente |
| GET | `/api/dricloud/patients?telefono=X` | Buscar pacientes |

## Sistema de Fallback

```
Llamada a DriCloud API
↓
Login → { Successful: false } ?
├─ SÍ → DriCloudSubscriptionError → Usar mock data + mostrar banner
└─ NO → Token cacheado 23h → Llamada a endpoint
         ↓
         { Successful: false } ?
         ├─ SÍ → DriCloudSubscriptionError → Usar mock data
         └─ NO → Retornar data.Data (datos reales)
```

## Datos de Demostración

### Especialidades Demo:
- Medicina General, Pediatría, Cardiología, Dermatología, Psicología

### Doctores Demo:
1. Dra. María García López — Medicina General
2. Dr. Carlos Rodríguez Sánchez — Pediatría
3. Dra. Ana Martínez Fernández — Cardiología
4. Dr. Luis González Pérez — Dermatología
5. Dra. Elena Torres Ruiz — Psicología
6. Dr. Javier Hernández Castro — Medicina General/Cardiología

### Horarios Demo:
- Lunes a Viernes: 9:00–13:00, 16:00–19:00 (lun–jue tarde)
- Sábado: 9:00–13:00
- Domingo: Cerrado

## Configuración de Desarrollo

```bash
npm run dev   # Servidor en http://localhost:5000
```

---

**Última actualización:** 25 de febrero, 2026
**Estado:** Sistema funcional en modo demostración. Código listo para datos reales cuando se active la suscripción WebAPI en DriCloud.
