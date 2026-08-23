export type WordpressNavItem = {
  label: string;
  href: string;
  children?: WordpressNavItem[];
};

export type WordpressPublicNav = {
  items: WordpressNavItem[];
  ctaLabel: string;
  ctaHref: string;
  tagline: string;
  phoneLabel: string;
  phoneHref: string;
  emailLabel: string;
  emailHref: string;
};

export function wordpressBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_WORDPRESS_URL || 'https://test.physicalrisk.com').replace(/\/$/, '');
}

export function defaultWordpressPublicNav(base = wordpressBaseUrl()): WordpressPublicNav {
  return {
    items: [
      { label: 'Security Governance', href: `${base}/#ourservices` },
      { label: 'Customer Solutions', href: `${base}/#ourservices` },
      { label: 'Insights', href: `${base}/#insights` },
      { label: 'Resources', href: `${base}/#insights` },
      { label: 'Consultant Network', href: `${base}/#insights` },
      { label: 'Contact', href: `${base}/#contact` },
    ],
    ctaLabel: 'Book MOSS Assessment',
    ctaHref: `${base}/#contact`,
    tagline: 'Independent, Accredited & Experienced Security Risk Professionals',
    phoneLabel: '+27 82 410 9305',
    phoneHref: 'tel:+27824109305',
    emailLabel: 'info@physicalrisk.com',
    emailHref: 'mailto:info@physicalrisk.com',
  };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, ' ')
    .replace(/[?\uFFFD]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function absolutizeHref(href: string, base: string): string {
  const raw = decodeEntities(href).trim();
  if (!raw || raw === '#') return base;
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('/')) return `${base}${raw}`;
  if (raw.startsWith('#')) return `${base}/${raw}`;
  return `${base}/${raw.replace(/^\.\//, '')}`;
}

function phoneHrefFromLabel(label: string): string {
  const digits = label.replace(/[^\d+]/g, '');
  if (!digits) return 'tel:';
  return `tel:${digits.startsWith('+') ? digits : `+${digits}`}`;
}

function parseTopLevelMenuItems(menuHtml: string, base: string): WordpressNavItem[] {
  const items: WordpressNavItem[] = [];
  // Live WP markup puts href before class on ElementsKit links.
  const linkMatches = [
    ...menuHtml.matchAll(
      /<a\b[^>]*href="([^"]*)"[^>]*class="[^"]*ekit-menu-nav-link[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
    ),
    ...menuHtml.matchAll(
      /<a\b[^>]*class="[^"]*ekit-menu-nav-link[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ];

  for (const link of linkMatches) {
    const label = stripTags(link[2]);
    if (!label) continue;
    const href = absolutizeHref(link[1], base);
    if (items.some((item) => item.label === label && item.href === href)) continue;
    items.push({ label, href });
  }
  if (items.length) return items;

  const liRegex = /<li\b[^>]*\bmenu-item\b[^>]*>([\s\S]*?)(?=<li\b[^>]*\bmenu-item\b|<\/ul>)/gi;
  let match: RegExpExecArray | null;
  while ((match = liRegex.exec(menuHtml))) {
    const link = match[1].match(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const label = stripTags(link[2]);
    if (!label) continue;
    items.push({ label, href: absolutizeHref(link[1], base) });
  }
  return items;
}

export function parseWordpressPublicNav(html: string, base = wordpressBaseUrl()): WordpressPublicNav {
  const fallback = defaultWordpressPublicNav(base);
  const menuMatch = html.match(/<ul[^>]*\bid=["']menu-main-menu["'][^>]*>([\s\S]*?)<\/ul>/i);
  const items = menuMatch ? parseTopLevelMenuItems(menuMatch[1], base) : [];

  const ctaMatch =
    html.match(/<a\b[^>]*href="([^"]*)"[^>]*class="[^"]*elementskit-btn[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/a>/i) ||
    html.match(/<a\b[^>]*class="[^"]*elementskit-btn[^"]*"[^>]*href="([^"]*)"[^>]*>\s*([\s\S]*?)\s*<\/a>/i);

  const titles = [...html.matchAll(/ekit_page_list_title_title"[^>]*>\s*([\s\S]*?)\s*</gi)].map((m) =>
    stripTags(m[1]),
  );

  const tagline =
    titles.find((t) => /independent|accredited|experienced/i.test(t)) || fallback.tagline;
  const phoneLabel =
    titles.find((t) => /\+?\d[\d\s().-]{6,}\d/.test(t)) || fallback.phoneLabel;
  const emailLabel = titles.find((t) => /@/.test(t)) || fallback.emailLabel;

  return {
    items: items.length ? items : fallback.items,
    ctaLabel: ctaMatch ? stripTags(ctaMatch[2]) || fallback.ctaLabel : fallback.ctaLabel,
    ctaHref: ctaMatch ? absolutizeHref(ctaMatch[1], base) : fallback.ctaHref,
    tagline,
    phoneLabel,
    phoneHref: phoneHrefFromLabel(phoneLabel),
    emailLabel,
    emailHref: `mailto:${emailLabel.replace(/^mailto:/i, '')}`,
  };
}

export async function fetchWordpressPublicNav(base = wordpressBaseUrl()): Promise<WordpressPublicNav> {
  const fallback = defaultWordpressPublicNav(base);
  try {
    const response = await fetch(`${base}/?moss-nav=${Date.now()}`, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'physicalrisk-moss-web/wordpress-nav',
        'Cache-Control': 'no-cache',
      },
      cache: 'no-store',
    });
    if (!response.ok) return fallback;
    const html = await response.text();
    return parseWordpressPublicNav(html, base);
  } catch {
    return fallback;
  }
}
