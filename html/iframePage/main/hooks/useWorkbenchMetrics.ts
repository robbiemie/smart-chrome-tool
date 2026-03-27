import { useMemo } from 'react';
import { AjaxGroup, WorkbenchMetrics } from '../types/registry';

export const useWorkbenchMetrics = (ajaxDataList: AjaxGroup[]): WorkbenchMetrics => useMemo(() => {
  const totalGroups = ajaxDataList.length;
  const totalRules = ajaxDataList.reduce((sum, item) => sum + item.interfaceList.length, 0);
  const enabledRules = ajaxDataList.reduce(
    (sum, item) => sum + item.interfaceList.filter((rule) => rule.open).length,
    0
  );
  const regexRules = ajaxDataList.reduce(
    (sum, item) => sum + item.interfaceList.filter((rule) => rule.matchType === 'regex').length,
    0
  );

  return {
    totalGroups,
    totalRules,
    enabledRules,
    regexRules,
  };
}, [ajaxDataList]);
