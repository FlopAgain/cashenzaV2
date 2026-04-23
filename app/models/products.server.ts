import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

const PRODUCTS_QUERY = `#graphql
  query ProductsForBundles($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        title
        handle
        status
        totalInventory
        tracksInventory
        variantsCount {
          count
        }
        featuredMedia {
          preview {
            image {
              url
              altText
            }
          }
        }
        variants(first: 50) {
          nodes {
            id
            title
            price
            compareAtPrice
            availableForSale
            inventoryQuantity
            selectedOptions {
              name
              value
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  status: string;
  totalInventory: number | null;
  tracksInventory: boolean;
  variantsCount: { count: number };
  featuredMedia?: { preview?: { image?: { url: string; altText?: string | null } | null } | null } | null;
  variants: {
    nodes: Array<{
      id: string;
      title: string;
      price: string;
      compareAtPrice?: string | null;
      availableForSale: boolean;
      inventoryQuantity: number | null;
      selectedOptions: Array<{ name: string; value: string }>;
    }>;
  };
};

export async function listProductsForBundles(admin: AdminApiContext, params: { search?: string; after?: string | null; first?: number }) {
  const response = await admin.graphql(PRODUCTS_QUERY, {
    variables: {
      first: params.first ?? 4,
      after: params.after || null,
      query: params.search ? `title:*${params.search}* OR handle:*${params.search}*` : null,
    },
  });
  const payload = (await response.json()) as any;
  if (payload.errors) {
    throw new Error(payload.errors.map((error: { message: string }) => error.message).join(", "));
  }
  return payload.data.products as {
    nodes: ShopifyProduct[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

export async function getProductForBundle(admin: AdminApiContext, productId: string) {
  const response = await admin.graphql(
    `#graphql
      query ProductForBundle($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          status
          totalInventory
          tracksInventory
          variantsCount { count }
          featuredMedia {
            preview {
              image {
                url
                altText
              }
            }
          }
          variants(first: 100) {
            nodes {
              id
              title
              price
              compareAtPrice
              availableForSale
              inventoryQuantity
              selectedOptions { name value }
            }
          }
        }
      }
    `,
    { variables: { id: productId } },
  );
  const payload = (await response.json()) as any;
  if (payload.errors) {
    throw new Error(payload.errors.map((error: { message: string }) => error.message).join(", "));
  }
  return payload.data.product as ShopifyProduct | null;
}
