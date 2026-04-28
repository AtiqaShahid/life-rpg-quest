# Project Memory

## Core
Profile column "fatigue" was renamed to "exhaustion" (numeric 0–100 physical resource that recovers over time). The new "Fatigue" is a discrete behavioral STATUS EFFECT (auto-eases quest difficulty when user is inconsistent). Never reintroduce the old `fatigue` column name.
Character classes: scholar, warrior, creator, leader. First class pick is FREE and forced via ClassOnboardingGate. Subsequent changes: 7-day cooldown OR 500 coins to bypass.
Status effects (burnout / flow_state / fatigue) are auto-evaluated by `evaluate_status_effects` RPC after every activity log and at app load. Combined XP multiplier is capped 0.5×–2×.
