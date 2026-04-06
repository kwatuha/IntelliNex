import type { ReactNode } from "react"

/**
 * Static export requires at least one generated path per dynamic segment.
 * Deploy: rewrite real URLs (e.g. /assets/verify/123) to this HTML file on the host
 * so the client receives the shell and useParams() still reflects the browser URL.
 */
export async function generateStaticParams() {
  return [{ id: "__export_placeholder__" }]
}

export default function AssetVerifyIdLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
