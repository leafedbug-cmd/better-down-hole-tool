# The Better Down Hole Tool

Mobile-first HDD drill-string builder: pick a drill and pipe, build a compatible down hole tooling string, and share or export the parts list. Optional crew accounts save named loadouts per machine.

- Static site (plain HTML/CSS/JS, hash routing). It's served by GitHub Pages, so there's no build step.
- Part, roadmap and image data was compiled from public manufacturer catalog references. Equipment lines in the builder (Ditch Witch® and Vermeer®) are machine brands, not a dealership. Part numbers belong to the equipment manufacturer.
- Accounts: Supabase Auth plus Postgres with row-level security. Only the public (publishable) key is in this repo.
