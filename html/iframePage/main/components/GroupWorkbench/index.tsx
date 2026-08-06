import React, { useEffect } from 'react';
import { Button, Empty, Input, Select, Tag } from 'antd';
import {
  DeleteOutlined,
  PlusOutlined,
  EditOutlined,
  EyeOutlined,
  DownOutlined,
  RightOutlined,
  PushpinOutlined,
  PushpinFilled,
} from '@ant-design/icons';
import { AjaxGroup, ModifyDataModalOpenProps } from '../../types/registry';
import { withErrorBoundary } from '../../common/withErrorBoundary';
import ModuleSection from '../ModuleSection';

const HTTP_METHOD_OPTIONS = ['', 'GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE', 'PATCH'];
const MATCH_TYPE_OPTIONS = ['regex', 'normal'];

interface GroupWorkbenchProps {
  ajaxDataList: AjaxGroup[];
  selectedGroupIndex: number;
  group: AjaxGroup | null;
  groupIndex: number;
  selectedRuleIndex: number;
  ajaxToolsExpandAll: boolean;
  collapsed: boolean;
  onSelectGroup: (groupIndex: number) => void;
  onGroupAdd: () => void;
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
  ajaxDataList,
  selectedGroupIndex,
  group,
  groupIndex,
  selectedRuleIndex,
  ajaxToolsExpandAll,
  collapsed,
  onSelectGroup,
  onGroupAdd,
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
  const hasGroups = ajaxDataList.length > 0;

  // Group switcher bar: lives inside Group Studio so selecting/adding groups
  // and editing the selected group happen in one place. Rendered even when no
  // group exists so the user can create the first one.
  const groupSwitcherBar = (
    <div className="group-studio__bar">
      {hasGroups ? (
        <Select
          value={selectedGroupIndex}
          className="group-switcher__select"
          popupClassName="group-switcher__dropdown"
          onChange={onSelectGroup}
          options={ajaxDataList.map((item, index) => {
            const enabledCount = item.interfaceList.filter((rule) => rule.open).length;
            const isDisabled = enabledCount === 0;
            const title = item.summaryText || `Group ${index + 1}`;

            return {
              label: (
                <div className="group-switcher__option">
                  <span className={`group-switcher__option-dot ${item.headerClass}`} />
                  <span className="group-switcher__option-title">{title}</span>
                  <span className={`group-switcher__option-meta${isDisabled ? ' group-switcher__option-meta--disabled' : ''}`}>
                    {isDisabled ? 'Disabled' : `${enabledCount} active`}
                  </span>
                </div>
              ),
              value: index,
            };
          })}
        />
      ) : (
        <span className="group-studio__bar-empty">No groups yet</span>
      )}
      <Button type="text" size="small" icon={<PlusOutlined />} onClick={onGroupAdd} title="Add a new group">
        Add Group
      </Button>
    </div>
  );

  if (!group) {
    return (
      <ModuleSection
        title="Group Studio"
        description="Create a group to start composing rewrite rules."
        eyebrow="Group Studio"
        className="group-workbench group-workbench--empty"
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      >
        {groupSwitcherBar}
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Create a group to start composing rewrite rules."
        />
      </ModuleSection>
    );
  }

  const enabledRuleCount = group.interfaceList.filter((rule) => rule.open).length;
  const isGroupDisabled = enabledRuleCount === 0;

  useEffect(() => {
    if (collapsed) return;

    const isTypingTarget = (eventTarget: EventTarget | null) => {
      const target = eventTarget as HTMLElement | null;

      if (!target) return false;

      const tagName = target.tagName?.toLowerCase();
      return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
    };

    const getShortcutIndex = (key: string) => {
      if (key >= '1' && key <= '9') {
        return Number(key) - 1;
      }

      if (key === '0') {
        return 9;
      }

      return -1;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key.toLowerCase() === 't' && group.interfaceList[selectedRuleIndex]) {
        event.preventDefault();
        // 'top' placement toggles the pin state in useRegistry.
        onInterfaceMove(groupIndex, selectedRuleIndex, 'top');
        return;
      }

      const shortcutIndex = getShortcutIndex(event.key);
      const targetRule = group.interfaceList[shortcutIndex];

      if (!targetRule) {
        return;
      }

      event.preventDefault();
      onInterfaceListChange(groupIndex, shortcutIndex, 'open', !targetRule.open);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [collapsed, group.interfaceList, groupIndex, onInterfaceListChange, onInterfaceMove, selectedRuleIndex]);

  return (
    <ModuleSection
      title={group.summaryText || `Group ${groupIndex + 1}`}
      description={isGroupDisabled
        ? `Disabled group. ${group.interfaceList.length} rules are inactive and the group is pinned to the bottom.`
        : `${enabledRuleCount} of ${group.interfaceList.length} rules are active.`}
      eyebrow="Group Studio"
      className={`group-workbench${isGroupDisabled ? ' group-workbench--disabled' : ''}`}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    >
      {groupSwitcherBar}
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
          const ruleTitle = rule.requestDes || rule.request || `Rule ${interfaceIndex + 1}`;
          const shortcutLabel = interfaceIndex < 9 ? String(interfaceIndex + 1) : interfaceIndex === 9 ? '0' : '';

          const handleRuleCollapseToggle = (event: React.MouseEvent<HTMLElement>) => {
            event.stopPropagation();

            const nextActiveKeys = isRuleExpanded
              ? group.collapseActiveKeys.filter((activeKey) => activeKey !== rule.key)
              : [...group.collapseActiveKeys, rule.key];

            onCollapseChange(groupIndex, nextActiveKeys);
          };

          // Clicking the summary area both selects the rule and toggles its
          // expanded/collapsed state, so the whole header row acts as a hot
          // zone — not just the small arrow button.
          const handleSummaryClick = (event: React.MouseEvent<HTMLElement>) => {
            event.stopPropagation();
            onSelectRule(interfaceIndex);
            const nextActiveKeys = isRuleExpanded
              ? group.collapseActiveKeys.filter((activeKey) => activeKey !== rule.key)
              : [...group.collapseActiveKeys, rule.key];
            onCollapseChange(groupIndex, nextActiveKeys);
          };

                  // Clicking the status tag always toggles the rule's open
                  // state, regardless of whether the card is expanded or
                  // collapsed — consistent behavior so the tag is a reliable
                  // on/off affordance from any row state.
                  const handleStatusTagClick = (event: React.MouseEvent<HTMLElement>) => {
                    event.stopPropagation();
                    onSelectRule(interfaceIndex);
                    onInterfaceListChange(groupIndex, interfaceIndex, 'open', !rule.open);
                  };

          return (
            <article
              key={rule.key}
              className={`rule-card${isSelected ? ' rule-card--selected' : ''}${!rule.open ? ' rule-card--disabled' : ''}${!isRuleExpanded ? ' rule-card--collapsed' : ''}${rule.pinned ? ' rule-card--pinned' : ''}`}
              onClick={() => onSelectRule(interfaceIndex)}
            >
              <div className="rule-card__header">
                <div
                  className="rule-card__summary"
                  onClick={handleSummaryClick}
                  role="button"
                  tabIndex={0}
                >
                  <Tag
                    color={rule.open ? 'green' : 'default'}
                    className="rule-card__status-tag"
                    onClick={handleStatusTagClick}
                  >
                    {rule.open ? 'Active' : 'Disabled'}
                  </Tag>
                  <div className="rule-card__summary-text">
                    <strong>
                      {ruleTitle}
                      {shortcutLabel ? <span className="rule-card__shortcut-chip">{shortcutLabel}</span> : null}
                      {rule.pinned ? <span className="rule-card__pin-badge">PIN</span> : null}
                    </strong>
                    {rule.request && rule.requestDes ? <span>{rule.request}</span> : null}
                  </div>
                </div>
                <div className="rule-card__toolbar">
                  <Button
                    type="text"
                    className="rule-card__pin-btn"
                    icon={rule.pinned ? <PushpinFilled /> : <PushpinOutlined />}
                    title={rule.pinned ? 'Unpin' : 'Pin to top'}
                    onClick={(event) => {
                      event.stopPropagation();
                      onInterfaceMove(groupIndex, interfaceIndex, 'top');
                    }}
                  />
                  <Button
                    type="text"
                    icon={isRuleExpanded ? <DownOutlined /> : <RightOutlined />}
                    onClick={handleRuleCollapseToggle}
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
                  <div className="rule-card__meta">
                    <Tag color="blue">{rule.matchType || 'regex'}</Tag>
                    {rule.matchMethod ? <Tag>{rule.matchMethod}</Tag> : null}
                    {/* Surface non-default status codes so error/redirect mocks
                        are discoverable without opening the editor. 200 is the
                        default and intentionally omitted to avoid noise. */}
                    {rule.replacementStatusCode && rule.replacementStatusCode !== '200' ? (
                      <Tag color="orange">{rule.replacementStatusCode}</Tag>
                    ) : null}
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
                      Edit
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
        <Button type="primary" icon={<PlusOutlined />} onClick={() => onInterfaceListAdd(groupIndex)}>
          Add Rule
        </Button>
        <Button danger type="text" onClick={() => onGroupDelete(groupIndex)}>
          Remove Group
        </Button>
      </div>
    </ModuleSection>
  );
};

export default withErrorBoundary(GroupWorkbench);
