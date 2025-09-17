# Design Guidelines for Centro Creciendo Medical Appointment System

## Design Approach
**Reference-Based Approach**: Drawing inspiration from modern healthcare platforms like Zocdoc and Calendly, combined with the clean aesthetics of medical interfaces. The design prioritizes usability and trust-building for a medical context.

## Core Design Elements

### Color Palette
**Primary Colors:**
- Medical Blue: 200 85% 45% (professional, trustworthy)
- Soft Green: 150 60% 55% (healing, wellness)

**Supporting Colors:**
- Pediatric Accent: 280 70% 70% (gentle purple for children's sections)
- Adult Accent: 210 50% 60% (mature blue-gray for adult sections)
- Warning: 25 90% 60% (for urgent slots)
- Success: 140 60% 50% (confirmation states)

**Neutral Palette:**
- Text Primary: 220 15% 25%
- Text Secondary: 220 10% 50%
- Background: 0 0% 98%
- Surface: 0 0% 100%

### Typography
- **Primary Font**: Inter (Google Fonts) - clean, medical-grade readability
- **Headings**: 600-700 weight, sizes from text-lg to text-3xl
- **Body Text**: 400-500 weight, text-sm to text-base
- **UI Elements**: 500 weight for buttons and labels

### Layout System
**Spacing Units**: Consistently use Tailwind units of 2, 4, 6, 8, and 12 for all spacing (padding, margins, gaps)
- Tight spacing: 2-4 units for form elements
- Medium spacing: 6-8 units between sections
- Large spacing: 12 units for major layout breaks

## Component Library

### Calendar Interface
- **Week/Month Grid**: Large, clickable time slots with clear visual hierarchy
- **Doctor Cards**: Compact profile cards with photo, specialty, and availability indicators
- **Time Slots**: Color-coded by doctor and specialty (pediatric vs adult)
- **Availability States**: Available (solid color), Partially booked (striped), Unavailable (grayed)

### Navigation & Forms
- **Tab System**: Seamless switching between pediatric and adult views
- **Form Fields**: Soft rounded corners (rounded-lg), generous padding (p-4)
- **Buttons**: Primary (filled), Secondary (outline with blur on images), Ghost for subtle actions
- **Progress Indicators**: Step-based booking flow with clear visual progression

### Data Display
- **Doctor Profiles**: Avatar, name, specialty badge, rating/reviews if available
- **Appointment Cards**: Time, duration, doctor, specialty clearly displayed
- **Confirmation Screens**: Summary cards with all booking details

### Interactive Elements
- **Hover States**: Subtle elevation and color shifts for appointment slots
- **Selection States**: Clear visual feedback with border highlights and fill changes
- **Loading States**: Skeleton screens for calendar loading, spinner for form submission

## Visual Treatment
- **Gradients**: Subtle gradients from primary to lighter variants for hero sections
- **Shadows**: Soft drop shadows (shadow-sm to shadow-lg) for card elevation
- **Borders**: Minimal use, primarily for form fields and selected states
- **Icons**: Heroicons for consistent medical and interface iconography

## Responsive Behavior
- **Mobile-First**: Calendar switches to vertical scrolling list view on mobile
- **Touch-Friendly**: Minimum 44px touch targets for all interactive elements
- **Desktop Enhancement**: Side-by-side doctor and calendar views on larger screens

## Accessibility & Trust
- **High Contrast**: WCAG AA compliance for all text and interactive elements
- **Medical Confidence**: Professional color choices, clear typography, generous whitespace
- **Error Prevention**: Real-time availability updates, clear validation messages
- **Privacy Indicators**: Secure form indicators and HIPAA compliance messaging