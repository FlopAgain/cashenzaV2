import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData } from "@remix-run/react";
import { NavMenu, TitleBar } from "@shopify/app-bridge-react";
import { Page } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { AppProvider } from "@shopify/shopify-app-remix/react";

import { authenticate } from "~/shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const headers: HeadersFunction = (headersArgs) => {
  return headersArgs.loaderHeaders;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function AppLayout() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey} isEmbeddedApp>
      <TitleBar title="Cashenza" />
      <NavMenu>
        <a href="/app" rel="home">Dashboard</a>
        <a href="/app/bundles">Bundles</a>
        <a href="/app/analytics">Analytics</a>
        <a href="/app/diagnostics">Diagnostics</a>
        <a href="/app/billing">Billing</a>
        <a href="/app/settings">Settings</a>
      </NavMenu>
      <Page
        title="Cashenza"
        primaryAction={{
          content: "Creer le premier bundle",
          url: "/app/bundles/new",
        }}
      >
        <Outlet />
        <p style={{ marginTop: 24 }}>
          <Link to="/app/bundles">Voir les bundles configures</Link>
        </p>
      </Page>
    </AppProvider>
  );
}
