# Apple UI redesign guide

This document translates Apple platform guidance into implementation rules for the Human Tower Battle web app. It summarizes the sources rather than reproducing Apple documentation.

## Official sources

- [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles)
- [Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Color](https://developer.apple.com/design/human-interface-guidelines/color)
- [Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- [Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
- [Game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls)
- [Menus](https://developer.apple.com/design/human-interface-guidelines/menus)
- [Apple Design Resources](https://developer.apple.com/design/resources/)

## Applied principles

1. Keep the game as the visual focus. Navigation and controls use translucent material so they remain legible without hiding the play field.
2. Use semantic colors consistently: blue for primary actions, green for enabled and success, orange for processing, and red for destructive actions and failure.
3. Use the Apple system-font stack with regular, medium, semibold, and bold weights. Avoid thin text and unnecessary typeface changes.
4. Keep touch targets at least 44 by 44 CSS pixels and place game controls within thumb reach at the bottom of the play field.
5. Respect safe-area insets around the top bar, game controls, and page edges.
6. Present the HUD as one material layer with internal separators instead of several nested cards.
7. Use a familiar icon plus a concise Japanese label for commands. Preserve accessible names for icon-only controls.
8. Keep status understandable without color alone by pairing every semantic color with visible Japanese text.
9. Maintain the full-bleed game experience while letting capture and character-management views scroll naturally.
10. Reduce motion when the operating system requests reduced motion and provide a higher-contrast fallback when transparency is unavailable.

## Project tokens

- Primary action: system blue, `#007aff`
- Success and enabled: system green, `#34c759`
- Destructive and error: system red, `#ff3b30`
- Processing: system orange, `#ff9f0a`
- Primary label: `#1d1d1f`
- Secondary label: `#6e6e73`
- Page background: `#eef3f6`
- Material: translucent white plus blur and saturation
- Control radius: 12 to 16 pixels; circular icon buttons remain circular
