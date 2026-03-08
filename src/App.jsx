import { useMemo, useState } from 'react';
import {
  Layout,
  Menu,
  Typography,
  Card,
  Row,
  Col,
  Table,
  Tag,
  Progress,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Select,
  Space,
  Statistic,
  Tabs,
  Alert,
} from 'antd';
import { Pie, Line, Column } from '@ant-design/charts';
import dayjs from 'dayjs';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;
const STORAGE_KEY = 'moneyflow-pro-data-v1';

const incomeSources = ['Job', 'Freelance', 'Offline Business', 'Investment Returns'];
const expenseCategories = ['Food', 'Transport', 'Rent', 'Bills', 'Entertainment', 'Shopping', 'Health', 'Business expenses'];
const investmentTypes = ['Stock / Inventory', 'Marketing', 'Equipment', 'Operations', 'Expansion'];

const defaultData = {
  incomes: [],
  expenses: [],
  investments: [],
  savingsGoals: [
    {
      id: crypto.randomUUID(),
      name: 'Emergency fund',
      targetAmount: 3000,
      currentAmount: 900,
      deadline: dayjs().add(7, 'month').format('YYYY-MM-DD'),
    },
  ],
};

function parseData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultData;
  try {
    return JSON.parse(raw);
  } catch {
    return defaultData;
  }
}

function fmtCurrency(value) {
  return `${Number(value || 0).toLocaleString()} MAD`;
}

function sum(list, key = 'amount') {
  return list.reduce((acc, item) => acc + Number(item[key] || 0), 0);
}

function monthKey(date) {
  return dayjs(date).format('YYYY-MM');
}

export default function App() {
  const [current, setCurrent] = useState('dashboard');
  const [data, setData] = useState(parseData);
  const [modal, setModal] = useState({ open: false, type: null, record: null });

  const save = (next) => {
    setData(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

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

  const menuItems = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'income', label: 'Income' },
    { key: 'expenses', label: 'Expenses' },
    { key: 'investments', label: 'Investments' },
    { key: 'savings', label: 'Savings Goals' },
    { key: 'reports', label: 'Reports' },
    { key: 'settings', label: 'Settings' },
  ];

  const openModal = (type, record = null) => setModal({ open: true, type, record });

  const removeRecord = (type, id) => {
    save({ ...data, [type]: data[type].filter((item) => item.id !== id) });
  };

  const transactionColumns = [
    { title: 'Type', dataIndex: 'kind', key: 'kind', render: (value) => <Tag>{value}</Tag> },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: fmtCurrency },
    { title: 'Date', dataIndex: 'date', key: 'date' },
    {
      title: 'Details',
      key: 'details',
      render: (_, record) => record.source || record.category || record.businessName,
    },
  ];

  const incomeBySource = incomeSources.map((source) => ({ type: source, value: sum(data.incomes.filter((i) => i.source === source)) })).filter((x) => x.value > 0);
  const expenseByCategory = expenseCategories.map((category) => ({ type: category, value: sum(data.expenses.filter((e) => e.category === category)) })).filter((x) => x.value > 0);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0" theme="light">
        <div className="brand">MoneyFlow Pro</div>
        <Menu selectedKeys={[current]} mode="inline" items={menuItems} onClick={(e) => setCurrent(e.key)} />
      </Sider>
      <Layout>
        <Header className="header"><Title level={4} style={{ margin: 0 }}>Personal Finance Management</Title></Header>
        <Content className="content">
          {current === 'dashboard' && (
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Row gutter={[16, 16]}>
                {[
                  ['Total Balance', totals.totalBalance, '#111827'],
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
                <Col xs={24} lg={12}><Card title="Income by Source">{incomeBySource.length ? <Pie data={incomeBySource} angleField="value" colorField="type" label={{ text: 'value' }} /> : <Text>No income yet.</Text>}</Card></Col>
                <Col xs={24} lg={12}><Card title="Expenses by Category">{expenseByCategory.length ? <Pie data={expenseByCategory} angleField="value" colorField="type" label={{ text: 'value' }} /> : <Text>No expenses yet.</Text>}</Card></Col>
                <Col xs={24} lg={12}><Card title="Monthly Cash Flow"><Line data={monthlySummary.flatMap((m) => ([{ month: m.month, type: 'Income', value: m.income }, { month: m.month, type: 'Expenses', value: m.expenses }, { month: m.month, type: 'Investments', value: m.investments }]))} xField="month" yField="value" colorField="type" /></Card></Col>
                <Col xs={24} lg={12}><Card title="Income vs Expenses"><Column data={monthlySummary.flatMap((m) => ([{ month: m.month, type: 'Income', value: m.income }, { month: m.month, type: 'Expenses', value: m.expenses }]))} xField="month" yField="value" colorField="type" group /></Card></Col>
              </Row>

              <Row gutter={[16, 16]}>
                <Col xs={24} lg={14}><Card title="Latest Transactions"><Table rowKey="id" dataSource={latestTransactions} columns={transactionColumns} pagination={false} /></Card></Col>
                <Col xs={24} lg={10}>
                  <Card title="Savings Goals Progress">
                    <Space direction="vertical" style={{ width: '100%' }}>
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
                    </Space>
                  </Card>
                </Col>
              </Row>

              <Card title="Financial Insights">
                <Space direction="vertical" style={{ width: '100%' }}>
                  {insights.map((line) => <Alert type="info" showIcon message={line} key={line} />)}
                </Space>
              </Card>
            </Space>
          )}

          {['income', 'expenses', 'investments', 'savings'].includes(current) && (
            <ModuleTable current={current} data={data} onOpen={openModal} onDelete={removeRecord} onAddFunds={(goalId, amount) => {
              const next = {
                ...data,
                savingsGoals: data.savingsGoals.map((goal) => goal.id === goalId ? { ...goal, currentAmount: Number(goal.currentAmount) + Number(amount) } : goal),
              };
              save(next);
            }} />
          )}

          {current === 'reports' && (
            <Reports data={data} monthlySummary={monthlySummary} incomeBySource={incomeBySource} expenseByCategory={expenseByCategory} />
          )}

          {current === 'settings' && (
            <Card title="Settings"><Text>Data is stored in browser localStorage. Clear browser storage to reset.</Text></Card>
          )}
        </Content>
      </Layout>

      <RecordModal
        modal={modal}
        onCancel={() => setModal({ open: false, type: null, record: null })}
        onSubmit={(type, values) => {
          const keyMap = { income: 'incomes', expenses: 'expenses', investments: 'investments', savings: 'savingsGoals' };
          const key = keyMap[type];
          const normalized = { ...values, date: values.date ? dayjs(values.date).format('YYYY-MM-DD') : undefined, deadline: values.deadline ? dayjs(values.deadline).format('YYYY-MM-DD') : undefined, id: modal.record?.id || crypto.randomUUID() };
          const next = {
            ...data,
            [key]: modal.record ? data[key].map((item) => (item.id === modal.record.id ? normalized : item)) : [...data[key], normalized],
          };
          save(next);
          setModal({ open: false, type: null, record: null });
        }}
      />
    </Layout>
  );
}

function ModuleTable({ current, data, onOpen, onDelete, onAddFunds }) {
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
            <Button size="small" type="primary" onClick={() => onAddFunds(record.id, 100)}>+100 MAD</Button>
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

function Reports({ data, monthlySummary, incomeBySource, expenseByCategory }) {
  const [filters, setFilters] = useState({ month: null, year: null, source: null, category: null });

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

  return (
    <Card title="Reports & Analytics">
      <Space wrap style={{ marginBottom: 16 }}>
        <Select allowClear placeholder="Month" style={{ width: 120 }} onChange={(month) => setFilters((f) => ({ ...f, month }))} options={Array.from({ length: 12 }, (_, i) => ({ label: i + 1, value: i }))} />
        <Select allowClear placeholder="Year" style={{ width: 120 }} onChange={(year) => setFilters((f) => ({ ...f, year }))} options={[2024, 2025, 2026].map((y) => ({ value: y }))} />
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
