import type { ReactNode } from "react"

export async function generateStaticParams() {
  return [{ id: "__export_placeholder__" }]
}

export default function InventoryIdLayout({ children }: { children: ReactNode }) {
  return children
}
