export type Branding = {
  productName: string
  appBrand: string
}

export const branding: Branding = {
  productName: process.env.NEXT_PUBLIC_PRODUCT_NAME || "IntelliNex",
  appBrand: process.env.NEXT_PUBLIC_APP_BRAND || process.env.NEXT_PUBLIC_PRODUCT_NAME || "IntelliNex",
}

