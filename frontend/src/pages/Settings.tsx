import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Eye, EyeOff, Check, AlertCircle, Wifi, WifiOff, Save, Shield,
  Bell, Server, Link as LinkIcon,
} from 'lucide-react';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Settings type (mirrors backend Settings model)
// ---------------------------------------------------------------------------
interface Settings {
  reportEmail: string;
  reportEmailTime: string;
  linkedinMode: string;
  timezone: string;
  morningJobTime: string;
  middayJobTime: string;
  afternoonJobTime: string;
  eveningJobTime: string;
  globalWeeklyConnectionLimit: number;
  globalDailyConnectionLimit: number;
  globalDailyMessageLimit: number;
}

type ServiceStatus = 'ok' | 'error' | 'unconfigured' | 'unknown';

interface ApiStatus {
  unipile:  ServiceStatus;
  claude:   ServiceStatus;
  telegram: ServiceStatus;
  resend:   ServiceStatus;
}

// ---------------------------------------------------------------------------
// Masked API key input (read-only display)
// ---------------------------------------------------------------------------
function MaskedInput({ label }: { label: string }) {
  const [show, setShow] = useState(false);
  const placeholder = show ? '(managed via env var)' : '••••••••••••••••••••••••';
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={placeholder}
          readOnly
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-10 bg-gray-50 text-gray-400 focus:outline-none cursor-default"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1">
        Le API key sono gestite tramite variabili d'ambiente sul server.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service status indicator
// ---------------------------------------------------------------------------
function StatusIndicator({ status, label }: { status: ServiceStatus; label: string }) {
  const configs: Record<ServiceStatus, { color: string; bg: string; icon: React.ReactNode }> = {
    ok:           { color: 'text-green-600', bg: 'bg-green-50',  icon: <Check className="h-4 w-4" /> },
    error:        { color: 'text-red-600',   bg: 'bg-red-50',    icon: <AlertCircle className="h-4 w-4" /> },
    unconfigured: { color: 'text-gray-400',  bg: 'bg-gray-50',   icon: <WifiOff className="h-4 w-4" /> },
    unknown:      { color: 'text-yellow-600',bg: 'bg-yellow-50', icon: <AlertCircle className="h-4 w-4" /> },
  };
  const cfg = configs[status] ?? configs.unknown;
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${cfg.bg}`}>
      <span className={cfg.color}>{cfg.icon}</span>
      <span className={`text-sm font-medium ${cfg.color}`}>{label}: {status}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: API Connections
// ---------------------------------------------------------------------------
function ApiConnectionsTab() {
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'ok' | 'error'>>({});

  const { data: statuses } = useQuery<ApiStatus>({
    queryKey: ['settings', 'api-status'],
    queryFn: () => api.get<ApiStatus>('/settings/api-status'),
  });

  const testConnection = async (service: string) => {
    setTesting(service);
    try {
      await api.post(`/settings/test-connection/${service}`);
      setTestResults(p => ({ ...p, [service]: 'ok' }));
    } catch {
      setTestResults(p => ({ ...p, [service]: 'error' }));
    } finally {
      setTesting(null);
    }
  };

  const services = [
    { key: 'unipile',  label: 'Unipile API',  description: 'Gateway per le operazioni LinkedIn' },
    { key: 'claude',   label: 'Claude API',    description: 'Analisi profili e generazione messaggi' },
    { key: 'telegram', label: 'Telegram Bot',  description: 'Notifiche e alert in tempo reale' },
    { key: 'resend',   label: 'Resend',        description: 'Email report e notifiche' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Connessioni API</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Le chiavi API sono configurate tramite variabili d'ambiente. Qui puoi verificarne lo stato.
        </p>
      </div>

      {/* Status overview */}
      {statuses && (
        <div className="flex flex-wrap gap-2">
          {services.map(s => (
            <StatusIndicator
              key={s.key}
              status={statuses[s.key as keyof ApiStatus] ?? 'unknown'}
              label={s.label}
            />
          ))}
        </div>
      )}

      {/* Service cards */}
      <div className="space-y-4">
        {services.map(service => (
          <div key={service.key} className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-gray-400" />
                  <p className="font-medium text-gray-900 text-sm">{service.label}</p>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 ml-6">{service.description}</p>
              </div>
              <button
                onClick={() => testConnection(service.key)}
                disabled={testing === service.key}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex-shrink-0 ${
                  testResults[service.key] === 'ok'
                    ? 'bg-green-50 text-green-700'
                    : testResults[service.key] === 'error'
                    ? 'bg-red-50 text-red-600'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {testing === service.key ? (
                  <><Wifi className="h-3.5 w-3.5 animate-pulse" />Test in corso...</>
                ) : testResults[service.key] === 'ok' ? (
                  <><Check className="h-3.5 w-3.5" />Connesso</>
                ) : testResults[service.key] === 'error' ? (
                  <><AlertCircle className="h-3.5 w-3.5" />Errore</>
                ) : (
                  <><Wifi className="h-3.5 w-3.5" />Test connessione</>
                )}
              </button>
            </div>
            <div className="mt-3 ml-6">
              <MaskedInput label="API Key" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: LinkedIn
// ---------------------------------------------------------------------------
function LinkedInTab({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (data: Partial<Settings>) => void;
}) {
  const [form, setForm] = useState({
    linkedinMode: settings.linkedinMode,
    globalWeeklyConnectionLimit: settings.globalWeeklyConnectionLimit,
    globalDailyConnectionLimit: settings.globalDailyConnectionLimit,
    globalDailyMessageLimit: settings.globalDailyMessageLimit,
  });
  const [testing, setTesting] = useState(false);
  const [healthResult, setHealthResult] = useState<string | null>(null);

  const checkHealth = async () => {
    setTesting(true);
    setHealthResult(null);
    try {
      const res = await api.get<{ status: string }>('/settings/linkedin-health');
      setHealthResult(res.status ?? 'ok');
    } catch {
      setHealthResult('error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Configurazione LinkedIn</h2>
        <p className="text-sm text-gray-500 mt-0.5">Modalità operativa e limiti globali.</p>
      </div>

      {/* Mode */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Modalità LinkedIn</label>
        <div className="flex gap-3">
          {(['free', 'sales_navigator'] as const).map(mode => (
            <label
              key={mode}
              className={`flex-1 flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                form.linkedinMode === mode
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                checked={form.linkedinMode === mode}
                onChange={() => setForm(p => ({ ...p, linkedinMode: mode }))}
                className="text-indigo-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {mode === 'free' ? 'LinkedIn Free' : 'Sales Navigator'}
                </p>
                <p className="text-xs text-gray-500">
                  {mode === 'free' ? '150 inv/sett., keyword only' : 'Filtri avanzati'}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Budget sliders */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-4">
        <h3 className="text-sm font-medium text-gray-700">Limiti globali</h3>
        {[
          { key: 'globalWeeklyConnectionLimit' as const, label: 'Connessioni/settimana', max: 150 },
          { key: 'globalDailyConnectionLimit'  as const, label: 'Connessioni/giorno',    max: 21 },
          { key: 'globalDailyMessageLimit'     as const, label: 'Messaggi/giorno',       max: 50 },
        ].map(f => (
          <div key={f.key}>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>{f.label}</span>
              <span className="font-bold text-gray-900">{form[f.key]}</span>
            </div>
            <input
              type="range"
              min={1}
              max={f.max}
              value={form[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: Number(e.target.value) }))}
              className="w-full accent-indigo-600"
            />
          </div>
        ))}
      </div>

      {/* Health check */}
      <div className="flex items-center gap-3">
        <button
          onClick={checkHealth}
          disabled={testing}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Wifi className={`h-4 w-4 ${testing ? 'animate-pulse text-indigo-500' : 'text-gray-400'}`} />
          {testing ? 'Checking...' : 'Health check LinkedIn'}
        </button>
        {healthResult && (
          <span
            className={`text-sm font-medium ${
              healthResult === 'ok' || healthResult === 'healthy'
                ? 'text-green-600'
                : 'text-red-600'
            }`}
          >
            {healthResult === 'ok' || healthResult === 'healthy'
              ? 'Connessione OK'
              : `Errore: ${healthResult}`}
          </span>
        )}
      </div>

      <button
        onClick={() => onSave(form)}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
      >
        <Save className="h-4 w-4" />
        Salva impostazioni LinkedIn
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Notifications
// ---------------------------------------------------------------------------
function NotificationsTab({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (data: Partial<Settings>) => void;
}) {
  const [form, setForm] = useState({
    reportEmail: settings.reportEmail,
    reportEmailTime: settings.reportEmailTime,
  });
  const [telegramTest, setTelegramTest] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  const testTelegram = async () => {
    setTelegramTest('loading');
    try {
      await api.post('/settings/test-telegram');
      setTelegramTest('ok');
    } catch {
      setTelegramTest('error');
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Notifiche</h2>
        <p className="text-sm text-gray-500 mt-0.5">Configurazione Telegram e report email.</p>
      </div>

      {/* Telegram */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Telegram Bot</h3>
        </div>
        <p className="text-xs text-gray-500">
          Configura TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID nelle variabili d'ambiente del server.
        </p>
        <button
          onClick={testTelegram}
          disabled={telegramTest === 'loading'}
          className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${
            telegramTest === 'ok'
              ? 'border-green-300 bg-green-50 text-green-700'
              : telegramTest === 'error'
              ? 'border-red-300 bg-red-50 text-red-600'
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          {telegramTest === 'loading'
            ? 'Invio messaggio di test...'
            : telegramTest === 'ok'
            ? <><Check className="h-3.5 w-3.5" />Messaggio inviato</>
            : telegramTest === 'error'
            ? <><AlertCircle className="h-3.5 w-3.5" />Errore invio</>
            : 'Invia messaggio di test'}
        </button>
      </div>

      {/* Email report */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Report email giornaliero</h3>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email destinatario</label>
          <input
            type="email"
            value={form.reportEmail}
            onChange={e => setForm(p => ({ ...p, reportEmail: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="nome@esempio.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Orario invio report</label>
          <input
            type="time"
            value={form.reportEmailTime}
            onChange={e => setForm(p => ({ ...p, reportEmailTime: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <button
        onClick={() => onSave(form)}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
      >
        <Save className="h-4 w-4" />
        Salva notifiche
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: System
// ---------------------------------------------------------------------------
function SystemTab({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (data: Partial<Settings>) => void;
}) {
  const [form, setForm] = useState({
    timezone: settings.timezone,
    morningJobTime:   settings.morningJobTime,
    middayJobTime:    settings.middayJobTime,
    afternoonJobTime: settings.afternoonJobTime,
    eveningJobTime:   settings.eveningJobTime,
  });

  const timezones = [
    'Europe/Rome', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC',
  ];

  const jobSlots: { key: keyof typeof form; label: string }[] = [
    { key: 'morningJobTime',   label: 'Job mattino' },
    { key: 'middayJobTime',    label: 'Job mezzogiorno' },
    { key: 'afternoonJobTime', label: 'Job pomeriggio' },
    { key: 'eveningJobTime',   label: 'Job sera' },
  ];

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Sistema</h2>
        <p className="text-sm text-gray-500 mt-0.5">Orari dei job automatici e timezone.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
        <select
          value={form.timezone}
          onChange={e => setForm(p => ({ ...p, timezone: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {timezones.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Server className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Orari job (+/- 15 min randomizzati)
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {jobSlots.map(slot => (
            <div key={slot.key}>
              <label className="block text-xs font-medium text-gray-700 mb-1">{slot.label}</label>
              <input
                type="time"
                value={form[slot.key]}
                onChange={e => setForm(p => ({ ...p, [slot.key]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => onSave(form)}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
      >
        <Save className="h-4 w-4" />
        Salva impostazioni sistema
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Security
// ---------------------------------------------------------------------------
function SecurityTab() {
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwStatus, setPwStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [backupLoading, setBackupLoading] = useState(false);

  const changePassword = async () => {
    if (pwForm.newPw !== pwForm.confirm) {
      window.alert('Le password non coincidono.');
      return;
    }
    setPwStatus('loading');
    try {
      await api.post('/auth/change-password', {
        currentPassword: pwForm.current,
        newPassword: pwForm.newPw,
      });
      setPwStatus('ok');
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch {
      setPwStatus('error');
    }
  };

  const triggerBackup = async () => {
    setBackupLoading(true);
    try {
      await api.post('/settings/backup');
      window.alert('Backup avviato con successo.');
    } catch {
      window.alert('Errore nel backup.');
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Sicurezza</h2>
        <p className="text-sm text-gray-500 mt-0.5">Gestione password e backup dei dati.</p>
      </div>

      {/* Change password */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Cambia password</h3>
        </div>
        {[
          { key: 'current', label: 'Password attuale' },
          { key: 'newPw',   label: 'Nuova password' },
          { key: 'confirm', label: 'Conferma nuova password' },
        ].map(f => (
          <div key={f.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
            <input
              type="password"
              value={pwForm[f.key as keyof typeof pwForm]}
              onChange={e => setPwForm(p => ({ ...p, [f.key]: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        ))}

        {pwStatus === 'ok' && (
          <p className="text-sm text-green-600 flex items-center gap-1">
            <Check className="h-4 w-4" />Password aggiornata con successo.
          </p>
        )}
        {pwStatus === 'error' && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />Errore nel cambio password.
          </p>
        )}

        <button
          onClick={changePassword}
          disabled={pwStatus === 'loading' || !pwForm.current || !pwForm.newPw}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {pwStatus === 'loading' ? 'Aggiornamento...' : 'Cambia password'}
        </button>
      </div>

      {/* Backup */}
      <div className="space-y-3 border-t border-gray-100 pt-6">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Backup database</h3>
        </div>
        <p className="text-xs text-gray-500">
          Il backup automatico viene eseguito ogni 24 ore. Puoi avviarne uno manuale ora.
        </p>
        <button
          onClick={triggerBackup}
          disabled={backupLoading}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {backupLoading ? 'Backup in corso...' : 'Avvia backup manuale'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------
type TabId = 'api' | 'linkedin' | 'notifications' | 'system' | 'security';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'api',           label: 'Connessioni API', icon: <LinkIcon className="h-4 w-4" /> },
  { id: 'linkedin',      label: 'LinkedIn',         icon: <Wifi className="h-4 w-4" /> },
  { id: 'notifications', label: 'Notifiche',        icon: <Bell className="h-4 w-4" /> },
  { id: 'system',        label: 'Sistema',          icon: <Server className="h-4 w-4" /> },
  { id: 'security',      label: 'Sicurezza',        icon: <Shield className="h-4 w-4" /> },
];

const DEFAULT_SETTINGS: Settings = {
  reportEmail: '',
  reportEmailTime: '19:00',
  linkedinMode: 'free',
  timezone: 'Europe/Rome',
  morningJobTime: '09:00',
  middayJobTime: '11:30',
  afternoonJobTime: '14:00',
  eveningJobTime: '18:30',
  globalWeeklyConnectionLimit: 150,
  globalDailyConnectionLimit: 21,
  globalDailyMessageLimit: 25,
};

export default function Settings() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('api');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => api.get<Settings>('/settings'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Settings>) => api.put('/settings', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const merged: Settings = { ...DEFAULT_SETTINGS, ...settings };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Impostazioni</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configurazione della piattaforma</p>
        </div>
        {saveSuccess && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm font-medium">
            <Check className="h-4 w-4" />
            Salvato!
          </div>
        )}
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Sidebar navigation */}
        <nav className="flex lg:flex-col gap-1 flex-shrink-0 flex-wrap">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                activeTab === tab.id
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className={activeTab === tab.id ? 'text-indigo-600' : 'text-gray-400'}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {activeTab === 'api'           && <ApiConnectionsTab />}
          {activeTab === 'linkedin'      && (
            <LinkedInTab settings={merged} onSave={updateMutation.mutate} />
          )}
          {activeTab === 'notifications' && (
            <NotificationsTab settings={merged} onSave={updateMutation.mutate} />
          )}
          {activeTab === 'system'        && (
            <SystemTab settings={merged} onSave={updateMutation.mutate} />
          )}
          {activeTab === 'security'      && <SecurityTab />}

          {updateMutation.isError && (
            <div className="mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              Errore nel salvataggio. Riprova.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
