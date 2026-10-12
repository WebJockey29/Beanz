# Beanz

A small web app for dialing in espresso on a Sage/Breville Barista Express (BES870/BES875).
For each shot you enter the grind setting, shot time and yield. It tells you which grind
setting to try next to reach **18 g in → 36 g out in 25–30 s**.

## Run it

No build step. Serve the folder and open it in a browser:

```sh
npm start          # or: python3 -m http.server 5173
npm test           # algorithm unit tests (Node 18+)
```

Data is stored in your browser (localStorage), one record per bag of beans.

## What the research says

- **Grinder:** the outer dial runs 1 (finest) to 16 (coarsest). Breville recommends starting
  at 5, and most espresso dials in somewhere around 3–8. An inner (upper) burr shifts the
  whole range. If you are stuck at 1 and still running fast, or at 16 and still running
  slow, move the inner burr one step and restart at 5.
- **Recipe:** a 1:2 ratio (18 g → 36 g) in 25–30 s is the standard starting recipe. Under
  ~20 s usually tastes under-extracted (sour). Over ~35–40 s usually tastes over-extracted
  (bitter).
- **The lever:** dose is fixed at 18 g, so grind is the main control. Finer means more
  flow resistance and a longer shot. Change one variable at a time.
- **Step size:** owners report roughly 2–4 s of shot time per dial step on the Barista
  Express. It varies with the beans, roast and burr wear. That's why the app learns the step
  size from your own shots instead of assuming a fixed value.
- **Taste comes last:** time and yield get you into the window. Taste does the final
  adjustment. Sour → a bit finer and longer. Bitter → a bit coarser and shorter.

There's no published, validated equation for "grind setting → shot time". What people
actually do is this feedback loop, and the app automates it.

## The algorithm (`src/dialin.js`)

1. **Normalise to target yield.** Shots don't always stop at exactly 36 g. Flow is roughly
   linear once pre-infusion ends (~6 s), so the app estimates the time the shot *would*
   have taken to reach `dose × 2`:

   `t36 = delay + (time − delay) × (dose × 2 / yield)`

   For example, 40 g in 19 s works out to ~17.7 s to 36 g.

2. **Linear grind model.** Over the narrow espresso range, `t36(setting) ≈ a − k × setting`.
   `k` is the seconds each dial step removes.
   - Prior: `k = 3 s/step`. After two or more finished bags, the app uses the median `k`
     from your own history instead.
   - Once a bag has shots at two or more settings, the app fits `k` by least squares. The
     fit is blended with the prior (weighted like 2 shots) so one channeled shot can't throw
     it off. Fits outside 0.5–12 s/step are thrown out as noise.

3. **Anchor on recent shots.** Each shot is moved along the line to the latest setting, then
   averaged with recency weights (half-life of 2 shots). Newer shots count more, because
   beans change as they age.

4. **Solve and round.** The target time is 27.5 s, or ±2 s if the last shot was sour or
   bitter. The app solves `setting = last + (t_anchor − target) / k`, rounds to a whole dial
   number, and clamps the result to 1–16. If the answer falls outside that range, the app
   suggests an inner burr change.

5. **Don't chase noise.** If the last shot was already in the window and tasted fine (or
   wasn't rated), the app tells you to keep the setting.

**New bag start:** the setting your previous bags ended up on (default 5), −1 for light
roasts and +1 for dark.
