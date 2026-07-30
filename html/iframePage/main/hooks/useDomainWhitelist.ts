import { useCallback, useEffect, useMemo, useState } from 'react';

const DOMAIN_WHITELIST_STORAGE_KEY = 'ajaxToolsDomainWhitelist';
const DEFAULT_WHITELIST = ['*'];

// Read the host page origin passed to the iframe via ?pageOrigin=...
function getPageHostname(): string {
  try {
    const query = new URLSearchParams(window.location.search);
    const origin = decodeURIComponent(query.get('pageOrigin') || '');
    if (!origin) return '';
    return new URL(origin).hostname || '';
  } catch (e) {
    return '';
  }
}

// Convert a wildcard domain pattern into a RegExp.
// Rules:
//   '*'            -> matches everything
//   '*.foo.com'    -> matches foo.com and any subdomain (a.b.foo.com)
//   'foo.com'      -> matches foo.com exactly
//   'a*.foo.com'   -> matches ab.foo.com, ac.foo.com, ...
export function patternToRegExp(pattern: string): RegExp {
  if (!pattern) return /^$/;
  if (pattern === '*') return /^.*$/;
  // Escape regex specials except '*'.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  // '*.foo.com' should also match the bare 'foo.com' — make the leading
  // '.*\.' segment optional so both forms hit.
  if (pattern.startsWith('*.')) {
    const rest = escaped.substring(4); // strip leading '.*\.'
    return new RegExp(`^(?:.*\\.)?${rest}$`, 'i');
  }
  return new RegExp(`^${escaped}$`, 'i');
}

export function isHostnameWhitelisted(hostname: string, patterns: string[]): boolean {
  if (!hostname) return false;
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((pattern) => {
    try {
      return patternToRegExp(pattern).test(hostname);
    } catch (e) {
      return false;
    }
  });
}

export const useDomainWhitelist = () => {
  const [whitelist, setWhitelist] = useState<string[]>(DEFAULT_WHITELIST);
  const [ready, setReady] = useState(false);

  const currentHostname = useMemo(() => getPageHostname(), []);

  useEffect(() => {
    if (!chrome.storage?.local) return;

    chrome.storage.local.get([DOMAIN_WHITELIST_STORAGE_KEY], (result) => {
      const stored = result[DOMAIN_WHITELIST_STORAGE_KEY];
      let list = Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_WHITELIST;
      // If the list has specific domains alongside '*', drop '*' — it's only
      // a fallback for an otherwise empty list.
      if (list.includes('*') && list.length > 1) {
        list = list.filter((item) => item !== '*');
      }
      setWhitelist(list);
      setReady(true);
    });

    const handler = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[DOMAIN_WHITELIST_STORAGE_KEY]) {
        let next = changes[DOMAIN_WHITELIST_STORAGE_KEY].newValue;
        if (!Array.isArray(next) || next.length === 0) next = DEFAULT_WHITELIST;
        if (next.includes('*') && next.length > 1) {
          next = next.filter((item) => item !== '*');
        }
        setWhitelist(next);
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  const addDomain = useCallback((domain: string) => {
    const trimmed = domain.trim();
    if (!trimmed) return;
    setWhitelist((previous) => {
      if (previous.includes(trimmed)) return previous;
      // When adding a specific domain, remove the wildcard '*' so only
      // explicit domains are matched. The wildcard is only a fallback when
      // the list is otherwise empty.
      let next = [...previous, trimmed];
      if (trimmed !== '*') {
        next = next.filter((item) => item !== '*');
      }
      if (chrome.storage?.local) {
        chrome.storage.local.set({ [DOMAIN_WHITELIST_STORAGE_KEY]: next });
      }
      return next;
    });
  }, []);

  const removeDomain = useCallback((domain: string) => {
    setWhitelist((previous) => {
      const next = previous.filter((item) => item !== domain);
      // Fall back to '*' when the list becomes empty so the extension
      // never silently blocks every page.
      const finalList = next.length > 0 ? next : DEFAULT_WHITELIST;
      if (chrome.storage?.local) {
        chrome.storage.local.set({ [DOMAIN_WHITELIST_STORAGE_KEY]: finalList });
      }
      return finalList;
    });
  }, []);

  return {
    domainWhitelist: whitelist,
    currentHostname,
    addDomain,
    removeDomain,
  };
};
