import React, { useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import CountryWorker from './workers/countryWorker.js?worker';
import worldUrl from 'world-atlas/countries-110m.json?url';
import countryNames from './data/countryNames.json';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature as topoFeature } from 'topojson-client';

const WORLD_URL = worldUrl;
const PALETTE = ['#BFE9F2', '#B8FF6A', '#F3CA81', '#F38E67', '#F65D53'];
const MODEL_RESULTS = [
  { model: 'Gradient Boosting', accuracy: 0.916, precision: 0.916, recall: 0.916, f1: 0.915 },
  { model: 'Logistic Regression', accuracy: 0.868, precision: 0.869, recall: 0.868, f1: 0.866 },
  { model: 'Random Forest', accuracy: 0.863, precision: 0.862, recall: 0.863, f1: 0.862 },
  { model: 'Decision Tree', accuracy: 0.847, precision: 0.851, recall: 0.847, f1: 0.846 },
  { model: 'Extra Trees', accuracy: 0.815, precision: 0.808, recall: 0.815, f1: 0.809 },
];
const cleanKey = s => String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = {
  latitude: ['latitude','lat','latitude_deg'], longitude: ['longitude','lon','lng','longitude_deg'],
  magnitude: ['magnitude','mag','magvalue'], depth: ['depth','depthkm','depth_km'],
  time: ['time','timeutc','time_utc','datetime','date','origin_time'], country: ['country','countryname','nation'],
  place: ['place','location','locationname']
};
function findColumn(columns, field) { return columns.map(c => [c, cleanKey(c)]).find(([,n]) => aliases[field].some(a => cleanKey(a) === n))?.[0] || null; }
function formatNum(v) { return Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
function readDate(v) { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
function mapColor(value, max) {
  if (!value) return '#303657';
  const ratio = max > 0 ? value / max : 0;
  if (ratio < .15) return '#F3CA81';
  if (ratio < .35) return '#F6AD76';
  if (ratio < .65) return '#F38E67';
  return '#F65D53';
}

export default function App() {
  const [rows, setRows] = useState([]); const [fileName, setFileName] = useState('scraped_earthquake_data.csv'); const [error, setError] = useState(''); const [dataStatus, setDataStatus] = useState('loading');
  const [countryCounts, setCountryCounts] = useState([]); const [offshore, setOffshore] = useState(0); const [mapping, setMapping] = useState(false); const [mappingProgress, setMappingProgress] = useState(0); const [countryMethod, setCountryMethod] = useState('');
  const [minMag, setMinMag] = useState(-2); const [maxMag, setMaxMag] = useState(10); const [yearFilter, setYearFilter] = useState('all'); const [searchCountry, setSearchCountry] = useState(''); const [selectedCountry, setSelectedCountry] = useState(null);
  const [demoLat, setDemoLat] = useState('21.1458'); const [demoLon, setDemoLon] = useState('79.0882'); const [demoSearched, setDemoSearched] = useState(false);
  const workerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProjectCsv() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/scraped_earthquake_data.csv`);
        if (!response.ok) { if (!cancelled) setDataStatus('missing'); return; }
        const csvText = await response.text();
        if (!csvText.trim()) { if (!cancelled) setDataStatus('missing'); return; }
        if (!cancelled) parseCsvText(csvText);
      } catch {
        if (!cancelled) setDataStatus('missing');
      }
    }
    loadProjectCsv();
    return () => { cancelled = true; workerRef.current?.terminate(); };
  }, []);

  const parseCsvText = (csvText) => {
    setError(''); setCountryCounts([]); setSelectedCountry(null); setMapping(false); setMappingProgress(0); workerRef.current?.terminate();
    Papa.parse(csvText, { header: true, skipEmptyLines: true, dynamicTyping: false, complete: result => {
      const source = result.data || [];
      if (!source.length) { setError('The CSV is empty or could not be parsed.'); setDataStatus('error'); return; }
      const cols = Object.keys(source[0]); const latCol = findColumn(cols,'latitude'), lonCol = findColumn(cols,'longitude'), magCol = findColumn(cols,'magnitude');
      if (!latCol || !lonCol || !magCol) { setError('CSV must include latitude, longitude and magnitude columns.'); setDataStatus('error'); return; }
      const timeCol = findColumn(cols,'time'), depthCol = findColumn(cols,'depth'), countryCol = findColumn(cols,'country'), placeCol = findColumn(cols,'place');
      const normalized = [];
      for (const r of source) {
        const latitude = Number(r[latCol]), longitude = Number(r[lonCol]), magnitude = Number(r[magCol]);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(magnitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue;
        const date = timeCol ? readDate(r[timeCol]) : null; const depth = depthCol && r[depthCol] !== '' ? Number(r[depthCol]) : null;
        normalized.push({ latitude, longitude, magnitude, depth: Number.isFinite(depth) ? depth : null, date, year: date ? date.getUTCFullYear() : null, country: countryCol ? String(r[countryCol] || '').trim() : '', place: placeCol ? String(r[placeCol] || '') : '' });
      }
      if (!normalized.length) { setError('No valid rows found. Check the column names and numeric values.'); setDataStatus('error'); return; }
      setRows(normalized); setFileName('scraped_earthquake_data.csv'); setDataStatus('loaded'); setMinMag(Math.min(-2, Math.floor(Math.min(...normalized.map(r=>r.magnitude))))); setMaxMag(Math.max(10, Math.ceil(Math.max(...normalized.map(r=>r.magnitude))))); setYearFilter('all');
      if (countryCol && normalized.some(r=>r.country)) {
        const counts = new Map(); normalized.forEach(r=>{ const name=r.country || 'Unknown'; counts.set(name,(counts.get(name)||0)+1); });
        setCountryCounts(Array.from(counts,([country,count])=>({country,count})).sort((a,b)=>b.count-a.count)); setCountryMethod('Counts use the country field in the CSV.');
      } else {
        setMapping(true); setCountryMethod('Country matching from geographic boundaries');
        const worker = new CountryWorker(); workerRef.current = worker;
        worker.onmessage = e => {
          if (e.data.type==='progress') setMappingProgress(Math.round(e.data.processed/e.data.total*100));
          if (e.data.type==='done') { setCountryCounts(e.data.counts); setOffshore(e.data.offshore); setMapping(false); setMappingProgress(100); worker.terminate(); workerRef.current=null; }
        };
        worker.onerror = () => { setMapping(false); setError('Country mapping failed. Check the world-atlas dependency and reload.'); worker.terminate(); workerRef.current=null; };
        worker.postMessage({rows: normalized.map(r=>({latitude:r.latitude,longitude:r.longitude}))});
      }
    }, error: e => { setError(`Could not read CSV: ${e.message}`); setDataStatus('error'); } });
  };

  const filteredRows = useMemo(() => rows.filter(r=>r.magnitude>=Number(minMag)&&r.magnitude<=Number(maxMag)&&(yearFilter==='all'||String(r.year)===yearFilter)),[rows,minMag,maxMag,yearFilter]);
  const years = useMemo(() => [...new Set(rows.map(r=>r.year).filter(y=>y!=null))].sort((a,b)=>a-b),[rows]);
  const stats = useMemo(() => {
    const mags=filteredRows.map(r=>r.magnitude).sort((a,b)=>a-b), depths=filteredRows.map(r=>r.depth).filter(Number.isFinite); const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
    return {count:filteredRows.length,meanMag:mean(mags),medianMag:mags.length?mags[Math.floor(mags.length/2)]:0,meanDepth:mean(depths),maxMag:mags.length?mags[mags.length-1]:0};
  },[filteredRows]);
  const yearly = useMemo(()=>{const m=new Map();filteredRows.forEach(r=>{if(r.year!=null)m.set(r.year,(m.get(r.year)||0)+1);});return [...m].sort((a,b)=>a[0]-b[0]).map(([year,records])=>({year:String(year),records}));},[filteredRows]);
  const magnitudeDistribution = useMemo(()=>{const m=new Map();filteredRows.forEach(r=>{const key=(Math.floor(r.magnitude*2)/2).toFixed(1);m.set(key,(m.get(key)||0)+1);});return [...m].sort((a,b)=>Number(a[0])-Number(b[0])).map(([magnitude,records])=>({magnitude,records}));},[filteredRows]);
  const depthDistribution = useMemo(()=>{const m=new Map();filteredRows.forEach(r=>{if(Number.isFinite(r.depth)){const start=Math.floor(r.depth/25)*25;const key=`${start}–${start+25}`;m.set(key,(m.get(key)||0)+1);}});return [...m].map(([depth,records])=>({depth,records})).slice(0,30);},[filteredRows]);
  const magnitudeBands = useMemo(()=>{const counts={'Below 3':0,'3 to below 5':0,'5 to below 7':0,'7 and above':0};filteredRows.forEach(r=>{if(r.magnitude<3)counts['Below 3']++;else if(r.magnitude<5)counts['3 to below 5']++;else if(r.magnitude<7)counts['5 to below 7']++;else counts['7 and above']++;});return Object.entries(counts).map(([name,value])=>({name,value}));},[filteredRows]);
  const topCountries = useMemo(()=>countryCounts.filter(r=>r.country.toLowerCase().includes(searchCountry.toLowerCase())).slice(0,20),[countryCounts,searchCountry]);
  const maxCountry = countryCounts[0]?.count || 1; const countryCountMap = useMemo(()=>new Map(countryCounts.map(r=>[r.country.toLowerCase(),r.count])),[countryCounts]);
  const nearestDemo = useMemo(() => {
    if (!demoSearched || !rows.length) return null;
    const lat = Number(demoLat), lon = Number(demoLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return { invalid: true };
    let nearest = null, best = Infinity;
    for (const r of rows) { const dLat = r.latitude-lat, dLon = (r.longitude-lon)*Math.cos(lat*Math.PI/180); const distance = dLat*dLat+dLon*dLon; if (distance<best) {best=distance; nearest=r;} }
    return nearest ? { ...nearest, approximateDistanceKm: Math.sqrt(best)*111 } : null;
  }, [demoSearched,demoLat,demoLon,rows]);
  const scrollTo = id => document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'});

  return <div className="app-shell">
    <header className="site-header"><a className="brand" href="#top" onClick={e=>{e.preventDefault();scrollTo('top')}}><span className="brand-mark">TS</span><span>TrendScope <b>AI</b><small>EARTHQUAKE ANALYTICS</small></span></a>
      <nav className="top-nav">{[['overview','Overview'],['trends','Trends'],['world','World map'],['models','ML models'],['explorer','Explorer'],['demo','Demo']].map(([id,label])=><button key={id} onClick={()=>scrollTo(id)}>{label}</button>)}</nav>
    </header>
    <main id="top" className="page-content">
      <section className="hero section-anchor" id="overview"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line"/> HISTORICAL SEISMIC DATA</div><h1>Understand the<br/><em>patterns beneath</em><br/>the surface.</h1><p>Explore earthquake records, magnitude distributions and country-level activity through a calm, interactive data experience.</p><div className="hero-actions"><button className="primary-button" onClick={()=>scrollTo('trends')}>Explore dashboard <span>↓</span></button><span className="local-data-note">Dataset loads automatically from <code>public/data/</code></span></div><div className="hero-meta">{rows.length? <><span className="live-dot"/> {formatNum(rows.length)} valid records loaded <span className="meta-sep">/</span> {fileName}</>:dataStatus==='loading'?'Looking for public/data/scraped_earthquake_data.csv…':'Local CSV · Client-side charts · No upload needed'}</div></div>
        <div className="hero-art" aria-hidden="true"><video className="hero-video" autoPlay muted loop playsInline preload="metadata"><source src="/video.mp4" type="video/mp4" /></video><div className="hero-video-shade"/><div className="hero-callout callout-top"><small>DATASET RECORDS</small><strong>{formatNum(rows.length)}</strong></div><div className="hero-callout callout-bottom"><small>MAX MAGNITUDE</small><strong>{rows.length?stats.maxMag.toFixed(1):'—'}</strong></div></div>
      </section>
      {error&&<div className="error-banner">{error}</div>}
      {!rows.length ? <section className="upload-empty" id="how-it-works"><div className="upload-symbol">DATA</div><div><h2>{dataStatus==='loading'?'Loading local earthquake catalogue':'Dataset not found in the local data folder'}</h2><p>{dataStatus==='loading'?'The dashboard is reading your project CSV.':'Place your CSV at '}<code>public/data/scraped_earthquake_data.csv</code>{dataStatus==='missing'?'. Then restart or refresh the Vite app. No upload button is needed.':''}</p><p className="folder-hint">Expected path: <code>trendscope-react/public/data/scraped_earthquake_data.csv</code></p></div></section> : <>
        <div className="dataset-strip"><span className="live-dot"/><span className="dataset-name">{fileName}</span><span className="dataset-divider"/> {formatNum(rows.length)} valid records <span className="dataset-note">Loaded from local project folder</span></div>
        <section className="filters section-anchor"><div className="section-kicker">FILTER THE DATA</div><label>Magnitude from<input type="number" step="0.5" value={minMag} onChange={e=>setMinMag(e.target.value)}/></label><label>Magnitude to<input type="number" step="0.5" value={maxMag} onChange={e=>setMaxMag(e.target.value)}/></label><label>Year<select value={yearFilter} onChange={e=>setYearFilter(e.target.value)}><option value="all">All available years</option>{years.map(y=><option key={y} value={String(y)}>{y}</option>)}</select></label><span className="filter-hint">All data charts update with these filters.</span></section>
        <section className="kpi-grid"><Kpi label="Filtered records" value={formatNum(stats.count)} note="Within selected filters"/><Kpi label="Mean magnitude" value={stats.meanMag.toFixed(2)} note="Average magnitude"/><Kpi label="Maximum magnitude" value={stats.maxMag.toFixed(1)} note="Largest in selection"/><Kpi label="Mean depth" value={stats.meanDepth?`${stats.meanDepth.toFixed(1)} km`:'N/A'} note="Where depth is available"/></section>
        <section className="section-block section-anchor" id="trends"><SectionHeading number="01" title="Seismic trends" subtitle="Explore when earthquakes occurred and how their magnitudes and depths are distributed."/><div className="chart-grid"><ChartCard title="Magnitude distribution" subtitle="Half-magnitude intervals"><ResponsiveContainer width="100%" height={280}><BarChart data={magnitudeDistribution} margin={{top:8,right:8,bottom:25,left:0}}><CartesianGrid strokeDasharray="3 3" stroke="#3b4268"/><XAxis dataKey="magnitude" tick={{fill:'#BFE9F2',fontSize:10}} interval={Math.max(0,Math.floor(magnitudeDistribution.length/12))} angle={-35} textAnchor="end"/><YAxis tick={{fill:'#BFE9F2',fontSize:11}}/><Tooltip contentStyle={tooltipStyle}/><Bar dataKey="records" name="Records" fill="#BFE9F2" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Earthquakes by year" subtitle="Recorded event count by origin year">{yearly.length?<ResponsiveContainer width="100%" height={280}><AreaChart data={yearly}><defs><linearGradient id="yearFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#B8FF6A" stopOpacity={0.42}/><stop offset="100%" stopColor="#B8FF6A" stopOpacity={0.02}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#3b4268"/><XAxis dataKey="year" tick={{fill:'#BFE9F2',fontSize:11}}/><YAxis tick={{fill:'#BFE9F2',fontSize:11}}/><Tooltip contentStyle={tooltipStyle}/><Area type="monotone" dataKey="records" stroke="#B8FF6A" fill="url(#yearFill)" strokeWidth={2}/></AreaChart></ResponsiveContainer>:<EmptyState text="No usable date column was found in the CSV."/>}</ChartCard>
          <ChartCard title="Magnitude bands" subtitle="Distribution across four magnitude ranges"><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={magnitudeBands} dataKey="value" nameKey="name" cx="50%" cy="48%" innerRadius={62} outerRadius={96} paddingAngle={3}>{magnitudeBands.map((e,i)=><Cell key={e.name} fill={PALETTE[i+1]}/>)}</Pie><Tooltip contentStyle={tooltipStyle}/><Legend formatter={v=><span style={{color:'#BFE9F2',fontSize:11}}>{v}</span>}/></PieChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Depth distribution" subtitle="25 km intervals; first 30 bins"><ResponsiveContainer width="100%" height={280}><BarChart data={depthDistribution} margin={{bottom:25}}><CartesianGrid strokeDasharray="3 3" stroke="#3b4268"/><XAxis dataKey="depth" tick={{fill:'#BFE9F2',fontSize:10}} angle={-35} textAnchor="end" interval={2}/><YAxis tick={{fill:'#BFE9F2',fontSize:11}}/><Tooltip contentStyle={tooltipStyle}/><Bar dataKey="records" name="Records" fill="#B8FF6A" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></ChartCard></div></section>
        <section className="section-block section-anchor" id="world"><SectionHeading number="02" title="Earthquake activity around the world" subtitle="Darker warm shades indicate more records in this catalogue, not higher future earthquake probability."/><div className="world-layout"><div className="panel map-panel"><div className="panel-header"><div><h3>Country-wise earthquake count</h3><p>{countryMethod || 'Counts from loaded records'}</p></div><span className="count-pill">{formatNum(countryCounts.length)} countries</span></div>{mapping&&<div className="progress-wrap"><div className="progress-text">Matching coordinates to country boundaries — {mappingProgress}%</div><div className="progress-track"><div style={{width:`${mappingProgress}%`}}/></div><p>Mapping runs in a background worker.</p></div>}{countryCounts.length?<><div className="map-wrap"><ComposableMap projectionConfig={{scale:145}} width={900} height={440} style={{width:'100%',height:'auto'}}><ZoomableGroup><Geographies geography={WORLD_URL}>{({geographies})=>geographies.map(geo=>{const countryId=String(geo.id ?? geo.properties?.id ?? '').padStart(3,'0');const name=geo.properties?.name||countryNames[countryId]||`Country ${countryId}`;const count=countryCountMap.get(name.toLowerCase())||0;return <Geography key={geo.rsmKey} geography={geo} onClick={()=>setSelectedCountry({country:name,count})} style={{default:{fill:mapColor(count,maxCountry),stroke:'#3f476c',strokeWidth:.35,outline:'none'},hover:{fill:'#BFE9F2',stroke:'#ffffff',strokeWidth:.6,outline:'none'},pressed:{fill:'#B8FF6A',outline:'none'}}}/>})}</Geographies></ZoomableGroup></ComposableMap></div><div className="legend-row"><span>Fewer records</span><div className="legend-gradient"/><span>More records</span></div>{selectedCountry&&<div className="selected-country"><strong>{selectedCountry.country}</strong><span>{formatNum(selectedCountry.count)} records</span><button className="text-link" onClick={()=>setSelectedCountry(null)}>Clear selection</button></div>}</>:<EmptyState text="Country counts are being calculated. The map will fill in when processing finishes."/>}</div>
          <div className="panel country-panel"><div className="panel-header"><div><h3>Country ranking</h3><p>Highest record counts first</p></div></div><input className="search-input" placeholder="Search country..." value={searchCountry} onChange={e=>setSearchCountry(e.target.value)}/><div className="country-list">{topCountries.map((c,i)=><button key={c.country} className={`country-row ${selectedCountry?.country===c.country?'selected':''}`} onClick={()=>setSelectedCountry(c)}><span className="rank">{String(i+1).padStart(2,'0')}</span><span className="country-name">{c.country}<span className="mini-bar"><span style={{width:`${Math.max(2,c.count/maxCountry*100)}%`}}/></span></span><strong>{formatNum(c.count)}</strong></button>)}</div>{mapping&&<p className="muted-small">Mapping in progress; counts appear when complete.</p>}<div className="offshore-note">{formatNum(offshore)} records could not be matched to a land country and are excluded from country totals.</div></div></div><div className="panel epicenter-panel"><div className="panel-header"><div><h3>Earthquake epicentres</h3><p>Every valid earthquake plotted at its recorded latitude and longitude. Point color represents magnitude.</p></div><span className="count-pill">{formatNum(filteredRows.length)} points</span></div><EpicenterMap rows={filteredRows} worldUrl={WORLD_URL}/></div></section>
      </>}
      <section className="section-block section-anchor" id="models"><SectionHeading number="03" title="Machine-learning model comparison" subtitle="Measured results from the same held-out test set in the supplied notebook. Gradient Boosting leads on weighted F1."/><div className="model-summary"><div><span className="model-label">SELECTED MODEL</span><h3>Gradient Boosting</h3><p>Highest weighted F1-score in the provided comparison.</p></div><div className="model-score"><span>Weighted F1</span><strong>0.915</strong></div><div className="model-score"><span>Accuracy</span><strong>0.916</strong></div></div><div className="chart-grid model-grid"><ChartCard title="Accuracy vs weighted F1" subtitle="Scores from the supplied model-comparison output"><ResponsiveContainer width="100%" height={300}><BarChart data={MODEL_RESULTS} layout="vertical" margin={{top:5,right:18,bottom:5,left:28}}><CartesianGrid strokeDasharray="3 3" stroke="#3b4268"/><XAxis type="number" domain={[0,1]} tick={{fill:'#BFE9F2',fontSize:11}}/><YAxis type="category" dataKey="model" width={132} tick={{fill:'#BFE9F2',fontSize:10}}/><Tooltip contentStyle={tooltipStyle} formatter={v=>Number(v).toFixed(3)}/><Legend formatter={v=><span style={{color:'#BFE9F2',fontSize:11}}>{v}</span>}/><Bar dataKey="accuracy" name="Accuracy" fill="#BFE9F2" radius={[0,4,4,0]}/><Bar dataKey="f1" name="Weighted F1" fill="#B8FF6A" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></ChartCard><ChartCard title="Precision, recall and F1" subtitle="Class-weighted aggregate scores"><ResponsiveContainer width="100%" height={300}><LineChart data={MODEL_RESULTS} margin={{top:8,right:14,bottom:38,left:0}}><CartesianGrid strokeDasharray="3 3" stroke="#3b4268"/><XAxis dataKey="model" tick={{fill:'#BFE9F2',fontSize:9}} angle={-22} textAnchor="end" interval={0}/><YAxis domain={[0.78,1]} tick={{fill:'#BFE9F2',fontSize:11}}/><Tooltip contentStyle={tooltipStyle} formatter={v=>Number(v).toFixed(3)}/><Legend formatter={v=><span style={{color:'#BFE9F2',fontSize:11}}>{v}</span>}/><Line type="monotone" dataKey="precision" stroke="#F3CA81" strokeWidth={2} dot={{r:3}}/><Line type="monotone" dataKey="recall" stroke="#F38E67" strokeWidth={2} dot={{r:3}}/><Line type="monotone" dataKey="f1" name="Weighted F1" stroke="#B8FF6A" strokeWidth={2.5} dot={{r:3}}/></LineChart></ResponsiveContainer></ChartCard></div><p className="model-caveat">These are the values shown in your notebook screenshot. They describe relative historical-category classification, not future earthquake forecasting.</p></section>
      {rows.length>0&&<section className="section-block section-anchor" id="explorer"><SectionHeading number="04" title="Explore individual events" subtitle="Inspect a lightweight preview of the filtered records, then export the filtered selection."/><div className="panel explorer-panel"><div className="panel-header"><div><h3>Filtered event records</h3><p>First 100 records shown to keep the page responsive.</p></div><button className="secondary-button" onClick={()=>downloadCSV(filteredRows)}>Export filtered CSV</button></div><div className="table-wrap"><table><thead><tr><th>Latitude</th><th>Longitude</th><th>Magnitude</th><th>Depth (km)</th><th>Date</th><th>Place</th></tr></thead><tbody>{filteredRows.slice(0,100).map((r,i)=><tr key={i}><td>{r.latitude.toFixed(4)}</td><td>{r.longitude.toFixed(4)}</td><td>{r.magnitude.toFixed(1)}</td><td>{Number.isFinite(r.depth)?r.depth.toFixed(1):'—'}</td><td>{r.date?r.date.toISOString().slice(0,10):'—'}</td><td>{r.place||'—'}</td></tr>)}</tbody></table></div><p className="muted-small">{formatNum(filteredRows.length)} records match the current filters.</p></div></section>}
      <section className="section-block section-anchor" id="demo"><SectionHeading number="05" title="Quick location demo" subtitle="Enter coordinates to find the nearest recorded event in the loaded catalogue. This is a nearest-event lookup, not a risk prediction."/><div className="demo-card panel"><div className="demo-form"><label>Latitude<input type="number" min="-90" max="90" step="0.0001" value={demoLat} onChange={e=>{setDemoLat(e.target.value);setDemoSearched(false)}}/></label><label>Longitude<input type="number" min="-180" max="180" step="0.0001" value={demoLon} onChange={e=>{setDemoLon(e.target.value);setDemoSearched(false)}}/></label><button className="primary-button" disabled={!rows.length} onClick={()=>setDemoSearched(true)}>Find nearest event</button></div>{!rows.length?<p className="demo-help">Add your dataset to <code>public/data/scraped_earthquake_data.csv</code> to enable the demo.</p>:nearestDemo&&<div className="demo-result">{nearestDemo.invalid?<p className="error-text">Enter a valid latitude from -90 to 90 and longitude from -180 to 180.</p>:<><div><span className="model-label">NEAREST CATALOGUE EVENT</span><h3>{nearestDemo.place||'Recorded earthquake'}</h3><p>{nearestDemo.date?nearestDemo.date.toISOString().slice(0,10):'Date not available'} · approximately {nearestDemo.approximateDistanceKm.toFixed(1)} km from your coordinates</p></div><div className="demo-result-metrics"><div><span>Magnitude</span><strong>{nearestDemo.magnitude.toFixed(1)}</strong></div><div><span>Depth</span><strong>{Number.isFinite(nearestDemo.depth)?`${nearestDemo.depth.toFixed(1)} km`:'N/A'}</strong></div><div><span>Epicentre</span><strong>{nearestDemo.latitude.toFixed(2)}, {nearestDemo.longitude.toFixed(2)}</strong></div></div></>}</div>}<p className="demo-disclaimer">The nearest recorded event does not indicate current danger or the probability of a future earthquake.</p></div></section>
      <footer className="footer"><span className="brand-footer">TrendScope <b>AI</b></span><span>Historical catalogue analysis · Not a seismic forecast or safety assessment.</span><button className="text-link" onClick={()=>scrollTo('top')}>Back to top ↑</button></footer>
    </main>
  </div>;
}
const tooltipStyle={background:'#171c32',border:'1px solid #BFE9F2',borderRadius:8,color:'#F7F0D5',fontSize:12};

function EpicenterMap({ rows, worldUrl }) {
  const canvasRef = useRef(null);
  const projectedRef = useRef([]);
  const [world, setWorld] = useState(null);
  const [selected, setSelected] = useState(null);
  const [mapError, setMapError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(worldUrl).then(r => { if (!r.ok) throw new Error('World map could not be loaded'); return r.json(); })
      .then(topology => { if (!cancelled) setWorld(topoFeature(topology, topology.objects.countries)); })
      .catch(() => { if (!cancelled) setMapError('Could not load world boundaries. Check your connection and reload.'); });
    return () => { cancelled = true; };
  }, [worldUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const width = Math.max(320, canvas.clientWidth || 800);
      const height = Math.max(240, Math.min(470, width * 0.52));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#080C18'; ctx.fillRect(0, 0, width, height);
      const projection = geoNaturalEarth1().fitExtent([[12, 12], [width - 12, height - 12]], {type:'Sphere'});
      // Subtle graticule-like coordinate grid.
      ctx.strokeStyle = 'rgba(191,233,242,0.12)'; ctx.lineWidth = 0.6;
      for (let lon = -150; lon <= 180; lon += 30) { const a=projection([lon,-85]), b=projection([lon,85]); if(a&&b){ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();} }
      for (let lat = -60; lat <= 60; lat += 30) { ctx.beginPath(); let started=false; for(let lon=-180;lon<=180;lon+=3){const p=projection([lon,lat]);if(!p)continue;if(!started){ctx.moveTo(p[0],p[1]);started=true;}else ctx.lineTo(p[0],p[1]);}ctx.stroke(); }
      if (world) {
        const path = geoPath(projection, ctx); ctx.beginPath(); path(world);
        ctx.fillStyle = '#18243A'; ctx.fill(); ctx.strokeStyle = '#43516A'; ctx.lineWidth = 0.55; ctx.stroke();
      }
      const projected = [];
      for (const row of rows) {
        const p = projection([row.longitude, row.latitude]);
        if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
        const mag = row.magnitude;
        const color = mag < 3 ? '#B8FF6A' : mag < 5 ? '#F3CA81' : mag < 7 ? '#F38E67' : '#F65D53';
        projected.push({x:p[0], y:p[1], row, color});
      }
      // Draw every valid filtered row. Small alpha keeps dense seismic zones readable.
      for (const p of projected) {
        ctx.globalAlpha = 0.78; ctx.fillStyle = p.color;
        const radius = p.row.magnitude >= 7 ? 3.2 : p.row.magnitude >= 5 ? 2.2 : 1.45;
        ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1; projectedRef.current = projected;
    };
    draw();
    const observer = new ResizeObserver(draw); observer.observe(canvas);
    return () => observer.disconnect();
  }, [rows, world]);

  const selectNearest = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let nearest = null, best = 13 * 13;
    for (const p of projectedRef.current) { const dx=p.x-x, dy=p.y-y, d=dx*dx+dy*dy; if(d<best){best=d;nearest=p.row;} }
    setSelected(nearest ? {...nearest, x, y} : null);
  };
  return <>
    <div className="epicenter-map-wrap"><canvas ref={canvasRef} className="epicenter-canvas" onClick={selectNearest} aria-label="Interactive world map of earthquake epicentres" role="img" />
      {selected && <div className="epicenter-tooltip"><button aria-label="Close event details" onClick={()=>setSelected(null)}>×</button><strong>{selected.place || 'Recorded earthquake'}</strong><span>Magnitude: {selected.magnitude.toFixed(1)}</span><span>Coordinates: {selected.latitude.toFixed(3)}, {selected.longitude.toFixed(3)}</span><span>Depth: {Number.isFinite(selected.depth) ? `${selected.depth.toFixed(1)} km` : 'N/A'}</span><span>Date: {selected.date ? selected.date.toISOString().slice(0,10) : 'N/A'}</span></div>}
    </div>
    <div className="epicenter-legend"><span><i style={{background:'#B8FF6A'}}/>Below 3</span><span><i style={{background:'#F3CA81'}}/>3 to below 5</span><span><i style={{background:'#F38E67'}}/>5 to below 7</span><span><i style={{background:'#F65D53'}}/>7 and above</span></div>
    <p className="muted-small">Click near a point to inspect an event. The map follows the dashboard's magnitude and year filters; dense areas may contain overlapping points.{mapError ? ` ${mapError}` : ''}</p>
  </>;
}

function Kpi({label,value,note}){return <div className="kpi-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;}
function ChartCard({title,subtitle,children}){return <div className="panel chart-card"><div className="panel-header"><div><h3>{title}</h3><p>{subtitle}</p></div></div>{children}</div>;}
function SectionHeading({number,title,subtitle}){return <div className="section-heading"><span>{number}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>;}
function EmptyState({text}){return <div className="empty-state">{text}</div>;}
function downloadCSV(rows){const header='latitude,longitude,magnitude,depth,year,place\n';const body=rows.map(r=>[r.latitude,r.longitude,r.magnitude,r.depth??'',r.year??'',`"${String(r.place||'').replaceAll('"','""')}"`].join(',')).join('\n');const blob=new Blob([header+body],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='trendscope_filtered_earthquakes.csv';a.click();URL.revokeObjectURL(url);}
