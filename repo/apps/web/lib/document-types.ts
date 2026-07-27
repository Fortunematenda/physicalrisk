const defaultDocumentTypes = [
  'Architecture Doc',
  'Architecture Document',
  'EA Blueprint',
  'Functional Specification',
  'Technical Specification',
  'API Contract',
  'Data Model Definition',
  'Business Rule',
  'Governance Standard',
  'Operating Procedure',
  'Developer Pack',
  'Research Note',
  'Marketing Collateral',
  'Article',
  'Template',
  'Decision Record',
  'Meeting Minutes',
  'Release Note',
];

export interface AddDocumentTypeResult {
  success: boolean;
  error?: string;
  customTypes: string[];
  selectedType?: string;
}

export function addDocumentType(
  newType: string,
  existingCustomTypes: string[],
  existingDefaultTypes: string[] = defaultDocumentTypes
): AddDocumentTypeResult {
  const trimmed = newType.trim();
  
  if (!trimmed) {
    return { success: false, error: 'Enter a document type name.', customTypes: existingCustomTypes };
  }

  const allTypes = [...new Set([...existingDefaultTypes, ...existingCustomTypes])].sort((a, b) => a.localeCompare(b));
  const existingCaseInsensitive = allTypes.find((type) => type.toLowerCase() === trimmed.toLowerCase());

  if (existingCaseInsensitive) {
    return { success: true, customTypes: existingCustomTypes, selectedType: existingCaseInsensitive };
  }

  const updatedCustomTypes = [...existingCustomTypes, trimmed].sort((a, b) => a.localeCompare(b));
  return { success: true, customTypes: updatedCustomTypes, selectedType: trimmed };
}

export function getAvailableDocumentTypes(customTypes: string[]): string[] {
  return [...new Set([...defaultDocumentTypes, ...customTypes])].sort((a, b) => a.localeCompare(b));
}
