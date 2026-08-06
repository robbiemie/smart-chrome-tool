import React from 'react';
import { Button } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import { withErrorBoundary } from '../../common/withErrorBoundary';
import './index.css';

interface ModuleSectionProps {
  title: React.ReactNode;
  description?: string;
  eyebrow?: string;
  // When false, the collapse toggle is hidden and the section can never
  // collapse. Use for sections that are the sole content of their container —
  // collapsing them would just leave an empty void (e.g. GroupWorkbench inside
  // the Rules tab).
  collapsible?: boolean;
  collapsed: boolean;
  className?: string;
  extra?: React.ReactNode;
  extraInline?: boolean;
  children: React.ReactNode;
  onToggleCollapse: () => void;
}

const ModuleSection = ({
  title,
  description,
  eyebrow,
  collapsible = true,
  collapsed,
  className,
  extra,
  extraInline = false,
  children,
  onToggleCollapse,
}: ModuleSectionProps) => {
  const inlineExtraNode = extraInline ? extra : null;
  const blockExtraNode = extraInline ? null : extra;
  const isCollapsed = collapsible && collapsed;

  return (
    <section className={`module-section${className ? ` ${className}` : ''}${isCollapsed ? ' module-section--collapsed' : ''}`}>
      <div className="module-section__header">
        <div className="module-section__title-area">
          {eyebrow ? <span className="module-section__eyebrow">{eyebrow}</span> : null}
          <div className="module-section__title-row">
            <h2 className="module-section__title">{title}</h2>
            <div className="module-section__title-controls">
              {inlineExtraNode ? <div className="module-section__extra module-section__extra--inline">{inlineExtraNode}</div> : null}
              {collapsible ? (
                <Button
                  type="text"
                  className="module-section__toggle"
                  icon={isCollapsed ? <RightOutlined /> : <DownOutlined />}
                  onClick={onToggleCollapse}
                />
              ) : null}
            </div>
          </div>
          {description ? <p className="module-section__description">{description}</p> : null}
        </div>
      </div>
      {blockExtraNode ? <div className="module-section__extra">{blockExtraNode}</div> : null}
      <div className="module-section__body">{children}</div>
    </section>
  );
};

export default withErrorBoundary(ModuleSection);
