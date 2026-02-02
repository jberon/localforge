import type { DataField } from "@shared/schema";

export function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

export function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function pluralize(str: string): string {
  if (str.endsWith('y')) {
    return str.slice(0, -1) + 'ies';
  }
  if (str.endsWith('s') || str.endsWith('x') || str.endsWith('ch') || str.endsWith('sh')) {
    return str + 'es';
  }
  return str + 's';
}

export function getDrizzleType(field: DataField): string {
  switch (field.type) {
    case 'text':
    case 'email':
    case 'url':
    case 'textarea':
      return 'text';
    case 'number':
      return 'integer';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'timestamp';
    default:
      return 'text';
  }
}
