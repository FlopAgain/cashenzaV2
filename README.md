# Cashenza

Cashenza is a Shopify bundle and discount app built around one non-negotiable invariant:

**1 active bundle = 1 Shopify discount = 1 local record.**

The app starts without relying on merchant theme-editor configuration. Merchants configure bundles from the embedded admin dashboard, and the storefront theme app extension renders only on product pages.

Shopify still requires the merchant to activate the app embed once for the live theme. Cashenza exposes an admin deep link for that activation; after that, bundles are controlled from the app dashboard rather than from theme settings.

## First local setup

1. Copy `.env.example` to `.env` and fill Shopify app credentials plus the Neon PostgreSQL connection string.
2. Run `npm install`.
3. Run `npm run setup`.
4. Run `npm run dev`.

## Shopify Functions build requirements on Windows

The discount extension is implemented in Rust and targets `wasm32-unknown-unknown`.
On Windows, install Visual Studio Build Tools with the Desktop development with C++ workload and Windows SDK, then run Shopify/Cargo commands from Developer PowerShell for Visual Studio.

## Core constraints

- A product can have at most one volume bundle and one cross-sell bundle.
- Shopify discount IDs are unique locally.
- Bundle activation must be synchronized with Shopify Admin GraphQL.
- Duplicate storefront mounts are ignored by the extension script.
- Bundle UI replaces variant selectors, add-to-cart, and buy-now controls on eligible product pages.
