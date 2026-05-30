require('./config/load-env');
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import route groups
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const patientRoutes = require('./routes/patientRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const queueRoutes = require('./routes/queueRoutes');
const billingRoutes = require('./routes/billingRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const pharmacyRoutes = require('./routes/pharmacyRoutes');
const externalChemistRoutes = require('./routes/externalChemistRoutes');
const laboratoryRoutes = require('./routes/laboratoryRoutes');
const radiologyRoutes = require('./routes/radiologyRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const patientAllergiesRoutes = require('./routes/patientAllergiesRoutes');
const patientFamilyHistoryRoutes = require('./routes/patientFamilyHistoryRoutes');
const patientDocumentsRoutes = require('./routes/patientDocumentsRoutes');
const clinicalServicesRoutes = require('./routes/clinicalServicesRoutes');
const doctorsRoutes = require('./routes/doctorsRoutes');
const inpatientRoutes = require('./routes/inpatientRoutes');
const maternityRoutes = require('./routes/maternityRoutes');
const icuRoutes = require('./routes/icuRoutes');
const triageRoutes = require('./routes/triageRoutes');
const workflowRoutes = require('./routes/workflowRoutes');
const medicalRecordsRoutes = require('./routes/medicalRecordsRoutes');
const nursingRoutes = require('./routes/nursingRoutes');
const ledgerRoutes = require('./routes/ledgerRoutes');
const vendorRoutes = require('./routes/vendorRoutes');
const purchaseOrderRoutes = require('./routes/purchaseOrderRoutes');
const vendorProductsRoutes = require('./routes/vendorProductsRoutes');
const vendorContractsRoutes = require('./routes/vendorContractsRoutes');
const vendorDocumentsRoutes = require('./routes/vendorDocumentsRoutes');
const vendorIssuesRoutes = require('./routes/vendorIssuesRoutes');
const inventoryTransactionRoutes = require('./routes/inventoryTransactionRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const employeeLeaveRoutes = require('./routes/employeeLeaveRoutes');
const employeePayrollRoutes = require('./routes/employeePayrollRoutes');
const employeePromotionRoutes = require('./routes/employeePromotionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const roleRoutes = require('./routes/roleRoutes');
const privilegeRoutes = require('./routes/privilegeRoutes');
const roleMenuRoutes = require('./routes/roleMenuRoutes');
const payableRoutes = require('./routes/payableRoutes');
const receivableRoutes = require('./routes/receivableRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const cashRoutes = require('./routes/cashRoutes');
const assetRoutes = require('./routes/assetRoutes');
const insuranceRoutes = require('./routes/insuranceRoutes');
const revenueShareRoutes = require('./routes/revenueShareRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const diagnosesRoutes = require('./routes/diagnosesRoutes');
const proceduresRoutes = require('./routes/proceduresRoutes');
const ambulanceRoutes = require('./routes/ambulanceRoutes');
const waiverRoutes = require('./routes/waiverRoutes');
const mohReportsRoutes = require('./routes/mohReportsRoutes');
const telemedicineRoutes = require('./routes/telemedicineRoutes');

const authenticate = require('./middleware/authenticate');

const appName = process.env.APP_NAME || 'IntelliNex';
const port = process.env.PORT || 3001;
const app = express();

// CORS configuration
// In production, allow requests from the server IP on common ports
const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    const origins = []
    const serverIP = process.env.FRONTEND_URL?.replace(/^https?:\/\//, '').split(':')[0] || '41.89.173.8'
    // Allow requests from the server IP on ports 80, 8081, and any port specified in FRONTEND_URL
    origins.push(`http://${serverIP}`)
    origins.push(`http://${serverIP}:80`)
    origins.push(`http://${serverIP}:8081`)
    if (process.env.FRONTEND_URL) {
      origins.push(process.env.FRONTEND_URL)
    }
    return origins
  }
  // In development, allow any localhost port (cannot use '*' with credentials: true)
  return ['__ALLOW_ANY_LOCALHOST_PORT__']
}

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    if (
      process.env.NODE_ENV !== 'production' &&
      allowedOrigins.includes('__ALLOW_ANY_LOCALHOST_PORT__') &&
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    ) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        message: `Welcome to ${appName} API`,
        version: '1.0.0',
        status: 'running'
    });
});

// Public routes (no authentication required)
app.use('/api/auth', authRoutes);

// Development: Temporarily disable auth for all routes
// TODO: Re-enable authentication in production
// Authentication will be implemented later
// if (process.env.NODE_ENV === 'production') {
//   app.use('/api', authenticate);
// } else {
//   // In development, only protect sensitive routes
//   app.use('/api/users', authenticate);
// }

// API routes
app.use('/api/users', userRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/payables', payableRoutes);
app.use('/api/receivables', receivableRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/cash', cashRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/revenue-share', revenueShareRoutes);
// IMPORTANT: More specific routes must come before generic routes
app.use('/api/inventory/transactions', inventoryTransactionRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/pharmacy', externalChemistRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/laboratory', laboratoryRoutes);
app.use('/api/radiology', radiologyRoutes);
app.use('/api/inpatient', inpatientRoutes);
app.use('/api/maternity', maternityRoutes);
app.use('/api/icu', icuRoutes);
app.use('/api/triage', triageRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/nursing', nursingRoutes);
app.use('/api/telemedicine', telemedicineRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/roles', roleMenuRoutes); // Role menu/tab configuration routes
app.use('/api/privileges', privilegeRoutes);
// Employee sub-routes must come before main employee routes
app.use('/api/employees', employeeLeaveRoutes);
app.use('/api/employees', employeePayrollRoutes);
app.use('/api/employees', employeePromotionRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/patients', patientAllergiesRoutes);
app.use('/api/patients', patientFamilyHistoryRoutes);
app.use('/api/patients', patientDocumentsRoutes);
app.use('/api/clinical-services', clinicalServicesRoutes);
app.use('/api/doctors', doctorsRoutes);
app.use('/api/medical-records', medicalRecordsRoutes);
app.use('/api/diagnoses', diagnosesRoutes);
app.use('/api/procedures', proceduresRoutes);
app.use('/api/ambulance', ambulanceRoutes);
app.use('/api/waivers', waiverRoutes);
app.use('/api/moh-reports', mohReportsRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/procurement/purchase-orders', purchaseOrderRoutes);
// Vendor sub-routes must be mounted with more specific paths BEFORE main vendor routes to avoid route conflicts
// These routes use /:vendorId/products pattern, so they need to be checked before /:id pattern
app.use('/api/procurement/vendors', vendorProductsRoutes);
app.use('/api/procurement/vendors', vendorContractsRoutes);
app.use('/api/procurement/vendors', vendorDocumentsRoutes);
app.use('/api/procurement/vendors', vendorIssuesRoutes);
// Main vendor routes (/:id, /:id/ratings) - must come after sub-routes
app.use('/api/procurement/vendors', vendorRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.stack : {}
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

app.listen(port, () => {
    console.log(`${appName} API server running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;

