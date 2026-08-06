import { useState, useEffect } from 'react';
import { defaultAjaxDataList, defaultInterface } from '../../common/value';
import { colorMap } from '../common/constants';
import { ModifyDataModalOnSaveProps } from '../components/ModifyDataModal';
import { AjaxGroup } from '../types/registry';

export const useRegistry = () => {

  const [ajaxToolsSkin, setAjaxToolsSkin] = useState('light');
  const [ajaxDataList, setAjaxDataList] = useState(defaultAjaxDataList);
  const [isRegistry, setIsRegistry] = useState(false);

  // Listen for external storage changes (e.g. the floating rules panel
  // toggling a rule's open state) so the React workbench stays in sync
  // without requiring a reload.
  useEffect(() => {
    if (!chrome.storage?.onChanged) return;

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.ajaxDataList?.newValue) {
        setAjaxDataList(changes.ajaxDataList.newValue as AjaxGroup[]);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const persistAjaxDataList = (nextAjaxDataList: AjaxGroup[]) => {
    setAjaxDataList([...nextAjaxDataList]);
    chrome.storage.local.set({ ajaxDataList: nextAjaxDataList });
  };

  const isGroupDisabled = (group: AjaxGroup) => group.interfaceList.every((item) => !item.open);

  const moveGroupToBottom = (groupList: AjaxGroup[], groupIndex: number) => {
    if (groupIndex >= groupList.length - 1) {
      return groupIndex;
    }

    const [movedGroup] = groupList.splice(groupIndex, 1);
    groupList.push(movedGroup);

    return groupList.length - 1;
  };

  const reorderGroupWhenDisabled = (groupList: AjaxGroup[], groupIndex: number, wasDisabled: boolean) => {
    if (!groupList[groupIndex]) {
      return groupIndex;
    }

    const disabledAfterChange = isGroupDisabled(groupList[groupIndex]);

    if (!wasDisabled && disabledAfterChange) {
      return moveGroupToBottom(groupList, groupIndex);
    }

    return groupIndex;
  };

  // Batch import: when `replace` is true the imported groups fully overwrite
  // the workspace (used for "import all" flows). Otherwise groups are appended
  // so single-group imports never clobber existing rules by accident.
  const onBatchImport = (groups: AjaxGroup[], replace = false) => {
    if (!chrome.storage || !Array.isArray(groups) || groups.length === 0) return;
    const newAjaxDataList = replace ? [...groups] : [...ajaxDataList, ...groups];
    persistAjaxDataList(newAjaxDataList);
  };

  // 新增分组
  const onGroupAdd = () => {
    if (!chrome.storage) return;
    const len = ajaxDataList.length;
    const newAjaxDataList = [...ajaxDataList, {
      summaryText: 'Group Name (Editable)',
      collapseActiveKeys: [],
      headerClass: colorMap[len % 9],
      interfaceList: [{ ...defaultInterface }]
    }];
    persistAjaxDataList(newAjaxDataList);
  };

  const onGroupDelete = (groupIndex: number) => {
    if (!chrome.storage) return;
    const newAjaxDataList = ajaxDataList.filter((_, i) => i !== groupIndex);
    persistAjaxDataList(newAjaxDataList);
  };

  // placement: top|bottom
  const onGroupMove = (groupIndex: number, placement: string) => {
    if (!chrome.storage) return;
    const nextAjaxDataList = [...ajaxDataList];
    const movedItem = nextAjaxDataList.splice(groupIndex, 1)[0];
    if (placement === 'top') {
      nextAjaxDataList.unshift(movedItem);
    } else if (placement === 'bottom') {
      nextAjaxDataList.push(movedItem);
    }
    persistAjaxDataList(nextAjaxDataList);
  };

  const onGroupSummaryTextChange = (e: React.ChangeEvent<HTMLInputElement>, groupIndex: number) => {
    if (!chrome.storage) return;
    const nextAjaxDataList = [...ajaxDataList];
    nextAjaxDataList[groupIndex].summaryText = e.target.value;
    persistAjaxDataList(nextAjaxDataList);
  };

  // 收缩分组 折叠全部keys传[]
  const onCollapseChange = (groupIndex: number, keys: string | string[]) => {
    if (!chrome.storage) return;
    const nextAjaxDataList = [...ajaxDataList];
    nextAjaxDataList[groupIndex].collapseActiveKeys = Array.isArray(keys) ? keys : [keys];
    persistAjaxDataList(nextAjaxDataList);
  };

  const onGroupOpenChange = (groupIndex: number, open: boolean) => {
    if (!chrome.storage) return;
    const nextAjaxDataList = [...ajaxDataList];
    const wasDisabled = isGroupDisabled(nextAjaxDataList[groupIndex]);

    nextAjaxDataList[groupIndex].interfaceList = nextAjaxDataList[groupIndex].interfaceList.map((interfaceItem) => ({
      ...interfaceItem,
      open,
    }));

    const nextGroupIndex = reorderGroupWhenDisabled(nextAjaxDataList, groupIndex, wasDisabled);
    persistAjaxDataList(nextAjaxDataList);

    return nextGroupIndex;
  };

  // interfaceList值变化
  const onInterfaceListChange = (groupIndex: number, interfaceIndex: number, key: string, value: string | boolean) => {
    if (!chrome.storage) return;
    const nextAjaxDataList = [...ajaxDataList];
    const wasDisabled = isGroupDisabled(nextAjaxDataList[groupIndex]);

    if (key === 'headers' || key === 'responseText') {
      try {
        const lastValue = nextAjaxDataList[groupIndex]?.interfaceList?.[interfaceIndex]?.[key];
        const formattedValue = JSON.stringify(JSON.parse(value as string), null, 4);
        value = lastValue === formattedValue ? value : formattedValue;
      } catch (e) {
        // value = value;
      }
    }

    nextAjaxDataList[groupIndex].interfaceList[interfaceIndex][key]! = value;

    const nextGroupIndex = key === 'open'
      ? reorderGroupWhenDisabled(nextAjaxDataList, groupIndex, wasDisabled)
      : groupIndex;

    persistAjaxDataList(nextAjaxDataList);

    return nextGroupIndex;
  };

  const onInterfaceListAdd = (groupIndex: number) => {
    if (!chrome.storage) return;
    const nextAjaxDataList = [...ajaxDataList];
    const key = String(Date.now());
    nextAjaxDataList[groupIndex].collapseActiveKeys.push(key);
    const interfaceItem = { ...defaultInterface };
    interfaceItem.key = key;
    nextAjaxDataList[groupIndex].interfaceList.push(interfaceItem);
    persistAjaxDataList(nextAjaxDataList);
  };

  // One-click "mock from capture": build a rule pre-filled with the captured
  // request/response and append it to the target group. The match type is
  // set to 'normal' with the raw URL so the rule lights up for the exact
  // endpoint the user just inspected — they can switch to regex later.
  // responseText is JSON-pretty-printed when possible so the Monaco editor
  // shows a readable body instead of a minified blob.
  const onMockCapture = (groupIndex: number, capture: {
    method: string;
    url: string;
    status: number;
    responseText: string;
  }) => {
    if (!chrome.storage) return;
    if (!ajaxDataList[groupIndex]) return;

    const key = String(Date.now());
    let prettyResponse = capture.responseText || '';
    try {
      prettyResponse = JSON.stringify(JSON.parse(prettyResponse), null, 4);
    } catch (e) {
      // Not JSON — keep the raw text as-is.
    }

    // Strip the query string so the rule matches the endpoint regardless of
    // whatever query params the live request carried. Only the path (and
    // origin) is kept as the match target.
    const urlWithoutQuery = (capture.url || '').split('?')[0];

    const interfaceItem = {
      ...defaultInterface,
      key,
      open: true,
      matchType: 'normal',
      matchMethod: capture.method || '',
      request: urlWithoutQuery,
      requestDes: 'Mocked from Request Sniffer',
      replacementStatusCode: String(capture.status || 200),
      responseText: prettyResponse,
      language: 'json',
    };

    const nextAjaxDataList = [...ajaxDataList];
    nextAjaxDataList[groupIndex].collapseActiveKeys.push(key);
    nextAjaxDataList[groupIndex].interfaceList.push(interfaceItem);
    persistAjaxDataList(nextAjaxDataList);
  };

  const onInterfaceListDelete = (groupIndex: number, key: string) => {
    if (!chrome.storage) return;
    const nextAjaxDataList = [...ajaxDataList];
    const wasDisabled = isGroupDisabled(nextAjaxDataList[groupIndex]);

    nextAjaxDataList[groupIndex].collapseActiveKeys = nextAjaxDataList[groupIndex].collapseActiveKeys.filter((activeKey) => activeKey !== key);
    nextAjaxDataList[groupIndex].interfaceList = nextAjaxDataList[groupIndex].interfaceList.filter((interfaceItem) => interfaceItem.key !== key);

    const nextGroupIndex = reorderGroupWhenDisabled(nextAjaxDataList, groupIndex, wasDisabled);
    persistAjaxDataList(nextAjaxDataList);

    return nextGroupIndex;
  };

  const onInterfaceListSave = (
    { groupIndex, interfaceIndex, replacementMethod, replacementUrl, replacementStatusCode, delay, headersEditorValue,
      requestPayloadEditorValue, responseEditorValue, language } : ModifyDataModalOnSaveProps
  ) => {
    if (replacementMethod !== undefined) onInterfaceListChange(groupIndex, interfaceIndex, 'replacementMethod', replacementMethod);
    if (replacementUrl !== undefined) onInterfaceListChange(groupIndex, interfaceIndex, 'replacementUrl', replacementUrl);
    if (replacementStatusCode !== undefined) onInterfaceListChange(groupIndex, interfaceIndex, 'replacementStatusCode', replacementStatusCode);
    if (delay !== undefined) onInterfaceListChange(groupIndex, interfaceIndex, 'delay', delay);
    if (headersEditorValue !== undefined) onInterfaceListChange(groupIndex, interfaceIndex, 'headers', headersEditorValue);
    if (requestPayloadEditorValue !== undefined) onInterfaceListChange(groupIndex, interfaceIndex, 'requestPayloadText', requestPayloadEditorValue);
    if (responseEditorValue !== undefined) onInterfaceListChange(groupIndex, interfaceIndex, 'responseText', responseEditorValue);
    if (language !== undefined) onInterfaceListChange(groupIndex, interfaceIndex, 'language', language);
  };

  // Pinned rules stick to the top of the group. Limit the count so the
  // pinned section stays scannable.
  const MAX_PINNED = 3;

  // placement: top toggles pin state; bottom moves to end of list.
  const onInterfaceMove = (groupIndex: number, interfaceIndex: number, placement: string ) => {
    if (!chrome.storage) return;
    const nextAjaxDataList = [...ajaxDataList];
    const targetGroup = nextAjaxDataList[groupIndex];
    const { interfaceList = [] } = targetGroup;
    const targetRule = interfaceList[interfaceIndex];
    if (!targetRule) return;

    if (placement === 'top') {
      // Toggle pin. Enforce the cap when pinning a new rule.
      const willPin = !targetRule.pinned;
      if (willPin) {
        const currentPinnedCount = interfaceList.filter((item) => item.pinned).length;
        if (currentPinnedCount >= MAX_PINNED) return;
      }
      const nextInterfaceList = interfaceList.map((item, idx) =>
        idx === interfaceIndex ? { ...item, pinned: willPin } : item
      );
      // Stable sort: pinned rules rise to the top, preserving relative order
      // within each group so existing arrangement is not disturbed.
      nextInterfaceList.sort((a, b) => {
        const pa = a.pinned ? 0 : 1;
        const pb = b.pinned ? 0 : 1;
        return pa - pb;
      });
      targetGroup.interfaceList = nextInterfaceList;
    } else if (placement === 'bottom') {
      const movedItem = interfaceList.splice(interfaceIndex, 1)[0];
      // Moving to bottom clears pin state so the rule does not jump back up.
      movedItem.pinned = false;
      interfaceList.push(movedItem);
    }
    persistAjaxDataList(nextAjaxDataList);
  };

  const onToggleRulePin = (groupIndex: number, interfaceIndex: number) => {
    onInterfaceMove(groupIndex, interfaceIndex, 'top');
  };

  return {
    isRegistry,
    ajaxDataList,
    ajaxToolsSkin,

    onGroupAdd,
    onGroupMove,
    onBatchImport,
    onMockCapture,
    setIsRegistry,
    onGroupDelete,
    setAjaxDataList,
    onInterfaceMove,
    onToggleRulePin,
    setAjaxToolsSkin,
    onCollapseChange,
    onGroupOpenChange,
    onInterfaceListAdd,
    onInterfaceListSave,
    onInterfaceListDelete,
    onInterfaceListChange,
    onGroupSummaryTextChange,
  };
};
