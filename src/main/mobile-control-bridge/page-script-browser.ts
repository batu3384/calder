import { MOBILE_PAGE_SCRIPT_BROWSER_ACTIONS } from './page-script-browser-actions';
import { MOBILE_PAGE_SCRIPT_BROWSER_SYNC } from './page-script-browser-sync';
import { MOBILE_PAGE_SCRIPT_BROWSER_UI } from './page-script-browser-ui';

export const MOBILE_PAGE_SCRIPT_BROWSER = `${MOBILE_PAGE_SCRIPT_BROWSER_UI}${MOBILE_PAGE_SCRIPT_BROWSER_SYNC}${MOBILE_PAGE_SCRIPT_BROWSER_ACTIONS}`;
