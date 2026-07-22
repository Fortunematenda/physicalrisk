'use client';

import { SimpleCrud } from '@/components/simple-crud';

export default function DocumentTypesPage() {
  return (
    <SimpleCrud
      title="Document Types"
      description="Manage document classification types used on Import Document and routing. These are separate from File Types (file extensions)."
      endpoint="/document-types"
      fields={[
        { key: 'name', label: 'Name', required: true, placeholder: 'Technical Specification' },
        { key: 'code', label: 'Code', placeholder: 'Auto-generated from name if left blank' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'active', label: 'Active', type: 'checkbox', defaultValue: true },
      ]}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code', render: (item) => <span className="mono">{item.code}</span> },
        { key: 'description', label: 'Description' },
        { key: 'active', label: 'Status' },
      ]}
    />
  );
}
