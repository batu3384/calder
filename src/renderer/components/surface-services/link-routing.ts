import * as linkRoutingModule from '../../link-routing.js';

type LinkRoutingModule = typeof linkRoutingModule;
const linkRouting = linkRoutingModule as LinkRoutingModule;

export type { LinkDispatchSnapshot } from '../../link-routing.js';

export const resolveNavigableHttpUrl: LinkRoutingModule['resolveNavigableHttpUrl'] = (...args) =>
  linkRouting.resolveNavigableHttpUrl(...args);

export const shouldDispatchLinkOpen: LinkRoutingModule['shouldDispatchLinkOpen'] = (...args) =>
  linkRouting.shouldDispatchLinkOpen(...args);
