import { MOBILE_PAGE_SCRIPT_CRYPTO_CONNECTION } from './page-script-crypto-connection';
import { MOBILE_PAGE_SCRIPT_CRYPTO_ENV } from './page-script-crypto-env';
import { MOBILE_PAGE_SCRIPT_CRYPTO_NETWORK } from './page-script-crypto-network';
import { MOBILE_PAGE_SCRIPT_CRYPTO_PRIMITIVES } from './page-script-crypto-primitives';

export const MOBILE_PAGE_SCRIPT_CRYPTO = `${MOBILE_PAGE_SCRIPT_CRYPTO_PRIMITIVES}${MOBILE_PAGE_SCRIPT_CRYPTO_CONNECTION}${MOBILE_PAGE_SCRIPT_CRYPTO_ENV}${MOBILE_PAGE_SCRIPT_CRYPTO_NETWORK}`;
