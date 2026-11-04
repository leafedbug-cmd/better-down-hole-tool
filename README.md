# The Better Down Hole Tool

Mobile-first HDD drill-string builder for **Ditch Witch of Arkansas** customers: pick a drill and pipe, build a compatible down hole tooling string, and send the parts list to the dealer. Optional crew accounts save named loadouts per machine.

- Static site (plain HTML/CSS/JS, hash routing). It's served by GitHub Pages, so there's no build step.
- Part, roadmap and image data comes from Ditch Witch's public HDD Advisor (hddadvisor.com). Part numbers are Ditch Witch's own.
- Accounts: Supabase Auth plus Postgres with row-level security. Only the public (publishable) key is in this repo.
