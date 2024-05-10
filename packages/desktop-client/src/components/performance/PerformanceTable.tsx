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
            reconciled: true,
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
  const [vanguard, setVanguard] = useState('');

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

  function totalGain() {
    let gain = 0;
    data.forEach(element => {
      if (element.to_reconcile) {
        gain += element.to_reconcile - element.basis;
      }
    }, gain);
    return gain;
  }

  function parseVanguard() {
    const rows = vanguard.split('Transact');

    const copy = [...data];

    function findAccountAndSetValue(
      search: string,
      amount: string,
      sum?: boolean,
    ): number {
      let modifiedIndex = -1;
      if (search.length < 2) return modifiedIndex; // unlikely
      data.forEach((element, i) => {
        if (element.name.indexOf(search) == -1) return;
        if (amount.indexOf('\t') != -1) {
          amount = amount.split('\t')[1];
        }
        const value = amountToInteger(currencyToAmount(amount));
        if (sum) {
          copy[i].to_reconcile += value;
        } else {
          copy[i].to_reconcile = value;
        }
        modifiedIndex = i;
      });
      return modifiedIndex;
    }

    // Non-retirement accounts
    rows.forEach(element => {
      // Example:
      // ['VTSAX', 'VANGUARD', 'TOTAL', 'STOCK', 'MARKET', 'INDEX',
      //  'ADMIRAL', 'CL\t', '$125.48', '+$0.72', '+0.58%', '<amount>\t<total>']
      const columns = element.trim().split(' ');
      findAccountAndSetValue(columns[0], columns[columns.length - 1]);
      if (columns.length > 1) {
        findAccountAndSetValue(columns[1], columns[columns.length - 1]);
      }
    });

    // T-Bills (don't use logic, not tracked regularly)
    // rows.forEach(element => {
    //   // Example:
    //   // ['912797KU0', 'U', 'S', 'TREASURY', 'BILL', '0%', '10/17/24', '04/18/24\t',
    //   //  '$97.69', '+$0.02', '+0.02%', '<coupon>\t<value>']
    //   const columns = element.trim().split(' ');
    //   if (columns[4] === 'BILL' || columns[5] === 'BILL') {
    //     findAccountAndSetValue(
    //       'Treasury Bills',
    //       columns[columns.length - 1],
    //       true,
    //     );
    //   }
    // });

    // Retirement accounts (some hard coded stuff, oh well)
    const retirement = rows[rows.length - 1].split(' ');

    function parseAndProcessAccount(
      accountType,
      accountMatch,
      looksLikeValue,
      fromIndex?,
      sum?,
    ): number {
      let i = retirement.indexOf(accountType, fromIndex);

      // Not found
      if (i == -1) return -1;

      while (i < retirement.length) {
        console.log(accountType, retirement[i]);
        if (looksLikeValue(retirement[i])) {
          const accountIndex = findAccountAndSetValue(
            accountMatch,
            retirement[i],
            sum,
          );
          if (accountIndex != -1) return accountIndex;
        }
        i++;
      }
      return -1;
    }

    // Find Roth
    parseAndProcessAccount(
      'Roth',
      retirement.indexOf('Roth') == -1
        ? ''
        : retirement[retirement.indexOf('Roth') - 4] + ' Roth', // Name+Roth
      (value: string) => {
        return value[0] === '$';
      },
    );

    // Find PCRA
    let pcraIndex = parseAndProcessAccount('Self-Directed', 'PCRA', value => {
      return value.indexOf('$') != -1 && value.indexOf('\t') != -1;
    });

    // Find 401k
    let fourIndex = parseAndProcessAccount('401(K)', '401k Vanguard', value => {
      return value.indexOf('$') != -1;
    });

    // Manually separated PCRA and 401(K)
    if (fourIndex != -1 && pcraIndex != -1) {
      copy[fourIndex].to_reconcile -= copy[pcraIndex].to_reconcile;
    }

    setData(copy);
  }

  function renderItem({ item, index }) {
    if (!item) {
      return <Row></Row>;
    }
    const diff = item.to_reconcile ? item.to_reconcile - item.basis : 0;
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
            defaultValue={
              item.to_reconcile != null
                ? format(item.to_reconcile, 'financial')
                : ''
            }
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
        </Field>
        <Field width={200} name="gain">
          <Text
            style={{
              color:
                diff < 0
                  ? theme.errorText
                  : diff > 0
                    ? theme.noticeTextLight
                    : theme.pageTextSub,
            }}
          >
            {diff ? format(diff, 'financial') : ''}
          </Text>
        </Field>
        <Field width="flex" name="name">
          <Text>{item.name}</Text>
        </Field>
      </Row>
    );
  }

  const total = totalGain();
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
        <div>Paste from Vanguard</div>
        <Input onChange={e => setVanguard(e.currentTarget.value)} />
        <Button onClick={() => parseVanguard()}>Parse</Button>
        <br />
        <br />
      </div>
      <TableHeader height={ROW_HEIGHT} inset={15}>
        <Field width={200} style={{ textAlign: 'right' }}>
          Current Balance
        </Field>

        <Field width={200} style={{ textAlign: 'left' }}>
          New Balance
        </Field>
        <Field width={200} style={{ textAlign: 'left' }}>
          Gain/Loss
          <Text
            style={{
              color:
                total < 0
                  ? theme.errorText
                  : total > 0
                    ? theme.noticeTextLight
                    : theme.pageTextSub,
            }}
          >
            {' '}
            ({format(total, 'financial')})
          </Text>
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
