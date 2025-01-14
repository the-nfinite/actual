// @ts-strict-ignore
import { send } from '../../platform/client/fetch';
import * as constants from '../constants';
import type {
  AccountSyncStatusAction,
  SetAccountsSyncingAction,
} from '../state-types/account';
import type {
  MarkAccountReadAction,
  SetLastTransactionAction,
  UpdateNewTransactionsAction,
} from '../state-types/queries';
import { type AppDispatch, type GetRootState } from '../store';

import { addNotification } from './notifications';
import { getPayees, getAccounts } from './queries';

export function setAccountsSyncing(
  ids: SetAccountsSyncingAction['ids'],
): SetAccountsSyncingAction {
  return {
    type: constants.SET_ACCOUNTS_SYNCING,
    ids,
  };
}

export function markAccountFailed(
  id: AccountSyncStatusAction['id'],
  errorType?: string,
  errorCode?: string,
): AccountSyncStatusAction {
  return {
    type: 'ACCOUNT_SYNC_STATUS',
    id,
    failed: true,
    errorType,
    errorCode,
  };
}
export function markAccountSuccess(
  id: AccountSyncStatusAction['id'],
): AccountSyncStatusAction {
  return {
    type: 'ACCOUNT_SYNC_STATUS',
    id,
    failed: false,
  };
}

export function unlinkAccount(id: string) {
  return async (dispatch: AppDispatch) => {
    await send('account-unlink', { id });
    dispatch(markAccountSuccess(id));
    dispatch(getAccounts());
  };
}

export function linkAccount(
  requisitionId: string,
  account: unknown,
  upgradingId?: string,
  offBudget?: boolean,
) {
  return async (dispatch: AppDispatch) => {
    await send('gocardless-accounts-link', {
      requisitionId,
      account,
      upgradingId,
      offBudget,
    });
    await dispatch(getPayees());
    await dispatch(getAccounts());
  };
}

export function linkAccountSimpleFin(
  externalAccount: unknown,
  upgradingId?: string,
  offBudget?: boolean,
) {
  return async (dispatch: AppDispatch) => {
    await send('simplefin-accounts-link', {
      externalAccount,
      upgradingId,
      offBudget,
    });
    await dispatch(getPayees());
    await dispatch(getAccounts());
  };
}

function handleSyncResponse(
  accountId,
  res,
  dispatch,
  resNewTransactions,
  resMatchedTransactions,
  resUpdatedAccounts,
) {
  const { errors, newTransactions, matchedTransactions, updatedAccounts } = res;

  // Mark the account as failed or succeeded (depending on sync output)
  const [error] = errors;
  if (error) {
    // We only want to mark the account as having problem if it
    // was a real syncing error.
    if (error.type === 'SyncError') {
      dispatch(markAccountFailed(accountId, error.category, error.code));
    }
  } else {
    dispatch(markAccountSuccess(accountId));
  }

  // Dispatch errors (if any)
  errors.forEach(error => {
    if (error.type === 'SyncError') {
      dispatch(
        addNotification({
          type: 'error',
          message: error.message,
        }),
      );
    } else {
      dispatch(
        addNotification({
          type: 'error',
          message: error.message,
          internal: error.internal,
        }),
      );
    }
  });

  resNewTransactions.push(...newTransactions);
  resMatchedTransactions.push(...matchedTransactions);
  resUpdatedAccounts.push(...updatedAccounts);

  return newTransactions.length > 0 || matchedTransactions.length > 0;
}

export function syncAccounts(id?: string) {
  return async (dispatch: AppDispatch, getState: GetRootState) => {
    // Disallow two parallel sync operations
    if (getState().account.accountsSyncing.length > 0) {
      return false;
    }

    const batchSync = !id;

    // Build an array of IDs for accounts to sync.. if no `id` provided
    // then we assume that all accounts should be synced
    let accountIdsToSync = !batchSync
      ? [id]
      : getState()
          .queries.accounts.filter(
            ({ bank, closed, tombstone }) => !!bank && !closed && !tombstone,
          )
          .sort((a, b) =>
            a.offbudget === b.offbudget
              ? a.sort_order - b.sort_order
              : a.offbudget - b.offbudget,
          )
          .map(({ id }) => id);

    dispatch(setAccountsSyncing(accountIdsToSync));

    const accountsData = await send('accounts-get');
    const simpleFinAccounts = accountsData.filter(
      a => a.account_sync_source === 'simpleFin',
    );

    let isSyncSuccess = false;
    const newTransactions = [];
    const matchedTransactions = [];
    const updatedAccounts = [];

    if (batchSync && simpleFinAccounts.length > 0) {
      console.log('Using SimpleFin batch sync');

      const res = await send('simplefin-batch-sync', {
        ids: simpleFinAccounts.map(a => a.id),
      });

      for (const account of res) {
        const success = handleSyncResponse(
          account.accountId,
          account.res,
          dispatch,
          newTransactions,
          matchedTransactions,
          updatedAccounts,
        );
        if (success) isSyncSuccess = true;
      }

      accountIdsToSync = accountIdsToSync.filter(
        id => !simpleFinAccounts.find(sfa => sfa.id === id),
      );
    }

    // Loop through the accounts and perform sync operation.. one by one
    for (let idx = 0; idx < accountIdsToSync.length; idx++) {
      const accountId = accountIdsToSync[idx];

      // Perform sync operation
      const res = await send('accounts-bank-sync', {
        ids: [accountId],
      });

      const success = handleSyncResponse(
        accountId,
        res,
        dispatch,
        newTransactions,
        matchedTransactions,
        updatedAccounts,
      );

      if (success) isSyncSuccess = true;

      // Dispatch the ids for the accounts that are yet to be synced
      dispatch(setAccountsSyncing(accountIdsToSync.slice(idx + 1)));
    }

    // Set new transactions
    dispatch({
      type: constants.SET_NEW_TRANSACTIONS,
      newTransactions,
      matchedTransactions,
      updatedAccounts,
    });

    // Reset the sync state back to empty (fallback in case something breaks
    // in the logic above)
    dispatch(setAccountsSyncing([]));
    return isSyncSuccess;
  };
}

// Remember the last transaction manually added to the system
export function setLastTransaction(
  transaction: SetLastTransactionAction['transaction'],
): SetLastTransactionAction {
  return {
    type: constants.SET_LAST_TRANSACTION,
    transaction,
  };
}

export function parseTransactions(filepath, options) {
  return async () => {
    return await send('transactions-parse-file', {
      filepath,
      options,
    });
  };
}

export function importPreviewTransactions(id: string, transactions) {
  return async (dispatch: AppDispatch): Promise<boolean> => {
    const { errors = [], updatedPreview } = await send('transactions-import', {
      accountId: id,
      transactions,
      isPreview: true,
    });

    errors.forEach(error => {
      dispatch(
        addNotification({
          type: 'error',
          message: error.message,
        }),
      );
    });

    return updatedPreview;
  };
}

export function importTransactions(id: string, transactions, reconcile = true) {
  return async (dispatch: AppDispatch): Promise<boolean> => {
    if (!reconcile) {
      await send('api/transactions-add', {
        accountId: id,
        transactions,
      });

      return true;
    }

    const {
      errors = [],
      added,
      updated,
    } = await send('transactions-import', {
      accountId: id,
      transactions,
      isPreview: false,
    });

    errors.forEach(error => {
      dispatch(
        addNotification({
          type: 'error',
          message: error.message,
        }),
      );
    });

    dispatch({
      type: constants.SET_NEW_TRANSACTIONS,
      newTransactions: added,
      matchedTransactions: updated,
      updatedAccounts: added.length > 0 ? [id] : [],
    });

    return added.length > 0 || updated.length > 0;
  };
}

export function updateNewTransactions(changedId): UpdateNewTransactionsAction {
  return {
    type: constants.UPDATE_NEW_TRANSACTIONS,
    changedId,
  };
}

export function markAccountRead(accountId): MarkAccountReadAction {
  return {
    type: constants.MARK_ACCOUNT_READ,
    accountId,
  };
}

export function moveAccount(id, targetId) {
  return async (dispatch: AppDispatch) => {
    await send('account-move', { id, targetId });
    dispatch(getAccounts());
    dispatch(getPayees());
  };
}
