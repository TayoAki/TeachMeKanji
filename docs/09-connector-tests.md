# Live connector tests: Linear, Notion, RevenueCat

The automated tests run connectors against a local stand-in server (`apps/web/e2e/connectors.spec.ts`).
These tests check the real services with real accounts, on the deployed site. Run them on a
throwaway app (e.g. "A kanji study app with daily flashcards"), not one you care about.

**Cost:** each chat change is charged like any edit (a few credits). "Set up in RevenueCat" reserves
up to 40 credits and is charged what it actually used.

**How a build reads a connector:** only when your message names it. The words that count:

| Connector | Triggers a read | Doesn't |
|---|---|---|
| Linear | "Linear" (capital L), a `linear.app` link, "linear issue/ticket/project/task" | "a linear layout" |
| Notion | "Notion" (capital N), a `notion.so` / `notion.site` link, "notion page/doc/database" | |
| RevenueCat | "RevenueCat", "revenue cat" (any case) | |

While it reads you see the step **Reading Linear** (or Notion, RevenueCat), and the reply ends with
**Read from Linear.** If it couldn't, the reply says why and the change goes ahead without it.

---

## 1. Linear

**Prepare in Linear:** create an issue in any team (note its key, e.g. `ENG-12`):

- Title: `Streak freeze on the Today screen`
- Description:
  ```
  Add a "Streak freeze" card on the Today screen.
  Copy, exactly: heading "Streak freeze", body "Miss a day without losing your streak. 1 left this week.", button "Use freeze".
  Acceptance: tapping "Use freeze" changes the body to "0 left this week." and disables the button.
  ```

| # | Do | Expect |
|---|---|---|
| L1 | Settings → Connectors → Linear → **Connect**, approve on Linear's page | Back in Settings: "Linear connected", badge **Connected** |
| L1b | (Optional) Disconnect, then **Paste a token instead** with a wrong key, then a real Personal API key | Wrong key: "Linear rejected this token." Real key: Connected, labelled "Personal API key" |
| L2 | **Test** | "Works: N tools (…)", with Linear's issue tools (e.g. list/get issue) |
| L3 | In the test app's chat: `Build Linear issue ENG-12` | Step "Reading Linear"; reply ends "Read from Linear."; the Today screen has the card with the exact copy; in the preview, "Use freeze" changes the body and disables the button |
| L4 | Check the issue's history in Linear | L3 changed nothing in Linear (reading never writes) |
| L5 | `Comment on Linear issue ENG-12 with one line on what you changed` | One comment appears on ENG-12; status, assignee and other issues unchanged |
| L6 | New message with the issue's full `https://linear.app/…/issue/ENG-12/…` link: `Make the freeze card match this` | Reads Linear again from the link alone |
| L7 | In Linear, revoke App Builder's access (Settings → Security & access), then **Test** | Test: "Linear rejected the connection: connect it again." A chat message naming Linear still goes ahead, and the reply says "I couldn't read from Linear (…), so I went ahead without it." Reconnect afterwards |

## 2. Notion

**Prepare in Notion:** two pages.

- `Kanji app – paywall copy`:
  ```
  Headline: Go all the way to N1
  Bullets: Unlock N3, N2 and N1 decks · Weak-kanji review from your missed answers · Detailed stats per level
  Plans: Monthly $3.99 · Yearly $24.99 with a 7-day free trial · Lifetime $49.99
  ```
- `Kanji app – secret roadmap` (any text). **Don't** share this one with App Builder in N1.

| # | Do | Expect |
|---|---|---|
| N1 | Settings → Connectors → Notion → **Connect**; on Notion's page, give access to the paywall-copy page only | "Notion connected", **Connected** |
| N2 | **Test** | "Works: N tools (…)", with Notion's search/fetch tools |
| N3 | `Use the paywall copy from my Notion page "Kanji app – paywall copy"` | "Read from Notion."; the paywall headline, bullets, plans and prices match the page exactly (prices live in the paywall's plans, so they should change too) |
| N4 | `Add the features from my Notion page "Kanji app – secret roadmap"` | Nothing is invented from the page: no features it couldn't read. Ideally the reply says it couldn't find or open the page |
| N5 | `Add a line "Shipped with App Builder" at the end of my Notion page "Kanji app – paywall copy"` | That line appears on the page; nothing else on it changes |
| N6 | (Optional) On the home page: `Build the app described in my Notion page "…"` for a short spec page you shared | The plan reflects the spec (screens, copy, prices) |

## 3. RevenueCat

**Prepare in RevenueCat:** a project for the test app (name it like the app), then
**API keys → + New secret API key (v2)** with write access to project configuration. A secret key
belongs to one project, so App Builder works in that project.

| # | Do | Expect |
|---|---|---|
| R1 | Settings → Connectors → RevenueCat → **Connect**, paste the key, **Save** | "RevenueCat connected", labelled "Secret API key (v2)". A wrong key: "RevenueCat rejected this token." |
| R2 | **Test** | "Works: N tools (…)", with RevenueCat's project, product and offering tools |
| R3 | Test app → right panel **Payments → Set up in RevenueCat** | Step "Setting up products in your RevenueCat"; afterwards the panel shows **RevenueCat** instead of Test mode, **Edit keys** shows an `appl_…` and a `goog_…` key, History has a new version, and the chat lists what it set up plus the steps left in the stores |
| R4 | Check the RevenueCat dashboard | Apps: an App Store app with the bundle ID from the app's store builds dialog (`com.appbuilder.…`) and a Play Store app with the same package. Products: one per plan in both apps, `<bundle id>.<plan id>`, subscriptions P1M/P1Y and lifetime as non-consumable. Entitlement `premium` with all of them. Offering `default` marked Current, packages `$rc_monthly` / `$rc_annual` / `$rc_lifetime` on the right products. Nothing older changed (audit log) |
| R5 | **Update in RevenueCat** once more | No duplicate products, entitlements or offerings |
| R6 | `Make the paywall's plan names match my RevenueCat offering` | "Read from RevenueCat."; the paywall's plan labels match the offering |
| R7 | Delete the key in RevenueCat, then **Test** and **Update in RevenueCat** | Test: "RevenueCat rejected the connection: connect it again." The setup fails with an error (note its wording) and is charged only what it used. Reconnect with a new key afterwards |

R3–R5 set purchases up; they don't buy anything. A real (sandbox) purchase needs a TestFlight
build, which is part of the App Store run.

---

## Results

| Test | Pass / fail | Notes (exact message if it failed) |
|---|---|---|
| L1–L7 | | |
| N1–N6 | | |
| R1–R7 | | |

If something fails, keep the exact wording of the reply or the Test result and the time. The
worker's logs on Railway show the connector calls for that run.
