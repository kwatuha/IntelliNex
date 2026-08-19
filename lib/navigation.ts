import {
  Activity,
  Calendar,
  ClipboardList,
  FileText,
  Home,
  Pill,
  Settings,
  Users,
  CreditCard,
  BarChart3,
  Building2,
  Stethoscope,
  BedDouble,
  Baby,
  HeartPulse,
  ShoppingCart,
  DollarSign,
  UserCog,
  Boxes,
  Receipt,
  Clipboard,
  FlaskConical,
  ImageIcon,
  Package,
  Grid,
  PlusCircle,
  Layers,
  ListOrdered,
  UserPlus,
  MapPin,
  Shield,
  Bell,
  History,
  Store,
  Ambulance,
  Video,
  Truck,
  Smartphone,
  Brain,
  Droplets,
} from "lucide-react"

export interface NavigationItem {
  title: string
  href: string
  icon: any
  description?: string
  /** Optional sidebar subgroup (e.g. Clinical Services) — renders as a collapsible section */
  group?: string
}

/** Order for clinical-services groups in the sidebar (collapsible sections) */
export const CLINICAL_SIDEBAR_GROUP_ORDER = [
  "Outpatient & diagnostics",
  "Wards & beds",
  "Support & outreach",
] as const

/** Order for financial-management groups in the sidebar */
export const FINANCIAL_SIDEBAR_GROUP_ORDER = [
  "Ledger & reporting",
  "Payables & receivables",
  "Planning & assets",
  "Billing & insurance",
] as const

export interface NavigationCategory {
  id: string
  title: string
  icon: any
  description: string
  items: NavigationItem[]
}

export const navigationCategories: NavigationCategory[] = [
  {
    id: "overview",
    title: "Dashboard",
    icon: Home,
    description: "Main dashboard and overview sections",
    items: [
      {
        title: "Dashboard",
        icon: Home,
        href: "/",
      },
      {
        title: "Departments",
        href: "/departments",
        icon: Building2,
      },
      {
        title: "Analytics",
        icon: BarChart3,
        href: "/analytics",
      },
      {
        title: "Regional Dashboard",
        icon: MapPin,
        href: "/regional-dashboard",
      },
      {
        title: "Facility Performance",
        icon: Building2,
        href: "/facility-performance",
        description: "Compare patients, queues, revenue and stock across hospital branches",
      },
    ],
  },
  {
    id: "patient-care",
    title: "Patient Care",
    icon: Users,
    description: "Patient management and care services",
    items: [
      {
        title: "Patient Registration",
        icon: Users,
        href: "/patients",
      },
      {
        title: "Triaging",
        icon: Activity,
        href: "/triaging",
      },
      {
        title: "Appointments",
        icon: Calendar,
        href: "/appointments",
      },
      {
        title: "Queue Management",
        icon: ListOrdered,
        href: "/queue",
      },
      {
        title: "Medical Records",
        icon: FileText,
        href: "/medical-records",
      },
    ],
  },
  {
    id: "clinical-services",
    title: "Clinical Services",
    icon: Stethoscope,
    description: "Clinical departments and services",
    items: [
      {
        title: "Doctors Module",
        icon: Stethoscope,
        href: "/doctors",
        group: "Outpatient & diagnostics",
      },
      {
        title: "Specialist Clinics",
        icon: Brain,
        href: "/specialist-clinics",
        description: "Neurosurgery, cardiology, ENT, ophthalmology, dental, and other specialist services",
        group: "Outpatient & diagnostics",
      },
      {
        title: "Pharmacy",
        icon: Pill,
        href: "/pharmacy",
        group: "Outpatient & diagnostics",
      },
      {
        title: "Chemist Referrals",
        icon: Store,
        href: "/chemist/referrals",
        description: "External chemist portal for referred prescriptions",
        group: "Outpatient & diagnostics",
      },
      {
        title: "Drug Availability",
        icon: Package,
        href: "/chemist/drugs",
        description: "External chemist medicine availability and stock status",
        group: "Outpatient & diagnostics",
      },
      {
        title: "Stock Requests",
        icon: Truck,
        href: "/chemist/stock-requests",
        description: "Request drugs from the hospital main store",
        group: "Outpatient & diagnostics",
      },
      {
        title: "Available Labs",
        icon: FlaskConical,
        href: "/chemist/labs",
        description: "External chemist laboratory test availability",
        group: "Outpatient & diagnostics",
      },
      {
        title: "Pickup History",
        icon: History,
        href: "/chemist/history",
        description: "Completed external chemist pickup records",
        group: "Outpatient & diagnostics",
      },
      {
        title: "Chemist Profile",
        icon: Store,
        href: "/chemist/profile",
        description: "External chemist contact, license, and location details",
        group: "Outpatient & diagnostics",
      },
      {
        title: "Chemist Users",
        icon: UserCog,
        href: "/chemist/users",
        description: "Manage external chemist staff user accounts",
        group: "Outpatient & diagnostics",
      },
      {
        title: "Laboratory",
        icon: FlaskConical,
        href: "/laboratory",
        group: "Outpatient & diagnostics",
      },
      {
        title: "Radiology",
        icon: ImageIcon,
        href: "/radiology",
        group: "Outpatient & diagnostics",
      },
      {
        title: "Procedures performed",
        icon: ClipboardList,
        href: "/procedures/performed",
        description: "Register of procedures done on patients (incl. outcomes from queue)",
        group: "Outpatient & diagnostics",
      },
      {
        title: "Inpatient",
        icon: BedDouble,
        href: "/inpatient",
        group: "Wards & beds",
      },
      {
        title: "Maternity",
        icon: Baby,
        href: "/maternity",
        group: "Wards & beds",
      },
      {
        title: "ICU",
        icon: HeartPulse,
        href: "/icu",
        group: "Wards & beds",
      },
      {
        title: "Renal Unit & Dialysis",
        icon: Droplets,
        href: "/renal",
        description: "Dialysis scheduling, machine status, and renal patient registry",
        group: "Wards & beds",
      },
      {
        title: "Ambulance Management",
        icon: Ambulance,
        href: "/ambulance",
        group: "Support & outreach",
      },
      {
        title: "Telemedicine",
        icon: Video,
        href: "/telemedicine",
        description: "Remote video visits (Zoom, Google Meet, and link mode)",
        group: "Support & outreach",
      },
      {
        title: "Field datasets",
        icon: ClipboardList,
        href: "/field-datasets",
        description: "Surveillance forms and special datasets for the IntelliNex Field mobile app",
        group: "Support & outreach",
      },
      {
        title: "Field app",
        icon: Smartphone,
        href: "/field-app",
        description: "Download the IntelliNex Field Android APK",
        group: "Support & outreach",
      },
      {
        title: "Field app usage",
        icon: BarChart3,
        href: "/field-app-usage",
        description: "APK downloads and Field app login/sync activity",
        group: "Support & outreach",
      },
    ],
  },
  {
    id: "financial",
    title: "Financial Management",
    icon: DollarSign,
    description: "Financial operations and billing",
    items: [
      {
        title: "Finance Overview",
        icon: BarChart3,
        href: "/finance",
        description: "Revenue, expenses, outstanding invoices, and quick access to finance modules",
        group: "Ledger & reporting",
      },
      {
        title: "General Ledger",
        icon: Clipboard,
        href: "/finance/ledger",
        group: "Ledger & reporting",
      },
      {
        title: "Financial Reports",
        icon: FileText,
        href: "/finance/reports",
        group: "Ledger & reporting",
      },
      {
        title: "Ledger Accounts",
        icon: Clipboard,
        href: "/finance/accounts",
        group: "Ledger & reporting",
      },
      {
        title: "Financial Statements",
        icon: FileText,
        href: "/finance/statements",
        group: "Ledger & reporting",
      },
      {
        title: "Accounts Payable",
        icon: Receipt,
        href: "/finance/payable",
        group: "Payables & receivables",
      },
      {
        title: "Accounts Receivable",
        icon: CreditCard,
        href: "/finance/receivable",
        group: "Payables & receivables",
      },
      {
        title: "Cash Management",
        icon: DollarSign,
        href: "/finance/cash",
        group: "Payables & receivables",
      },
      {
        title: "Budgeting",
        icon: DollarSign,
        href: "/finance/budgeting",
        group: "Planning & assets",
      },
      {
        title: "Fixed Assets",
        icon: Building2,
        href: "/finance/assets",
        group: "Planning & assets",
      },
      {
        title: "Billing & Invoicing",
        icon: Receipt,
        href: "/billing",
        group: "Billing & insurance",
      },
      {
        title: "Insurance Management",
        icon: FileText,
        href: "/insurance",
        group: "Billing & insurance",
      },
    ],
  },
  {
    id: "procurement",
    title: "Procurement & Inventory",
    icon: ShoppingCart,
    description: "Procurement and inventory management",
    items: [
      {
        title: "Procurement Overview",
        icon: ShoppingCart,
        href: "/procurement",
        description: "Purchase orders, vendor activity, and low-stock alerts",
      },
      {
        title: "Vendor Management",
        icon: Users,
        href: "/procurement/vendors",
      },
      {
        title: "Purchase Orders",
        icon: ShoppingCart,
        href: "/procurement/orders",
      },
      {
        title: "Inventory Overview",
        icon: Grid,
        href: "/inventory",
      },
      {
        title: "Add Inventory Item",
        icon: PlusCircle,
        href: "/inventory/new",
      },
      {
        title: "Stock Adjustment",
        icon: Layers,
        href: "/inventory/adjust",
      },
      {
        title: "Inventory Analytics",
        icon: BarChart3,
        href: "/inventory/analytics",
      },
      {
        title: "Drug Notifications",
        icon: Bell,
        href: "/procurement/notifications",
      },
    ],
  },
  {
    id: "administrative",
    title: "Administrative",
    icon: UserCog,
    description: "HR and administrative functions",
    items: [
      {
        title: "HR Overview",
        icon: Users,
        href: "/hr",
        description: "Staffing snapshot, leave, vacancies, and recent HR activity",
      },
      {
        title: "Employee Management",
        icon: UserCog,
        href: "/hr/employees",
      },
      {
        title: "MOH Reports",
        icon: FileText,
        href: "/reports",
      },
      {
        title: "System Administration",
        icon: Shield,
        href: "/administration",
      },
      {
        title: "Bill Waivers",
        icon: Receipt,
        href: "/administration/waivers",
      },
      {
        title: "Hospital Charges",
        icon: DollarSign,
        href: "/finance/charges",
      },
      {
        title: "Revenue Share",
        icon: DollarSign,
        href: "/finance/revenue-share",
      },
      {
        title: "Clinical Configuration",
        icon: ClipboardList,
        href: "/configuration",
      },
      {
        title: "Settings",
        icon: Settings,
        href: "/settings",
      },
      {
        title: "Drug Stores",
        icon: Store,
        href: "/settings/drug-stores",
      },
      {
        title: "External Chemists",
        icon: Store,
        href: "/settings/external-chemists",
      },
    ],
  },
]

export function getCategoryById(id: string): NavigationCategory | undefined {
  return navigationCategories.find(category => category.id === id)
}

export function getCategoryByPath(pathname: string): NavigationCategory {
  // Find the category that contains the current path
  for (const category of navigationCategories) {
    if (category.items.some(item => pathname.startsWith(item.href))) {
      return category
    }
  }
  // Default to overview if no match found
  return navigationCategories[0]
}