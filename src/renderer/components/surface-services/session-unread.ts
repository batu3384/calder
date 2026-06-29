import * as sessionUnreadModule from '../../session-unread.js';

type SessionUnreadModule = typeof sessionUnreadModule;
const sessionUnread = sessionUnreadModule as SessionUnreadModule;

export const isUnread: SessionUnreadModule['isUnread'] = (...args) =>
  sessionUnread.isUnread(...args);
export const hasUnreadInProject: SessionUnreadModule['hasUnreadInProject'] = (...args) =>
  sessionUnread.hasUnreadInProject(...args);
export const onChange: SessionUnreadModule['onChange'] = (...args) =>
  sessionUnread.onChange(...args);
