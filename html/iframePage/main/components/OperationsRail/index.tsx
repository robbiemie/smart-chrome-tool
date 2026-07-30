import React, { useState } from 'react';
import { Button, Input, Switch, Tag } from 'antd';
import { PlusOutlined, SwapOutlined, SettingOutlined, CompressOutlined, ExpandOutlined, CloseOutlined, RadarChartOutlined, AimOutlined } from '@ant-design/icons';
import { withErrorBoundary } from '../../common/withErrorBoundary';
import ModuleSection from '../ModuleSection';
import RequestSniffer from '../RequestSniffer';
import { CapturedRequest } from '../../hooks/useRequestSniffer';

interface OperationsRailProps {
  ajaxToolsSwitchOn: boolean;
  csrModeEnabled: boolean;
  csrModeLoading: boolean;
  csrModeToggling: boolean;
  globalControlsCollapsed: boolean;
  floatingRulesEnabled: boolean;
  onToggleFloatingRules: (value: boolean) => void;
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
  // Request Sniffer
  capturedRequests: CapturedRequest[];
  snifferCollapsed: boolean;
  onToggleSnifferCollapse: () => void;
  onClearCapturedRequests: () => void;
  onMockCapturedRequest: (capture: CapturedRequest) => void;
  hasSelectedGroup: boolean;
}

const OperationsRail = ({
  ajaxToolsSwitchOn,
  csrModeEnabled,
  csrModeLoading,
  csrModeToggling,
  globalControlsCollapsed,
  floatingRulesEnabled,
  onToggleFloatingRules,
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
  capturedRequests,
  snifferCollapsed,
  onToggleSnifferCollapse,
  onClearCapturedRequests,
  onMockCapturedRequest,
  hasSelectedGroup,
}: OperationsRailProps) => {
  const [domainInput, setDomainInput] = useState('');

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
          <div className="rail-switch-item">
            <Switch checked={ajaxToolsSwitchOn} onChange={onToggleAjaxToolsSwitch} />
            <strong>Interceptor</strong>
          </div>
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
              checked={floatingRulesEnabled}
              onChange={onToggleFloatingRules}
            />
            <strong>Floating Rules</strong>
          </div>
          <div className="rail-switch-item">
            <Button
              type="text"
              size="small"
              icon={<AimOutlined />}
              onClick={() => {
                window.parent?.postMessage({ type: 'MOCKKIT_INSPECT_DOM' }, '*');
              }}
              title="Inspect a DOM node and read its computed styles"
            />
            <strong>DOM Inspect</strong>
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
          <div className="domain-whitelist__header">
            <strong>Domain Whitelist</strong>
            {currentHostname && (
              currentHostAdded ? (
                <Tag color="green" className="domain-whitelist__status-tag">
                  ✓ {currentHostname}
                </Tag>
              ) : (
                <Tag
                  color="red"
                  className="domain-whitelist__status-tag domain-whitelist__status-tag--clickable"
                  onClick={() => onAddDomain(currentHostname)}
                >
                  + {currentHostname}
                </Tag>
              )
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
      </ModuleSection>

      {/* Request Sniffer: live-captured XHR/fetch traffic on the current
          page. Each row can be promoted to a mock rule in the selected
          group with one click. */}
      <ModuleSection
        title="Request Sniffer"
        eyebrow="Live Capture"
        description={`${capturedRequests.length} request(s) captured on this page. Click Mock to add a rule to the current group.`}
        className="rail-panel"
        collapsed={snifferCollapsed}
        onToggleCollapse={onToggleSnifferCollapse}
        extra={<RadarChartOutlined style={{ color: '#1a9b7f' }} />}
      >
        <RequestSniffer
          requests={capturedRequests}
          onClear={onClearCapturedRequests}
          onMockRequest={onMockCapturedRequest}
          disabled={!hasSelectedGroup}
        />
      </ModuleSection>
    </aside>
  );
};

export default withErrorBoundary(OperationsRail);
