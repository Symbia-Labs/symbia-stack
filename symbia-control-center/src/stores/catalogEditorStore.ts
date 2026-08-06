/**
 * Catalog Editor Store
 *
 * Zustand store for managing catalog editor state including
 * resource selection, dirty tracking, and CRUD operations.
 */

import { create } from 'zustand';
import type {
  CatalogResource,
  ResourceType,
  ResourceStatus,
} from '@/types/catalog';

interface CatalogEditorState {
  // Resources
  resources: CatalogResource[];
  isLoadingResources: boolean;
  resourcesError: string | null;

  // Filters
  typeFilter: ResourceType | 'all';
  statusFilter: ResourceStatus | 'all';
  searchQuery: string;

  // Selection
  selectedResourceId: string | null;
  selectedResource: CatalogResource | null;

  // Editing
  draftResource: CatalogResource | null;
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;

  // New resource creation
  isCreating: boolean;
  newResourceType: ResourceType | null;

  // Actions - Resources
  setResources: (resources: CatalogResource[]) => void;
  addResource: (resource: CatalogResource) => void;
  updateResourceInList: (id: string, updates: Partial<CatalogResource>) => void;
  removeResource: (id: string) => void;
  setLoadingResources: (loading: boolean) => void;
  setResourcesError: (error: string | null) => void;

  // Actions - Filters
  setTypeFilter: (type: ResourceType | 'all') => void;
  setStatusFilter: (status: ResourceStatus | 'all') => void;
  setSearchQuery: (query: string) => void;

  // Actions - Selection
  selectResource: (id: string | null) => void;
  clearSelection: () => void;

  // Actions - Editing
  setDraftResource: (resource: CatalogResource | null) => void;
  updateDraft: (updates: Partial<CatalogResource>) => void;
  updateDraftMetadata: (metadata: Record<string, unknown>) => void;
  markDirty: () => void;
  markClean: () => void;
  discardChanges: () => void;

  // Actions - Save
  setSaving: (saving: boolean) => void;
  setSaveError: (error: string | null) => void;

  // Actions - Create new
  startCreating: (type: ResourceType) => void;
  cancelCreating: () => void;

  // Computed
  getFilteredResources: () => CatalogResource[];
}

/**
 * Compare two resources to check if they're equal (for dirty tracking)
 * Only compares editable fields, not server-generated ones like updatedAt
 */
function isResourceEqual(a: CatalogResource, b: CatalogResource): boolean {
  // Compare basic fields
  if (a.name !== b.name) return false;
  if (a.key !== b.key) return false;
  if (a.description !== b.description) return false;
  if (a.status !== b.status) return false;

  // Compare tags (order doesn't matter)
  const aTags = [...a.tags].sort();
  const bTags = [...b.tags].sort();
  if (aTags.length !== bTags.length) return false;
  if (!aTags.every((t, i) => t === bTags[i])) return false;

  // Compare metadata (deep compare)
  if (JSON.stringify(a.metadata) !== JSON.stringify(b.metadata)) return false;

  return true;
}

export const useCatalogEditorStore = create<CatalogEditorState>((set, get) => ({
  // Initial state
  resources: [],
  isLoadingResources: false,
  resourcesError: null,

  typeFilter: 'all',
  statusFilter: 'all',
  searchQuery: '',

  selectedResourceId: null,
  selectedResource: null,

  draftResource: null,
  isDirty: false,
  isSaving: false,
  saveError: null,

  isCreating: false,
  newResourceType: null,

  // Actions - Resources
  setResources: (resources) => set({ resources }),

  addResource: (resource) =>
    set((state) => ({
      resources: [resource, ...state.resources],
    })),

  updateResourceInList: (id, updates) =>
    set((state) => ({
      resources: state.resources.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
      selectedResource:
        state.selectedResource?.id === id
          ? { ...state.selectedResource, ...updates }
          : state.selectedResource,
    })),

  removeResource: (id) =>
    set((state) => ({
      resources: state.resources.filter((r) => r.id !== id),
      selectedResourceId:
        state.selectedResourceId === id ? null : state.selectedResourceId,
      selectedResource:
        state.selectedResource?.id === id ? null : state.selectedResource,
      draftResource:
        state.draftResource?.id === id ? null : state.draftResource,
      isDirty: state.draftResource?.id === id ? false : state.isDirty,
    })),

  setLoadingResources: (loading) => set({ isLoadingResources: loading }),

  setResourcesError: (error) => set({ resourcesError: error }),

  // Actions - Filters
  setTypeFilter: (type) => set({ typeFilter: type }),

  setStatusFilter: (status) => set({ statusFilter: status }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  // Actions - Selection
  selectResource: (id) => {
    const state = get();

    // If there are unsaved changes, don't switch
    if (state.isDirty && id !== state.selectedResourceId) {
      // The UI should handle this with a confirmation dialog
      return;
    }

    if (id === null) {
      set({
        selectedResourceId: null,
        selectedResource: null,
        draftResource: null,
        isDirty: false,
        isCreating: false,
        newResourceType: null,
      });
      return;
    }

    const resource = state.resources.find((r) => r.id === id) || null;
    set({
      selectedResourceId: id,
      selectedResource: resource,
      draftResource: resource ? { ...resource } : null,
      isDirty: false,
      isCreating: false,
      newResourceType: null,
    });
  },

  clearSelection: () =>
    set({
      selectedResourceId: null,
      selectedResource: null,
      draftResource: null,
      isDirty: false,
      isCreating: false,
      newResourceType: null,
    }),

  // Actions - Editing
  setDraftResource: (resource) =>
    set({
      draftResource: resource,
      isDirty: false,
    }),

  updateDraft: (updates) =>
    set((state) => {
      if (!state.draftResource) return { draftResource: null };

      const newDraft = { ...state.draftResource, ...updates };

      // Compare with original to determine if actually dirty
      const original = state.isCreating ? null : state.selectedResource;
      const isDirty = !original || !isResourceEqual(original, newDraft);

      return { draftResource: newDraft, isDirty };
    }),

  updateDraftMetadata: (metadata) =>
    set((state) => {
      if (!state.draftResource) return { draftResource: null };

      const newDraft = {
        ...state.draftResource,
        metadata: { ...state.draftResource.metadata, ...metadata },
      };

      // Compare with original to determine if actually dirty
      const original = state.isCreating ? null : state.selectedResource;
      const isDirty = !original || !isResourceEqual(original, newDraft);

      return { draftResource: newDraft, isDirty };
    }),

  markDirty: () => set({ isDirty: true }),

  markClean: () => set({ isDirty: false }),

  discardChanges: () => {
    const state = get();
    if (state.isCreating) {
      set({
        isCreating: false,
        newResourceType: null,
        draftResource: null,
        isDirty: false,
      });
    } else if (state.selectedResource) {
      set({
        draftResource: { ...state.selectedResource },
        isDirty: false,
      });
    }
  },

  // Actions - Save
  setSaving: (saving) => set({ isSaving: saving }),

  setSaveError: (error) => set({ saveError: error }),

  // Actions - Create new
  startCreating: (type) => {
    const now = new Date().toISOString();
    const newResource: CatalogResource = {
      id: '', // Will be assigned by server
      key: '',
      name: '',
      description: '',
      type,
      status: 'draft',
      orgId: '', // Will be set from current org
      tags: [],
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };

    set({
      isCreating: true,
      newResourceType: type,
      selectedResourceId: null,
      selectedResource: null,
      draftResource: newResource,
      isDirty: false,
    });
  },

  cancelCreating: () =>
    set({
      isCreating: false,
      newResourceType: null,
      draftResource: null,
      isDirty: false,
    }),

  // Computed
  getFilteredResources: () => {
    const state = get();
    let filtered = state.resources;

    // Type filter
    if (state.typeFilter !== 'all') {
      filtered = filtered.filter((r) => r.type === state.typeFilter);
    }

    // Status filter
    if (state.statusFilter !== 'all') {
      filtered = filtered.filter((r) => r.status === state.statusFilter);
    }

    // Search query
    if (state.searchQuery.trim()) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.key.toLowerCase().includes(query) ||
          r.description?.toLowerCase().includes(query) ||
          r.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    return filtered;
  },
}));

// Selector hooks for common patterns
export const useSelectedResource = () =>
  useCatalogEditorStore((state) => state.selectedResource);

export const useDraftResource = () =>
  useCatalogEditorStore((state) => state.draftResource);

export const useIsDirty = () =>
  useCatalogEditorStore((state) => state.isDirty);

export const useIsCreating = () =>
  useCatalogEditorStore((state) => state.isCreating);

export const useFilteredResources = () =>
  useCatalogEditorStore((state) => state.getFilteredResources());
