import type { ReactNode } from "react"

/**
 * Static export requires at least one generated path per dynamic segment.
 * Deploy: rewrite real URLs to this HTML (see deploy/serve-hmis.json). useParams() may stay
 * __export_placeholder__; pages use useResolvedRouteParam() + pathname to read the real id.
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
