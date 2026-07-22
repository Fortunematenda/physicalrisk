import Link from 'next/link';
export function PageHeader({ title, description, action }: { title: string; description?: string; action?: { label: string; href: string } }) {
  return <div className="page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <Link href={action.href} className="button primary">{action.label}</Link>}</div>;
}
