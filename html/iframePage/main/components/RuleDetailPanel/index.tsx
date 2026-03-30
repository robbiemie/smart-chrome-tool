import React from 'react';
import { Button, Empty, Tag } from 'antd';
import { EditOutlined, CodeOutlined, SendOutlined } from '@ant-design/icons';
import { AjaxGroup, ModifyDataModalOpenProps } from '../../types/registry';
import { withErrorBoundary } from '../../common/withErrorBoundary';
import ModuleSection from '../ModuleSection';

interface RuleDetailPanelProps {
  group: AjaxGroup | null;
  groupIndex: number;
  selectedRuleIndex: number;
  collapsed: boolean;
  onOpenModifyModal: (payload: ModifyDataModalOpenProps) => void;
  onToggleCollapse: () => void;
}

const formatText = (value: string) => {
  if (!value) {
    return 'Not configured';
  }

  return value;
};

const RuleDetailPanel = ({
  group,
  groupIndex,
  selectedRuleIndex,
  collapsed,
  onOpenModifyModal,
  onToggleCollapse,
}: RuleDetailPanelProps) => {
  const rule = group?.interfaceList?.[selectedRuleIndex];

  if (!group || !rule) {
    return (
      <aside className="rule-detail-panel rule-detail-panel--empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Select a rule to inspect its replacement payload."
        />
      </aside>
    );
  }

  const sharedModalPayload = {
    groupIndex,
    interfaceIndex: selectedRuleIndex,
    request: rule.request,
    replacementMethod: rule.replacementMethod,
    replacementUrl: rule.replacementUrl,
    replacementStatusCode: rule.replacementStatusCode,
    headersText: rule.headers,
    requestPayloadText: rule.requestPayloadText,
    responseLanguage: rule.language,
    responseText: rule.responseText,
  };

  return (
    <ModuleSection
      title={rule.requestDes || rule.request || 'Untitled rule'}
      description="Inspect request matching details and replacement payload values."
      eyebrow="Rule Focus"
      className="rule-detail-panel"
      collapsed={collapsed}
      extra={(
        <div className="rule-detail-panel__tags">
          <Tag color={rule.open ? 'green' : 'default'}>{rule.open ? 'Enabled' : 'Disabled'}</Tag>
          <Tag color="blue">{rule.matchType}</Tag>
          {rule.matchMethod ? <Tag>{rule.matchMethod}</Tag> : null}
        </div>
      )}
      onToggleCollapse={onToggleCollapse}
    >

      <section className="detail-section">
        <span className="detail-section__label">Match Request</span>
        <code>{formatText(rule.request)}</code>
      </section>

      <section className="detail-section">
        <span className="detail-section__label">Replacement Route</span>
        <code>{formatText(rule.replacementUrl)}</code>
      </section>

      <section className="detail-section">
        <span className="detail-section__label">Status Code</span>
        <code>{formatText(rule.replacementStatusCode)}</code>
      </section>

      <section className="detail-section">
        <span className="detail-section__label">Headers Snapshot</span>
        <pre>{formatText(rule.headers)}</pre>
      </section>

      <section className="detail-section">
        <span className="detail-section__label">Payload Script</span>
        <pre>{formatText(rule.requestPayloadText)}</pre>
      </section>

      <section className="detail-section">
        <span className="detail-section__label">Response Definition</span>
        <pre>{formatText(rule.responseText)}</pre>
      </section>

      <div className="rule-detail-panel__actions">
        <Button
          icon={<EditOutlined />}
          onClick={() => onOpenModifyModal({ ...sharedModalPayload, activeTab: 'Response' })}
        >
          Edit Response
        </Button>
        <Button
          icon={<SendOutlined />}
          onClick={() => onOpenModifyModal({ ...sharedModalPayload, activeTab: 'Request' })}
        >
          Edit Request
        </Button>
        <Button
          icon={<CodeOutlined />}
          onClick={() => onOpenModifyModal({ ...sharedModalPayload, activeTab: 'RequestPayload' })}
        >
          Edit Payload
        </Button>
      </div>
    </ModuleSection>
  );
};

export default withErrorBoundary(RuleDetailPanel);
