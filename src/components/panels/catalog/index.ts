/**
 * Catalog Editor Components
 *
 * Barrel exports for the catalog editor.
 */

// Main components
export { CatalogList } from './CatalogList';
export { CatalogToolbar } from './CatalogToolbar';
export { ResourceEditor } from './ResourceEditor';

// Shared sections
export { BasicInfoSection } from './sections/BasicInfoSection';
export { TagsSection } from './sections/TagsSection';
export { MetadataSection } from './sections/MetadataSection';

// Shared utilities
export { TagEditor } from './shared/TagEditor';
export { JsonEditor, JsonDisplay } from './shared/JsonEditor';

// Type-specific sections
export { ContextSchemaSection } from './type-sections/ContextSchemaSection';
export { AssistantConfigSection } from './type-sections/AssistantConfigSection';
