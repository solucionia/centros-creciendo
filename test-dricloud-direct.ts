// Script para probar DriCloud directamente y mostrar la respuesta exacta
import { getEspecialidades, getDoctores } from './server/dricloud/services';
import { DRICLOUD_CONFIG } from './server/dricloud/auth';

async function testDriCloud() {
  console.log('\n========================================');
  console.log('PRUEBA DIRECTA DE DRICLOUD API');
  console.log('========================================\n');
  
  console.log('Configuración actual:');
  console.log('- Clínica ID:', DRICLOUD_CONFIG.clinicaId);
  console.log('- URL:', process.env.DRICLOUD_URL_CLINICA);
  console.log('- Password configurado:', process.env.DRICLOUD_API_PASSWORD ? 'Sí (oculto por seguridad)' : 'No');
  
  console.log('\n========================================');
  console.log('PROBANDO: GetEspecialidades');
  console.log('========================================\n');
  
  try {
    const especialidades = await getEspecialidades(DRICLOUD_CONFIG.clinicaId);
    console.log('Respuesta de DriCloud:');
    console.log(JSON.stringify(especialidades, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
  
  console.log('\n========================================');
  console.log('PROBANDO: GetDoctores');
  console.log('========================================\n');
  
  try {
    const doctores = await getDoctores();
    console.log('Respuesta de DriCloud:');
    console.log(JSON.stringify(doctores, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
  
  console.log('\n========================================\n');
}

testDriCloud().catch(console.error);
