/**
 * Connectors: the user's own accounts (Linear, Notion, GitHub…) that the agent can read from
 * and act in while it plans or changes an app. Each one is a remote MCP server the model
 * reaches through Anthropic's MCP connector, signed in as the user (OAuth or a pasted token).
 *
 * A connector is used in a run only when the user's message names it (by name or by a link to
 * it), so connecting one never adds cost or risk to requests that don't need it.
 */

export type ConnectorId =
  | "linear"
  | "notion"
  | "github"
  | "crowdin"
  | "miro"
  | "jam"
  | "google-play"
  | "revenuecat"
  | "mobbin"
  | "appllama"
  | "google-maps"
  | "mapbox";

export interface Connector {
  id: ConnectorId;
  name: string;
  description: string;
  /** The service's official remote MCP server, or null when there is none. */
  mcpUrl: string | null;
  /** Sign in with the service (MCP OAuth with dynamic client registration). */
  oauth: boolean;
  /** Paste a personal token instead (sent to the MCP server as a Bearer token). */
  token: { label: string; link: string; help: string } | null;
  /** Shown instead of Connect when the connector can't be connected yet, and why. */
  unavailable?: string;
  /** Shown under the description, e.g. a plan the service requires. */
  note?: string;
  /** A message that matches uses this connector. */
  mentions: RegExp;
}

export const CONNECTORS: readonly Connector[] = [
  {
    id: "linear",
    name: "Linear",
    description: "Read and update issues and projects.",
    mcpUrl: "https://mcp.linear.app/mcp",
    oauth: true,
    token: {
      label: "Personal API key",
      link: "https://linear.app/settings/account/security",
      help: "Linear → Settings → Security & access → Personal API keys. A read-only key keeps the agent to reading.",
    },
    // "linear" is also an everyday word: the capitalized name, a link, or "linear issue".
    mentions: /\bLinear\b|linear\.app|\blinear (issue|ticket|project|task)s?\b/,
  },
  {
    id: "notion",
    name: "Notion",
    description: "Search and edit pages and databases.",
    mcpUrl: "https://mcp.notion.com/mcp",
    oauth: true,
    token: null,
    mentions: /\bNotion\b|notion\.(so|site)|\bnotion (page|doc|database)s?\b/,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Work with repositories, issues, and pull requests.",
    mcpUrl: "https://api.githubcopilot.com/mcp/",
    // GitHub's MCP OAuth needs a registered GitHub App; a fine-grained token works today.
    oauth: false,
    token: {
      label: "Fine-grained personal access token",
      link: "https://github.com/settings/personal-access-tokens/new",
      help: "Give it the repositories it may use, with Contents, Issues and Pull requests. The same token exports your apps to GitHub.",
    },
    mentions: /\bgithub\b|github\.com/i,
  },
  {
    id: "crowdin",
    name: "Crowdin",
    description: "Manage source files, strings, and translations.",
    mcpUrl: "https://mcp.crowdin.com/v2/mcp",
    oauth: true,
    token: {
      label: "Personal access token",
      link: "https://crowdin.com/settings#api-key",
      help: "Crowdin → Account Settings → API → New Token.",
    },
    mentions: /\bcrowdin\b/i,
  },
  {
    id: "miro",
    name: "Miro",
    description: "Read and edit boards, diagrams, and tables.",
    mcpUrl: "https://mcp.miro.com/",
    oauth: true,
    token: null,
    note: "You pick one Miro team when you sign in.",
    mentions: /\bmiro\b|miro\.com/i,
  },
  {
    id: "jam",
    name: "Jam",
    description: "Read and manage bug reports with their recordings, logs, and network requests.",
    mcpUrl: "https://mcp.jam.dev/mcp",
    oauth: true,
    token: {
      label: "Personal access token",
      link: "https://jam.dev/s/settings/mcp",
      help: "Jam → Settings → MCP → create a token.",
    },
    // "jam" is an everyday word; match the capitalized name or a Jam link.
    mentions: /\bJam\b|jam\.dev/,
  },
  {
    id: "google-play",
    name: "Google Play",
    description: "Ship builds, releases, rollouts, and store listings.",
    mcpUrl: null,
    oauth: false,
    token: null,
    unavailable:
      "Google doesn't offer an MCP server for Google Play yet, so there's nothing for the agent to sign in to.",
    mentions: /google play|play console|play store/i,
  },
  {
    id: "revenuecat",
    name: "RevenueCat",
    description: "Manage products and offerings, and read subscription metrics.",
    mcpUrl: "https://mcp.revenuecat.ai/mcp",
    // RevenueCat's MCP sign-in only accepts clients its support team registered; a secret
    // key works today.
    oauth: false,
    token: {
      label: "Secret API key (v2)",
      link: "https://app.revenuecat.com/",
      help: "RevenueCat → your project → API keys → + New secret API key (v2), with write access to project configuration. The key is for one project.",
    },
    mentions: /revenue ?cat/i,
  },
  {
    id: "mobbin",
    name: "Mobbin",
    description: "Find real app screens and flows to design from.",
    mcpUrl: "https://api.mobbin.com/mcp",
    oauth: true,
    token: null,
    note: "Needs a paid Mobbin plan.",
    mentions: /\bmobbin\b/i,
  },
  {
    id: "appllama",
    name: "Appllama",
    description: "Browse paywalls and onboarding flows of top apps.",
    mcpUrl: "https://mcp.appllama.io/mcp",
    oauth: true,
    token: null,
    note: "Needs Appllama Pro.",
    mentions: /\bappllama\b/i,
  },
  {
    id: "google-maps",
    name: "Google Maps",
    description: "Look up places, routes, and weather.",
    mcpUrl: "https://mapstools.googleapis.com/mcp",
    oauth: false,
    token: null,
    unavailable:
      "Google's Maps MCP server takes its key in a custom header, which the model's MCP connector can't send yet.",
    mentions: /google maps/i,
  },
  {
    id: "mapbox",
    name: "Mapbox",
    description: "Search places, plan routes, and render maps.",
    mcpUrl: "https://mcp.mapbox.com/mcp",
    oauth: true,
    token: null,
    mentions: /\bmapbox\b/i,
  },
];

export function connectorById(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

export function isConnectable(connector: Connector): boolean {
  return (
    Boolean(connector.mcpUrl) && !connector.unavailable && (connector.oauth || !!connector.token)
  );
}

/** The connectors a message names, in catalog order. */
export function mentionedConnectors(text: string): ConnectorId[] {
  return CONNECTORS.filter((c) => c.mentions.test(text)).map((c) => c.id);
}
