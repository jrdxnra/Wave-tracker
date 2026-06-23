# Slide Workflow Rules

These rules apply to all future slide asset requests in this repo unless explicitly overridden.

## Asset Format Workflow
- Build drafts in SVG first for fast iteration.
- Do not export PNG unless user explicitly asks for PNG.

## Layout Rules
- Choose layout placement (left/right/top/bottom text zones) per slide based on what best matches the source page structure and the slide narrative.
- Do not add bordered text boxes or titled text blocks unless explicitly requested by the user.
- Avoid unnecessary nested border frames that reduce usable space.
- For user-authored text zones, keep spacing open and clean by default (no guide lines, dashed text scaffolds, or prefilled body text unless requested).

## Content Rules
- Use website-specific details from the relevant page/component.
- Keep visuals event-agnostic when possible (avoid implying one event brand/theme unless asked).
- Reflect the app's theme-capable design by using balanced, non-single-brand color treatment when appropriate.
- Include realistic controls and context relevant to the slide topic.
- Keep repeated control styling consistent with the source UI state (for example, do not mix button colors unless the real screen state shows that difference).
- Remove helper field labels, durations, or filler microcopy when they are not essential to the intended slide message.
- Prefer SVG-native vector icons (paths/shapes) over emoji glyphs so exported PNGs do not lose icons.
- If custom-drawn vectors are visually weak, use curated icon assets (PNG/WebP with transparency) inside the SVG instead of hand-drawn icon paths.
- For maximum portability, embed icon assets as data URIs in SVG when linked local image files do not render consistently.

## Iteration Rules
- Make targeted edits quickly and preserve existing approved sections.
- When requested, adjust only specified labels/colors/spacing before broader redesigns.
- Design each slide so text and visuals are easy to understand at a glance, while preserving the essential essence of the source page (its flow, orientation, and key interactions).
- If a footer area is requested, add the area only and leave footer copy empty unless the user explicitly asks to prefill text.
- Verify icon and adjacent label alignment before final export.
