import React, { useEffect, useRef, useState } from 'react';
import ModifyDataModal, { OpenModalProps } from './components/ModifyDataModal';
import BatchImportExport from './components/BatchImportExport';
import UpdateModal from './components/UpdateModal';
import 'antd/dist/antd.css';
import './App.css';
import Footer from './components/Footer';
import { useToggle } from './hooks/useToggle';
import { useRegistry } from './hooks/useRegistry';
import { usePageHeaders } from './hooks/usePageHeaders';
import PageHeadersModal from './components/PageHeadersModal';
import OperationsRail from './components/OperationsRail';
import GroupWorkbench from './components/GroupWorkbench';
import { AjaxGroup, ModifyDataModalOpenProps } from './types/registry';
import { useModuleCollapseState } from './hooks/useModuleCollapseState';
import { usePageRenderMode } from './hooks/usePageRenderMode';
import { useFloatingRules } from './hooks/useFloatingRules';
import { useDomainWhitelist } from './hooks/useDomainWhitelist';
import { useRequestSniffer, CapturedRequest } from './hooks/useRequestSniffer';

const SELECTED_GROUP_INDEX_STORAGE_KEY = 'ajaxToolsSelectedGroupIndex';

function App() {
  // When opened as a top-level window via window.open() for the update flow,
  // the URL hash carries ?update=1&downloadUrl=...&remoteVersion=... This
  // bypasses the normal workbench UI and renders only the UpdateModal so the
  // File System Access API (blocked in third-party iframes) can run.
  const updateModeHash = window.location.hash;
  const isUpdateMode = updateModeHash.includes('update=1');
  const updateModeParams = new URLSearchParams(updateModeHash.replace(/^#/, ''));

  const modifyDataModalRef = useRef<{ openModal: (props: OpenModalProps) => void } | null>(null);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [selectedRuleIndexMap, setSelectedRuleIndexMap] = useState<Record<number, number>>({});
  const [importExportVisible, setImportExportVisible] = useState(false);
  const [updateModal, setUpdateModal] = useState<{
    open: boolean;
    downloadUrl: string;
    remoteVersion: string;
  }>({ open: false, downloadUrl: '', remoteVersion: '' });

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
    onBatchImport,
    onMockCapture,
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
    addDomain,
    removeDomain,
  } = useDomainWhitelist();

  const { moduleCollapseState, updateModuleCollapseState, allModulesCollapsed, toggleCollapseAll } = useModuleCollapseState();

  // Live-captured XHR/fetch traffic from the host page. Each entry can be
  // promoted to a mock rule via onMockCapturedRequest below.
  const { requests: capturedRequests, clearRequests: clearCapturedRequests } = useRequestSniffer();

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

  // Hot-update flow: the floating panel's Update button posts
  // AJAX_TOOLS_APPLY_UPDATE here. We surface the UpdateModal so the download
  // progress, unzip, and file-write steps (which need a secure extension
  // context for the File System Access API) run inside the iframe.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'AJAX_TOOLS_APPLY_UPDATE') return;
      console.log('[MockKit Update] received APPLY_UPDATE', { downloadUrl: data.downloadUrl, remoteVersion: data.remoteVersion, origin: event.origin });
      setUpdateModal({
        open: true,
        downloadUrl: data.downloadUrl || '',
        remoteVersion: data.remoteVersion || '',
      });
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleGroupAdd = () => {
    onGroupAdd();
    setSelectedGroupIndex(ajaxDataList.length);
  };

  // Import groups into the workspace. In replace mode the workspace is fully
  // overwritten, so selection jumps to the first imported group; in append
  // mode it jumps to the first newly added group.
  const handleBatchImport = (groups: AjaxGroup[], replace = false) => {
    onBatchImport(groups, replace);
    if (groups.length > 0) {
      setSelectedGroupIndex(replace ? 0 : ajaxDataList.length);
    }
  };

  // Promote a captured request into a mock rule appended to the currently
  // selected group. Falls back gracefully if the selected group is missing.
  const handleMockCapturedRequest = (capture: CapturedRequest) => {
    if (ajaxDataList.length < 1) {
      return;
    }
    onMockCapture(selectedGroupIndex, capture);
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

  // ----- Update mode: render only the UpdateModal in a top-level window. -----
  // The File System Access API (showDirectoryPicker) and cross-origin fetch
  // to GitHub are both blocked inside the third-party iframe. When the user
  // clicks Update in the Footer, we open this same HTML page in a new tab
  // with #update=1&downloadUrl=...&remoteVersion=... so the entire download
  // / unzip / write flow runs in a first-party extension page.
  if (isUpdateMode) {
    const dlUrl = decodeURIComponent(updateModeParams.get('downloadUrl') || '');
    const rv = decodeURIComponent(updateModeParams.get('remoteVersion') || '');
    return (
      <div style={{ padding: 40, background: '#f7f4ec', minHeight: '100vh' }}>
        <UpdateModal
          open
          downloadUrl={dlUrl}
          remoteVersion={rv}
          autoStart
          onClose={() => window.close()}
        />
      </div>
    );
  }

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
            ajaxToolsSwitchOn={ajaxToolsSwitchOn}
            csrModeEnabled={csrEnabled}
            csrModeLoading={csrModeLoading}
            csrModeToggling={csrModeToggling}
            globalControlsCollapsed={moduleCollapseState.globalControls}
            floatingRulesEnabled={floatingRulesEnabled}
            onToggleFloatingRules={setFloatingRulesEnabled}
            domainWhitelist={domainWhitelist}
            currentHostname={currentHostname}
            onAddDomain={addDomain}
            onRemoveDomain={removeDomain}
            allModulesCollapsed={allModulesCollapsed}
            onToggleCollapseAll={toggleCollapseAll}
            onOpenImportExport={() => setImportExportVisible(true)}
            onPageHeadersOpen={openPageHeadersModal}
            onToggleAjaxToolsSwitch={handleToggleAjaxToolsSwitch}
            onToggleCsrMode={(value) => {
              void toggleCsrMode(value);
            }}
            onGlobalControlsCollapseToggle={() => {
              updateModuleCollapseState('globalControls', !moduleCollapseState.globalControls);
            }}
            capturedRequests={capturedRequests}
            snifferCollapsed={moduleCollapseState.requestSniffer}
            onToggleSnifferCollapse={() => {
              updateModuleCollapseState('requestSniffer', !moduleCollapseState.requestSniffer);
            }}
            onClearCapturedRequests={clearCapturedRequests}
            onMockCapturedRequest={handleMockCapturedRequest}
            hasSelectedGroup={Boolean(selectedGroup)}
          />

          <main className="workbench-main" style={{ opacity: ajaxToolsSwitchOn ? 1 : 0.65 }}>
            <div className="workbench-content-grid">
              <GroupWorkbench
                ajaxDataList={ajaxDataList as AjaxGroup[]}
                selectedGroupIndex={selectedGroupIndex}
                group={selectedGroup}
                groupIndex={selectedGroupIndex}
                selectedRuleIndex={selectedRuleIndex}
                ajaxToolsExpandAll={ajaxToolsExpandAll}
                collapsed={moduleCollapseState.groupWorkbench}
                onSelectGroup={setSelectedGroupIndex}
                onGroupAdd={handleGroupAdd}
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
            </div>
          </main>
        </div>

        <Footer />
      </div>

      <ModifyDataModal ref={modifyDataModalRef} onSave={onInterfaceListSave} />
      <BatchImportExport
        visible={importExportVisible}
        onClose={() => setImportExportVisible(false)}
        ajaxDataList={ajaxDataList as AjaxGroup[]}
        selectedGroup={selectedGroup}
        onBatchImport={handleBatchImport}
      />
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
      <UpdateModal
        open={updateModal.open}
        downloadUrl={updateModal.downloadUrl}
        remoteVersion={updateModal.remoteVersion}
        onClose={() => setUpdateModal((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}

export default App;
