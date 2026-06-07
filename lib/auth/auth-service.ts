// import usersData from '../data/users.json'
import type { UserRole } from './permissions'

export interface Branch {
  branchId: number
  branchCode?: string
  branchName: string
  isMainBranch?: boolean
  isDefault?: boolean
}

export interface User {
  id: string
  username: string
  role: UserRole
  name: string
  email: string
  department: string
  privileges?: Array<{ privilegeName: string; module?: string }> | string[]
  dashboardCards?: Record<string, boolean> | null
  branches?: Branch[]
  defaultBranch?: Branch | null
  currentBranch?: Branch | null
  canAccessAllBranches?: boolean
  landingConfig?: {
    type: 'dashboard' | 'app_view' | 'redirect';
    label?: string;
    url?: string;
    icon?: string;
    description?: string;
    servicePoint?: string;
    quickLinks?: Array<{ label: string; url: string; icon?: string }>;
  };
}

export interface LoginCredentials {
  username: string
  password: string
}

// Temporary hardcoded users data to avoid JSON import issues
const usersData = {
  users: [
    {
      id: "1",
      username: "admin",
      password: "admin123",
      role: "admin" as UserRole,
      name: "System Administrator",
      email: "admin@transelgon.com",
      department: "IT"
    },
    {
      id: "2",
      username: "doctor",
      password: "doctor123",
      role: "doctor" as UserRole,
      name: "Dr. Sarah Johnson",
      email: "sarah.johnson@transelgon.com",
      department: "General Medicine"
    },
    {
      id: "3",
      username: "nurse",
      password: "nurse123",
      role: "nurse" as UserRole,
      name: "Nurse Mary Williams",
      email: "mary.williams@transelgon.com",
      department: "Nursing"
    },
    {
      id: "4",
      username: "lab",
      password: "lab123",
      role: "lab_technician" as UserRole,
      name: "Lab Tech David Chen",
      email: "david.chen@transelgon.com",
      department: "Laboratory"
    },
    {
      id: "5",
      username: "registration",
      password: "reg123",
      role: "registration" as UserRole,
      name: "Registration Officer Lisa Brown",
      email: "lisa.brown@transelgon.com",
      department: "Registration"
    },
    {
      id: "6",
      username: "billing",
      password: "billing123",
      role: "billing" as UserRole,
      name: "Billing Officer Mike Davis",
      email: "mike.davis@transelgon.com",
      department: "Finance"
    },
    {
      id: "7",
      username: "pharmacy",
      password: "pharmacy123",
      role: "pharmacy" as UserRole,
      name: "Pharmacist Anna Wilson",
      email: "anna.wilson@transelgon.com",
      department: "Pharmacy"
    }
  ]
}

export class AuthService {
  private static users = usersData.users

  static async login(credentials: LoginCredentials): Promise<User | null> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const user = this.users.find(
      u => u.username === credentials.username && u.password === credentials.password
    )
    
    if (user) {
      // Return user without password
      const { password, ...userWithoutPassword } = user
      return userWithoutPassword as User
    }
    
    return null
  }

  static async validateToken(token: string): Promise<User | null> {
    // For now, we'll use a simple token validation
    // In a real app, this would validate JWT tokens
    try {
      const decoded = JSON.parse(atob(token))
      const user = this.users.find(u => u.id === decoded.userId)
      
      if (user) {
        const { password, ...userWithoutPassword } = user
        return userWithoutPassword as User
      }
    } catch (error) {
      // Token validation failed
    }
    
    return null
  }

  static generateToken(user: User): string {
    // Simple token generation for demo purposes
    // In a real app, this would be a JWT token
    const tokenData = {
      userId: user.id,
      username: user.username,
      role: user.role,
      timestamp: Date.now()
    }
    
    return btoa(JSON.stringify(tokenData))
  }
} 