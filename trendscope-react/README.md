# TrendScope AI — React Dashboard

Single-page, section-scrolling earthquake analytics dashboard built with React + Vite.

## Add your dataset once

Put the CSV here:

`public/data/scraped_earthquake_data.csv`

The app loads it automatically at startup. There is no CSV upload button in the UI.

Required columns (common aliases supported): `latitude`, `longitude`, `magnitude`.
Optional columns: `time_utc`, `depth_km`, `place`, `country`.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite, usually `http://localhost:5173`.

## Production build

```bash
npm run build
npm run preview
```

## Dashboard sections

- Overview and key statistics
- Seismic trends: magnitude distribution, yearly records, magnitude bands and depth distribution
- Interactive country-level world map with a warm yellow-to-coral gradient
- Machine-learning model comparison graphs using the scores provided in the notebook output
- Filterable event table and CSV export
- Final coordinate demo that finds the nearest recorded event in the local dataset

## Theme

- Navy background: `#212544`
- Cream headings: `#F7F0D5`
- Ice-blue text/graphs: `#BFE9F2`
- Neon-green graph accent: `#B8FF6A`
- World-map gradient: `#F3CA81` → `#F6AD76` → `#F38E67` → `#F65D53`

The model comparison values are taken from the supplied notebook screenshot. This dashboard shows historical catalogue analysis, not a forecast or official seismic-hazard assessment.


## Hero video

Place your video file at `public/video.mp4`. The overview hero plays it automatically, muted, looping, and inline. If the file is missing, the video area will remain blank; add the MP4 to that exact path.
