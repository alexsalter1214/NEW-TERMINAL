import React, { useState, useEffect } from 'react';
import { CREDIT_RATES, calculateShiftCredits } from './utils/creditCalculator';

interface ShiftRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  credits: number;
  notes?: string;
  writeStatus?: 'idle' | 'success' | 'failed';
  errorMessage?: string;
}

const SAMPLE_SHIFTS: ShiftRecord[] = [
  {
    id: 's-101',
    employeeId: 'e-1',
    employeeName: 'Maya Chen',
    date: '2026-10-24',
    startTime: '07:00',
    endTime: '16:00',
    hours: 9.0,
    credits: 112.5,
    notes: ''
  },
  {
    id: 's-102',
    employeeId: 'e-2',
    employeeName: 'Marcus Vance',
    date: '2026-10-24',
    startTime: '16:00',
    endTime: '00:00',
    hours: 8.0,
    credits: 80.0,
    notes: ''
  },
  {
    id: 's-103',
    employeeId: 'e-3',
    employeeName: 'Elena Rostova',
    date: '2026-10-25',
    startTime: '07:00',
    endTime: '16:00',
    hours: 9.0,
    credits: 112.5,
    notes: ''
  },
  {
    id: 's-104',
    employeeId: 'e-4',
    employeeName: 'David Kim',
    date: '2026-10-21',
    startTime: '07:00',
    endTime: '16:00',
    hours: 9.0,
    credits: 72.0,
    notes: ''
  },
  {
    id: 's-105',
    employeeId: 'e-5',
    employeeName: 'Priya Patel',
    date: '2026-10-19',
    startTime: '07:00',
    endTime: '16:00',
    hours: 9.0,
    credits: 54.0,
    notes: ''
  },
  {
    id: 's-106',
    employeeId: 'e-6',
    employeeName: 'Lucas Morales',
    date: '2026-10-20',
    startTime: '16:00',
    endTime: '00:00',
    hours: 8.0,
    credits: 32.0,
    notes: ''
  },
  {
    id: 's-107',
    employeeId: 'e-7',
    employeeName: 'Alex Salter',
    date: '2026-10-22',
    startTime: '00:00',
    endTime: '07:00',
    hours: 7.0,
    credits: 14.0,
    notes: ''
  }
];

// Helper to normalize any Humanity time string into 24-hour "HH:mm"
function normalizeTime24(timeVal: any): string {
  if (!timeVal) return '07:00';
  let rawStr = '';
  if (typeof timeVal === 'string') {
    rawStr = timeVal.trim();
  } else if (typeof timeVal === 'object' && timeVal !== null) {
    rawStr = String(timeVal.time || timeVal.formatted || timeVal.value || '').trim();
  } else {
    rawStr = String(timeVal).trim();
  }

  const clean = rawStr.toLowerCase();

  // Match 12-hour format e.g. "7:00am", "07:30 pm", "4pm", "12:00am"
  const match12 = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match12) {
    let hour = parseInt(match12[1], 10);
    const minute = match12[2] || '00';
    const ampm = match12[3];
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }

  // Match 24-hour format e.g. "07:00", "7:00", "16:00:00"
  if (clean.includes(':')) {
    const parts = clean.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parts[1]?.slice(0, 2) || '00';
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  return rawStr || '07:00';
}

// Helper to build a lookup map of Humanity employees supporting fname/lname/first_name/name
function buildEmployeeMap(data: any): Record<string, string> {
  const map: Record<string, string> = {};
  if (!data) return map;

  const rawList: any[] = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null
    ? Object.values(data)
    : [];

  rawList.forEach((emp: any) => {
    if (!emp || typeof emp !== 'object') return;

    const fname = emp.fname || emp.first_name || emp.firstName || '';
    const lname = emp.lname || emp.last_name || emp.lastName || '';
    const combined = `${fname} ${lname}`.trim();
    const name =
      typeof emp.name === 'string' && emp.name.trim()
        ? emp.name.trim()
        : combined || emp.username || emp.email || 'Staff';

    const idKeys = [emp.id, emp.eid, emp.employee_id, emp.user_id];
    idKeys.forEach((k) => {
      if (k !== undefined && k !== null && String(k).trim()) {
        map[String(k).trim()] = name;
      }
    });
  });

  return map;
}

// Helper to extract employee name from a Humanity shift object
function extractEmployeeName(s: any, employeeMap: Record<string, string>): string {
  if (!s || typeof s !== 'object') return 'Staff Member';

  // 1. Direct string name fields on shift
  const directFields = [
    s.employee_name,
    s.employees_name,
    s.staff_name,
    s.user_name,
    s.member_name,
    s.worker_name
  ];
  for (const f of directFields) {
    if (
      typeof f === 'string' &&
      f.trim() &&
      f.trim().toLowerCase() !== 'undefined' &&
      f.trim().toLowerCase() !== 'null'
    ) {
      return f.trim();
    }
  }

  // 2. Object on s.employee
  if (s.employee && typeof s.employee === 'object') {
    const fname = s.employee.fname || s.employee.first_name || '';
    const lname = s.employee.lname || s.employee.last_name || '';
    const combined = `${fname} ${lname}`.trim();
    if (typeof s.employee.name === 'string' && s.employee.name.trim()) {
      return s.employee.name.trim();
    }
    if (combined) return combined;
    if (s.employee.id && employeeMap[String(s.employee.id).trim()]) {
      return employeeMap[String(s.employee.id).trim()];
    }
  }

  // 3. Array on s.employees or s.employee
  const empArray = Array.isArray(s.employees)
    ? s.employees
    : Array.isArray(s.employee)
    ? s.employee
    : null;

  if (empArray && empArray.length > 0) {
    const first = empArray[0];
    if (typeof first === 'object' && first !== null) {
      const fname = first.fname || first.first_name || '';
      const lname = first.lname || first.last_name || '';
      const combined = `${fname} ${lname}`.trim();
      if (typeof first.name === 'string' && first.name.trim()) {
        return first.name.trim();
      }
      if (combined) return combined;
      if (first.id && employeeMap[String(first.id).trim()]) {
        return employeeMap[String(first.id).trim()];
      }
    } else if (typeof first === 'string' || typeof first === 'number') {
      const key = String(first).trim();
      if (employeeMap[key]) return employeeMap[key];
    }
  }

  // 4. Look up by ID candidate fields in employeeMap
  const idCandidates = [
    s.employee,
    s.employee_id,
    s.user_id,
    s.user,
    s.staff_id,
    s.staff,
    s.eid
  ];
  for (const id of idCandidates) {
    if (id !== undefined && id !== null && typeof id !== 'object') {
      const key = String(id).trim();
      if (key && employeeMap[key]) {
        return employeeMap[key];
      }
    }
  }

  // 5. Check if shift is unassigned / open
  if (
    s.is_open ||
    s.status === 'open' ||
    s.employee === 0 ||
    s.employee === '0' ||
    s.employee === '' ||
    s.employee === null
  ) {
    return 'Open Shift (Unassigned)';
  }

  // 6. Check if title contains a human name
  if (typeof s.title === 'string' && s.title.trim() && !s.title.toLowerCase().includes('shift')) {
    return s.title.trim();
  }

  return 'Staff Member';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'rates' | 'shifts' | 'settings'>('rates');

  // Connection state
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [tokenInput, setTokenInput] = useState<string>('');
  const [connectLoading, setConnectLoading] = useState<boolean>(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Shifts state
  const [shifts, setShifts] = useState<ShiftRecord[]>(SAMPLE_SHIFTS);
  const [isSampleData, setIsSampleData] = useState<boolean>(true);
  const [shiftsLoading, setShiftsLoading] = useState<boolean>(false);
  const [shiftsError, setShiftsError] = useState<string | null>(null);

  // Date range filters
  const [startDate, setStartDate] = useState<string>('2026-10-19');
  const [endDate, setEndDate] = useState<string>('2026-10-25');

  // Push confirmation modal
  const [showSyncModal, setShowSyncModal] = useState<boolean>(false);
  const [isPushing, setIsPushing] = useState<boolean>(false);
  const [pushResults, setPushResults] = useState<Record<string, { status: 'success' | 'failed'; message?: string }>>({});

  // Check connection status on mount
  useEffect(() => {
    checkConnectionStatus();
  }, []);

  async function checkConnectionStatus() {
    try {
      const res = await fetch('/api/humanity/status');
      if (res.ok) {
        const data = await res.json();
        setIsConnected(Boolean(data.connected));
        if (data.connected) {
          setIsSampleData(false);
          loadHumanityShifts();
        } else {
          setIsSampleData(true);
        }
      }
    } catch {
      setIsConnected(false);
      setIsSampleData(true);
    }
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setConnectLoading(true);
    setConnectError(null);

    try {
      const res = await fetch('/api/humanity/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setConnectError(data.error || 'Connection failed');
        setIsConnected(false);
      } else {
        setIsConnected(true);
        setTokenInput('');
        setConnectError(null);
        setIsSampleData(false);
        setActiveTab('shifts');
        loadHumanityShifts();
      }
    } catch (err: any) {
      setConnectError(`Network error connecting to Humanity API: ${err.message || 'Failed'}`);
      setIsConnected(false);
    } finally {
      setConnectLoading(false);
    }
  }

  async function handleDisconnect() {
    try {
      await fetch('/api/humanity/disconnect', { method: 'POST' });
    } catch {
      // ignore
    }
    setIsConnected(false);
    setIsSampleData(true);
    setShifts(SAMPLE_SHIFTS);
    setConnectError(null);
  }

  async function loadHumanityShifts() {
    setShiftsLoading(true);
    setShiftsError(null);

    try {
      // Fetch employees to build map supporting fname/lname/name/id
      let employeeMap: Record<string, string> = {};
      try {
        const empRes = await fetch('/api/humanity/employees');
        if (empRes.ok) {
          const empJson = await empRes.json();
          employeeMap = buildEmployeeMap(empJson.data || empJson);
        }
      } catch {
        // continue without employee map
      }

      // Fetch shifts for selected date range
      const shiftsRes = await fetch(
        `/api/humanity/shifts?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`
      );

      if (shiftsRes.status === 401) {
        setIsConnected(false);
        setIsSampleData(true);
        setShiftsError('401: Token invalid or expired. Please reconnect in Settings.');
        return;
      }
      if (shiftsRes.status === 403) {
        setShiftsError('403: Permission denied for shift data.');
        return;
      }
      if (shiftsRes.status === 429) {
        setShiftsError('429: Rate limit exceeded. Please wait a moment and refresh.');
        return;
      }
      if (!shiftsRes.ok) {
        const errJson = await shiftsRes.json().catch(() => ({}));
        setShiftsError(errJson.error || `HTTP error ${shiftsRes.status}`);
        return;
      }

      const json = await shiftsRes.json();
      const rawShifts: any[] = Array.isArray(json.data)
        ? json.data
        : typeof json.data === 'object' && json.data !== null
        ? Object.values(json.data)
        : [];

      if (rawShifts.length === 0) {
        setShifts([]);
        setIsSampleData(false);
        return;
      }

      const parsed: ShiftRecord[] = rawShifts.map((s: any, idx: number) => {
        const shiftId = String(
          s.id ||
          s.shift_id ||
          s.sid ||
          `shift-${s.start_date || startDate}-${idx}`
        );

        const empName = extractEmployeeName(s, employeeMap);
        const empId = String(
          s.employee ||
          s.employee_id ||
          s.user_id ||
          s.staff_id ||
          `emp-${idx}`
        );

        const shiftDate = String(s.start_date || s.date || startDate);
        const startT = normalizeTime24(s.start_time || s.start || '07:00');
        const endT = normalizeTime24(s.end_time || s.end || '16:00');

        // Calculate hours and credits using ET logic
        const startIso = `${shiftDate}T${startT}:00`;
        let endIso = `${shiftDate}T${endT}:00`;
        if (endT <= startT || endT === '00:00' || endT === '24:00') {
          const nextD = new Date(new Date(shiftDate).getTime() + 86400000).toISOString().split('T')[0];
          endIso = `${nextD}T${endT === '00:00' || endT === '24:00' ? '00:00:00' : endT + ':00'}`;
        }

        const { hours, credits } = calculateShiftCredits(startIso, endIso);

        return {
          id: shiftId,
          employeeId: empId,
          employeeName: empName,
          date: shiftDate,
          startTime: startT,
          endTime: endT,
          hours,
          credits,
          notes: s.notes || ''
        };
      });

      setShifts(parsed);
      setIsSampleData(false);
    } catch (err: any) {
      setShiftsError(`Network error loading shifts: ${err.message || 'Failed'}`);
    } finally {
      setShiftsLoading(false);
    }
  }

  // Push credits to Humanity
  async function handleConfirmPush() {
    setIsPushing(true);
    const results: Record<string, { status: 'success' | 'failed'; message?: string }> = {};

    for (const shift of shifts) {
      const creditNote = `Coverage Credits: ${shift.credits}`;
      try {
        const res = await fetch(`/api/humanity/shifts/${encodeURIComponent(shift.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: creditNote })
        });

        if (res.ok) {
          results[shift.id] = { status: 'success' };
        } else {
          const errData = await res.json().catch(() => ({}));
          results[shift.id] = {
            status: 'failed',
            message: errData.error || `HTTP ${res.status}`
          };
        }
      } catch (err: any) {
        results[shift.id] = {
          status: 'failed',
          message: err.message || 'Network error'
        };
      }
    }

    setPushResults(results);
    setIsPushing(false);
  }

  return (
    <div className="min-h-screen bg-[#F4F6F8] text-[#1F2A44] flex flex-col font-sans">
      {/* Top Bar */}
      <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Logo & App Title */}
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 shrink-0" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="4" fill="#F97316" />
              <path
                d="M10 9V23M10 16C12 13 18 13 20 16V23M20 9V13"
                stroke="#FFFFFF"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-[#1F2A44] text-sm tracking-tight">Coverage Credits</span>
              <span className="text-xs text-[#6B7280]">for Humanity Schedule</span>
            </div>
          </div>

          {/* Actions & Connection Status */}
          <div className="flex items-center gap-3 text-xs">
            <a
              href="/coverage-credits-project.zip"
              download="coverage-credits-project.zip"
              className="border border-[#E5E7EB] hover:bg-[#F3F4F6] text-[#1F2A44] px-2.5 py-1 text-xs font-medium"
              title="Download project files (.zip) to upload to GitHub or deploy to Vercel"
            >
              Download Code (.zip)
            </a>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#4CAF50]' : 'bg-[#9CA3AF]'}`}
              />
              <span className="text-[#6B7280]">
                {isConnected ? 'Connected' : 'Not connected'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-1 border-t border-[#F3F4F6]">
          <button
            onClick={() => setActiveTab('rates')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'rates'
                ? 'border-[#14606E] text-[#14606E]'
                : 'border-transparent text-[#6B7280] hover:text-[#1F2A44]'
            }`}
          >
            Rates
          </button>
          <button
            onClick={() => setActiveTab('shifts')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'shifts'
                ? 'border-[#14606E] text-[#14606E]'
                : 'border-transparent text-[#6B7280] hover:text-[#1F2A44]'
            }`}
          >
            Shifts
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'settings'
                ? 'border-[#14606E] text-[#14606E]'
                : 'border-transparent text-[#6B7280] hover:text-[#1F2A44]'
            }`}
          >
            Settings
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 flex-1">
        {/* ================= PAGE 1: RATES ================= */}
        {activeTab === 'rates' && (
          <div className="space-y-4">
            <div className="bg-white border border-[#E5E7EB] p-5">
              {/* Header with Numbered Teal Badge */}
              <div className="flex items-center gap-2.5 mb-4">
                <span className="w-5 h-5 bg-[#14606E] text-white text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <h1 className="text-base font-bold text-[#14606E]">
                  Scheduled coverage: biggest rewards
                </h1>
              </div>

              {/* Rates Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] text-[#6B7280] font-semibold">
                      <th className="py-2.5 px-3">COVERAGE PERIOD</th>
                      <th className="py-2.5 px-3">TIME (ET)</th>
                      <th className="py-2.5 px-3 text-right">CREDITS / HR</th>
                      <th className="py-2.5 px-3 text-right">CREDITS PER FULL SHIFT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {CREDIT_RATES.map((rule, idx) => {
                      const isHighlighted = rule.id === 'sat-sun-day';
                      return (
                        <tr
                          key={`rate-row-${rule.id || idx}-${idx}`}
                          className={isHighlighted ? 'bg-[#E6F2F2] font-semibold text-[#14606E]' : 'hover:bg-[#F9FAFB]'}
                        >
                          <td className="py-3 px-3">{rule.name}</td>
                          <td className="py-3 px-3 font-mono">{rule.timeET}</td>
                          <td className="py-3 px-3 text-right font-mono">{rule.rate}</td>
                          <td className="py-3 px-3 text-right font-mono">{rule.fullShift}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================= PAGE 2: SHIFTS ================= */}
        {activeTab === 'shifts' && (
          <div className="space-y-4">
            {/* Sample Data Banner if not connected */}
            {isSampleData && (
              <div className="bg-white border border-[#E5E7EB] p-3 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#6B7280]">
                  <span className="font-semibold text-[#1F2A44]">Sample data</span>
                  <span>(Humanity not connected. Go to Settings to connect).</span>
                </div>
                <button
                  onClick={() => setActiveTab('settings')}
                  className="text-xs text-[#14606E] underline font-medium hover:text-[#0f4b56]"
                >
                  Connect in Settings
                </button>
              </div>
            )}

            {/* Shifts Controls Bar */}
            <div className="bg-white border border-[#E5E7EB] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <label className="text-[#6B7280]">From:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border border-[#E5E7EB] px-2 py-1 text-xs bg-white text-[#1F2A44]"
                />
                <label className="text-[#6B7280] ml-2">To:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border border-[#E5E7EB] px-2 py-1 text-xs bg-white text-[#1F2A44]"
                />
                <button
                  onClick={loadHumanityShifts}
                  disabled={shiftsLoading || !isConnected}
                  className="border border-[#E5E7EB] px-2.5 py-1 text-xs text-[#1F2A44] hover:bg-[#F3F4F6] disabled:opacity-50"
                >
                  {shiftsLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              <div>
                <button
                  onClick={() => {
                    setPushResults({});
                    setShowSyncModal(true);
                  }}
                  disabled={shifts.length === 0}
                  className="bg-[#4CAF50] hover:bg-[#43A047] text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  Sync credits to Humanity
                </button>
              </div>
            </div>

            {/* Error Message */}
            {shiftsError && (
              <div className="bg-white border border-red-300 p-3 text-xs text-red-700">
                {shiftsError}
              </div>
            )}

            {/* Shifts Table */}
            <div className="bg-white border border-[#E5E7EB] overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E7EB] text-[#6B7280] font-semibold bg-[#FAFAFA]">
                    <th className="py-2.5 px-3">Employee</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Start</th>
                    <th className="py-2.5 px-3">End</th>
                    <th className="py-2.5 px-3 text-right">Hours</th>
                    <th className="py-2.5 px-3 text-right">Credits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {shifts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#6B7280]">
                        No shifts found for this date range.
                      </td>
                    </tr>
                  ) : (
                    shifts.map((shift, idx) => (
                      <tr key={`shift-row-${shift.id || idx}-${idx}`} className="hover:bg-[#F9FAFB]">
                        <td className="py-2.5 px-3 font-medium text-[#1F2A44]">{shift.employeeName}</td>
                        <td className="py-2.5 px-3 text-[#6B7280]">{shift.date}</td>
                        <td className="py-2.5 px-3 font-mono">{shift.startTime}</td>
                        <td className="py-2.5 px-3 font-mono">{shift.endTime}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{shift.hours}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#14606E]">
                          {shift.credits}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= PAGE 3: SETTINGS ================= */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            <div className="bg-white border border-[#E5E7EB] p-5 space-y-4">
              <h2 className="text-sm font-bold text-[#14606E]">Humanity Connection</h2>

              {/* Status */}
              <div className="flex items-center gap-3 text-xs">
                <span className="text-[#6B7280]">Status:</span>
                <span
                  className={`inline-flex items-center gap-1.5 font-medium ${
                    isConnected ? 'text-[#4CAF50]' : 'text-[#6B7280]'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#4CAF50]' : 'bg-[#9CA3AF]'}`}
                  />
                  {isConnected ? 'Connected' : 'Not connected'}
                </span>
                {isConnected && (
                  <button
                    onClick={handleDisconnect}
                    className="ml-4 border border-[#E5E7EB] px-2 py-1 text-xs text-red-600 hover:bg-[#FEE2E2]"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              {/* Connection Form */}
              {!isConnected && (
                <form onSubmit={handleConnect} className="space-y-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#1F2A44] mb-1">
                      Access Token
                    </label>
                    <input
                      type="password"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="Enter Humanity API access token"
                      className="w-full max-w-md border border-[#E5E7EB] px-3 py-1.5 text-xs bg-white text-[#1F2A44]"
                      required
                    />
                    <p className="text-[11px] text-[#6B7280] mt-1">
                      Token is held in the backend proxy session only and is not logged or shown after entry.
                    </p>
                  </div>

                  {connectError && (
                    <div className="p-2.5 border border-red-300 text-xs text-red-700 bg-red-50 max-w-md">
                      {connectError}
                    </div>
                  )}

                  <div>
                    <button
                      type="submit"
                      disabled={connectLoading || !tokenInput.trim()}
                      className="bg-[#4CAF50] hover:bg-[#43A047] text-white px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                    >
                      {connectLoading ? 'Connecting...' : 'Connect'}
                    </button>
                  </div>
                </form>
              )}

              {isConnected && (
                <div className="p-3 bg-[#E6F2F2] text-xs text-[#14606E]">
                  Connected to Humanity API v2. Shifts can be pulled and credits written back as shift notes.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ================= SYNC TO HUMANITY PREVIEW MODAL ================= */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5E7EB] max-w-2xl w-full p-5 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2">
              <h3 className="text-sm font-bold text-[#1F2A44]">
                Confirm Sync Credits to Humanity
              </h3>
              <button
                onClick={() => setShowSyncModal(false)}
                className="text-[#6B7280] hover:text-[#1F2A44] text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#6B7280]">
              The following calculated credits will be written back to each shift in Humanity as a note:
            </p>

            {/* Preview List */}
            <div className="border border-[#E5E7EB] overflow-y-auto flex-1 max-h-64">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#FAFAFA] border-b border-[#E5E7EB] text-[#6B7280] sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Shift ID</th>
                    <th className="py-2 px-3">Employee</th>
                    <th className="py-2 px-3">Credits Note</th>
                    <th className="py-2 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {shifts.map((s, idx) => {
                    const result = pushResults[s.id];
                    return (
                      <tr key={`modal-row-${s.id || idx}-${idx}`}>
                        <td className="py-2 px-3 font-mono">{s.id}</td>
                        <td className="py-2 px-3">{s.employeeName}</td>
                        <td className="py-2 px-3 font-mono text-[#14606E]">
                          Coverage Credits: {s.credits}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {result ? (
                            result.status === 'success' ? (
                              <span className="text-[#4CAF50] font-semibold">Success</span>
                            ) : (
                              <span className="text-red-600 font-semibold" title={result.message}>
                                Failed: {result.message || 'Error'}
                              </span>
                            )
                          ) : (
                            <span className="text-[#6B7280]">Pending</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="border border-[#E5E7EB] px-3 py-1.5 text-xs text-[#6B7280] hover:bg-[#F3F4F6]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPush}
                disabled={isPushing || !isConnected}
                className="bg-[#4CAF50] hover:bg-[#43A047] text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                {isPushing ? 'Writing to Humanity...' : 'Confirm and write to Humanity'}
              </button>
            </div>
            {!isConnected && (
              <p className="text-[11px] text-amber-700">
                Note: Cannot write while in sample data mode. Connect your Humanity access token in Settings first.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
