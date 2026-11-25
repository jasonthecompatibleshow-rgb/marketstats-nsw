# One entry point: `make` = download (skips existing) + build data + tiles.
PY := .venv/bin/python
PORT ?= 8765

all: data

.venv/bin/python:
	python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt

download: .venv/bin/python
	$(PY) etl/download.py

data: download
	$(PY) etl/build.py

refresh: .venv/bin/python   ## force re-download of latest DCJ quarter + rebuild
	$(PY) etl/download.py --force && $(PY) etl/build.py

serve:
	$(PY) serve.py $(PORT)

screenshots:
	$(PY) -m playwright install chromium >/dev/null && $(PY) etl/screenshot.py http://localhost:$(PORT)/

check:
	$(PY) etl/check.py

report:   ## gearing + top movers using the site's own JS engine
	node etl/report.js

clean:
	rm -rf data-out web/data

.PHONY: all download data refresh serve screenshots check report clean
