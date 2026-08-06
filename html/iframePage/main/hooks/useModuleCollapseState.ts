import { useEffect, useState } from 'react';

type ModuleCollapseKey = 'globalControls' | 'groupWorkbench';

type ModuleCollapseState = Record<ModuleCollapseKey, boolean>;

const MODULE_COLLAPSE_STORAGE_KEY = 'ajaxToolsModuleCollapseState';

const defaultModuleCollapseState: ModuleCollapseState = {
  globalControls: false,
  groupWorkbench: false,
};

// Keys toggled by the "collapse all" shortcut. globalControls is excluded so
// the rail with the shortcut button itself stays usable.
const COLLAPSE_ALL_KEYS: ModuleCollapseKey[] = ['groupWorkbench'];

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

  // Collapse/expand the rule modules together.
  const setAllModulesCollapsed = (collapsed: boolean) => {
    const nextState = { ...moduleCollapseState };
    COLLAPSE_ALL_KEYS.forEach((key) => {
      nextState[key] = collapsed;
    });

    setModuleCollapseState(nextState);

    if (chrome.storage) {
      chrome.storage.local.set({
        [MODULE_COLLAPSE_STORAGE_KEY]: nextState,
      });
    }
  };

  const allModulesCollapsed = COLLAPSE_ALL_KEYS.every((key) => moduleCollapseState[key]);

  const toggleCollapseAll = () => setAllModulesCollapsed(!allModulesCollapsed);

  return {
    moduleCollapseState,
    updateModuleCollapseState,
    toggleCollapseAll,
  };
};
