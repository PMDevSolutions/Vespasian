import { useCallback, useEffect, useState } from 'react';
import { activeManifest, getScreen, getStep } from '../../shared/product';
import type { SiteCommand, WixSiteStatus } from '../../shared/types/site';
import { bridge } from '../api/bridge';
import { useTaskStream } from '../hooks/useTaskStream';
import { LogStream } from './LogStream';

// Catalog from the manifest: the site lifecycle steps and the external links.
const SITE_SCREEN = getScreen(activeManifest, 'site');
const LIST_STEP = getStep(SITE_SCREEN, 'list');
const USE_STEP = getStep(SITE_SCREEN, 'use');
const APPLY_STEP = getStep(SITE_SCREEN, 'apply');
const PUBLISH_STEP = getStep(SITE_SCREEN, 'publish');
const LINKS = SITE_SCREEN.extras?.links ?? [];

const GUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Turn a failed site run's log into an actionable message (cf. docs/TROUBLESHOOTING.md). */
function siteErrorHint(lines: string[]): string {
  const text = lines.join('\n').toLowerCase();
  if (/401|unauthorized|invalid.*(api key|token)|wix_api_key/.test(text)) {
    return 'Wix rejected the credentials — check WIX_API_KEY and WIX_ACCOUNT_ID in .env (account-level key from manage.wix.com/account/api-keys).';
  }
  if (/403|forbidden|permission/.test(text)) {
    return 'The API key lacks permission for this operation — it must be an account-level key with site permissions.';
  }
  if (/429|too many requests|rate limit/.test(text)) {
    return 'Wix rate-limited the request — wait a minute and retry.';
  }
  if (/session|storage.?state|login --editor|consent/.test(text)) {
    return 'The editor session is missing or expired — run `pnpm vespasian login --editor` in a terminal to (re)capture it.';
  }
  return 'The command failed — see the log above.';
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <tr>
      <td>{label}</td>
      <td>
        <span className={`badge badge-${ok ? 'pass' : 'skip'}`}>{ok ? 'SET' : 'NOT SET'}</span>
      </td>
      <td className="ports">{detail ?? ''}</td>
    </tr>
  );
}

export function SitePanel() {
  const [status, setStatus] = useState<WixSiteStatus | null>(null);
  const [plans, setPlans] = useState<string[]>([]);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [siteIdInput, setSiteIdInput] = useState('');
  const [active, setActive] = useState<{ taskId: string; label: string; command: SiteCommand } | null>(
    null,
  );
  const stream = useTaskStream(active?.taskId ?? null);

  const refresh = useCallback(() => {
    bridge()
      .getSiteStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
    bridge()
      .listPlans()
      .then((p) => {
        setPlans(p);
        setSelectedPlan((prev) => prev || p[0] || '');
      })
      .catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const terminal =
    stream.state === 'succeeded' || stream.state === 'failed' || stream.state === 'cancelled';
  const busy = active !== null && !terminal;

  useEffect(() => {
    if (active && terminal) refresh();
  }, [active, terminal, refresh]);

  const run = (command: SiteCommand, label: string, arg?: string) => {
    bridge()
      .runSite(command, arg)
      .then(({ taskId }) => setActive({ taskId, label, command }))
      .catch(() => setActive(null));
  };

  const failed = active !== null && stream.state === 'failed';
  const openExternal = (url: string): void => {
    void bridge().openExternal(url);
  };

  const hasCreds = (status?.hasApiKey && status?.hasAccountId) ?? false;
  const connected = Boolean(status?.siteId);
  const dashboardUrl = status?.metasiteId
    ? `https://manage.wix.com/dashboard/${status.metasiteId}/home`
    : null;
  const siteIdOk = GUID_LIKE.test(siteIdInput.trim());

  return (
    <section className="panel">
      <header className="panel-header">
        <h1>Wix site</h1>
        <button type="button" onClick={refresh}>
          Refresh
        </button>
      </header>
      <p className="panel-intro">
        Drives the target Wix Studio site through <code>bin/vespasian.mjs</code> — list and
        connect sites, apply a compiled BuildPlan, and publish. Credentials come from the
        project&rsquo;s <code>.env</code>; with <code>VESPASIAN_DRY_RUN=1</code> every operation
        is a no-op rehearsal.
      </p>

      <div className="group">
        <h2>Connection</h2>
        {status === null ? (
          <p className="panel-intro">Loading…</p>
        ) : (
          <table className="status-table">
            <tbody>
              <StatusRow
                label="WIX_API_KEY"
                ok={status.hasApiKey}
                detail={status.hasApiKey ? 'value hidden' : 'add it to .env'}
              />
              <StatusRow label="WIX_ACCOUNT_ID" ok={status.hasAccountId} />
              <StatusRow label="WIX_SITE_ID (target site)" ok={connected} detail={status.siteId ?? ''} />
              <StatusRow
                label="Editor session"
                ok={status.editorSessionCaptured}
                detail={
                  status.editorSessionCaptured
                    ? 'captured'
                    : 'run `pnpm vespasian login --editor` in a terminal'
                }
              />
              {status.dryRun && (
                <tr>
                  <td>VESPASIAN_DRY_RUN</td>
                  <td>
                    <span className="badge badge-info">ON</span>
                  </td>
                  <td className="ports">all operations are recorded, not executed</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {status !== null && !status.hasEnvFile && (
          <p className="hint-note">
            No <code>.env</code> yet — run the <strong>Setup wizard</strong> first (it writes the
            Wix credentials), or copy <code>.env.example</code>.
          </p>
        )}
        <div className="button-row">
          {LINKS.map((l) => (
            <button key={l.url} type="button" onClick={() => openExternal(l.url)}>
              {l.label}
            </button>
          ))}
          {dashboardUrl && (
            <button type="button" onClick={() => openExternal(dashboardUrl)}>
              Site dashboard
            </button>
          )}
        </div>
      </div>

      <div className="group">
        <h2>Target site</h2>
        <p className="hint-note">
          <strong>{LIST_STEP.label}</strong> shows the sites on your account;{' '}
          <strong>Connect</strong> writes the chosen site&rsquo;s id into <code>.env</code> as{' '}
          <code>WIX_SITE_ID</code>. New sites are provisioned by the Setup wizard or{' '}
          <code>pnpm vespasian site create</code>.
        </p>
        <div className="button-row">
          <button
            type="button"
            disabled={busy || (!hasCreds && !status?.dryRun)}
            onClick={() => run('list', LIST_STEP.label)}
          >
            {LIST_STEP.label}
          </button>
          <input
            value={siteIdInput}
            onChange={(e) => setSiteIdInput(e.target.value)}
            placeholder="site id (GUID) to connect"
            spellCheck={false}
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy || !siteIdOk}
            onClick={() => run('use', `Connect ${siteIdInput.trim()}`, siteIdInput.trim())}
          >
            {USE_STEP.cta ?? USE_STEP.label}
          </button>
        </div>
        {siteIdInput.trim() !== '' && !siteIdOk && (
          <span className="field-error">Enter a site GUID (from List sites).</span>
        )}
      </div>

      <div className="group">
        <h2>Apply &amp; publish</h2>
        <p className="hint-note">
          Apply executes a compiled BuildPlan from <code>.vespasian/plans/</code> against the
          target site (API steps run directly; editor steps surface as pending work for the{' '}
          <code>wix-site-builder</code> agent). Publish pushes the site live.
        </p>
        <div className="button-row">
          <select value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)} disabled={busy}>
            {plans.length === 0 && <option value="">No compiled plans found</option>}
            {plans.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !selectedPlan || (!connected && !status?.dryRun)}
            onClick={() =>
              run('apply', `Apply ${selectedPlan}`, `.vespasian/plans/${selectedPlan}/plan.json`)
            }
          >
            {APPLY_STEP.cta ?? APPLY_STEP.label}
          </button>
          <button
            type="button"
            disabled={busy || (!connected && !status?.dryRun)}
            onClick={() => run('publish', PUBLISH_STEP.label)}
          >
            {PUBLISH_STEP.label}
          </button>
        </div>
        {!connected && !status?.dryRun && (
          <span className="field-error">Connect a target site first (WIX_SITE_ID).</span>
        )}
      </div>

      <div className="group">
        <h2>Editor automation</h2>
        <p className="hint-note">
          Some steps (pages, theme panels, canvas work) have no official API and run through a
          consent-gated, headed browser session. Capturing it is interactive — consent prompt,
          real login, possibly CAPTCHA/2FA — so it happens in a terminal, not here:{' '}
          <code>pnpm vespasian login --editor</code>. Session state is stored at{' '}
          <code>.vespasian/session/state.json</code> and its expiry is a designed
          human-in-the-loop pause, not an error.
        </p>
      </div>

      {active && (
        <div className="group">
          <div className="panel-header">
            <h2>{active.label}</h2>
            {busy && (
              <button type="button" onClick={() => void bridge().cancelTask(active.taskId)}>
                Cancel
              </button>
            )}
          </div>
          {failed && (
            <div className="banner banner-error">
              <strong>{active.label} failed</strong>
              <span>{siteErrorHint(stream.lines)}</span>
              <button
                type="button"
                className="link-btn"
                onClick={() => void bridge().openPath('docs/TROUBLESHOOTING.md')}
              >
                Open the troubleshooting guide
              </button>
            </div>
          )}
          <LogStream lines={stream.lines} />
        </div>
      )}
    </section>
  );
}
