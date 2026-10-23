import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ConfigProvider, App as AntdApp, Button, Dropdown } from 'antd';
import { ExportOutlined, ImportOutlined, DeleteOutlined, GithubOutlined, MoreOutlined, CalculatorOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import { calculate } from './utils/calculate';
import { today } from './utils/date';
import { baselineLpr } from './utils/lprSync';
import { useLprAutoUpdate } from './hooks/useLprAutoUpdate';
import Settings from './components/Settings';
import EntryList from './components/EntryList';
import ResultTable from './components/ResultTable';
import SummaryBar from './components/SummaryBar';
import './App.css';

const STORAGE_KEY = 'lpr-calc-state';
const GITHUB_URL = 'https://github.com/7revor/lpr-tools';
const emptyLoan = () => ({ date: today(), amount: 0, note: '' });
const emptyRepay = () => ({ date: today(), amount: 0, note: '', mode: '先息后本' });

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('读取暂存数据失败，将使用默认值', err);
    return null;
  }
}

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    // 隐私模式或存储已满时写入会失败，不影响计算，仅记录
    console.warn('暂存数据失败', err);
  }
}

function LprCalc() {
  const { message, modal } = AntdApp.useApp();

  const showToast = useCallback((msg, type = 'success') => {
    message[type]?.(msg) ?? message.success(msg);
  }, [message]);

  // 从 localStorage 读取暂存数据作为初始值
  const [rateType, setRateType] = useState(() => loadFromStorage()?.rateType || 'lpr');
  const [fixedRate, setFixedRate] = useState(() => loadFromStorage()?.fixedRate ?? 4.35);
  const [dayBase, setDayBase] = useState(() => loadFromStorage()?.dayBase || 365);
  const [endDate, setEndDate] = useState(() => loadFromStorage()?.endDate || today());
  const [lprMode, setLprMode] = useState(() => loadFromStorage()?.lprMode || 'multiplier');
  const [lprTerm, setLprTerm] = useState(() => loadFromStorage()?.lprTerm || '1y');
  const [mergeLpr, setMergeLpr] = useState(() => loadFromStorage()?.mergeLpr ?? true);
  const [lprData, setLprData] = useState(() => loadFromStorage()?.lprData || baselineLpr());
  const [loans, setLoans] = useState(() => loadFromStorage()?.loans || [emptyLoan()]);
  const [repays, setRepays] = useState(() => loadFromStorage()?.repays || [emptyRepay()]);
  const [multipliers, setMultipliers] = useState(() => loadFromStorage()?.multipliers || [{ startDate: '', value: 1.0 }]);

  const importRef = useRef(null);

  // 每月 20 日发布新一期后，打开页面时自动追加到 lprData 末尾
  useLprAutoUpdate(lprData, setLprData, showToast);

  const collectState = () => ({
    version: 1,
    rateType, fixedRate, dayBase, endDate, lprMode, lprTerm, mergeLpr,
    lprData, loans, repays, multipliers,
  });

  // 任一输入变化后防抖暂存，刷新页面不丢数据（此前仅在点击计算时保存）
  useEffect(() => {
    const timer = setTimeout(() => {
      saveToStorage({
        version: 1,
        rateType, fixedRate, dayBase, endDate, lprMode, lprTerm, mergeLpr,
        lprData, loans, repays, multipliers,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [rateType, fixedRate, dayBase, endDate, lprMode, lprTerm, mergeLpr, lprData, loans, repays, multipliers]);

  // 输入变化即重新计算（纯前端、毫秒级），结果不会与当前输入脱节；
  // 无法计算时把原因展示在结果区，而不是弹一次性提示
  const calc = useMemo(() => {
    if (!loans.some((l) => l.date && l.amount > 0)) return { status: 'empty' };
    try {
      const result = calculate({ rateType, fixedRate, dayBase, endDate, lprData, multipliers, lprMode, lprTerm, mergeLpr, loans, repays });
      return { status: 'ok', result };
    } catch (err) {
      return { status: 'error', message: err.message };
    }
  }, [rateType, fixedRate, dayBase, endDate, lprData, multipliers, lprMode, lprTerm, mergeLpr, loans, repays]);

  const handleExport = () => {
    const data = collectState();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LPR计算数据_${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('数据已导出');
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.rateType) setRateType(data.rateType);
        if (data.fixedRate !== undefined) setFixedRate(data.fixedRate);
        if (data.dayBase) setDayBase(data.dayBase);
        if (data.endDate) setEndDate(data.endDate);
        if (data.lprMode) setLprMode(data.lprMode);
        if (data.lprTerm) setLprTerm(data.lprTerm);
        if (data.mergeLpr !== undefined) setMergeLpr(data.mergeLpr);
        if (data.lprData) setLprData(data.lprData);
        if (data.loans) setLoans(data.loans);
        if (data.repays) setRepays(data.repays);
        if (data.multipliers) setMultipliers(data.multipliers);
        showToast('数据导入成功');
      } catch (err) {
        showToast('导入失败: ' + err.message, 'error');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleClear = () => {
    modal.confirm({
      title: '确认清空',
      content: '借还款记录、计息设置和 LPR 数据都会恢复为初始状态，此操作无法撤销。建议先导出备份。',
      okType: 'danger',
      okText: '清空',
      cancelText: '取消',
      onOk: () => {
        setRateType('lpr');
        setFixedRate(4.35);
        setDayBase(365);
        setEndDate(today());
        setLprMode('multiplier');
        setLprTerm('1y');
        setMergeLpr(true);
        setLprData(baselineLpr());
        // 与首次打开保持一致：各留一行空白录入
        setLoans([emptyLoan()]);
        setRepays([emptyRepay()]);
        setMultipliers([{ startDate: '', value: 1.0 }]);
        localStorage.removeItem(STORAGE_KEY);
        showToast('已清空所有数据');
      },
    });
  };

  const dataMenu = {
    items: [
      { key: 'export', icon: <ExportOutlined />, label: '导出数据（JSON）' },
      { key: 'import', icon: <ImportOutlined />, label: '导入数据（JSON）' },
      { type: 'divider' },
      { key: 'clear', icon: <DeleteOutlined />, label: '清空所有数据', danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'export') handleExport();
      else if (key === 'import') importRef.current?.click();
      else if (key === 'clear') handleClear();
    },
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true"><CalculatorOutlined /></span>
            <div className="brand-text">
              <h1>LPR 借贷利息计算</h1>
              <p>多笔借还款 · LPR 分段倍率/加点 · 结果可直接粘贴到 Excel</p>
            </div>
          </div>
          <div className="topbar-actions">
            <Button
              type="text"
              icon={<GithubOutlined />}
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="在 GitHub 上查看源码"
            />
            <Dropdown menu={dataMenu} trigger={['click']} placement="bottomRight">
              <Button icon={<MoreOutlined />}>数据</Button>
            </Dropdown>
            <input ref={importRef} type="file" accept=".json" hidden onChange={handleImport} />
          </div>
        </div>
      </header>

      <main className="container">
        <Settings
          rateType={rateType} setRateType={setRateType}
          fixedRate={fixedRate} setFixedRate={setFixedRate}
          dayBase={dayBase} setDayBase={setDayBase}
          endDate={endDate} setEndDate={setEndDate}
          mergeLpr={mergeLpr} setMergeLpr={setMergeLpr}
          lprMode={lprMode} setLprMode={setLprMode}
          lprTerm={lprTerm} setLprTerm={setLprTerm}
          multipliers={multipliers} setMultipliers={setMultipliers}
          lprData={lprData} setLprData={setLprData}
          showToast={showToast}
        />

        <EntryList type="loan" entries={loans} setEntries={setLoans} />
        <EntryList type="repay" entries={repays} setEntries={setRepays} />

        <ResultTable calc={calc} endDate={endDate} showToast={showToast} />
      </main>

      <SummaryBar calc={calc} targetId="result-section" />
    </>
  );
}

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#4f6ef7',
          colorText: '#1f2633',
          colorTextSecondary: '#5b6577',
          colorBorder: '#d9dee8',
          colorBorderSecondary: '#e8ebf1',
          borderRadius: 8,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Segmented: { itemSelectedColor: '#4f6ef7' },
          Table: { headerBg: '#f6f7fa', headerColor: '#5b6577', cellFontSizeSM: 13 },
        },
      }}
    >
      <AntdApp>
        <LprCalc />
      </AntdApp>
    </ConfigProvider>
  );
}
