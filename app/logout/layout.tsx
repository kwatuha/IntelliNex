export default function LogoutLayout({ children }: { children: React.ReactNode }) {
  // Do not wrap in AuthProvider — root layout already provides auth, and a nested
  // provider would re-run token verify during logout (slow / racey).
  return children
}
