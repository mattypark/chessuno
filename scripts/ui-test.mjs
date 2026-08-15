/**
 * Drives the real UI in a real browser: two independent contexts, so each page
 * gets its own localStorage and therefore its own seat, exactly like two people.
 *
 *   node scripts/ui-test.mjs [baseUrl] [--headed]
 *
 * Everything here goes through clicks. If a card cannot be clicked, or a square
 * does not respond, or an error banner appears, this fails — which is the whole
 * point, since the rules tests cannot see any of that.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3002";
const HEADED = process.argv.includes("--headed");
// --quick stops after the opening screenshots, for iterating on visuals.
const QUICK = process.argv.includes("--quick");
const SHOTS = "test-artifacts";
const MAX_TURNS = 60;

mkdirSync(SHOTS, { recursive: true });

const failures = [];
function check(condition, label) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    console.log(`  FAIL  ${label}`);
    failures.push(label);
  }
}

const browser = await chromium.launch({ headless: !HEADED });
const shot = async (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

/** Reads the state the UI is actually showing, rather than trusting the server. */
async function readUi(page) {
  return page.evaluate(() => {
    const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
    // Scoped to the hand: the discard pile renders the same card component.
    const cards = [...document.querySelectorAll('[data-testid="hand"] [data-testid="card"]')].map(
      (el) => ({
        id: el.dataset.cardId,
        kind: el.dataset.cardKind,
        playable: el.dataset.playable === "true",
      }),
    );
    return {
      waiting: Boolean(document.querySelector('[data-testid="waiting"]')),
      status: text('[data-testid="status"]'),
      error: text('[data-testid="error"]'),
      cards,
      movable: [...document.querySelectorAll('[data-movable="true"]')].map((el) => el.dataset.square),
      targets: [...document.querySelectorAll('[data-target="true"]')].map((el) => el.dataset.square),
      handCount: cards.length,
    };
  });
}

const settle = (page) => page.waitForTimeout(320);

try {
  console.log(`chessuno UI test against ${BASE}\n`);

  const contextA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const a = await contextA.newPage();
  const b = await contextB.newPage();

  const consoleErrors = [];
  const transportWarnings = [];
  // Websocket churn is the transport reconnecting, not an application fault — and
  // a connection that genuinely stayed down would fail the gameplay checks above
  // long before it got here. Recorded, but not counted as a failure.
  const isTransportNoise = (text) => /WebSocket (is already in|connection to)/.test(text);
  const record = (text) => (isTransportNoise(text) ? transportWarnings : consoleErrors).push(text);
  for (const page of [a, b]) {
    page.on("console", (m) => m.type() === "error" && record(m.text()));
    page.on("pageerror", (e) => record(String(e)));
  }

  console.log("lobby");
  await a.goto(BASE);
  await a.click('[data-testid="create-game"]');
  await a.waitForURL(/\/game\/[A-Z0-9]{4}/, { timeout: 15000 });
  const code = new URL(a.url()).pathname.split("/").pop();
  check(Boolean(code), `created room ${code}`);
  await shot(a, "01-lobby-created");

  console.log("\nwaiting room");
  await a.waitForSelector('[data-testid="waiting"]', { timeout: 10000 });
  const solo = await readUi(a);
  check(solo.waiting, "one player sees a waiting screen, not a live board");
  check(solo.cards.length === 0, "no cards are dealt into view before an opponent joins");
  await shot(a, "02-waiting");

  console.log("\nsecond player joins");
  await b.goto(`${BASE}/game/${code}`);
  // Wait for the dealt hand, not just the status line — the waiting screen swaps
  // out a beat before the cards land.
  await a.waitForSelector('[data-testid="card"]', { timeout: 20000 });
  await b.waitForSelector('[data-testid="card"]', { timeout: 20000 });
  await settle(a);

  const startA = await readUi(a);
  const startB = await readUi(b);
  check(
    startA.handCount === 7 && startB.handCount === 7,
    `both players are dealt 7 cards (saw ${startA.handCount} and ${startB.handCount})`,
  );
  check(
    [startA.status, startB.status].filter((s) => s?.includes("Your turn")).length === 1,
    "exactly one player is on the move",
  );
  await shot(a, "03-game-start-p1");
  await shot(b, "03-game-start-p2");

  if (QUICK) {
    console.log("\nquick mode — stopping after the opening screenshots");
  }

  console.log("\nplaying a full game through the UI");
  let turns = 0;
  let cardsPlayed = 0;
  let movesMade = 0;
  let finished = null;

  let stalls = 0;

  while (!QUICK && turns < MAX_TURNS && stalls < 25) {
    const states = [await readUi(a), await readUi(b)];

    const over = states.find(
      (s) => s.status && /win|lose|Drawn/.test(s.status),
    );
    if (over) {
      finished = over.status;
      break;
    }

    // Both pages re-render independently over the websocket, so for a moment
    // after a turn flips they can both claim it. Acting on a stale page means
    // clicking controls that are already disabled, so wait for the ambiguity to
    // clear rather than guessing.
    const candidates = states
      .map((s, i) => [s, i])
      .filter(([s]) => s.status && !s.status.includes("Their turn"));
    if (candidates.length !== 1) {
      stalls++;
      await settle(a);
      continue;
    }
    stalls = 0;

    const [ui, index] = candidates[0];
    const page = index === 0 ? a : b;

    if (ui.error) {
      check(false, `no error banner during normal play (saw: "${ui.error}")`);
      await shot(page, "99-error");
      break;
    }

    const playable = ui.cards.filter((c) => c.playable);

    if (playable.length > 0) {
      const card = playable[0];
      await page.click(`[data-card-id="${card.id}"]`);
      await settle(page);

      // A wild needs a colour before it resolves.
      if (card.kind === "wild" || card.kind === "wild4") {
        await page.click('button[aria-label="green"]');
        await settle(page);
      }
      cardsPlayed++;
      continue;
    }

    if (ui.movable.length > 0) {
      await page.click(`[data-square="${ui.movable[0]}"]`);
      await settle(page);

      const withTargets = await readUi(page);
      check(withTargets.targets.length > 0, `selecting ${ui.movable[0]} reveals its legal squares`);
      if (withTargets.targets.length === 0) {
        await shot(page, "98-no-targets");
        break;
      }

      await page.click(`[data-square="${withTargets.targets[0]}"]`);
      await settle(page);

      const afterMove = await readUi(page);
      if (afterMove.error) {
        check(false, `a move through the UI was rejected: "${afterMove.error}"`);
        await shot(page, "97-move-rejected");
        break;
      }
      movesMade++;
      if (movesMade === 1) await shot(page, "04-after-first-move");
      continue;
    }

    // Nothing playable and nothing to move: draw, or hand the turn over. Both
    // buttons are checked rather than assumed — a disabled one here means the
    // page was stale, not that the game is stuck.
    if (await page.isEnabled('[data-testid="draw"]')) {
      await page.click('[data-testid="draw"]');
    } else if (await page.isEnabled('[data-testid="end-turn"]')) {
      await page.click('[data-testid="end-turn"]');
      turns++;
    } else {
      stalls++;
    }
    await settle(page);
  }

  if (!QUICK) {
    check(cardsPlayed > 0, `cards were played through the UI (${cardsPlayed})`);
    check(movesMade > 0, `pieces were moved through the UI (${movesMade})`);
  }
  await shot(a, "05-final-p1");
  await shot(b, "05-final-p2");
  console.log(`\n  played ${cardsPlayed} cards and ${movesMade} moves${finished ? ` — ${finished}` : ""}`);

  console.log("\nresponsive");
  for (const [name, viewport] of [
    ["375", { width: 375, height: 812 }],
    ["768", { width: 768, height: 1024 }],
    ["1440", { width: 1440, height: 900 }],
  ]) {
    await a.setViewportSize(viewport);
    await settle(a);
    const overflows = await a.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    check(!overflows, `no horizontal overflow at ${name}px`);
    await shot(a, `06-viewport-${name}`);
  }

  check(consoleErrors.length === 0, `no console errors (${consoleErrors.length})`);
  consoleErrors.slice(0, 5).forEach((e) => console.log(`        ${e.slice(0, 140)}`));
  if (transportWarnings.length > 0) {
    console.log(`  note  ${transportWarnings.length} websocket reconnect message(s), not counted`);
  }

  await contextA.close();
  await contextB.close();
} finally {
  await browser.close();
}

console.log(
  failures.length === 0
    ? `\nall checks passed — screenshots in ${SHOTS}/`
    : `\n${failures.length} FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
