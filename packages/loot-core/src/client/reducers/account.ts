import * as constants from '../constants';
import type { Action } from '../state-types';
import type { AccountState } from '../state-types/account';

export const initialState: AccountState = {
  failedAccounts: {},
  accountsSyncing: [],
};

export function update(state = initialState, action: Action): AccountState {
  switch (action.type) {
    case constants.SET_ACCOUNTS_SYNCING:
      return {
        ...state,
        accountsSyncing: action.ids,
      };
    case constants.ACCOUNT_SYNC_STATUS: {
      const failedAccounts = { ...state.failedAccounts };
      if (action.failed) {
        failedAccounts[action.id] = {
          type: action.errorType,
          code: action.errorCode,
        };
      } else {
        delete failedAccounts[action.id];
      }

      return { ...state, failedAccounts };
    }
    default:
  }
  return state;
}
