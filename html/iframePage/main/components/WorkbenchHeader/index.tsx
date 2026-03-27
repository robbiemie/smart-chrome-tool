import React from 'react';
import { Button, Tag } from 'antd';
import { ThunderboltOutlined, UploadOutlined, SettingOutlined, PlusOutlined } from '@ant-design/icons';
import { withErrorBoundary } from '../../common/withErrorBoundary';
import { WorkbenchMetrics } from '../../types/registry';

interface WorkbenchHeaderProps {
  metrics: WorkbenchMetrics;
  ajaxToolsSwitchOn: boolean;
  pageHeadersQuickEnabled: boolean;
  onGroupAdd: () => void;
  onImportClick: () => void;
  onPageHeadersOpen: () => void;
}

const WorkbenchHeader = ({
  metrics,
  ajaxToolsSwitchOn,
  pageHeadersQuickEnabled,
  onGroupAdd,
  onImportClick,
  onPageHeadersOpen,
}: WorkbenchHeaderProps) => {
  return (
    <header className="workbench-header">
      <div className="workbench-header__content">
        <div>
          <div className="workbench-eyebrow">Network Rewrite Studio</div>
          <h1 className="workbench-title">Design interception rules as a living control room.</h1>
          <p className="workbench-subtitle">
            A rebuilt workspace focused on visibility, faster rule navigation and less modal-hunting.
          </p>
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
        <Button type="primary" icon={<PlusOutlined />} onClick={onGroupAdd}>
          Create Group
        </Button>
        <Button icon={<UploadOutlined />} onClick={onImportClick}>
          Import JSON
        </Button>
        <Button icon={<SettingOutlined />} onClick={onPageHeadersOpen}>
          Page Headers
        </Button>
      </div>
      <div className="workbench-stats-grid">
        <article className="workbench-stat-card">
          <span className="workbench-stat-card__label">Groups</span>
          <strong>{metrics.totalGroups}</strong>
        </article>
        <article className="workbench-stat-card">
          <span className="workbench-stat-card__label">Rules</span>
          <strong>{metrics.totalRules}</strong>
        </article>
        <article className="workbench-stat-card">
          <span className="workbench-stat-card__label">Enabled</span>
          <strong>{metrics.enabledRules}</strong>
        </article>
        <article className="workbench-stat-card">
          <span className="workbench-stat-card__label">Regex</span>
          <strong>{metrics.regexRules}</strong>
        </article>
      </div>
    </header>
  );
};

export default withErrorBoundary(WorkbenchHeader);
