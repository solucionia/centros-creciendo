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

2. **Integración DriCloud API:**
   - Sistema de autenticación con MD5 hash
   - Gestión automática de tokens (cache de 23 horas)
   - Endpoints de integración implementados:
     - `GET /api/dricloud/doctors` - Obtiene médicos
     - `GET /api/dricloud/specialties` - Obtiene especialidades
     - `GET /api/dricloud/availability` - Obtiene disponibilidad de agenda
     - `POST /api/dricloud/appointments` - Crea citas
     - `POST /api/dricloud/appointments/:id/cancel` - Cancela citas
   - Búsqueda y creación automática de pacientes en DriCloud
   - Mapeo de datos entre CitaFacil y DriCloud

3. **Modo Demostración:**
   - Sistema de datos de demostración (mock data) funcional
   - Detección automática de error de suscripción DriCloud
   - Fallback transparente a datos demo cuando DriCloud no está disponible
   - Banner informativo visible para indicar modo demostración

### ⚠️ **Bloqueador Actual:**

**Suscripción DriCloud WebAPI No Activa**

**Error:** `"Error. Suscripción a WebAPI no activa."`

**Estado:**
- ✅ Autenticación DriCloud funciona correctamente
- ✅ Token se genera y cachea exitosamente
- ❌ Endpoints de datos bloqueados por falta de suscripción
- ✅ Sistema funciona en modo demostración mientras tanto

**Acción Requerida:**
1. Contactar soporte técnico DriCloud
2. Solicitar activación de suscripción WebAPI
3. Proporcionar Clínica ID: `dricloud_creciendomirasierra_20627620`
4. Una vez activada, el sistema automáticamente usará datos reales

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
- **DriCloud Integration**: 
  - Autenticación MD5
  - Cache de tokens
  - Mapeo de datos
  - Sistema de fallback a mock data

### Integración DriCloud

**Archivos Clave:**
- `server/dricloud/auth.ts` - Autenticación y gestión de tokens
- `server/dricloud/services.ts` - Servicios de API DriCloud
- `server/dricloud/mapper.ts` - Mapeo de datos entre sistemas
- `server/dricloud/mock-data.ts` - Datos de demostración
- `server/routes/dricloud.routes.ts` - Rutas de API
- `client/src/hooks/use-dricloud.ts` - Hooks de React para DriCloud

### Credenciales Configuradas (Secrets)
- `DRICLOUD_URL_CLINICA` - URL de la clínica en DriCloud
- `DRICLOUD_CLINICA_ID` - ID de la clínica
- `DRICLOUD_API_PASSWORD` - Contraseña de API
- `SESSION_SECRET` - Secreto de sesión Express

## Funcionalidades Implementadas

### 1. Reserva de Citas
- Selección de especialidad médica
- Filtrado de doctores por especialidad
- Calendario interactivo con disponibilidad
- Formulario de datos del paciente
- Confirmación de cita

### 2. Modificación de Citas
- Búsqueda de citas por email
- Interfaz para cambiar fecha/hora
- Actualización en DriCloud (cuando esté activo)

### 3. Cancelación de Citas
- Búsqueda de citas por email
- Confirmación de cancelación
- Sincronización con DriCloud (cuando esté activo)

## Datos de Demostración

Mientras la suscripción DriCloud no esté activa, el sistema utiliza:

### Especialidades Demo:
- Medicina General
- Pediatría
- Cardiología
- Dermatología
- Psicología

### Doctores Demo:
1. Dra. María García López - Medicina General
2. Dr. Carlos Rodríguez Sánchez - Pediatría
3. Dra. Ana Martínez Fernández - Cardiología
4. Dr. Luis González Pérez - Dermatología
5. Dra. Elena Torres Ruiz - Psicología
6. Dr. Javier Hernández Castro - Medicina General/Cardiología

### Horarios Demo:
- Lunes a Viernes: 9:00-13:00, 16:00-19:00 (lunes a jueves tarde)
- Sábado: 9:00-13:00
- Domingo: Cerrado

## Flujo de Trabajo

### Proceso de Reserva:
1. Usuario selecciona "Reserva Cita"
2. Elige especialidad (opcional)
3. Selecciona doctor del listado
4. Escoge fecha y hora disponible en calendario
5. Completa formulario de datos personales
6. Confirma la cita
7. Sistema intenta guardar en DriCloud (o modo demo)

### Sistema de Fallback:
```
Intento de conexión DriCloud
↓
¿Suscripción activa?
├─ SÍ → Usar datos reales de DriCloud
└─ NO → Usar datos de demostración + Mostrar banner
```

## Próximos Pasos

### Para Activar Integración Completa:
1. **Activar Suscripción DriCloud:**
   - Contactar: Soporte técnico DriCloud
   - Solicitar: Activación de suscripción WebAPI
   - Proporcionar: Clínica ID `dricloud_creciendomirasierra_20627620`

2. **Verificación Post-Activación:**
   ```bash
   # Probar endpoint de doctores
   curl http://localhost:5000/api/dricloud/doctors
   
   # Verificar logs
   # Debe mostrar: "✅ Doctores reales obtenidos: X"
   ```

3. **Transición Automática:**
   - No requiere cambios de código
   - Banner de demo desaparecerá automáticamente
   - Datos reales se cargarán transparentemente

## Documentación Adicional

- **Estado de Integración**: Ver `DRICLOUD_INTEGRATION_STATUS.md`
- **Arquitectura DriCloud**: Ver archivos en `server/dricloud/`
- **Componentes UI**: Ver archivos en `client/src/components/`

## Configuración de Desarrollo

### Variables de Entorno Necesarias:
- `DRICLOUD_URL_CLINICA` - URL base de DriCloud
- `DRICLOUD_CLINICA_ID` - ID de la clínica
- `DRICLOUD_API_PASSWORD` - Contraseña de API
- `SESSION_SECRET` - Secreto para sesiones Express

### Comandos:
```bash
# Iniciar desarrollo
npm run dev

# Servidor corre en: http://localhost:5000
```

## Contacto y Soporte

**CitaFacil**
- Email: info@citafacil.com
- Teléfono: +57 (1) 123-4567

**Soporte DriCloud**
- Activar suscripción WebAPI para Clínica ID: dricloud_creciendomirasierra_20627620

---

**Última actualización:** 13 de octubre, 2025  
**Estado:** Sistema funcional en modo demostración, esperando activación de suscripción DriCloud WebAPI
