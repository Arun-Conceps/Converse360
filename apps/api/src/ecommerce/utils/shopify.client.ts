import { safeFetch } from '../../ai/lib/http-guard';
import { normalizeStoreUrl } from './store-url.util';

export interface ShopifyProduct {
  id: string;
  title: string;
  description?: string;
  variants: Array<{
    id: string;
    price: string;
    inventoryQuantity?: number;
  }>;
  images: Array<{
    url: string;
  }>;
  handle: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  totalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  displayFinancialStatus: string;
  createdAt: string;
  updatedAt: string;
  customer?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
}

export class ShopifyClient {
  private storeUrl: string;
  private apiKey: string;
  private apiPassword: string;
  private accessToken: string;

  constructor(
    storeUrl: string,
    apiKey: string,
    apiPassword: string,
    accessToken?: string,
  ) {
    const normalized = normalizeStoreUrl('shopify', storeUrl);
    if (!normalized) {
      throw new Error('Invalid Shopify store URL (expected *.myshopify.com)');
    }
    this.storeUrl = normalized;
    this.apiKey = apiKey;
    this.apiPassword = apiPassword;
    this.accessToken = accessToken || '';
  }

  private get authHeader(): string {
    if (this.accessToken) {
      return this.accessToken;
    }
    return Buffer.from(`${this.apiKey}:${this.apiPassword}`).toString('base64');
  }

  private async request(
    query: string,
    variables?: Record<string, any>,
  ): Promise<any> {
    const url = `${this.storeUrl}/admin/api/2024-01/graphql.json`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.accessToken) {
      headers['X-Shopify-Access-Token'] = this.accessToken;
    } else {
      headers['Authorization'] = `Basic ${this.authHeader}`;
    }

    // safeFetch: public hosts only, redirects re-validated per hop.
    const response = await safeFetch({
      url,
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
      timeoutMs: 20_000,
      maxBytes: 8 * 1024 * 1024,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = JSON.parse(response.body);
    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    return data.data;
  }

  async getProducts(limit = 50): Promise<ShopifyProduct[]> {
    const query = `
      query getProducts($first: Int!) {
        products(first: $first) {
          nodes {
            id
            title
            description
            handle
            createdAt
            updatedAt
            images(first: 1) {
              nodes {
                url
              }
            }
            variants(first: 1) {
              nodes {
                id
                price
                inventoryQuantity
              }
            }
          }
        }
      }
    `;

    const data = await this.request(query, { first: limit });
    return data?.products?.nodes || [];
  }

  async getOrders(limit = 50, status = 'any'): Promise<ShopifyOrder[]> {
    const query = `
      query getOrders($first: Int!, $query: String) {
        orders(first: $first, query: $query) {
          nodes {
            id
            name
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            displayFinancialStatus
            createdAt
            updatedAt
            customer {
              id
            }
          }
        }
      }
    `;

    const statusQuery = status === 'any' ? '' : `status:${status}`;
    const data = await this.request(query, {
      first: limit,
      query: statusQuery,
    });
    return data?.orders?.nodes || [];
  }

  async getCustomer(customerId: string): Promise<{
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  } | null> {
    const query = `
      query getCustomer($id: ID!) {
        customer(id: $id) {
          firstName
          lastName
          email
          phone
        }
      }
    `;

    const data = await this.request(query, { id: customerId });
    return data?.customer || null;
  }
}
