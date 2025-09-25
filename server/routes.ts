import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertDoctorSchema, insertAppointmentSchema } from "@shared/schema";
import { z } from "zod";
import { executeDriCloudAutomation } from "./dricloud-automation";

export async function registerRoutes(app: Express): Promise<Server> {
  // Doctor routes
  app.get('/api/doctors', async (req, res) => {
    try {
      const doctors = await storage.getDoctors();
      res.json(doctors);
    } catch (error) {
      console.error('Error fetching doctors:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/doctors/:id', async (req, res) => {
    try {
      const doctor = await storage.getDoctor(req.params.id);
      if (!doctor) {
        return res.status(404).json({ error: 'Doctor not found' });
      }
      res.json(doctor);
    } catch (error) {
      console.error('Error fetching doctor:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/doctors', async (req, res) => {
    try {
      const validatedData = insertDoctorSchema.parse(req.body);
      const doctor = await storage.createDoctor(validatedData);
      res.status(201).json(doctor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid data', details: error.errors });
      }
      console.error('Error creating doctor:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Appointment routes
  app.get('/api/appointments', async (req, res) => {
    try {
      const { date, doctorId } = req.query;
      let appointments;
      
      if (date) {
        const queryDate = new Date(date as string);
        // Check if date is valid
        if (isNaN(queryDate.getTime())) {
          return res.status(400).json({ error: 'Invalid date format' });
        }
        appointments = await storage.getAppointmentsByDate(queryDate);
      } else if (doctorId) {
        // Verify doctor exists when filtering by doctorId
        const doctor = await storage.getDoctor(doctorId as string);
        if (!doctor) {
          return res.status(404).json({ error: 'Doctor not found' });
        }
        appointments = await storage.getAppointmentsByDoctor(doctorId as string);
      } else {
        appointments = await storage.getAppointments();
      }
      
      res.json(appointments);
    } catch (error) {
      console.error('Error fetching appointments:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/appointments', async (req, res) => {
    try {
      // Parse and convert appointmentDate from ISO string to Date object
      const requestData = { 
        ...req.body, 
        appointmentDate: new Date(req.body.appointmentDate) 
      };
      
      const validatedData = insertAppointmentSchema.parse(requestData);
      
      // Verify doctor exists
      const doctor = await storage.getDoctor(validatedData.doctorId);
      if (!doctor) {
        return res.status(404).json({ error: 'Doctor not found' });
      }
      
      const appointment = await storage.createAppointment(validatedData);
      
      // Return appointment with doctor info for consistency with GET routes
      const appointmentWithDoctor = { ...appointment, doctor };
      res.status(201).json(appointmentWithDoctor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid data', details: error.errors });
      }
      console.error('Error creating appointment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/appointments/:id/cancel', async (req, res) => {
    try {
      const cancelled = await storage.cancelAppointment(req.params.id);
      if (!cancelled) {
        return res.status(404).json({ error: 'Appointment not found' });
      }
      res.json({ message: 'Appointment cancelled successfully' });
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DriCloud automation endpoint
  app.post('/api/dricloud/automate', async (req, res) => {
    try {
      const { patientData, doctorSpecialty } = req.body;
      
      if (!patientData || !doctorSpecialty) {
        return res.status(400).json({ error: 'Missing required data' });
      }

      console.log('🤖 Iniciando automatización DriCloud desde servidor');
      console.log('📊 Datos recibidos:', { patientData, doctorSpecialty });
      
      const result = await executeDriCloudAutomation(patientData, doctorSpecialty);
      
      res.json({ 
        success: true, 
        message: result,
        status: 'completed'
      });
    } catch (error) {
      console.error('❌ Error en automatización DriCloud:', error);
      res.status(500).json({ 
        error: 'Error en automatización DriCloud',
        message: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
