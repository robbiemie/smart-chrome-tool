import React from 'react';
import { Switch } from 'antd';
import { withErrorBoundary } from '../../common/withErrorBoundary';
import ModuleSection from '../ModuleSection';

interface OperationsRailProps {
  ajaxToolsSwitchOn: boolean;
  globalControlsCollapsed: boolean;
  // Toolkit master panel visibility — driven by this switch in Global Controls.
  // The Toolkit panel consolidates the runtime debug sub-tools — Floating
  // Rules, DOM Inspect, Animation Control, Request Sniffer — plus the Domain
  // Whitelist config section. CSR Mode, Page Headers, Import/Export, and
  // Collapse All live in the workbench's "Tools" tab (see ToolsTab).
  toolkitEnabled: boolean;
  onToggleToolkit: (value: boolean) => void;
  onToggleAjaxToolsSwitch: (value: boolean) => void;
  onGlobalControlsCollapseToggle: () => void;
}

const OperationsRail = ({
  ajaxToolsSwitchOn,
  globalControlsCollapsed,
  toolkitEnabled,
  onToggleToolkit,
  onToggleAjaxToolsSwitch,
  onGlobalControlsCollapseToggle,
}: OperationsRailProps) => {
  return (
    <aside className="operations-rail">
      <ModuleSection
        title="Global Controls"
        description="Master switches for interception and the Toolkit panel."
        className="rail-panel"
        collapsed={globalControlsCollapsed}
        onToggleCollapse={onGlobalControlsCollapseToggle}
      >
        {/* Two equal columns: Interceptor (MASTER) and Toolkit. Both sit in
            one grid so neither dominates a row — the MASTER card keeps its
            badge + gradient to signal hierarchy, but width is equal. */}
        <div className="rail-switch-list">
          <div className="rail-switch-item rail-switch-item--master">
            <span className="rail-switch-item__badge">MASTER</span>
            <Switch checked={ajaxToolsSwitchOn} onChange={onToggleAjaxToolsSwitch} />
            <strong>Interceptor</strong>
            <p>Master switch for all mock sub-features.</p>
          </div>
          <div className="rail-switch-item">
            <Switch checked={toolkitEnabled} onChange={onToggleToolkit} />
            <strong>Toolkit</strong>
            <p>Floating panel with debug sub-tools.</p>
          </div>
        </div>
      </ModuleSection>
    </aside>
  );
};

export default withErrorBoundary(OperationsRail);
