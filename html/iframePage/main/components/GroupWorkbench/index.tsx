import React from 'react';
import { Button, Empty, Input, Select, Tag } from 'antd';
import {
  DeleteOutlined,
  PlusOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
  EditOutlined,
  CodeOutlined,
  SendOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { AjaxGroup, ModifyDataModalOpenProps } from '../../types/registry';
import { withErrorBoundary } from '../../common/withErrorBoundary';

const HTTP_METHOD_OPTIONS = ['', 'GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE', 'PATCH'];
const MATCH_TYPE_OPTIONS = ['regex', 'normal'];

interface GroupWorkbenchProps {
  group: AjaxGroup | null;
  groupIndex: number;
  selectedRuleIndex: number;
  ajaxToolsExpandAll: boolean;
  onSelectRule: (ruleIndex: number) => void;
  onGroupSummaryTextChange: (event: React.ChangeEvent<HTMLInputElement>, groupIndex: number) => void;
  onGroupMove: (groupIndex: number, placement: string) => void;
  onGroupDelete: (groupIndex: number) => void;
  onGroupOpenChange: (groupIndex: number, open: boolean) => void;
  onInterfaceListAdd: (groupIndex: number) => void;
  onInterfaceListDelete: (groupIndex: number, key: string) => void;
  onInterfaceMove: (groupIndex: number, interfaceIndex: number, placement: string) => void;
  onInterfaceListChange: (
    groupIndex: number,
    interfaceIndex: number,
    key: string,
    value: string | boolean
  ) => void;
  onOpenModifyModal: (payload: ModifyDataModalOpenProps) => void;
}

const GroupWorkbench = ({
  group,
  groupIndex,
  selectedRuleIndex,
  ajaxToolsExpandAll,
  onSelectRule,
  onGroupSummaryTextChange,
  onGroupMove,
  onGroupDelete,
  onGroupOpenChange,
  onInterfaceListAdd,
  onInterfaceListDelete,
  onInterfaceMove,
  onInterfaceListChange,
  onOpenModifyModal,
}: GroupWorkbenchProps) => {
  if (!group) {
    return (
      <section className="group-workbench group-workbench--empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Create a group to start composing rewrite rules."
        />
      </section>
    );
  }

  return (
    <section className="group-workbench">
      <div className="group-workbench__header">
        <div>
          <span className="section-kicker">Group Studio</span>
          <Input
            value={group.summaryText}
            className="group-title-input"
            placeholder="Group title"
            onChange={(event) => onGroupSummaryTextChange(event, groupIndex)}
          />
        </div>
        <div className="group-workbench__actions">
          <Button icon={<VerticalAlignTopOutlined />} onClick={() => onGroupMove(groupIndex, 'top')}>
            Pin Top
          </Button>
          <Button icon={<VerticalAlignBottomOutlined />} onClick={() => onGroupMove(groupIndex, 'bottom')}>
            Send Bottom
          </Button>
          <Button onClick={() => onGroupOpenChange(groupIndex, true)}>Enable All</Button>
          <Button onClick={() => onGroupOpenChange(groupIndex, false)}>Disable All</Button>
          <Button danger icon={<DeleteOutlined />} onClick={() => onGroupDelete(groupIndex)}>
            Remove Group
          </Button>
        </div>
      </div>

      <div className="rule-card-list">
        {group.interfaceList.map((rule, interfaceIndex) => {
          const isSelected = interfaceIndex === selectedRuleIndex;
          return (
            <article
              key={rule.key}
              className={`rule-card${isSelected ? ' rule-card--selected' : ''}`}
              onClick={() => onSelectRule(interfaceIndex)}
            >
              <div className="rule-card__header">
                <div className="rule-card__identity">
                  <Tag color={rule.open ? 'green' : 'default'}>{rule.open ? 'Enabled' : 'Disabled'}</Tag>
                  <Tag color="blue">{rule.matchType || 'regex'}</Tag>
                  {rule.matchMethod ? <Tag>{rule.matchMethod}</Tag> : null}
                </div>
                <div className="rule-card__toolbar">
                  <Button
                    type="text"
                    icon={<VerticalAlignTopOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      onInterfaceMove(groupIndex, interfaceIndex, 'top');
                    }}
                  />
                  <Button
                    type="text"
                    icon={<VerticalAlignBottomOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      onInterfaceMove(groupIndex, interfaceIndex, 'bottom');
                    }}
                  />
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      onInterfaceListDelete(groupIndex, rule.key);
                    }}
                  />
                </div>
              </div>

              <div className="rule-card__grid">
                <label className="field-block">
                  <span>Method</span>
                  <Select
                    value={rule.matchMethod}
                    onChange={(value) => onInterfaceListChange(groupIndex, interfaceIndex, 'matchMethod', value)}
                    options={HTTP_METHOD_OPTIONS.map((value) => ({
                      label: value || 'Any',
                      value,
                    }))}
                  />
                </label>
                <label className="field-block">
                  <span>Match Type</span>
                  <Select
                    value={rule.matchType}
                    onChange={(value) => onInterfaceListChange(groupIndex, interfaceIndex, 'matchType', value)}
                    options={MATCH_TYPE_OPTIONS.map((value) => ({
                      label: value,
                      value,
                    }))}
                  />
                </label>
                <label className="field-block field-block--wide">
                  <span>Request Matcher</span>
                  <Input
                    value={rule.request}
                    placeholder="https://api.example.com/users"
                    onChange={(event) => onInterfaceListChange(groupIndex, interfaceIndex, 'request', event.target.value)}
                  />
                </label>
                <label className="field-block field-block--wide">
                  <span>Rule Notes</span>
                  <Input
                    value={rule.requestDes}
                    placeholder="Describe the purpose of this rule."
                    onChange={(event) => onInterfaceListChange(groupIndex, interfaceIndex, 'requestDes', event.target.value)}
                  />
                </label>
              </div>

              <div className="rule-card__footer">
                <Button
                  icon={<EyeOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    onInterfaceListChange(groupIndex, interfaceIndex, 'open', !rule.open);
                  }}
                >
                  {rule.open ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  icon={<EditOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenModifyModal({
                      groupIndex,
                      interfaceIndex,
                      activeTab: 'Response',
                      request: rule.request,
                      replacementMethod: rule.replacementMethod,
                      replacementUrl: rule.replacementUrl,
                      replacementStatusCode: rule.replacementStatusCode,
                      headersText: rule.headers,
                      requestPayloadText: rule.requestPayloadText,
                      responseLanguage: rule.language,
                      responseText: rule.responseText,
                    });
                  }}
                >
                  Response
                </Button>
                <Button
                  icon={<SendOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenModifyModal({
                      groupIndex,
                      interfaceIndex,
                      activeTab: 'Request',
                      request: rule.request,
                      replacementMethod: rule.replacementMethod,
                      replacementUrl: rule.replacementUrl,
                      replacementStatusCode: rule.replacementStatusCode,
                      headersText: rule.headers,
                      requestPayloadText: rule.requestPayloadText,
                      responseLanguage: rule.language,
                      responseText: rule.responseText,
                    });
                  }}
                >
                  Request
                </Button>
                <Button
                  icon={<CodeOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenModifyModal({
                      groupIndex,
                      interfaceIndex,
                      activeTab: 'RequestPayload',
                      request: rule.request,
                      replacementMethod: rule.replacementMethod,
                      replacementUrl: rule.replacementUrl,
                      replacementStatusCode: rule.replacementStatusCode,
                      headersText: rule.headers,
                      requestPayloadText: rule.requestPayloadText,
                      responseLanguage: rule.language,
                      responseText: rule.responseText,
                    });
                  }}
                >
                  Payload
                </Button>
              </div>

              {ajaxToolsExpandAll ? (
                <div className="rule-card__expanded">
                  <div className="rule-card__expanded-item">
                    <span className="rule-card__expanded-label">Replacement URL</span>
                    <code>{rule.replacementUrl || 'Not configured'}</code>
                  </div>
                  <div className="rule-card__expanded-item">
                    <span className="rule-card__expanded-label">Status Code</span>
                    <code>{rule.replacementStatusCode || '200'}</code>
                  </div>
                  <div className="rule-card__expanded-item">
                    <span className="rule-card__expanded-label">Headers</span>
                    <pre>{rule.headers || 'Not configured'}</pre>
                  </div>
                  <div className="rule-card__expanded-item">
                    <span className="rule-card__expanded-label">Payload Script</span>
                    <pre>{rule.requestPayloadText || 'Not configured'}</pre>
                  </div>
                  <div className="rule-card__expanded-item">
                    <span className="rule-card__expanded-label">Response Body</span>
                    <pre>{rule.responseText || 'Not configured'}</pre>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="group-workbench__footer">
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => onInterfaceListAdd(groupIndex)}>
          Add Rule
        </Button>
      </div>
    </section>
  );
};

export default withErrorBoundary(GroupWorkbench);
