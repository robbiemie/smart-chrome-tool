import { useCallback, useEffect, useMemo, useState } from 'react';
import { notification } from 'antd';

interface HeaderRuleItem {
  id: string;
  name: string;
  enabled: boolean;
  condition: {
    urlFilter: string;
    resourceTypes: string[];
  };
  headers: Array<{
    key: string;
    value: string;
    operation: 'set' | 'remove';
  }>;
}

interface HeaderProfile {
  id: string;
  name: string;
  enabled: boolean;
  rules: HeaderRuleItem[];
}

interface LegacyPageHeaderConfig {
  enabled: boolean;
  headers: Record<string, string>;
}

type LegacyPageHeadersMap = Record<string, LegacyPageHeaderConfig>;
export interface HeaderPairItem {
  id: string;
  keyText: string;
  valueText: string;
}

const HEADER_PROFILES_STORAGE_KEY = 'ajaxToolsHeaderProfiles';
const LEGACY_PAGE_HEADERS_STORAGE_KEY = 'ajaxToolsPageHeadersMap';
const DEFAULT_PROFILE_ID = 'default';

const getPageOrigin = () => {
  const query = new URLSearchParams(window.location.search);
  return decodeURIComponent(query.get('pageOrigin') || '');
};

const DEFAULT_HEADER_KEY = 'x-debug-mode';
const DEFAULT_HEADER_VALUE = '1';

const createHeaderPair = (keyText = '', valueText = ''): HeaderPairItem => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  keyText,
  valueText,
});

const mapToHeaderPairs = (headers: Record<string, string> = {}) => {
  const entries = Object.entries(headers);
  if (entries.length < 1) {
    return [createHeaderPair()];
  }
  return entries.map(([keyText, valueText]) => createHeaderPair(keyText, valueText));
};

const getHostname = (origin: string) => {
  try {
    return new URL(origin).hostname;
  } catch (e) {
    return '';
  }
};

const normalizeUrlFilter = (origin: string) => {
  const hostname = getHostname(origin);
  return hostname ? `||${hostname}^` : '';
};

const buildRuleId = (origin: string) => `origin:${origin}`;

const getDefaultProfiles = (): HeaderProfile[] => ([
  {
    id: DEFAULT_PROFILE_ID,
    name: 'Default',
    enabled: true,
    rules: [],
  },
]);

const findOrCreateDefaultProfile = (profiles: HeaderProfile[]) => {
  const list = Array.isArray(profiles) ? [...profiles] : [];
  const existingIndex = list.findIndex((item) => item.id === DEFAULT_PROFILE_ID);
  if (existingIndex >= 0) return { profiles: list, profileIndex: existingIndex };
  list.push({
    id: DEFAULT_PROFILE_ID,
    name: 'Default',
    enabled: true,
    rules: [],
  });
  return { profiles: list, profileIndex: list.length - 1 };
};

const findRuleByOrigin = (profiles: HeaderProfile[], origin: string) => {
  const ruleId = buildRuleId(origin);
  for (let i = 0; i < profiles.length; i += 1) {
    const rules = Array.isArray(profiles[i].rules) ? profiles[i].rules : [];
    const rule = rules.find((item) => item.id === ruleId);
    if (rule) {
      return { rule, profileIndex: i };
    }
  }
  return { rule: null, profileIndex: -1 };
};

const headersObjectToRuleHeaders = (headers: Record<string, string> = {}) =>
  Object.keys(headers).map((key) => ({
    key,
    value: String(headers[key] ?? ''),
    operation: 'set' as const,
  }));

const getProfilesFromStorage = async (): Promise<HeaderProfile[]> => {
  const storage = await chrome.storage.local.get([HEADER_PROFILES_STORAGE_KEY, LEGACY_PAGE_HEADERS_STORAGE_KEY]);
  const profiles = storage[HEADER_PROFILES_STORAGE_KEY];
  if (Array.isArray(profiles)) {
    return profiles as HeaderProfile[];
  }
  const legacyMap = storage[LEGACY_PAGE_HEADERS_STORAGE_KEY] as LegacyPageHeadersMap | undefined;
  if (legacyMap && typeof legacyMap === 'object') {
    const rules = Object.keys(legacyMap).map((origin) => ({
      id: buildRuleId(origin),
      name: origin,
      enabled: legacyMap[origin]?.enabled !== false,
      condition: {
        urlFilter: normalizeUrlFilter(origin),
        resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest'],
      },
      headers: headersObjectToRuleHeaders(legacyMap[origin]?.headers || {}),
    }));
    return [{
      id: DEFAULT_PROFILE_ID,
      name: 'Default',
      enabled: true,
      rules,
    }];
  }
  return getDefaultProfiles();
};

const syncPageHeadersRules = () => new Promise<void>((resolve, reject) => {
  if (!chrome.runtime?.sendMessage) {
    resolve();
    return;
  }
  chrome.runtime.sendMessage({ type: 'SYNC_PAGE_HEADERS_RULES' }, (response) => {
    if (chrome.runtime.lastError) {
      reject(new Error(chrome.runtime.lastError.message));
      return;
    }
    if (!response?.ok) {
      reject(new Error(response?.message || 'sync page header rules failed'));
      return;
    }
    resolve();
  });
});

export const usePageHeaders = () => {
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [headerPairs, setHeaderPairs] = useState<HeaderPairItem[]>([createHeaderPair()]);
  const [quickEnabled, setQuickEnabled] = useState(false);
  const [hasConfiguredHeaders, setHasConfiguredHeaders] = useState(false);
  const [quickToggling, setQuickToggling] = useState(false);
  const pageOrigin = useMemo(() => getPageOrigin(), []);

  const loadRuleMeta = useCallback(async () => {
    if (!chrome.storage || !pageOrigin) return;
    const profiles = await getProfilesFromStorage();
    const { rule } = findRuleByOrigin(profiles, pageOrigin);
    const headers = (rule?.headers || []).reduce<Record<string, string>>((acc, item) => {
      if (!item?.key || item.operation === 'remove') return acc;
      acc[item.key] = item.value;
      return acc;
    }, {});
    const nextEnabled = rule?.enabled ?? false;
    setQuickEnabled(nextEnabled);
    setHasConfiguredHeaders(Object.keys(headers).length > 0);
    return { headers, enabled: nextEnabled };
  }, [pageOrigin]);

  const load = useCallback(async () => {
    const meta = await loadRuleMeta();
    if (!meta) return;
    const { headers, enabled } = meta;
    setEnabled(enabled);
    setHeaderPairs(mapToHeaderPairs(headers));
  }, [loadRuleMeta]);

  useEffect(() => {
    loadRuleMeta();
  }, [loadRuleMeta]);

  const openModal = useCallback(async () => {
    await load();
    setVisible(true);
  }, [load]);

  const save = useCallback(async (nextPairs: HeaderPairItem[], nextEnabled: boolean) => {
    if (!chrome.storage) return false;
    if (!pageOrigin) {
      notification.error({
        message: 'Save failed',
        description: 'Current page origin is unavailable.'
      });
      return false;
    }
    try {
      const normalizedHeaders = nextPairs.reduce<Record<string, string>>((acc, item) => {
        const keyText = item.keyText.trim();
        if (!keyText) return acc;
        acc[keyText] = item.valueText;
        return acc;
      }, {});
      const profilesFromStorage = await getProfilesFromStorage();
      const { profiles, profileIndex } = findOrCreateDefaultProfile(profilesFromStorage);
      const ruleId = buildRuleId(pageOrigin);
      const existingRuleIndex = profiles[profileIndex].rules.findIndex((item) => item.id === ruleId);
      const nextRule: HeaderRuleItem = {
        id: ruleId,
        name: pageOrigin,
        enabled: nextEnabled,
        condition: {
          urlFilter: normalizeUrlFilter(pageOrigin),
          resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest'],
        },
        headers: headersObjectToRuleHeaders(normalizedHeaders),
      };
      if (existingRuleIndex >= 0) {
        profiles[profileIndex].rules[existingRuleIndex] = nextRule;
      } else {
        profiles[profileIndex].rules.push(nextRule);
      }
      await chrome.storage.local.set({
        [HEADER_PROFILES_STORAGE_KEY]: profiles,
      });
      await syncPageHeadersRules();
      setEnabled(nextEnabled);
      setHeaderPairs(mapToHeaderPairs(normalizedHeaders));
      setQuickEnabled(nextEnabled);
      setHasConfiguredHeaders(Object.keys(normalizedHeaders).length > 0);
      setVisible(false);
      return true;
    } catch (error: any) {
      notification.error({
        message: 'Save failed',
        description: error?.message || 'Unable to save headers'
      });
      return false;
    }
  }, [pageOrigin]);

  const addHeaderPair = useCallback(() => {
    setHeaderPairs((prev) => [...prev, createHeaderPair()]);
  }, []);

  const removeHeaderPair = useCallback((id: string) => {
    setHeaderPairs((prev) => {
      const next = prev.filter((item) => item.id !== id);
      return next.length > 0 ? next : [createHeaderPair()];
    });
  }, []);

  const updateHeaderPair = useCallback((id: string, field: 'keyText' | 'valueText', value: string) => {
    setHeaderPairs((prev) => prev.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }, []);

  const toggleQuickEnabled = useCallback(async (nextEnabled: boolean) => {
    if (!pageOrigin) {
      notification.error({
        message: 'Toggle failed',
        description: 'Current page origin is unavailable.'
      });
      return false;
    }
    setQuickToggling(true);
    try {
      const latestMeta = await loadRuleMeta();
      const latestHeaders = latestMeta?.headers || {};
      const latestPairs = mapToHeaderPairs(latestHeaders);
      const hasLatestHeaders = Object.keys(latestHeaders).length > 0;
      const pairs = (hasLatestHeaders || !nextEnabled)
        ? latestPairs
        : [createHeaderPair(DEFAULT_HEADER_KEY, DEFAULT_HEADER_VALUE)];
      const result = await save(pairs, nextEnabled);
      if (result && !hasLatestHeaders && nextEnabled) {
        notification.success({
          message: 'Enabled quickly',
          description: `Added default header: ${DEFAULT_HEADER_KEY}: ${DEFAULT_HEADER_VALUE}`
        });
      }
      return result;
    } finally {
      setQuickToggling(false);
    }
  }, [loadRuleMeta, pageOrigin, save]);

  return {
    visible,
    enabled,
    quickEnabled,
    hasConfiguredHeaders,
    quickToggling,
    pageOrigin,
    headerPairs,
    setVisible,
    setEnabled,
    addHeaderPair,
    removeHeaderPair,
    updateHeaderPair,
    openModal,
    save,
    toggleQuickEnabled,
  };
};
