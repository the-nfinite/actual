import { useState } from 'react';

import * as d from 'date-fns';

import { integerToCurrency } from 'loot-core/src/shared/util';

import { View } from '../../common';

import './IncomeVsExpenseTable.css';

function TotalAverage({ stats, cName }) {
  return (
    <>
      <td className={cName}>{integerToCurrency(stats.total)}</td>
      <td className={cName}>{integerToCurrency(stats.average)}</td>
    </>
  );
}

function _stats(data, monthsCount) {
  let sum = 0;
  data.forEach(d => (sum += d));
  return {
    total: sum,
    average: Math.round(sum / monthsCount),
  };
}

function CategoryRow(group, months, category, data) {
  return (
    <tr id={group}>
      <td className="cname">{category}</td>
      <TotalAverage
        stats={_stats([...data.values()], months.length)}
        cName="ctavg"
      />
      {months.map(m => {
        if (data.has(m)) {
          return <td>{integerToCurrency(data.get(m))}</td>;
        } else {
          return <td className="zero">0.00</td>;
        }
      })}
    </tr>
  );
}

function GroupSum(month, categories, expenses) {
  let sum = 0;
  for (const c of categories) {
    if (expenses.has(c)) {
      if (expenses.get(c).has(month)) {
        sum += expenses.get(c).get(month);
      }
    }
  }
  return sum;
}

function CategoryGroup(
  months,
  group,
  categories,
  expenses,
  displayedGroups,
  setDisplayedGroups,
) {
  const monthlySums = months.map(m => GroupSum(m, categories, expenses));
  return (
    <>
      <tr
        onClick={() => {
          if (displayedGroups.has(group)) displayedGroups.delete(group);
          else displayedGroups.add(group);
          setDisplayedGroups(new Set(displayedGroups));
        }}
      >
        <td className="cgroup">{group}</td>
        <TotalAverage
          stats={_stats(monthlySums, months.length)}
          cName="cgroup"
        />
        {monthlySums.map(s => {
          if (s) {
            return <td className="cgroup">{integerToCurrency(s)}</td>;
          } else {
            return <td className="cgroup-zero">0.00</td>;
          }
        })}
      </tr>
      {displayedGroups.has(group) &&
        [...categories].map(c =>
          CategoryRow(group, months, c, expenses.get(c)),
        )}
    </>
  );
}

// function replacer(key, value) {
//             <tr>
//               <td />
//               <td colSpan="9001" style={{ textAlign: 'left' }}>
//                 <pre>{JSON.stringify(graphData, replacer, 2)}</pre>
//               </td>
//             </tr>
//   if (value instanceof Map) {
//     return {
//       dataType: 'Map',
//       value: Array.from(value.entries()), // or with spread: value: [...value]
//     };
//   } else if (value instanceof Set) {
//     return {
//       dataType: 'Set',
//       value: [...value],
//     };
//   } else {
//     return value;
//   }
// }

export function IncomeVsExpenseTable({ style, start, end, graphData }) {
  const [displayedGroups, setDisplayedGroups] = useState(new Set());
  return (
    <View>
      <div className="scrollable-table">
        <table>
          <colgroup>
            <col id="category" />
            <col id="Total" />
            <col id="Average" />
            {graphData.months.map(m => (
              <col id={m} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th />
              <th>Total</th>
              <th>Average</th>
              {graphData.months.map(m => (
                <th key={m}>{d.format(d.parseISO(m), 'MMMM yyyy')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: 'LightPink' }}>
              <td style={{ fontWeight: 'bold' }}>Expenses</td>
              <td colSpan="9001" />
            </tr>
            {[...graphData.byParent.entries()].map(data => {
              return CategoryGroup(
                graphData.months,
                data[0], // Group
                data[1], // Set of Categories
                graphData.expenseLookup,
                displayedGroups,
                setDisplayedGroups,
              );
            })}

            <tr style={{ background: 'DarkSeaGreen' }}>
              <td style={{ fontWeight: 'bold' }}>Income</td>
              <td colSpan="9001" />
            </tr>
            {CategoryGroup(
              graphData.months,
              'All Income',
              new Set(graphData.incomeLookup.keys()),
              graphData.incomeLookup,
              displayedGroups,
              setDisplayedGroups,
            )}

            <tr style={{ background: 'LightSteelBlue' }}>
              <td style={{ fontWeight: 'bold' }}>Savings</td>
              <td colSpan="9001" />
            </tr>
            {CategoryGroup(
              graphData.months,
              'All Savings',
              new Set(graphData.savingsLookup.keys()),
              graphData.savingsLookup,
              displayedGroups,
              setDisplayedGroups,
            )}
          </tbody>
        </table>
      </div>
    </View>
  );
}
