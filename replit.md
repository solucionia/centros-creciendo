# Centro Creciendo Medical Appointment System

## Overview

Centro Creciendo is a comprehensive medical appointment booking system designed for a healthcare clinic specializing in both pediatric and adult medicine. The application provides a streamlined interface for patients to schedule appointments with doctors, view availability, and manage their medical appointments. The system features a modern, user-friendly design with distinct visual treatments for pediatric and adult specialties, ensuring an appropriate experience for different patient demographics.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for fast development and building
- **Routing**: Wouter for lightweight client-side routing
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design system for medical aesthetics
- **State Management**: TanStack Query for server state management and caching
- **Forms**: React Hook Form with Zod validation for type-safe form handling

### Backend Architecture
- **Framework**: Express.js with TypeScript for RESTful API endpoints
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Session Management**: Express sessions with connect-pg-simple for persistent storage
- **Development**: Hot module replacement and development server integration with Vite

### Data Storage Solutions
- **Primary Database**: PostgreSQL hosted on Neon for production reliability
- **ORM**: Drizzle ORM for type-safe database queries and migrations
- **Schema Design**: Three main entities - Users, Doctors, and Appointments with appropriate relationships
- **Development Storage**: In-memory storage implementation for testing and development

### Authentication and Authorization
- **Session-based Authentication**: Express sessions for user state management
- **Password Security**: Secure password handling for user accounts
- **Authorization**: Role-based access control for different user types

### Component Design System
- **Design Language**: Medical-focused color palette with blue and green primary colors
- **Specialty Differentiation**: Color-coded interface elements for pediatric vs adult medicine
- **Typography**: Inter font family for medical-grade readability
- **Layout System**: Consistent spacing using Tailwind's utility classes
- **Interactive Elements**: Hover states and elevation effects for improved user experience

## External Dependencies

### UI and Styling
- **Radix UI**: Comprehensive component primitives for accessible UI elements
- **Tailwind CSS**: Utility-first CSS framework for rapid styling
- **shadcn/ui**: Pre-built component library with consistent design patterns
- **Lucide React**: Icon library for consistent iconography

### Database and ORM
- **@neondatabase/serverless**: Serverless PostgreSQL database driver
- **Drizzle ORM**: Type-safe ORM for database operations and migrations
- **connect-pg-simple**: PostgreSQL session store for Express

### Development and Build Tools
- **Vite**: Fast build tool and development server
- **TypeScript**: Type safety across the entire application
- **ESBuild**: Fast JavaScript bundler for production builds

### Data Management
- **TanStack Query**: Server state management and caching
- **React Hook Form**: Form state management and validation
- **Zod**: Runtime type validation for forms and API data
- **date-fns**: Date manipulation and formatting utilities

### Additional Integrations
- **Embla Carousel**: Touch-friendly carousel components
- **Class Variance Authority**: Dynamic className generation for component variants
- **CMDK**: Command palette functionality for enhanced user experience