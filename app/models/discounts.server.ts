import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import type { Bundle, CustomerEligibility, DiscountValueType } from "@prisma/client";

type DiscountInput = Pick<
  Bundle,
  | "id"
  | "productTitle"
  | "type"
  | "discountValueType"
  | "discountValue"
  | "discountStartsAt"
  | "discountEndsAt"
  | "oncePerCustomer"
  | "totalUsageLimit"
  | "customerEligibility"
  | "customerIds"
  | "customerSegmentIds"
>;

function buildDiscountMetafield(bundle: DiscountInput) {
  return {
    namespace: "cashenza",
    key: "bundle_config",
    type: "json",
    value: JSON.stringify({
      bundleId: bundle.id,
      bundleType: bundle.type,
      valueType: bundle.discountValueType,
      value: bundle.discountValue.toString(),
    }),
  };
}

function parseJsonArray(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildContext(customerEligibility: CustomerEligibility, customerIds?: string | null, segmentIds?: string | null) {
  if (customerEligibility === "SPECIFIC_CUSTOMERS") {
    return { customers: { add: parseJsonArray(customerIds) } };
  }
  if (customerEligibility === "CUSTOMER_SEGMENTS") {
    return { customerSegments: { add: parseJsonArray(segmentIds) } };
  }
  return { all: true };
}

export function getBundleFunctionHandle() {
  return "cashenza-bundle-discount";
}

export async function createShopifyBundleDiscount(admin: AdminApiContext, bundle: DiscountInput) {
  const functionHandle = getBundleFunctionHandle();
  const response = await admin.graphql(
    `#graphql
      mutation CreateCashenzaDiscount($discount: DiscountAutomaticAppInput!) {
        discountAutomaticAppCreate(automaticAppDiscount: $discount) {
          automaticAppDiscount {
            discountId
            title
            status
            startsAt
            endsAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        discount: {
          title: `Cashenza ${bundle.type === "VOLUME" ? "Volume" : "Cross-sell"} - ${bundle.productTitle}`,
          functionHandle,
          discountClasses: ["PRODUCT"],
          startsAt: bundle.discountStartsAt.toISOString(),
          endsAt: bundle.discountEndsAt?.toISOString(),
          appliesOncePerCustomer: bundle.oncePerCustomer,
          usageLimit: bundle.totalUsageLimit,
          combinesWith: {
            orderDiscounts: false,
            productDiscounts: false,
            shippingDiscounts: true,
          },
          context: buildContext(bundle.customerEligibility, bundle.customerIds, bundle.customerSegmentIds),
          metafields: [buildDiscountMetafield(bundle)],
        },
      },
    },
  );
  const payload = (await response.json()) as any;
  const result = payload.data?.discountAutomaticAppCreate;
  const userErrors = result?.userErrors ?? [];
  if (payload.errors || userErrors.length) {
    const messages = [
      ...(payload.errors ?? []).map((error: { message: string }) => error.message),
      ...userErrors.map((error: { field?: string[]; message: string }) => `${error.field?.join(".") ?? "discount"}: ${error.message}`),
    ];
    throw new Error(messages.join(", "));
  }
  return result.automaticAppDiscount as { discountId: string; title: string; status: string; startsAt: string; endsAt?: string | null };
}

export async function deactivateShopifyDiscount(admin: AdminApiContext, discountId: string) {
  const response = await admin.graphql(
    `#graphql
      mutation DeactivateCashenzaDiscount($id: ID!) {
        discountAutomaticDeactivate(id: $id) {
          automaticDiscountNode {
            id
            automaticDiscount {
              ... on DiscountAutomaticApp {
                status
              }
            }
          }
          userErrors { field message }
        }
      }
    `,
    { variables: { id: discountId } },
  );
  const payload = (await response.json()) as any;
  const userErrors = payload.data?.discountAutomaticDeactivate?.userErrors ?? [];
  if (payload.errors || userErrors.length) {
    throw new Error([...(payload.errors ?? []), ...userErrors].map((error: { message: string }) => error.message).join(", "));
  }
}

export async function deleteShopifyDiscount(admin: AdminApiContext, discountId: string) {
  const response = await admin.graphql(
    `#graphql
      mutation DeleteCashenzaDiscount($id: ID!) {
        discountAutomaticDelete(id: $id) {
          deletedAutomaticDiscountId
          userErrors { field message }
        }
      }
    `,
    { variables: { id: discountId } },
  );
  const payload = (await response.json()) as any;
  const userErrors = payload.data?.discountAutomaticDelete?.userErrors ?? [];
  if (payload.errors || userErrors.length) {
    throw new Error([...(payload.errors ?? []), ...userErrors].map((error: { message: string }) => error.message).join(", "));
  }
}

export function normalizeDiscountValueType(value: FormDataEntryValue | null): DiscountValueType {
  if (value === "FIXED_AMOUNT" || value === "FINAL_AMOUNT") return value;
  return "PERCENTAGE";
}
