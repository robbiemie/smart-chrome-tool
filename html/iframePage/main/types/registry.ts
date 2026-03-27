import { AjaxDataListObject, DefaultInterfaceObject } from '../../common/value';

export type AjaxGroup = AjaxDataListObject;
export type AjaxRule = DefaultInterfaceObject;

export interface WorkbenchMetrics {
  totalGroups: number;
  totalRules: number;
  enabledRules: number;
  regexRules: number;
}

export interface ModifyDataModalOpenProps {
  groupIndex: number;
  interfaceIndex: number;
  activeTab: string;
  request: string;
  replacementMethod: string;
  replacementUrl: string;
  replacementStatusCode: string;
  headersText: string;
  requestPayloadText: string;
  responseLanguage: string;
  responseText: string;
}
