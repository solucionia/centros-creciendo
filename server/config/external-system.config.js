// Configuración para integración con sistema externo de gestión médica
module.exports = {
  // URL del webhook o API del sistema externo
  externalSystemUrl: process.env.EXTERNAL_BOOKING_WEBHOOK || 'https://tu-sistema-medico.com/api/appointments',
  
  // Token de autenticación (si es necesario)
  authToken: process.env.EXTERNAL_SYSTEM_TOKEN || '',
  
  // Headers adicionales para la integración
  additionalHeaders: {
    'User-Agent': 'CentroCreciendo-BookingSystem/1.0',
    'X-Source': 'centro-creciendo'
  },
  
  // Configuración de timeout
  timeout: 10000, // 10 segundos
  
  // Mapeo de especialidades al formato del sistema externo
  specialtyMapping: {
    'pediatric': 'PEDIATRIA',
    'adult': 'MEDICINA_GENERAL', 
    'family': 'MEDICINA_FAMILIAR'
  },
  
  // Configuración de retry en caso de error
  retryConfig: {
    maxRetries: 3,
    retryDelay: 1000 // 1 segundo entre reintentos
  }
};