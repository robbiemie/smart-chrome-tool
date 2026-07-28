import React, { useEffect, useRef, useState } from 'react';
import { Empty } from 'antd';
import ModifyDataModal, { OpenModalProps } from './components/ModifyDataModal';
import 'antd/dist/antd.css';
import './App.css';
import Footer from './components/Footer';
import { useToggle } from './hooks/useToggle';
import { useRegistry } from './hooks/useRegistry';
import { usePageHeaders } from './hooks/usePageHeaders';
import PageHeadersModal from './components/PageHeadersModal';
import OperationsRail from './components/OperationsRail';
import GroupWorkbench from './components/GroupWorkbench';
import RuleDetailPanel from './components/RuleDetailPanel';
import { AjaxGroup, ModifyDataModalOpenProps } from './types/registry';
import { useModuleCollapseState } from './hooks/useModuleCollapseState';
import { usePageRenderMode } from './hooks/usePageRenderMode';
import { useFloatingRules } from './hooks/useFloatingRules';
import { useDomainWhitelist } from './hooks/useDomainWhitelist';

const SELECTED_GROUP_INDEX_STORAGE_KEY = 'ajaxToolsSelectedGroupIndex';

function App() {
  const modifyDataModalRef = useRef<{ openModal: (props: OpenModalProps) => void } | null>(null);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [selectedRuleIndexMap, setSelectedRuleIndexMap] = useState<Record<number, number>>({});

  const {
    ajaxToolsSwitchOn,
    ajaxToolsExpandAll,
    setAjaxToolsSwitchOn,
    setAjaxToolsExpandAll,
    updateAjaxToolsSwitchOn,
  } = useToggle();

  const {
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
  } = useRegistry();

  const {
    visible: pageHeadersVisible,
    enabled: pageHeadersEnabled,
    pageOrigin,
    headerPairs,
    setVisible: setPageHeadersVisible,
    setEnabled: setPageHeadersEnabled,
    addHeaderPair,
    removeHeaderPair,
    updateHeaderPair,
    openModal: openPageHeadersModal,
    save: savePageHeaders,
  } = usePageHeaders();
  const {
    csrEnabled,
    loading: csrModeLoading,
    toggling: csrModeToggling,
    toggle: toggleCsrMode,
  } = usePageRenderMode();
  const {
    floatingRulesEnabled,
    setFloatingRulesEnabled,
  } = useFloatingRules();
  const {
    domainWhitelist,
    currentHostname,
    currentTabMatched,
    addDomain,
    removeDomain,
  } = useDomainWhitelist();

  const { moduleCollapseState, updateModuleCollapseState, allModulesCollapsed, toggleCollapseAll } = useModuleCollapseState();

  useEffect(() => {
    if (!chrome.storage || !chrome.runtime || isRegistry) return;

    // Hydrate the workbench from extension storage exactly once after the iframe boots.
    setIsRegistry(true);
    chrome.storage.local.get(
      ['ajaxDataList', 'ajaxToolsSwitchOn', 'ajaxToolsSkin', 'ajaxToolsExpandAll', SELECTED_GROUP_INDEX_STORAGE_KEY],
      (result) => {
        const {
          ajaxDataList = [],
          ajaxToolsSwitchOn = true,
          ajaxToolsSkin = 'light',
          ajaxToolsExpandAll = false,
          [SELECTED_GROUP_INDEX_STORAGE_KEY]: selectedGroupIndex = 0,
        } = result;

        if (ajaxDataList.length > 0) {
          setAjaxDataList(ajaxDataList);
        }

        setSelectedGroupIndex(selectedGroupIndex);
        setAjaxToolsSwitchOn(ajaxToolsSwitchOn);
        setAjaxToolsSkin(ajaxToolsSkin);
        setAjaxToolsExpandAll(ajaxToolsExpandAll);
      }
    );
  }, [isRegistry, setAjaxDataList, setAjaxToolsExpandAll, setAjaxToolsSkin, setAjaxToolsSwitchOn, setIsRegistry]);

  useEffect(() => {
    if (ajaxDataList.length < 1) {
      setSelectedGroupIndex(0);
      return;
    }

    if (selectedGroupIndex > ajaxDataList.length - 1) {
      setSelectedGroupIndex(ajaxDataList.length - 1);
    }
  }, [ajaxDataList, selectedGroupIndex]);

  useEffect(() => {
    if (!chrome.storage) return;

    chrome.storage.local.set({
      [SELECTED_GROUP_INDEX_STORAGE_KEY]: selectedGroupIndex,
    });
  }, [selectedGroupIndex]);

  const updateAjaxToolsExpandAll = (value: boolean) => {
    // Keep the persisted collapse keys aligned with the global expand state.
    for (let index = 0; index < ajaxDataList.length; index += 1) {
      const item = ajaxDataList[index];
      const activeKeys = item?.interfaceList?.map((interfaceItem) => interfaceItem.key) || [];

      if (!value) {
        onCollapseChange(index, []);
      } else {
        onCollapseChange(index, activeKeys);
      }
    }

    setAjaxToolsExpandAll(value);
    if (chrome.storage) {
      chrome.storage.local.set({ ajaxToolsExpandAll: value });
    }
  };

  const selectedGroup = ajaxDataList[selectedGroupIndex] || null;
  const selectedRuleIndex = selectedRuleIndexMap[selectedGroupIndex] ?? 0;
  useEffect(() => {
    if (!selectedGroup) return;

    // Re-clamp the selected rule whenever the current group loses items.
    const currentRuleIndex = selectedRuleIndexMap[selectedGroupIndex] ?? 0;
    if (currentRuleIndex > selectedGroup.interfaceList.length - 1) {
      setSelectedRuleIndexMap((previous) => ({
        ...previous,
        [selectedGroupIndex]: Math.max(selectedGroup.interfaceList.length - 1, 0),
      }));
    }
  }, [selectedGroup, selectedGroupIndex, selectedRuleIndexMap]);

  const handleToggleAjaxToolsSwitch = (value: boolean) => {
    if (!chrome.storage) return;
    updateAjaxToolsSwitchOn(value);
    chrome.storage.local.set({ ajaxToolsSwitchOn: value });
  };

  const handleOpenModifyModal = (payload: ModifyDataModalOpenProps) => {
    modifyDataModalRef.current?.openModal(payload);
  };

  // Allow the floating rules panel (rendered by content.js on the host page)
  // to open the edit modal. content.js posts { groupIndex, ruleIndex } to the
  // iframe window; we look up the rule and forward it to the modal.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'AJAX_TOOLS_OPEN_EDIT') return;

      const { groupIndex, ruleIndex } = data;
      const targetGroup = ajaxDataList[groupIndex];
      const targetRule = targetGroup?.interfaceList?.[ruleIndex];
      if (!targetGroup || !targetRule) return;

      // Ensure the group/rule owning the edit target is selected so the
      // workbench context matches what the modal is editing.
      setSelectedGroupIndex(groupIndex);
      setSelectedRuleIndexMap((previous) => ({
        ...previous,
        [groupIndex]: ruleIndex,
      }));

      handleOpenModifyModal({
        groupIndex,
        interfaceIndex: ruleIndex,
        activeTab: 'Response',
        request: targetRule.request,
        replacementMethod: targetRule.replacementMethod,
        replacementUrl: targetRule.replacementUrl,
        replacementStatusCode: targetRule.replacementStatusCode,
        headersText: targetRule.headers,
        requestPayloadText: targetRule.requestPayloadText,
        responseLanguage: targetRule.language,
        responseText: targetRule.responseText,
      });
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [ajaxDataList]);

  const handleGroupAdd = () => {
    onGroupAdd();
    setSelectedGroupIndex(ajaxDataList.length);
  };

  const handleGroupOpenChange = (groupIndex: number, open: boolean) => {
    const nextGroupIndex = onGroupOpenChange(groupIndex, open);

    if (typeof nextGroupIndex === 'number') {
      setSelectedGroupIndex(nextGroupIndex);
    }
  };

  const handleInterfaceListChange = (
    groupIndex: number,
    interfaceIndex: number,
    key: string,
    value: string | boolean
  ) => {
    const nextGroupIndex = onInterfaceListChange(groupIndex, interfaceIndex, key, value);

    if (key === 'open' && typeof nextGroupIndex === 'number') {
      setSelectedGroupIndex(nextGroupIndex);
    }
  };

  const handleInterfaceListDelete = (groupIndex: number, key: string) => {
    const nextGroupIndex = onInterfaceListDelete(groupIndex, key);

    if (typeof nextGroupIndex === 'number') {
      setSelectedGroupIndex(nextGroupIndex);
    }
  };

  const handleInterfaceMove = (groupIndex: number, interfaceIndex: number, placement: string) => {
    onInterfaceMove(groupIndex, interfaceIndex, placement);

    setSelectedRuleIndexMap((previous) => {
      const interfaceCount = ajaxDataList[groupIndex]?.interfaceList?.length || 0;
      // Pinning reorders the list (pinned rules rise to the top via a stable
      // sort), so the selected index may shift. Rather than guess the new
      // position, keep the current selection — the user can re-click if needed.
      const nextRuleIndex = placement === 'bottom'
        ? Math.max(interfaceCount - 1, 0)
        : interfaceIndex;

      return {
        ...previous,
        [groupIndex]: nextRuleIndex,
      };
    });
  };

  return (
    <div
      className="ajax-tools-iframe-container"
      style={{
        filter: ajaxToolsSkin === 'dark' ? 'invert(1)' : undefined,
      }}
    >
      <div className="workbench-shell">
        <div className="workbench-layout">
          <OperationsRail
            ajaxDataList={ajaxDataList as AjaxGroup[]}
            selectedGroupIndex={selectedGroupIndex}
            ajaxToolsSwitchOn={ajaxToolsSwitchOn}
            csrModeEnabled={csrEnabled}
            csrModeLoading={csrModeLoading}
            csrModeToggling={csrModeToggling}
            globalControlsCollapsed={moduleCollapseState.globalControls}
            floatingRulesEnabled={floatingRulesEnabled}
            onToggleFloatingRules={setFloatingRulesEnabled}
            domainWhitelist={domainWhitelist}
            currentHostname={currentHostname}
            currentTabMatched={currentTabMatched}
            onAddDomain={addDomain}
            onRemoveDomain={removeDomain}
            allModulesCollapsed={allModulesCollapsed}
            onToggleCollapseAll={toggleCollapseAll}
            onImportClick={onImportClick}
            onPageHeadersOpen={openPageHeadersModal}
            onSelectGroup={setSelectedGroupIndex}
            onToggleAjaxToolsSwitch={handleToggleAjaxToolsSwitch}
            onToggleCsrMode={(value) => {
              void toggleCsrMode(value);
            }}
            onGroupAdd={handleGroupAdd}
            onGlobalControlsCollapseToggle={() => {
              updateModuleCollapseState('globalControls', !moduleCollapseState.globalControls);
            }}
          />

          <main className="workbench-main" style={{ opacity: ajaxToolsSwitchOn ? 1 : 0.65 }}>
            {ajaxDataList.length < 1 ? (
              <section className="empty-workbench">
                <Empty description="Start by creating a group or importing an existing ruleset." />
              </section>
            ) : (
              <div className="workbench-content-grid">
                <GroupWorkbench
                  group={selectedGroup}
                  groupIndex={selectedGroupIndex}
                  selectedRuleIndex={selectedRuleIndex}
                  ajaxToolsExpandAll={ajaxToolsExpandAll}
                  collapsed={moduleCollapseState.groupWorkbench}
                  onSelectRule={(ruleIndex) => {
                    setSelectedRuleIndexMap((previous) => ({
                      ...previous,
                      [selectedGroupIndex]: ruleIndex,
                    }));
                  }}
                  onGroupSummaryTextChange={onGroupSummaryTextChange}
                  onGroupMove={onGroupMove}
                  onGroupDelete={onGroupDelete}
                  onGroupOpenChange={handleGroupOpenChange}
                  onCollapseChange={onCollapseChange}
                  onInterfaceListAdd={onInterfaceListAdd}
                  onInterfaceListDelete={handleInterfaceListDelete}
                  onInterfaceMove={handleInterfaceMove}
                  onInterfaceListChange={handleInterfaceListChange}
                  onOpenModifyModal={handleOpenModifyModal}
                  onToggleCollapse={() => {
                    updateModuleCollapseState('groupWorkbench', !moduleCollapseState.groupWorkbench);
                  }}
                />
                <RuleDetailPanel
                  group={selectedGroup}
                  groupIndex={selectedGroupIndex}
                  selectedRuleIndex={selectedRuleIndex}
                  collapsed={moduleCollapseState.ruleDetailPanel}
                  onOpenModifyModal={handleOpenModifyModal}
                  onToggleCollapse={() => {
                    updateModuleCollapseState('ruleDetailPanel', !moduleCollapseState.ruleDetailPanel);
                  }}
                />
              </div>
            )}
          </main>
        </div>

        <Footer />
      </div>

      <ModifyDataModal ref={modifyDataModalRef} onSave={onInterfaceListSave} />
      <PageHeadersModal
        visible={pageHeadersVisible}
        enabled={pageHeadersEnabled}
        pageOrigin={pageOrigin}
        headerPairs={headerPairs}
        setVisible={setPageHeadersVisible}
        setEnabled={setPageHeadersEnabled}
        addHeaderPair={addHeaderPair}
        removeHeaderPair={removeHeaderPair}
        updateHeaderPair={updateHeaderPair}
        onSave={savePageHeaders}
      />
    </div>
  );
}

export default App;
