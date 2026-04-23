import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { Badge, BlockStack, Button, Card, InlineStack, Text } from "@shopify/polaris";

import prisma from "~/db.server";
import { getOrCreateShop } from "~/models/shop.server";
import { authenticate, MONTHLY_PLAN } from "~/shopify.server";

function isBillingTestMode() {
  return process.env.BILLING_TEST !== "false";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing: shopifyBilling, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const billingCheck = await shopifyBilling.check({
    plans: [MONTHLY_PLAN],
    isTest: isBillingTestMode(),
  });
  const activeSubscription = billingCheck.appSubscriptions[0];

  const billing = await prisma.billingSubscription.upsert({
    where: { shopId: shop.id },
    update: {
      status: billingCheck.hasActivePayment ? "ACTIVE" : "TRIAL",
      shopifyChargeId: activeSubscription?.id ?? undefined,
    },
    create: {
      shopId: shop.id,
      status: billingCheck.hasActivePayment ? "ACTIVE" : "TRIAL",
      shopifyChargeId: activeSubscription?.id,
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      monthlyPriceUsd: 8,
    },
  });

  return {
    billing,
    hasActivePayment: billingCheck.hasActivePayment,
    isTest: isBillingTestMode(),
    planName: MONTHLY_PLAN,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  return billing.request({
    plan: MONTHLY_PLAN,
    isTest: isBillingTestMode(),
    returnUrl: new URL("/app/billing", request.url).toString(),
  });
};

export default function Billing() {
  const { billing, hasActivePayment, isTest, planName } = useLoaderData<typeof loader>();
  const navigation = useNavigation();

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between">
          <Badge tone={hasActivePayment ? "success" : "attention"}>{billing.status}</Badge>
          {isTest ? <Badge tone="info">Test billing</Badge> : null}
        </InlineStack>
        <Text as="h2" variant="headingMd">{planName}: essai 30 jours puis $8/mois</Text>
        <Text as="p" tone="subdued">
          Les options payantes additionnelles seront ajoutées ici après stabilisation des bundles et des réductions.
        </Text>
        {hasActivePayment ? (
          <Text as="p">L'abonnement Shopify est actif et synchronisé localement.</Text>
        ) : (
          <Form method="post">
            <Button submit variant="primary" loading={navigation.state === "submitting"}>
              Activer l'essai Shopify
            </Button>
          </Form>
        )}
      </BlockStack>
    </Card>
  );
}
