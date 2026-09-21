const measurementId = import.meta.env.VITE_GOOGLE_ANALYTICS_ID?.trim();

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function initializeAnalytics() {
  if (typeof window === 'undefined' || window.gtag || !measurementId) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = (...args: unknown[]) => window.dataLayer.push(args);
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
}

export function trackPageView(path = `${window.location.pathname}${window.location.hash}`) {
  window.gtag?.('event', 'page_view', {
    page_title: document.title,
    page_location: `${window.location.origin}${path}`,
    page_path: path,
  });
}
