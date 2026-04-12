# Kiplombe Medical Centre HMIS API

Backend API server for Kiplombe Medical Centre Hospital Management Information System.

## Features

- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **User Management**: Complete user CRUD operations with role assignment
- **Patient Management**: Patient registration and management
- **Appointment System**: Appointment scheduling and management
- **Queue Management**: Patient queue system for different service points
- **Billing**: Service charges and invoice management
- **Inventory**: Medical supplies and equipment tracking
- **MySQL Database**: Robust database schema with proper relationships

## Prerequisites

- Node.js (v16 or higher)
- MySQL (v8.0 or higher)
- npm or yarn

## Setup Instructions

### 1. Install Dependencies

```bash
cd api
npm install
```

### 2. Database Setup

**Copy production data to local (Docker MySQL)** — see the repo guide:

- [`deploy/SYNC_REMOTE_TO_LOCAL.md`](../deploy/SYNC_REMOTE_TO_LOCAL.md) — dump from `41.89.173.8`, restore locally, run migrations.

1. Create MySQL database:
```sql
CREATE DATABASE kiplombe_hmis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. Run the schema file:
```bash
mysql -u root -p kiplombe_hmis < database/schema.sql
```

Or using MySQL client:
```sql
source database/schema.sql;
```

### 3. Environment Configuration

Create a `.env` file in the `api` directory:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=kiplombe_hmis
DB_PORT=3306

# Connection pool (optional; defaults in config/db.js)
# DB_POOL_SIZE=20
# DB_POOL_QUEUE_LIMIT=50
# DB_POOL_ACQUIRE_TIMEOUT_MS=15000

# JWT Secret (change this in production!)
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production

# Server Configuration
PORT=3001
NODE_ENV=development

# API Base URL
API_BASE_URL=http://localhost:3001
```

**Telemedicine (Zoom link mode)** – No Zoom API credentials or `DAILY_*` variables are required. **Create the tables once.**

**Docker (MySQL container `kiplombe_mysql`)** — matches `docker-compose.yml` defaults (`kiplombe_user` / `kiplombe_password` / `kiplombe_hmis`):

```bash
cd api
npm run migrate:telemedicine:docker
```

Or: `bash api/scripts/run-telemedicine-migration-docker.sh`

To use **`mysql` root** (e.g. `-uroot -proot_password` like `docker-compose`):

```bash
MYSQL_TELEMEDICINE_USE_ROOT=1 MYSQL_ROOT_PASSWORD=root_password bash api/scripts/run-telemedicine-migration-docker.sh
```

**Production server (SSH from your laptop):** apply 40–43 on `41.89.173.8` with `deploy/run-telemedicine-migrations-remote.sh` — see `deploy/DATABASE_REMOTE_WORKFLOW.md`.

**Local MySQL** (uses `api/.env` `DB_*`):

```bash
cd api
npm run migrate:telemedicine
```

Or manually: `mysql -u USER -p kiplombe_hmis < database/migrations/40_telemedicine_sessions_schema.sql`

Clinicians paste the meeting join URL from the Zoom app into HMIS; the API only stores metadata and consent.

**Per-user defaults:** `user_telemedicine_settings` stores optional `defaultZoomJoinUrl` / `defaultZoomPassword` per `userId`. `GET/PUT /api/telemedicine/my-defaults` — new sessions copy the **doctor’s** defaults when the create request omits a link.

**One active session per patient:** `POST /api/telemedicine/sessions` looks for an existing row with `status <> 'ended'` for the same `patientId`. If found, it returns **200** with `reusedExistingSession: true` and the same `sessionId` (so nurses and other providers join the same meeting). A new row is created only when there is no active visit. Optional body `forceNew: true` skips reuse and inserts another session (use sparingly; can create overlapping visits).

**New visit requires saved defaults:** A **new** `INSERT` (no active session to reuse) requires the **logged-in user** to have a non-empty `defaultZoomJoinUrl` in `user_telemedicine_settings` (Telemedicine → My Zoom defaults). If not, **403** with `code: TELEMEDICINE_ZOOM_DEFAULTS_REQUIRED`. Reusing an active session does not require this. Staff without defaults join via **Join in HMIS** on the facility telemedicine board.

### 4. Start the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The API will be available at `http://localhost:3001`

## API Endpoints

### Authentication

- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/verify` - Verify token

### Users

- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (soft delete)
- `PUT /api/users/:id/password` - Change password

### Patients

- `GET /api/patients` - Get all patients (with search and pagination)
- `GET /api/patients/:id` - Get patient by ID
- `POST /api/patients` - Create new patient
- `PUT /api/patients/:id` - Update patient

### Appointments

- `GET /api/appointments` - Get all appointments (with filters)
- `GET /api/appointments/:id` - Get appointment by ID
- `POST /api/appointments` - Create new appointment
- `PUT /api/appointments/:id` - Update appointment

### Queue

- `GET /api/queue` - Get queue entries
- `POST /api/queue` - Add patient to queue
- `PUT /api/queue/:id/status` - Update queue status

### Billing

- `GET /api/billing/charges` - Get service charges
- `POST /api/billing/charges` - Create service charge
- `GET /api/billing/invoices` - Get invoices

### Inventory

- `GET /api/inventory` - Get inventory items
- `POST /api/inventory` - Create inventory item

## Authentication

All protected routes require a JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## Default Admin User

After running the schema, a default admin user is created:

- **Username**: `admin`
- **Password**: `admin123`
- **Email**: `admin@kiplombe.com`

**⚠️ IMPORTANT**: Change the default admin password immediately in production!

## Database Schema

The database includes the following main tables:

- `users` - System users
- `roles` - User roles
- `privileges` - System privileges
- `role_privileges` - Role-privilege mapping
- `patients` - Patient records
- `appointments` - Appointment scheduling
- `queue_entries` - Queue management
- `service_charges` - Billing charges
- `invoices` - Patient invoices
- `invoice_items` - Invoice line items
- `inventory_items` - Inventory management
- `medical_records` - Patient medical records

## Development

### Project Structure

```
api/
├── config/
│   └── db.js              # Database configuration
├── middleware/
│   └── authenticate.js     # JWT authentication middleware
├── routes/
│   ├── authRoutes.js      # Authentication routes
│   ├── userRoutes.js      # User management routes
│   ├── patientRoutes.js   # Patient routes
│   ├── appointmentRoutes.js
│   ├── queueRoutes.js
│   ├── billingRoutes.js
│   └── ...
├── database/
│   └── schema.sql         # Database schema
├── app.js                 # Main application file
└── package.json
```

## Security Notes

1. **JWT Secret**: Always use a strong, random JWT secret in production
2. **Password Hashing**: Passwords are hashed using bcrypt
3. **SQL Injection**: All queries use parameterized statements
4. **CORS**: Configure CORS properly for production
5. **Environment Variables**: Never commit `.env` file to version control

## Troubleshooting

### Database Connection Issues

- Verify MySQL is running
- Check database credentials in `.env`
- Ensure database exists: `SHOW DATABASES;`
- Test connection: `mysql -u root -p`

### Port Already in Use

Change the port in `.env` file or kill the process using the port:
```bash
lsof -ti:3001 | xargs kill
```

## Next Steps

1. Implement remaining routes (pharmacy, laboratory, radiology)
2. Add input validation and sanitization
3. Implement file upload functionality
4. Add comprehensive error handling
5. Add API documentation (Swagger/OpenAPI)
6. Add unit and integration tests
7. Set up logging and monitoring

## License

This project is for Kiplombe Medical Centre use only.

