import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OrgState {
  currentOrgId: string | null;
  setCurrentOrg: (orgId: string | null) => void;
}

export const useOrgStore = create<OrgState>()(
  persist(
    (set) => ({
      currentOrgId: null,
      setCurrentOrg: (orgId) => set({ currentOrgId: orgId }),
    }),
    { name: 'symbia-org' }
  )
);
