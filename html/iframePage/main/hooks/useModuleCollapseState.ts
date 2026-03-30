import { useEffect, useState } from 'react';

type ModuleCollapseKey =
  | 'globalControls'
  | 'groupNavigator'
  | 'groupWorkbench'
  | 'ruleDetailPanel'
  | 'workbenchOverview';

type ModuleCollapseState = Record<ModuleCollapseKey, boolean>;

const MODULE_COLLAPSE_STORAGE_KEY = 'ajaxToolsModuleCollapseState';

const defaultModuleCollapseState: ModuleCollapseState = {
  globalControls: false,
  groupNavigator: false,
  groupWorkbench: false,
  ruleDetailPanel: false,
  workbenchOverview: false,
};

export const useModuleCollapseState = () => {
  const [moduleCollapseState, setModuleCollapseState] = useState<ModuleCollapseState>(defaultModuleCollapseState);

  useEffect(() => {
    if (!chrome.storage) return;

    chrome.storage.local.get([MODULE_COLLAPSE_STORAGE_KEY], (result) => {
      const storageState = result?.[MODULE_COLLAPSE_STORAGE_KEY] as Partial<ModuleCollapseState> | undefined;

      if (!storageState) return;

      setModuleCollapseState((previousState) => ({
        ...previousState,
        ...storageState,
      }));
    });
  }, []);

  const updateModuleCollapseState = (moduleKey: ModuleCollapseKey, collapsed: boolean) => {
    const nextState = {
      ...moduleCollapseState,
      [moduleKey]: collapsed,
    };

    setModuleCollapseState(nextState);

    if (chrome.storage) {
      chrome.storage.local.set({
        [MODULE_COLLAPSE_STORAGE_KEY]: nextState,
      });
    }
  };

  return {
    moduleCollapseState,
    updateModuleCollapseState,
  };
};
