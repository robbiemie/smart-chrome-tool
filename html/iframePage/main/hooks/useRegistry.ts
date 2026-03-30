import { useState } from 'react';
import { defaultAjaxDataList, defaultInterface } from '../../common/value';
import { openImportJsonModal } from '../utils/importJson';
import { colorMap } from '../common/constants';
import { ModifyDataModalOnSaveProps } from '../components/ModifyDataModal';
import { AjaxGroup } from '../types/registry';

export const useRegistry = () => {

  const [ajaxToolsSkin, setAjaxToolsSkin] = useState('light');
  const [ajaxDataList, setAjaxDataList] = useState(defaultAjaxDataList);
  const [isRegistry, setIsRegistry] = useState(false);

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

  const onImportClick = async () => {
    if (!chrome.storage) return;
    const importJsonData = await openImportJsonModal();
    let newAjaxDataList = ajaxDataList;
    if (Array.isArray(importJsonData)) {
      newAjaxDataList = [...ajaxDataList, ...importJsonData];
    }
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
    { groupIndex, interfaceIndex, replacementMethod, replacementUrl, replacementStatusCode, headersEditorValue,
      requestPayloadEditorValue, responseEditorValue, language } : ModifyDataModalOnSaveProps
  ) => {
    if (replacementMethod !== undefined) onInterfaceListChange(groupIndex, interfaceIndex, 'replacementMethod', replacementMethod);
    if (replacementUrl !== undefined) onInterfaceListChange(groupIndex, interfaceIndex, 'replacementUrl', replacementUrl);
    if (replacementStatusCode !== undefined) onInterfaceListChange(groupIndex, interfaceIndex, 'replacementStatusCode', replacementStatusCode);
    if (headersEditorValue !== undefined) onInterfaceListChange(groupIndex, interfaceIndex, 'headers', headersEditorValue);
    if (requestPayloadEditorValue !== undefined) onInterfaceListChange(groupIndex, interfaceIndex, 'requestPayloadText', requestPayloadEditorValue);
    if (responseEditorValue !== undefined) onInterfaceListChange(groupIndex, interfaceIndex, 'responseText', responseEditorValue);
    if (language !== undefined) onInterfaceListChange(groupIndex, interfaceIndex, 'language', language);
  };

  // placement: top|bottom
  const onInterfaceMove = (groupIndex: number, interfaceIndex: number, placement: string ) => {
    if (!chrome.storage) return;
    const nextAjaxDataList = [...ajaxDataList];
    const { interfaceList = [] } = nextAjaxDataList[groupIndex];
    const movedItem = interfaceList.splice(interfaceIndex, 1)[0];
    if (placement === 'top') {
      interfaceList.unshift(movedItem);
    } else if (placement === 'bottom') {
      interfaceList.push(movedItem);
    }
    nextAjaxDataList[groupIndex].interfaceList = interfaceList;
    persistAjaxDataList(nextAjaxDataList);
  };

  return {
    isRegistry,
    ajaxDataList,
    ajaxToolsSkin,

    onGroupAdd,
    onGroupMove,
    onImportClick,
    setIsRegistry,
    onGroupDelete,
    setAjaxDataList,
    onInterfaceMove,
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
