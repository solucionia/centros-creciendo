// Automatización de DriCloud adaptada para CitaFacil
interface PatientData {
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  patientAge: number;
  notes?: string;
}

interface DoctorSpecialty {
  pediatric: string;
  adult: string;
  family: string;
}

const SPECIALTY_MAPPING: DoctorSpecialty = {
  pediatric: "PEDIATRÍA",
  adult: "MEDICINA GENERAL", 
  family: "MEDICINA FAMILIAR"
};

export class DriCloudAutomation {
  private dricloudWindow: Window | null = null;
  private patientData: PatientData;
  private specialty: string;
  private readonly DRICLOUD_URL = "https://citaonline.dricloud.net/?URL=dricloud_creciendomirasierra_20627620#";

  constructor(patientData: PatientData, doctorSpecialty: keyof DoctorSpecialty) {
    this.patientData = patientData;
    this.specialty = SPECIALTY_MAPPING[doctorSpecialty] || "MEDICINA GENERAL";
  }

  async startAutomation(): Promise<void> {
    console.log("🏥 Iniciando automatización DriCloud");
    console.log("📊 Datos del paciente:", this.patientData);
    console.log("🎯 Especialidad:", this.specialty);

    // Abrir DriCloud en nueva ventana
    this.dricloudWindow = window.open(
      this.DRICLOUD_URL,
      'dricloud_automation',
      'width=1200,height=800,scrollbars=yes,resizable=yes'
    );

    if (!this.dricloudWindow) {
      throw new Error('No se pudo abrir la ventana de DriCloud. Por favor, permite pop-ups para este sitio.');
    }

    // Enfocar la ventana
    this.dricloudWindow.focus();

    // Configurar la automatización en la nueva ventana
    await this.setupAutomationInWindow();
  }

  private async setupAutomationInWindow(): Promise<void> {
    if (!this.dricloudWindow) return;

    // Esperar a que cargue la página
    await this.waitForWindowLoad();

    // Inyectar el script de automatización
    const automationScript = this.generateAutomationScript();
    
    const script = this.dricloudWindow.document.createElement('script');
    script.textContent = automationScript;
    this.dricloudWindow.document.head.appendChild(script);

    // Iniciar la automatización
    (this.dricloudWindow as any).startDriCloudAutomation(this.patientData, this.specialty);
  }

  private async waitForWindowLoad(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.dricloudWindow) {
        resolve();
        return;
      }

      const checkLoad = () => {
        if (this.dricloudWindow?.document.readyState === 'complete') {
          setTimeout(resolve, 2000); // Esperar 2 segundos adicionales
        } else {
          setTimeout(checkLoad, 500);
        }
      };

      checkLoad();
    });
  }

  private generateAutomationScript(): string {
    return `
      window.startDriCloudAutomation = async function(patientData, specialty) {
        console.log("🤖 Automatización DriCloud iniciada");
        
        // Crear indicador visual
        const indicator = document.createElement('div');
        indicator.style.cssText = \`
          position: fixed; top: 15px; left: 50%; transform: translateX(-50%);
          background: linear-gradient(45deg, #e74c3c, #c0392b);
          color: white; padding: 15px 30px; border-radius: 25px;
          font-weight: bold; z-index: 999999; font-size: 16px;
          box-shadow: 0 6px 20px rgba(231, 76, 60, 0.4);
          border: 3px solid white; text-align: center;
        \`;
        indicator.innerHTML = '🤖 AUTOMATIZACIÓN CITAFACIL EN PROCESO<br><small>No cierres esta ventana</small>';
        document.body.appendChild(indicator);

        // Función para buscar elementos con texto
        function findElementWithText(text, tagNames = ['button', 'a', 'input', 'div']) {
          for (const tagName of tagNames) {
            const elements = document.getElementsByTagName(tagName);
            for (const element of elements) {
              const textContent = element.textContent || element.value || '';
              if (textContent.toLowerCase().includes(text.toLowerCase())) {
                return element;
              }
            }
          }
          return null;
        }

        // Función para hacer clic seguro
        function safeClick(element) {
          if (element && element.offsetParent !== null && !element.disabled) {
            element.click();
            return true;
          }
          return false;
        }

        // Función para rellenar campo
        function fillField(element, value) {
          if (element && value) {
            element.value = value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          return false;
        }

        try {
          console.log("🚀 Iniciando proceso automatizado...");
          
          // Esperar a que cargue la página
          await new Promise(resolve => setTimeout(resolve, 3000));

          // PASO 1: Buscar botón "Reservar cita"
          console.log("📋 PASO 1: Buscando botón 'Reservar cita'...");
          let reservarButton = findElementWithText('reservar');
          if (reservarButton && safeClick(reservarButton)) {
            console.log("✅ Clic en botón reservar");
          } else {
            // Fallback: buscar cualquier botón principal
            const buttons = document.querySelectorAll('button, .btn');
            for (const button of buttons) {
              if (button.offsetParent !== null && !button.disabled) {
                safeClick(button);
                console.log("✅ Clic en primer botón disponible");
                break;
              }
            }
          }

          await new Promise(resolve => setTimeout(resolve, 3000));

          // PASO 2: Seleccionar especialidad
          console.log("📋 PASO 2: Seleccionando especialidad: " + specialty);
          let especialidadButton = findElementWithText('seleccionar');
          if (especialidadButton) {
            const textContent = especialidadButton.textContent || '';
            if (!textContent.toLowerCase().includes('más info')) {
              safeClick(especialidadButton);
              console.log("✅ Especialidad seleccionada");
            }
          }

          await new Promise(resolve => setTimeout(resolve, 3000));

          // PASO 3: Seleccionar doctor/horario
          console.log("📋 PASO 3: Seleccionando doctor/horario...");
          let doctorButton = findElementWithText('seleccionar');
          if (doctorButton) {
            const textContent = doctorButton.textContent || '';
            if (!textContent.toLowerCase().includes('más info')) {
              safeClick(doctorButton);
              console.log("✅ Doctor/horario seleccionado");
            }
          }

          await new Promise(resolve => setTimeout(resolve, 3000));

          // PASO 4: Rellenar formulario
          console.log("📝 Rellenando formulario de paciente...");
          
          // Buscar campos por atributos comunes
          const nameField = document.querySelector('input[name*="nombre"], #nombre, input[placeholder*="nombre"]');
          const surnameField = document.querySelector('input[name*="apellido"], #apellidos, input[placeholder*="apellido"]');
          const emailField = document.querySelector('input[type="email"], input[name*="email"], #email');
          const phoneField = document.querySelector('input[type="tel"], input[name*="telefono"], #telefono, input[placeholder*="teléfono"]');
          const notesField = document.querySelector('textarea[name*="observacion"], textarea[name*="comentario"], #comentarios');

          const nameParts = patientData.patientName.split(' ');
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';

          fillField(nameField, firstName);
          fillField(surnameField, lastName);
          fillField(emailField, patientData.patientEmail);
          fillField(phoneField, patientData.patientPhone);
          fillField(notesField, patientData.notes || '');

          console.log("✅ Formulario rellenado");
          await new Promise(resolve => setTimeout(resolve, 2000));

          // PASO 5: Confirmar cita
          console.log("📋 PASO 5: Confirmando cita...");
          let confirmarButton = findElementWithText('confirmar') || 
                               findElementWithText('reservar') ||
                               document.querySelector('input[type="submit"], button[type="submit"]');
          
          if (confirmarButton && safeClick(confirmarButton)) {
            console.log("✅ Cita confirmada");
          }

          // Actualizar indicador
          indicator.style.background = 'linear-gradient(45deg, #27ae60, #2ecc71)';
          indicator.innerHTML = '✅ AUTOMATIZACIÓN COMPLETADA<br><small>Revisa la confirmación en DriCloud</small>';

          console.log("🎉 Automatización completada exitosamente");

        } catch (error) {
          console.error("❌ Error en automatización:", error);
          
          // Mostrar error en indicador
          indicator.style.background = 'linear-gradient(45deg, #f39c12, #e67e22)';
          indicator.innerHTML = '⚠️ AUTOMATIZACIÓN MANUAL REQUERIDA<br><small>Completa manualmente en DriCloud</small>';
        }
      };
    `;
  }

  public close(): void {
    if (this.dricloudWindow && !this.dricloudWindow.closed) {
      this.dricloudWindow.close();
    }
  }
}

export const startDriCloudReservation = async (
  patientData: PatientData, 
  doctorSpecialty: keyof DoctorSpecialty
): Promise<void> => {
  try {
    const automation = new DriCloudAutomation(patientData, doctorSpecialty);
    await automation.startAutomation();
  } catch (error) {
    console.error("Error en automatización DriCloud:", error);
    throw error;
  }
};