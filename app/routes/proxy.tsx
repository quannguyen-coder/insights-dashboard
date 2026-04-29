import { createHmac, timingSafeEqual } from "node:crypto";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (!verifyAppProxySignature(url.searchParams)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const shop = url.searchParams.get("shop") ?? "your store";

  return new Response(renderProxyLiquid(shop), {
    headers: {
      "Content-Type": "application/liquid; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
};

function verifyAppProxySignature(searchParams: URLSearchParams) {
  const signature = searchParams.get("signature");
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!signature || !secret) {
    return false;
  }

  const calculatedSignature = createHmac("sha256", secret)
    .update(buildSignedPayload(searchParams))
    .digest("hex");

  return safeCompare(calculatedSignature, signature);
}

function buildSignedPayload(searchParams: URLSearchParams) {
  const groupedParams = new Map<string, string[]>();

  for (const [key, value] of searchParams.entries()) {
    if (key === "signature") {
      continue;
    }

    groupedParams.set(key, [...(groupedParams.get(key) ?? []), value]);
  }

  return Array.from(groupedParams.entries())
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, values]) => `${key}=${values.sort().join(",")}`)
    .join("");
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function renderProxyLiquid(shop: string) {
  const escapedShop = escapeHtml(shop);

  return `
<section class="insights-dashboard-proxy" aria-labelledby="insights-dashboard-title">
  <style>
    .insights-dashboard-proxy {
      padding: 4rem 0;
    }

    .insights-dashboard-proxy__card {
      border: 1px solid rgba(var(--color-foreground), 0.12);
      border-radius: 1.2rem;
      padding: clamp(2rem, 4vw, 4rem);
      background: rgb(var(--color-background));
    }

    .insights-dashboard-proxy__eyebrow {
      margin: 0 0 0.75rem;
      color: rgba(var(--color-foreground), 0.72);
      font-size: 0.875em;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .insights-dashboard-proxy__title {
      margin: 0 0 1rem;
    }

    .insights-dashboard-proxy__copy {
      max-width: 64rem;
      margin: 0;
    }

    .insights-dashboard-proxy__meta {
      margin-top: 1.5rem;
      color: rgba(var(--color-foreground), 0.72);
      font-size: 0.95em;
    }
  </style>

  <div class="page-width">
    <div class="insights-dashboard-proxy__card">
      <p class="insights-dashboard-proxy__eyebrow">Insights dashboard</p>
      <h1 class="insights-dashboard-proxy__title" id="insights-dashboard-title">
        {{ shop.name | escape }} insights
      </h1>
      <p class="insights-dashboard-proxy__copy">
        This secure storefront page is powered by the Insights Dashboard app. The Admin dashboard contains
        private order and revenue analytics, while this theme page can be used for customer-facing insight content.
      </p>

      {% if customer %}
        <p class="insights-dashboard-proxy__meta">
          Signed in as {{ customer.email | escape }}. Request verified for ${escapedShop}.
        </p>
      {% else %}
        <p class="insights-dashboard-proxy__meta">
          Sign in to your customer account to unlock personalized storefront content.
        </p>
      {% endif %}
    </div>
  </div>
</section>
`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
