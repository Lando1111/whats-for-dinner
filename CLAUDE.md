# Notes for Claude

- Full spec, decisions and build plan: claude.ai Project "App creation" → `claude/meal-planner-spec.md`. Read it before starting a slice; log decisions there.
- Spelling and copy: Australian English, sentence case, short friendly labels.
- Look: Hearth tokens in `src/styles.css` (light, dark, follow-phone). Minimum 16px body text, 44px tap targets, one apricot primary action per screen, Undo instead of confirm where possible.
- No AI services in the app.
- Supabase project ref `tfhwvccqmwtbrhqqfcdn` (Sydney, free plan). Every schema change goes in `supabase/migrations/` as a new numbered file and is applied with the Supabase connector, then checked with the security and performance advisors.
- Membership helpers live in the `private` schema (`private.my_household_id()`, `private.my_role()`, `private.can_edit()`); roles are owner / full / shopping. People can belong to several households; `my_household_id()` returns the open one (`user_prefs.active_household_id`, falling back to the earliest joined). Always filter household screens by `household.id` too, since people also see their own memberships elsewhere. Shopping-only members can use the shopping list but not change plans or recipes; RLS enforces this.
- Routing is hash-based (`#/week`, `#/shopping`, `#/recipes`, `#/settings`, `#/household`, `#/join/<token>`). Base path `/whats-for-dinner/`.
- Pin dependency versions; choose releases at least two weeks old.
