---
name: deconstruct
description: Breaks an animation or interaction into a state machine and a timeline of every property, on a page you can scrub through.
disable-model-invocation: true
---

# Deconstruct

This skill takes an animation or interaction apart. It names every state and event, splits each transition into one track per property and puts both on a page the user can scrub.

## Every frame accounted for

Nothing is described by feel. Every state has a name, every transition has an event and every animated property has its from, to, delay, duration and easing. A value that could not be read is marked `Not verified`, never estimated.

Reading computed values and the side-by-side proof belong to `match`. Forcing component states open belongs to `lab`. Opening the result runs in `verify`. Whether the motion's values are right belongs to `motion`.

## 1. Capture the real motion

Open the source: the code, the live page or a recording. Read keyframes, transitions and spring configs, or step through frames at reduced playback speed. A breakdown from one viewing is `deconstruct-capture-the-source`.

## 2. Name the states and events

List the states the element can rest in and the events that move it between them, such as press, release, resolve and timeout. Write them as a table of state, entered on and left on. A sentence like "it shrinks, then spins" is `deconstruct-name-the-states`.

## 3. Split each transition into tracks

Give every animated property its own track: scale, opacity, blur, width, colour, icon and label. Each track lists from, to, delay, duration and easing. "About 300ms" is `deconstruct-every-property`.

Keep the curve as written. A spring stays a spring with its stiffness, damping and mass, or its bounce and duration. A spring flattened into a guessed bezier is `deconstruct-keep-the-curve`.

## 4. Drive it from one clock

Render the element as a pure function of one time value. Scrubbing, pausing and looping then show the same frame for the same time. A viewer that replays CSS and cannot stop mid-transition is `deconstruct-one-clock`.

## 5. Build the viewer

Copy [viewer.html](viewer.html) beside the rebuild as a development-only page, write `timeline.js` next to it in the shape its header comment shows and open it. It shows the element, the state machine and one lane per track with its live value.

The viewer ships with the skill, so write data only. A page with its own markup or styles is `deconstruct-shipped-viewer`. It highlights the active state, and clicking a state seeks to it. Its scrubber, play, pause and 0.25× stay in. A timeline with no scrubber is `deconstruct-scrub-the-timeline`.

## 6. Compare at slow speed

Play the original and the rebuild side by side at 0.25×. Set `recording` to a capture of the original, and the viewer plays it beside the preview on the same clock. Name every frame that drifts. A breakdown checked only at full speed is `deconstruct-compare-slowed`.

## 7. Hand back the data

`timeline.js` is the hand-back: the state table and the tracks as one object. The rebuild imports that file rather than a copy, so the viewer and the shipped motion read the same values. A timeline that lives only in the reply is `deconstruct-timeline-as-data`. Gate the viewer to development or delete it before release, and keep `timeline.js`.

## The pair

Every check is a pair. The broken line sits beside the line that replaces it.

| Rule | Broken | Replacement |
| --- | --- | --- |
| `deconstruct-capture-the-source` | A breakdown from watching it once | The code read and frames stepped at 0.1× |
| `deconstruct-name-the-states` | "It shrinks, then spins" | Idle, Pressed, Copying and Copied with their events |
| `deconstruct-every-property` | "About 300ms" | Scale `1` to `0.96`, 120ms, ease-out, at 400ms |
| `deconstruct-keep-the-curve` | A spring approximated as `ease-out` | `stiffness: 400, damping: 30` as written |
| `deconstruct-one-clock` | A CSS replay button | Every frame computed from one `t` |
| `deconstruct-scrub-the-timeline` | A looping preview only | A scrubber, play, pause and 0.25× |
| `deconstruct-shipped-viewer` | A viewer page written from scratch | `viewer.html` copied, only `timeline.js` written |
| `deconstruct-compare-slowed` | Checked once at full speed | Original and rebuild side by side at 0.25× |
| `deconstruct-timeline-as-data` | A timeline described in the reply | `timeline.js`, imported by the rebuild |

## Reporting

**Severity.** `HIGH` is a breakdown made without opening the source, or a missing state. `MEDIUM` is an estimated timing, a flattened curve, a viewer that cannot scrub or a hand-written viewer. `LOW` is drift found and named at slow speed.

**Format.** One finding per root cause:

```
file:line - [rule-id] what is wrong
```

Then a `Rule | Count | Severity` summary. `Block` when any `HIGH` remains, `Approve` otherwise. Mark every value you could not read from the source as `Not verified`.
