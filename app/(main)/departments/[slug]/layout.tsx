import type { ReactNode } from "react"

export async function generateStaticParams() {
  return [{ slug: "__export_placeholder__" }]
}

export default function DepartmentSlugLayout({ children }: { children: ReactNode }) {
  return children
}
