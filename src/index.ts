import type { WorkerEnv, CaptureRequest } from './types';
import { checkBearerToken } from './auth';
import { handleCapture } from './capture';
import { runDigest } from './digestWorker';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'POST' && url.pathname === '/capture') {
      if (!checkBearerToken(req, env.SHORTCUT_BEARER_TOKEN)) {
        return json({ success: false, error: 'unauthorized' }, 401);
      }
      let body: CaptureRequest;
      try {
        body = (await req.json()) as CaptureRequest;
      } catch {
        return json({ success: false, error: 'invalid JSON' }, 400);
      }
      const result = await handleCapture(body, env);
      return json(result, result.success ? 200 : 500);
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: WorkerEnv): Promise<void> {
    await runDigest(env);
  },
};
