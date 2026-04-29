type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type MoneyV2 = {
  amount: string;
  currencyCode: string;
};

type OrderNode = {
  id: string;
  name: string;
  processedAt: string | null;
  createdAt: string;
  cancelledAt: string | null;
  totalPriceSet: {
    shopMoney: MoneyV2;
  };
};

type OrdersResponse = {
  data?: {
    orders: {
      edges: Array<{
        cursor: string;
        node: OrderNode;
      }>;
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  };
  errors?: Array<{ message: string }>;
};

export type SalesDay = {
  date: string;
  revenue: number;
  orders: number;
  aov: number;
};

export type SalesOverview = {
  generatedAt: string;
  startsAt: string;
  endsAt: string;
  totalRevenue: number;
  totalOrders: number;
  aov: number;
  currencyCode: string;
  rows: SalesDay[];
};

const ORDERS_QUERY = `#graphql
  query SalesOverviewOrders($first: Int!, $after: String, $query: String!) {
    orders(first: $first, after: $after, query: $query, sortKey: PROCESSED_AT, reverse: true) {
      edges {
        cursor
        node {
          id
          name
          processedAt
          createdAt
          cancelledAt
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
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

export async function getSalesOverview(
  admin: AdminGraphqlClient,
): Promise<SalesOverview> {
  const now = new Date();
  const startsAt = new Date(now);
  startsAt.setUTCDate(startsAt.getUTCDate() - 30);

  const orders = await fetchOrders(admin, startsAt, now);
  const activeOrders = orders.filter((order) => !order.cancelledAt);
  const currencyCode =
    activeOrders[0]?.totalPriceSet.shopMoney.currencyCode ?? "USD";

  const rowsByDate = new Map<string, SalesDay>();

  for (const order of activeOrders) {
    const processedDate = new Date(order.processedAt ?? order.createdAt);
    const date = processedDate.toISOString().slice(0, 10);
    const amount = Number(order.totalPriceSet.shopMoney.amount);
    const current = rowsByDate.get(date) ?? {
      date,
      revenue: 0,
      orders: 0,
      aov: 0,
    };

    current.revenue += Number.isFinite(amount) ? amount : 0;
    current.orders += 1;
    current.aov = current.orders > 0 ? current.revenue / current.orders : 0;
    rowsByDate.set(date, current);
  }

  const rows = Array.from(rowsByDate.values()).sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalOrders = rows.reduce((sum, row) => sum + row.orders, 0);

  return {
    generatedAt: now.toISOString(),
    startsAt: startsAt.toISOString(),
    endsAt: now.toISOString(),
    totalRevenue,
    totalOrders,
    aov: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    currencyCode,
    rows,
  };
}

async function fetchOrders(
  admin: AdminGraphqlClient,
  startsAt: Date,
  endsAt: Date,
) {
  const orders: OrderNode[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await admin.graphql(ORDERS_QUERY, {
      variables: {
        first: 100,
        after,
        query: buildOrderSearchQuery(startsAt, endsAt),
      },
    });
    const json = (await response.json()) as OrdersResponse;

    if (json.errors?.length) {
      throw new Error(json.errors.map((error) => error.message).join(", "));
    }

    const page = json.data?.orders;

    if (!page) {
      throw new Error("Shopify Admin API did not return orders data.");
    }

    orders.push(...page.edges.map((edge) => edge.node));
    hasNextPage = page.pageInfo.hasNextPage;
    after = page.pageInfo.endCursor;
  }

  return orders;
}

function buildOrderSearchQuery(startsAt: Date, endsAt: Date) {
  const startDate = startsAt.toISOString().slice(0, 10);
  const endDate = endsAt.toISOString().slice(0, 10);

  return `processed_at:>=${startDate} processed_at:<=${endDate}`;
}
