# Integración OTP por WhatsApp — Centro Creciendo Mirasierra

## Descripción General

Este documento describe la integración completa para implementar un sistema de autenticación de dos factores (2FA) mediante OTP (One-Time Password) enviado por WhatsApp, usando el CRM como middleware de mensajería.

**Flujo general:**
```
[Web Login] → [Tu Backend] → [API del CRM] → [Workflow CRM] → [WhatsApp del cliente]
     ↑                                                                    ↓
[Validación OTP] ←────────────── [Cliente introduce el código] ──────────┘
```

---

## 1. Campo Personalizado en el CRM

Ya existe un campo creado en el CRM para almacenar el OTP:

| Propiedad       | Valor                        |
|-----------------|------------------------------|
| Nombre          | `OTP WhatsApp Login`         |
| Field ID        | `mI279Pa1MUefkbCNAA7X`       |
| Field Key       | `contact.otp_whatsapp_login` |
| Tipo            | `TEXT`                       |
| Modelo          | `contact`                    |

---

## 2. Variables de Entorno necesarias

```env
# .env
CRM_API_KEY=YOUR_CRM_PRIVATE_API_KEY
CRM_LOCATION_ID=YOUR_LOCATION_ID
CRM_BASE_URL=https://services.leadconnectorhq.com
OTP_EXPIRY_SECONDS=300
OTP_MAX_ATTEMPTS=3
```

> **Cómo obtener el API Key:** En el CRM ve a *Configuración → Integraciones → API Keys* y genera una clave privada con permisos de lectura/escritura en Contacts.

> **Cómo obtener el Location ID:** En el CRM ve a *Configuración → Info. de Negocio* y copia el ID de la ubicación.

---

## 3. Workflow en el CRM (configuración manual)

Debe crearse manualmente en el CRM con la siguiente configuración:

### Trigger
- **Tipo:** `Contact Field Updated`
- **Campo monitoreado:** `OTP WhatsApp Login` (`contact.otp_whatsapp_login`)
- **Condición:** El valor del campo NO está vacío

### Acciones
1. **Enviar mensaje de WhatsApp** usando una plantilla de tipo *Autenticación*
   - Template variable `{{1}}` = valor del campo `OTP WhatsApp Login`
   - Canal: WhatsApp Business conectado al CRM
2. **(Opcional) Esperar 5 minutos** → Limpiar el campo OTP (actualizar a vacío) para invalidarlo tras la expiración

### Plantilla de WhatsApp (Meta)
Debe estar aprobada por Meta. Ejemplo de texto:

```
Tu código de verificación para Centro Creciendo es: {{1}}
Este código expira en 5 minutos. No lo compartas con nadie.
```

> **Tipo de plantilla:** AUTHENTICATION  
> **Categoría:** Utility  
> **Idioma:** es (Español)

---

## 4. Integración Backend (Node.js / Express)

### 4.1 Instalar dependencias

```bash
npm install express axios redis dotenv crypto
```

### 4.2 Generación y envío del OTP

```javascript
// services/otpService.js
const axios = require('axios');
const redis = require('redis');
const crypto = require('crypto');
require('dotenv').config();

const redisClient = redis.createClient();
redisClient.connect();

/**
 * Genera un OTP de 6 dígitos y lo guarda en Redis y en el CRM.
 * El Workflow del CRM detecta el cambio de campo y envía el WhatsApp automáticamente.
 */
async function generateAndSendOTP(contactId, phoneNumber) {
  // 1. Generar OTP seguro
  const otp = crypto.randomInt(100000, 999999).toString();
  const expiry = parseInt(process.env.OTP_EXPIRY_SECONDS) || 300;

  // 2. Guardar en Redis con TTL
  const redisKey = `otp:${phoneNumber}`;
  await redisClient.setEx(
    redisKey,
    expiry,
    JSON.stringify({ otp, contactId, attempts: 0 })
  );

  // 3. Actualizar el campo OTP en el contacto del CRM
  //    → Esto dispara el Workflow que envía el WhatsApp
  await updateCRMContactField(contactId, otp);

  return { success: true, expiresIn: expiry };
}

/**
 * Actualiza el campo OTP del contacto en el CRM.
 * El campo key es: contact.otp_whatsapp_login
 */
async function updateCRMContactField(contactId, otpValue) {
  const url = `${process.env.CRM_BASE_URL}/contacts/${contactId}`;

  await axios.put(url, {
    customFields: [
      {
        id: 'mI279Pa1MUefkbCNAA7X',   // Field ID del campo OTP
        field_value: otpValue
      }
    ]
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.CRM_API_KEY}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28'
    }
  });
}

/**
 * Limpia el campo OTP en el CRM una vez validado (o expirado).
 */
async function clearCRMOTPField(contactId) {
  await updateCRMContactField(contactId, '');
}

module.exports = { generateAndSendOTP, clearCRMOTPField };
```

### 4.3 Validación del OTP

```javascript
// services/validateOTP.js
const redis = require('redis');
const { clearCRMOTPField } = require('./otpService');

const redisClient = redis.createClient();
redisClient.connect();

const MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS) || 3;

async function validateOTP(phoneNumber, inputOtp) {
  const redisKey = `otp:${phoneNumber}`;
  const raw = await redisClient.get(redisKey);

  if (!raw) {
    return { valid: false, error: 'OTP expirado o inexistente' };
  }

  const data = JSON.parse(raw);

  // Control de intentos
  if (data.attempts >= MAX_ATTEMPTS) {
    await redisClient.del(redisKey);
    await clearCRMOTPField(data.contactId);
    return { valid: false, error: 'Demasiados intentos. Solicita un nuevo código.' };
  }

  if (data.otp !== inputOtp) {
    data.attempts += 1;
    const ttl = await redisClient.ttl(redisKey);
    await redisClient.setEx(redisKey, ttl, JSON.stringify(data));
    return { valid: false, error: 'Código incorrecto', attemptsLeft: MAX_ATTEMPTS - data.attempts };
  }

  // OTP válido → limpiar
  await redisClient.del(redisKey);
  await clearCRMOTPField(data.contactId);

  return { valid: true, contactId: data.contactId };
}

module.exports = { validateOTP };
```

### 4.4 Rutas Express

```javascript
// routes/auth.js
const express = require('express');
const router = express.Router();
const { generateAndSendOTP } = require('../services/otpService');
const { validateOTP } = require('../services/validateOTP');
const rateLimit = require('express-rate-limit');

// Rate limit: max 3 solicitudes de OTP por IP cada 15 minutos
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: 'Demasiadas solicitudes. Inténtalo en 15 minutos.' }
});

/**
 * POST /auth/request-otp
 * Body: { contactId, phoneNumber }
 */
router.post('/request-otp', otpLimiter, async (req, res) => {
  const { contactId, phoneNumber } = req.body;

  if (!contactId || !phoneNumber) {
    return res.status(400).json({ error: 'contactId y phoneNumber son requeridos' });
  }

  try {
    const result = await generateAndSendOTP(contactId, phoneNumber);
    res.json({
      success: true,
      message: 'OTP enviado por WhatsApp',
      expiresIn: result.expiresIn
    });
  } catch (err) {
    console.error('Error generando OTP:', err.message);
    res.status(500).json({ error: 'Error al enviar el OTP' });
  }
});

/**
 * POST /auth/verify-otp
 * Body: { phoneNumber, otp }
 */
router.post('/verify-otp', async (req, res) => {
  const { phoneNumber, otp } = req.body;

  if (!phoneNumber || !otp) {
    return res.status(400).json({ error: 'phoneNumber y otp son requeridos' });
  }

  try {
    const result = await validateOTP(phoneNumber, otp);

    if (!result.valid) {
      return res.status(401).json({ error: result.error, attemptsLeft: result.attemptsLeft });
    }

    // Generar sesión / JWT aquí
    // const token = jwt.sign({ contactId: result.contactId }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.json({
      success: true,
      message: 'Autenticación exitosa',
      contactId: result.contactId
      // token
    });
  } catch (err) {
    console.error('Error validando OTP:', err.message);
    res.status(500).json({ error: 'Error al validar el OTP' });
  }
});

module.exports = router;
```

### 4.5 Buscar el contactId por teléfono en el CRM

```javascript
// services/crmContacts.js
const axios = require('axios');
require('dotenv').config();

/**
 * Busca un contacto en el CRM por número de teléfono.
 * Retorna el contactId si existe, null si no.
 */
async function findContactByPhone(phoneNumber) {
  const url = `${process.env.CRM_BASE_URL}/contacts/search`;

  const response = await axios.get(url, {
    params: {
      locationId: process.env.CRM_LOCATION_ID,
      query: phoneNumber
    },
    headers: {
      'Authorization': `Bearer ${process.env.CRM_API_KEY}`,
      'Version': '2021-07-28'
    }
  });

  const contacts = response.data?.contacts || [];
  if (contacts.length === 0) return null;

  return contacts[0].id;
}

module.exports = { findContactByPhone };
```

---

## 5. Flujo Completo — Diagrama de Secuencia

```
Cliente          Frontend          Backend           Redis         CRM API        WhatsApp
  │                 │                 │                │               │               │
  │──[Introduce phone]──►│             │                │               │               │
  │                 │──POST /request-otp──►│            │               │               │
  │                 │                 │──generateOTP──►│               │               │
  │                 │                 │◄──stored OTP───│               │               │
  │                 │                 │──PUT contact customField──────►│               │
  │                 │                 │                │        [Workflow trigger]      │
  │                 │                 │                │               │──WhatsApp OTP─►│
  │◄──[Recibe OTP en WhatsApp]──────────────────────────────────────────────────────────│
  │──[Introduce OTP]──►│             │                │               │               │
  │                 │──POST /verify-otp──►│            │               │               │
  │                 │                 │──getOTP───────►│               │               │
  │                 │                 │◄──validate─────│               │               │
  │                 │                 │──clearField───────────────────►│               │
  │                 │◄──{ success, token }──│          │               │               │
  │◄──[Login exitoso]──│              │                │               │               │
```

---

## 6. Checklist de Implementación

- [ ] Configurar número de WhatsApp Business en el CRM
- [ ] Crear y aprobar plantilla de WhatsApp tipo *Authentication* en Meta
- [ ] Crear el Workflow en el CRM (trigger: campo OTP actualizado)
- [ ] Configurar Redis en el servidor backend
- [ ] Copiar y adaptar el código de `otpService.js` y `validateOTP.js`
- [ ] Definir las variables de entorno (`.env`)
- [ ] Implementar generación de JWT/sesión tras validación exitosa
- [ ] Añadir rate limiting y logs de auditoría
- [ ] Probar el flujo completo en entorno de staging
- [ ] Configurar limpieza automática del campo OTP en el CRM tras expiración (paso 2 del workflow)

---

## 7. Consideraciones de Seguridad

| Riesgo                      | Mitigación                                              |
|-----------------------------|---------------------------------------------------------|
| Fuerza bruta en OTP         | Máximo 3 intentos, bloqueo y expiración en Redis        |
| Replay attack               | OTP se elimina de Redis y CRM tras primer uso válido    |
| Spam de envíos WhatsApp     | Rate limit por IP (3 req / 15 min) en `/request-otp`   |
| OTP visible en logs         | Nunca loguear el valor del OTP, solo el contactId       |
| Exposición del campo en CRM | El campo no está habilitado en formularios públicos     |
| Man-in-the-middle           | Usar HTTPS obligatorio en todas las rutas               |

---

## 8. Referencias de Campos CRM

| Nombre             | Valor                        |
|--------------------|------------------------------|
| Campo OTP Field ID | `mI279Pa1MUefkbCNAA7X`       |
| Campo OTP Key      | `contact.otp_whatsapp_login` |
| API Version Header | `2021-07-28`                 |
| Endpoint Contacts  | `{CRM_BASE_URL}/contacts`    |
