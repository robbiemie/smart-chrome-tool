import React from 'react';
import { Space, Switch } from 'antd';
import './index.css';

export interface GlobalSwitchItem {
  key: string;
  label: string;
  checked: boolean;
  checkedText: string;
  uncheckedText: string;
  loading?: boolean;
  onChange: (value: boolean) => void;
}

interface GlobalControlDockProps {
  items: GlobalSwitchItem[];
}

const GlobalControlDock = ({ items }: GlobalControlDockProps) => {
  if (!items.length) return null;
  return (
    <aside className="ajax-tools-global-control-dock">
      {items.map((item) => (
        <div key={item.key} className="ajax-tools-global-control-item">
          <span className="ajax-tools-global-control-label">{item.label}</span>
          <Space size={8}>
            <Switch
              checked={item.checked}
              loading={item.loading}
              checkedChildren={item.checkedText}
              unCheckedChildren={item.uncheckedText}
              onChange={item.onChange}
            />
          </Space>
        </div>
      ))}
    </aside>
  );
};

export default GlobalControlDock;
