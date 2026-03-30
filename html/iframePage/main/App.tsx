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
import WorkbenchHeader from './components/WorkbenchHeader';
import OperationsRail from './components/OperationsRail';
import GroupWorkbench from './components/GroupWorkbench';
import RuleDetailPanel from './components/RuleDetailPanel';
import { useWorkbenchMetrics } from './hooks/useWorkbenchMetrics';
import { AjaxGroup, ModifyDataModalOpenProps } from './types/registry';
import { useModuleCollapseState } from './hooks/useModuleCollapseState';
import ModuleSection from './components/ModuleSection';

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
    quickEnabled: pageHeadersQuickEnabled,
    quickToggling: pageHeadersQuickToggling,
    pageOrigin,
    headerPairs,
    setVisible: setPageHeadersVisible,
    setEnabled: setPageHeadersEnabled,
    addHeaderPair,
    removeHeaderPair,
    updateHeaderPair,
    openModal: openPageHeadersModal,
    save: savePageHeaders,
    toggleQuickEnabled: togglePageHeadersQuickEnabled,
  } = usePageHeaders();

  const metrics = useWorkbenchMetrics(ajaxDataList as AjaxGroup[]);
  const { moduleCollapseState, updateModuleCollapseState } = useModuleCollapseState();

  useEffect(() => {
    if (!chrome.storage || !chrome.runtime || isRegistry) return;

    // Hydrate the workbench from extension storage exactly once after the iframe boots.
    setIsRegistry(true);
    chrome.storage.local.get(
      ['ajaxDataList', 'ajaxToolsSwitchOn', 'ajaxToolsSkin', 'ajaxToolsExpandAll'],
      (result) => {
        const {
          ajaxDataList = [],
          ajaxToolsSwitchOn = true,
          ajaxToolsSkin = 'light',
          ajaxToolsExpandAll = false,
        } = result;

        if (ajaxDataList.length > 0) {
          setAjaxDataList(ajaxDataList);
        }

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
            pageHeadersQuickEnabled={pageHeadersQuickEnabled}
            pageHeadersQuickToggling={pageHeadersQuickToggling}
            ajaxToolsExpandAll={ajaxToolsExpandAll}
            globalControlsCollapsed={moduleCollapseState.globalControls}
            groupNavigatorCollapsed={moduleCollapseState.groupNavigator}
            onSelectGroup={setSelectedGroupIndex}
            onToggleAjaxToolsSwitch={handleToggleAjaxToolsSwitch}
            onTogglePageHeadersQuick={(value) => {
              void togglePageHeadersQuickEnabled(value);
            }}
            onToggleExpandAll={updateAjaxToolsExpandAll}
            onGroupAdd={handleGroupAdd}
            onGlobalControlsCollapseToggle={() => {
              updateModuleCollapseState('globalControls', !moduleCollapseState.globalControls);
            }}
            onGroupNavigatorCollapseToggle={() => {
              updateModuleCollapseState('groupNavigator', !moduleCollapseState.groupNavigator);
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
                  onInterfaceMove={onInterfaceMove}
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

            <section className="workbench-bottom-panel">
              <ModuleSection
                title="Workspace Overview"
                description="Review workspace metrics and open common actions."
                eyebrow="Control Room"
                className="workbench-header-shell"
                collapsed={moduleCollapseState.workbenchOverview}
                onToggleCollapse={() => {
                  updateModuleCollapseState('workbenchOverview', !moduleCollapseState.workbenchOverview);
                }}
              >
                <WorkbenchHeader
                  metrics={metrics}
                  ajaxToolsSwitchOn={ajaxToolsSwitchOn}
                  pageHeadersQuickEnabled={pageHeadersQuickEnabled}
                  onGroupAdd={handleGroupAdd}
                  onImportClick={onImportClick}
                  onPageHeadersOpen={openPageHeadersModal}
                />
              </ModuleSection>
            </section>
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
