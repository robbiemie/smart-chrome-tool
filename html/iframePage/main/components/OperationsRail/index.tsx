import React from 'react';
import { Switch } from 'antd';
import { withErrorBoundary } from '../../common/withErrorBoundary';
import ModuleSection from '../ModuleSection';

interface OperationsRailProps {
  ajaxToolsSwitchOn: boolean;
  globalControlsCollapsed: boolean;
  // Toolkit master panel visibility — driven by this switch in Global Controls.
  // The Toolkit panel consolidates Floating Rules / DOM Inspect / Animation
  // Control / CSR Mode / Domain Whitelist / Headers / Import-Export /
  // Collapse-All as sub-tools and config rows toggled inside it.
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
        <div className="rail-switch-list">
          {/* Interceptor is the MASTER switch. Turning it off hides the
              Toolkit panel and disables all sub-features (mock hooks, sniffer,
              floating rules, DOM inspector, animation control, page headers).
              The workbench sidebar stays visible so the user can re-enable it. */}
          <div className="rail-switch-item rail-switch-item--master">
            <span className="rail-switch-item__badge">MASTER</span>
            <Switch checked={ajaxToolsSwitchOn} onChange={onToggleAjaxToolsSwitch} />
            <strong>Interceptor</strong>
            <p>Master switch. Off disables all mock sub-features and hides the Toolkit panel.</p>
          </div>
        </div>

        <div className="rail-extras">
          <span className="rail-extras__label">Extras</span>
          <div className="rail-extras__list">
            {/* Toolkit switch controls the floating Toolkit panel visibility.
                All other controls (CSR, Whitelist, Headers, Import-Export,
                Collapse-All) now live inside the Toolkit panel. */}
            <div className="rail-switch-item">
              <Switch
                checked={toolkitEnabled}
                onChange={onToggleToolkit}
              />
              <strong>Toolkit</strong>
            </div>
          </div>
        </div>
      </ModuleSection>
    </aside>
  );
};

export default withErrorBoundary(OperationsRail);
