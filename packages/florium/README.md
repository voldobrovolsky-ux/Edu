# @edumed/florium

Embeddable **Flörium** shell: module placeholders (Communitoria, Fmail, Rivi), CRM connector metadata, and a small React context for in-app navigation.

## What the host must pass in

Flörium expects a **narrow session** (`FlorusSession`), not a full domain user model:

| Field      | Meaning |
|-----------|---------|
| `id`      | Stable user id from the host (e.g. `PublicUser.id`). Used to correlate data when modules call the host API. |
| `username`| Login/name from the host (e.g. `PublicUser.username`). Used in UI and for synthetic addresses such as `username@fmail.com`. |

The package **does not** call `/api/auth/me`, `/api/auth/login`, or any auth endpoint. The host loads the user, then passes `florusSession` into `FlöriumProvider`.

## How to wrap in the host app

1. After the host has an authenticated user, map it to `FlorusSession` (e.g. `toFlorusSession(user)`).
2. Render:

```tsx
<FlöriumProvider florusSession={session}>
  <FloriumLayout />
</FlöriumProvider>
```

3. Protect the route in the host router as needed (e.g. redirect if there is no user).

`FloriumLayout` switches modules via **`useFlorium().navigate`** (internal state only). Host URL for `/florium` stays a single route unless the host adds its own sync.

## Exports (stable)

- `FlöriumProvider`, `useFlorium`
- `CRMConnector` (+ types)
- `FloriumLayout` (+ `FloriumLayoutProps`)
- Placeholder components: `CommunitoriaPlaceholder`, `FmailPlaceholder`, `RiviPlaceholder`

## Standalone product

This folder is intended to be copied into a separate repo later; keep `CRMConnector` stable for CRM embedding.
