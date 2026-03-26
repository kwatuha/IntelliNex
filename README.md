# IntelliNex - Hospital Management Information System (generic platform)

A comprehensive Hospital Management Information System built with Next.js, TypeScript, and Tailwind CSS.

## Branding model

- **IntelliNex**: generic platform name (default)
- **Kiplombe**: specific app/deployment brand (configurable via env)

## Features

- **Role-based Authentication**: Secure login system with different user roles
- **Modern UI**: Beautiful, responsive interface with dark/light mode support
- **Comprehensive Modules**: Patient management, appointments, billing, pharmacy, laboratory, and more
- **Real-time Updates**: Live queue management and patient tracking
- **Accessibility**: WCAG compliant design with keyboard navigation support

## Login System

The application includes a local authentication system with the following user roles:

### Demo Credentials

| Role | Username | Password |
|------|----------|----------|
| Administrator | `admin` | `admin123` |
| Doctor | `doctor` | `doctor123` |
| Nurse | `nurse` | `nurse123` |
| Lab Technician | `lab` | `lab123` |
| Registration | `registration` | `reg123` |
| Billing | `billing` | `billing123` |
| Pharmacy | `pharmacy` | `pharmacy123` |

### User Roles and Permissions

- **Administrator**: Full access to all modules
- **Doctor**: Patient management, medical records, prescriptions, lab orders
- **Nurse**: Patient care, vital signs, medication administration
- **Lab Technician**: Laboratory tests, results management
- **Registration**: Patient registration and basic information
- **Billing**: Financial management, invoicing
- **Pharmacy**: Medication management, prescriptions

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   # or
   pnpm install
   ```

2. **Run Development Server**
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

3. **Open Application**
   Navigate to [http://localhost:3100](http://localhost:3100)

4. **Login**
   Use any of the demo credentials above to access the system

## Project Structure

```
transelgon/
├── app/                    # Next.js app directory
│   ├── login/             # Login page
│   ├── logout/            # Logout page
│   └── [modules]/         # Various HMIS modules
├── components/            # Reusable UI components
│   ├── ui/               # Base UI components
│   └── [feature]/        # Feature-specific components
├── lib/                  # Utilities and services
│   ├── auth/            # Authentication logic
│   └── data/            # Local data storage
└── public/              # Static assets
```

## Authentication Flow

1. **Login**: Users enter credentials on `/login`
2. **Validation**: Credentials are validated against local JSON data
3. **Token Generation**: A simple token is generated and stored in localStorage
4. **Protected Routes**: All routes are protected and require authentication
5. **Logout**: Users can logout via the header dropdown menu

## Future Enhancements

- [ ] Server-side authentication with JWT
- [ ] Database integration
- [ ] Real-time notifications
- [ ] Advanced reporting
- [ ] Mobile app support
- [ ] API endpoints for external integrations

## Technologies Used

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI + shadcn/ui
- **Icons**: Lucide React
- **Charts**: Recharts
- **State Management**: React Context API

## Contributing

This repo is the IntelliNex platform codebase. For production use, additional security measures and backend integration would be required.

## Contact Information

- **Address:** P. O. Box 8407 - 30100, ELDORET
- **Physical Location:** Along Eldoret-Kiplombe Road, B&E Eagle House
- **Telephone:** 0116695005
- **Email:** mbemedicalcentre@gmail.com
- **Tagline:** For Quality Healthcare Service Delivery

## License

This project is for demonstration purposes only. 