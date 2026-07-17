import { randomBytes, randomUUID } from 'node:crypto';
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { basename } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { WindowsDataPaths } from './paths.js';
import { parseServiceReadiness, type ServiceReadiness } from './service-contract.js';
import type { StandaloneSecrets } from './protected-secrets.js';

export type ServiceSupervisorOptions = {
  executable: string;
  serviceScript: string;
  webRoot: string;
  paths: WindowsDataPaths;
  secrets: StandaloneSecrets;
  parentPid?: number;
  startupTimeoutMs?: number;
  onUnexpectedExit?: (exitCode: number | null, signal: NodeJS.Signals | null) => void;
};

export type RunningService = {
  endpoint: string;
  controlToken: string;
  readiness: ServiceReadiness;
};

export class ServiceSupervisor {
  readonly #options: ServiceSupervisorOptions;
  #child: ChildProcess | undefined;
  #running: RunningService | undefined;
  #output = '';
  #stopping = false;

  constructor(options: ServiceSupervisorOptions) {
    this.#options = options;
  }

  get running(): RunningService | undefined {
    return this.#running;
  }

  async start(): Promise<RunningService> {
    if (this.#running) return this.#running;
    if (this.#child && this.#child.exitCode === null) {
      throw new Error('Standalone service startup is already in progress');
    }
    this.#removeStaleReadiness();
    const controlToken = randomBytes(32).toString('base64url');
    const parentPid = this.#options.parentPid ?? process.pid;
    const child = spawn(this.#options.executable, [this.#options.serviceScript], {
      cwd: this.#options.paths.root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        APIARYLENS_DESKTOP_CONTROL_TOKEN: controlToken,
        APIARYLENS_DESKTOP_PARENT_PID: String(parentPid),
        APIARYLENS_DESKTOP_INSTANCE: `ApiaryLens-${randomUUID()}`,
        APIARYLENS_DESKTOP_READY_FILE: this.#options.paths.readiness,
        APIARYLENS_DESKTOP_WEB_ROOT: this.#options.webRoot,
        APIARYLENS_DATABASE: this.#options.paths.database,
        APIARYLENS_MEDIA: this.#options.paths.media,
        APIARYLENS_AUTH_ROOT_SECRET: this.#options.secrets.authRootSecret,
        APIARYLENS_BOOTSTRAP_TOKEN: this.#options.secrets.bootstrapToken,
      },
    });
    this.#child = child;
    this.#output = '';
    child.stdout?.on('data', (chunk: Buffer) => this.#captureOutput(chunk));
    child.stderr?.on('data', (chunk: Buffer) => this.#captureOutput(chunk));
    child.once('exit', (exitCode, signal) => {
      const wasRunning = Boolean(this.#running);
      this.#running = undefined;
      if (wasRunning && !this.#stopping) this.#options.onUnexpectedExit?.(exitCode, signal);
    });

    const timeout = this.#options.startupTimeoutMs ?? 15_000;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`Standalone service exited before readiness (${child.exitCode})`);
      }
      if (existsSync(this.#options.paths.readiness) && child.pid) {
        const parsed: unknown = JSON.parse(readFileSync(this.#options.paths.readiness, 'utf8'));
        const readiness = parseServiceReadiness(parsed, child.pid);
        this.#running = {
          endpoint: `http://127.0.0.1:${readiness.port}`,
          controlToken,
          readiness,
        };
        return this.#running;
      }
      await delay(50);
    }
    child.kill('SIGKILL');
    throw new Error('Standalone service readiness timed out');
  }

  async stop(): Promise<void> {
    if (this.#stopping) return;
    this.#stopping = true;
    const child = this.#child;
    const running = this.#running;
    this.#running = undefined;
    try {
      if (!child || child.exitCode !== null) return;
      if (running) {
        try {
          await fetch(`${running.endpoint}/__desktop/shutdown`, {
            method: 'POST',
            headers: { 'x-apiarylens-desktop-control': running.controlToken },
            signal: AbortSignal.timeout(2_000),
          });
        } catch {
          // The host still owns the process and applies the bounded kill below.
        }
      }
      for (let attempt = 0; attempt < 40 && child.exitCode === null; attempt += 1) {
        await delay(50);
      }
      if (child.exitCode === null) {
        child.kill('SIGKILL');
        for (let attempt = 0; attempt < 40 && child.exitCode === null; attempt += 1) {
          await delay(50);
        }
        if (child.exitCode === null) throw new Error('Standalone service survived forced shutdown');
      }
    } finally {
      rmSync(this.#options.paths.readiness, { force: true });
      this.#child = undefined;
      this.#stopping = false;
    }
  }

  #captureOutput(chunk: Buffer): void {
    // Output is bounded and never includes the environment-only control/auth secrets.
    this.#output = `${this.#output}${chunk.toString('utf8')}`.slice(-16_384);
  }

  #removeStaleReadiness(): void {
    const path = this.#options.paths.readiness;
    if (!existsSync(path)) return;
    let priorPid: number | undefined;
    try {
      const value = JSON.parse(readFileSync(path, 'utf8')) as { pid?: unknown };
      if (Number.isSafeInteger(value.pid)) priorPid = Number(value.pid);
    } catch {
      // Invalid readiness never authorizes reuse.
    }
    if (priorPid) {
      try {
        process.kill(priorPid, 0);
        throw new Error(`An active standalone service already owns ${basename(path)}`);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('An active standalone service')) {
          throw error;
        }
      }
    }
    rmSync(path, { force: true });
  }
}
