# 🔍 Cómo Verificar la Conexión con DriCloud

## ✅ Pasos para Comprobar el Estado

### **Paso 1: Verificar el Estado General**

Ejecuta este comando en tu terminal:

```bash
curl http://localhost:5000/api/dricloud/status
```

#### **Interpretación:**

**✅ Suscripción ACTIVA:**
```json
{
  "isDemoMode": false,
  "message": "Conectado a DriCloud"
}
```

**❌ Suscripción NO ACTIVA (Estado Actual):**
```json
{
  "isDemoMode": true,
  "message": "Modo demostración activo - Suscripción DriCloud no activa"
}
```

---

### **Paso 2: Comprobar Datos de Doctores**

```bash
curl http://localhost:5000/api/dricloud/doctors
```

#### **¿Cómo Saber si Son Datos Reales?**

**❌ DATOS DE DEMOSTRACIÓN (actual):**
- Ves doctores con emails como: `@citafacil.com`
- Nombres genéricos: "María García López", "Carlos Rodríguez"
- Son siempre los mismos 6 doctores

**✅ DATOS REALES:**
- Verías tus doctores reales de la clínica
- Emails reales de tu organización
- Nombres de tus médicos reales

---

### **Paso 3: Ver los Logs del Servidor**

Mira los logs en la consola del servidor y busca:

#### **🔴 Si NO está activa (actual):**
```
[DriCloud] Login successful, token cached
[DriCloud] ⚠️  Suscripción no activa - Usando doctores de demostración
[DriCloud] Status: Modo demostración - Suscripción no activa
```

#### **🟢 Si ESTÁ activa:**
```
[DriCloud] Login successful, token cached
[DriCloud] ✅ Doctores reales obtenidos: 15
[DriCloud] Status: Conectado a DriCloud - Datos reales disponibles
```

---

## 🧪 Prueba Técnica Completa

Para ver **exactamente** qué responde DriCloud, ejecuta:

```bash
tsx test-dricloud-direct.ts
```

Este script prueba directamente con la API de DriCloud y muestra:

### **Estado Actual (Suscripción NO Activa):**

```json
Respuesta de DriCloud:
{
  "Successful": false,
  "Html": "Error. Suscripción a WebAPI no activa.",
  "Data": {
    "ErrorCode": 0
  }
}
```

### **Estado Esperado (Suscripción Activa):**

```json
Respuesta de DriCloud:
{
  "Successful": true,
  "Data": [
    {
      "USU_ID": 123,
      "USU_NOMBRE": "Doctor Real",
      "USU_APELLIDOS": "De Tu Clínica",
      ...
    }
  ]
}
```

---

## 📊 Tabla de Comparación Rápida

| Indicador | Con Suscripción | Sin Suscripción (Actual) |
|-----------|----------------|--------------------------|
| **isDemoMode** | `false` | `true` ✅ |
| **Login** | ✅ Exitoso | ✅ Exitoso |
| **Respuesta API** | Datos reales | "Suscripción a WebAPI no activa" ✅ |
| **Doctores** | Reales de clínica | 6 doctores demo ✅ |
| **Logs** | "✅ Datos reales" | "⚠️ Suscripción no activa" ✅ |

---

## 🎯 Conclusión Actual

**TODOS los indicadores confirman que:**

1. ✅ La **autenticación funciona** correctamente (login exitoso)
2. ✅ Las **credenciales son correctas** (token obtenido)
3. ❌ La **suscripción WebAPI NO está activa** (DriCloud lo rechaza)

**Solución:** Contactar con DriCloud para activar la suscripción WebAPI para la clínica ID: `dricloud_creciendomirasierra_20627620`

---

## 📞 Qué Decirle a DriCloud

> "Hola, necesito activar la **suscripción WebAPI** para mi clínica.
> 
> - **Clínica ID:** dricloud_creciendomirasierra_20627620
> - **URL:** dricloud_creciendomirasierra
> - **Error actual:** "Suscripción a WebAPI no activa"
> 
> La autenticación funciona, pero no puedo acceder a los datos de doctores, especialidades ni agendar citas.
> 
> ¿Pueden activar la suscripción WebAPI para esta clínica?"

---

## ✨ Una Vez Activada

**NO necesitas cambiar NADA en el código.**

El sistema detectará automáticamente que la suscripción está activa y:
- ✅ El banner de demo desaparecerá
- ✅ Se cargarán tus doctores reales
- ✅ Las citas se guardarán en DriCloud
- ✅ Todo funcionará con datos reales

**Simplemente recarga la página y verás tus datos reales.**
