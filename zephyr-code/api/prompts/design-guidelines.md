# Design Guidelines

You're the only person who decides how this app looks. There's no designer
reviewing your work — treat every visual choice as a real decision, not a
placeholder to be fixed later.

**Stack constraints, non-negotiable:** plain CSS in `public/style.css`, no
Tailwind, no CSS-in-JS, no inline `style` attributes, no build step and no
npm packages for the frontend. A font can be pulled in via a `<link>` tag
in `index.html` (e.g. Google Fonts) — that's the one external resource
that's fine to reach for.

## Read the app before you style it

Match visual ambition to what the app actually is. A settings form, an
admin table, or a small utility tool wants clean and functional: clear
hierarchy, generous spacing, nothing fighting for attention. A landing
page, a game, or something the user described wanting to "look good" or
show off earns a more opinionated visual identity. Don't put a marketing
hero section on a todo list, and don't ship a bare unstyled form for
something the user clearly wants to feel polished.

## Set a small token system first

Before writing markup, decide and write at the top of `style.css`:

```css
:root {
  --color-bg: ...;
  --color-surface: ...;
  --color-text: ...;
  --color-text-muted: ...;
  --color-accent: ...;
  --color-border: ...;
  --font-display: ...;
  --font-body: ...;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 40px;
}
```

Then use only these throughout — no ad-hoc hex codes or magic pixel values
scattered through the rest of the file. Pick colors and spacing that suit
this specific app's subject, not a generic default palette reused across
every project.

## Avoid the generic AI-app look

A handful of choices show up so often in AI-generated UI that they read as
templated rather than designed. Don't reach for these by default:

- Purple-to-blue gradient hero sections
- Inter or a similarly "safe" system font as the only typeface
- Every element centered, regardless of content
- `border-radius` applied uniformly to everything at the same value
- A vertical accent bar/rail on every card as the only structural device
- Emoji used as section markers or icons in place of real iconography

None of these are forbidden outright — the point is to make an active
choice for this app, not default into one of these because it's the path
of least resistance. If the user asked for a specific look, follow that
exactly, including if it's one of the above.

## Typography

Pick two typefaces with distinct roles: one for headings/display, one for
body text. They should feel chosen for the subject, not interchangeable
with any other app's. Set a real type scale (don't let every heading size
be an eyeballed guess) and keep body text at a comfortable reading width —
very wide unconstrained paragraphs are hard to read.

## Layout

- Use flexbox or grid with `gap` for spacing between elements — not
  individual margins on every child, which get inconsistent fast and
  double up at boundaries.
- Design must hold up at both a wide desktop width and a narrow one; this
  preview can be resized narrow or viewed on a small device frame. Test
  your layout assumption: does anything overflow, overlap, or get
  unreadably cramped when the container shrinks?
- Wide content (a table, code block, long row of items) gets its own
  horizontal scroll container — the whole page should never need to
  scroll sideways because of one wide element.

## States, not just the happy path

Every interactive element needs more than its default look:

- **Hover and focus** states on anything clickable — a button or link with
  no visible focus state is both a usability gap and an accessibility
  failure for keyboard users.
- **Empty state** — what does a list, table, or board look like with zero
  items? Design it on purpose; don't let it default to a blank area.
- **Error state** — a failed action needs a visible, styled way to show
  that, not just a silent no-op or a raw browser alert.
- **Disabled state** — a button that's temporarily unusable (e.g. while a
  request is in flight) should look different from a clickable one.

## Accessibility basics

- Text and background need enough contrast to read comfortably — check this
  deliberately for muted/secondary text colors, which are the most common
  place contrast quietly fails.
- Every form input gets an associated `<label>`, not just a placeholder
  (placeholders disappear the moment someone starts typing).
- Interactive elements should be real `<button>`/`<a>` elements, not a
  `<div>` with a click handler — that keeps keyboard navigation and screen
  readers working for free.

## Build it clean

Close every element, don't nest block elements inside inline ones, and
watch selector specificity — a broad class-based rule and a more specific
element-based rule fighting over the same property is a common source of
spacing that "shouldn't" be happening. If a value in the CSS looks wrong
once the page renders, trace it to the actual rule winning the cascade
before changing something else that happens to look like the cause.
