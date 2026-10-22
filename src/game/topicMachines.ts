// BUILD 970: extras 2/6 — keyword-topic NPC state machines.
//
// Tibia pattern, rules only, original code: an NPC conversation is a small
// state machine, not a tree — one focus at a time, a per-conversation topic
// state, and consent as a STATE (DEPOSIT_GOLD → DEPOSIT_CONSENT), not a
// second dialog. The portable form for this game:
// - Tap choices, not typed words, drive the machine (the phone game has no
//   typed topic chat) — EXCEPT the free-text box, which matches bank
//   keywords with a word-boundary guard (Tibia's msgcontains rule) and
//   opens the bank machine on the clerk.
// - Focus: one machine per conversation. Closing the conversation (Goodbye,
//   ✕, NPC death) releases focus and throws the machine away — including
//   any pending transaction, exactly like Tibia clearing pending shop
//   state on focus release. Machine state is NEVER saved.
// - Consent: a consequential effect (coins or items moving) is emitted
//   ONLY from a consent step on an explicit 'yes' choice. Every other
//   step emits nothing, and 'no' returns to the menu without an effect.
//   This is asserted as a property over all steps × choices, not trusted
//   to code review.
// - Grounded lines (BUILD 956 rule): every machine line reads live state
//   — real balances, real item names, real relationship records. No
//   invented lore, no invented facts about any NPC.
//
// Machines on this engine:
// - 'bank': the depot service (playerBank.ts) — deposit coins, withdraw
//   coins, store an item, take a stored item. Each flow is its own
//   ask → consent chain, sharing the one engine.
// - 'kin': ask about a family member — choices are the NPC's real family
//   relations (same-homeKey housemates, the game's own relationship
//   rule), lines read the real affinity. No effect exists for kin: there
//   is no consequential action, so no consent step is needed, and none
//   is faked. The machine still proves the engine is not bank-specific.
//
// Purity: every function here is pure. The App owns inventory/bank state
// and applies effects; this module only decides what the machine says,
// what choices it offers, and which effect (if any) a choice emits.

export type MachineId = 'bank' | 'kin';

export interface MachineChoice {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface MachineView {
  say: string;
  choices: MachineChoice[];
}

/** A consequential effect, emitted ONLY from a consent step on 'yes'. */
export type MachineEffect =
  | { kind: 'depositCoins'; amount: number }
  | { kind: 'withdrawCoins'; amount: number }
  | { kind: 'storeItem'; instanceId: string }
  | { kind: 'takeItem'; instanceId: string }
  | null;

/** What a machine may need to know: balances, gear, relations. All live. */
export interface MachineCtx {
  /** Spendable gold (inventory coins minus any shop reserve). */
  purse: number;
  bankCoins: number;
  equipment: Array<{ instanceId: string; name: string; slot: string }>;
  stored: Array<{ instanceId: string; name: string; slot: string }>;
  /** Relationship records, highest affinity first (npcRelationships). */
  relations: Array<{ targetName: string; kind: string; affinity: number }>;
}

/**
 * Per-conversation machine state. Transient — never saved, never loaded.
 * `pending` holds a transaction awaiting consent; `detail` holds the kin
 * member being discussed. Closing the conversation discards all of it.
 */
export interface MachineSession {
  machine: MachineId;
  step: string;
  pending: {
    kind: 'depositCoins' | 'withdrawCoins' | 'storeItem' | 'takeItem';
    amount?: number;
    instanceId?: string;
    name?: string;
  } | null;
  detail: string | null;
}

const LEAVE: MachineChoice = { id: 'leave', label: 'Leave' };
const BACK: MachineChoice = { id: 'back', label: '← Back' };

/** Family relations only — the kin machine asks about relatives, not rivals. */
export function familyRelations(ctx: MachineCtx): Array<{ targetName: string; affinity: number }> {
  return ctx.relations.filter((r) => r.kind === 'family');
}

/** Affinity wording for a kin line — bands over the real affinity value. */
export function affinityBand(affinity: number): string {
  if (affinity >= 80) return 'You two are inseparable — family through and through.';
  if (affinity >= 60) return "You're close; family looks after its own.";
  if (affinity >= 0) return 'Family is family, through good days and bad.';
  return 'Family is family, even when it is complicated.';
}

/**
 * Free-text bank keyword match, with Tibia's word-boundary guard: the
 * keyword must appear as its own word, not inside a longer word ('banker'
 * does not match, 'bank' does). Used by the dialogue free-text box to
 * open the bank machine on the clerk.
 */
export function bankKeywordIntent(text: string): boolean {
  if (typeof text !== 'string') return false;
  return /\b(bank|deposit|withdraw|vault|store|depot)\b/i.test(text);
}

function bankMenuView(ctx: MachineCtx): MachineView {
  const storedCount = ctx.stored.length;
  return {
    say: `Welcome to the Mosslight bank. Your balance is ${ctx.bankCoins} gold, and ${storedCount} item${storedCount === 1 ? '' : 's'} of yours rest${storedCount === 1 ? 's' : ''} in the vault. What would you like to do?`,
    choices: [
      { id: 'deposit-coins', label: 'Deposit coins' },
      { id: 'withdraw-coins', label: 'Withdraw coins' },
      { id: 'store-item', label: 'Store an item' },
      { id: 'take-item', label: 'Take a stored item' },
      LEAVE,
    ],
  };
}

function amountChoices(kind: 'dep' | 'wd', available: number): MachineChoice[] {
  return [
    { id: `${kind}-10`, label: '10 gold', disabled: available < 10 },
    { id: `${kind}-50`, label: '50 gold', disabled: available < 50 },
    { id: `${kind}-all`, label: `All (${available})`, disabled: available <= 0 },
    BACK,
  ];
}

/** The view for a session step, derived from live ctx every render. */
export function machineView(session: MachineSession, ctx: MachineCtx): MachineView {
  if (session.machine === 'kin') {
    const family = familyRelations(ctx);
    if (session.step === 'kinDetail' && session.detail) {
      const rel = family.find((r) => r.targetName === session.detail);
      if (!rel) return kinMenuView(ctx);
      return {
        say: `${rel.targetName} is family. ${affinityBand(rel.affinity)}`,
        choices: [
          { id: 'kin-menu', label: 'Ask about someone else' },
          LEAVE,
        ],
      };
    }
    return kinMenuView(ctx);
  }
  const pending = session.pending;
  switch (session.step) {
    case 'menu':
      return bankMenuView(ctx);
    case 'depositAmount':
      return {
        say: `You carry ${ctx.purse} spendable gold. How much will you deposit?`,
        choices: amountChoices('dep', ctx.purse),
      };
    case 'depositConsent':
      return {
        say: `Deposit ${pending?.amount ?? 0} gold? It will wait in the vault until you ask for it back.`,
        choices: [
          { id: 'yes', label: 'Yes, deposit it' },
          { id: 'no', label: 'No, never mind' },
        ],
      };
    case 'withdrawAmount':
      return {
        say: `The vault holds ${ctx.bankCoins} gold. How much will you withdraw?`,
        choices: amountChoices('wd', ctx.bankCoins),
      };
    case 'withdrawConsent':
      return {
        say: `Withdraw ${pending?.amount ?? 0} gold?`,
        choices: [
          { id: 'yes', label: 'Yes, withdraw it' },
          { id: 'no', label: 'No, never mind' },
        ],
      };
    case 'storePick':
      if (ctx.equipment.length === 0) {
        return {
          say: 'You carry no loose gear to store — your pack holds only coins and sundries.',
          choices: [BACK],
        };
      }
      return {
        say: 'Which item will you store? It comes back unequipped, ready to wear again.',
        choices: [
          ...ctx.equipment.map((item) => ({ id: `store:${item.instanceId}`, label: `${item.name} (${item.slot})` })),
          BACK,
        ],
      };
    case 'storeConsent':
      return {
        say: `Store ${pending?.name ?? 'that item'} in the vault? You can take it back any time.`,
        choices: [
          { id: 'yes', label: 'Yes, store it' },
          { id: 'no', label: 'No, never mind' },
        ],
      };
    case 'takePick':
      if (ctx.stored.length === 0) {
        return {
          say: 'The vault holds no items of yours.',
          choices: [BACK],
        };
      }
      return {
        say: 'Which stored item will you take back?',
        choices: [
          ...ctx.stored.map((item) => ({ id: `take:${item.instanceId}`, label: `${item.name} (${item.slot})` })),
          BACK,
        ],
      };
    case 'takeConsent':
      return {
        say: `Take ${pending?.name ?? 'that item'} back? It returns unequipped — wear it from the Equipment tab.`,
        choices: [
          { id: 'yes', label: 'Yes, take it back' },
          { id: 'no', label: 'No, never mind' },
        ],
      };
    case 'done':
      return {
        say: `Done. Your balance is ${ctx.bankCoins} gold.`,
        choices: [
          { id: 'menu', label: 'Back to banking' },
          LEAVE,
        ],
      };
    default:
      return bankMenuView(ctx);
  }
}

function kinMenuView(ctx: MachineCtx): MachineView {
  const family = familyRelations(ctx);
  if (family.length === 0) {
    return {
      say: 'I have no family here to tell you about.',
      choices: [LEAVE],
    };
  }
  return {
    say: 'My family? Ask about any of them.',
    choices: [
      ...family.map((rel) => ({ id: `kin:${rel.targetName}`, label: rel.targetName })),
      LEAVE,
    ],
  };
}

/** Fresh machine session + its opening view. */
export function startMachine(machine: MachineId, ctx: MachineCtx): { session: MachineSession; view: MachineView } {
  const session: MachineSession = {
    machine,
    step: machine === 'kin' ? 'kinMenu' : 'menu',
    pending: null,
    detail: null,
  };
  return { session, view: machineView(session, ctx) };
}

/**
 * Advance a machine by one choice. Returns the next session (null when the
 * machine closes) and the effect to apply (null unless this choice was a
 * consent-step 'yes' with a valid pending transaction — the consent
 * property: no other step × choice in this function emits an effect).
 * Stale choices (amounts beyond the live purse/balance, instanceIds no
 * longer present) are ignored without an effect and without moving.
 */
export function advanceMachine(
  session: MachineSession,
  choiceId: string,
  ctx: MachineCtx,
): { session: MachineSession | null; effect: MachineEffect } {
  const noEffect = (next: MachineSession | null): { session: MachineSession | null; effect: MachineEffect } =>
    ({ session: next, effect: null });
  const at = (step: string, pending: MachineSession['pending'] = null, detail: string | null = null): MachineSession =>
    ({ machine: session.machine, step, pending, detail });

  if (choiceId === 'leave') return noEffect(null);
  if (session.machine === 'kin') {
    if (choiceId === 'kin-menu') return noEffect(at('kinMenu'));
    if (choiceId.startsWith('kin:')) {
      const name = choiceId.slice(4);
      if (!familyRelations(ctx).some((r) => r.targetName === name)) return noEffect(session);
      return noEffect(at('kinDetail', null, name));
    }
    return noEffect(session);
  }

  // Bank machine.
  switch (session.step) {
    case 'menu':
      if (choiceId === 'deposit-coins') return noEffect(at('depositAmount'));
      if (choiceId === 'withdraw-coins') return noEffect(at('withdrawAmount'));
      if (choiceId === 'store-item') return noEffect(at('storePick'));
      if (choiceId === 'take-item') return noEffect(at('takePick'));
      return noEffect(session);
    case 'depositAmount': {
      if (choiceId === 'back') return noEffect(at('menu'));
      const amounts: Record<string, number> = { 'dep-10': 10, 'dep-50': 50, 'dep-all': ctx.purse };
      const amount = amounts[choiceId];
      if (amount === undefined || amount <= 0 || amount > ctx.purse) return noEffect(session);
      return noEffect(at('depositConsent', { kind: 'depositCoins', amount }));
    }
    case 'depositConsent': {
      if (choiceId === 'no') return noEffect(at('menu'));
      if (choiceId === 'yes' && session.pending?.kind === 'depositCoins' && session.pending.amount) {
        const amount = session.pending.amount;
        if (amount <= 0 || amount > ctx.purse) return noEffect(session);
        return { session: at('done'), effect: { kind: 'depositCoins', amount } };
      }
      return noEffect(session);
    }
    case 'withdrawAmount': {
      if (choiceId === 'back') return noEffect(at('menu'));
      const amounts: Record<string, number> = { 'wd-10': 10, 'wd-50': 50, 'wd-all': ctx.bankCoins };
      const amount = amounts[choiceId];
      if (amount === undefined || amount <= 0 || amount > ctx.bankCoins) return noEffect(session);
      return noEffect(at('withdrawConsent', { kind: 'withdrawCoins', amount }));
    }
    case 'withdrawConsent': {
      if (choiceId === 'no') return noEffect(at('menu'));
      if (choiceId === 'yes' && session.pending?.kind === 'withdrawCoins' && session.pending.amount) {
        const amount = session.pending.amount;
        if (amount <= 0 || amount > ctx.bankCoins) return noEffect(session);
        return { session: at('done'), effect: { kind: 'withdrawCoins', amount } };
      }
      return noEffect(session);
    }
    case 'storePick': {
      if (choiceId === 'back') return noEffect(at('menu'));
      if (choiceId.startsWith('store:')) {
        const item = ctx.equipment.find((e) => e.instanceId === choiceId.slice(6));
        if (!item) return noEffect(session);
        return noEffect(at('storeConsent', { kind: 'storeItem', instanceId: item.instanceId, name: item.name }));
      }
      return noEffect(session);
    }
    case 'storeConsent': {
      if (choiceId === 'no') return noEffect(at('menu'));
      if (choiceId === 'yes' && session.pending?.kind === 'storeItem' && session.pending.instanceId) {
        if (!ctx.equipment.some((e) => e.instanceId === session.pending!.instanceId)) return noEffect(session);
        return { session: at('done'), effect: { kind: 'storeItem', instanceId: session.pending.instanceId } };
      }
      return noEffect(session);
    }
    case 'takePick': {
      if (choiceId === 'back') return noEffect(at('menu'));
      if (choiceId.startsWith('take:')) {
        const item = ctx.stored.find((s) => s.instanceId === choiceId.slice(5));
        if (!item) return noEffect(session);
        return noEffect(at('takeConsent', { kind: 'takeItem', instanceId: item.instanceId, name: item.name }));
      }
      return noEffect(session);
    }
    case 'takeConsent': {
      if (choiceId === 'no') return noEffect(at('menu'));
      if (choiceId === 'yes' && session.pending?.kind === 'takeItem' && session.pending.instanceId) {
        if (!ctx.stored.some((s) => s.instanceId === session.pending!.instanceId)) return noEffect(session);
        return { session: at('done'), effect: { kind: 'takeItem', instanceId: session.pending.instanceId } };
      }
      return noEffect(session);
    }
    case 'done':
      if (choiceId === 'menu') return noEffect(at('menu'));
      return noEffect(session);
    default:
      return noEffect(at('menu'));
  }
}
