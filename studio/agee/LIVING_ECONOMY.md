# Living Economy and Trade Network

**Status:** NOT IMPLEMENTED in 3D (registry G12). The 2.5D economy exists and is the extraction source. This file is the design + the honest state record.
**Directive:** SOUL.md §58 section 6 ("CREATE A LIVING ECONOMY AND TRADE NETWORK").

## What it is

A living economy is one where prices, stock, and trade respond to what is actually happening in the world — not a fixed price list. A shop's prices rise when its supply is cut. A merchant travels because a road is safe and a town needs goods. A player who floods the market with wood drives the price of wood down. The economy is a system the player participates in, not a menu they open.

## The current state (honest)

| Piece | Status | Evidence |
|---|---|---|
| Economy / shops in 3D | NOT IMPLEMENTED (G12) | Zero `shops` / `settlementEconomy` / `bankBalance` references in `engine3d/`. |
| Inn / store / blacksmith in 3D | Buildings only, no mechanics | They are `HOUSE_VARIANTS` entries only (visual: inn sign, smith wide chimney, store awning/crates — `townLook.ts:238–245`, `Engine3DWorldView.tsx:909–940`). The user explicitly deferred mechanics: "we will code mechanics later" (2026-11-06). Do NOT build shop mechanics for them until the user orders it. |
| Gold in 3D | Bare inventory counter | `inventory.gold`, HUD line "Wood · Stone · Gold". The **only** gold source in 3D is looting a dead NPC (+5). There is no shop, no trade, no wage, no quest reward in gold. |
| 2.5D economy | Exists, 2D-only, B-class reusable logic | `src/game/shops.ts`, `settlementEconomy.ts`, `playerBank.ts` (2D-only). The physical Mosslight Bank exists in 2.5D (BUILD 982: rect [114.802,214.952,124.468,222.267], door `mosslight-bank-door`, Brand split hours). These are the extraction sources. |
| Halicin (1010) | Shipped in 2.5D | Bram the guild smith sells Halicin, a rare curative draught, for 150 gold. Full-HP restore. This is a 2.5D shop transaction — it proves the shop system works in 2.5D, and it is the model for a 3D shop when the time comes. |
| Gathering in 3D | Resources only, no XP, no economy | E on a tree +2 wood, on a rock +1 stone, on a crate +1 wood. Wood has NO sink in 3D (the Build palette is free). Stone has no sink either. There is nothing to sell wood or stone to. |

## How a living economy works (the design, when it is ordered)

1. **Shops with real stock.** A shop has an inventory that is actually stocked, actually depletes when the player buys, and actually replenishes (by restocking from a supplier, or by the shopkeeper buying from the player). A shop that never runs out and never restocks is a menu, not an economy.
2. **Prices from supply and demand.** A price is a function of how much of a good exists and how much is wanted. If the player sells 100 wood to the store, the price of wood falls. If a road is unsafe and no merchant arrives, prices rise. The 2.5D `settlementEconomy.ts` is the extraction source for the pricing model.
3. **Trade routes.** Merchants travel between settlements on roads. A trade route is a real path an NPC walks (the 3D transient system already walks roads — `transients.ts`, max 5 travellers + 3 adventurers). A merchant who is killed or scared off does not arrive, and the destination's prices reflect that.
4. **Gold with real sources and sinks.** Gold enters the economy from quests, trade, wages, and loot; it leaves through shops, services, taxes, and repairs. A gold counter that only grows (the current 3D state: the only source is looting dead NPCs, +5 each, with no sink) is not an economy.
5. **NPC participation.** NPCs buy and sell too. An NPC who loses their job cannot afford normal food and changes their shopping behavior; the shop's inventory changes; rumors spread; the player encounters the NPC and can help. That is the emergent gameplay example from SOUL.md §20 — and it only works if the economy is real.

## What the economy does NOT do (until ordered)

- **It does not build shop mechanics for the inn/store/smith.** The user explicitly deferred those mechanics ("we will code mechanics later", 2026-11-06). The buildings stay shells until the user orders otherwise. This file records the design; it does not authorize the build.
- **It does not invent a crafting system.** There is no crafting in the game. Gathered resources (wood, stone) do not feed crafting because crafting does not exist — the honesty rule is explicit: never invent a crafting/fishing/mining system when the underlying gameplay does not exist yet. Leave that integration explicitly pending.
- **It does not award XP for trading.** Trading is an action; XP (when the skills system exists in 3D — G14 NOT IMPLEMENTED) comes from real successful actions, never from opening a shop menu or clicking a buy button.
- **It does not copy bounty into faction standing or vice versa.** They are separate buckets (builds 926/939). A fine is not a relationship change, and a relationship is not a fine.
