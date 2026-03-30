import React from 'react';
import { Button, Dropdown, Empty, Input, Select, Tag } from 'antd';
import {
  DeleteOutlined,
  PlusOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
  EditOutlined,
  CodeOutlined,
  SendOutlined,
  EyeOutlined,
  MoreOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { AjaxGroup, ModifyDataModalOpenProps } from '../../types/registry';
import { withErrorBoundary } from '../../common/withErrorBoundary';
import ModuleSection from '../ModuleSection';

const HTTP_METHOD_OPTIONS = ['', 'GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE', 'PATCH'];
const MATCH_TYPE_OPTIONS = ['regex', 'normal'];

interface GroupWorkbenchProps {
  group: AjaxGroup | null;
  groupIndex: number;
  selectedRuleIndex: number;
  ajaxToolsExpandAll: boolean;
  collapsed: boolean;
  onSelectRule: (ruleIndex: number) => void;
  onGroupSummaryTextChange: (event: React.ChangeEvent<HTMLInputElement>, groupIndex: number) => void;
  onGroupMove: (groupIndex: number, placement: string) => void;
  onGroupDelete: (groupIndex: number) => void;
  onGroupOpenChange: (groupIndex: number, open: boolean) => void;
  onCollapseChange: (groupIndex: number, keys: string | string[]) => void;
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
  onToggleCollapse: () => void;
}

const GroupWorkbench = ({
  group,
  groupIndex,
  selectedRuleIndex,
  ajaxToolsExpandAll,
  collapsed,
  onSelectRule,
  onGroupSummaryTextChange,
  onGroupMove,
  onGroupDelete,
  onGroupOpenChange,
  onCollapseChange,
  onInterfaceListAdd,
  onInterfaceListDelete,
  onInterfaceMove,
  onInterfaceListChange,
  onOpenModifyModal,
  onToggleCollapse,
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

  const enabledRuleCount = group.interfaceList.filter((rule) => rule.open).length;
  const isGroupDisabled = enabledRuleCount === 0;

  return (
    <ModuleSection
      title={group.summaryText || `Group ${groupIndex + 1}`}
      description={isGroupDisabled
        ? `Disabled group. ${group.interfaceList.length} rules are inactive and the group is pinned to the bottom.`
        : `${enabledRuleCount} of ${group.interfaceList.length} rules are active.`}
      eyebrow="Group Studio"
      className={`group-workbench${isGroupDisabled ? ' group-workbench--disabled' : ''}`}
      collapsed={collapsed}
      extra={(
        <div className="group-workbench__toolbar">
          <div className="group-workbench__toolbar-group">
            <Button size="small" onClick={() => onGroupOpenChange(groupIndex, true)}>
              Enable All
            </Button>
            <Button size="small" onClick={() => onGroupOpenChange(groupIndex, false)}>
              Disable All
            </Button>
          </div>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'move-top',
                  label: 'Pin Top',
                  icon: <VerticalAlignTopOutlined />,
                  onClick: () => onGroupMove(groupIndex, 'top'),
                },
                {
                  key: 'move-bottom',
                  label: 'Send Bottom',
                  icon: <VerticalAlignBottomOutlined />,
                  onClick: () => onGroupMove(groupIndex, 'bottom'),
                },
                {
                  key: 'remove-group',
                  label: 'Remove Group',
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: () => onGroupDelete(groupIndex),
                },
              ],
            }}
          >
            <Button size="small" icon={<MoreOutlined />}>
              More
            </Button>
          </Dropdown>
        </div>
      )}
      onToggleCollapse={onToggleCollapse}
    >
      <Input
        value={group.summaryText}
        className={`group-title-input${isGroupDisabled ? ' group-title-input--disabled' : ''}`}
        placeholder="Group title"
        onChange={(event) => onGroupSummaryTextChange(event, groupIndex)}
      />

      <div className="rule-card-list">
        {group.interfaceList.map((rule, interfaceIndex) => {
          const isSelected = interfaceIndex === selectedRuleIndex;
          const isRuleExpanded = group.collapseActiveKeys.includes(rule.key);

          const handleRuleCollapseToggle = (event: React.MouseEvent<HTMLElement>) => {
            event.stopPropagation();

            const nextActiveKeys = isRuleExpanded
              ? group.collapseActiveKeys.filter((activeKey) => activeKey !== rule.key)
              : [...group.collapseActiveKeys, rule.key];

            onCollapseChange(groupIndex, nextActiveKeys);
          };

          return (
            <article
              key={rule.key}
              className={`rule-card${isSelected ? ' rule-card--selected' : ''}${!rule.open ? ' rule-card--disabled' : ''}${!isRuleExpanded ? ' rule-card--collapsed' : ''}`}
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
                    icon={isRuleExpanded ? <DownOutlined /> : <RightOutlined />}
                    onClick={handleRuleCollapseToggle}
                  />
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

              {isRuleExpanded ? (
                <>
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
                </>
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
    </ModuleSection>
  );
};

export default withErrorBoundary(GroupWorkbench);
