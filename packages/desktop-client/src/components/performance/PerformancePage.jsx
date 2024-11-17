import { useOffBudgetAccounts } from '../../hooks/useOffBudgetAccounts';
import { theme } from '../../style';
import { Page } from '../Page';

import { PerformanceTable } from './PerformanceTable';

import { View } from '../common/View';

export function PerformancePage() {
  const offBudgetAccounts = useOffBudgetAccounts();

  return (
    <Page title="Batch Update Performance">
      <PerformanceTable
        offBudgetAccounts={offBudgetAccounts}
        style={{ backgroundColor: theme.tableBackground }}
      />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          margin: '20px 0',
          flexShrink: 0,
        }}
      ></View>
    </Page>
  );
}
