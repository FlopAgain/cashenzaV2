import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLocation } from "@remix-run/react";
import { AppProvider, Frame, Navigation, Page } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "~/shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const headers: HeadersFunction = (headersArgs) => {
  return headersArgs.loaderHeaders;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AppLayout() {
  const location = useLocation();

  return (
    <AppProvider i18n={{}}>
      <Frame
        navigation={
          <Navigation location={location.pathname}>
            <Navigation.Section
              items={[
                { label: "Dashboard", url: "/app" },
                { label: "Bundles", url: "/app/bundles" },
                { label: "Analytics", url: "/app/analytics" },
                { label: "Diagnostics", url: "/app/diagnostics" },
                { label: "Billing", url: "/app/billing" },
                { label: "Settings", url: "/app/settings" },
              ]}
            />
          </Navigation>
        }
      >
        <Page
          title="Cashenza"
          primaryAction={{
            content: "Créer le premier bundle",
            url: "/app/bundles/new",
          }}
        >
          <Outlet />
          <p style={{ marginTop: 24 }}>
            <Link to="/app/bundles">Voir les bundles configurés</Link>
          </p>
        </Page>
      </Frame>
    </AppProvider>
  );
}
