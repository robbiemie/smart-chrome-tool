import React from 'react';
import { Button, Tag } from 'antd';
import { ThunderboltOutlined, UploadOutlined, SettingOutlined } from '@ant-design/icons';
import { withErrorBoundary } from '../../common/withErrorBoundary';
import { WorkbenchMetrics } from '../../types/registry';

interface WorkbenchHeaderProps {
  metrics: WorkbenchMetrics;
  ajaxToolsSwitchOn: boolean;
  pageHeadersQuickEnabled: boolean;
  onImportClick: () => void;
  onPageHeadersOpen: () => void;
}

const WorkbenchHeader = ({
  metrics,
  ajaxToolsSwitchOn,
  pageHeadersQuickEnabled,
  onImportClick,
  onPageHeadersOpen,
}: WorkbenchHeaderProps) => {
  return (
    <header className="workbench-header">
      <div className="workbench-header__content">
        <div>
          <div className="workbench-eyebrow">Rewrite Console</div>
          <h1 className="workbench-title">Keep the current page override rules simple.</h1>
        </div>
        <div className="workbench-status">
          <Tag color={ajaxToolsSwitchOn ? 'green' : 'default'} icon={<ThunderboltOutlined />}>
            {ajaxToolsSwitchOn ? 'Interceptor Live' : 'Interceptor Paused'}
          </Tag>
          <Tag color={pageHeadersQuickEnabled ? 'cyan' : 'default'}>
            {pageHeadersQuickEnabled ? 'Headers Armed' : 'Headers Idle'}
          </Tag>
        </div>
      </div>
      <div className="workbench-header__actions">
        <Button icon={<UploadOutlined />} onClick={onImportClick}>
          Import JSON
        </Button>
        <Button icon={<SettingOutlined />} onClick={onPageHeadersOpen}>
          Page Headers
        </Button>
      </div>
      <div className="workbench-header__summary">
        <span>{metrics.totalGroups} groups</span>
        <span>{metrics.totalRules} rules</span>
        <span>{metrics.enabledRules} enabled</span>
      </div>
    </header>
  );
};

export default withErrorBoundary(WorkbenchHeader);
