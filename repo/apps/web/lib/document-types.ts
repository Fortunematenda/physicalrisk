const defaultDocumentTypes = [
  'Product Architecture', 'Enterprise Architecture', 'Functional Specifications', 'Technical Specifications',
  'API Specifications', 'Data Models', 'Business Rules', 'Governance Standards', 'Operating Procedures',
  'Developer Packs', 'Research Library', 'Marketing Assets', 'Articles', 'Templates', 'Decisions',
  'Meeting Records', 'Release Notes',
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
