import React from 'react';
import { Button, Switch, Tag } from 'antd';
import {
  ReloadOutlined,
  SettingOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { withErrorBoundary } from '../../common/withErrorBoundary';
import { usePageRenderMode } from '../../hooks/usePageRenderMode';
import './index.css';

interface ToolsTabProps {
  // Page Headers — DNR header-rule editor for the current origin.
  pageOrigin: string;
  pageHeadersQuickEnabled: boolean;
  pageHeadersToggling: boolean;
  onOpenPageHeaders: () => void;
  onTogglePageHeadersQuick: (value: boolean) => void;

  // Import / Export — workspace backup/restore.
  groupCount: number;
  ruleCount: number;
  onOpenImportExport: () => void;
}

// A single tool card. Kept as a pure presentation node so the ToolsTab can
// render its entries from a registry array — adding a future tool is just a
// new entry in the `tools` array below.
interface ToolCardData {
  key: string;
  icon: React.ReactNode;
  title: string;
  hint: string;
  status: React.ReactNode;
  action: React.ReactNode;
}

const ToolsTab = ({
  pageOrigin,
  pageHeadersQuickEnabled,
  pageHeadersToggling,
  onOpenPageHeaders,
  onTogglePageHeadersQuick,
  groupCount,
  ruleCount,
  onOpenImportExport,
}: ToolsTabProps) => {
  // CSR mode is fully self-contained in the Tools tab — the hook talks to the
  // service worker directly, no App-level orchestration needed.
  const { csrEnabled, loading, toggling, toggle } = usePageRenderMode();

  // Registry-driven card list. Each entry maps to one tool; the grid renders
  // them uniformly. To add a tool, append an object here — no layout changes.
  const tools: ToolCardData[] = [
    {
      key: 'csr',
      icon: <ReloadOutlined />,
      title: 'CSR Mode',
      hint: 'Client-side render (?__csr=1). Toggling reloads the active tab.',
      status: loading ? (
        <Tag>Checking…</Tag>
      ) : (
        <Tag color={csrEnabled ? 'green' : 'default'}>{csrEnabled ? 'CSR' : 'SSR'}</Tag>
      ),
      action: (
        <Switch
          checked={csrEnabled}
          loading={toggling}
          disabled={loading}
          onChange={toggle}
          checkedChildren="CSR"
          unCheckedChildren="SSR"
        />
      ),
    },
    {
      key: 'headers',
      icon: <SettingOutlined />,
      title: 'Page Headers',
      hint: pageOrigin
        ? `DNR header rules for ${pageOrigin}`
        : 'DNR header rules for the current origin',
      status: pageHeadersQuickEnabled ? (
        <Tag color="green">Enabled</Tag>
      ) : (
        <Tag>Disabled</Tag>
      ),
      action: (
        <div className="tools-tab__row-actions">
          <Switch
            checked={pageHeadersQuickEnabled}
            loading={pageHeadersToggling}
            onChange={onTogglePageHeadersQuick}
            checkedChildren="On"
            unCheckedChildren="Off"
          />
          <Button type="primary" ghost onClick={onOpenPageHeaders} disabled={!pageOrigin}>
            Open Editor
          </Button>
        </div>
      ),
    },
    {
      key: 'import-export',
      icon: <SwapOutlined />,
      title: 'Import / Export',
      hint: 'Back up or restore rule groups as JSON.',
      status: (
        <Tag>
          {groupCount} groups · {ruleCount} rules
        </Tag>
      ),
      action: (
        <Button type="primary" ghost onClick={onOpenImportExport}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <section className="tools-tab">
      <header className="tools-tab__header">
        <h2 className="tools-tab__title">Tools</h2>
        <p className="tools-tab__subtitle">
          Configuration and workspace utilities. Add new tools by extending the registry in
          <code> ToolsTab/index.tsx</code>.
        </p>
      </header>

      <div className="tools-tab__grid">
        {tools.map((tool) => (
          <article key={tool.key} className="tools-tab__card">
            <div className="tools-tab__card-head">
              <span className="tools-tab__card-icon">{tool.icon}</span>
              <div className="tools-tab__card-meta">
                <h3 className="tools-tab__card-title">{tool.title}</h3>
                <p className="tools-tab__card-hint">{tool.hint}</p>
              </div>
            </div>
            <div className="tools-tab__card-foot">
              {tool.status}
              {tool.action}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

export default withErrorBoundary(ToolsTab);
