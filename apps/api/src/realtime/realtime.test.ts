import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  SOCKET_AUTH_ERROR,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketAck,
} from '@arbiter/shared';
import type { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetTables, setupTestDatabase } from '../../test/db';
import { createContest, createProblem, createSubmission, createUser } from '../../test/factories';
import { env } from '../config/env';
import { signAccessToken } from '../lib/jwt';
import { emitter } from './emitter';
import { initRealtime, type RealtimeServer } from './io';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let prisma: PrismaClient;
let httpServer: HttpServer;
let realtime: RealtimeServer;
let url: string;
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
  httpServer = createServer();
  realtime = initRealtime(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.disconnect();
});

afterAll(async () => {
  await realtime.close();
});

function open(token?: string): ClientSocket {
  const socket: ClientSocket = connect(url, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: token ? { token } : {},
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  return socket;
}

function connected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
}

/**
 * Emits through the Redis emitter until the client receives the event: the adapter's subscriber
 * connection may still be subscribing right after startup.
 */
async function deliver<T>(
  socket: ClientSocket,
  event: keyof ServerToClientEvents,
  send: () => void,
) {
  return new Promise<T>((resolve, reject) => {
    const timer = setInterval(send, 100);
    const timeout = setTimeout(() => {
      clearInterval(timer);
      reject(new Error(`${event} not received`));
    }, 5000);
    socket.once(event, ((payload: T) => {
      clearInterval(timer);
      clearTimeout(timeout);
      resolve(payload);
    }) as never);
    send();
  });
}

const ackOf = (send: (ack: (result: SocketAck) => void) => void) =>
  new Promise<SocketAck>((resolve) => send(resolve));

describe('realtime', () => {
  it('guests can join the feed and receive feed:judged from the emitter', async () => {
    const socket = open();
    await connected(socket);
    expect(await ackOf((ack) => socket.emit('feed:subscribe', ack))).toEqual({ ok: true });

    const event = {
      username: 'ada',
      problemSlug: 'sum',
      problemTitle: 'Sum',
      language: 'CPP' as const,
      verdict: 'AC' as const,
      timeMs: 12,
      at: new Date().toISOString(),
    };
    const received = await deliver(socket, 'feed:judged', () => emitter.emitFeedJudged(event));
    expect(received).toEqual(event);
    expect(await ackOf((ack) => socket.emit('feed:unsubscribe', ack))).toEqual({ ok: true });
  });

  it('rejects an invalid handshake token with connect_error UNAUTHORIZED', async () => {
    const socket = open('not-a-valid-token');
    await expect(connected(socket)).rejects.toMatchObject({ message: SOCKET_AUTH_ERROR });
  });

  it('submission rooms: owner or admin only; status and done events reach the owner', async () => {
    const owner = await createUser(prisma);
    const stranger = await createUser(prisma);
    const admin = await createUser(prisma, { role: 'ADMIN' });
    const problem = await createProblem(prisma);
    const submission = await createSubmission(prisma, { userId: owner.id, problemId: problem.id });

    const ownerSocket = open(signAccessToken(owner));
    const strangerSocket = open(signAccessToken(stranger));
    const adminSocket = open(signAccessToken(admin));
    const guestSocket = open();
    await Promise.all([ownerSocket, strangerSocket, adminSocket, guestSocket].map(connected));

    const subscribe = (socket: ClientSocket, id: string) =>
      ackOf((ack) => socket.emit('submission:subscribe', { id }, ack));
    expect(await subscribe(ownerSocket, submission.id)).toEqual({ ok: true });
    expect(await subscribe(adminSocket, submission.id)).toEqual({ ok: true });
    expect(await subscribe(strangerSocket, submission.id)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await subscribe(guestSocket, submission.id)).toEqual({
      ok: false,
      error: 'UNAUTHORIZED',
    });
    expect(await subscribe(ownerSocket, 'missing-id')).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await ackOf((ack) => ownerSocket.emit('submission:subscribe', { id: '' }, ack))).toEqual(
      { ok: false, error: 'VALIDATION_ERROR' },
    );

    const status = { id: submission.id, status: 'RUNNING' as const, testsDone: 1, testsTotal: 5 };
    expect(
      await deliver(ownerSocket, 'submission:status', () => emitter.emitSubmissionStatus(status)),
    ).toEqual(status);

    // submission:done also goes to user:<ownerId>, which every authenticated socket joins.
    expect(
      await ackOf((ack) => ownerSocket.emit('submission:unsubscribe', { id: submission.id }, ack)),
    ).toEqual({ ok: true });
    const done = {
      id: submission.id,
      status: 'DONE' as const,
      verdict: 'AC' as const,
      timeMs: 15,
      memoryKb: 3000,
      testsPassed: 5,
      testsTotal: 5,
    };
    expect(
      await deliver(ownerSocket, 'submission:done', () =>
        emitter.emitSubmissionDone(done, owner.id),
      ),
    ).toEqual(done);
  });

  it('submission status, test and done events and scoreboard rows reach nobody but their rooms', async () => {
    const owner = await createUser(prisma);
    const stranger = await createUser(prisma);
    const admin = await createUser(prisma, { role: 'ADMIN' });
    const problem = await createProblem(prisma);
    const submission = await createSubmission(prisma, { userId: owner.id, problemId: problem.id });
    const contest = await createContest(prisma);

    const ownerSocket = open(signAccessToken(owner));
    const strangerSocket = open(signAccessToken(stranger));
    const adminSocket = open(signAccessToken(admin)); // an admin who did not subscribe
    const feedGuest = open();
    const idleGuest = open();
    const others = [strangerSocket, adminSocket, feedGuest, idleGuest];
    await Promise.all([ownerSocket, ...others].map(connected));
    const heard: string[] = [];
    for (const socket of others) socket.onAny((event) => heard.push(event));
    expect(await ackOf((ack) => ownerSocket.emit('feed:subscribe', ack))).toEqual({ ok: true });
    expect(await ackOf((ack) => feedGuest.emit('feed:subscribe', ack))).toEqual({ ok: true });
    expect(
      await ackOf((ack) => ownerSocket.emit('submission:subscribe', { id: submission.id }, ack)),
    ).toEqual({ ok: true });

    await deliver(ownerSocket, 'submission:status', () =>
      emitter.emitSubmissionStatus({
        id: submission.id,
        status: 'RUNNING',
        testsDone: 1,
        testsTotal: 5,
      }),
    );
    await deliver(ownerSocket, 'submission:test', () =>
      emitter.emitSubmissionTest({
        id: submission.id,
        ordinal: 1,
        verdict: 'AC',
        timeMs: 5,
        memoryKb: 2000,
        isSample: false,
      }),
    );
    await deliver(ownerSocket, 'submission:done', () =>
      emitter.emitSubmissionDone(
        {
          id: submission.id,
          status: 'DONE',
          verdict: 'AC',
          timeMs: 5,
          memoryKb: 2000,
          testsPassed: 5,
          testsTotal: 5,
        },
        owner.id,
      ),
    );
    emitter.emitScoreboardRow(contest.id, {
      contestSlug: contest.slug,
      row: { rank: 1, username: 'ada', rating: 1500, solved: 0, penalty: 0, cells: [] },
    });
    // Delivery to the owner is done; give a wrongly routed event time to reach the others.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(heard).toEqual([]);
  });

  it('a demoted admin (stale ADMIN token) cannot subscribe to other users submissions', async () => {
    const owner = await createUser(prisma);
    const formerAdmin = await createUser(prisma, { role: 'ADMIN' });
    const problem = await createProblem(prisma);
    const submission = await createSubmission(prisma, { userId: owner.id, problemId: problem.id });
    const hidden = await createContest(prisma, { isPublished: false });
    const staleToken = signAccessToken(formerAdmin); // minted while still an admin
    await prisma.user.update({ where: { id: formerAdmin.id }, data: { role: 'USER' } });

    const socket = open(staleToken);
    await connected(socket);
    expect(
      await ackOf((ack) => socket.emit('submission:subscribe', { id: submission.id }, ack)),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(
      await ackOf((ack) => socket.emit('contest:subscribe', { slug: hidden.slug }, ack)),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('disconnects a socket when its access token expires; guests are unaffected', async () => {
    const user = await createUser(prisma);
    const shortLived = jwt.sign(
      { role: user.role, username: user.username },
      env.JWT_ACCESS_SECRET,
      {
        algorithm: 'HS256',
        subject: user.id,
        expiresIn: 1,
      },
    );
    const authed = open(shortLived);
    const guest = open();
    await Promise.all([connected(authed), connected(guest)]);
    const reason = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('still connected after expiry')), 4000);
      authed.once('disconnect', (why) => {
        clearTimeout(timer);
        resolve(why);
      });
    });
    expect(reason).toBe('io server disconnect');
    expect(guest.connected).toBe(true);
  });

  it('contest rooms are joined by slug and carry scoreboard rows', async () => {
    const contest = await createContest(prisma);
    const hidden = await createContest(prisma, { isPublished: false });
    const socket = open();
    await connected(socket);

    expect(
      await ackOf((ack) => socket.emit('contest:subscribe', { slug: 'no-such-contest' }, ack)),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(
      await ackOf((ack) => socket.emit('contest:subscribe', { slug: hidden.slug }, ack)),
    ).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(
      await ackOf((ack) => socket.emit('contest:subscribe', { slug: contest.slug }, ack)),
    ).toEqual({ ok: true });

    const payload = {
      contestSlug: contest.slug,
      row: {
        rank: 1,
        username: 'ada',
        rating: 1500,
        solved: 1,
        penalty: 20,
        cells: [
          { label: 'A', solved: true, attempts: 1, acMinute: 20, firstSolve: true, pending: false },
        ],
      },
    };
    expect(
      await deliver(socket, 'scoreboard:row', () => emitter.emitScoreboardRow(contest.id, payload)),
    ).toEqual(payload);
    expect(
      await ackOf((ack) => socket.emit('contest:unsubscribe', { slug: contest.slug }, ack)),
    ).toEqual({ ok: true });
  });

  it('throttles a socket that floods events: RATE_LIMITED acks, then a disconnect', async () => {
    const socket = open();
    await connected(socket);
    const acks: SocketAck[] = [];
    const closed = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
    for (let i = 0; i < 300; i += 1) {
      socket.emit('contest:subscribe', { slug: 'no-such-contest' }, (ack) => acks.push(ack));
    }
    await closed;
    const limited = acks.filter((ack) => !ack.ok && ack.error === 'RATE_LIMITED');
    const served = acks.filter((ack) => !(!ack.ok && ack.error === 'RATE_LIMITED'));
    expect(limited.length).toBeGreaterThan(0);
    expect(served.length).toBeLessThanOrEqual(40);
  });

  it('normal use is not throttled: a few subscribes at once all succeed', async () => {
    const socket = open();
    await connected(socket);
    const acks = await Promise.all(
      Array.from({ length: 8 }, () => ackOf((ack) => socket.emit('feed:subscribe', ack))),
    );
    expect(acks).toEqual(Array.from({ length: 8 }, () => ({ ok: true })));
  });

  it('the emitter rejects payloads that do not match the shared schema', () => {
    expect(() =>
      emitter.emitSubmissionStatus({
        id: 'x',
        status: 'NOPE',
        testsDone: 0,
        testsTotal: 0,
      } as never),
    ).toThrow();
  });
});
