---
name: set-models
description: Set model preferences for this group. Configures which Claude model to use for routine, moderate, and complex messages.
allowed-tools: Bash(cat*), Read, Write
---

# Set Model Preferences

When the user wants to configure which Claude models to use, update the preferences file at `/workspace/group/model-preferences.json`.

## Available Models

- `claude-haiku-4-5` — Fastest, cheapest. Good for simple responses.
- `claude-sonnet-4-6` — Balanced speed and capability.
- `claude-opus-4-6` — Most capable. Best for complex analysis and planning.

## Preference Tiers

- **routine** — Short messages, greetings, acknowledgments, simple questions
- **moderate** — General conversation, medium-length requests
- **complex** — Analysis, planning, coding, image processing, scheduled tasks

## How to Update

1. Read the user's preference (they may say things like "use Opus for everything" or "haiku for simple stuff, opus for complex")
2. Write the JSON file:

```json
{
  "routine": "claude-haiku-4-5",
  "moderate": "claude-sonnet-4-6",
  "complex": "claude-opus-4-6"
}
```

3. Confirm what was set with a short summary.

## Defaults (when no preferences set)

- routine: `claude-sonnet-4-6`
- moderate: `claude-sonnet-4-6`
- complex: `claude-opus-4-6`

## Examples

User: "use opus for everything"
→ Set all three tiers to `claude-opus-4-6`

User: "save tokens, use haiku for simple and sonnet for the rest"
→ routine: `claude-haiku-4-5`, moderate: `claude-sonnet-4-6`, complex: `claude-sonnet-4-6`

User: "default models"
→ Write the defaults listed above

## Important

- Always write valid JSON to `/workspace/group/model-preferences.json`
- Only use the model IDs listed above
- Changes take effect on the next message (not the current session)
