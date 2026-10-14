# Accessibility

We want everyone on a team to be able to plan their week in Floppy, including people who use a keyboard, a screen reader, magnification, voice control or reduced motion.

## Our target

Floppy aims to meet the **[Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/), level AA**. This is a goal we work towards, not a formal claim of conformance: Floppy has not had an independent accessibility audit yet.

## What's in place

- **Keyboard.** Every action works with a keyboard alone, and focus is always visible (a 2px outline in the accent colour). Menus, dialogs, tabs and switches use Radix primitives, which handle arrow keys, Escape and focus trapping.
- **Drag and drop has an alternative.** On the task board, every card has a "Move to…" menu. On the calendar, a task's deadline can also be changed from its Edit dialog.
- **Screen readers.** Controls have labels, icons used as buttons have `aria-label`s, decorative images and shapes are hidden from assistive tech, and live regions announce toasts and the loading overlay.
- **Colour and contrast.** The palette's text colours were checked against their backgrounds for at least 4.5:1 contrast, in light and dark mode. Status badges always carry a word, not just a colour.
- **Reduced motion.** With "reduce motion" switched on in the operating system, smooth scrolling, the loading animation, tab and page transitions and the decorative confetti are switched off.
- **Light and dark mode** follow the system setting and can be changed from the theme switch.
- **Zoom and reflow.** Layouts adapt from phone width up. The home, sign-in and sign-up pages have been checked at 320px wide (the width of 400% zoom) with no sideways scrolling.
- **Language.** Pages declare `lang="en"`.

## Known limitations

- The **calendar grid** is a visual month view. With a screen reader, use the day list below the grid, or the List view of Tasks, which present the same tasks as plain lists. In the grid, an overdue task is marked only by a red edge; the List view says "Overdue" in words.
- **Page titles.** The public pages have their own titles, but most pages inside the app share the title "Floppy", which makes browser tabs and history harder to tell apart.
- **Pages inside the app** haven't been checked at 320px wide yet.
- **Sign-in and sign-up forms** are provided by Clerk. We style them, but their accessibility is mostly in Clerk's hands.
- **Markdown pages** written by users can lack headings or image descriptions. The editor doesn't check this yet.
- Some **progress bars** don't have a text alternative yet.

## Report a barrier

If something in Floppy is hard or impossible to use with the way you work, please tell us:

- **Public:** open an [Accessibility issue](https://github.com/Tharinda-Pamindu/Floppy/issues/new?template=accessibility.yml). Describe the page, what you were trying to do, and the assistive technology, browser and operating system you use.
- **Private:** if you'd rather not describe it in public, open an issue with the [Ask a maintainer to contact me privately](https://github.com/Tharinda-Pamindu/Floppy/issues/new?template=private-contact.yml) template (it asks for no details), and a maintainer will reach out privately.

We aim to reply within 7 days. Accessibility bugs are treated like any other bug, and ones that block a task completely are fixed first.

## For contributors

New UI must keep everything above true. [CONTRIBUTING.md](CONTRIBUTING.md#accessibility) lists the checks a pull request goes through.
