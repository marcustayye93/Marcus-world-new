type AnalyticsProperties = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, eventData?: AnalyticsProperties) => void;
    };
  }
}

type AnalyticsState =
  "uninitialized" | "disabled" | "loading" | "ready" | "failed";

let analyticsState: AnalyticsState = "uninitialized";
const pendingEvents: Array<{ name: string; properties?: AnalyticsProperties }> =
  [];

export function initializeAnalytics() {
  if (analyticsState !== "uninitialized" || typeof window === "undefined")
    return;

  const endpoint = (import.meta.env.VITE_ANALYTICS_ENDPOINT ?? "").trim();
  const websiteId = (import.meta.env.VITE_ANALYTICS_WEBSITE_ID ?? "").trim();
  if (
    !endpoint ||
    !websiteId ||
    /%|vite_/i.test(endpoint) ||
    /%|vite_/i.test(websiteId)
  ) {
    analyticsState = "disabled";
    return;
  }

  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    analyticsState = "disabled";
    return;
  }

  const isSecure = endpointUrl.protocol === "https:";
  const isLocalHttp =
    import.meta.env.DEV &&
    endpointUrl.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(endpointUrl.hostname);
  if (
    (!isSecure && !isLocalHttp) ||
    endpointUrl.username ||
    endpointUrl.password ||
    endpointUrl.search ||
    endpointUrl.hash
  ) {
    analyticsState = "disabled";
    return;
  }

  analyticsState = "loading";
  const script = document.createElement("script");
  script.defer = true;
  script.src = `${endpointUrl.origin}${endpointUrl.pathname.replace(/\/+$/, "")}/umami`;
  script.dataset.websiteId = websiteId;
  script.onload = () => {
    analyticsState = "ready";
    for (const event of pendingEvents.splice(0)) {
      window.umami?.track(event.name, event.properties);
    }
  };
  script.onerror = () => {
    analyticsState = "failed";
    pendingEvents.length = 0;
  };
  document.head.appendChild(script);
}

export function trackEvent(name: string, properties?: AnalyticsProperties) {
  if (analyticsState === "ready" && window.umami?.track) {
    window.umami.track(name, properties);
  } else if (analyticsState === "loading") {
    pendingEvents.push({ name, properties });
  }
}
