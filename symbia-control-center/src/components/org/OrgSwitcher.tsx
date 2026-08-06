import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useOrgStore } from '@/stores/orgStore';

export function OrgSwitcher() {
  const { organizations } = useAuthStore();
  const { currentOrgId, setCurrentOrg } = useOrgStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentOrg = organizations.find((o) => o.id === currentOrgId);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Set first org as default if none selected, or reset if current org is invalid
  useEffect(() => {
    if (organizations.length > 0) {
      const isValidOrg = organizations.some((o) => o.id === currentOrgId);
      if (!currentOrgId || !isValidOrg) {
        setCurrentOrg(organizations[0].id);
      }
    }
  }, [currentOrgId, organizations, setCurrentOrg]);

  if (organizations.length === 0) {
    return null;
  }

  if (organizations.length === 1) {
    return (
      <div className="px-3 py-1.5 text-sm text-text-secondary bg-surface-sunken border border-border rounded-md">
        {organizations[0].name}
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-surface-sunken border border-border rounded-md hover:border-border-emphasis transition-colors duration-fast"
      >
        <span className="text-text-primary">
          {currentOrg?.name || 'Select org...'}
        </span>
        <svg
          className={`w-4 h-4 text-text-muted transition-transform duration-fast ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-surface-overlay border border-border rounded-lg shadow-lg z-dropdown animate-fade-in">
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={() => {
                setCurrentOrg(org.id);
                setIsOpen(false);
              }}
              className={`
                w-full text-left px-3 py-2 text-sm transition-colors duration-fast
                ${
                  org.id === currentOrgId
                    ? 'bg-primary-500/15 text-primary-500'
                    : 'text-text-primary hover:bg-surface-highlight'
                }
                first:rounded-t-lg last:rounded-b-lg
              `}
            >
              <div className="font-medium">{org.name}</div>
              <div className="text-xs text-text-muted capitalize">{org.role}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
