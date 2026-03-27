import { useState } from 'react';
import { defaultAjaxDataList, defaultInterface } from '../../common/value';
import { openImportJsonModal } from '../utils/importJson';
import { colorMap } from '../common/constants';
import { ModifyDataModalOnSaveProps } from '../components/ModifyDataModal';

export const useRegistry = () => {

  const [ajaxToolsSkin, setAjaxToolsSkin] = useState('light');
  const [ajaxDataList, setAjaxDataList] = useState(defaultAjaxDataList);
  const [isRegistry, setIsRegistry] = useState(false);

  const onImportClick = async () => {
    if (!chrome.storage) return;
    const importJsonData = await openImportJsonModal();
    let newAjaxDataList = ajaxDataList;
    if (Array.isArray(importJsonData)) {
      newAjaxDataList = [...ajaxDataList, ...importJsonData];
    }
    setAjaxDataList(newAjaxDataList);
    chrome.storage.local.set({ ajaxDataList: newAjaxDataList });
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
    setAjaxDataList([...newAjaxDataList]);
    chrome.storage.local.set({ ajaxDataList: newAjaxDataList });
  };

  const onGroupDelete = (groupIndex: number) => {
    if (!chrome.storage) return;
    const newAjaxDataList = ajaxDataList.filter((_, i) => i !== groupIndex);
    setAjaxDataList([...newAjaxDataList]);
    chrome.storage.local.set({ ajaxDataList: newAjaxDataList });
  };

  // placement: top|bottom
  const onGroupMove = (groupIndex: number, placement: string) => {
    if (!chrome.storage) return;
    const movedItem = ajaxDataList.splice(groupIndex, 1)[0];
    if (placement === 'top') {
      ajaxDataList.unshift(movedItem);
    } else if (placement === 'bottom') {
      ajaxDataList.push(movedItem);
    }
    setAjaxDataList([...ajaxDataList]);
    chrome.storage.local.set({ ajaxDataList });
  };

  const onGroupSummaryTextChange = (e: React.ChangeEvent<HTMLInputElement>, groupIndex: number) => {
    if (!chrome.storage) return;
    ajaxDataList[groupIndex].summaryText = e.target.value;
    setAjaxDataList([...ajaxDataList]);
    chrome.storage.local.set({ ajaxDataList });
  };

  // 收缩分组 折叠全部keys传[]
  const onCollapseChange = (groupIndex: number, keys: string | string[]) => {
    if (!chrome.storage) return;
    ajaxDataList[groupIndex].collapseActiveKeys = Array.isArray(keys) ? keys : [keys];
    setAjaxDataList([...ajaxDataList]);
    chrome.storage.local.set({ ajaxDataList });
  };

  const onGroupOpenChange = (groupIndex: number, open: boolean) => {
    if (!chrome.storage) return;
    ajaxDataList[groupIndex].interfaceList = ajaxDataList[groupIndex].interfaceList.map((v) => {
      v.open = open;
      return v;
    });
    setAjaxDataList([...ajaxDataList]);
    chrome.storage.local.set({ ajaxDataList });
  };

  // interfaceList值变化
  const onInterfaceListChange = (groupIndex: number, interfaceIndex: number, key: string, value: string | boolean) => {
    if (!chrome.storage) return;
    if (key === 'headers' || key === 'responseText') {
      try {
        const lastValue = ajaxDataList[groupIndex]?.interfaceList?.[interfaceIndex]?.[key];
        const formattedValue = JSON.stringify(JSON.parse(value as string), null, 4);
        value = lastValue === formattedValue ? value : formattedValue;
      } catch (e) {
        // value = value;
      }
    }
    ajaxDataList[groupIndex].interfaceList[interfaceIndex][key]! = value;
    setAjaxDataList([...ajaxDataList]);
    chrome.storage.local.set({ ajaxDataList });
  };

  const onInterfaceListAdd = (groupIndex: number) => {
    if (!chrome.storage) return;
    const key = String(Date.now());
    ajaxDataList[groupIndex].collapseActiveKeys.push(key);
    const interfaceItem = { ...defaultInterface };
    interfaceItem.key = key;
    ajaxDataList[groupIndex].interfaceList.push(interfaceItem);
    setAjaxDataList([...ajaxDataList]);
    chrome.storage.local.set({ ajaxDataList });
  };

  const onInterfaceListDelete = (groupIndex: number, key: string) => {
    if (!chrome.storage) return;
    ajaxDataList[groupIndex].collapseActiveKeys = ajaxDataList[groupIndex].collapseActiveKeys.filter((activeKey) => activeKey !== key);
    ajaxDataList[groupIndex].interfaceList = ajaxDataList[groupIndex].interfaceList.filter((v) => v.key !== key);
    setAjaxDataList([...ajaxDataList]);
    chrome.storage.local.set({ ajaxDataList });
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
    const { interfaceList = [] } = ajaxDataList[groupIndex];
    const movedItem = interfaceList.splice(interfaceIndex, 1)[0];
    if (placement === 'top') {
      interfaceList.unshift(movedItem);
    } else if (placement === 'bottom') {
      interfaceList.push(movedItem);
    }
    ajaxDataList[groupIndex].interfaceList = interfaceList;
    setAjaxDataList([...ajaxDataList]);
    chrome.storage.local.set({ ajaxDataList });
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