# Daily FI Tape

Public GitHub Pages archive for Daily FI Tape reports.

## Structure

- `index.html`: interactive archive reader.
- `assets/`: static CSS and JavaScript for the reader.
- `tapes.json`: manifest of published reports, latest first.
- `data/tapes/<date>.json`: sanitized public report data.
- `archive/<date>-close/index.html`: original published HTML fallback for each close date.

The repository is display-only. Public JSON is generated from local Daily FI Tape artifacts and excludes email recipients, Gmail/source ids, ledger state, transport state, and local filesystem paths.

## Publish From Local Artifacts

From `/Users/kenhung/News Collect`:

```bash
python3 automation/publish_daily_fi_pages.py --pages-root "/Users/kenhung/Daily-FI-Tape"
```

Then commit and push this repository. GitHub Pages serves from `main` at:

https://ken851109-spec.github.io/Daily-FI-Tape/
