# Human-Editor Craft Reference (Sarah Li • MKBHD • Mrwhosetheboss)

What separates a $3,000–$5,000 human YouTube editor from a basic automated script is NOT flashy transitions — it is **invisible rhythm, sound layering, and visual hierarchy**. Use this checklist when directing `edit-plan.json`.

---

## 1. The 8 Craft Layers Built Into `ai-video-editor`

| Craft Element | Creator Signature | How to Direct It in `edit-plan.json` |
| :--- | :--- | :--- |
| **1. Progressive Pacing Rhythm** | MKBHD / Ali Abdaal | Tighter visual shifts every `10–15s` in Minutes `0–3`; calmer `20–35s` holds in Minutes `3–7`; short contrast bursts after Minute `8`. |
| **2. Click-Free Breath-Preserving Cuts** | Every pro editor | `analyze_footage.py --pad 0.20` removes dead air while keeping `0.2–0.4s` natural breaths; `VideoEditor.tsx` applies 3-frame micro audio envelopes on every cut. |
| **3. Face-Centered Soft Pan & Zoom** | MKBHD / Tech Essays | `cameraMoves[]` with `1.00 -> 1.09` over `4.5s` (`easeInOutCubic`), anchored to `faceAnchor`, clamped so black edges never appear. |
| **4. "Things That Move Make Sound" (Micro-SFX)** | MKBHD (Ellis) / Mrwhosetheboss | `"autoSfx": true` layers subtle `-16 to -20 dB` `soft_pop`, `ui_tick`, `subtle_whoosh` on every callout & transition, plus custom `riser_swell` / `bass_hit` cues. |
| **5. Natural Ambience L-Cuts & Silence Drops** | Sarah Li / MKBHD | Set `"ambientVolume": 0.16` on outdoor/café B-roll so street/coffee sound subtly bridges cuts; schedule `2–3s` `"silenceDrops"` (`0%` music) on key truths. |
| **6. Spotlight Screen Dimming** | MKBHD / Mrwhosetheboss | Use `"type": "spotlight"` with normalized `box: {x, y, w, h}` to dim noisy screen recordings to 38% and highlight the exact Slack line, code token, or math cell. |
| **7. Animated Counters & Step Trackers** | Mrwhosetheboss | Use `"type": "counter"` (`$0 -> +$675/yr`) and top `"type": "chapter-tracker"` pills so viewers feel constant forward momentum. |
| **8. Filmic Editorial Breathers & Texture** | Sarah Li / Matt D'Avella | Use `"type": "editorial-title"` (frosted serif chapter card), `"transition": "dip-to-black"`, and subtle `"filmGrain": 0.04` + vignette. |

---

## 2. What Still Benefits From a 5-Minute Human Taste Pass

Even with an agent handling **90% of the edit**, keep yourself as the **Creative Director**:
1. **Story / Emotional Selection:** Decide which imperfect personal stories stay in (don't let AI over-trim genuine human laughs or vulnerable pauses).
2. **Music Track Vibe Choice:** Pick the 1–2 instrumental tracks that match the video's mood (warm lo-fi / minimalist acoustic for Sarah Li lifestyle feel; crisp dark electronic beat for MKBHD/AI builds).
3. **Final Visual Review (`verify_edit.png`):** Glance at the contact grid and give 2–3 surgical notes (*"push zoom #2 1.5s later"*, *"shorten editorial title to 1.8s"*) before rendering the final master.
