# Especificación de Middleware — Sistema de Citas Online
**Cliente:** Centro Creciendo Mirasierra — Clínica Pediátrica y de Adultos  
**Fecha:** Junio 2026  
**Versión:** 1.0

---

## 1. Descripción General

Se necesita un middleware REST que actúe como puente entre el **CRM** (sistema de conversaciones, workflows y calendario) y **Dricloud** (sistema interno de gestión clínica).

Cuando un paciente escribe **"Quiero solicitar una cita"** en cualquier canal (SMS, WhatsApp, Chat Web), un bot conversacional del CRM recopila sus datos, verifica si ya es paciente, muestra huecos disponibles y confirma la reserva — todo ello llamando a los endpoints de este middleware.

---

## 2. Arquitectura del Sistema

```
Paciente (SMS / WhatsApp / Chat Web)
          ↕
    CRM — Conversation AI Bot
          ↕  (llamadas HTTP REST)
    Middleware (este documento)
          ↕  (llamadas a Dricloud)
    Dricloud — apidricloud.dricloud.net
               idClinica: 20423
```

**Flujo en 4 fases:**

| Fase | Acción | Endpoint Middleware |
|------|--------|---------------------|
| 1 | Bot recoge datos del paciente | — (solo conversación) |
| 2 | Verificar si existe o crear paciente | `POST /paciente/verificar-o-crear` |
| 3 | Obtener huecos disponibles | `POST /citas/slots-disponibles` |
| 4 | Reservar la cita elegida | `POST /citas/reservar` |
| 5 *(opcional)* | Cancelar una cita | `POST /citas/cancelar` |

---

## 3. Especificaciones Técnicas Generales

- **Protocolo:** HTTPS
- **Formato:** JSON (`Content-Type: application/json`)
- **Autenticación:** Header `X-API-Key: {clave_secreta}` en todas las llamadas
- **Header adicional:** `X-CRM-Location: uqsjlozAazLu5IghrCSh` (identificador de la cuenta CRM)
- **Timeout recomendado:** ≤ 5 segundos por respuesta (el bot espera en tiempo real)
- **Idioma de mensajes:** Español
- **Formato de fechas:** `YYYY-MM-DD`
- **Formato de horas:** `HH:MM` (24h)
- **Formato de teléfonos:** E.164 (ej: `+34612345678`)

---

## 4. Endpoints Requeridos

---

### 4.1 `POST /paciente/verificar-o-crear`

Comprueba en Dricloud si el paciente ya existe (por teléfono o email).  
Si no existe, lo crea en Dricloud y devuelve el nuevo ID.

#### Request

```json
{
  "telefono": "+34612345678",
  "email": "paciente@email.com",
  "nombre": "María",
  "apellidos": "García López",
  "crm_contact_id": "abc123xyz"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono` | string | ✅ Sí | Teléfono en formato E.164. Campo principal de búsqueda |
| `email` | string | No | Email del paciente. Campo secundario de búsqueda |
| `nombre` | string | ✅ Sí | Nombre de pila |
| `apellidos` | string | ✅ Sí | Apellidos |
| `crm_contact_id` | string | ✅ Sí | ID del contacto en el CRM (para trazabilidad) |

#### Response — Paciente existente

```json
{
  "success": true,
  "es_nuevo": false,
  "paciente": {
    "id_dricloud": 88421,
    "nombre_completo": "María García López",
    "telefono": "+34612345678",
    "email": "paciente@email.com",
    "ultima_visita": "2025-11-10",
    "medico_habitual": "Dr. Ruiz"
  }
}
```

#### Response — Paciente nuevo (recién creado en Dricloud)

```json
{
  "success": true,
  "es_nuevo": true,
  "paciente": {
    "id_dricloud": 99102,
    "nombre_completo": "María García López",
    "telefono": "+34612345678",
    "email": "paciente@email.com"
  }
}
```

> **Nota:** `ultima_visita` y `medico_habitual` son opcionales. Si los devuelves, el bot puede personalizar el saludo.

---

### 4.2 `POST /citas/slots-disponibles`

Devuelve los huecos libres en Dricloud según preferencias del paciente.  
El bot presentará los primeros 3–5 resultados de forma legible.

#### Request

```json
{
  "id_dricloud": 99102,
  "crm_contact_id": "abc123xyz",
  "especialidad": "Pediatría",
  "id_medico": null,
  "motivo": "Revisión rutinaria",
  "fecha_desde": "2026-06-26",
  "fecha_hasta": "2026-07-10",
  "preferencia_horaria": "mañana"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `id_dricloud` | integer | ✅ Sí | ID del paciente en Dricloud |
| `crm_contact_id` | string | ✅ Sí | ID del contacto en el CRM |
| `especialidad` | string | No | Especialidad solicitada. `null` si no especifica |
| `id_medico` | integer | No | ID del médico concreto en Dricloud. `null` si no especifica |
| `motivo` | string | No | Texto libre con el motivo de consulta |
| `fecha_desde` | string | ✅ Sí | Inicio del rango de búsqueda (`YYYY-MM-DD`) |
| `fecha_hasta` | string | ✅ Sí | Fin del rango de búsqueda (`YYYY-MM-DD`) |
| `preferencia_horaria` | string | No | `"mañana"` \| `"tarde"` \| `"cualquiera"` |

#### Response

```json
{
  "success": true,
  "total_slots": 3,
  "slots": [
    {
      "slot_id": "SL-20260627-001",
      "fecha": "2026-06-27",
      "hora_inicio": "09:00",
      "hora_fin": "09:20",
      "medico": "Dra. Martínez",
      "especialidad": "Pediatría",
      "consulta": "Consulta 2"
    },
    {
      "slot_id": "SL-20260627-002",
      "fecha": "2026-06-27",
      "hora_inicio": "09:20",
      "hora_fin": "09:40",
      "medico": "Dra. Martínez",
      "especialidad": "Pediatría",
      "consulta": "Consulta 2"
    },
    {
      "slot_id": "SL-20260628-003",
      "fecha": "2026-06-28",
      "hora_inicio": "10:00",
      "hora_fin": "10:20",
      "medico": "Dr. Ruiz",
      "especialidad": "Pediatría",
      "consulta": "Consulta 1"
    }
  ]
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `slot_id` | string | Identificador único del hueco. Se usará en `/citas/reservar` |
| `fecha` | string | Fecha del hueco (`YYYY-MM-DD`) |
| `hora_inicio` | string | Hora de inicio (`HH:MM`) |
| `hora_fin` | string | Hora de fin (`HH:MM`) |
| `medico` | string | Nombre del médico |
| `especialidad` | string | Especialidad de la consulta |
| `consulta` | string | Nombre/número de la consulta física (opcional) |

> **Recomendación:** Devolver un máximo de 10 slots. El bot mostrará solo los 3–5 primeros para no saturar al paciente.

---

### 4.3 `POST /citas/reservar`

Bloquea definitivamente el hueco elegido en Dricloud y confirma la cita.

#### Request

```json
{
  "id_dricloud": 99102,
  "crm_contact_id": "abc123xyz",
  "slot_id": "SL-20260627-001",
  "motivo": "Revisión rutinaria",
  "notas_adicionales": null
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `id_dricloud` | integer | ✅ Sí | ID del paciente en Dricloud |
| `crm_contact_id` | string | ✅ Sí | ID del contacto en el CRM |
| `slot_id` | string | ✅ Sí | ID del slot elegido (obtenido en el paso anterior) |
| `motivo` | string | No | Motivo de la consulta |
| `notas_adicionales` | string | No | Observaciones extra del paciente. `null` si no hay |

#### Response

```json
{
  "success": true,
  "cita": {
    "id_cita_dricloud": 55820,
    "fecha": "2026-06-27",
    "hora_inicio": "09:00",
    "hora_fin": "09:20",
    "medico": "Dra. Martínez",
    "especialidad": "Pediatría",
    "consulta": "Consulta 2",
    "localizacion": "Centro Creciendo Mirasierra",
    "crm_calendar_id": null,
    "mensaje_confirmacion": "Su cita ha sido confirmada para el viernes 27 de junio a las 09:00h con la Dra. Martínez (Pediatría). Le enviaremos un recordatorio 24h antes."
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id_cita_dricloud` | integer | ID de la cita en Dricloud (necesario para cancelaciones futuras) |
| `fecha` | string | Fecha confirmada |
| `hora_inicio` / `hora_fin` | string | Horario confirmado |
| `medico` | string | Médico asignado |
| `especialidad` | string | Especialidad |
| `consulta` | string | Consulta física |
| `localizacion` | string | Nombre del centro |
| `crm_calendar_id` | string\|null | Si el middleware gestiona el calendario CRM, indicar el ID aquí. Si no, dejar `null` |
| `mensaje_confirmacion` | string | Texto en lenguaje natural que el bot enviará al paciente |

---

### 4.4 `POST /citas/cancelar` *(opcional)*

Permite cancelar una cita existente cuando el paciente lo solicita por el mismo canal.

#### Request

```json
{
  "id_dricloud": 99102,
  "id_cita_dricloud": 55820,
  "crm_contact_id": "abc123xyz",
  "motivo_cancelacion": "El paciente no puede asistir"
}
```

#### Response

```json
{
  "success": true,
  "mensaje": "Cita cancelada correctamente. El hueco ha quedado libre."
}
```

---

## 5. Manejo de Errores

Todos los endpoints deben devolver **siempre** el mismo formato de error para que el bot pueda reaccionar de forma apropiada.

```json
{
  "success": false,
  "codigo_error": "NO_SLOTS",
  "mensaje": "No hay huecos disponibles en el rango de fechas solicitado.",
  "accion_sugerida": "ampliar_rango"
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `success` | boolean | Siempre `false` en errores |
| `codigo_error` | string | Código máquina (ver tabla abajo) |
| `mensaje` | string | Texto legible para log / debug |
| `accion_sugerida` | string | Opcional. Indicación para el bot sobre cómo actuar |

### Códigos de error estándar

| Código | Descripción | Acción sugerida para el bot |
|--------|-------------|------------------------------|
| `PACIENTE_NO_ENCONTRADO` | No existe y faltan datos para crearlo | Pedir más datos al paciente |
| `SLOT_NO_DISPONIBLE` | El slot ya fue ocupado entre medias | Volver a pedir slots disponibles |
| `NO_SLOTS` | Sin disponibilidad en el rango dado | Proponer ampliar rango de fechas |
| `DATOS_INCOMPLETOS` | Faltan campos obligatorios en el request | Error interno, revisar integración |
| `DRICLOUD_ERROR` | Fallo interno de Dricloud | Informar al paciente y ofrecer llamar a la clínica |

### Códigos HTTP esperados

| HTTP | Situación |
|------|-----------|
| `200` | Operación correcta (`success: true`) |
| `400` | Datos incorrectos o incompletos |
| `401` | API Key inválida o ausente |
| `404` | Recurso no encontrado |
| `409` | Conflicto (ej: slot ya reservado) |
| `500` | Error interno del middleware o Dricloud |

---

## 6. Flujo Conversacional Completo (referencia para el bot)

```
[Paciente]  "Quiero solicitar una cita"
[Bot]       "¡Hola! Voy a ayudarte a pedir tu cita. ¿Me dices tu nombre completo?"
[Paciente]  "María García"
[Bot]       "¿Y tu número de teléfono?"
[Paciente]  "+34 612 345 678"
                ↓
        POST /paciente/verificar-o-crear
                ↓
  [Si es_nuevo = false]
[Bot]       "¡Bienvenida de nuevo, María! ¿Qué tipo de consulta necesitas?"
  [Si es_nuevo = true]
[Bot]       "Perfecto, María, te he registrado en el sistema. ¿Qué tipo de consulta necesitas?"

[Bot]       "¿Tienes preferencia de horario? (Mañana / Tarde / Cualquiera)"
[Paciente]  "Mañana"
                ↓
        POST /citas/slots-disponibles
                ↓
[Bot]       "Tengo estas opciones disponibles:
             1️⃣ Viernes 27 jun · 09:00h · Dra. Martínez (Pediatría)
             2️⃣ Viernes 27 jun · 09:20h · Dra. Martínez (Pediatría)
             3️⃣ Sábado 28 jun · 10:00h · Dr. Ruiz (Pediatría)
             ¿Cuál te viene mejor?"
[Paciente]  "La 1"
                ↓
        POST /citas/reservar
                ↓
[Bot]       "✅ ¡Perfecto! Tu cita está confirmada:
             📅 Viernes 27 de junio a las 09:00h
             👩‍⚕️ Dra. Martínez — Pediatría
             🏥 Centro Creciendo Mirasierra
             Te enviaremos un recordatorio 24h antes. ¡Hasta pronto!"
```

---

## 7. Seguridad

- Todas las comunicaciones deben usar **HTTPS** (certificado TLS válido).
- El middleware debe validar el header `X-API-Key` en cada request. Rechazar con HTTP 401 si no coincide.
- Se recomienda **lista blanca de IPs** para aceptar solo llamadas desde los servidores del CRM.
- Los datos de pacientes deben tratarse conforme al **RGPD** (Reglamento General de Protección de Datos).
- No almacenar datos sensibles en logs sin enmascaramiento.

---

## 8. Información Pendiente para Completar la Integración

Antes de comenzar la implementación, se necesita confirmar:

- [ ] URL base del middleware (ej: `https://middleware.creciendomirasierra.com`)
- [ ] Clave API (`X-API-Key`) acordada entre CRM y middleware
- [ ] Listado de especialidades disponibles en la clínica
- [ ] Canales donde activar el bot: SMS, WhatsApp, Chat Web
- [ ] ¿Las citas deben reflejarse también en el calendario del CRM además de en Dricloud?
- [ ] ¿Se desea envío de recordatorio automático 24h antes de la cita?
- [ ] Credenciales de acceso a Dricloud para el middleware (idClinica, usuario, contraseña, salt)

---

## 9. Contacto y Coordinación

**Cuenta CRM (Location ID):** `uqsjlozAazLu5IghrCSh`  
**Sistema interno:** Dricloud — `apidricloud.dricloud.net` · idClinica: `20423`  

---
*Documento generado automáticamente. Versión 1.0 — Junio 2026.*
