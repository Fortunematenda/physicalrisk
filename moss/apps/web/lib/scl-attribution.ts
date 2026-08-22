/** Campaign / UTM attribution for the public SCL funnel (optional fields). */
export type SclAttribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  series?: string;
  article?: string;
  cta?: string;
  referrer?: string;
  landingPage?: string;
};

export function readSclAttribution(searchParams: URLSearchParams, landingPage?: string): SclAttribution {
  const get = (key: string) => {
    const v = searchParams.get(key);
    return v && v.trim() ? v.trim() : undefined;
  };
  return {
    source: get('utm_source') || get('source'),
    medium: get('utm_medium') || get('medium'),
    campaign: get('utm_campaign') || get('campaign'),
    content: get('utm_content') || get('content'),
    term: get('utm_term') || get('term'),
    series: get('series'),
    article: get('article'),
    cta: get('cta'),
    referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
    landingPage: landingPage || (typeof window !== 'undefined' ? window.location.pathname : undefined),
  };
}

export function attributionSummary(a: SclAttribution | null | undefined): string {
  if (!a) return 'Direct';
  const parts = [a.source, a.campaign, a.medium].filter(Boolean);
  return parts.length ? parts.join(' / ') : 'Direct';
}
