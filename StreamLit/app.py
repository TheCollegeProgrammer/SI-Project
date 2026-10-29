from pathlib import Path
import streamlit.components.v1 as components
import base64
import numpy as np
import pandas as pd
import streamlit as st
import matplotlib.pyplot as plt
import plotly.express as px

ROOT = Path(__file__).parent
CSV_PATH = ROOT / "data" / "scraped_earthquake_data.csv"
VIDEO_CANDIDATES = [ROOT / "video.mp4", ROOT / "assets" / "video.mp4"]

COLORS = {
    "bg": "#0B1020", "nav": "#111827", "panel": "#151D33",
    "cream": "#F7F0D5", "ice": "#BFE9F2", "green": "#B8FF6A",
    "yellow": "#F3CA81", "peach": "#F38E67", "coral": "#F65D53",
    "muted": "#9BAAC4", "border": "#27324A"
}
plt.rcParams.update({
    "figure.facecolor": COLORS["panel"], "axes.facecolor": COLORS["panel"],
    "axes.edgecolor": COLORS["border"], "axes.labelcolor": COLORS["ice"],
    "xtick.color": COLORS["ice"], "ytick.color": COLORS["ice"],
    "text.color": COLORS["cream"], "font.size": 9,
    "savefig.facecolor": COLORS["panel"]
})
st.set_page_config(page_title="TrendScope AI", page_icon="🌍", layout="wide", initial_sidebar_state="expanded")
st.markdown(f"""
<style>
.stApp{{background:{COLORS['bg']};color:{COLORS['ice']}}}
[data-testid="stHeader"]{{background:{COLORS['bg']}}}
[data-testid="stSidebar"]{{background:{COLORS['nav']}}}
.block-container{{max-width:1450px;padding-top:1rem;padding-bottom:2rem}}
h1,h2,h3,h4{{color:{COLORS['cream']}!important}}
p,label,[data-testid="stMetricLabel"]{{color:{COLORS['ice']}!important}}
[data-testid="stMetric"]{{background:{COLORS['panel']};border:1px solid {COLORS['border']};padding:12px;border-radius:9px}}
[data-testid="stMetricValue"]{{color:{COLORS['cream']}!important}}
.stButton>button{{background:{COLORS['ice']};color:{COLORS['bg']};border:0;font-weight:700}}
</style>
""", unsafe_allow_html=True)

@st.cache_data(show_spinner="Reading local dataset…")
def load_csv(path, modified_time):
    data = pd.read_csv(path, low_memory=False)
    return data

def detect_column(columns, candidates):
    lookup = {str(c).strip().lower(): c for c in columns}
    for item in candidates:
        if item in lookup:
            return lookup[item]
    for c in columns:
        low = str(c).strip().lower()
        if any(item in low for item in candidates):
            return c
    return None

@st.cache_data(show_spinner=False)
def prepare_data(raw):
    # Cache-safe preprocessing; avoid repeating conversions on every Streamlit rerun.
    d = raw.copy()
    cols = d.columns
    lat = detect_column(cols, ["latitude", "lat"])
    lon = detect_column(cols, ["longitude", "lon", "lng"])
    mag = detect_column(cols, ["magnitude", "mag"])
    depth = detect_column(cols, ["depth_km", "depth"])
    time = detect_column(cols, ["time_utc", "datetime", "date", "time"])
    country = detect_column(cols, ["country_name", "country", "nation"])
    event_id = detect_column(cols, ["event_id", "id"])
    if lat: d[lat] = pd.to_numeric(d[lat], errors="coerce")
    if lon: d[lon] = pd.to_numeric(d[lon], errors="coerce")
    if mag: d[mag] = pd.to_numeric(d[mag], errors="coerce")
    if depth: d[depth] = pd.to_numeric(d[depth], errors="coerce")
    if lat and lon: d = d.dropna(subset=[lat, lon])
    if time:
        d["_parsed_time"] = pd.to_datetime(d[time], errors="coerce", utc=True)
    return d, lat, lon, mag, depth, time, country, event_id

def style_axis(ax, grid="y"):
    ax.tick_params(colors=COLORS["ice"], labelsize=8)
    ax.xaxis.label.set_color(COLORS["ice"])
    ax.yaxis.label.set_color(COLORS["ice"])
    ax.title.set_color(COLORS["cream"])
    for spine in ax.spines.values(): spine.set_color(COLORS["border"])
    ax.grid(axis=grid, color=COLORS["border"], alpha=.65, linewidth=.6)
    ax.set_axisbelow(True)

def render_hist(series, title, xlabel, color, bins=28):
    values = pd.to_numeric(series, errors="coerce").dropna()
    fig, ax = plt.subplots(figsize=(6.5, 3.0), dpi=95)
    ax.hist(values, bins=bins, color=color, edgecolor=COLORS["bg"], linewidth=.5)
    ax.set_title(title, loc="left", fontsize=11, pad=10)
    ax.set_xlabel(xlabel); ax.set_ylabel("Records")
    style_axis(ax)
    fig.tight_layout()
    st.pyplot(fig, use_container_width=True)
    plt.close(fig)

def render_bar(series, title, xlabel, color, rotate=0):
    fig, ax = plt.subplots(figsize=(6.5, 3.0), dpi=95)
    ax.bar(series.index.astype(str), series.values, color=color, width=.72)
    ax.set_title(title, loc="left", fontsize=11, pad=10)
    ax.set_xlabel(xlabel); ax.set_ylabel("Records")
    if rotate: plt.setp(ax.get_xticklabels(), rotation=rotate, ha="right")
    style_axis(ax)
    fig.tight_layout()
    st.pyplot(fig, use_container_width=True)
    plt.close(fig)

if not CSV_PATH.exists():
    st.title("TrendScope AI")
    st.error("Dataset not found. Put `scraped_earthquake_data.csv` inside the `data` folder.")
    st.code("TrendScope_Streamlit_Optimized/data/scraped_earthquake_data.csv")
    st.stop()

try:
    raw = load_csv(str(CSV_PATH), CSV_PATH.stat().st_mtime)
    df, lat_col, lon_col, mag_col, depth_col, time_col, country_col, id_col = prepare_data(raw)
except Exception as exc:
    st.error(f"Could not load dataset: {exc}")
    st.stop()

st.markdown(f"""
<div style="background:{COLORS['nav']};border:1px solid {COLORS['border']};border-radius:12px;padding:17px 22px;margin-bottom:15px">
<div style="font-size:10px; margin-top: 20px; letter-spacing:2.5px;color:{COLORS['ice']}">EARTHQUAKE DATA · HISTORICAL ANALYSIS</div>
<h1 style="font-size:35px;margin:7px 0;color:{COLORS['cream']};">TrendScope <span style="color:{COLORS['ice']}">AI</span></h1>
<div style="color:{COLORS['muted']}">Lightweight dashboard for seismic trends, model comparison and location exploration.</div>
</div>""", unsafe_allow_html=True)

with st.sidebar:
    st.markdown(f"<h3 style='color:{COLORS['cream']}'>Dashboard controls</h3>", unsafe_allow_html=True)
    st.caption(f"{len(df):,} valid records · local CSV")
    if mag_col and df[mag_col].notna().any():
        min_mag = float(np.floor(df[mag_col].min()))
        max_mag = float(np.ceil(df[mag_col].max()))
        if min_mag == max_mag: max_mag = min_mag + 1
        mag_range = st.slider("Magnitude range", min_value=min_mag, max_value=max_mag, value=(min_mag, max_mag), step=0.5)
    else:
        mag_range = None
    if "_parsed_time" in df and df["_parsed_time"].notna().any():
        years = sorted(df["_parsed_time"].dropna().dt.year.unique().astype(int).tolist())
        year_range = st.select_slider("Year range", options=years, value=(years[0], years[-1])) if len(years) > 1 else (years[0], years[0])
    else:
        year_range = None
    section = st.radio("Go to section", ["Overview", "World map", "ML models", "Event explorer", "Coordinate demo"], index=0)

# Apply filters once, and only render the chosen section to avoid the cost of st.tabs rerunning every chart.
filtered = df
if mag_col and mag_range:
    filtered = filtered[filtered[mag_col].between(mag_range[0], mag_range[1])]
if year_range and "_parsed_time" in filtered:
    filtered = filtered[filtered["_parsed_time"].dt.year.between(year_range[0], year_range[1])]

hero_left, hero_right = st.columns([1.05, 1])
with hero_left:
    st.markdown(f"<div style='padding:15px 0'><div style='font-size:10px;letter-spacing:2px;color:{COLORS['ice']}'>GLOBAL SEISMIC MONITOR</div><h1 style='font-size:42px;line-height:1.08;margin:12px 0'>Understand the<br><span style='color:{COLORS['ice']}'>earth beneath us.</span></h1><p style='color:{COLORS['muted']};line-height:1.8'>Explore historical earthquake records, compare classification models, and inspect the nearest recorded event to a coordinate.</p></div>", unsafe_allow_html=True)
@st.cache_data(show_spinner=False)
def load_video_as_data_uri(path, modified_time):
    # Cache the encoded video so it is not re-read on every Streamlit rerun.
    encoded = base64.b64encode(Path(path).read_bytes()).decode("ascii")
    return f"data:video/mp4;base64,{encoded}"

with hero_right:
    video_path = next((p for p in [CSV_PATH.parent.parent / "video.mp4", CSV_PATH.parent.parent / "assets" / "video.mp4"] if p.exists()), None)
    if video_path:
        video_uri = load_video_as_data_uri(str(video_path), video_path.stat().st_mtime)
        video_html = f"""
        <div style="width:100%;height:350px;overflow:hidden;border-radius:14px;
                    border:1px solid {COLORS['border']};background:{COLORS['nav']};
                    box-shadow:0 12px 34px rgba(0,0,0,.24);">
          <video autoplay muted loop playsinline disablepictureinpicture
                 controlslist="nodownload noplaybackrate noremoteplayback"
                 style="display:block;width:100%;height:100%;object-fit:cover;pointer-events:none;">
            <source src="{video_uri}" type="video/mp4">
          </video>
        </div>
        """
        components.html(video_html, height=350, scrolling=False)
    else:
        st.markdown(f"<div style='height:350px;display:grid;place-items:center;background:{COLORS['nav']};border:1px solid {COLORS['border']};border-radius:14px;color:{COLORS['muted']}'>Optional hero video: add <code>video.mp4</code> to the project root or <code>assets/video.mp4</code></div>", unsafe_allow_html=True)

m1, m2, m3, m4 = st.columns(4)
m1.metric("Dataset records", f"{len(filtered):,}")
m2.metric("Maximum magnitude", f"{filtered[mag_col].max():.1f}" if mag_col and filtered[mag_col].notna().any() else "N/A")
m3.metric("Mean magnitude", f"{filtered[mag_col].mean():.2f}" if mag_col and filtered[mag_col].notna().any() else "N/A")
m4.metric("Best Performing Model", f"{filtered[country_col].nunique():,}" if country_col else "Gradient Boosting")

st.divider()

if section == "Overview":
    st.subheader("Seismic trends")
    left, right = st.columns(2)
    with left:
        if mag_col: render_hist(filtered[mag_col], "Magnitude distribution", "Magnitude", COLORS["ice"])
        else: st.info("Magnitude column was not detected.")
    with right:
        if "_parsed_time" in filtered and filtered["_parsed_time"].notna().any():
            yearly = filtered.dropna(subset=["_parsed_time"]).groupby(filtered["_parsed_time"].dt.year).size()
            render_bar(yearly, "Earthquake records by year", "Year", COLORS["green"], rotate=25)
        else: st.info("No usable date column found for yearly chart.")
    left, right = st.columns(2)
    with left:
        if depth_col: render_hist(filtered[depth_col], "Depth distribution", "Depth (km)", COLORS["peach"])
        else: st.info("Depth column was not detected.")
    with right:
        if mag_col and filtered[mag_col].notna().any():
            bands = pd.cut(filtered[mag_col], [-np.inf, 3, 5, 7, np.inf], labels=["Below 3", "3 to below 5", "5 to below 7", "7+"])
            counts = bands.value_counts().reindex(["Below 3", "3 to below 5", "5 to below 7", "7+"], fill_value=0)
            render_bar(counts, "Magnitude bands", "Magnitude range", COLORS["yellow"])
        else: st.info("Magnitude column was not detected.")

elif section == "World map":
    st.subheader("World earthquake map")
    st.caption("Equirectangular projection · yellow for fewer records, coral for more.")
    if country_col:
        @st.cache_data(show_spinner=False)
        def country_summary(series):
            return series.fillna("Unknown").value_counts().rename_axis("Country").reset_index(name="Records")
        counts = country_summary(filtered[country_col])
        fig = px.choropleth(counts, locations="Country", locationmode="country names", color="Records",
            hover_name="Country", color_continuous_scale=[[0, COLORS["yellow"]], [.45, COLORS["peach"]], [1, COLORS["coral"]]])
        fig.update_geos(projection_type="equirectangular", showframe=False, showcoastlines=True,
            coastlinecolor=COLORS["border"], showland=True, landcolor="#202945", bgcolor=COLORS["bg"])
        fig.update_layout(paper_bgcolor=COLORS["bg"], plot_bgcolor=COLORS["bg"], font_color=COLORS["ice"],
            margin=dict(l=0, r=0, t=5, b=0), height=490)
        st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False, "scrollZoom": False})
        st.dataframe(counts.sort_values("Records", ascending=False).head(30), use_container_width=True, hide_index=True)
    elif lat_col and lon_col:
        st.warning("No country column exists in this CSV, so country-wise counts cannot be calculated reliably. Showing event locations.")
        points = filtered[[lat_col, lon_col] + ([mag_col] if mag_col else [])].dropna(subset=[lat_col, lon_col])
        if len(points) > 8000: points = points.sample(8000, random_state=42)
        fig = px.scatter_geo(points, lat=lat_col, lon=lon_col, color=mag_col if mag_col else None,
            color_continuous_scale=[[0, COLORS["yellow"]], [.5, COLORS["peach"]], [1, COLORS["coral"]]],
            projection="equirectangular", opacity=.65)
        fig.update_geos(showframe=False, showcoastlines=True, showland=True, landcolor="#202945", bgcolor=COLORS["bg"])
        fig.update_layout(paper_bgcolor=COLORS["bg"], font_color=COLORS["ice"], margin=dict(l=0,r=0,t=5,b=0), height=490)
        st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False, "scrollZoom": False})
    else:
        st.info("Latitude/longitude columns were not detected.")

elif section == "ML models":
    st.subheader("Classification model comparison")
    st.caption("These metrics are from the notebook results you supplied; this app does not retrain the models.")
    models = pd.DataFrame([
        ["Gradient Boosting", .916, .916, .916, .915],
        ["Logistic Regression", .868, .869, .868, .866],
        ["Random Forest", .863, .862, .863, .862],
        ["Decision Tree", .847, .851, .847, .846],
        ["Extra Trees", .815, .808, .815, .809],
    ], columns=["Model", "Accuracy", "Weighted Precision", "Weighted Recall", "Weighted F1"])
    left, right = st.columns(2)
    with left:
        fig, ax = plt.subplots(figsize=(6.5, 3.4), dpi=95)
        ordered = models.sort_values("Accuracy")
        ax.barh(ordered["Model"], ordered["Accuracy"] * 100, color=[COLORS["ice"], COLORS["peach"], COLORS["yellow"], COLORS["green"], COLORS["coral"]])
        ax.set_xlabel("Accuracy (%)"); ax.set_title("Accuracy by model", loc="left", fontsize=11)
        style_axis(ax, "x"); fig.tight_layout(); st.pyplot(fig, use_container_width=True); plt.close(fig)
    with right:
        x = np.arange(len(models)); width = .24
        fig, ax = plt.subplots(figsize=(6.5, 3.4), dpi=95)
        for i, (metric, color) in enumerate([("Weighted Precision", COLORS["ice"]), ("Weighted Recall", COLORS["green"]), ("Weighted F1", COLORS["peach"])]):
            ax.bar(x + (i - 1) * width, models[metric], width, label=metric, color=color)
        ax.set_xticks(x); ax.set_xticklabels(models["Model"], rotation=22, ha="right", fontsize=8)
        ax.set_ylim(.75, 1); ax.set_title("Precision, recall and F1", loc="left", fontsize=11)
        style_axis(ax); ax.legend(facecolor=COLORS["nav"], labelcolor=COLORS["ice"], fontsize=7)
        fig.tight_layout(); st.pyplot(fig, use_container_width=True); plt.close(fig)
    st.dataframe(models.style.format({c: "{:.3f}" for c in models.columns if c != "Model"}), use_container_width=True, hide_index=True)
    st.success("Best model by weighted F1: Gradient Boosting — accuracy 0.916, weighted F1 0.915.")
    st.warning("This classifies relative historical-activity categories; it is not a future earthquake forecast.")

elif section == "Event explorer":
    st.subheader("Event explorer")
    st.caption("For speed, only the first 100 matching rows are rendered.")
    search = st.text_input("Optional search (event ID or country)", key="event_search")
    view = filtered
    if search:
        # Search a small set of likely text columns rather than stringifying every cell.
        search_cols = [c for c in [id_col, country_col] if c]
        if search_cols:
            mask = pd.Series(False, index=view.index)
            for c in search_cols:
                mask |= view[c].astype(str).str.contains(search, case=False, na=False, regex=False)
            view = view[mask]
        else:
            st.info("No event ID/country field available for fast search.")
    st.write(f"{len(view):,} records match.")
    st.dataframe(view.head(100), use_container_width=True, hide_index=True)
    st.download_button("Export filtered CSV", data=filtered.to_csv(index=False).encode("utf-8"), file_name="trendscope_filtered.csv", mime="text/csv")

elif section == "Coordinate demo":
    st.subheader("Coordinate demo")
    st.caption("Find the nearest recorded earthquake in the loaded dataset.")
    a, b = st.columns(2)
    with a: latitude = st.number_input("Latitude", min_value=-90.0, max_value=90.0, value=21.1458, step=.0001, format="%.4f")
    with b: longitude = st.number_input("Longitude", min_value=-180.0, max_value=180.0, value=79.0882, step=.0001, format="%.4f")
    if st.button("Find nearest recorded event"):
        if lat_col and lon_col and len(filtered):
            # Restrict computation to valid coordinates, and use NumPy vector operations.
            la1, lo1 = np.radians(latitude), np.radians(longitude)
            la2, lo2 = np.radians(filtered[lat_col].to_numpy(dtype=float)), np.radians(filtered[lon_col].to_numpy(dtype=float))
            aa = np.sin((la2-la1)/2)**2 + np.cos(la1)*np.cos(la2)*np.sin((lo2-lo1)/2)**2
            dist = 6371 * 2 * np.arcsin(np.sqrt(np.clip(aa, 0, 1)))
            idx = int(np.nanargmin(dist)); event = filtered.iloc[idx]
            st.metric("Approximate distance", f"{dist[idx]:.1f} km")
            a, b, c = st.columns(3)
            a.metric("Magnitude", f"{event[mag_col]:.2f}" if mag_col and pd.notna(event[mag_col]) else "N/A")
            b.metric("Depth", f"{event[depth_col]:.1f} km" if depth_col and pd.notna(event[depth_col]) else "N/A")
            c.metric("Event ID", str(event[id_col]) if id_col and pd.notna(event[id_col]) else "N/A")
            st.caption("This is a nearby historical record, not a future prediction or safety assessment.")
        else:
            st.error("Latitude and longitude columns are required.")

st.markdown(f"<hr><div style='text-align:center;color:{COLORS['muted']};font-size:11px'>TrendScope AI · Historical earthquake analysis</div>", unsafe_allow_html=True)
