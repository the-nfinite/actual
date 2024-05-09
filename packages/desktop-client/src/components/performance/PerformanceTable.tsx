// @ts-strict-ignore
import { useEffect, useState } from 'react';

import { format as formatDate, parseISO } from 'date-fns';

import { currentDay } from 'loot-core/src/shared/months';
import { amountToInteger, currencyToAmount } from 'loot-core/src/shared/util';

import { useDateFormat } from '../../hooks/useDateFormat';
import { theme } from '../../style';
import { Button } from '../common/Button';
import { Text } from '../common/Text';
import { View } from '../common/View';
import { Field, Row, Table, TableHeader } from '../table';

import { AccountEntity } from 'loot-core/src/types/models';

import * as queries from 'loot-core/src/client/queries';
import { runQuery } from 'loot-core/src/client/query-helpers';
import { send } from 'loot-core/src/platform/client/fetch';
import { realizeTempTransactions } from 'loot-core/src/shared/transactions';
import { usePayees } from '../../hooks/usePayees';
import { PayeeAutocomplete } from '../autocomplete/PayeeAutocomplete';
import { Input } from '../common/Input';
import { DateSelect } from '../select/DateSelect';
import { CellValue } from '../spreadsheet/CellValue';
import { useFormat } from '../spreadsheet/useFormat';

type Item = {
  account: AccountEntity;
  id: string;
  name: string;
  basis: number | null;
  to_reconcile: number | null;
};

export const ROW_HEIGHT = 43;

async function applyReconciliations(
  targetDate: string,
  data: Item[],
  targetPayeeId: string,
) {
  const reconciliationTransactions = data
    .filter(
      item => item.to_reconcile != null && item.basis != item.to_reconcile,
    )
    .map(
      item =>
        realizeTempTransactions([
          {
            id: 'temp',
            account: item.id,
            cleared: true,
            reconciled: false,
            amount: item.to_reconcile - item.basis,
            date: targetDate,
            payee: targetPayeeId,
          },
        ])[0],
    );
  const changes = {
    added: reconciliationTransactions,
  };
  await send('transactions-batch-update', changes);
}

export function PerformanceTable({ offBudgetAccounts, style, tableStyle }) {
  const format = useFormat();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';

  // Data storage for this page.
  const [data, setData] = useState([]);
  const [targetDate, setTargetDate] = useState(currentDay());
  const [targetPayee, setTargetPayee] = useState({});
  const retrievedPayees = usePayees();

  useEffect(() => {
    const singular = retrievedPayees.filter(
      payee => payee.name === 'Performance',
    );
    if (singular.length == 0) return;
    setTargetPayee(singular[0]);
  }, [retrievedPayees]);

  // Reinitialize if necessary
  const transformation: Item[] = offBudgetAccounts.map(account => ({
    account: account,
    id: account.id,
    name: account.name,
    basis: null,
    to_reconcile: null,
  }));
  if (data.length != transformation.length) {
    setData(transformation);
  }

  // Update Data on change to offBudgetAccounts
  useEffect(() => {
    if (offBudgetAccounts.length == 0) return;

    // Query balances serially
    function queryResult(index, value) {
      // Update basis with result of query
      if (value != null) {
        const copy = [...data];
        copy[index].basis = value;
        setData(copy);
        index += 1; // Prep for next one
      }

      // No more accounts to query
      if (index >= data.length) return;

      // Query next result
      runQuery(queries.accountBalance(offBudgetAccounts[index]).query).then(
        value => {
          queryResult(index, value.data);
        },
      );
    }

    // Kick off queries
    queryResult(0, null);
  }, [JSON.stringify(offBudgetAccounts)]);

  function setReconciliationTarget(index, value) {
    const copy = [...data];
    copy[index].to_reconcile = value;
    setData(copy);
  }
  function syncBasis() {
    const copy = [...data];
    copy.forEach(item => {
      if (item.to_reconcile) {
        item.basis = item.to_reconcile;
      }
    });
    setData(copy);
  }

  function renderItem({ item, index }) {
    if (!item) {
      return <Row></Row>;
    }
    return (
      <Row
        height={ROW_HEIGHT}
        inset={15}
        style={{
          cursor: 'pointer',
          backgroundColor: 'transparent',
          ':hover': { backgroundColor: theme.tableRowBackgroundHover },
        }}
        key={item.id}
      >
        <Field width={200} style={{ textAlign: 'right' }} name="amount">
          <CellValue binding={queries.accountBalance(item)} type="financial" />
        </Field>
        <Field width={200} style={{ textAlign: 'right' }} name="todo">
          <Input
            type="text"
            style={{ backgroundColor: 'transparent' }}
            onFocus={e => e.target.select()}
            onBlur={e => {
              const value = e.currentTarget.value;
              if (value.trim() === '') {
                setReconciliationTarget(index, null);
                return;
              }

              const financial = amountToInteger(
                currencyToAmount(e.currentTarget.value),
              );
              e.currentTarget.value = format(financial, 'financial');
              setReconciliationTarget(index, financial);
            }}
          />
        </Field>{' '}
        <Field width="flex" name="name">
          <Text>{item.name}</Text>
        </Field>
      </Row>
    );
  }

  return (
    <View style={{ flex: 1, ...tableStyle }}>
      <div>
        Date (be careful of existing transactions on future dates, does not
        currently handle!)
        <DateSelect
          inputProps={{
            placeholder: formatDate(parseISO(targetDate), dateFormat),
          }}
          value={formatDate(parseISO(targetDate), dateFormat)}
          onSelect={value => {
            setTargetDate(value);
          }}
          containerProps={{ style: { width: 100 } }}
          dateFormat={dateFormat}
        />
        <br />
        Payee
        <PayeeAutocomplete
          labelProps={{ id: 'payee-label' }}
          inputProps={{ id: 'payee-field', placeholder: targetPayee.name }}
          onSelect={(id, value) => {
            setTargetPayee({ id: id, name: value });
          }}
        />
        <br />
        <Button
          onClick={() => {
            applyReconciliations(targetDate, data, targetPayee.id);
            syncBasis();
          }}
        >
          Submit
        </Button>
        <br />
      </div>
      <TableHeader height={ROW_HEIGHT} inset={15}>
        <Field width={200} style={{ textAlign: 'right' }}>
          Current Balance
        </Field>

        <Field width={200} style={{ textAlign: 'left' }}>
          New Balance
        </Field>
        <Field width="flex">Account</Field>
      </TableHeader>
      {/* {reconciles.map(item => renderItem(item))} */}
      <Table
        rowHeight={ROW_HEIGHT}
        backgroundColor="transparent"
        style={{ flex: 1, backgroundColor: 'transparent', ...style }}
        items={data}
        renderItem={renderItem}
        renderEmpty={'Nope'}
      />
    </View>
  );
}
