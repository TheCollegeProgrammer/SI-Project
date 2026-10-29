# TrendScope AI — Streamlit

1. Put `scraped_earthquake_data.csv` in `data/`.
2. Optional hero video: `video.mp4` in project root or `assets/video.mp4`.
3. Run:

```bash
pip install -r requirements.txt
streamlit run app.py
```

No CSV upload control is included. Country choropleth requires a country column; otherwise the map shows event locations. ML metrics are the notebook results provided by the user and are not retrained here.
