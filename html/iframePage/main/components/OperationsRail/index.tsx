import React, { useState } from 'react';
import { Button, Input, Switch, Tag } from 'antd';
import { PlusOutlined, SwapOutlined, SettingOutlined, CompressOutlined, ExpandOutlined, CloseOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';
import { withErrorBoundary } from '../../common/withErrorBoundary';
import ModuleSection from '../ModuleSection';

interface OperationsRailProps {
  ajaxToolsSwitchOn: boolean;
  csrModeEnabled: boolean;
  csrModeLoading: boolean;
  csrModeToggling: boolean;
  globalControlsCollapsed: boolean;
  // Toolkit master panel visibility — driven by this switch in Global Controls.
  // The Toolkit panel consolidates Floating Rules / DOM Inspect / Animation
  // Control as sub-tools toggled inside it.
  toolkitEnabled: boolean;
  onToggleToolkit: (value: boolean) => void;
  domainWhitelist: string[];
  currentHostname: string;
  onAddDomain: (domain: string) => void;
  onRemoveDomain: (domain: string) => void;
  allModulesCollapsed: boolean;
  onToggleCollapseAll: () => void;
  onOpenImportExport: () => void;
  onPageHeadersOpen: () => void;
  onToggleAjaxToolsSwitch: (value: boolean) => void;
  onToggleCsrMode: (value: boolean) => void;
  onGlobalControlsCollapseToggle: () => void;
}

const OperationsRail = ({
  ajaxToolsSwitchOn,
  csrModeEnabled,
  csrModeLoading,
  csrModeToggling,
  globalControlsCollapsed,
  toolkitEnabled,
  onToggleToolkit,
  domainWhitelist,
  currentHostname,
  onAddDomain,
  onRemoveDomain,
  allModulesCollapsed,
  onToggleCollapseAll,
  onOpenImportExport,
  onPageHeadersOpen,
  onToggleAjaxToolsSwitch,
  onToggleCsrMode,
  onGlobalControlsCollapseToggle,
}: OperationsRailProps) => {
  const [domainInput, setDomainInput] = useState('');
  // Domain Whitelist is a low-frequency config; collapse it by default so it
  // does not crowd the rail. The current-host status tag stays visible in the
  // header so whitelist coverage is still obvious at a glance.
  const [domainWhitelistCollapsed, setDomainWhitelistCollapsed] = useState(true);

  // The add-affordance is gated by EXPLICIT membership rather than pattern
  // match: a wildcard '*' matches every host, but the user still wants to pin
  // the current host as an explicit entry. Show the green check only when the
  // host is literally in the list; otherwise offer a one-click add.
  const currentHostAdded = Boolean(currentHostname) && domainWhitelist.includes(currentHostname);

  const handleAddDomain = () => {
    const trimmed = domainInput.trim();
    if (!trimmed) return;
    onAddDomain(trimmed);
    setDomainInput('');
  };

  return (
    <aside className="operations-rail">
      {/* Prominent batch import/export entry. Sits at the top of the rail so
          it is the first thing operators see for backup and restore flows. */}
      <button type="button" className="rail-hero-entry" onClick={onOpenImportExport}>
        <span className="rail-hero-entry__icon">
          <SwapOutlined />
        </span>
        <span className="rail-hero-entry__text">
          <strong>Import / Export</strong>
          <span>Backup or restore rules in batch</span>
        </span>
        <span className="rail-hero-entry__cta">Open</span>
      </button>

      <ModuleSection
        title="Global Controls"
        description="Manage shared workspace behaviors and switch groups quickly."
        className="rail-panel"
        collapsed={globalControlsCollapsed}
        onToggleCollapse={onGlobalControlsCollapseToggle}
      >
        <div className="rail-switch-list">
          <div className="rail-switch-item rail-switch-item--master">
            <span className="rail-switch-item__badge">MASTER</span>
            <Switch checked={ajaxToolsSwitchOn} onChange={onToggleAjaxToolsSwitch} />
            <strong>Interceptor</strong>
            <p>Master switch. Off disables all mock sub-features.</p>
          </div>
        </div>

        <div className="rail-extras">
          <span className="rail-extras__label">Extras</span>
          <div className="rail-extras__list">
            <div className="rail-switch-item">
              <Switch
                loading={csrModeLoading || csrModeToggling}
                checked={csrModeEnabled}
                onChange={onToggleCsrMode}
              />
              <strong>CSR Mode</strong>
            </div>
            <div className="rail-switch-item">
              <Switch
                checked={toolkitEnabled}
                onChange={onToggleToolkit}
              />
              <strong>Toolkit</strong>
            </div>
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
          <Button size="small" icon={<SettingOutlined />} onClick={onPageHeadersOpen}>
            Headers
          </Button>
        </div>

        <div className="domain-whitelist">
          <div
            className="domain-whitelist__header domain-whitelist__header--toggle"
            onClick={() => setDomainWhitelistCollapsed((prev) => !prev)}
            role="button"
            tabIndex={0}
          >
            <span className="domain-whitelist__header-left">
              {domainWhitelistCollapsed ? <RightOutlined /> : <DownOutlined />}
              <strong>Domain Whitelist</strong>
            </span>
            {currentHostname && (
              currentHostAdded ? (
                <Tag color="green" className="domain-whitelist__status-tag">
                  ✓ {currentHostname}
                </Tag>
              ) : (
                <Tag
                  color="red"
                  className="domain-whitelist__status-tag domain-whitelist__status-tag--clickable"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddDomain(currentHostname);
                  }}
                >
                  + {currentHostname}
                </Tag>
              )
            )}
          </div>
          {!domainWhitelistCollapsed && (
            <>
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
            </>
          )}
        </div>
      </ModuleSection>
    </aside>
  );
};

export default withErrorBoundary(OperationsRail);
