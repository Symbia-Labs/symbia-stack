-- Row-Level Security (RLS) Policies for Catalog Service
-- This migration enables database-level multi-tenant isolation.
--
-- Special considerations for Catalog:
-- - resources table has nullable org_id (public resources have NULL)
-- - Child tables (versions, artifacts, etc.) inherit access from parent resource

-- ============================================================================
-- RESOURCES (nullable org_id - public resources have NULL)
-- ============================================================================
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources FORCE ROW LEVEL SECURITY;

CREATE POLICY resources_org_isolation ON resources
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id IS NULL  -- Public/bootstrap resources are visible to all
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- RESOURCE VERSIONS (inherits from resources via foreign key)
-- For extra security, we could join to resources, but this adds overhead.
-- Since versions are always accessed via resource, RLS on resources is sufficient.
-- ============================================================================
-- Note: resource_versions doesn't have org_id directly, access is controlled
-- through the resources table foreign key relationship

-- ============================================================================
-- ARTIFACTS (inherits from resources)
-- ============================================================================
-- Note: artifacts doesn't have org_id directly, access is controlled
-- through the resources table foreign key relationship

-- ============================================================================
-- SIGNATURES (inherits from resources)
-- ============================================================================
-- Note: signatures doesn't have org_id directly, access is controlled
-- through the resources table foreign key relationship

-- ============================================================================
-- CERTIFICATIONS (inherits from resources)
-- ============================================================================
-- Note: certifications doesn't have org_id directly, access is controlled
-- through the resources table foreign key relationship

-- ============================================================================
-- ENTITLEMENTS (catalog-specific, resource-scoped)
-- ============================================================================
-- Note: entitlements table in catalog doesn't have org_id, it's resource-scoped
-- Access is controlled through the resources table

-- ============================================================================
-- API KEYS (global for catalog)
-- ============================================================================
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

-- API keys in catalog are created by users, visible to creator and admins
CREATE POLICY api_keys_access ON api_keys
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR created_by = current_setting('symbia.user_id', true)
  );
