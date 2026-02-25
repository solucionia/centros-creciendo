# CitaFacil - Sistema de Gestión de Citas Médicas

## Resumen del Proyecto

CitaFacil es un sistema integral de reserva de citas médicas integrado con DriCloud (sistema de gestión médica externo). La aplicación permite a los pacientes reservar, modificar y cancelar citas médicas, sincronizando todos los datos en tiempo real con la plataforma DriCloud.

## Estado Actual del Sistema

### ✅ **Completado y Funcionando:**

1. **Conexión DriCloud en Producción:**
   - Autenticación exitosa (`"Successful":true`) con token real de DriCloud
   - URL correcta: `https://apidricloud.dricloud.net/Dricloud_creciendomirasierra_20627620/api/APIWeb/`
   - 8 doctores reales cargando desde DriCloud
   - 11 especialidades derivadas de los datos de los doctores
   - `isDemoMode: false` — sistema operando con datos reales

2. **Doctores Reales de Centro Creciendo Mirasierra:**
   - Dra. Gema Tesorero Carcedo — Pediatría
   - Dra. María Cormenzana Carpio — Pediatría
   - Dr. Javier Hernández Calvín — Otorrinolaringología
   - Dr. Marcial Sanchez Potenciano — Otorrinolaringología
   - Dr. Fernando Mera — Otorrinolaringología
   - Dra. Miriam de la Puente Yagüe — Ginecología
   - Maria Loreto Carrasco Santos — Dermatología
   - Monica Gonzalez Rincon — Matrona y Lactancia

3. **Interfaz de Usuario:**
   - Sistema de 3 botones principales: Reserva Cita, Modifica Cita, Cancela Cita
   - Calendario interactivo para selección de citas
   - Formulario de datos del paciente
   - Sistema de confirmación de citas
   - Diseño responsivo con tema turquesa

4. **Integración DriCloud API v2:**
   - Autenticación: `MD5(userName + MD5(password) + timeSpanString + salt)` en MAYÚSCULAS
   - timeSpanString en zona horaria `Europe/Madrid` (DriCloud valida contra reloj español)
   - `idClinica: 20627` (5 dígitos, no 8) en el body del login
   - URL de clínica: `Dricloud_creciendomirasierra_20627620` (con capitalización exacta)
   - Mutex de login para evitar tokens paralelos que se invalidan entre sí
   - Token cacheado 23 horas
   - Fallback automático a modo demo si la suscripción no está activa

5. **Modo Demostración (fallback):**
   - Sistema de datos de demostración funcional si DriCloud no responde
   - Banner informativo visible en modo demo
   - Botón de reconexión

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
- **DriCloud Integration**: Autenticación MD5, mutex de login, cache de tokens, mapeo de datos

### Integración DriCloud

**Archivos Clave:**
- `server/dricloud/auth.ts` — Autenticación MD5, mutex, gestión de tokens, `DriCloudSubscriptionError`
- `server/dricloud/services.ts` — Servicios de API DriCloud con extracción de claves reales
- `server/dricloud/mapper.ts` — Mapeo de datos entre sistemas
- `server/dricloud/mock-data.ts` — Datos de demostración
- `server/routes/dricloud.routes.ts` — Rutas API, categorización de doctores, mapa ESP_ID→nombre

### Credenciales Configuradas (Secrets)
- `DRICLOUD_URL_CLINICA` = `Dricloud_creciendomirasierra_20627620` (segmento URL completo)
- `DRICLOUD_CLINICA_ID` = `20627` (idClinica del body del login — 5 dígitos)
- `DRICLOUD_API_PASSWORD` — contraseña del usuario WebAPI
- `SESSION_SECRET` — secreto de sesión Express

### Detalles Técnicos Críticos
- **MD5 en MAYÚSCULAS**: `crypto.createHash('md5').update(input,'utf8').digest('hex').toUpperCase()`
- **timeSpanString**: `Intl.DateTimeFormat('es-ES', {timeZone: 'Europe/Madrid', ...}).formatToParts()`
- **URL de clínica**: `Dricloud_creciendomirasierra_20627620` (D mayúscula, no d minúscula)
- **idClinica**: `20627` (sin los últimos 3 dígitos del segmento URL)
- **GetDoctores**: devuelve `Data.Doctores[]` (no `Data[]` directamente)
- **GetEspecialidades**: devuelve `Data.Especialidades[]` — vacío para esta clínica, se deriva de doctores
- **Mutex de login**: evita que llamadas paralelas generen tokens que se invalidan mutuamente

## Endpoints API Internos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/dricloud/status` | Estado de conexión (demo o real) |
| GET | `/api/dricloud/diagnostico` | Diagnóstico de conexión DriCloud |
| POST | `/api/dricloud/refresh` | Fuerza reconexión limpiando caché |
| GET | `/api/dricloud/specialties` | Lista de especialidades |
| GET | `/api/dricloud/doctors?especialidadId=X` | Lista de doctores |
| GET | `/api/dricloud/availability?doctorId=X&fecha=yyyyMMdd` | Disponibilidad |
| POST | `/api/dricloud/appointments` | Crear cita |
| PUT | `/api/dricloud/appointments/:id` | Modificar cita |
| POST | `/api/dricloud/appointments/:id/cancel` | Cancelar cita |
| GET | `/api/dricloud/appointments?nif=X` | Citas de un paciente |
| GET | `/api/dricloud/patients?telefono=X` | Buscar pacientes |

## Mapa de Especialidades (ESP_ID → Nombre)
```
5  → Pediatría
4  → Ginecología
19 → Otorrinolaringología
41 → Otorrinolaringología
11 → Dermatología
30, 45, 23 → Matrona y Lactancia
8, 44, 53  → Medicina General
```

## Configuración de Desarrollo

```bash
npm run dev   # Servidor en http://localhost:5000
```

---

**Última actualización:** 25 de febrero, 2026
**Estado:** Sistema en producción con datos reales de DriCloud. 8 doctores y 11 especialidades cargando desde la API real.
