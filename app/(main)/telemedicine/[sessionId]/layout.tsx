import type { ReactNode } from "react"

export async function generateStaticParams() {
  return [{ sessionId: "__export_placeholder__" }]
}

export default function TelemedicineSessionLayout({ children }: { children: ReactNode }) {
  return children
}
