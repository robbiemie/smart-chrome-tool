import React, { useState } from 'react';
import { Button, Empty, Input, Select, Switch, Tag } from 'antd';
import { PlusOutlined, UploadOutlined, SettingOutlined, CompressOutlined, ExpandOutlined, CloseOutlined } from '@ant-design/icons';
import { AjaxGroup } from '../../types/registry';
import { withErrorBoundary } from '../../common/withErrorBoundary';
import ModuleSection from '../ModuleSection';

interface OperationsRailProps {
  ajaxDataList: AjaxGroup[];
  selectedGroupIndex: number;
  ajaxToolsSwitchOn: boolean;
  csrModeEnabled: boolean;
  csrModeLoading: boolean;
  csrModeToggling: boolean;
  globalControlsCollapsed: boolean;
  floatingRulesEnabled: boolean;
  onToggleFloatingRules: (value: boolean) => void;
  domainWhitelist: string[];
  currentHostname: string;
  currentTabMatched: boolean;
  onAddDomain: (domain: string) => void;
  onRemoveDomain: (domain: string) => void;
  allModulesCollapsed: boolean;
  onToggleCollapseAll: () => void;
  onImportClick: () => void;
  onPageHeadersOpen: () => void;
  onSelectGroup: (groupIndex: number) => void;
  onToggleAjaxToolsSwitch: (value: boolean) => void;
  onToggleCsrMode: (value: boolean) => void;
  onGroupAdd: () => void;
  onGlobalControlsCollapseToggle: () => void;
}

const OperationsRail = ({
  ajaxDataList,
  selectedGroupIndex,
  ajaxToolsSwitchOn,
  csrModeEnabled,
  csrModeLoading,
  csrModeToggling,
  globalControlsCollapsed,
  floatingRulesEnabled,
  onToggleFloatingRules,
  domainWhitelist,
  currentHostname,
  currentTabMatched,
  onAddDomain,
  onRemoveDomain,
  allModulesCollapsed,
  onToggleCollapseAll,
  onImportClick,
  onPageHeadersOpen,
  onSelectGroup,
  onToggleAjaxToolsSwitch,
  onToggleCsrMode,
  onGroupAdd,
  onGlobalControlsCollapseToggle,
}: OperationsRailProps) => {
  const [domainInput, setDomainInput] = useState('');

  const handleAddDomain = () => {
    const trimmed = domainInput.trim();
    if (!trimmed) return;
    onAddDomain(trimmed);
    setDomainInput('');
  };

  return (
    <aside className="operations-rail">
      <ModuleSection
        title="Global Controls"
        description="Manage shared workspace behaviors and switch groups quickly."
        className="rail-panel"
        collapsed={globalControlsCollapsed}
        onToggleCollapse={onGlobalControlsCollapseToggle}
      >
        <div className="rail-switch-list">
          <div className="rail-switch-item">
            <div>
              <strong>Interceptor</strong>
            </div>
            <Switch checked={ajaxToolsSwitchOn} onChange={onToggleAjaxToolsSwitch} />
          </div>
          <div className="rail-switch-item">
            <div>
              <strong>CSR Mode</strong>
            </div>
            <Switch
              loading={csrModeLoading || csrModeToggling}
              checked={csrModeEnabled}
              onChange={onToggleCsrMode}
            />
          </div>
          <div className="rail-switch-item">
            <div>
              <strong>Floating Rules</strong>
            </div>
            <Switch
              checked={floatingRulesEnabled}
              onChange={onToggleFloatingRules}
            />
          </div>
        </div>

        <div className="rail-actions">
          <Button
            size="small"
            icon={allModulesCollapsed ? <ExpandOutlined /> : <CompressOutlined />}
            onClick={onToggleCollapseAll}
          >
            {allModulesCollapsed ? 'Expand All' : 'Collapse All'}
          </Button>
          <Button size="small" icon={<UploadOutlined />} onClick={onImportClick}>
            Import
          </Button>
          <Button size="small" icon={<SettingOutlined />} onClick={onPageHeadersOpen}>
            Headers
          </Button>
        </div>

        <div className="domain-whitelist">
          <div className="domain-whitelist__header">
            <strong>Domain Whitelist</strong>
            {currentHostname && (
              <span className={`domain-whitelist__status${currentTabMatched ? ' domain-whitelist__status--on' : ''}`}>
                {currentTabMatched ? '✓ matched' : '✕ blocked'}: {currentHostname}
              </span>
            )}
          </div>
          <div className="domain-whitelist__tags">
            {domainWhitelist.map((pattern) => (
              <Tag
                key={pattern}
                className="domain-whitelist__tag"
                closable
                closeIcon={<CloseOutlined />}
                onClose={(e) => {
                  e.preventDefault();
                  onRemoveDomain(pattern);
                }}
              >
                {pattern}
              </Tag>
            ))}
          </div>
          <Input.Search
            size="small"
            placeholder="Add pattern, e.g. *.foo.com"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            onSearch={handleAddDomain}
            enterButton={<PlusOutlined />}
          />
        </div>

        <div className="group-switcher">
          <div className="group-switcher__header">
            <strong>Groups</strong>
            <Button type="text" size="small" icon={<PlusOutlined />} onClick={onGroupAdd}>
              Add
            </Button>
          </div>
          {ajaxDataList.length < 1 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No groups yet" />
          ) : (
            <Select
              value={selectedGroupIndex}
              className="group-switcher__select"
              popupClassName="group-switcher__dropdown"
              onChange={onSelectGroup}
              options={ajaxDataList.map((group, index) => {
                const enabledCount = group.interfaceList.filter((item) => item.open).length;
                const isDisabled = enabledCount === 0;
                const title = group.summaryText || `Group ${index + 1}`;

                return {
                  label: (
                    <div className="group-switcher__option">
                      <span className={`group-switcher__option-dot ${group.headerClass}`} />
                      <span className="group-switcher__option-title">{title}</span>
                      <span className={`group-switcher__option-meta${isDisabled ? ' group-switcher__option-meta--disabled' : ''}`}>
                        {isDisabled ? 'Disabled' : `${enabledCount} active`}
                      </span>
                    </div>
                  ),
                  value: index,
                };
              })}
            />
          )}
        </div>
      </ModuleSection>
    </aside>
  );
};

export default withErrorBoundary(OperationsRail);
