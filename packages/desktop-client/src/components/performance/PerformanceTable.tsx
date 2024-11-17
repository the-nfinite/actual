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

import { q } from 'loot-core/shared/query';
import { NotesButton } from '../NotesButton';

type Item = {
  account: AccountEntity;
  id: string;
  name: string;
  basis: number | null;
  to_reconcile: number | null;
  notes: string | null;
  debug: string;
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
  const [inputToParse, setInputToParse] = useState('');
  const [loading, setLoading] = useState(false);
  const [debug, setDebug] = useState(false);

  // Set default Payee to 'Performance'
  const retrievedPayees = usePayees();
  useEffect(() => {
    const performancePayee = retrievedPayees.filter(
      payee => payee.name === 'Performance',
    );
    if (performancePayee.length == 0) return;
    setTargetPayee(performancePayee[0]);
  }, [retrievedPayees]);

  // Reinitialize if necessary
  const transformation: Item[] = offBudgetAccounts.map(account => ({
    account: account,
    id: account.id,
    name: account.name,
    basis: null,
    to_reconcile: null,
    notes: '',
    debug: '',
  }));
  if (data.length != transformation.length) {
    setData(transformation);
  }

  // Update Data on change to offBudgetAccounts
  useEffect(() => {
    if (offBudgetAccounts.length == 0) return;

    // Query balances serially
    function basisQueryResult(index, value) {
      // Update basis with result of query
      if (value != null) {
        const copy = [...data];
        copy[index].basis = value;
        setData(copy);
        index += 1; // Prep for next one
      }

      // No more accounts to query, start the notes queries
      if (index >= data.length) {
        return;
      }

      // Query next result
      runQuery(queries.accountBalance(offBudgetAccounts[index]).query).then(
        value => {
          basisQueryResult(index, value.data);
        },
      );
    }

    // Kick off queries
    basisQueryResult(0, null);
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

  function parseEachAccount() {
    data.forEach((row, i) => {
      if (!row.notes || row.notes.indexOf('### PerformanceRegex\n') == -1) {
        return;
      }

      const lines = row.notes.split('\n');
      // Looking for
      // +++`<regex>` or ---`<regex>`
      // where +++ adds to the reconciliation amount and --- subtracts
      // Shortcut $$$ to capture currency value => r'([\$\d\.,]+)'
      // Example:
      //   +++`VTSAX.*?\t$$$`
      let sum = 0;
      let debug = '';
      let found = false;
      lines.forEach(line => {
        let dir = 1;
        if (line.indexOf('---`') == 0) {
          dir = -1;
        } else if (line.indexOf('+++`') == 0) {
          dir = 1;
        } else {
          // Not a regex line
          return;
        }
        line = line.replace('$$$', '([\\$\\d.,]+)');
        const re_str = line.split('`')[1];
        const findAll = new RegExp(re_str, 'g');
        const matches = inputToParse.match(findAll);
        if (!matches) return;
        const re = new RegExp(re_str);
        matches.forEach(match => {
          console.log(match);
          const result = match.match(re);
          const value = amountToInteger(currencyToAmount(result[1]));
          sum += dir * value;
          debug += (dir > 0 ? '+' : '-') + `[${result[0]}] `;
          found = true;
        });
      });
      if (!found) return;

      const copy = [...data];
      copy[i].to_reconcile = sum;
      copy[i].debug = debug;
      setData(copy);
    });
  }

  function getLatestNotesThenParse() {
    // Query notes serially
    function notesQueryResult(index, value) {
      // Update basis with result of query
      if (value != null) {
        const notes =
          value.data && value.data.length > 0 ? value.data[0].note : null;
        const copy = [...data];
        copy[index].notes = notes;
        setData(copy);
        index += 1; // Prep for next one
      }
      // No more accounts to query
      if (index >= data.length) {
        setLoading(false);
        parseEachAccount();
        return;
      }
      // Query next result
      runQuery(
        q('notes')
          .filter({ id: `account-${data[index].id}` })
          .select('*'),
      ).then(value => {
        notesQueryResult(index, value);
      });
    }
    setLoading(true);
    notesQueryResult(0, null);
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
        <Field width={50}>
          <NotesButton
            id={`account-${item.id}`}
            defaultColor={theme.pageTextSubdued}
          />
        </Field>
        <Field width={debug ? 300 : 'flex'} name="name">
          <Text>{item.name}</Text>
        </Field>
        <Field width={debug ? 'flex' : 0}>{item.debug}</Field>
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
        <div>Parseable Input</div>
        <Input onChange={e => setInputToParse(e.currentTarget.value || null)} />
        <Button disabled={loading} onClick={() => getLatestNotesThenParse()}>
          {loading ? 'Getting latest parsers from account notes' : 'Parse'}
        </Button>
        <br />
        <Input
          type="checkbox"
          checked={debug}
          onChange={() => setDebug(!debug)}
        />{' '}
        Debug
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
        <Field width={50} style={{ textAlign: 'center' }}>
          Notes
        </Field>
        <Field width={debug ? 300 : 'flex'}>Account</Field>
        <Field width={debug ? 'flex' : 0}>Debug</Field>
      </TableHeader>
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
