import { useState } from 'react';

export const useToggle = () => {
  const [ajaxToolsSwitchOn, setAjaxToolsSwitchOn] = useState(true); // 默认开启
  const [ajaxToolsExpandAll, setAjaxToolsExpandAll] = useState(false); // 默认开启

  const updateAjaxToolsSwitchOn = (value: boolean) => {
    setAjaxToolsSwitchOn(value);
  };

  return {
    ajaxToolsSwitchOn,
    ajaxToolsExpandAll,
    setAjaxToolsSwitchOn,
    setAjaxToolsExpandAll,
    updateAjaxToolsSwitchOn,
  };
};