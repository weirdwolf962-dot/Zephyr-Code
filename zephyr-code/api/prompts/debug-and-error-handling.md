# Debugging & Error Handling

You are doing the final pass on this app before a real person uses it. Nobody
reviews your output after this — treat every bug you miss as a bug that
ships.

## Cross-check UI against backend, systematically

Don't eyeball this — go call by call:

1. List every `fetch()` (or XHR) in `public/script.js`: method, path, what it
   sends, what it expects back.
2. List every route `server.js` actually handles: method, path, what it
   returns.
3. Match them one-to-one. For each mismatch, decide and fix:
   - UI calls a route the backend doesn't have → add the route.
   - Backend returns a different shape than the UI reads (wrong key name,
     array vs. object, missing field the UI destructures) → fix whichever
     side is wrong; usually that's the backend, since the UI is what the
     user actually sees behave correctly.
   - Backend has a route nothing calls → leave it, don't strip working code
     just because this turn didn't reference it.
4. Re-check paths with params (`/api/items/:id`) against how the UI actually
   builds the URL — a template-string bug here (`/api/items/${undefined}`)
   is invisible in the route list and only shows up by tracing the call site.

## Backend correctness sweep

Go through `server.js` function by function and ask, for each one, "what
input makes this wrong?":

- **Missing `await`** — a promise passed where a value was expected; look
  especially at anything reading the request body or touching in-memory
  storage inside a callback.
- **Uncaught throw** — any code path that can throw outside a `try/catch`
  will crash the whole process, not just that request. Every handler needs
  its own try/catch; a bad request body should return 400, never kill the
  server.
- **Falsy-zero and empty-string bugs** — `if (!id)` rejects `id === 0` or
  `id === ""` as if they were missing. Use `id === undefined` or an explicit
  type check when zero or empty string is a legitimate value.
- **Off-by-one / wrong comparison** — array bounds, `<` vs `<=`, `slice`
  vs `splice` where the wrong one silently mutates.
- **Wrong-variable copy-paste** — two similarly named variables (`item`,
  `items`, `newItem`) used in the wrong place in a block that was clearly
  copied and adjusted.
- **Loose path matching** — `req.url.includes("/api/item")` matching
  `/api/items/123` by accident. Use exact equality or parse with `URL` and
  compare `pathname` segments.
- **Query strings breaking path matching** — matching on raw `req.url`
  instead of the parsed pathname means `/api/items?sort=asc` silently
  fails to match `/api/items`.
- **In-memory state races** — two rapid requests reading-then-writing the
  same in-memory array/object without any ordering guarantee. Not always
  fixable, but at least don't introduce read-modify-write patterns split
  across `await` boundaries where the state could change in between.
- **res.end() called twice, or never** — both crash or hang the request.
  Every code path through a handler must call `res.end()` (or
  `res.json`/equivalent) exactly once.

## Frontend correctness sweep

- **Unhandled fetch rejections** — a `fetch()` with no `.catch()` (or no
  try/catch around an `await fetch`) means a network failure or non-2xx
  response leaves the UI stuck or silently broken with nothing shown to the
  user.
- **Assuming success shape on error responses** — code that does
  `response.data.map(...)` without checking `response.status === "success"`
  first will throw when the backend returns an error object instead.
- **DOM queries before the element exists** — a script that queries an
  element before it's rendered, or that isn't re-run after content is
  re-rendered, silently no-ops.
- **Event listeners stacking** — re-attaching a listener on every render
  without removing the old one first causes an action to fire multiple
  times.
- **State that should reset and doesn't** — e.g. a form that doesn't clear
  after successful submit, or an error message that doesn't clear on retry.

## Edge cases the feature spec implies

For each feature this turn built or touched, check the case a casual read
skips:

- Empty state — list/table/board with zero items shown correctly, not a
  blank screen or a crash on `.map()` over `undefined`.
- Invalid input — what happens when a required field is missing or the
  wrong type? The backend must reject it cleanly (400 + message), not throw.
- Loading — is there any feedback between the user's action and the
  response, or does the UI look frozen/unresponsive during a fetch?
- Rapid repeated action — double-clicking a submit button, or triggering
  the same fetch twice before the first resolves.

## When you're done

Fix what you find directly in the files — don't just report it. If you
touched a file, re-read your own new version once, specifically hunting for
a mismatch you just introduced (a renamed field on one side and not the
other is the single most common self-inflicted bug in a fix pass).
