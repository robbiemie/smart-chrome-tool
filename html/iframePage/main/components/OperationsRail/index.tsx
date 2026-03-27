import React from 'react';
import { Button, Empty, Switch } from 'antd';
import {
  ApiOutlined,
  ExpandOutlined,
  CompressOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { AjaxGroup } from '../../types/registry';
import { withErrorBoundary } from '../../common/withErrorBoundary';

interface OperationsRailProps {
  ajaxDataList: AjaxGroup[];
  selectedGroupIndex: number;
  ajaxToolsSwitchOn: boolean;
  pageHeadersQuickEnabled: boolean;
  pageHeadersQuickToggling: boolean;
  ajaxToolsExpandAll: boolean;
  onSelectGroup: (groupIndex: number) => void;
  onToggleAjaxToolsSwitch: (value: boolean) => void;
  onTogglePageHeadersQuick: (value: boolean) => void;
  onToggleExpandAll: (value: boolean) => void;
  onGroupAdd: () => void;
}

const OperationsRail = ({
  ajaxDataList,
  selectedGroupIndex,
  ajaxToolsSwitchOn,
  pageHeadersQuickEnabled,
  pageHeadersQuickToggling,
  ajaxToolsExpandAll,
  onSelectGroup,
  onToggleAjaxToolsSwitch,
  onTogglePageHeadersQuick,
  onToggleExpandAll,
  onGroupAdd,
}: OperationsRailProps) => {
  return (
    <aside className="operations-rail">
      <section className="rail-panel">
        <div className="rail-panel__heading">
          <span>Global Controls</span>
        </div>
        <div className="rail-switch-list">
          <div className="rail-switch-item">
            <div>
              <strong>Interceptor</strong>
              <p>Pause or resume all response rewrite rules.</p>
            </div>
            <Switch checked={ajaxToolsSwitchOn} onChange={onToggleAjaxToolsSwitch} />
          </div>
          <div className="rail-switch-item">
            <div>
              <strong>Quick Headers</strong>
              <p>Toggle current page request headers instantly.</p>
            </div>
            <Switch
              loading={pageHeadersQuickToggling}
              checked={pageHeadersQuickEnabled}
              onChange={onTogglePageHeadersQuick}
            />
          </div>
          <div className="rail-switch-item">
            <div>
              <strong>Expand Rules</strong>
              <p>Show more request and response details directly inside rule cards.</p>
            </div>
            <Switch checked={ajaxToolsExpandAll} onChange={onToggleExpandAll} />
          </div>
        </div>
      </section>

      <section className="rail-panel">
        <div className="rail-panel__heading">
          <span>Group Navigator</span>
          <Button type="text" icon={<PlusOutlined />} onClick={onGroupAdd}>
            Add
          </Button>
        </div>
        {ajaxDataList.length < 1 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No groups yet"
          />
        ) : (
          <div className="group-nav-list">
            {ajaxDataList.map((group, index) => {
              const isActive = index === selectedGroupIndex;
              const enabledCount = group.interfaceList.filter((item) => item.open).length;
              return (
                <button
                  key={`${group.summaryText}-${index}`}
                  type="button"
                  className={`group-nav-card${isActive ? ' group-nav-card--active' : ''}`}
                  onClick={() => onSelectGroup(index)}
                >
                  <span className={`group-nav-card__accent ${group.headerClass}`} />
                  <div className="group-nav-card__body">
                    <strong>{group.summaryText || `Group ${index + 1}`}</strong>
                    <span>{group.interfaceList.length} rules</span>
                  </div>
                  <div className="group-nav-card__meta">
                    <span><ApiOutlined /> {enabledCount}</span>
                    <span>{group.collapseActiveKeys.length > 0 ? <ExpandOutlined /> : <CompressOutlined />}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

    </aside>
  );
};

export default withErrorBoundary(OperationsRail);
