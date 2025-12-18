type Env = {
  SLACK_BOT_TOKEN: string;
  REQUIRE_CLOUDFLARE_ACCESS?: string;
};

type SlackApiResponse = { ok: boolean; error?: string };

function json(body: unknown, request: Request, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(request),
      ...(init.headers ?? {}),
    },
  });
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  // If the request is coming from a browser context and needs cookies (Cloudflare Access),
  // reflect the origin and allow credentials.
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-credentials"] = "true";
    headers["vary"] = "origin";
  } else {
    headers["access-control-allow-origin"] = "*";
  }
  return headers;
}

function mustBeJson(request: Request): void {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("content-type must be application/json");
  }
}

function requireCloudflareAccessIfEnabled(request: Request, env: Env): void {
  const required = (env.REQUIRE_CLOUDFLARE_ACCESS ?? "true").toLowerCase() === "true";
  if (!required) return;

  // Cloudflare Access adds this header when the request passed Access policies.
  const jwt = request.headers.get("cf-access-jwt-assertion");
  if (jwt) return;

  // Some configurations rely on Access session cookies.
  const cookie = request.headers.get("cookie") ?? "";
  if (cookie.includes("CF_Authorization=") || cookie.includes("CF_AppSession=")) return;

  throw new Error("Cloudflare Access login required");
}

async function slackApi<T>(
  token: string,
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`https://slack.com/api/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  return (await response.json()) as T;
}

function buildSlackText(input: { url: string; message?: string }): string {
  const extra = (input.message ?? "").trim();
  if (extra) return `${extra}\n${input.url}`;
  return `閲覧なう\n${input.url}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json({ ok: true, name: "auto-notification-slack" }, request);
    }

    if (request.method === "POST" && url.pathname === "/api/channels") {
      try {
        requireCloudflareAccessIfEnabled(request, env);
        mustBeJson(request);

        const data = await slackApi<{
          ok: boolean;
          channels?: Array<{ id: string; name: string }>;
          error?: string;
        }>(env.SLACK_BOT_TOKEN, "conversations.list?limit=200&types=public_channel", {
          method: "GET",
        });

        if (!data.ok) {
          return json({ ok: false, error: data.error ?? "Slack API error" }, request, {
            status: 400,
          });
        }

        const channels = (data.channels ?? []).map((c) => ({ id: c.id, name: c.name }));
        return json({ ok: true, channels }, request);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return json({ ok: false, error: message }, request, { status: 401 });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/post") {
      try {
        requireCloudflareAccessIfEnabled(request, env);
        mustBeJson(request);
        const body = (await request.json()) as Partial<{
          channel: string;
          url: string;
          message: string;
          text: string;
        }>;

        const channel = (body.channel ?? "").trim();
        const urlToSend = (body.url ?? "").trim();
        const message = (body.message ?? "").trim();
        const text = (body.text ?? "").trim() || buildSlackText({ url: urlToSend, message });

        if (!channel) return json({ ok: false, error: "channel is required" }, request, { status: 400 });
        if (!urlToSend) return json({ ok: false, error: "url is required" }, request, { status: 400 });

        const result = await slackApi<SlackApiResponse>(env.SLACK_BOT_TOKEN, "chat.postMessage", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            channel,
            text,
            unfurl_links: false,
            unfurl_media: false,
          }),
        });

        if (!result.ok) {
          return json({ ok: false, error: result.error ?? "Slack API error" }, request, { status: 400 });
        }
        return json({ ok: true }, request);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.includes("Cloudflare Access") ? 401 : 400;
        return json({ ok: false, error: message }, request, { status });
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders(request) });
  },
};
