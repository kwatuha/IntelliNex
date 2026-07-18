export default function LoginLayout({ children }: { children: React.ReactNode }) {
  // Do not wrap in AuthProvider — root layout already provides auth, and a nested
  // provider would re-run token verify on /login (same slow path we fixed on logout).
  return children
}
