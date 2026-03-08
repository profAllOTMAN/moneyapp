import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { Pie, Line, Column } from '@ant-design/charts';
import dayjs from 'dayjs';
import { hasSupabaseEnv, supabase } from './supabaseClient';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const incomeSources = ['Job', 'Freelance', 'Offline Business', 'Investment Returns'];
const expenseCategories = ['Food', 'Transport', 'Rent', 'Bills', 'Entertainment', 'Shopping', 'Health', 'Business expenses'];
const investmentTypes = ['Stock / Inventory', 'Marketing', 'Equipment', 'Operations', 'Expansion'];

const defaultData = {
  incomes: [],
  expenses: [],
  investments: [],
  savingsGoals: [],
};
const AUTO_SWEEP_PREFIX = 'moneyflow-pro-auto-sweep';

const KEY_TO_TYPE = {
  incomes: 'income',
  expenses: 'expenses',
  investments: 'investments',
  savingsGoals: 'savings',
};

const TYPE_TO_KEY = {
  income: 'incomes',
  expenses: 'expenses',
  investments: 'investments',
  savings: 'savingsGoals',
};
const TRANSACTION_TAG_COLORS = {
  Income: 'green',
  Expense: 'red',
  Investment: 'purple',
};
const TRANSFER_FROM_OPTIONS = [
  { value: 'balance', label: 'Balance' },
  { value: 'savings', label: 'Savings Goal' },
];
const TRANSFER_TO_OPTIONS = [
  { value: 'savings', label: 'Savings Goal' },
  { value: 'balance', label: 'Balance' },
  { value: 'investments', label: 'Investments' },
];

function fmtCurrency(value) {
  return `${Number(value || 0).toLocaleString()} MAD`;
}

function sum(list, key = 'amount') {
  return list.reduce((acc, item) => acc + Number(item[key] || 0), 0);
}

function monthKey(date) {
  return dayjs(date).format('YYYY-MM');
}

function mapRowsToData(rows) {
  const next = { ...defaultData };
  rows.forEach((row) => {
    const key = TYPE_TO_KEY[row.record_type];
    if (!key) return;
    next[key].push({
      ...row.payload,
      id: row.id,
    });
  });
  return next;
}

function mapRecordToRow(recordType, userId, record) {
  const { id, ...payload } = record;
  return {
    id,
    user_id: userId,
    record_type: recordType,
    payload,
  };
}

function sweepMarkerKey(userId) {
  return `${AUTO_SWEEP_PREFIX}-${userId}`;
}

function newId() {
  return crypto.randomUUID();
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState('dashboard');
  const [data, setData] = useState(defaultData);
  const [modal, setModal] = useState({ open: false, type: null, record: null });
  const [transferModal, setTransferModal] = useState({ open: false, from: 'balance', to: 'savings', savingsGoalId: null });
  const [autoSweepMonth, setAutoSweepMonth] = useState('');

  const user = session?.user ?? null;

  const loadData = useCallback(async (userId) => {
    if (!supabase || !userId) return;
    setDataLoading(true);
    const { data: rows, error: loadError } = await supabase
      .from('finance_records')
      .select('id,record_type,payload')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (loadError) {
      setError(loadError.message);
      setDataLoading(false);
      return;
    }

    setError('');
    setData(mapRowsToData(rows || []));
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data: authData }) => {
      if (!mounted) return;
      setSession(authData.session ?? null);
      setAuthLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setData(defaultData);
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    loadData(user.id);
  }, [user?.id, loadData]);

  useEffect(() => {
    if (!user?.id) {
      setAutoSweepMonth('');
      return;
    }
    setAutoSweepMonth(localStorage.getItem(sweepMarkerKey(user.id)) || '');
  }, [user?.id]);

  useEffect(() => {
    if (!supabase || !user?.id) return undefined;

    const channel = supabase
      .channel(`finance-records-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'finance_records',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadData(user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData, user?.id]);

  const saveRecord = useCallback(
    async (collectionKey, record) => {
      if (!supabase || !user?.id) return false;
      const recordType = KEY_TO_TYPE[collectionKey];
      const row = mapRecordToRow(recordType, user.id, record);
      const { error: upsertError } = await supabase
        .from('finance_records')
        .upsert(row, { onConflict: 'id' });

      if (upsertError) {
        setError(upsertError.message);
        return false;
      } else {
        setError('');
        return true;
      }
    },
    [user?.id]
  );

  const removeRecord = useCallback(
    async (collectionKey, id) => {
      if (!supabase || !user?.id) return;
      const { error: deleteError } = await supabase
        .from('finance_records')
        .delete()
        .eq('user_id', user.id)
        .eq('record_type', KEY_TO_TYPE[collectionKey])
        .eq('id', id);

      if (deleteError) {
        setError(deleteError.message);
      }
    },
    [user?.id]
  );

  const totals = useMemo(() => {
    const totalIncome = sum(data.incomes);
    const totalExpenses = sum(data.expenses);
    const totalInvestments = sum(data.investments);
    const totalSavings = sum(data.savingsGoals, 'currentAmount');
    return {
      totalIncome,
      totalExpenses,
      totalInvestments,
      totalSavings,
      totalBalance: totalIncome - totalExpenses - totalInvestments,
    };
  }, [data]);

  useEffect(() => {
    if (!user?.id || !data.savingsGoals.length) return;

    const today = dayjs();
    const month = today.format('YYYY-MM');
    if (today.date() < 25) return;
    if (autoSweepMonth === month) return;
    if (totals.totalBalance <= 0) return;

    let cancelled = false;

    const runAutoSweep = async () => {
      const firstGoal = data.savingsGoals[0];
      const saved = await saveRecord('savingsGoals', {
        ...firstGoal,
        currentAmount: Number(firstGoal.currentAmount || 0) + Number(totals.totalBalance),
      });
      if (!saved || cancelled) return;

      const marker = sweepMarkerKey(user.id);
      localStorage.setItem(marker, month);
      setAutoSweepMonth(month);
    };

    void runAutoSweep();
    return () => {
      cancelled = true;
    };
  }, [autoSweepMonth, data.savingsGoals, saveRecord, totals.totalBalance, user?.id]);

  const latestTransactions = useMemo(() => {
    const merged = [
      ...data.incomes.map((i) => ({ ...i, kind: 'Income' })),
      ...data.expenses.map((e) => ({ ...e, kind: 'Expense' })),
      ...data.investments.map((i) => ({ ...i, kind: 'Investment' })),
    ];
    return merged.sort((a, b) => dayjs(b.date).unix() - dayjs(a.date).unix()).slice(0, 8);
  }, [data]);

  const insights = useMemo(() => {
    const thisMonth = dayjs().format('YYYY-MM');
    const lastMonth = dayjs().subtract(1, 'month').format('YYYY-MM');

    const freelanceThis = sum(data.incomes.filter((i) => i.source === 'Freelance' && monthKey(i.date) === thisMonth));
    const freelanceLast = sum(data.incomes.filter((i) => i.source === 'Freelance' && monthKey(i.date) === lastMonth));
    const foodThis = sum(data.expenses.filter((e) => e.category === 'Food' && monthKey(e.date) === thisMonth));
    const foodLast = sum(data.expenses.filter((e) => e.category === 'Food' && monthKey(e.date) === lastMonth));
    const investedThis = sum(data.investments.filter((inv) => monthKey(inv.date) === thisMonth));

    const freelanceDelta = freelanceLast ? ((freelanceThis - freelanceLast) / freelanceLast) * 100 : 0;
    const foodDelta = foodLast ? ((foodThis - foodLast) / foodLast) * 100 : 0;

    return [
      `Freelance income ${freelanceDelta >= 0 ? 'increased' : 'decreased'} ${Math.abs(freelanceDelta).toFixed(1)}% this month.`,
      `You spent ${Math.abs(foodDelta).toFixed(1)}% ${foodDelta >= 0 ? 'more' : 'less'} on food compared to last month.`,
      `You invested ${investedThis.toLocaleString()} MAD into your business this month.`,
    ];
  }, [data]);

  const monthlySummary = useMemo(() => {
    const map = new Map();
    [...data.incomes, ...data.expenses, ...data.investments].forEach((tx) => {
      const month = monthKey(tx.date);
      if (!map.has(month)) map.set(month, { month, income: 0, expenses: 0, investments: 0 });
      const row = map.get(month);
      if ('source' in tx) row.income += Number(tx.amount);
      if ('category' in tx) row.expenses += Number(tx.amount);
      if ('businessName' in tx) row.investments += Number(tx.amount);
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [data]);

  const incomeBySource = incomeSources
    .map((source) => ({ type: source, value: sum(data.incomes.filter((i) => i.source === source)) }))
    .filter((x) => x.value > 0);
  const expenseByCategory = expenseCategories
    .map((category) => ({ type: category, value: sum(data.expenses.filter((e) => e.category === category)) }))
    .filter((x) => x.value > 0);

  if (!hasSupabaseEnv()) {
    return (
      <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
        <Alert
          type="warning"
          showIcon
          message="Supabase env vars are missing"
          description="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server."
        />
      </div>
    );
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!session) {
    return <AuthCard onError={setError} error={error} />;
  }

  const menuItems = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'savings', label: 'Savings Goals' },
    { key: 'income', label: 'Income' },
    { key: 'expenses', label: 'Expenses' },
    { key: 'investments', label: 'Investments' },
    { key: 'reports', label: 'Reports' },
    { key: 'settings', label: 'Settings' },
  ];

  const openModal = (type, record = null) => setModal({ open: true, type, record });
  const openTransferModal = (defaults = {}) => {
    setTransferModal({
      open: true,
      from: defaults.from || 'balance',
      to: defaults.to || 'savings',
      savingsGoalId: defaults.savingsGoalId || null,
    });
  };

  const runTransfer = useCallback(async (values) => {
    const amount = Number(values.amount || 0);
    if (amount <= 0) {
      setError('Transfer amount must be greater than 0.');
      return false;
    }

    const now = dayjs().format('YYYY-MM-DD');
    const sourceGoal = values.from === 'savings' ? data.savingsGoals.find((g) => g.id === values.savingsGoalId) : null;
    const targetGoal = values.to === 'savings' ? data.savingsGoals.find((g) => g.id === values.savingsGoalId) : null;

    if (values.from === 'balance' && totals.totalBalance < amount) {
      setError('Insufficient balance for this transfer.');
      return false;
    }
    if (values.from === 'savings') {
      if (!sourceGoal) {
        setError('Select a savings goal for the transfer.');
        return false;
      }
      if (Number(sourceGoal.currentAmount) < amount) {
        setError('Insufficient amount in the selected savings goal.');
        return false;
      }
    }
    if (values.to === 'savings' && !targetGoal) {
      setError('Select a savings goal to receive funds.');
      return false;
    }

    if (values.from === 'balance' && values.to === 'savings') {
      const okExpense = await saveRecord('expenses', {
        id: newId(),
        amount,
        category: 'Business expenses',
        date: now,
        paymentMethod: 'Internal',
        notes: `Transfer to savings: ${targetGoal.name}`,
      });
      if (!okExpense) return false;

      const okGoal = await saveRecord('savingsGoals', {
        ...targetGoal,
        currentAmount: Number(targetGoal.currentAmount) + amount,
      });
      return okGoal;
    }

    if (values.from === 'balance' && values.to === 'investments') {
      return saveRecord('investments', {
        id: newId(),
        amount,
        businessName: values.businessName || 'Internal Allocation',
        investmentType: values.investmentType || 'Operations',
        date: now,
        notes: 'Transfer from balance to investments',
      });
    }

    if (values.from === 'savings' && values.to === 'balance') {
      const okGoal = await saveRecord('savingsGoals', {
        ...sourceGoal,
        currentAmount: Number(sourceGoal.currentAmount) - amount,
      });
      if (!okGoal) return false;
      return saveRecord('incomes', {
        id: newId(),
        amount,
        source: 'Investment Returns',
        date: now,
        description: `Transfer from savings goal: ${sourceGoal.name}`,
        tag: 'Internal transfer',
      });
    }

    if (values.from === 'savings' && values.to === 'investments') {
      const okGoal = await saveRecord('savingsGoals', {
        ...sourceGoal,
        currentAmount: Number(sourceGoal.currentAmount) - amount,
      });
      if (!okGoal) return false;
      return saveRecord('investments', {
        id: newId(),
        amount,
        businessName: values.businessName || 'Internal Allocation',
        investmentType: values.investmentType || 'Operations',
        date: now,
        notes: `Transfer from savings goal: ${sourceGoal.name}`,
      });
    }

    setError('This transfer direction is not supported.');
    return false;
  }, [data.savingsGoals, saveRecord, totals.totalBalance]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0" theme="light">
        <div className="brand">MoneyFlow Pro</div>
        <Menu selectedKeys={[current]} mode="inline" items={menuItems} onClick={(e) => setCurrent(e.key)} />
      </Sider>
      <Layout>
        <Header className="header" style={{ justifyContent: 'space-between' }}>
          <Title level={4} style={{ margin: 0 }}>Personal Finance Management</Title>
          <Space>
            <Text type="secondary">{user.email}</Text>
            <Button onClick={() => supabase.auth.signOut()}>Sign out</Button>
          </Space>
        </Header>
        <Content className="content">
          {error ? <Alert type="error" showIcon style={{ marginBottom: 16 }} message={error} /> : null}
          {dataLoading ? <Spin style={{ marginBottom: 16 }} /> : null}

          {current === 'dashboard' && (
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Card>
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <Text strong>Quick Actions</Text>
                  <Text type="secondary">Start with key entries first: income, expense, investment, then savings.</Text>
                  <Space wrap>
                    <Button type="primary" onClick={() => openModal('income')}>+ Add Income</Button>
                    <Button danger onClick={() => openModal('expenses')}>+ Add Expense</Button>
                    <Button style={{ background: '#7c3aed', color: '#fff' }} onClick={() => openModal('investments')}>+ Add Investment</Button>
                    <Button style={{ background: '#0ea5e9', color: '#fff' }} onClick={() => openModal('savings')}>+ Add Savings Goal</Button>
                    <Button onClick={() => openTransferModal({ from: 'balance', to: 'savings' })}>Transfer Funds</Button>
                  </Space>
                </Space>
              </Card>

              <Card title="Savings Goals Progress">
                <Space direction="vertical" style={{ width: '100%' }}>
                  {data.savingsGoals.length === 0 ? <Text type="secondary">No savings goals yet. Add your first goal from the Savings Goals tab.</Text> : null}
                  {data.savingsGoals.map((goal) => {
                    const pct = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
                    return (
                      <div key={goal.id}>
                        <Text strong>{goal.name}</Text>
                        <Progress percent={Number(pct.toFixed(1))} />
                        <Text type="secondary">{fmtCurrency(goal.currentAmount)} / {fmtCurrency(goal.targetAmount)} · deadline {goal.deadline}</Text>
                      </div>
                    );
                  })}
                  {autoSweepMonth === dayjs().format('YYYY-MM') ? (
                    <Alert
                      type="success"
                      showIcon
                      message={`After day 25, remaining balance was auto-moved to savings for ${autoSweepMonth}.`}
                    />
                  ) : null}
                </Space>
              </Card>

              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={8} xl={4}>
                  <Card hoverable onClick={() => openTransferModal({ from: 'balance', to: 'savings' })}>
                    <Statistic title="Total Balance (click to transfer)" value={totals.totalBalance} suffix="MAD" valueStyle={{ color: '#111827' }} />
                  </Card>
                </Col>
                {[
                  ['Total Income', totals.totalIncome, '#16a34a'],
                  ['Total Expenses', totals.totalExpenses, '#dc2626'],
                  ['Total Investments', totals.totalInvestments, '#7c3aed'],
                  ['Total Savings', totals.totalSavings, '#2563eb'],
                ].map(([title, value, color]) => (
                  <Col xs={24} sm={12} lg={8} xl={4} key={title}>
                    <Card><Statistic title={title} value={value} suffix="MAD" valueStyle={{ color }} /></Card>
                  </Col>
                ))}
              </Row>

              <Row gutter={[16, 16]}>
                <Col xs={24}>
                  <Card title="Latest Transactions"><Table rowKey="id" dataSource={latestTransactions} columns={transactionColumns} pagination={false} /></Card>
                </Col>
                <Col xs={24} lg={12}><Card title="Income by Source">{incomeBySource.length ? <Pie data={incomeBySource} angleField="value" colorField="type" label={{ text: 'value' }} /> : <Text>No income yet.</Text>}</Card></Col>
                <Col xs={24} lg={12}><Card title="Expenses by Category">{expenseByCategory.length ? <Pie data={expenseByCategory} angleField="value" colorField="type" label={{ text: 'value' }} /> : <Text>No expenses yet.</Text>}</Card></Col>
                <Col xs={24} lg={12}><Card title="Monthly Cash Flow"><Line data={monthlySummary.flatMap((m) => ([{ month: m.month, type: 'Income', value: m.income }, { month: m.month, type: 'Expenses', value: m.expenses }, { month: m.month, type: 'Investments', value: m.investments }]))} xField="month" yField="value" colorField="type" /></Card></Col>
                <Col xs={24} lg={12}><Card title="Income vs Expenses"><Column data={monthlySummary.flatMap((m) => ([{ month: m.month, type: 'Income', value: m.income }, { month: m.month, type: 'Expenses', value: m.expenses }]))} xField="month" yField="value" colorField="type" group /></Card></Col>
              </Row>

              <Card title="Financial Insights">
                <Space direction="vertical" style={{ width: '100%' }}>
                  {insights.map((line) => <Alert type="info" showIcon message={line} key={line} />)}
                </Space>
              </Card>
            </Space>
          )}

          {['income', 'expenses', 'investments', 'savings'].includes(current) && (
            <ModuleTable
              current={current}
              data={data}
              onOpen={openModal}
              onDelete={removeRecord}
              onAddFunds={async (goalId, amount) => {
                const goal = data.savingsGoals.find((item) => item.id === goalId);
                if (!goal) return;
                await saveRecord('savingsGoals', {
                  ...goal,
                  currentAmount: Number(goal.currentAmount) + Number(amount),
                });
              }}
              onTransferFromSavings={(goalId) => openTransferModal({ from: 'savings', to: 'balance', savingsGoalId: goalId })}
            />
          )}

          {current === 'reports' && (
            <Reports
              data={data}
              monthlySummary={monthlySummary}
              incomeBySource={incomeBySource}
              expenseByCategory={expenseByCategory}
              totals={totals}
            />
          )}

          {current === 'settings' && (
            <Card title="Settings">
              <Space direction="vertical">
                <Text>Supabase realtime sync is enabled for your account.</Text>
                <Text type="secondary">Project URL: {import.meta.env.VITE_SUPABASE_URL}</Text>
              </Space>
            </Card>
          )}
        </Content>
      </Layout>

      <RecordModal
        modal={modal}
        onCancel={() => setModal({ open: false, type: null, record: null })}
        onSubmit={async (type, values) => {
          const key = TYPE_TO_KEY[type];
          const normalized = {
            ...values,
            date: values.date ? dayjs(values.date).format('YYYY-MM-DD') : undefined,
            deadline: values.deadline ? dayjs(values.deadline).format('YYYY-MM-DD') : undefined,
            id: modal.record?.id || crypto.randomUUID(),
          };
          await saveRecord(key, normalized);
          setModal({ open: false, type: null, record: null });
        }}
      />

      <TransferModal
        open={transferModal.open}
        onCancel={() => setTransferModal((prev) => ({ ...prev, open: false }))}
        defaults={transferModal}
        totals={totals}
        savingsGoals={data.savingsGoals}
        onSubmit={async (values) => {
          const ok = await runTransfer(values);
          if (ok) {
            setTransferModal((prev) => ({ ...prev, open: false }));
          }
        }}
      />
    </Layout>
  );
}

const transactionColumns = [
  {
    title: 'Type',
    dataIndex: 'kind',
    key: 'kind',
    render: (value) => <Tag color={TRANSACTION_TAG_COLORS[value] || 'default'}>{value}</Tag>,
  },
  { title: 'Amount', dataIndex: 'amount', key: 'amount', render: fmtCurrency },
  { title: 'Date', dataIndex: 'date', key: 'date' },
  {
    title: 'Details',
    key: 'details',
    render: (_, record) => record.source || record.category || record.businessName,
  },
];

function ModuleTable({ current, data, onOpen, onDelete, onAddFunds, onTransferFromSavings }) {
  const config = {
    income: { key: 'incomes', title: 'Income Sources', color: 'green' },
    expenses: { key: 'expenses', title: 'Expenses', color: 'red' },
    investments: { key: 'investments', title: 'Business Investments', color: 'purple' },
    savings: { key: 'savingsGoals', title: 'Savings Goals', color: 'blue' },
  }[current];

  const [filter, setFilter] = useState();
  const rows = data[config.key].filter((r) => {
    if (!filter) return true;
    if (current === 'income') return r.source === filter;
    if (current === 'expenses') return r.category === filter;
    return true;
  });

  const columnsMap = {
    income: [
      { title: 'Amount', dataIndex: 'amount', render: fmtCurrency },
      { title: 'Source', dataIndex: 'source' },
      { title: 'Date', dataIndex: 'date' },
      { title: 'Description', dataIndex: 'description' },
      { title: 'Tag', dataIndex: 'tag' },
    ],
    expenses: [
      { title: 'Amount', dataIndex: 'amount', render: fmtCurrency },
      { title: 'Category', dataIndex: 'category' },
      { title: 'Date', dataIndex: 'date' },
      { title: 'Payment Method', dataIndex: 'paymentMethod' },
      { title: 'Notes', dataIndex: 'notes' },
    ],
    investments: [
      { title: 'Amount', dataIndex: 'amount', render: fmtCurrency },
      { title: 'Business', dataIndex: 'businessName' },
      { title: 'Type', dataIndex: 'investmentType' },
      { title: 'Date', dataIndex: 'date' },
      { title: 'Description', dataIndex: 'notes' },
    ],
    savings: [
      { title: 'Goal', dataIndex: 'name' },
      { title: 'Target', dataIndex: 'targetAmount', render: fmtCurrency },
      { title: 'Current', dataIndex: 'currentAmount', render: fmtCurrency },
      { title: 'Deadline', dataIndex: 'deadline' },
      { title: 'Progress', render: (_, r) => <Progress percent={Number(((r.currentAmount / r.targetAmount) * 100).toFixed(1))} /> },
    ],
  };

  const columns = [
    ...columnsMap[current],
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => onOpen(current, record)}>Edit</Button>
          {current === 'savings' ? (
            <>
              <Button size="small" type="primary" onClick={() => onAddFunds(record.id, 100)}>+100 MAD</Button>
              <Button size="small" onClick={() => onTransferFromSavings(record.id)}>Transfer</Button>
            </>
          ) : null}
          <Button danger size="small" onClick={() => onDelete(config.key, record.id)}>Delete</Button>
        </Space>
      ),
    },
  ];

  return (
    <Card title={<Text style={{ color: config.color }}>{config.title}</Text>} extra={<Button type="primary" onClick={() => onOpen(current)}>Add</Button>}>
      {current === 'income' && <Select allowClear placeholder="Filter by source" style={{ width: 220, marginBottom: 12 }} options={incomeSources.map((source) => ({ value: source }))} onChange={setFilter} />}
      {current === 'expenses' && <Select allowClear placeholder="Filter by category" style={{ width: 220, marginBottom: 12 }} options={expenseCategories.map((category) => ({ value: category }))} onChange={setFilter} />}
      <Table rowKey="id" dataSource={rows} columns={columns} />
    </Card>
  );
}

function Reports({ data, monthlySummary, incomeBySource, expenseByCategory, totals }) {
  const [filters, setFilters] = useState({ month: null, year: null, source: null, category: null });
  const [comparison, setComparison] = useState({ dimension: 'month', metric: 'income', left: null, right: null });
  const [simulation, setSimulation] = useState({
    months: 12,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    monthlyInvestments: 0,
    monthlySavingsMove: 0,
  });

  useEffect(() => {
    if (!monthlySummary.length) return;
    const avg = monthlySummary.reduce(
      (acc, month) => ({
        income: acc.income + month.income,
        expenses: acc.expenses + month.expenses,
        investments: acc.investments + month.investments,
      }),
      { income: 0, expenses: 0, investments: 0 }
    );
    setSimulation((prev) => ({
      ...prev,
      monthlyIncome: prev.monthlyIncome || Number((avg.income / monthlySummary.length).toFixed(2)),
      monthlyExpenses: prev.monthlyExpenses || Number((avg.expenses / monthlySummary.length).toFixed(2)),
      monthlyInvestments: prev.monthlyInvestments || Number((avg.investments / monthlySummary.length).toFixed(2)),
    }));
  }, [monthlySummary]);

  const filtered = useMemo(() => {
    const testDate = (date) => {
      if (filters.month && dayjs(date).month() !== Number(filters.month)) return false;
      if (filters.year && dayjs(date).year() !== Number(filters.year)) return false;
      return true;
    };
    return {
      incomes: data.incomes.filter((item) => testDate(item.date) && (!filters.source || item.source === filters.source)),
      expenses: data.expenses.filter((item) => testDate(item.date) && (!filters.category || item.category === filters.category)),
      investments: data.investments.filter((item) => testDate(item.date)),
    };
  }, [data, filters]);

  const monthOptions = monthlySummary.map((row) => ({ value: row.month, label: row.month }));
  const investmentTypeOptions = Array.from(new Set(data.investments.map((inv) => inv.investmentType).filter(Boolean))).map((type) => ({ value: type, label: type }));

  const comparisonResult = useMemo(() => {
    const rowByMonth = Object.fromEntries(monthlySummary.map((row) => [row.month, row]));
    const toNumber = (value) => Number(value || 0);
    let leftValue = 0;
    let rightValue = 0;

    if (comparison.dimension === 'month') {
      const leftRow = rowByMonth[comparison.left] || {};
      const rightRow = rowByMonth[comparison.right] || {};
      leftValue = toNumber(leftRow[comparison.metric]);
      rightValue = toNumber(rightRow[comparison.metric]);
    }
    if (comparison.dimension === 'incomeSource') {
      leftValue = sum(data.incomes.filter((item) => item.source === comparison.left));
      rightValue = sum(data.incomes.filter((item) => item.source === comparison.right));
    }
    if (comparison.dimension === 'expenseCategory') {
      leftValue = sum(data.expenses.filter((item) => item.category === comparison.left));
      rightValue = sum(data.expenses.filter((item) => item.category === comparison.right));
    }
    if (comparison.dimension === 'investmentType') {
      leftValue = sum(data.investments.filter((item) => item.investmentType === comparison.left));
      rightValue = sum(data.investments.filter((item) => item.investmentType === comparison.right));
    }

    const delta = leftValue - rightValue;
    const deltaPct = rightValue ? (delta / rightValue) * 100 : 0;
    return {
      leftValue,
      rightValue,
      delta,
      deltaPct,
      chartData: [
        { label: comparison.left || 'Left', value: leftValue },
        { label: comparison.right || 'Right', value: rightValue },
      ],
    };
  }, [comparison, data.expenses, data.incomes, data.investments, monthlySummary]);

  const simulationResult = useMemo(() => {
    const months = Number(simulation.months || 0);
    let balance = Number(totals.totalBalance || 0);
    let savings = Number(totals.totalSavings || 0);
    const rows = [];

    for (let i = 1; i <= months; i += 1) {
      balance += Number(simulation.monthlyIncome || 0) - Number(simulation.monthlyExpenses || 0) - Number(simulation.monthlyInvestments || 0) - Number(simulation.monthlySavingsMove || 0);
      savings += Number(simulation.monthlySavingsMove || 0);
      rows.push({
        month: dayjs().add(i, 'month').format('YYYY-MM'),
        balance,
        savings,
      });
    }

    return {
      endingBalance: balance,
      endingSavings: savings,
      rows,
    };
  }, [simulation, totals.totalBalance, totals.totalSavings]);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card title="Compare Months / Categories / Types">
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            style={{ width: 220 }}
            value={comparison.dimension}
            onChange={(dimension) => setComparison({ dimension, metric: 'income', left: null, right: null })}
            options={[
              { value: 'month', label: 'Month vs Month' },
              { value: 'incomeSource', label: 'Income Source vs Source' },
              { value: 'expenseCategory', label: 'Expense Category vs Category' },
              { value: 'investmentType', label: 'Investment Type vs Type' },
            ]}
          />
          {comparison.dimension === 'month' ? (
            <Select
              style={{ width: 180 }}
              value={comparison.metric}
              onChange={(metric) => setComparison((prev) => ({ ...prev, metric }))}
              options={[
                { value: 'income', label: 'Income' },
                { value: 'expenses', label: 'Expenses' },
                { value: 'investments', label: 'Investments' },
              ]}
            />
          ) : null}
          <Select
            style={{ width: 180 }}
            placeholder="Left"
            value={comparison.left}
            onChange={(left) => setComparison((prev) => ({ ...prev, left }))}
            options={
              comparison.dimension === 'month'
                ? monthOptions
                : comparison.dimension === 'incomeSource'
                  ? incomeSources.map((source) => ({ value: source, label: source }))
                  : comparison.dimension === 'expenseCategory'
                    ? expenseCategories.map((category) => ({ value: category, label: category }))
                    : investmentTypeOptions
            }
          />
          <Select
            style={{ width: 180 }}
            placeholder="Right"
            value={comparison.right}
            onChange={(right) => setComparison((prev) => ({ ...prev, right }))}
            options={
              comparison.dimension === 'month'
                ? monthOptions
                : comparison.dimension === 'incomeSource'
                  ? incomeSources.map((source) => ({ value: source, label: source }))
                  : comparison.dimension === 'expenseCategory'
                    ? expenseCategories.map((category) => ({ value: category, label: category }))
                    : investmentTypeOptions
            }
          />
        </Space>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}><Card><Statistic title={comparison.left || 'Left'} value={comparisonResult.leftValue} suffix="MAD" /></Card></Col>
          <Col xs={24} md={8}><Card><Statistic title={comparison.right || 'Right'} value={comparisonResult.rightValue} suffix="MAD" /></Card></Col>
          <Col xs={24} md={8}><Card><Statistic title="Difference" value={comparisonResult.delta} suffix="MAD" /></Card></Col>
          <Col xs={24}><Text type="secondary">Delta: {comparisonResult.deltaPct.toFixed(1)}%</Text></Col>
          <Col xs={24}>
            <Column data={comparisonResult.chartData} xField="label" yField="value" />
          </Col>
        </Row>
      </Card>

      <Card title="12-Month Simulation">
        <Space wrap style={{ marginBottom: 16 }}>
          <InputNumber min={1} max={36} addonBefore="Months" value={simulation.months} onChange={(months) => setSimulation((prev) => ({ ...prev, months: Number(months || 1) }))} />
          <InputNumber addonBefore="Income / month" value={simulation.monthlyIncome} onChange={(monthlyIncome) => setSimulation((prev) => ({ ...prev, monthlyIncome: Number(monthlyIncome || 0) }))} />
          <InputNumber addonBefore="Expenses / month" value={simulation.monthlyExpenses} onChange={(monthlyExpenses) => setSimulation((prev) => ({ ...prev, monthlyExpenses: Number(monthlyExpenses || 0) }))} />
          <InputNumber addonBefore="Investments / month" value={simulation.monthlyInvestments} onChange={(monthlyInvestments) => setSimulation((prev) => ({ ...prev, monthlyInvestments: Number(monthlyInvestments || 0) }))} />
          <InputNumber addonBefore="Move to savings / month" value={simulation.monthlySavingsMove} onChange={(monthlySavingsMove) => setSimulation((prev) => ({ ...prev, monthlySavingsMove: Number(monthlySavingsMove || 0) }))} />
        </Space>
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} md={12}><Card><Statistic title="Projected Ending Balance" value={simulationResult.endingBalance} suffix="MAD" /></Card></Col>
          <Col xs={24} md={12}><Card><Statistic title="Projected Ending Savings" value={simulationResult.endingSavings} suffix="MAD" /></Card></Col>
        </Row>
        <Line
          data={simulationResult.rows.flatMap((row) => ([
            { month: row.month, metric: 'Balance', value: row.balance },
            { month: row.month, metric: 'Savings', value: row.savings },
          ]))}
          xField="month"
          yField="value"
          colorField="metric"
        />
      </Card>

      <Card title="Reports & Analytics">
        <Space wrap style={{ marginBottom: 16 }}>
          <Select allowClear placeholder="Month" style={{ width: 120 }} onChange={(month) => setFilters((f) => ({ ...f, month }))} options={Array.from({ length: 12 }, (_, i) => ({ label: i + 1, value: i }))} />
          <Select allowClear placeholder="Year" style={{ width: 120 }} onChange={(year) => setFilters((f) => ({ ...f, year }))} options={Array.from(new Set([...data.incomes, ...data.expenses, ...data.investments].map((tx) => dayjs(tx.date).year()))).sort().map((y) => ({ value: y }))} />
          <Select allowClear placeholder="Source" style={{ width: 200 }} onChange={(source) => setFilters((f) => ({ ...f, source }))} options={incomeSources.map((source) => ({ value: source }))} />
          <Select allowClear placeholder="Category" style={{ width: 220 }} onChange={(category) => setFilters((f) => ({ ...f, category }))} options={expenseCategories.map((category) => ({ value: category }))} />
        </Space>

        <Tabs items={[
          { key: 'monthly', label: 'Monthly Summary', children: <Line data={monthlySummary.flatMap((m) => ([{ month: m.month, type: 'Income', value: m.income }, { month: m.month, type: 'Expenses', value: m.expenses }, { month: m.month, type: 'Investments', value: m.investments }]))} xField="month" yField="value" colorField="type" /> },
          { key: 'income', label: 'Income per Source', children: <Pie data={incomeBySource} angleField="value" colorField="type" label={{ text: 'value' }} /> },
          { key: 'expense', label: 'Expense per Category', children: <Pie data={expenseByCategory} angleField="value" colorField="type" label={{ text: 'value' }} /> },
          { key: 'investment', label: 'Investment Growth', children: <Column data={filtered.investments.map((inv) => ({ date: inv.date, value: inv.amount }))} xField="date" yField="value" /> },
          { key: 'savings', label: 'Savings Progress', children: <Column data={data.savingsGoals.map((goal) => ({ goal: goal.name, value: (goal.currentAmount / goal.targetAmount) * 100 }))} xField="goal" yField="value" /> },
        ]} />
      </Card>
    </Space>
  );
}

function RecordModal({ modal, onCancel, onSubmit }) {
  const [form] = Form.useForm();
  const { type, record, open } = modal;

  const fieldsByType = {
    income: (
      <>
        <Form.Item name="amount" label="Amount" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="source" label="Source" rules={[{ required: true }]}><Select options={incomeSources.map((v) => ({ value: v }))} /></Form.Item>
        <Form.Item name="date" label="Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="description" label="Description"><Input /></Form.Item>
        <Form.Item name="tag" label="Tag"><Input /></Form.Item>
      </>
    ),
    expenses: (
      <>
        <Form.Item name="amount" label="Amount" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="category" label="Category" rules={[{ required: true }]}><Select options={expenseCategories.map((v) => ({ value: v }))} /></Form.Item>
        <Form.Item name="date" label="Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="paymentMethod" label="Payment Method"><Input /></Form.Item>
        <Form.Item name="notes" label="Notes"><Input /></Form.Item>
      </>
    ),
    investments: (
      <>
        <Form.Item name="amount" label="Amount" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="businessName" label="Business name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="investmentType" label="Type of investment" rules={[{ required: true }]}><Select options={investmentTypes.map((v) => ({ value: v }))} /></Form.Item>
        <Form.Item name="date" label="Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="notes" label="Description"><Input /></Form.Item>
      </>
    ),
    savings: (
      <>
        <Form.Item name="name" label="Goal name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="targetAmount" label="Target amount" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="currentAmount" label="Current saved" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="deadline" label="Deadline" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
      </>
    ),
  };

  return (
    <Modal
      open={open}
      title={`${record ? 'Edit' : 'Add'} ${type || ''}`}
      onCancel={onCancel}
      onOk={() => {
        form.validateFields().then((values) => onSubmit(type, values));
      }}
      afterOpenChange={(isOpen) => {
        if (isOpen) {
          const next = { ...record };
          if (next?.date) next.date = dayjs(next.date);
          if (next?.deadline) next.deadline = dayjs(next.deadline);
          form.setFieldsValue(next);
        } else {
          form.resetFields();
        }
      }}
    >
      <Form form={form} layout="vertical">{type ? fieldsByType[type] : null}</Form>
    </Modal>
  );
}

function TransferModal({ open, onCancel, defaults, totals, savingsGoals, onSubmit }) {
  const [form] = Form.useForm();
  const from = Form.useWatch('from', form);
  const to = Form.useWatch('to', form);

  const savingsGoalOptions = savingsGoals.map((goal) => ({
    value: goal.id,
    label: `${goal.name} (${fmtCurrency(goal.currentAmount)})`,
  }));

  return (
    <Modal
      open={open}
      title="Transfer Funds"
      onCancel={onCancel}
      onOk={() => {
        form.validateFields().then((values) => {
          if (values.from === values.to) return;
          onSubmit(values);
        });
      }}
      afterOpenChange={(isOpen) => {
        if (!isOpen) {
          form.resetFields();
          return;
        }
        form.setFieldsValue({
          from: defaults.from || 'balance',
          to: defaults.to || 'savings',
          savingsGoalId: defaults.savingsGoalId || undefined,
          amount: undefined,
          businessName: 'Internal Allocation',
          investmentType: 'Operations',
        });
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Alert
          type="info"
          showIcon
          message={from === 'balance'
            ? `Available balance: ${fmtCurrency(totals.totalBalance)}`
            : 'Choose a savings goal as source to validate available funds.'}
        />
        <Form form={form} layout="vertical">
          <Form.Item name="from" label="From" rules={[{ required: true }]}>
            <Select options={TRANSFER_FROM_OPTIONS} />
          </Form.Item>
          <Form.Item name="to" label="To" rules={[{ required: true }]}>
            <Select options={TRANSFER_TO_OPTIONS.filter((item) => item.value !== from)} />
          </Form.Item>
          {(from === 'savings' || to === 'savings') ? (
            <Form.Item name="savingsGoalId" label="Savings Goal" rules={[{ required: true }]}>
              <Select options={savingsGoalOptions} />
            </Form.Item>
          ) : null}
          <Form.Item name="amount" label="Amount (MAD)" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          {to === 'investments' ? (
            <>
              <Form.Item name="businessName" label="Business Name">
                <Input />
              </Form.Item>
              <Form.Item name="investmentType" label="Investment Type">
                <Select options={investmentTypes.map((type) => ({ value: type, label: type }))} />
              </Form.Item>
            </>
          ) : null}
        </Form>
      </Space>
    </Modal>
  );
}

function AuthCard({ onError, error }) {
  const [form] = Form.useForm();
  const [mode, setMode] = useState('signin');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const values = await form.validateFields();
    setLoading(true);
    onError('');

    const action = mode === 'signin'
      ? supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        })
      : supabase.auth.signUp({
          email: values.email,
          password: values.password,
        });

    const { error: authError } = await action;

    if (authError) {
      onError(authError.message);
    } else if (mode === 'signup') {
      onError('Account created. If email confirmation is enabled, verify your inbox before signing in.');
      setMode('signin');
    }

    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Card title="MoneyFlow Pro" style={{ width: '100%', maxWidth: 420 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Text type="secondary">Realtime multi-user workspace via Supabase.</Text>
          {error ? <Alert type={error.startsWith('Account created') ? 'success' : 'error'} showIcon message={error} /> : null}
          <Form form={form} layout="vertical">
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="password" label="Password" rules={[{ required: true, min: 6 }]}>
              <Input.Password />
            </Form.Item>
          </Form>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              {mode === 'signin' ? 'Need an account?' : 'Have an account?'}
            </Button>
            <Button type="primary" loading={loading} onClick={submit}>
              {mode === 'signin' ? 'Sign in' : 'Sign up'}
            </Button>
          </Space>
        </Space>
      </Card>
    </div>
  );
}
