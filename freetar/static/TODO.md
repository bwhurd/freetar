- If I have zoom set to 100% and i have the window maximized, the chord diagram size (using the my-chords.html template) and proportions and aspect ratio is close to what I want it to be based on the my-chords.CSS diagram setup mainly defined in this section of my css:
```
:root {
    /* Colors */
    --color-bg: #2a282d;
    --color-fg: #efeffc;
    --root-dot-color: #43dfe7;
    /* tinted root highlight */

    /* Typography */
    --font-base: system-ui, sans-serif;
    --font-chord: NunitoChord, var(--font-base);
    --font-weight-regular: 400;
    --font-weight-medium: 500;

    /* Radii */
    --radius-xxs: .25rem;

    /* small card/group corners */
    --radius-xs: .5rem;

    /* larger card corners */
    --radius-pill: 999px;

    /* ================================*/
    /* Spacing                         */
    /* ================================*/
    --space-1: .25rem;
    --space-2: .5rem;
    --space-3: .75rem;

    --delete-btn-nudge-x: 1em;
    /* right */
    --delete-btn-nudge-up: 1em;
    /* up */

    /* ================================*/
    /* Diagram: geometry & ratios      */
    /* ================================*/
    --diagram-u: 1.75rem;
    --diagram-string-gap: .7;
    --diagram-string-width: .1;
    --diagram-fretline-width: .08;
    --diagram-nutline-width: .2;
    --diagram-nut-bump: .1;
    --diagram-header-row-h: .2;
    --diagram-header-font-scale: .5;
    --diagram-fret-label-col-w: .7;
    --diagram-fret-label-font-scale: .55;
    --diagram-fret-label-translate-x: -.1;
    /* multipliers of --u */

    --diagram-fret-label-translate-y: .0;
    --diagram-row1-h: 1;
    --diagram-row2-h: 1.07;
    --diagram-row3-h: 1.09;
    --diagram-row4-h: 1.09;
    --diagram-dot-size: .5;
    /* 0.5 x 0.5 of unit */

    --diagram-header-offset: .2;
    /* units above nut for X/O */

    --diagram-footer-offset: .05
        /* units below last fret for numbers */

```

If i exit out of maximized window to a very narrow window the dimensions of the diagram and relative proportions and aspect ratio changes. I have no idea why, but i want the size of the aspect ratio and relative spacing of the chord diagrams to always be exactly the same regardless of the window zoom or window size. If the zoom is on, the chords like the text should scale larger, but the relative proportionates of the diagram should never change. Can we fix this?



1. Make it so 'Add Group' adds the new group before the first existing group rather than as the last group. 
- When the group is added it should have 1 blank chord already (where the 'new blank chord' name is '...' and the chord shape is '000000')
- After adding the new group, it should already be saved. 
- initially after clicking 'Add Group', the cursor should automatically be placed in the blank group name input field
2. If a chord diagram (e.g. x02210) does not include any X's or 0's, then there is no header row, but can we make it so that header row still takes up the same amount of space regardless, and then same thing with the footer row so that regardless of the numbers and shapes that the chord grid they are aligned and the same size?
3. 
- The text label/title on the collection tile items in chord-collections.html are only allowing like 4 characters per line, so let's reduce the font size by 25%, and make their container go all the way to the edge of the .collection-card width.



# Generic First COdex Method
- Review the AGENTS.md and help me update the my-chords.html feature of my app.
- be mindful to identify all elements that must work together so the final result 'just works' the first time

You are editing the freetar project. You already have AGENTS.md loaded with house rules and patch format. Follow those. Below between the 000s is a high level overview of what we are working on for reference. Your task is between the 111s.

000
High level goal

We are adding a new “Chord Collections” feature on top of the existing My Chord Library:

A landing page that shows “Collection Groups” and “Collections” in a grid similar to the current chord groups and chords.
Clicking a collection opens a collection specific chord library page that behaves like the existing /my-chords view, but scoped to that collection.
In this step, only add backend helpers and storage so later steps can build routes, templates, and JS on top of it. Do not change any existing behavior yet.
000

# Next Task
111


111